// Vercel Serverless — AI 서사 자동 생성
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentName, milestones, unitScores, teacherNotes } = req.body;

  const prompt = `당신은 20년 경력의 교육 전문가입니다. 아래 학생 데이터를 바탕으로 학부모에게 전달할 성장 스토리를 작성하세요.

학생명: ${studentName}
성장 마일스톤:
${milestones.map((m, i) => `PHASE ${i+1}: ${m.date} — ${m.title}`).join('\n')}
단원별 점수:
${unitScores.map(u => `${u.unit}: ${u.scores.map(s => `${s.round || ''} ${s.score}점`).join(' → ')}`).join('\n')}
${teacherNotes?.length > 0 ? `\n선생님 코멘트 (최근 3개):\n${teacherNotes.slice(-3).join('\n')}` : ''}

아래 JSON 형식으로만 반환하세요 (마크다운 없이):
{
  "chapter1": "성장의 출발점 — 2~3문장, 따뜻하고 구체적으로, 사람 냄새 나는 문체",
  "chapter2": "결정적 전환점 — 2~3문장, 인지적 변화 중심, 판단 기준 수립 과정",
  "teacherWord": "선생님 한마디 — 1~2문장, 핵심 성장 포인트, 진심이 담긴 문장",
  "nextChapter": "앞으로의 여정 — 2문장, 구체적 목표 포함"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data });

    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
