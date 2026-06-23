export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { note } = req.body;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `당신은 학원 선생님의 메모를 학부모에게 보내는 따뜻하고 전문적인 알림 메시지로 바꿔주는 도우미입니다.

다음 규칙을 지켜주세요:
- 따뜻하고 신뢰감 있는 톤 유지
- 학부모 입장에서 읽기 편하게
- 문제점은 부드럽게, 잘한 점은 칭찬으로
- 2~4문장 이내로 간결하게
- 한국어로 작성
- 앞뒤 설명 없이 메시지 본문만 출력

선생님 메모: ${note}`
          }]
        }]
      })
    }
  );

  const data = await response.json();
  const result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  res.status(200).json({ result });
}
