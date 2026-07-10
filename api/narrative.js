// Vercel Serverless — AI 서사 자동 생성
export const maxDuration = 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentName, milestones, unitScores, teacherNotes } = req.body;

  // 핵심 데이터만 추출
  const lastNote = teacherNotes?.slice(-1)[0] || '';
  const scoreText = unitScores.length > 0
    ? unitScores.map(u => `${u.unit} ${u.scores.map(s => s.score + '점').join('→')}`).join(', ')
    : '';
  const phaseText = milestones.map((m, i) => `${m.title}`).join(' → ');

  const prompt = `학생 ${studentName}의 성장 스토리를 JSON으로 작성. 한국어. 따뜻하고 전문적인 톤.
데이터: ${phaseText}. ${scoreText}. 코멘트: ${lastNote.slice(0, 100)}
JSON만 반환:
{"chapter1":"출발점 2문장","chapter2":"전환점 2문장","teacherWord":"교사 한마디","nextChapter":"다음 목표 1문장"}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
          responseMimeType: 'application/json'
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

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'JSON 없음: ' + text.slice(0, 100) });

    res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
