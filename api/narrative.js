// Vercel Serverless — AI 서사 자동 생성
// 두 가지 모드: (1) 전체 생성 — 4개 항목을 하나의 이야기 흐름으로 한 번에,
// (2) 항목별 재생성(field 지정) — 사용자가 직접 다듬은 다른 항목들의 문체를 참고해 그 항목만 다시 씀
import { verifyIdTokenHeader } from './_lib/verifyAuth.js';

export const maxDuration = 30;

const REQUIRED_FIELDS = ['chapter1', 'chapter2', 'teacherWord', 'nextChapter'];

// 항목별 작성 규칙 — 전체 생성 프롬프트와 항목별 재생성 프롬프트가 같은 규칙을 공유
// (여기만 고치면 두 모드에 동시 반영)
const FIELD_RULES = {
  newStudent: {
    chapter1: 'chapter1(출발점): 위 데이터에 나온 실제 단원명을 1회 이상 그대로 인용해, 처음 시작하는 아이의 낯섦과 의지를 2문장으로. AI냄새 나는 표현(인상적/훌륭/대단) 금지.',
    chapter2: 'chapter2(가능성): 위 데이터에 나온 가장 최근 단원명과 점수를 반드시 함께 인용해, 첫 성취가 갖는 의미와 앞으로의 가능성을 2문장으로. 과장 없이 담담하게.',
    teacherWord: 'teacherWord: 반드시 이 순서로 — ① 위 데이터에 나온 구체적 수치·단원명을 최소 1개 인용해 실제로 있었던 변화를 짚고 ② 그 변화가 뭘 뜻하는지 담담히 해석. "고집"/"끈기"/"집요함" 같은 성격 형용사는 그 자체로 쓰지 말 것 — 정 필요하면 방금 인용한 구체적 장면 바로 뒤에만("OO단원을 몇 번이고 다시 풀어본 데서 보이듯" 식으로) 붙일 것. 막연한 칭찬 금지. 1~2문장.',
    nextChapter: 'nextChapter: 다음 목표 1문장. 위 데이터에 나온 실제 단원명 포함.',
  },
  returning: {
    chapter1: 'chapter1(도전의 시작): 위 데이터에서 이 학생이 처음 맞섰던 실제 단원명을 1회 이상 그대로 인용해, 그 단원에서 맞서온 구체적인 약점과 극복 의지를 2문장으로. "첫 수업" 언급 금지. AI냄새 금지.',
    chapter2: 'chapter2(전략 완성): 이 학생의 초기 약점 단원을 언급하며, 그 약점이 어떤 논리적 훈련을 거쳐 위 데이터의 가장 최근 단원(실제 단원명·점수 인용)의 성취로 이어졌는지 인과관계를 담아 2문장으로. 두 단원명이 반드시 서로 달라야 함.',
    teacherWord: 'teacherWord: 반드시 이 구조를 따를 것 — "[수업 기간/횟수] 동안 [구체적 지표: 단원명·정답률·점수 등]가 [구체적 수치]로 변화했다 → [그 변화가 의미하는 것] → [그래서 앞으로 이렇게 지도하겠다]". 위 데이터에 나온 실제 수치·단원명을 최소 2개 인용. "고집"/"끈기"/"집요함" 같은 성격 형용사는 그 자체로 쓰지 말 것 — 정 필요하면 방금 인용한 구체적 수치 바로 뒤에만("OO단원 정답률이 X%에서 Y%로 오른 데서 보이듯" 식으로) 붙일 것. 20년 경력 선생님의 통찰처럼 담담하고 구체적으로. 가벼운 칭찬 금지. 2~3문장.',
    nextChapter: 'nextChapter: 다음 극복 과제 1문장. 위 데이터에 나온 실제 단원명/유형 포함.',
  },
};

const STYLE_RULE = '문체: 모든 문장은 반드시 "-습니다/했습니다/입니다"체(존댓말, 학부모 대상 보고서 어투)로 끝낼 것. "-다/했다/이다"로 끝나는 문어체·논문체 절대 금지.';
const DATA_RULE = '[중요] 아래 "데이터"에 실제로 나온 단원명·점수·회차만 인용할 것. 데이터에 없는 단원명이나 수치를 절대 지어내지 말 것.';

async function callGemini(prompt, maxOutputTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // 학부모 열람(GET student)과 달리 이건 Gemini 호출 + narrative 필드 쓰기를 트리거하는
  // 액션이라 로그인 필수 — analyze-photo.js/polish.js와 동일한 기준
  if (!(await verifyIdTokenHeader(req))) return res.status(401).json({ error: '로그인이 필요합니다.' });

  const { studentName, milestones, unitScores, teacherNotes, isNewStudent, totalReports, field, currentNarrative } = req.body;

  // 핵심 데이터만 추출
  const lastNote = teacherNotes?.slice(-1)[0] || '';
  const allNotes = teacherNotes?.slice(-3).join(' / ') || '';
  const scoreText = unitScores.length > 0
    ? unitScores.map(u => `${u.unit} ${u.scores.map(s => s.score + '점').join('→')}`).join(', ')
    : '';
  const phaseText = milestones.map(m => m.title).join(' → ');
  const rules = isNewStudent ? FIELD_RULES.newStudent : FIELD_RULES.returning;
  const dataLine = isNewStudent
    ? `데이터: ${phaseText}. ${scoreText}. 선생님 메모: ${lastNote.slice(0, 120)}`
    : `데이터: ${phaseText}. ${scoreText}. 선생님 메모: ${allNotes.slice(0, 200)}`;
  const headline = isNewStudent
    ? `수업 ${totalReports}회 신규생.\n톤: 따뜻하고 격려하는 — 적응 과정과 첫 성취의 의미에 집중.`
    : `수업 ${totalReports}회 재학생.\n톤: 데이터 기반 통찰 — 약점 극복과 사고력 고도화에 집중. 거시적 평가.`;

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
${rules.chapter1}
${rules.chapter2}
${rules.teacherWord}
${rules.nextChapter}
JSON만 반환 (코드블록 없이, 순수 JSON만): {"chapter1":"...","chapter2":"...","teacherWord":"...","nextChapter":"..."}`;

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
    const isComplete = (obj) => REQUIRED_FIELDS.every(k => obj[k]);

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
