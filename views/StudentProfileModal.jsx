import { useState, useEffect, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { toPct, fmtPages, resolveUnitGroup } from '../growth.js';
import { DIAG_BADGE as DIAG_MAP, DIAG_SOFT, WRONG_TAGS } from '../diagnosis.js';
import { T, C } from '../tokens.jsx';
import { useEscapeClose, useFocusTrap, useMediaQuery } from '../hooks.js';

// ============================================================
// 학생 종합 프로필 — 내용 본체(모달 크롬 없음)
// PC 학생 관리의 마스터-디테일 오른쪽 패널에 그대로 인라인으로 꽂아 쓰기 위해 모달 오버레이/
// 뒤로가기 히스토리 처리와 분리해둠. onClose가 있으면(모바일 모달) ×버튼을 보여주고,
// 없으면(PC 인라인) 안 보여줌.
// ============================================================
export function StudentProfileContent({ student, reports, reviews = [], onClose, onToast, academyName, onEditReviewNote, directorActions = false }) {
  // 완료된 복습 메모 오타 수정 — 대시보드에서 완료 처리할 때 1회성으로 입력되고 그 뒤엔
  // 고칠 방법이 없었음(실사용 피드백으로 발견). 여기서만 다시 열어 고칠 수 있게.
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [editReviewNoteText, setEditReviewNoteText] = useState('');
  const [showWeekly, setShowWeekly] = useState(false);
  useEscapeClose(() => setShowWeekly(false), showWeekly);
  const weeklyPanelRef = useRef(null);
  useFocusTrap(weeklyPanelRef, showWeekly);
  const [expandedWeak, setExpandedWeak] = useState(null); // 반복 약점 패턴 중 "자세히 보기"로 펼친 key
  // 탭 3개(현황/단원별/기록, HANDOFF-Students.md §2·§7-2) — 이 state가 StudentProfileContent
  // 내부에 있고 부모(StudentsView.jsx)가 학생 전환 시 이 컴포넌트에 key를 안 줘서 리마운트가
  // 안 되므로, PC 인라인 패널에서 다른 학생을 눌러도 보던 탭이 그대로 유지된다(§7-2 결정:
  // "여러 명의 노트를 연달아 볼 때는 유지가 낫다")
  const [activeTab, setActiveTab] = useState('status');
  const [expandedUnitKey, setExpandedUnitKey] = useState(null); // 단원별 탭 — 펼친 대단원(한 번에 하나만)
  const [expandedSubtopicKey, setExpandedSubtopicKey] = useState(null); // 그 안에서 펼친 소주제(단원key::소주제key)
  const [examSelection, setExamSelection] = useState({}); // 출제 담기 체크 — 사용자가 직접 바꾼 것만 기록, 없으면 기본 규칙 적용
  const [zoomedWrongPhoto, setZoomedWrongPhoto] = useState(null); // 오답 사진 라이트박스 — { src, box_2d, caption } | null
  useEscapeClose(() => setZoomedWrongPhoto(null), !!zoomedWrongPhoto);
  const zoomedWrongPhotoRef = useRef(null);
  useFocusTrap(zoomedWrongPhotoRef, !!zoomedWrongPhoto);
  // 캘린더가 기본으로 펼쳐져 있으면 그 아래 내용(수업 기록/약점 패턴 등) 보려고 매번 스크롤을 많이 해야 해서, 기본은 요약만 접어서 보여줌
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const last = [...reports].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
    const d = last?.createdAt?.seconds ? new Date(last.createdAt.seconds * 1000) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // 과제/개념 평가는 구 리포트(1~5)와 신규 리포트(0~100)가 섞여 있으므로 0~100(%) 기준으로 정규화
  // null(미입력)은 보존 — 평균 계산에서 제외해 미입력이 평균을 끌어내리지 않도록
  const sorted = [...reports]
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    .map(r => ({ ...r, conceptRating: r.conceptRating == null ? null : toPct(r.conceptRating), homeworkRating: r.homeworkRating == null ? null : toPct(r.homeworkRating) }));

  const conceptRated = sorted.filter(r => r.conceptRating != null);
  const homeworkRated = sorted.filter(r => r.homeworkRating != null);
  const avgConcept = conceptRated.length ? Math.round(conceptRated.reduce((s, r) => s + r.conceptRating, 0) / conceptRated.length) : 0;
  const avgHomework = homeworkRated.length ? Math.round(homeworkRated.reduce((s, r) => s + r.homeworkRating, 0) / homeworkRated.length) : 0;
  const attendanceRated = sorted.filter(r => r.attendance != null);
  const attendanceRate = attendanceRated.length ? Math.round(attendanceRated.filter(r => r.attendance === '정시').length / attendanceRated.length * 100) : 0;

  // 진단 태그의 단원 입력칸(DiagnosticReportInput.jsx)은 "4"만 적어도 되고 "4단원"까지
  // 다 적어도 되는데, 기존 표시 관례(`${d.unit}단원`)가 무조건 "단원"을 덧붙이다 보니
  // 이미 "단원"까지 적은 태그는 "4단원단원"으로 겹쳐 보이던 버그. 순수 숫자만 "N단원"으로
  // 통일하고, 숫자가 아닌 서술형 입력("소수의 나눗셈" 등)은 원문 그대로 둔다.
  const normalizeTagUnit = (raw) => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return null;
    const stripped = trimmed.replace(/단원$/, '').trim();
    return /^\d+$/.test(stripped) ? `${stripped}단원` : trimmed;
  };

  // 약점 집계 — 어느 교재/단원에서 반복됐는지도 함께 모아둠("자세히 보기"에서 펼쳐 보여줌).
  // 교재 언급이 없으면 "몇 학년 몇 학기"인지 알 수 없어 정보가 부족하다는 피드백으로
  // 리포트의 textbook을 라벨에 함께 붙임. 단원을 안 적었으면(과거 리포트 등) '단원 미기재'로 묶임.
  const diagCount = {};
  const diagUnitCount = {}; // { [key]: { [unitLabel]: count } }
  // 진짜 "정답률"(문항 단위 시도/정답 수)은 diagnosis에 분모가 없어 계산 불가 — 대신 그
  // 약점이 나온 수업들의 평균 개념 이해도(conceptRating)를 정직한 대체 지표로 함께 집계
  const diagRatingSum = {};
  const diagRatingCount = {};
  sorted.forEach(r => (r.diagnosis || []).forEach(d => {
    if (d.key === 'perfect') return;
    diagCount[d.key] = (diagCount[d.key] || 0) + 1;
    if (r.conceptRating != null) {
      diagRatingSum[d.key] = (diagRatingSum[d.key] || 0) + r.conceptRating;
      diagRatingCount[d.key] = (diagRatingCount[d.key] || 0) + 1;
    }
    const normalizedUnit = normalizeTagUnit(d.unit);
    const unitLabel = normalizedUnit
      ? (r.textbook?.trim() ? `${r.textbook.trim()} · ${normalizedUnit}` : normalizedUnit)
      : '단원 미기재';
    if (!diagUnitCount[d.key]) diagUnitCount[d.key] = {};
    diagUnitCount[d.key][unitLabel] = (diagUnitCount[d.key][unitLabel] || 0) + 1;
  }));
  const weakTop3 = Object.entries(diagCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // 최근 학습 단원 목록 — 최근 3건만 보이고 나머지는 "전체 N건"으로만 표기(HANDOFF-Students.md §3-2)
  const unitHistoryAll = [...new Set(sorted.map(r => [r.textbook, r.unit].filter(Boolean).join(' · ')).filter(Boolean))].reverse();
  const unitHistory = unitHistoryAll.slice(0, 3);

  const heatTier = (pct) => pct >= 80
    ? { bg: C.successBg, color: C.successDark, border: `${C.successDark}30` }
    : pct >= 60
      ? { bg: C.warningBg, color: C.warningText, border: `${C.warningText}30` }
      : { bg: '#FDF0F0', color: C.errorDark, border: `${C.errorDark}30` };

  const fmtDate = (r) => r.createdAt?.seconds
    ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
    : '';

  // box_2d(사진 분석 좌표)는 AI 결과일 때만 오고 수동 추가 항목엔 없음 — 값 자체가 있어도
  // [ymin,xmin,ymax,xmax] 4개 숫자·0~1000 범위가 아니면(예: 파싱 이상) 무시하고 사진만 보여줌.
  const isValidBox = (box) => Array.isArray(box) && box.length === 4 && box.every(n => typeof n === 'number' && n >= 0 && n <= 1000);
  const WRONG_TAG_MAP = Object.fromEntries(WRONG_TAGS.map(t => [t.key, t]));

  // 완료된 복습 이력 — 최신순. "완료" 자체보다 그때 실제로 뭘 했는지(note/testScore)를 보여주는 게 목적
  const completedReviews = [...reviews]
    .filter(rv => rv.status === 'done')
    .sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0));

  // 단원별 탭 — 단원별 이해도·오답노트·복습이력을 하나로 묶음(HANDOFF-Students.md §4).
  // "이해도가 낮다 → 왜냐면 그 단원에 오답이 몰려있다 → 그래서 복습을 몇 번 했다"를
  // 대단원 하나를 펼치면 한 화면에서 보게 함. 대단원 아래는 소주제(subtopic) 단위.
  //
  // 소주제 데이터 출처가 리포트마다 다르다 — 반드시 지켜야 하는 전제:
  // - photoAnalysis.sections[].problemTypes[](concept 섹션, 정답+오답 문항 전부)가 있으면
  //   출제횟수·정답률까지 정확히 계산되고, 재출제 이력으로 6종 상태 배지까지 판정 가능.
  //   이 필드는 daily 리포트에만 저장됨(DiagnosticReportInput.jsx의 buildSessionEntry()는
  //   주간형 세션에 photoAnalysis를 안 담음 — 세션 문서가 커지는 걸 막기 위한 기존 설계).
  // - 없으면(주간형 세션, 또는 소주제 분류 도입 전 과거 daily 리포트): report.wrongItems만
  //   갖고 있어 "오답 몇 번"까지만 알 수 있고 정답/출제 총량은 알 길이 없음. 이 경우 정답률·
  //   상태배지 없이 오답 횟수만 표시(2026-08-05 사용자 결정 — 데이터 없는데 억지로 배지를
  //   매기면 오히려 신뢰를 깎는다는 판단).
  // subtopic 필드 자체가 없는 항목(소주제 분류 이전 데이터)은 문항 설명(type)을 그대로
  // 소주제 키로 대신 써서, 서로 뭉치진 않아도 최소한 목록에서 사라지지 않게 함(구 오답노트와
  // 동등한 커버리지 보장).
  const unitTree = (() => {
    const units = {};
    const ensureUnit = (key, label) => {
      if (!units[key]) units[key] = { key, label, subtopics: {}, reportKeys: new Set() };
      return units[key];
    };
    const ensureSub = (unit, subKey) => {
      if (!unit.subtopics[subKey]) unit.subtopics[subKey] = {
        key: subKey, hasExposureData: false, exposureCount: 0, correctCount: 0,
        wrongCount: 0, occurrences: [], wrongItems: [],
      };
      return unit.subtopics[subKey];
    };

    sorted.forEach(r => {
      const group = resolveUnitGroup(r);
      const unitKey = group?.key || r.unit || r.textbook || '단원 미기재';
      const unitLabel = group?.label || unitKey;
      const unit = ensureUnit(unitKey, unitLabel);
      if (r.textbook || r.unit) unit.reportKeys.add([r.textbook, r.unit].filter(Boolean).join(' · '));

      (r.photoAnalysis?.sections || []).filter(s => s.sectionType === 'concept').forEach(s => {
        (s.problemTypes || []).forEach(p => {
          const subKey = p.subtopic || p.type || '분류 안 됨';
          const sub = ensureSub(unit, subKey);
          sub.hasExposureData = true;
          sub.exposureCount += 1;
          if (p.result === '잘함') sub.correctCount += 1;
          sub.occurrences.push({ seconds: r.createdAt?.seconds || 0, result: p.result });
        });
      });

      (r.wrongItems || []).forEach((w, wi) => {
        const subKey = w.subtopic || w.type || '분류 안 됨';
        const sub = ensureSub(unit, subKey);
        sub.wrongCount += 1;
        sub.wrongItems.push({
          id: `${r.id}-${wi}`, seconds: r.createdAt?.seconds || 0, date: fmtDate(r),
          number: w.number, type: w.type, tags: w.tags || [], memo: w.memo,
          causeCalc: (w.tags || []).includes('calc'),
          photoUrl: w.photoIndex != null ? r.photoUrls?.[w.photoIndex - 1] : null,
          box_2d: w.box_2d,
        });
      });
    });

    // 상태 배지 판정 — 저증거 판정(출제 3회 미만)을 반복 판정보다 먼저 검사해야 한다.
    // 안 그러면 이제 막 시작한 단원이 2번 틀렸다고 "반복해서 틀린다"로 잘못 읽힌다(§4).
    const classify = (sub) => {
      if (!sub.hasExposureData) return { simple: true };
      if (sub.exposureCount < 3) {
        return sub.wrongCount === 0
          ? { badge: 'none', label: '틀린 적 없어요', tone: 'gray' }
          : { badge: 'new', label: '이제 막 시작한 유형이에요', tone: 'gray' };
      }
      if (sub.wrongCount === 0) return { badge: 'none', label: '틀린 적 없어요', tone: 'gray' };
      // "복습" = 첫 오답이 나온 그 회차(리포트) 이후, 다른 날짜(리포트)에 같은 소주제가
      // 다시 출제된 것(§7-6: 재발생 자동 판정). 같은 리포트 안에 이 소주제 문항이 여러 개
      // 있어도(같은 seconds) 그건 "그날 여러 문제 중 하나"일 뿐 복습이 아니다 — 이걸 seconds
      // 값 자체가 아니라 발생 순서(index)로만 나누면, 오답 2회가 전부 같은 날 나온 경우에도
      // "그 다음 문항"이 곧바로 복습으로 잡혀 "반복해서 틀리는데 복습을 안 했어요"가 영영
      // 나올 수 없는 논리적 사각지대가 생긴다 — 반드시 날짜(seconds) 단위로 묶어서 판정할 것.
      const occ = [...sub.occurrences].sort((a, b) => a.seconds - b.seconds);
      const firstWrong = occ.find(o => o.result === '약점');
      const laterOcc = occ.filter(o => o.seconds > firstWrong.seconds);
      const reviewedCount = new Set(laterOcc.map(o => o.seconds)).size;
      const wrongAfterReview = laterOcc.some(o => o.result === '약점');
      if (reviewedCount > 0 && wrongAfterReview) return { badge: 'stuck', label: '복습했는데 또 틀렸어요', tone: 'navy', reviewedCount };
      if (reviewedCount > 0) return { badge: 'fixed', label: '복습한 뒤로 맞고 있어요', tone: 'light', reviewedCount };
      if (sub.wrongCount >= 2) return { badge: 'neglected', label: '반복해서 틀리는데 복습을 안 했어요', tone: 'navy', reviewedCount: 0 };
      return { badge: 'onemiss', label: '한 번 틀렸어요', tone: 'light', reviewedCount: 0 };
    };

    return Object.values(units).map(u => {
      const subtopics = Object.values(u.subtopics)
        .map(s => ({
          ...s,
          wrongItems: s.wrongItems.sort((a, b) => b.seconds - a.seconds),
          pct: s.hasExposureData && s.exposureCount > 0 ? Math.round((s.correctCount / s.exposureCount) * 100) : null,
          status: classify(s),
        }))
        .sort((a, b) => b.wrongCount - a.wrongCount);
      const totalWrong = subtopics.reduce((sum, s) => sum + s.wrongCount, 0);
      const withExposure = subtopics.filter(s => s.hasExposureData);
      const totalExposure = withExposure.reduce((sum, s) => sum + s.exposureCount, 0);
      const totalCorrect = withExposure.reduce((sum, s) => sum + s.correctCount, 0);
      const unitPct = totalExposure > 0 ? Math.round((totalCorrect / totalExposure) * 100) : null;
      const reviewedTotal = subtopics.reduce((sum, s) => sum + (s.status.reviewedCount || 0), 0);
      return { ...u, subtopics, totalWrong, unitPct, reviewedTotal };
    }).sort((a, b) => b.totalWrong - a.totalWrong);
  })();
  const unitTreeWrongTotal = unitTree.reduce((s, u) => s + u.totalWrong, 0);
  // 단원 안의 리포트들이 실제로 쓴 [교재,단원] 문자열과 겹치는 완료 복습만 그 단원에 귀속
  // (reviews 컬렉션은 소주제가 아니라 진단 태그·textbook/unit 기준이라 소주제 단위 연결은
  // 불가능 — 대단원 단위까지만 정확하게 묶을 수 있음)
  const reviewsForUnit = (unit) => completedReviews.filter(rv => unit.reportKeys.has([rv.textbook, rv.unit].filter(Boolean).join(' · ')));

  const STATUS_TONE_STYLE = {
    navy: { bg: '#0D2D6B', color: '#fff' },
    fixed: { bg: C.successBg, color: C.successDark },
    onemiss: { bg: '#F1F2F5', color: '#4A4A4A' },
    gray: { bg: '#F1F2F5', color: '#8A8F98' },
  };
  const badgeStyle = (status) => {
    if (status.tone === 'navy') return STATUS_TONE_STYLE.navy;
    if (status.badge === 'fixed') return STATUS_TONE_STYLE.fixed;
    if (status.badge === 'onemiss') return STATUS_TONE_STYLE.onemiss;
    return STATUS_TONE_STYLE.gray;
  };

  // 출제 담기 기본값 — 오답 2회 이상 AND 원인이 계산 실수만은 아닐 것. 계산 실수만으로
  // 틀린 유형은 같은 유형을 또 내도 또 틀리므로 "출제보다 검산 훈련"으로 안내하고 기본
  // 체크를 끈다(§4). 사용자가 직접 켜고 끈 적 있으면 그 선택을 그대로 따름.
  const isCalcOnly = (sub) => sub.wrongItems.length > 0 && sub.wrongItems.every(w => w.causeCalc);
  const examKey = (unitKey, subKey) => `${unitKey}::${subKey}`;
  const isExamChecked = (unit, sub) => {
    const k = examKey(unit.key, sub.key);
    if (k in examSelection) return examSelection[k];
    return sub.wrongCount >= 2 && !isCalcOnly(sub);
  };

  return (
    <div style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>

        {/* 헤더 — 왼쪽 목록에서 학생을 번갈아 누르는 화면인데 스크롤하면 누구를 보는지
            사라지는 문제(HANDOFF-Students.md §3-1)로 position:sticky 고정. 3개 스크롤
            컨테이너(PC 인라인 패널/모바일 풀스크린/데스크톱 중앙 모달) 모두 이 컴포넌트의
            루트가 바로 첫 자식이라 sticky가 그대로 먹는다. 핵심 지표 3개도 여기로 올려서
            본문 맨 위 중복 카드를 없앰. onClose가 있을 때만(모바일 모달) ×버튼 표시 */}
        <div style={{ background: '#0D2D6B', padding: '18px 22px', position: 'sticky', top: 0, zIndex: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ width: '4px', height: '18px', background: '#C9A227', borderRadius: '0', flexShrink: 0 }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.15em' }}>{academyName || '데일리 리포트 시스템'} · 학생 종합 프로필</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '2px', paddingRight: onClose ? '40px' : 0 }}>
            <p style={{ fontSize: '22px', fontWeight: 700, color: '#fff', margin: 0 }}>{student.name}</p>
            {student.school && <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>{student.school}</span>}
          </div>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', margin: '0 0 14px' }}>총 {sorted.length}회 수업 누적</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
            {[
              { label: '개념 이해 평균', value: `${avgConcept}%` },
              { label: '과제 수행 평균', value: `${avgHomework}%` },
              { label: '정시 출석률', value: `${attendanceRate}%` },
            ].map((item, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px 6px', textAlign: 'center' }}>
                <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', margin: '0 0 3px', letterSpacing: '0.04em' }}>{item.label}</p>
                <p style={{ fontSize: '16px', fontWeight: 800, color: '#fff', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{item.value}</p>
              </div>
            ))}
          </div>

          {onClose && (
            <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '18px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '22px', cursor: 'pointer', lineHeight: 1, width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>×</button>
          )}
        </div>

        <div style={{ padding: '20px 22px' }}>

          {/* 탭 3개 — 현황(요즘 어떤가)/단원별(뭘 모르나)/기록(무슨 일이 있었나), 세 질문이
              안 겹쳐서 4개로 안 쪼갬(HANDOFF-Students.md §2) */}
          <div style={{ display: 'flex', gap: '4px', background: '#F3F4F6', borderRadius: '10px', padding: '3px', marginBottom: '20px' }}>
            {[
              { key: 'status', label: '현황' },
              { key: 'unit', label: '단원별' },
              { key: 'history', label: '기록' },
            ].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                style={{
                  flex: 1, padding: '9px', fontSize: '12.5px', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: activeTab === t.key ? '#fff' : 'transparent',
                  color: activeTab === t.key ? '#0D2D6B' : T.textMute,
                  boxShadow: activeTab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* 최근 학습 추이 — 숫자 나열이던 걸 한눈에 보이게(재설계 4단계), 이후 축·범례·
              2번째 지표(과제 수행) 추가(HANDOFF-Students.md §3-3). 새 차트 라이브러리 없이
              순수 SVG, GrowthDashboard의 학급 평균선과 같은 좌표 변환 방식. 두 선은 서로
              다른 리포트 부분집합(conceptRated/homeworkRated)에서 각자 최근 6개를 뽑으므로
              점 개수가 다를 수 있음 — GrowthDashboard의 전체평균선/비교선 관계와 동일하게
              각자 자기 배열 길이 기준으로 x좌표를 매겨 독립적으로 그림(날짜 정렬 강제 안 함) */}
          {activeTab === 'status' && (conceptRated.length >= 2 || homeworkRated.length >= 2) && (() => {
            const cPts = conceptRated.slice(-6);
            const hPts = homeworkRated.slice(-6);
            const W = 380, H = 90, PL = 26, PR = 10, PT = 8, PB = 18;
            const cW = W - PL - PR, cH = H - PT - PB;
            const toXY = (i, v, len) => [
              PL + (i / Math.max(len - 1, 1)) * cW,
              PT + cH - (v / 100) * cH,
            ];
            return (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: '#1A1A1A' }}>최근 학습 추이</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '14px', height: '2.5px', background: '#0D2D6B', borderRadius: '2px' }} />
                    <span style={{ fontSize: '10px', color: T.textMute }}>개념 이해</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <svg width="14" height="6" aria-hidden="true"><line x1="0" y1="3" x2="14" y2="3" stroke="#C9A227" strokeWidth="2" strokeDasharray="4,2" /></svg>
                    <span style={{ fontSize: '10px', color: T.textMute }}>과제 수행</span>
                  </div>
                </div>
                <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '10px' }} />
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible', display: 'block' }}>
                  {[0, 50, 100].map(v => {
                    const y = PT + cH - (v / 100) * cH;
                    return (
                      <g key={v}>
                        <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#E8E6E0" strokeWidth="0.5" strokeDasharray="3,4" />
                        <text x={PL - 4} y={y + 3} fontSize="8.5" fill={T.textMute} textAnchor="end">{v}</text>
                      </g>
                    );
                  })}
                  {cPts.length >= 2 && (() => {
                    const points = cPts.map((r, i) => toXY(i, r.conceptRating, cPts.length));
                    const last = points[points.length - 1];
                    return (
                      <>
                        <polyline points={points.map(p => p.join(',')).join(' ')} fill="none" stroke="#0D2D6B" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                        {points.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === points.length - 1 ? 3.5 : 2.5} fill="#0D2D6B" />)}
                        <text x={last[0] + 6} y={last[1] + 4} fontSize="10" fontWeight="700" fill="#0D2D6B">{cPts[cPts.length - 1].conceptRating}%</text>
                        <text x={toXY(0, 0, cPts.length)[0]} y={H - 2} fontSize="8.5" fill={T.textMute} textAnchor="start">{fmtDate(cPts[0])}</text>
                        <text x={last[0]} y={H - 2} fontSize="8.5" fill={T.textMute} textAnchor="end">{fmtDate(cPts[cPts.length - 1])}</text>
                      </>
                    );
                  })()}
                  {hPts.length >= 2 && (() => {
                    const points = hPts.map((r, i) => toXY(i, r.homeworkRating, hPts.length));
                    const last = points[points.length - 1];
                    return (
                      <>
                        <polyline points={points.map(p => p.join(',')).join(' ')} fill="none" stroke="#C9A227" strokeWidth="2" strokeDasharray="5,3" strokeLinejoin="round" strokeLinecap="round" />
                        {points.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === points.length - 1 ? 3.5 : 2.5} fill="#C9A227" />)}
                        <text x={last[0] + 6} y={last[1] - 4} fontSize="10" fontWeight="700" fill="#8A6A22">{hPts[hPts.length - 1].homeworkRating}%</text>
                      </>
                    );
                  })()}
                </svg>
              </div>
            );
          })()}

          {/* 출결 캘린더 */}
          {activeTab === 'status' && (() => {
            const ATTEND_COLORS = { '정시': C.successDark, '지각': '#C9A227', '결석': C.errorDark, '조퇴': C.warningText };
            const attendanceByDate = {};
            sorted.forEach(r => {
              if (!r.createdAt?.seconds) return;
              const d = new Date(r.createdAt.seconds * 1000);
              attendanceByDate[`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`] = r.attendance;
            });
            const calYear = calMonth.getFullYear();
            const calMonthIdx = calMonth.getMonth();
            const firstDayOfWeek = new Date(calYear, calMonthIdx, 1).getDay();
            const daysInMonth = new Date(calYear, calMonthIdx + 1, 0).getDate();
            const today = new Date();
            const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

            // 접혀있을 때 한 줄로 보여줄 이번 달 출결 요약
            const monthCounts = {};
            Object.entries(attendanceByDate).forEach(([key, att]) => {
              const [y, m] = key.split('-').map(Number);
              if (y === calYear && m === calMonthIdx) monthCounts[att] = (monthCounts[att] || 0) + 1;
            });

            return (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <p style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: '#1A1A1A' }}>출결 캘린더</p>
                  {calendarOpen ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button onClick={() => setCalMonth(new Date(calYear, calMonthIdx - 1, 1))}
                        style={{ background: 'none', border: 'none', color: T.textSub, cursor: 'pointer', fontSize: '14px', padding: '4px', width: '28px', height: '28px' }}>‹</button>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>{calYear}년 {calMonthIdx + 1}월</span>
                      <button onClick={() => setCalMonth(new Date(calYear, calMonthIdx + 1, 1))}
                        style={{ background: 'none', border: 'none', color: T.textSub, cursor: 'pointer', fontSize: '14px', padding: '4px', width: '28px', height: '28px' }}>›</button>
                      <button onClick={() => setCalendarOpen(false)}
                        style={{ fontSize: '11px', fontWeight: 700, color: T.textSub, background: '#F3F4F6', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        접기
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setCalendarOpen(true)}
                      style={{ fontSize: '11px', fontWeight: 700, color: '#0D2D6B', background: '#EAF1FB', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      펼쳐보기
                    </button>
                  )}
                </div>
                <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />

                {!calendarOpen ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '11px 13px', background: '#FAFAF8', border: '0.5px solid #E5E7EB', borderRadius: '10px' }}>
                    <span style={{ fontSize: '11px', color: T.textMute, fontWeight: 700 }}>{calYear}년 {calMonthIdx + 1}월</span>
                    {Object.entries(ATTEND_COLORS).map(([label, color]) => (
                      monthCounts[label] ? (
                        <span key={label} style={{ fontSize: '11px', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, display: 'inline-block' }} />
                          {label} {monthCounts[label]}일
                        </span>
                      ) : null
                    ))}
                    {Object.keys(monthCounts).length === 0 && <span style={{ fontSize: '11px', color: '#757575' }}>이번 달 출결 기록이 없어요</span>}
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
                      {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                        <p key={d} style={{ textAlign: 'center', fontSize: '10px', color: T.textMute, margin: 0, fontWeight: 600 }}>{d}</p>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                      {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const key = `${calYear}-${calMonthIdx}-${day}`;
                        const att = attendanceByDate[key];
                        const isToday = key === todayKey;
                        return (
                          <div key={day} style={{
                            aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            borderRadius: '8px', background: att ? `${ATTEND_COLORS[att] || C.warningText}12` : 'transparent',
                            border: isToday ? `1.5px solid ${C.info}` : '1px solid transparent',
                          }}>
                            <span style={{ fontSize: '11px', fontWeight: att ? 700 : 400, color: att ? (ATTEND_COLORS[att] || '#374151') : '#757575' }}>{day}</span>
                            {att && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: ATTEND_COLORS[att] || C.warningText, marginTop: '2px' }} />}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                      {Object.entries(ATTEND_COLORS).map(([label, color]) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, display: 'inline-block' }} />
                          <span style={{ fontSize: '10px', color: T.textSub }}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* 날짜별 수업 카드 리스트 */}
          {activeTab === 'history' && (
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>수업 기록</p>
            <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {[...sorted].reverse().slice(0, 3).map((r, i) => {
                const hasPerfect = (r.diagnosis || []).some(d => d.key === 'perfect');
                const isWarning = r.conceptRating != null && r.conceptRating <= 40;
                const rawNote = r.teacherNote || '';
                const cleanNote = rawNote.replace(/\[([^\]]+)\]\s*/g, '').trim();

                return (
                  <div key={i} style={{
                    background: '#FAFAF8',
                    border: '0.5px solid #E5E7EB',
                    borderRadius: '8px',
                    padding: '9px 10px',
                    borderLeft: isWarning ? `2px solid ${C.danger}` : hasPerfect ? `2px solid ${C.successDark}` : '2px solid #E5E7EB',
                  }}>
                    {/* 날짜 + 평점 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#1A1A1A' }}>{fmtDate(r)}</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {r.homeworkRating != null && (
                          <span style={{ fontSize: '10px', color: T.textSub }}>
                            과제 <strong style={{ color: '#0D2D6B' }}>{r.homeworkRating}%</strong>
                          </span>
                        )}
                        {r.conceptRating != null && (
                          <span style={{ fontSize: '10px', color: T.textSub }}>
                            개념 <strong style={{ color: '#0D2D6B' }}>{r.conceptRating}%</strong>
                          </span>
                        )}
                        {r.hasTest && r.testScore && (
                          <span style={{ fontSize: '10px', color: '#C9A227', fontWeight: 700 }}>
                            시험 {r.testScore}점
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 교재 + 단원 */}
                    {(r.textbook || r.unit) && (
                      <p style={{ fontSize: '10px', color: T.textMute, margin: '0 0 5px' }}>
                        {[r.textbook, r.unit, r.pages && fmtPages(r.pages)].filter(Boolean).join(' · ')}
                      </p>
                    )}

                    {/* 계산실수/개념누락 같은 부정 진단 태그는 카드마다 나열하지 않음 — 같은
                        정보가 위 "반복 약점 패턴" 섹션에 집계로, 코멘트 문장 안에도 이미 있어
                        중복이었음(HANDOFF-Students.md §3-4). 긍정 신호인 "개념 완벽"만 유지 */}
                    {hasPerfect && (
                      <div style={{ marginBottom: cleanNote ? '5px' : 0 }}>
                        <span style={{ fontSize: '10px', background: C.successBg, color: C.successDark, padding: '1px 7px', borderRadius: '8px', fontWeight: 600 }}>개념 완벽</span>
                      </div>
                    )}

                    {/* 코멘트 미리보기 */}
                    {cleanNote && (
                      <p style={{ fontSize: '10px', color: T.textSub, margin: 0, lineHeight: 1.6, fontStyle: 'italic' }}>
                        "{cleanNote.length > 45 ? cleanNote.slice(0, 45) + '...' : cleanNote}"
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {sorted.length > 3 && (
              <p style={{ fontSize: '11px', color: T.textMute, margin: '8px 0 0', textAlign: 'center' }}>
                최근 3회 표시 · 전체 {sorted.length}회
              </p>
            )}
          </div>
          )}

          {/* 반복 약점 TOP3 */}
          {activeTab === 'status' && weakTop3.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>반복 약점 패턴</p>
              <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {weakTop3.map(([key, count], i) => {
                  const tag = DIAG_MAP[key];
                  if (!tag) return null;
                  const isOpen = expandedWeak === key;
                  const unitBreakdown = Object.entries(diagUnitCount[key] || {}).sort((a, b) => b[1] - a[1]);
                  return (
                    <div key={i}>
                      <div onClick={() => setExpandedWeak(isOpen ? null : key)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <div style={{ background: tag.bg, color: '#fff', fontSize: '11px', fontWeight: 800, width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                        <span style={{ background: tag.bg, color: '#fff', fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', flexShrink: 0 }}>{tag.prefix} {tag.label}</span>
                        <div style={{ flex: 1, height: '5px', background: '#F3F4F6', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${(count / (weakTop3[0][1])) * 100}%`, height: '100%', background: tag.bg, borderRadius: '4px' }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: tag.bg, flexShrink: 0 }}>{count}회</span>
                        {diagRatingCount[key] > 0 && (() => {
                          const avg = Math.round(diagRatingSum[key] / diagRatingCount[key]);
                          const tier = heatTier(avg);
                          return (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: tier.color, background: tier.bg, padding: '2px 8px', borderRadius: '10px', flexShrink: 0 }}>
                              평균 {avg}%
                            </span>
                          );
                        })()}
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                          <path d="M3 4.5L6 7.5L9 4.5" stroke="#757575" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      {isOpen && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px', paddingLeft: '30px' }}>
                          {unitBreakdown.map(([unitLabel, unitCount]) => (
                            <span key={unitLabel} style={{ fontSize: '11px', fontWeight: 600, color: '#374151', background: '#F3F4F6', padding: '3px 9px', borderRadius: '12px' }}>
                              {unitLabel} {unitCount}회
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 단원별 탭 — 단원별 이해도·오답노트·복습이력을 하나로(HANDOFF-Students.md §4).
              대단원을 펼치면 소주제별 상태 배지 + 오답 증거 + (그 단원에 실제로 있었던)
              복습 이력이 한 화면에 나온다. "이해도가 낮다 → 오답이 몰려있다 → 복습을 몇
              번 했다"를 여기저기 오가지 않고 바로 이어 붙여 읽을 수 있게 하는 게 목적. */}
          {activeTab === 'unit' && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '6px' }}>
                <p style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: '#1A1A1A' }}>단원별</p>
                {unitTree.length > 0 && <span style={{ fontSize: '11px', fontWeight: 600, color: T.textMute }}>총 오답 {unitTreeWrongTotal}건</span>}
              </div>
              <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />

              {unitTree.length === 0 ? (
                <p style={{ fontSize: '12px', color: T.textMute, margin: 0 }}>아직 채점 사진 분석 기록이 없어요.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {unitTree.map(u => {
                    const isUnitOpen = expandedUnitKey === u.key;
                    const unitReviews = reviewsForUnit(u);
                    return (
                      <div key={u.key} style={{ background: '#FAFAF8', border: '0.5px solid #E5E7EB', borderRadius: '8px', overflow: 'hidden' }}>
                        <div onClick={() => setExpandedUnitKey(isUnitOpen ? null : u.key)}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', cursor: 'pointer', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#2C2C2C', flex: 1, minWidth: '80px' }}>{u.label}</span>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: C.errorDark, background: '#FDF0F0', padding: '2px 8px', borderRadius: '10px', flexShrink: 0 }}>오답 {u.totalWrong}개</span>
                          {u.reviewedTotal > 0 && (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: C.primary, background: '#EAF0F9', padding: '2px 8px', borderRadius: '10px', flexShrink: 0 }}>복습 {u.reviewedTotal}회</span>
                          )}
                          {u.unitPct != null && (() => {
                            const tier = heatTier(u.unitPct);
                            return <span style={{ fontSize: '11px', fontWeight: 700, color: tier.color, background: tier.bg, padding: '2px 8px', borderRadius: '10px', flexShrink: 0 }}>정답률 {u.unitPct}%</span>;
                          })()}
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0, transform: isUnitOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                            <path d="M3 4.5L6 7.5L9 4.5" stroke="#757575" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        {isUnitOpen && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '0 10px 10px' }}>
                            {u.subtopics.map(sub => {
                              const subOpen = expandedSubtopicKey === examKey(u.key, sub.key);
                              const checked = isExamChecked(u, sub);
                              const calcOnly = isCalcOnly(sub);
                              const tone = sub.status.simple ? null : badgeStyle(sub.status);
                              return (
                                <div key={sub.key} style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: '6px', overflow: 'hidden' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 9px', flexWrap: 'wrap' }}>
                                    <input type="checkbox" checked={checked}
                                      onChange={e => setExamSelection(prev => ({ ...prev, [examKey(u.key, sub.key)]: e.target.checked }))}
                                      title={calcOnly ? '계산 실수만 반복 — 출제보다 검산 훈련' : '출제 담기'}
                                      style={{ flexShrink: 0, width: '15px', height: '15px', cursor: 'pointer' }} />
                                    <span onClick={() => sub.wrongItems.length > 0 && setExpandedSubtopicKey(subOpen ? null : examKey(u.key, sub.key))}
                                      style={{ fontSize: '12px', fontWeight: 600, color: '#2C2C2C', flex: 1, minWidth: '70px', cursor: sub.wrongItems.length > 0 ? 'pointer' : 'default' }}>
                                      {sub.key}
                                    </span>
                                    {tone ? (
                                      <span style={{ fontSize: '10px', fontWeight: 700, color: tone.color, background: tone.bg, padding: '2px 7px', borderRadius: '10px', flexShrink: 0, whiteSpace: 'nowrap' }}>{sub.status.label}</span>
                                    ) : (
                                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#8A8F98', background: '#F1F2F5', padding: '2px 7px', borderRadius: '10px', flexShrink: 0, whiteSpace: 'nowrap' }}>오답 {sub.wrongCount}회</span>
                                    )}
                                    {sub.pct != null && <span style={{ fontSize: '10px', fontWeight: 700, color: T.textMute, flexShrink: 0 }}>{sub.pct}%</span>}
                                  </div>
                                  {calcOnly && (
                                    <p style={{ fontSize: '10px', color: C.warningText, margin: '0 9px 6px', lineHeight: 1.5 }}>계산 실수 반복 — 출제보다 검산 훈련이 먼저예요</p>
                                  )}
                                  {subOpen && sub.wrongItems.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '0 9px 9px' }}>
                                      {sub.wrongItems.slice(0, 10).map(it => (
                                        <div key={it.id}
                                          onClick={() => it.photoUrl && setZoomedWrongPhoto({ src: it.photoUrl, box_2d: it.box_2d, caption: [it.number && `${it.number}번`, it.type || sub.key].filter(Boolean).join(' · ') })}
                                          style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#FAFAF8', border: '0.5px solid #E5E7EB', borderRadius: '6px', padding: '7px 9px', cursor: it.photoUrl ? 'pointer' : 'default' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#374151' }}>{it.date}</span>
                                            {it.number && <span style={{ fontSize: '10.5px', color: T.textMute }}>{it.number}번</span>}
                                            {it.type && <span style={{ fontSize: '11px', color: '#2C2C2C' }}>{it.type}</span>}
                                            {it.photoUrl && (
                                              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                                                <rect x="1.5" y="3" width="11" height="8.5" rx="1.5" stroke="#8A93A3" strokeWidth="1.1" />
                                                <circle cx="7" cy="7.2" r="2" stroke="#8A93A3" strokeWidth="1.1" />
                                              </svg>
                                            )}
                                          </div>
                                          {it.tags.length > 0 && (
                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                              {it.tags.map(tagKey => {
                                                const t = WRONG_TAG_MAP[tagKey];
                                                if (!t) return null;
                                                return <span key={tagKey} style={{ fontSize: '10px', fontWeight: 700, color: t.color, background: t.bg, border: `1px solid ${t.border}`, padding: '2px 7px', borderRadius: '10px' }}>{t.label}</span>;
                                              })}
                                            </div>
                                          )}
                                          {it.memo && <p style={{ fontSize: '11px', color: T.textSub, margin: 0, lineHeight: 1.5 }}>{it.memo}</p>}
                                        </div>
                                      ))}
                                      {sub.wrongItems.length > 10 && (
                                        <p style={{ fontSize: '10px', color: T.textMute, margin: 0, textAlign: 'center' }}>외 {sub.wrongItems.length - 10}건 더</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* 복습 이력 — reviews 컬렉션은 소주제가 아니라 textbook/unit 기준이라
                                대단원 단위까지만 정확히 귀속 가능(소주제별 연결은 데이터에 없음) */}
                            {unitReviews.length > 0 && (
                              <div style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px solid #EEECEA' }}>
                                <p style={{ fontSize: '11px', fontWeight: 700, color: T.textMute, margin: '0 0 6px' }}>복습 이력</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {unitReviews.slice(0, 3).map(rv => (
                                    <div key={rv.id} style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: '6px', padding: '7px 9px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#1A1A1A' }}>
                                          {rv.round}차 복습{rv.weakTypes?.length > 0 && <span style={{ fontWeight: 500, color: T.textSub }}> · {rv.weakTypes.map(w => w.label).join(', ')}</span>}
                                        </span>
                                        <span style={{ fontSize: '10px', color: T.textMute }}>
                                          {rv.completedAt?.seconds ? new Date(rv.completedAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : ''}
                                        </span>
                                      </div>
                                      {rv.testScore != null && rv.testScore !== '' && (
                                        <p style={{ fontSize: '10px', color: '#C9A227', fontWeight: 700, margin: '3px 0 0' }}>재시험 {rv.testScore}점</p>
                                      )}
                                      {editingReviewId === rv.id ? (
                                        <div>
                                          <textarea value={editReviewNoteText} onChange={e => setEditReviewNoteText(e.target.value)} autoFocus
                                            style={{ width: '100%', minHeight: '54px', padding: '6px 8px', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginTop: '4px' }} />
                                          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                            <button onClick={async () => { await onEditReviewNote?.(rv.id, editReviewNoteText); setEditingReviewId(null); }}
                                              style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700, border: 'none', borderRadius: '6px', background: C.primary, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>저장</button>
                                            <button onClick={() => setEditingReviewId(null)}
                                              style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 600, border: '1px solid #E5E7EB', borderRadius: '6px', background: '#fff', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
                                          </div>
                                        </div>
                                      ) : rv.note && (
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginTop: '3px' }}>
                                          <p style={{ fontSize: '10.5px', color: T.textSub, margin: 0, lineHeight: 1.6, flex: 1 }}>{rv.note}</p>
                                          {onEditReviewNote && (
                                            <button onClick={() => { setEditingReviewId(rv.id); setEditReviewNoteText(rv.note || ''); }}
                                              title="메모 수정" aria-label="메모 수정"
                                              style={{ flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: T.textMute, display: 'flex' }}>
                                              <Pencil size={11} />
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 출제 담기 — 실제 문제 생성 기능이 아직 없어 "유형 목록 복사"까지만 제공
                  (§4: 없는 기능을 버튼으로 약속하지 않는다) */}
              {unitTree.some(u => u.subtopics.some(s => isExamChecked(u, s))) && (
                <button onClick={() => {
                  const lines = unitTree.flatMap(u => {
                    const picked = u.subtopics.filter(s => isExamChecked(u, s));
                    return picked.length > 0 ? [`[${u.label}]`, ...picked.map(s => `- ${s.key}`)] : [];
                  });
                  navigator.clipboard.writeText(lines.join('\n')).then(() => onToast?.('출제할 유형 목록이 복사됐어요.'));
                }}
                  style={{ width: '100%', marginTop: '10px', padding: '11px', fontSize: '12px', fontWeight: 700, color: '#fff', background: '#0D2D6B', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  체크한 유형 목록 복사
                </button>
              )}
            </div>
          )}

          {/* 오답 사진 라이트박스 — 사진 위에 box_2d(AI가 짚은 문항 좌표, 0~1000 정규화)가
              유효할 때만 빨간 사각형을 정적으로 얹음. DiagnosticReportInput.jsx의
              PhotoBoxOverlay와 달리 토글/편집 없이 "그 문항이 여기다"만 보여주는 용도라 단순화. */}
          {zoomedWrongPhoto && (
            <div ref={zoomedWrongPhotoRef} role="dialog" aria-modal="true"
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.82)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
              onClick={() => setZoomedWrongPhoto(null)}>
              <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: '100%', maxHeight: '80vh', display: 'inline-block' }}>
                <img src={zoomedWrongPhoto.src} alt={zoomedWrongPhoto.caption || '오답 사진'} style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block', borderRadius: '4px' }} />
                {isValidBox(zoomedWrongPhoto.box_2d) && (
                  <div style={{
                    position: 'absolute',
                    top: `${zoomedWrongPhoto.box_2d[0] / 10}%`, left: `${zoomedWrongPhoto.box_2d[1] / 10}%`,
                    height: `${(zoomedWrongPhoto.box_2d[2] - zoomedWrongPhoto.box_2d[0]) / 10}%`,
                    width: `${(zoomedWrongPhoto.box_2d[3] - zoomedWrongPhoto.box_2d[1]) / 10}%`,
                    border: '2.5px solid #E53E3E', borderRadius: '3px', boxShadow: '0 0 0 1px rgba(255,255,255,0.6)', pointerEvents: 'none',
                  }} />
                )}
              </div>
              {zoomedWrongPhoto.caption && (
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginTop: '12px', textAlign: 'center' }}>{zoomedWrongPhoto.caption}</p>
              )}
              <button onClick={() => setZoomedWrongPhoto(null)}
                style={{ marginTop: '10px', padding: '9px 20px', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                닫기
              </button>
            </div>
          )}

          {/* 최근 학습 단원 */}
          {activeTab === 'history' && unitHistory.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>최근 학습 단원</p>
              <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {unitHistory.map((unit, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: i === 0 ? '#0D2D6B' : '#D8DDE4', flexShrink: 0 }} />
                    <p style={{ fontSize: '12px', color: i === 0 ? '#0D2D6B' : T.textSub, fontWeight: i === 0 ? 700 : 400, margin: 0 }}>{unit}</p>
                    {i === 0 && <span style={{ fontSize: '10px', background: '#EAF0F9', color: T.brand, padding: '1px 7px', borderRadius: '10px', fontWeight: 700 }}>최근</span>}
                  </div>
                ))}
              </div>
              {unitHistoryAll.length > 3 && (
                <p style={{ fontSize: '11px', color: T.textMute, margin: '8px 0 0', textAlign: 'center' }}>
                  최근 3건 표시 · 전체 {unitHistoryAll.length}건
                </p>
              )}
            </div>
          )}

          {/* 최근 선생님 코멘트 */}
          {activeTab === 'history' && sorted.filter(r => r.teacherNote).length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>최근 선생님 코멘트</p>
              <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sorted.filter(r => r.teacherNote).slice(-3).reverse().map((r, i) => (
                  <div key={i} style={{ borderLeft: '2px solid #C9A227', paddingLeft: '12px' }}>
                    <p style={{ fontSize: '10px', color: T.textMute, margin: '0 0 3px' }}>{fmtDate(r)}</p>
                    <p style={{ fontSize: '12px', color: T.textSub, margin: 0, lineHeight: 1.7, fontStyle: 'italic' }}>"{r.teacherNote}"</p>
                  </div>
                ))}
              </div>
              {sorted.filter(r => r.teacherNote).length > 3 && (
                <p style={{ fontSize: '11px', color: T.textMute, margin: '8px 0 0', textAlign: 'center' }}>
                  최근 3건 표시 · 전체 {sorted.filter(r => r.teacherNote).length}건
                </p>
              )}
            </div>
          )}

          {/* 원장님 상담 메모 */}
          {activeTab === 'history' && (
          <div>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>원장님 상담 메모</p>
            <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '12px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sorted.filter(r => r.directorMemo).slice(-3).reverse().map((r, i) => (
                <div key={i} style={{ background: '#FFFDF0', border: '0.5px solid #F5D76E', borderRadius: '8px', padding: '10px 12px' }}>
                  <p style={{ fontSize: '10px', color: C.warningText, margin: '0 0 3px' }}>{fmtDate(r)}</p>
                  <p style={{ fontSize: '12px', color: '#1A1A1A', margin: 0, lineHeight: 1.6 }}>{r.directorMemo}</p>
                </div>
              ))}
              {sorted.filter(r => r.directorMemo).length === 0 && (
                <p style={{ fontSize: '12px', color: T.textMute, margin: 0 }}>저장된 상담 메모가 없습니다.</p>
              )}
            </div>
            {sorted.filter(r => r.directorMemo).length > 3 && (
              <p style={{ fontSize: '11px', color: T.textMute, margin: '8px 0 0', textAlign: 'center' }}>
                최근 3건 표시 · 전체 {sorted.filter(r => r.directorMemo).length}건
              </p>
            )}
          </div>
          )}

          {/* 성장 포트폴리오 공유 */}
          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #EEECEA' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', color: '#1A1A1A' }}>성장 포트폴리오 공유</p>
            <div style={{ width: '32px', height: '2px', background: '#C9A227', marginBottom: '14px' }} />

            {/* 링크 생성 */}
            {(() => {
              const baseUrl = `${window.location.origin}/story/${student.id}`;
              const copyUrl = `${baseUrl}?src=copy`;

              const handleCopy = () => {
                navigator.clipboard.writeText(copyUrl).then(() => {
                  onToast?.('링크 복사됐어요! 카톡에 붙여넣기 하세요.');
                });
              };

              // 담당 선생님에게 확인 요청 — 재설계 4단계, 원장 화면 전용(directorActions).
              // 자동 알림을 보내는 기능이 아직 없어서(그런 발송 경로 자체가 앱에 없음), 실제로
              // 하는 일은 다른 "링크 복사"들과 똑같이 클립보드에 문구를 담아주는 것뿐이다 —
              // 원장이 그 문구를 복사해 카톡 등으로 직접 보내는 방식. 없는 자동발송 기능을
              // 있는 것처럼 보이는 버튼으로 만들지 않기 위함.
              const latestTeacherName = [...sorted].reverse().find(r => r.teacherName)?.teacherName || null;
              const handleRequestCheck = () => {
                const text = `[${academyName || '데일리 리포트'}] ${student.name} 학생 리포트 확인 부탁드립니다.${latestTeacherName ? ` (${latestTeacherName})` : ''}`;
                navigator.clipboard.writeText(text).then(() => onToast?.('복사됐어요! 선생님께 보내주세요.'));
              };

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

                  {directorActions && (
                    <button onClick={handleRequestCheck}
                      style={{ width: '100%', padding: '13px 16px', fontSize: '13px', fontWeight: 700, background: '#0D2D6B', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      담당 선생님에게 확인 요청
                    </button>
                  )}

                  {/* 카카오톡 공유 — 학부모 발송은 리포트 작성 화면의 역할이라, 원장 화면에서는 뺌 */}
                  {!directorActions && (
                    <button onClick={handleCopy}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 16px', background: '#FEE500', border: 'none', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                        <path d="M11 2C6.03 2 2 5.36 2 9.5c0 2.67 1.63 5.02 4.07 6.44l-.88 3.25 3.8-1.98A10.8 10.8 0 0011 17c4.97 0 9-3.36 9-7.5S15.97 2 11 2z" fill="#3A1D1D"/>
                      </svg>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '13px', fontWeight: 700, color: '#3A1D1D', margin: '0 0 2px' }}>카카오톡으로 공유</p>
                        <p style={{ fontSize: '11px', color: '#5A3D3D', margin: 0 }}>링크 복사 → 카카오톡 붙여넣기</p>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                        <path d="M6 3l5 5-5 5" stroke="#3A1D1D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}

                  {/* 링크 복사 */}
                  <button onClick={() => navigator.clipboard.writeText(copyUrl).then(() => onToast?.('링크 복사됐어요! 카톡에 붙여넣기 하세요.'))}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 16px', background: '#F7F5F1', border: '0.5px solid #E5E5E5', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <path d="M8 4H5a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-3M12 3h5v5M10 10L17 3" stroke="#4A4A4A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#2C2C2C', margin: '0 0 2px' }}>링크 복사</p>
                      <p style={{ fontSize: '11px', color: '#757575', margin: 0 }}>/story/{student.id.slice(0, 8)}...</p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <rect x="5" y="5" width="8" height="8" rx="1" stroke="#757575" strokeWidth="1.2"/>
                      <path d="M3 11V3h8" stroke="#757575" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </button>

                  {/* 성장 포트폴리오 열기 — "보기(공개페이지)"/"편집" 2개 링크로 나뉘어 있던 걸 통합.
                      같은 페이지에 ?edit=1 하나 차이고, 편집 모드가 보기 모드를 포함(학부모에게는
                      원래도 이 파라미터가 안 보임), 학부모용 링크는 위 "링크 복사"가 항상 순수
                      URL을 주므로 굳이 나눌 이유가 없었음. directorActions에서는 이탈 동작이 가장
                      강한 버튼이면 안 된다는 시안 결정에 따라 텍스트 링크로 강등. */}
                  {directorActions ? (
                    <a href={`/story/${student.id}?edit=1`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'block', textAlign: 'center', padding: '8px', color: '#8A6500', fontSize: '12px', fontWeight: 600, textDecoration: 'underline', marginTop: '2px' }}>
                      성장 포트폴리오 보기·편집
                    </a>
                  ) : (
                    <a href={`/story/${student.id}?edit=1`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: '#FFF9EC', border: '1px solid #C9A227', borderRadius: '8px', textDecoration: 'none', marginTop: '4px' }}>
                      <Pencil size={12} style={{ color: '#8A6500' }} />
                      <span style={{ fontSize: '12px', color: '#8A6500', fontWeight: 700 }}>성장 포트폴리오 보기·편집</span>
                    </a>
                  )}

                  {/* 주간 요약 카드 */}
                  <button onClick={() => setShowWeekly(true)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: '#0D2D6B', border: 'none', borderRadius: '8px', cursor: 'pointer', marginTop: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1" y="2" width="12" height="10" rx="2" stroke="#fff" strokeWidth="1.2"/><path d="M4 5h6M4 7.5h4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600 }}>이번 주 요약 카드</span>
                  </button>

                  {/* 주간 요약 카드 모달 */}
                  {showWeekly && (
                    <div role="dialog" aria-modal="true" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '20px' }}
                      onClick={() => setShowWeekly(false)}>
                      <div ref={weeklyPanelRef} onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '420px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px' }}>
                        <WeeklySummaryCard student={student} reports={reports} academyName={academyName} />
                        <button onClick={() => setShowWeekly(false)}
                          style={{ width: '100%', marginTop: '8px', padding: '12px', background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
                          닫기
                        </button>
                      </div>
                    </div>
                  )}

                  <p style={{ fontSize: '10px', color: '#757575', margin: '4px 0 0', textAlign: 'center' }}>
                    링크 열람 시 ?src 파라미터로 유입 경로 추적 가능
                  </p>
                </div>
              );
            })()}
          </div>

        </div>
    </div>
  );
}

// ============================================================
// 모바일 모달 크롬 — 오버레이/배경 클릭 닫기 + 뒤로가기 히스토리 처리.
// 실제 내용은 StudentProfileContent를 그대로 씀(PC 인라인 패널과 동일 소스).
// ============================================================
export function StudentProfileModal({ student, reports, reviews = [], onClose, onToast, academyName, onEditReviewNote }) {
  // 모바일에서는 어차피 620px 중앙 모달이 화면을 거의 다 덮으면서도 진짜 전체화면은
  // 아니었음(여백+블러+둥근모서리로 "모달"인 척만 함) — 실사용 요청으로 모바일은 진짜
  // 전체화면(여백·블러·모서리 없음)으로, 데스크톱(퇴원생 행처럼 PC 마스터-디테일을 안 타는
  // 예외 케이스에서만 열림)은 기존 중앙 모달을 유지
  const isMobile = !useMediaQuery('(min-width: 900px)');
  useEscapeClose(onClose);
  const wrapperPanelRef = useRef(null);
  useFocusTrap(wrapperPanelRef, true);
  // 모바일 뒤로가기 지원 — SPA history 보호
  useEffect(() => {
    // 현재 페이지를 history에 한 번 더 쌓아서 뒤로가기가 앱 밖으로 안 나가게
    history.pushState(null, '', window.location.href);
    history.pushState({ modal: 'profile' }, '', window.location.href);
    const handlePop = () => {
      // 모달 닫고 앱 내 페이지로 복귀
      history.pushState(null, '', window.location.href);
      onClose();
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  if (isMobile) {
    return (
      <div ref={wrapperPanelRef} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 1000, overflowY: 'auto' }}>
        <StudentProfileContent student={student} reports={reports} reviews={reviews} onClose={onClose} onToast={onToast} academyName={academyName} onEditReviewNote={onEditReviewNote} />
      </div>
    );
  }

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div ref={wrapperPanelRef} style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '620px', maxHeight: '88vh', overflow: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <StudentProfileContent student={student} reports={reports} reviews={reviews} onClose={onClose} onToast={onToast} academyName={academyName} onEditReviewNote={onEditReviewNote} />
      </div>
    </div>
  );
}

// ============================================================
// 학생 경량 서랍 — 재설계 (실사용 피드백 반영, 2차 조정). GrowthDashboard 학생 표를
// "훑어보는" 용도라 풀 프로필(StudentProfileContent, 페이지 한 장 분량)을 그대로 넣지
// 않는다. 지표 3개 + 최근 3회 수업 기록만 보여주고, 더 보려면 하단 링크로 학생관리의
// 전체 화면(인라인/모바일 풀스크린)으로 넘어간다. 표를 계속 보면서 다음 학생을 바로
// 누를 수 있어야 하므로 배경 딤도 없앰 — 대신 왼쪽 테두리+그림자로 층만 구분.
// ============================================================
export function StudentDetailPanel({ studentList, currentId, onSelect, onClose, onOpenFull, reports, statusInfo }) {
  const isMobile = !useMediaQuery('(min-width: 900px)');
  useEscapeClose(onClose);
  const panelRef = useRef(null);

  // 바깥 클릭으로 닫힘 — 배경 딤(오버레이)이 없어서 오버레이의 onClick으로는 못 잡고,
  // 문서 전체에 리스너를 달아 패널 바깥 클릭만 감지한다
  useEffect(() => {
    const handleOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [onClose]);

  // 모바일 뒤로가기 지원 — 일반 사용자는 × 버튼보다 스마트폰 뒤로가기(제스처/버튼)를
  // 먼저 쓰기 때문에, 그 뒤로가기가 SPA 자체를 벗어나지 않고 이 서랍만 닫도록 history
  // 한 칸을 미리 쌓아둔다. mount 시 1회만(prev/next로 학생을 넘겨도 다시 안 쌓임)
  useEffect(() => {
    history.pushState(null, '', window.location.href);
    history.pushState({ modal: 'studentDetail' }, '', window.location.href);
    const handlePop = () => {
      history.pushState(null, '', window.location.href);
      onClose();
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const idx = studentList.findIndex(s => s.id === currentId);
  const student = studentList[idx];
  const hasMultiple = studentList.length > 1;
  const goPrev = () => idx > 0 && onSelect(studentList[idx - 1].id);
  const goNext = () => idx < studentList.length - 1 && onSelect(studentList[idx + 1].id);

  if (!student) return null;

  const trendStr = statusInfo?.trend == null ? null : statusInfo.trend > 0 ? `▲${Math.abs(statusInfo.trend)}` : statusInfo.trend < 0 ? `▼${Math.abs(statusInfo.trend)}` : '―';

  // 지표 3개 — StudentProfileContent 상단 지표와 동일한 계산(전체 기간 평균)
  const sorted = [...reports]
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    .map(r => ({ ...r, conceptRating: r.conceptRating == null ? null : toPct(r.conceptRating), homeworkRating: r.homeworkRating == null ? null : toPct(r.homeworkRating) }));
  const conceptRated = sorted.filter(r => r.conceptRating != null);
  const homeworkRated = sorted.filter(r => r.homeworkRating != null);
  const avgConcept = conceptRated.length ? Math.round(conceptRated.reduce((s, r) => s + r.conceptRating, 0) / conceptRated.length) : 0;
  const avgHomework = homeworkRated.length ? Math.round(homeworkRated.reduce((s, r) => s + r.homeworkRating, 0) / homeworkRated.length) : 0;
  const attendanceRated = sorted.filter(r => r.attendance != null);
  const attendanceRate = attendanceRated.length ? Math.round(attendanceRated.filter(r => r.attendance === '정시').length / attendanceRated.length * 100) : 0;
  const recent3 = [...sorted].reverse().slice(0, 3);
  const fmtDate = (r) => r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '';

  return (
    <div ref={panelRef} role="dialog" aria-modal="true" style={isMobile
      ? { position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: '70vh', width: '100%', background: '#fff', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderTop: `1px solid ${C.primary}30`, overflowY: 'auto', zIndex: 200, boxShadow: '0 -6px 24px rgba(23,23,25,0.14)' }
      : { position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px', background: '#fff', borderLeft: `1px solid ${C.primary}30`, overflowY: 'auto', zIndex: 200, boxShadow: '-6px 0 24px rgba(23,23,25,0.10)' }
    }>
      {/* 상단 바 — 닫기는 왼쪽, 이전/다음은 오른쪽(실사용 피드백: 한쪽에 몰리면 오조작 위험) */}
      <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', borderBottom: '0.5px solid #E8E6E0' }}>
        <button onClick={onClose} aria-label="닫기"
          style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6B7785', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }}>×</button>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {student.name}{hasMultiple ? ` · ${idx + 1}/${studentList.length}` : ''}
        </span>
        {hasMultiple ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            <button onClick={goPrev} disabled={idx <= 0} aria-label="이전 학생"
              style={{ background: 'none', border: 'none', color: idx <= 0 ? '#D4D7DD' : '#374151', cursor: idx <= 0 ? 'not-allowed' : 'pointer', fontSize: '16px', padding: '4px 6px', fontFamily: 'inherit' }}>‹</button>
            <button onClick={goNext} disabled={idx >= studentList.length - 1} aria-label="다음 학생"
              style={{ background: 'none', border: 'none', color: idx >= studentList.length - 1 ? '#D4D7DD' : '#374151', cursor: idx >= studentList.length - 1 ? 'not-allowed' : 'pointer', fontSize: '16px', padding: '4px 6px', fontFamily: 'inherit' }}>›</button>
          </div>
        ) : <div style={{ width: '36px', flexShrink: 0 }} />}
      </div>

      {/* 기간 상태 배지 — GrowthDashboard(기간 뷰)에서 열었을 때만 statusInfo가 전달됨 */}
      {statusInfo && (
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #E8E6E0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: statusInfo.status.bg }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: statusInfo.status.color }}>● {statusInfo.status.label}</span>
          <span style={{ fontSize: '16px', fontWeight: 800, color: statusInfo.status.color, fontVariantNumeric: 'tabular-nums' }}>
            {statusInfo.avg}%{trendStr && <span style={{ fontSize: '11px', marginLeft: '5px' }}>{trendStr}</span>}
          </span>
        </div>
      )}

      <div style={{ padding: '18px 16px' }}>
        {/* 지표 3개 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '18px' }}>
          {[
            { label: '개념 이해', value: `${avgConcept}%`, color: avgConcept >= 80 ? C.successDark : avgConcept >= 60 ? C.warningText : C.errorDark },
            { label: '과제 수행', value: `${avgHomework}%`, color: avgHomework >= 80 ? C.successDark : C.warningText },
            { label: '정시 출석', value: `${attendanceRate}%`, color: attendanceRate >= 90 ? C.successDark : attendanceRate >= 70 ? C.warningText : C.errorDark },
          ].map((item, i) => (
            <div key={i} style={{ border: '0.5px solid #E8E6E0', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '9px', color: T.textMute, margin: '0 0 3px', letterSpacing: '0.06em' }}>{item.label}</p>
              <p style={{ fontSize: '17px', fontWeight: 800, color: item.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* 최근 3회 수업 기록 */}
        <p style={{ fontSize: '11px', color: T.textMute, fontWeight: 700, letterSpacing: '0.06em', margin: '0 0 8px' }}>최근 수업 기록</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '18px' }}>
          {recent3.length === 0 ? (
            <p style={{ fontSize: '12px', color: T.textMute, margin: 0 }}>아직 기록된 수업이 없습니다</p>
          ) : recent3.map((r, i) => (
            <div key={i} style={{ background: '#FAFAF8', border: '0.5px solid #E5E7EB', borderRadius: '8px', padding: '9px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#1A1A1A' }}>{fmtDate(r)}</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {r.homeworkRating != null && <span style={{ fontSize: '10px', color: T.textSub }}>과제 <strong style={{ color: '#0D2D6B' }}>{r.homeworkRating}%</strong></span>}
                  {r.conceptRating != null && <span style={{ fontSize: '10px', color: T.textSub }}>개념 <strong style={{ color: '#0D2D6B' }}>{r.conceptRating}%</strong></span>}
                </div>
              </div>
              {(r.textbook || r.unit) && (
                <p style={{ fontSize: '10px', color: T.textMute, margin: 0 }}>{[r.textbook, r.unit].filter(Boolean).join(' · ')}</p>
              )}
            </div>
          ))}
        </div>

        <button onClick={() => { onOpenFull?.(student.id); onClose(); }}
          style={{ width: '100%', padding: '11px', background: 'none', border: `1px solid ${C.primary}`, borderRadius: '8px', color: C.primary, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          종합 프로필 전체 보기 →
        </button>
      </div>
    </div>
  );
}

// ── 주간 요약 카드 — StudentProfileModal 안에서만 씀
function WeeklySummaryCard({ student, reports, academyName }) {
  const [copied, setCopied] = useState(false);

  const now = new Date();
  // 일요일엔 getDay()===0이라 "-getDay()+1"이 +1(내일)이 돼서 weekStart가 미래로 감 —
  // 일요일만 예외로 -6(지난 월요일)을 쓰도록 보정 (DirectorView.jsx와 동일 패턴)
  const mondayOffset = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const fmt = (d) => `${d.getMonth()+1}/${d.getDate()}`;
  const weekNum = Math.ceil((now.getDate() + mondayOffset) / 7);
  const weekLabel = `${now.getMonth()+1}월 ${weekNum}주차`;

  // 주간형 리포트(reportType==='weekly')는 리포트 문서 1개에 세션이 여러 개 들어있어서,
  // "리포트 문서 1개 = 세션 1개"를 전제로 한 이 카드의 집계가 그대로는 안 맞음(수업 횟수/출석률이
  // 실제보다 훨씬 낮게 나옴) — 주간 리포트만 sessions[]를 이번 주 범위로 골라 세션 단위 행으로
  // 펼쳐서 나머지 집계 로직(avg/attendRate/단원/오답유형)이 평소 리포트처럼 그대로 처리하게 함
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];
  const weekReports = reports
    .filter(r => r.studentId === student?.id && (
      r.reportType === 'weekly'
        ? (r.sessions || []).some(s => s.date >= weekStartStr && s.date <= weekEndStr)
        : r.createdAt?.seconds * 1000 >= weekStart.getTime()
    ))
    .flatMap(r => r.reportType === 'weekly'
      ? (r.sessions || [])
          .filter(s => s.date >= weekStartStr && s.date <= weekEndStr)
          .map(s => ({
            ...s,
            studentId: r.studentId,
            teacherName: r.teacherName,
            createdAt: { seconds: Math.floor(new Date(`${s.date}T00:00:00+09:00`).getTime() / 1000) },
            id: `${r.id}-${s.date}`,
          }))
      : [r]
    )
    .sort((a, b) => (a.createdAt?.seconds||0) - (b.createdAt?.seconds||0));

  const avg = (key) => {
    const rated = weekReports.filter(r => r[key] != null);
    return rated.length
      ? Math.round(rated.reduce((s, r) => s + toPct(r[key]), 0) / rated.length)
      : '—';
  };

  // 분모는 attendance가 기재된 리포트만 — 이 파일의 다른 두 출석률(StudentProfileContent/
  // StudentDetailPanel)과 GrowthStory가 이미 이 규칙이라 여기만 전체-분모였음(2026-08-05 통일)
  const attendRated = weekReports.filter(r => r.attendance != null).length;
  const attendRate = attendRated
    ? Math.round(weekReports.filter(r => r.attendance === '정시').length / attendRated * 100)
    : 0;

  // 단원별 집계 — resolveUnitGroup(공용 주 단원 판정)으로 통일(2026-08-05). 예전엔 이름
  // 매칭(findUnitKey)만 써서 "2~3단원"처럼 번호만 적은 표기가 원문째 별개 그룹이 됐고,
  // 같은 학생의 단원 묶음이 성장 포트폴리오와 다르게 보였음.
  const unitMap = {};
  weekReports.forEach(r => {
    const group = resolveUnitGroup(r);
    if (!group) return;
    if (!unitMap[group.key]) unitMap[group.key] = { name: group.label, scores: [], teacher: r.teacherName };
    if (r.hasTest && r.testScore) unitMap[group.key].scores.push(Number(r.testScore));
  });
  const units = Object.values(unitMap);

  // 오답 유형 집계
  const diagMap = {};
  weekReports.forEach(r => (r.diagnosis||[]).forEach(d => {
    if (d.key === 'perfect') return;
    if (!diagMap[d.key]) diagMap[d.key] = { key: d.key, count: 0 };
    diagMap[d.key].count++;
  }));
  const DIAG = DIAG_SOFT;
  const diagList = Object.values(diagMap).sort((a,b) => b.count - a.count).slice(0, 3);

  // 선생님 코멘트 — 가장 최근
  const lastNote = [...weekReports].reverse().find(r => r.teacherNote)?.teacherNote || '';
  const teacherName = weekReports[weekReports.length-1]?.teacherName || '';

  // 다음 주 계획
  const nextPlan = [...weekReports].reverse().find(r => r.nextPlan)?.nextPlan || '';

  const handleCopy = () => {
    const url = `${window.location.origin}/story/${student?.id}?src=weekly`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!student) return null;

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: '16px', overflow: 'hidden', maxWidth: '420px', margin: '0 auto', fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}>

      {/* 헤더 */}
      <div style={{ background: '#0D2D6B', padding: '20px 22px 18px' }}>
        <div style={{ width: '32px', height: '3px', background: '#C9A227', borderRadius: '2px', marginBottom: '12px' }} />
        <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em', margin: '0 0 3px' }}>
          {weekLabel} · {fmt(weekStart)} ~ {fmt(weekEnd)}
        </p>
        <p style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0 }}>{student.name} 학생 주간 리포트</p>
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', margin: '4px 0 0' }}>{academyName || '데일리 리포트 시스템'}</p>
      </div>

      {weekReports.length === 0 ? (
        <div style={{ padding: '40px 22px', textAlign: 'center', color: T.textMute, fontSize: '13px' }}>
          이번 주 수업 기록이 없습니다
        </div>
      ) : (
        <>
          {/* 핵심 수치 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '0.5px solid #E5E7EB' }}>
            {[
              { label: '수업 횟수', value: `${weekReports.length}회`, color: '#0D2D6B' },
              { label: '과제 평균', value: `${avg('homeworkRating')}%`, color: '#0D2D6B' },
              { label: '출석률', value: `${attendRate}%`, color: attendRate === 100 ? C.successDark : C.warningText },
            ].map((s, i) => (
              <div key={i} style={{ padding: '14px 12px', textAlign: 'center', borderRight: i < 2 ? '0.5px solid #E5E7EB' : 'none' }}>
                <p style={{ fontSize: '10px', color: T.textMute, margin: '0 0 4px', fontWeight: 500 }}>{s.label}</p>
                <p style={{ fontSize: '20px', fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* 이번 주 학습 단원 */}
          {units.length > 0 && (
            <div style={{ padding: '16px 22px', borderBottom: '0.5px solid #E5E7EB' }}>
              <p style={{ fontSize: '10px', color: T.textMute, fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 10px' }}>이번 주 학습 단원</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {units.map((u, i) => {
                  const avgScore = u.scores.length ? Math.round(u.scores.reduce((a,b)=>a+b,0)/u.scores.length) : null;
                  const achieved = avgScore != null && avgScore >= 80;
                  const barColor = achieved ? C.successDark : avgScore != null ? C.warningText : '#0D2D6B';
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '3px', height: '34px', background: barColor, borderRadius: '2px', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#1A1A1A', margin: '0 0 1px' }}>{u.name}</p>
                        {avgScore != null && <p style={{ fontSize: '11px', color: T.textMute, margin: 0 }}>{avgScore}점</p>}
                      </div>
                      {avgScore != null && (
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '8px', background: achieved ? C.successBg : C.warningBg, color: achieved ? C.successDark : C.warningText, flexShrink: 0 }}>
                          {achieved ? '✓ 목표달성' : '점검 필요'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* 배지만 봐서는 "뭘 점검하라는 건지" 알 수 없다는 피드백 — 기준(80점)을
                  한 줄로 밝혀줌. 이 카드는 카카오톡/링크로 학부모에게도 공유되므로 문구를
                  쉽게 풀어씀. */}
              <p style={{ fontSize: '10px', color: T.textMute, margin: '10px 0 0', lineHeight: 1.5 }}>
                이번 주 평균 80점을 기준으로 그 이상이면 "목표달성", 미만이면 "점검 필요"로 표시돼요
              </p>
            </div>
          )}

          {/* 집중 포인트 */}
          {diagList.length > 0 && (
            <div style={{ padding: '14px 22px', borderBottom: '0.5px solid #E5E7EB' }}>
              <p style={{ fontSize: '10px', color: T.textMute, fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 8px' }}>이번 주 집중 포인트</p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {diagList.map(d => {
                  const info = DIAG[d.key] || { label: d.key, color: '#4A4A4A', bg: '#F3F4F6' };
                  return (
                    <span key={d.key} style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '12px', background: info.bg, color: info.color }}>
                      {info.label} {d.count}회
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* 선생님 한마디 */}
          {lastNote && (
            <div style={{ padding: '16px 22px', borderBottom: '0.5px solid #E5E7EB', background: '#FAFAF8' }}>
              <p style={{ fontSize: '10px', color: T.textMute, fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 8px' }}>선생님 한마디</p>
              <p style={{ fontSize: '12px', color: '#1A1A1A', lineHeight: 1.8, margin: 0 }}>
                {lastNote}
              </p>
              {teacherName && <p style={{ fontSize: '10px', color: T.textMute, margin: '8px 0 0', textAlign: 'right' }}>— {teacherName}</p>}
            </div>
          )}

          {/* 다음 주 예고 */}
          {nextPlan && (
            <div style={{ padding: '12px 22px', borderBottom: '0.5px solid #E5E7EB' }}>
              <p style={{ fontSize: '10px', color: T.textMute, fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 4px' }}>다음 주 학습 예정</p>
              <p style={{ fontSize: '12px', color: '#1A1A1A', margin: 0 }}>{nextPlan}</p>
            </div>
          )}

          {/* 공유 버튼 */}
          <div style={{ padding: '14px 22px', display: 'flex', gap: '8px' }}>
            <button onClick={handleCopy}
              style={{ flex: 1, background: '#FEE500', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '12px', fontWeight: 700, color: '#3A1D1D', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1C3.96 1 1.5 3.13 1.5 5.75c0 1.64.91 3.09 2.33 4.01l-.52 1.94 2.3-1.2c.42.08.85.12 1.39.12 3.04 0 5.5-2.13 5.5-4.75S10.04 1 7 1z" fill="#3A1D1D"/></svg>
              {copied ? '복사 완료!' : '카카오톡 공유'}
            </button>
            <button onClick={handleCopy}
              style={{ flex: 1, background: '#F9FAFB', border: '0.5px solid #E5E7EB', borderRadius: '8px', padding: '11px', fontSize: '12px', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
              링크 복사
            </button>
          </div>
        </>
      )}
    </div>
  );
}
