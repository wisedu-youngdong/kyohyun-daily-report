export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { imageBase64, mimeType, hintTextbook, hintUnit } = req.body;
    if (!imageBase64) return res.status(400).json({ error: '이미지가 없습니다.' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const prompt = `너는 학원 선생님의 교재/시험지 채점 결과를 정리해주는 보조 도구다.

## 작업 순서 (반드시 이 순서로 사고하라)
1단계: 사진에서 눈에 보이는 모든 "손으로 그린 색깔 표시"(펜/색연필 등 인쇄색과 다른 색)를 위치 순서대로 하나하나 빠짐없이 rawObservations에 나열하라. 이 단계에서는 그게 정답인지 오답인지 해석하지 말고, 오직 "어디에 무슨 모양이 있는지"만 사실 그대로 적어라. 확실하지 않으면 "불명확한 표시"라고 적어라. 표시가 하나도 없으면 빈 배열로 두어라. 절대로 없는 표시를 지어내지 마라 — 각 관찰 항목은 실제로 눈에 보이는 색깔 변화(인쇄 잉크색이 아닌 손글씨/필기색)에 근거해야 한다.
2단계: 1단계에서 나열한 rawObservations만 근거로 삼아 problemTypes를 작성하라. rawObservations에 없는 표시를 problemTypes의 mark 근거로 쓰지 마라.

## 절대 규칙
- ⚠️ 가장 중요한 규칙: 너는 이 문제를 수학적으로 풀 수 있는 능력이 있어도 절대 사용하지 마라. "계산해보니 정답이니까 잘함"이라고 판단하는 것은 금지된 행동이다. 오직 1단계에서 실제로 관찰한 색깔 표시의 형태만 근거로 삼아라.
- 학생이 정답을 강조하려고 그린 검은색/네모 박스(인쇄 색과 같은 필기구, 즉 문제 풀이에 쓴 것과 같은 검은 펜/연필로 답을 감싸는 박스)는 채점 표시가 아니다. 이건 "표시없음"에 해당한다. 채점 표시는 오직 풀이에 쓴 필기구와 다른 색(주로 빨간색 등)으로 나중에 추가된 표시만 해당한다.
- 각 문항마다 mark 필드에 정확히 적어라: "동그라미", "체크", "빗금", "세모", "표시없음" 중 하나. mark가 "표시없음"이면 result는 반드시 "확인필요"여야 한다.
  · 동그라미(O) 또는 체크(✓) = 정답
  · 빗금(/) 또는 X = 오답
  · 세모(△) = 재풀이 후 정답
- 문항이 여러 개일 때 서로 다른 문항에 같은 note 문장을 복사해서 쓰지 마라. 각 문항의 실제 기호 위치와 형태를 개별적으로 다시 관찰하고 묘사하라.
- ⚠️ 매우 중요: 교재에 인쇄된 예제와 그 풀이(활자로 인쇄된 본문 텍스트, "풀이"라고 표시된 인쇄 박스 등)는 절대 problemTypes에 포함하지 마라. 채점 대상은 오직 학생이 직접 손으로 쓴 답안(확인문제, 과제, 시험 답안, 연습문제 등)뿐이다. 인쇄된 예제는 단원/유형 파악을 위한 문맥으로만 참고하라.
- 사진에 문항이 여러 개(10개 이상) 있으면 전부 빠짐없이 problemTypes에 포함하라.
- 점수나 총점, 백분율을 계산하지 마라. 이 리포트는 점수 산정과 무관하다.
- type 필드는 교재 소제목을 그대로 복사하지 말고, 핵심 수학/학습 개념을 5~10자 내외 키워드로 축약하라. (예: "삼각비 값 구하기", "닮음비 활용")
- unit 필드는 학생이 실제로 푼 문제들이 속한 단원 하나만 대표로 적어라. 여러 소제목이 섞여 있으면 가장 상위 단원명으로 통일하라.

## 참고 정보 (선생님이 입력, 없으면 무시)
- 교재/시험지명 힌트: ${hintTextbook || '없음'}
- 단원 힌트: ${hintUnit || '없음'}

## 출력 형식
아래 JSON만 출력하라. 다른 텍스트, 마크다운 코드펜스, 설명 없이 JSON 객체 하나만.

{
  "rawObservations": [
    "예: 확인3 풀이 영역 전체를 감싸는 빨간색 동그라미가 있음",
    "예: 확인4의 'tan x=2√2' 줄 옆에 빨간색 동그라미가 있음",
    "예: 확인4의 'cos y' 줄 옆에 빨간색 체크(✓) 표시가 있음"
  ],
  "bookOrTest": "인식된 교재명 또는 시험지명 (모르면 빈 문자열)",
  "unit": "인식된 단원명 (모르면 빈 문자열)",
  "pageRange": "인식된 페이지 범위 (모르면 빈 문자열)",
  "problemTypes": [
    { "number": "문항 번호(있으면)", "type": "문제 유형", "mark": "동그라미" | "체크" | "빗금" | "세모" | "표시없음", "result": "잘함" | "약점" | "확인필요", "note": "rawObservations 중 몇 번째 관찰에 근거했는지와 그 내용 1문장" }
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
          temperature: 0,
          responseMimeType: 'application/json',
          maxOutputTokens: 16384
        }
      })
    });

    const data = await response.json();

    // Gemini API 레벨 에러(쿼터초과 429, 키 오류 400 등) 먼저 체크 — 원인 그대로 노출
    if (data.error) {
      console.error('Gemini API 에러:', JSON.stringify(data.error));
      const code = data.error.code;
      const status = data.error.status;
      let userMsg = `Gemini API 오류 (${code} ${status}): ${data.error.message}`;
      if (status === 'RESOURCE_EXHAUSTED' || code === 429) {
        userMsg = '⚠️ Gemini API 쿼터가 초과됐습니다. (프로젝트 단위 쿼터 소진 가능성 — 1test.ai와 같은 프로젝트 키를 쓰는 경우 그쪽 사용량도 확인 필요) 잠시 후 다시 시도하거나 콘솔에서 쿼터를 확인해주세요.';
      } else if (code === 400 && /API key/i.test(data.error.message || '')) {
        userMsg = '⚠️ API 키가 유효하지 않습니다. Vercel 환경변수 GEMINI_API_KEY를 확인해주세요.';
      }
      return res.status(200).json({ error: userMsg });
    }

    const finishReason = data.candidates?.[0]?.finishReason;
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!rawText) {
      console.error('Gemini 응답 없음. finishReason:', finishReason, 'full:', JSON.stringify(data));
      let reasonMsg = `AI가 응답하지 않았습니다. (finishReason: ${finishReason || '알수없음'}) 잠시 후 다시 시도해주세요.`;
      if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
        reasonMsg = '이미지가 안전 필터에 걸려 분석하지 못했습니다. 다른 사진으로 시도해주세요.';
      } else if (finishReason === 'MAX_TOKENS') {
        reasonMsg = '문항이 너무 많아 응답이 중간에 잘렸습니다. 사진을 페이지 절반씩 나눠서 다시 시도해주세요.';
      }
      return res.status(200).json({ error: reasonMsg });
    }

    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      if (finishReason === 'MAX_TOKENS') {
        console.error('MAX_TOKENS로 응답 잘림. 길이:', cleaned.length);
        return res.status(200).json({
          error: '문항이 너무 많아 응답이 중간에 잘렸습니다. 사진을 페이지 절반씩 나눠서 다시 시도해주세요.'
        });
      }
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
