// Vercel Serverless — AI 서사 자동 생성
// 두 가지 모드: (1) 전체 생성 — 4개 항목을 하나의 이야기 흐름으로 한 번에,
// (2) 항목별 재생성(field 지정) — 사용자가 직접 다듬은 다른 항목들의 문체를 참고해 그 항목만 다시 씀
import { verifyIdTokenHeader } from './_lib/verifyAuth.js';

export const maxDuration = 30;

// 2026-08-03 재편: 마일스톤 카드(chapter1/chapter2)를 폐기하고 성장 포트폴리오 1페이지
// "한 달의 결론"(monthConclusion) 하나로 교체 — 3페이지 수업 기록(세션 피드 + 표시점)이
// chapter1/chapter2가 하던 "의미 있는 순간 짚기" 역할을 대신한다. 기존 문서에 남아있는
// chapter1/chapter2 값은 그대로 두되(마이그레이션 불필요, 어차피 화면에서 안 읽음) 새로
// 생성하지는 않는다.
const REQUIRED_FIELDS = ['monthConclusion', 'teacherWord', 'nextChapter'];

// 항목별 작성 규칙 — 전체 생성 프롬프트와 항목별 재생성 프롬프트가 같은 규칙을 공유
// (여기만 고치면 두 모드에 동시 반영)
const FIELD_RULES = {
  newStudent: {
    monthConclusion: 'monthConclusion(한 달의 결론): 위 데이터 중 가장 눈에 띄는 성취나 변화 딱 하나만 골라, 그 하나의 이야기를 자연스러운 문장으로 풀어 쓸 것(예: "OO단원에서 처음으로 만점을 받았습니다" 식). 서로 다른 단원·점수를 쉼표로 나열하며 이어 붙이지 말 것 — 데이터 원문(예: "OO단원 46점, XX단원 60점")을 그대로 옮기면 안 되고, 반드시 하나의 완결된 문장으로 재구성할 것. 처음 시작하는 아이라는 점을 감안해 적응 과정의 의미를 담되, AI냄새 나는 표현(인상적/훌륭/대단) 금지. 1~2문장.',
    teacherWord: 'teacherWord: 반드시 이 순서로 — ① 위 데이터에 나온 구체적 수치·단원명을 최소 1개 인용해 실제로 있었던 변화를 짚고 ② 그 변화가 뭘 뜻하는지 담담히 해석. "고집"/"끈기"/"집요함" 같은 성격 형용사는 그 자체로 쓰지 말 것 — 정 필요하면 방금 인용한 구체적 장면 바로 뒤에만("OO단원을 몇 번이고 다시 풀어본 데서 보이듯" 식으로) 붙일 것. 막연한 칭찬 금지. 1~2문장.',
    nextChapter: 'nextChapter: 다음 목표 1문장. 위 데이터에 나온 실제 단원명 포함.',
  },
  returning: {
    monthConclusion: 'monthConclusion(한 달의 결론): 위 데이터 중 초기 대비 최근 수치 변화(오답 개수·점수·정답률 등)가 가장 뚜렷한 것 딱 하나만 골라, 그 하나의 변화를 자연스러운 문장으로 풀어 쓸 것(예: "OO단원 오답이 N개에서 M개로 줄었습니다" 식). 서로 다른 단원·시험 점수를 쉼표로 나열하며 이어 붙이지 말 것 — 데이터 원문(예: "OO단원 46점, XX단원 60점")을 그대로 옮기면 안 되고, 반드시 하나의 완결된 문장으로 재구성할 것. "논리적 훈련", "사고력 고도화" 같은 추상적 해석 금지 — 관찰된 수치 변화만. 1~2문장.',
    teacherWord: 'teacherWord: 반드시 이 순서로 자연스러운 문장을 이어 쓸 것(순서 설명이지 그대로 옮겨 적을 서식이 아님 — 대괄호나 화살표 같은 구조 기호는 절대 출력하지 말 것) — 먼저 그동안 다뤄온 단원의 흐름을 짚고(수업 횟수·기간은 언급하지 말 것 — 아래 참고), 그 동안 구체적 지표(단원명·정답률·점수 등)가 어떤 수치로 변화했는지 짚은 뒤, 그 변화가 학부모 입장에서 뭘 의미하는지 담담히 해석하고, 마지막으로 앞으로 어떻게 지도할지 이어 쓸 것. 위 데이터에 나온 실제 수치·단원명을 최소 2개 인용. "고집"/"끈기"/"집요함" 같은 성격 형용사는 그 자체로 쓰지 말 것 — 정 필요하면 방금 인용한 구체적 수치 바로 뒤에만("OO단원 정답률이 X%에서 Y%로 오른 데서 보이듯" 식으로) 붙일 것. 담담하고 구체적으로, 가벼운 칭찬 금지. 2~3문장.',
    nextChapter: 'nextChapter: 다음 극복 과제 1문장. 위 데이터에 나온 실제 단원명/유형 포함.',
  },
};

