export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { note } = req.body;
    console.log('요청 받음:', note);
    console.log('API 키 확인:', process.env.GEMINI_API_KEY ? '있음' : '없음');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `학원 선생님 메모를 학부모에게 보내는 따뜻한 메시지로 바꿔주세요. 2~4문장, 한국어, 본문만 출력.\n\n선생님 메모: ${note}`
          }]
        }]
      })
    });

    console.log('Gemini 상태:', response.status);
    const data = await response.json();
    console.log('Gemini 응답:', JSON.stringify(data));

    const result = data.candidates?.[0]?.content?.parts?.[0]?.text || '결과 없음';
    res.status(200).json({ result });

  } catch (e) {
    console.error('에러:', e.message);
    res.status(500).json({ result: '오류: ' + e.message });
  }
}
