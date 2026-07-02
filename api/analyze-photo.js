export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { imageBase64, mimeType, hintTextbook, hintUnit } = req.body;
    if (!imageBase64) return res.status(400).json({ error: '이미지가 없습니다.' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const prompt = `너는 학원 선생님의 교재/시험지 채점 결과를 정리해주는 보조 도구다.

## 절대 규칙
- 너는 채점하지 않는다. 학생 옆에 이미 표시된 채점 기호(동그라미=정답, 빗금 또는 X=오답, 세모=재풀이 후 정답)만 그대로 읽어서 보고하라.
- 표시가 흐릿하거나 애매하면 result를 "확인필요"로 표시하라. 절대 추측해서 단정하지 마라.
- 점수나 총점, 백분율을 계산하지 마라. 이 리포트는 점수 산정과 무관하다.
- 문제 유형/단원명은 교재 목차나 문제 스타일로 추정하되, 확신이 없으면 "추정: "을 앞에 붙여라.

## 참고 정보 (선생님이 입력, 없으면 무시)
- 교재/시험지명 힌트: ${hintTextbook || '없음'}
- 단원 힌트: ${hintUnit || '없음'}

## 출력 형식
아래 JSON만 출력하라. 다른 텍스트, 마크다운 코드펜스, 설명 없이 JSON 객체 하나만.

{
  "bookOrTest": "인식된 교재명 또는 시험지명 (모르면 빈 문자열)",
  "unit": "인식된 단원명 (모르면 빈 문자열)",
  "pageRange": "인식된 페이지 범위 (모르면 빈 문자열)",
  "problemTypes": [
    { "number": "문항 번호(있으면)", "type": "문제 유형", "result": "잘함" | "약점" | "확인필요", "note": "간단한 근거 — 표시 상태, 풀이과정 특징 등 1문장" }
  ],
  "draftComment": "위 내용을 종합한 학부모용 코멘트 초안 2~3문장. 잘한 점과 보완할 유형을 인과관계로 설명."
}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } }
          ]
        }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      })
    });

    const data = await response.json();
    const finishReason = data.candidates?.[0]?.finishReason;
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!rawText) {
      console.error('Gemini 응답 없음. finishReason:', finishReason, 'full:', JSON.stringify(data));
      const reasonMsg = finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT'
        ? '이미지가 안전 필터에 걸려 분석하지 못했습니다. 다른 사진으로 시도해주세요.'
        : 'AI가 응답하지 않았습니다. 잠시 후 다시 시도해주세요.';
      return res.status(200).json({ error: reasonMsg });
    }

    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      // 앞뒤에 설명 텍스트가 섞였을 경우 첫 '{' ~ 마지막 '}' 구간만 추출해 재시도
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        try {
          parsed = JSON.parse(cleaned.slice(start, end + 1));
        } catch (secondErr) {
          console.error('JSON 파싱 2차 실패:', cleaned);
          return res.status(200).json({
            error: 'AI 응답을 정리하지 못했습니다. 다시 시도하거나 직접 입력해주세요.',
            raw: cleaned
          });
        }
      } else {
        console.error('JSON 파싱 실패:', cleaned);
        return res.status(200).json({
          error: 'AI 응답을 정리하지 못했습니다. 다시 시도하거나 직접 입력해주세요.',
          raw: cleaned
        });
      }
    }

    res.status(200).json(parsed);
  } catch (e) {
    console.error('사진분석 에러:', e.message);
    res.status(500).json({ error: '오류: ' + e.message });
  }
}
