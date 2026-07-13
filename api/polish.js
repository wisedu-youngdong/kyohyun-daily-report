export const maxDuration = 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { note, studentName, textbook, unit, diagTags } = req.body;

    const context = [
      studentName && `학생: ${studentName}`,
      textbook && `교재: ${textbook}`,
      unit && `단원: ${unit}`,
      diagTags && `진단: ${diagTags}`,
    ].filter(Boolean).join(' / ');

    const prompt = `학원 선생님 메모를 학부모에게 보내는 메시지로 바꿔주세요.

${context ? `[수업 정보]\n${context}\n\n` : ''}[선생님 메모]\n${note}

조건:
- 학생 이름(${studentName || '학생'})을 반드시 첫 문장에 포함
- 2~3문장으로 간결하게
- 오늘 배운 내용(교재/단원)과 진단 내용을 구체적으로 언급
- 과장 없이 팩트 기반, 따뜻하되 전문적인 톤
- 한국어, 본문만 출력 (인사말/서명 없이)`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
      })
    });

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find(p => p.text && !p.thought);
    const result = textPart?.text || parts.map(p => p.text || '').join('') || '결과 없음';
    res.status(200).json({ result });

  } catch (e) {
    res.status(500).json({ result: '오류: ' + e.message });
  }
}
