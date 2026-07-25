// 책 섹션 확정 로직 — 사진 분석 결과(sections)의 각 항목이 어느 "책 섹션"(예: "이런 문제가
// 시험에 나온다", "중단원 마무리하기")에 속하는지 복원한다.
//
// 배경: 문제집은 소단원 섹션마다 문항 번호가 01부터 다시 시작해서, 여러 섹션을 한 번에
// 분석하면 같은 번호가 충돌한다. AI가 섹션을 (사진 × 책 섹션) 단위로 쪼개고 배너가 보이면
// bookSection을 채워주지만, 섹션 제목은 섹션의 첫 페이지에만 인쇄되므로 두 페이지를 넘는
// 섹션의 뒷 페이지엔 배너가 없다(= bookSection이 null). 이 파일이 그 빈칸을 신호 계층으로
// 복원한다:
//   1) 인쇄된 쪽 번호(printedPage)로 책 순서 복원 (업로드 순서 무관)
//   2) 문항 번호 연속성 — 직전 섹션의 마지막 번호에 이어지면 같은 섹션의 연속
//   3) 번호 리셋(작은 번호로 되돌아감) — 배너가 없어도 "새 섹션"으로 확정 (이름만 미확인)
// 어느 단계에서도 확신이 없으면 label을 null로 남긴다 — 추측해서 조용히 붙이지 않고,
// 화면에서 "섹션 미확인" 배너 + 수동 지정을 받는다 (AI 지어내기 방지 원칙과 동일).

// 문항 식별자("02", "유제3" 등)에서 비교용 숫자를 뽑는다 — sortByItemNumber와 같은 방식
function numOf(identifier) {
  const m = String(identifier ?? '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// 섹션 항목이 담고 있는 문항 번호들의 [최소, 최대] — 유형/모의고사/연산 모두 커버
function numberRange(section) {
  const nums = [
    ...(section.problemTypes || []).map(p => numOf(p.number)),
    ...(section.weakDetail || []).map(p => numOf(p.number)),
  ].filter(n => n != null);
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

// sections 배열(원본 순서 유지)에 대해 같은 길이의 확정 결과 배열을 돌려준다.
// 각 원소: { label: string|null, source: 'header'|'continued'|'stitched'|'unknown' }
//  - header:    그 사진에 인쇄된 섹션 배너를 AI가 직접 읽음 (가장 확실)
//  - continued: 배너는 없지만 책 순서상 직전 섹션에 번호가 이어져 같은 섹션으로 판정
//  - stitched:  순서와 무관하게 번호 범위 퍼즐로 유일하게 이어붙여짐 (무작위 업로드 대응)
//  - unknown:   근거가 없거나 후보가 둘 이상이라 확정 불가 — 이름은 사람이 지정
export function resolveBookSections(sections) {
  const items = (sections || []).map((s, idx) => ({ idx, s }));

  // ── 1차: 책 순서 복원(쪽 번호 → 사진 순번 → 응답 순서) 후 순차 상속 ──
  const sorted = [...items].sort((a, b) => {
    const pa = a.s.printedPage, pb = b.s.printedPage;
    if (pa != null && pb != null && pa !== pb) return pa - pb;
    const fa = a.s.photoIndex ?? 0, fb = b.s.photoIndex ?? 0;
    if (fa !== fb) return fa - fb;
    return a.idx - b.idx;
  });

  // 1차에선 확실한 것만 확정: 배너를 직접 읽은 섹션. 연속성 추측은 여기서 하지 않는다 —
  // 업로드 순서가 뒤섞였을 때 "직전 조각"이 책에서의 직전이 아닐 수 있어서, 순서 기반
  // 추측은 유일성 검사가 있는 2차(퍼즐)가 못 푼 것에 한해 3차에서만 한다.
  const resolved = new Array(items.length).fill(null);
  for (const { idx, s } of sorted) {
    resolved[idx] = s.bookSection
      ? { label: s.bookSection, source: 'header' }
      : { label: null, source: 'unknown' };
  }

  // ── 2차: 번호 범위 퍼즐 — 업로드 순서가 뒤섞여 1차가 못 푼 조각을 이어붙인다 ──
  // 각 확정 라벨이 덮는 번호 범위들을 모아두고, 미확인 조각이
  //   (a) 그 라벨의 어떤 범위와도 겹치지 않으면서  (겹치면 같은 섹션일 수 없음 — 번호 중복)
  //   (b) 어떤 범위의 바로 앞/뒤에 딱 붙는            (min = 기존 max+1 또는 max = 기존 min-1)
  // 라벨이 정확히 하나일 때만 그 라벨로 확정한다. 후보가 0개거나 2개 이상이면 그대로 미확인 —
  // 애매할 때 추측으로 붙이는 것보다 사람에게 묻는 게 낫다.
  const coverage = new Map(); // label → [{min,max}, ...]
  items.forEach(({ idx, s }) => {
    const label = resolved[idx]?.label;
    const range = numberRange(s);
    if (label && range) {
      if (!coverage.has(label)) coverage.set(label, []);
      coverage.get(label).push(range);
    }
  });

  let changed = true;
  while (changed) {
    changed = false;
    for (const { idx, s } of items) {
      if (resolved[idx]?.label != null) continue;
      const range = numberRange(s);
      if (!range) continue;
      const candidates = [];
      for (const [label, ranges] of coverage) {
        const overlaps = ranges.some(r => range.min <= r.max && range.max >= r.min);
        if (overlaps) continue;
        const adjacent = ranges.some(r => range.min === r.max + 1 || range.max === r.min - 1);
        if (adjacent) candidates.push(label);
      }
      if (candidates.length === 1) {
        resolved[idx] = { label: candidates[0], source: 'stitched' };
        coverage.get(candidates[0]).push(range);
        changed = true; // 이 조각이 붙으면서 다른 조각의 후보가 유일해질 수 있어 반복
      }
    }
  }

  // ── 3차: 순서 기반 상속 (마지막 보루) — 퍼즐로도 못 붙인 조각만 대상 ──
  // 번호에 구멍이 있어 딱 안 붙는 경우(예: 모의고사처럼 오답 문항만 기록돼 2,4번 다음이
  // 7,9번인 페이지)를 위해, 복원된 책 순서에서 직전 라벨을 이어받는다. 이건 추측이므로
  // 번호 리셋(직전 max 이하로 되돌아감)이 보이면 절대 잇지 않고 미확인으로 남긴다.
  let prevLabel = null;
  let prevMax = null;
  for (const { idx, s } of sorted) {
    const range = numberRange(s);
    if (resolved[idx]?.label != null) {
      prevLabel = resolved[idx].label;
    } else if (range && prevMax != null && range.min <= prevMax) {
      prevLabel = null; // 번호 리셋 — 새 섹션인데 이름 모름, 상속 금지
    } else if (prevLabel != null) {
      resolved[idx] = { label: prevLabel, source: 'continued' };
    }
    if (range) prevMax = range.max;
    else prevMax = null;
  }
  return resolved;
}
