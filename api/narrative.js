// Vercel Serverless — AI 서사 자동 생성
import { verifyIdTokenHeader } from './_lib/verifyAuth.js';

export const maxDuration = 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // 학부모 열람(GET student)과 달리 이건 Gemini 호출 + narrative 필드 쓰기를 트리거하는
  // 액션이라 로그인 필수 — analyze-photo.js/polish.js와 동일한 기준
  if (!(await verifyIdTokenHeader(req))) return res.status(401).json({ error: '로그인이 필요합니다.' });

  const { studentName, milestones, unitScores, teacherNotes, isNewStudent, totalReports } = req.body;

  // 핵심 데이터만 추출
  const lastNote = teacherNotes?.slice(-1)[0] || '';
  const allNotes = teacherNotes?.slice(-3).join(' / ') || '';
  const scoreText = unitScores.length > 0
    ? unitScores.map(u => `${u.unit} ${u.scores.map(s => s.score + '점').join('→')}`).join(', ')
    : '';
  const phaseText = milestones.map(m => m.title).join(' → ');

  const prompt = isNewStudent
    ? `학생 ${studentName}의 성장 스토리를 JSON으로 작성. 한국어. 수업 ${totalReports}회 신규생.
문체: 모든 문장은 반드시 "-습니다/했습니다/입니다"체(존댓말, 학부모 대상 보고서 어투)로 끝낼 것. "-다/했다/이다"로 끝나는 문어체·논문체 절대 금지.
톤: 따뜻하고 격려하는 — 적응 과정과 첫 성취의 의미에 집중.
데이터: ${phaseText}. ${scoreText}. 선생님 메모: ${lastNote.slice(0, 120)}
[중요] 아래 "데이터"에 실제로 나온 단원명·점수·회차만 인용할 것. 데이터에 없는 단원명이나 수치를 절대 지어내지 말 것.
chapter1(출발점): 위 데이터에 나온 실제 단원명을 1회 이상 그대로 인용해, 처음 시작하는 아이의 낯섦과 의지를 2문장으로. AI냄새 나는 표현(인상적/훌륭/대단) 금지.
chapter2(가능성): 위 데이터에 나온 가장 최근 단원명과 점수를 반드시 함께 인용해, 첫 성취가 갖는 의미와 앞으로의 가능성을 2문장으로. 과장 없이 담담하게.
teacherWord: 반드시 이 순서로 — ① 위 데이터에 나온 구체적 수치·단원명을 최소 1개 인용해 실제로 있었던 변화를 짚고 ② 그 변화가 뭘 뜻하는지 담담히 해석. "고집"/"끈기"/"집요함" 같은 성격 형용사는 그 자체로 쓰지 말 것 — 정 필요하면 방금 인용한 구체적 장면 바로 뒤에만("OO단원을 몇 번이고 다시 풀어본 데서 보이듯" 식으로) 붙일 것. 막연한 칭찬 금지. 1~2문장.
nextChapter: 다음 목표 1문장. 위 데이터에 나온 실제 단원명 포함.
JSON만 반환 (코드블록 없이, 순수 JSON만): {"chapter1":"...","chapter2":"...","teacherWord":"...","nextChapter":"..."}`

    : `학생 ${studentName}의 성장 스토리를 JSON으로 작성. 한국어. 수업 ${totalReports}회 재학생.
문체: 모든 문장은 반드시 "-습니다/했습니다/입니다"체(존댓말, 학부모 대상 보고서 어투)로 끝낼 것. "-다/했다/이다"로 끝나는 문어체·논문체 절대 금지.
톤: 데이터 기반 통찰 — 약점 극복과 사고력 고도화에 집중. 거시적 평가.
데이터: ${phaseText}. ${scoreText}. 선생님 메모: ${allNotes.slice(0, 200)}
[중요] 아래 "데이터"에 실제로 나온 단원명·점수만 인용할 것. 데이터에 없는 단원명이나 수치를 절대 지어내지 말 것.
chapter1(도전의 시작): 위 데이터에서 이 학생이 처음 맞섰던 실제 단원명을 1회 이상 그대로 인용해, 그 단원에서 맞서온 구체적인 약점과 극복 의지를 2문장으로. "첫 수업" 언급 금지. AI냄새 금지.
chapter2(전략 완성): chapter1에서 언급한 초기 약점 단원을 다시 언급하며, 그 약점이 어떤 논리적 훈련을 거쳐 위 데이터의 가장 최근 단원(실제 단원명·점수 인용)의 성취로 이어졌는지 인과관계를 담아 2문장으로. 두 단원명이 반드시 서로 달라야 함.
teacherWord: 반드시 이 구조를 따를 것 — "[수업 기간/횟수] 동안 [구체적 지표: 단원명·정답률·점수 등]가 [구체적 수치]로 변화했다 → [그 변화가 의미하는 것] → [그래서 앞으로 이렇게 지도하겠다]". 위 데이터에 나온 실제 수치·단원명을 최소 2개 인용. "고집"/"끈기"/"집요함" 같은 성격 형용사는 그 자체로 쓰지 말 것 — 정 필요하면 방금 인용한 구체적 수치 바로 뒤에만("OO단원 정답률이 X%에서 Y%로 오른 데서 보이듯" 식으로) 붙일 것. 20년 경력 선생님의 통찰처럼 담담하고 구체적으로. 가벼운 칭찬 금지. 2~3문장.
nextChapter: 다음 극복 과제 1문장. 위 데이터에 나온 실제 단원명/유형 포함.
JSON만 반환 (코드블록 없이, 순수 JSON만): {"chapter1":"...","chapter2":"...","teacherWord":"...","nextChapter":"..."}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
        }
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data?.error?.message || 'API 오류' });

    // thinking 모드 대응 — parts 중 text 타입만 추출
    const parts = data.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find(p => p.text && !p.thought);
    const text = textPart?.text || parts.map(p => p.text || '').join('');

    if (!text) return res.status(500).json({ error: '응답 없음' });

    // 마크다운 코드블록 제거 후 JSON 추출
    const cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // 필드 일부만 와도(응답이 잘린 경우) 조용히 성공 처리하지 않도록, 4개 필드가 모두
    // 있어야만 200을 반환 — 하나라도 비면 폴백 문구가 사용자 모르게 노출되는 것을 방지
    const REQUIRED_FIELDS = ['chapter1', 'chapter2', 'teacherWord', 'nextChapter'];
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
