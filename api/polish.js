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

규칙:
- 첫 문장 반드시 "${studentName || '학생'} 학생은" 으로 시작 (OOO, 이름, 아이 같은 대체어 절대 사용 금지)
- 교재(${textbook || ''})와 단원(${unit || ''}) 구체적으로 언급
- 진단(${diagTags || ''})을 완곡하게 표현하되 희석하지 말고 명확하게 전달
- 2~3문장, 한국어, 본문만 출력 (인사말/서명 없이)
- 과장 없이 팩트 기반, 따뜻하되 전문적인 톤`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API 오류:', response.status, errText.slice(0, 200));
      return res.status(500).json({ result: `API 오류 (${response.status})` });
    }

    const data = await response.json();
    
    // thinking 모드 대응 — parts 중 text 타입만 추출
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const textPart = parts.find(p => p.text && !p.thought);
    const result = textPart?.text 
      || parts.find(p => p.text)?.text
      || parts.map(p => p.text || '').join('')
      || data.candidates?.[0]?.content?.parts?.[0]?.text
      || '';

    if (!result) {
      console.error('Gemini 응답 파싱 실패:', JSON.stringify(data).slice(0, 300));
      return res.status(200).json({ result: '응답을 가져오지 못했습니다. 다시 시도해주세요.' });
    }

    res.status(200).json({ result: result.trim() });

  } catch (e) {
    res.status(500).json({ result: '오류: ' + e.message });
  }
}
