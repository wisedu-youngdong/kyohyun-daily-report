// 1단계: 이미지에서 문항 번호 위치(bbox) 추출
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { images } = req.body;
    if (!images?.length) return res.status(400).json({ error: '이미지가 없습니다.' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const prompt = `이미지에서 각 문항 번호(01, 02, 03, 1, 2, 3 등)의 위치를 찾아라.

각 문항 번호가 있는 영역(문항 번호 + 문제 내용 전체)의 bounding box를 이미지 전체 크기 대비 % 비율로 반환하라.

반환 형식 (JSON만, 코드펜스 없이):
{
  "regions": [
    { "number": "01", "x": 2, "y": 8, "w": 48, "h": 22 },
    { "number": "02", "x": 2, "y": 32, "w": 48, "h": 22 },
    { "number": "03", "x": 52, "y": 8, "w": 46, "h": 22 },
    { "number": "04", "x": 52, "y": 32, "w": 46, "h": 22 }
  ]
}

규칙:
- x, y: 이미지 좌측상단 기준 % (0~100)
- w, h: 이미지 전체 기준 너비/높이 %
- 각 문항 영역은 문항 번호부터 풀이 공간 끝까지 포함
- 페이지에 여러 장 있으면 모두 포함
- 문항이 없으면 regions: []`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            ...images.map(img => ({ inline_data: { mime_type: img.mimeType || 'image/jpeg', data: img.imageBase64 } }))
          ]
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 4096 }
      })
    });

    const data = await response.json();
    if (data.error) return res.status(200).json({ error: data.error.message, regions: [] });

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!rawText) return res.status(200).json({ regions: [] });

    const cleaned = rawText.replace(/```json|```/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json(parsed);
    } catch {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end > start) {
        return res.status(200).json(JSON.parse(cleaned.slice(start, end + 1)));
      }
      return res.status(200).json({ regions: [] });
    }
  } catch (e) {
    console.error('extract-regions 오류:', e);
    return res.status(200).json({ regions: [], error: e.message });
  }
}
