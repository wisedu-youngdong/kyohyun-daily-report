// Vercel Serverless — AI 서사 자동 생성 (Gemini Flash)
export const maxDuration = 30; // Vercel 타임아웃 30초

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentName, milestones, unitScores, teacherNotes } = req.body;

  const prompt = `교육 전문가로서 아래 학생의 성장 스토리를 학부모에게 전달할 JSON으로 작성하세요.

학생: ${studentName}
마일스톤: ${milestones.map((m,i) => `${i+1}. ${m.date} ${m.title}`).join(' / ')}
점수: ${unitScores.length > 0 ? unitScores.map(u => `${u.unit} ${u.scores.map(s=>`${s.score}점`).join('→')}`).join(', ') : '없음'}
코멘트: ${teacherNotes?.slice(-2).join(' | ') || '없음'}

JSON만 반환 (다른 텍스트 없이):
{"chapter1":"출발점 서사 2문장","chapter2":"전환점 서사 2문장","teacherWord":"선생님 한마디","nextChapter":"다음 목표 1문장"}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data?.error?.message || 'Gemini 오류' });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'JSON 없음: ' + text.slice(0, 100) });
    }
    const parsed = JSON.parse(jsonMatch[0]);
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