const STYLE_RULE = '문체: 모든 문장은 반드시 "-습니다/했습니다/입니다"체(존댓말, 학부모 대상 보고서 어투)로 끝낼 것. "-다/했다/이다"로 끝나는 문어체·논문체 절대 금지.';
const DATA_RULE = '[중요] 아래 "데이터"에 실제로 나온 단원명·점수·회차만 인용할 것. 데이터에 없는 단원명이나 수치를 절대 지어내지 말 것.';
// 근거가 "숙제 채점 사진 확인 + 오답 개수/점수 기록"뿐인데 "사고력 고도화", "문제 해결 체계 완성",
// "증명합니다" 같은 거창한 결론을 내면 실제 자료와 안 맞아 보임(실사용 피드백으로 발견) — 관찰된
// 수치 변화만 담백하게 서술하도록 강제. newStudent 규칙은 이미 "과장 없이 담담하게"가 있지만
// returning 쪽이 특히 취약해서(예전 헤드라인이 "사고력 고도화에 집중"을 직접 지시했음) 공통 규칙으로 못박음
const NO_HYPE_RULE = '[중요] "사고력이 고도화됐다", "문제 해결 체계를 완성했다", "증명합니다" 같은 추상적이고 거창한 결론 금지. 근거는 숙제·시험 채점 기록(오답 개수, 점수)뿐이므로 그 수치 변화만으로 담백하게 서술할 것.';
// 이 서사는 생성 후 학생 문서에 캐싱돼 다음 수업이 쌓여도 자동으로 안 바뀐다. "총 15회
// 수업" 같은 누적 총 횟수를 문장에 박으면, 그 뒤로 수업이 계속 쌓이면서 이 문장만 옛 숫자로
// 남아 화면 상단의 실시간 횟수(header)와 어긋나 학부모가 리포트 전체를 의심하게 된다(실사용
// 발견, 2026-08-03). 특정 단원·점수처럼 그 자체로 고정된 과거 사실은 계속 인용해도 되지만,
// "지금까지 총 N회"처럼 계속 늘어나는 누적치는 인용 금지.
const NO_RUNNING_TOTAL_RULE = '[중요] "총 15회 수업", "지금까지 11번" 같은 누적 총 수업 횟수는 절대 인용하지 말 것 — 이후 수업이 계속 쌓이면서 이 문장만 옛날 숫자로 남아 화면 상단의 실시간 횟수와 어긋난다. 특정 단원명·점수·날짜처럼 그 자체로 고정된 사실만 인용하고, 전체 누적 회차는 언급하지 말 것.';

async function callGemini(prompt, maxOutputTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens },
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'API 오류');
  // thinking 모드 대응 — parts 중 text 타입만 추출
  const parts = data.candidates?.[0]?.content?.parts || [];
  const textPart = parts.find(p => p.text && !p.thought);
  const text = textPart?.text || parts.map(p => p.text || '').join('');
  if (!text) throw new Error('응답 없음');
  return text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
}

