// Vercel Serverless — AI 서사 자동 생성
export const maxDuration = 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
톤: 따뜻하고 격려하는 — 적응 과정과 첫 성취의 의미에 집중.
데이터: ${phaseText}. ${scoreText}. 선생님 메모: ${lastNote.slice(0, 120)}
chapter1(출발점): 처음 시작하는 아이의 낯섦과 의지를 2문장으로. AI냄새 나는 표현(인상적/훌륭/대단) 금지.
chapter2(가능성): 첫 성취가 갖는 의미와 앞으로의 가능성을 2문장으로. 과장 없이 담담하게.
teacherWord: 선생님이 직접 쓴 듯한 따뜻한 한마디. 1~2문장.
nextChapter: 다음 목표 1문장. 구체적인 단원명 포함.
JSON만 반환 (코드블록 없이, 순수 JSON만): {"chapter1":"...","chapter2":"...","teacherWord":"...","nextChapter":"..."}`

    : `학생 ${studentName}의 성장 스토리를 JSON으로 작성. 한국어. 수업 ${totalReports}회 재학생.
톤: 데이터 기반 통찰 — 약점 극복과 사고력 고도화에 집중. 거시적 평가.
데이터: ${phaseText}. ${scoreText}. 선생님 메모: ${allNotes.slice(0, 200)}
chapter1(도전의 시작): 이 학생이 맞서온 구체적인 약점과 극복 의지를 2문장으로. "첫 수업" 언급 금지. AI냄새 금지.
chapter2(전략 완성): 과거 대비 성장을 데이터로 증명하며 사고력이 어떻게 달라졌는지 2문장으로. 구체적 수치 포함 권장.
teacherWord: 20년 경력 선생님의 통찰 — 이 학생의 고집과 노력이 담긴 한마디. 가벼운 칭찬 금지. 1~2문장.
nextChapter: 다음 극복 과제 1문장. 구체적인 단원명/유형 포함.
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
          maxOutputTokens: 4096,
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

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // fallback — 필드 개별 추출 시도
      const fallback = {};
      ['chapter1','chapter2','teacherWord','nextChapter'].forEach(key => {
        const m = cleaned.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, 's'));
        if (m) fallback[key] = m[1];
      });
      if (Object.keys(fallback).length > 0) return res.status(200).json(fallback);
      return res.status(500).json({ error: 'JSON 없음: ' + cleaned.slice(0, 150) });
    }

    try {
      res.status(200).json(JSON.parse(jsonMatch[0]));
    } catch (parseErr) {
      // JSON이 잘렸을 경우 — 가능한 필드만 추출
      const fallback = {};
      ['chapter1','chapter2','teacherWord','nextChapter'].forEach(key => {
        const m = cleaned.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, 's'));
        if (m) fallback[key] = m[1];
      });
      if (Object.keys(fallback).length > 0) {
        res.status(200).json(fallback);
      } else {
        res.status(500).json({ error: 'JSON 파싱 실패: ' + parseErr.message });
      }
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
