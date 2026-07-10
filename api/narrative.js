// Vercel Serverless — AI 서사 자동 생성 (Gemini Flash)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentName, milestones, unitScores, teacherNotes } = req.body;

  const prompt = `당신은 20년 경력의 교육 전문가입니다. 아래 학생 데이터를 바탕으로 학부모에게 전달할 성장 스토리를 작성하세요.

학생명: ${studentName}
성장 마일스톤:
${milestones.map((m, i) => `PHASE ${i+1}: ${m.date} — ${m.title}`).join('\n')}
단원별 점수:
${unitScores.length > 0 ? unitScores.map(u => `${u.unit}: ${u.scores.map(s => `${s.round || ''} ${s.score}점`).join(' → ')}`).join('\n') : '데이터 없음'}
${teacherNotes?.length > 0 ? `\n선생님 코멘트:\n${teacherNotes.slice(-3).join('\n')}` : ''}

아래 JSON 형식으로만 반환하세요 (마크다운, 코드블록 없이 순수 JSON만):
{
  "chapter1": "성장의 출발점 서사 — 2~3문장, 따뜻하고 구체적으로, 사람 냄새 나는 문체",
  "chapter2": "결정적 전환점 서사 — 2~3문장, 인지적 변화 중심, 판단 기준 수립 과정",
  "teacherWord": "선생님 한마디 — 1~2문장, 핵심 성장 포인트, 진심이 담긴 문장",
  "nextChapter": "앞으로의 여정 — 2문장, 구체적 목표 포함"
}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data });

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