// FIELD_RULES 프롬프트가 구조 설명용으로 "[구체적 지표]" 같은 대괄호 placeholder를 예시로 쓰다 보니,
// 모델이 가끔 그 대괄호 서식을 그대로 옮겨 적어서 학부모 화면에 "[...]"가 그대로 노출된 적 있음.
// 프롬프트에서 대괄호 예시를 없앴지만, 재발 방지용으로 최종 응답에도 남아있는지 방어적으로 확인.
function hasLeakedPlaceholder(text) {
  return /\[[^[\]]{2,30}\]/.test(String(text || ''));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // 학부모 열람(GET student)과 달리 이건 Gemini 호출 + narrative 필드 쓰기를 트리거하는
  // 액션이라 로그인 필수 — analyze-photo.js/polish.js와 동일한 기준
  if (!(await verifyIdTokenHeader(req))) return res.status(401).json({ error: '로그인이 필요합니다.' });

  const { studentName, unitScores = [], teacherNotes, isNewStudent, totalReports, field, currentNarrative, type } = req.body;

  // ── 모드 3: 기간 요약(성장 포트폴리오 "학습 기록 상세") — 그 기간 teacherNote 전체를
  // 2~3문장으로 압축. 공개 페이지에서 열람마다 자동 생성하면 비용/지연이 새므로 원장이
  // 누를 때만 호출되고, 결과는 클라이언트가 학생 문서에 캐싱함(이 엔드포인트는 생성만 담당) ──
  if (type === 'monthlySummary') {
    const notes = (teacherNotes || []).filter(n => n && String(n).trim());
    if (notes.length === 0) return res.status(400).json({ error: '요약할 학습 기록이 없습니다.' });
    const notesText = notes.map((n, i) => `${i + 1}. ${String(n).slice(0, 300)}`).join('\n');
    const prompt = `학생 ${studentName}의 이번 기간 학습 기록을 2~3문장으로 요약. 한국어.
${STYLE_RULE}
[이 기간 선생님이 남긴 코멘트 전체]
${notesText}
${DATA_RULE}
${NO_HYPE_RULE}
${NO_RUNNING_TOTAL_RULE}
[중요] 코멘트를 나열하지 말고, 어떤 개념·단원을 주로 다뤘는지·오답이 늘었는지 줄었는지 같은 흐름을 짚을 것.
[중요] 앞으로의 성적을 예측하거나 전망하는 문장은 절대 쓰지 말 것 — 이번 기간에 실제로 있었던 일만 쓸 것.
공백 포함 200자를 절대 넘기지 말 것.
JSON만 반환 (코드블록 없이, 순수 JSON만): {"text":"..."}`;

    try {
      const cleaned = await callGemini(prompt, 4096);
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      let text = null;
      if (jsonMatch) {
        try { text = JSON.parse(jsonMatch[0]).text || null; } catch { /* 아래 정규식 폴백 */ }
      }
      if (!text) {
        const m = cleaned.match(/"text"\s*:\s*"([^"]*)"/s);
        text = m?.[1] || null;
      }
      if (!text) {
        console.error('기간 요약 파싱 실패. 응답 앞 300자:', cleaned.slice(0, 300));
        return res.status(500).json({ error: '응답이 잘렸거나 형식이 맞지 않습니다. 다시 시도해주세요.' });
      }
      if (hasLeakedPlaceholder(text)) {
        console.error('기간 요약 대괄호 placeholder 누출:', text);
        return res.status(500).json({ error: '생성 결과에 형식 오류가 있습니다. 다시 시도해주세요.' });
      }
      if (text.length > 200) text = text.slice(0, 200).trim();
      return res.status(200).json({ text });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // 핵심 데이터만 추출
  const lastNote = teacherNotes?.slice(-1)[0] || '';
  const allNotes = teacherNotes?.slice(-3).join(' / ') || '';
  const scoreText = unitScores.length > 0
    ? unitScores.map(u => `${u.unit} ${u.scores.map(s => s.score + '점').join('→')}`).join(', ')
    : '';
  const rules = isNewStudent ? FIELD_RULES.newStudent : FIELD_RULES.returning;
  const dataLine = isNewStudent
    ? `데이터: ${scoreText}. 선생님 메모: ${lastNote.slice(0, 120)}`
    : `데이터: ${scoreText}. 선생님 메모: ${allNotes.slice(0, 200)}`;
  const headline = isNewStudent
    ? `수업 ${totalReports}회 신규생.\n톤: 따뜻하고 격려하는 — 적응 과정과 첫 성취의 의미에 집중.`
    : `수업 ${totalReports}회 재학생.\n톤: 담담하고 구체적 — 오답 개수·점수 등 실제 수치 변화에 집중. 거창한 해석 금지.`;

  // ── 모드 2: 항목별 재생성 — 다른 항목들(사용자가 직접 다듬었을 수 있음)의 문체를 따라 그 항목만 새로 ──
  if (field) {
    if (!REQUIRED_FIELDS.includes(field)) return res.status(400).json({ error: '알 수 없는 항목입니다.' });
    const others = REQUIRED_FIELDS
      .filter(k => k !== field && currentNarrative?.[k])
      .map(k => `- ${k}: ${String(currentNarrative[k]).slice(0, 300)}`)
      .join('\n');
    const prompt = `학생 ${studentName}의 성장 포트폴리오 중 "${field}" 항목 하나만 새로 작성. 한국어. ${headline}
${STYLE_RULE}
${dataLine}
${DATA_RULE}
${NO_HYPE_RULE}
${NO_RUNNING_TOTAL_RULE}
${others ? `현재 서사의 다른 항목들 (선생님이 직접 다듬었을 수 있음 — 이 글들의 문체·어조·호흡을 최대한 따라서 쓸 것):\n${others}` : ''}
${field} 작성 규칙: ${rules[field]}
JSON만 반환 (코드블록 없이, 순수 JSON만): {"text":"..."}`;

    try {
      // gemini-2.5는 thinking 토큰이 maxOutputTokens 예산을 먼저 소모함 — 2048로 줬더니
      // 생각만 하다 본문이 잘려 "응답이 잘렸거나..." 오류가 났음. 전체 생성과 동일하게 8192
      const cleaned = await callGemini(prompt, 8192);
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      let text = null;
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          // 프롬프트에 현재 서사를 필드명과 함께 보여주다 보니, 모델이 {"text":...} 대신
          // {"teacherWord":...}처럼 필드명을 키로 쓰는 경우가 있음 — 어느 쪽이든 수용하고,
          // 그래도 없으면 문자열 값이 딱 하나뿐인 응답은 그 값을 답으로 간주
          text = parsed.text || parsed[field] || null;
          if (!text) {
            const vals = Object.values(parsed).filter(v => typeof v === 'string' && v.trim());
            if (vals.length === 1) text = vals[0];
          }
        } catch { /* 아래 정규식 폴백 */ }
      }
      if (!text) {
        const m = cleaned.match(new RegExp(`"(?:text|${field})"\\s*:\\s*"([^"]*)"`, 's'));
        text = m?.[1] || null;
      }
      if (!text) {
        // Vercel 로그에서 원인을 볼 수 있게 실제 응답 앞부분을 남김
        console.error(`항목별 재생성(${field}) 파싱 실패. 응답 앞 300자:`, cleaned.slice(0, 300));
        return res.status(500).json({ error: '응답이 잘렸거나 형식이 맞지 않습니다. 다시 시도해주세요.' });
      }
      if (hasLeakedPlaceholder(text)) {
        console.error(`항목별 재생성(${field}) 대괄호 placeholder 누출:`, text);
        return res.status(500).json({ error: '생성 결과에 형식 오류가 있습니다. 다시 시도해주세요.' });
      }
      return res.status(200).json({ text });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── 모드 1: 전체 생성 — 4개 항목을 하나의 이야기 흐름으로 ──
  const prompt = `학생 ${studentName}의 성장 스토리를 JSON으로 작성. 한국어. ${headline}
${STYLE_RULE}
${dataLine}
${DATA_RULE}
${NO_HYPE_RULE}
${NO_RUNNING_TOTAL_RULE}
${rules.monthConclusion}
${rules.teacherWord}
${rules.nextChapter}
JSON만 반환 (코드블록 없이, 순수 JSON만): {"monthConclusion":"...","teacherWord":"...","nextChapter":"..."}`;

  try {
    const cleaned = await callGemini(prompt, 8192);

    // 필드 일부만 와도(응답이 잘린 경우) 조용히 성공 처리하지 않도록, 4개 필드가 모두
    // 있어야만 200을 반환 — 하나라도 비면 폴백 문구가 사용자 모르게 노출되는 것을 방지
    const extractFields = (str) => {
      const result = {};
      REQUIRED_FIELDS.forEach(key => {
        const m = str.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, 's'));
        if (m) result[key] = m[1];
      });
      return result;
    };
    const isComplete = (obj) => REQUIRED_FIELDS.every(k => obj[k] && !hasLeakedPlaceholder(obj[k]));

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const fallback = extractFields(cleaned);
      if (isComplete(fallback)) return res.status(200).json(fallback);
      return res.status(500).json({ error: '응답이 잘렸거나 형식이 맞지 않습니다. 다시 시도해주세요. (' + Object.keys(fallback).join(',') + '만 생성됨)' });
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!isComplete(parsed)) {
        return res.status(500).json({ error: '일부 항목이 비어서 생성됐습니다. 다시 시도해주세요. (' + Object.keys(parsed).filter(k => parsed[k]).join(',') + '만 생성됨)' });
      }
      res.status(200).json(parsed);
    } catch {
      // JSON이 잘렸을 경우 — 가능한 필드만 추출
      const fallback = extractFields(cleaned);
      if (isComplete(fallback)) {
        res.status(200).json(fallback);
      } else {
        res.status(500).json({ error: '응답이 잘렸습니다. 다시 시도해주세요. (' + Object.keys(fallback).join(',') + '만 생성됨)' });
      }
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
