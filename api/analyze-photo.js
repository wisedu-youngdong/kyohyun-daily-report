function buildPrompt(mode, hintTextbook, hintUnit, pageCount = 1, hintSubject = '') {
  const modeInstruction = {
    auto: `## 0단계: 페이지 유형 자동 분류
먼저 사진 전체를 훑어보고 pageType을 판단하라:
- "calculation": 문항 10개 이상, 각 문항이 1~2줄짜리 단순 계산식 반복 (연산 드릴)
- "concept": 문항 1~9개, 서술/그림/여러 줄 풀이가 있는 개념·응용 문제
- "mock_exam": 문항 20개 이상, 객관식 보기(①②③④) 또는 배점 표시가 있는 시험지
- "mixed": 한 페이지에 위 유형이 섞여 있음 (예: 연산 파트 + 서술형 파트)
판단한 pageType에 따라 아래 "유형별 출력 규칙"을 적용해 sections를 구성하라. mixed면 섹션을 유형별로 나눠 각각 다른 규칙을 적용한 여러 섹션을 만들어라.`,
    calculation: `## 지정된 모드: calculation (연산문제)
이 페이지는 연산 드릴로 지정됐다. pageType은 "calculation"으로 고정하고, 아래 "연산(calculation) 섹션 규칙"만 적용해 섹션 하나로 출력하라.`,
    concept: `## 지정된 모드: concept (유형/개념문제)
이 페이지는 유형·개념 문제로 지정됐다. pageType은 "concept"로 고정하고, 아래 "유형(concept) 섹션 규칙"만 적용해 섹션 하나로 출력하라.`,
    mock_exam: `## 지정된 모드: mock_exam (모의고사/시험지)
이 페이지는 모의고사·시험지로 지정됐다. pageType은 "mock_exam"으로 고정하고, 아래 "모의고사(mock_exam) 섹션 규칙"만 적용해 섹션 하나로 출력하라.`,
  }[mode] || null;

  return `# 역할 및 임무
당신은 문제집 이미지에서 빨간색 동그라미로 채점된 문항을 검출하고 정답 여부를 판별하는 전문 채점 AI 엔진입니다.
${pageCount > 1 ? `\n## 다중 페이지 안내\n지금 ${pageCount}장의 사진이 순서대로 첨부됐다. 이 사진들은 같은 학생의 연속된 페이지로 취급하라. rawObservations는 페이지 구분 없이 순서대로 통합하되, 각 관찰 앞에 "(N페이지)"를 붙여라. calculation 섹션의 summary는 모든 페이지 집계를 합산하라.\n` : ''}

# 핵심 규칙 (가장 중요)
- 오직 **'문제 번호(숫자)' 자체를 감싸고 있는 빨간색 동그라미**만을 정답(채점 마크)으로 인정한다.
- 문제 번호와 무관하게 빈 여백, 문제 지문, 단어, 수식, 또는 보기 주변에 그려진 빨간색 동그라미나 마크는 **절대 채점 대상으로 인정하지 말고 무시**한다.
- 절대로 수학적으로 문제를 풀어 정답 여부를 판단하지 마라. 오직 시각적 채점 기호만 판단하라.

# 채점 마크 인정 기준 (Valid)
1. **문제 번호 감싸기:** 빨간색 선이 문제 번호(예: 01, 02, 1, 2 등)의 외곽을 둘러싸고 있어야 한다.
2. **손글씨 변형 허용:** 타원형, 찌그러진 원, 끝부분이 열려 있는 불완전한 원이어도 '문제 번호'를 감싸려는 의도가 명확하다면 인정한다.
3. **문제 전체 감싸기:** 문제 번호 + 문제 내용 전체를 크게 감싸는 빨간 원/타원도 해당 문항의 정답 표시로 인정한다.

# 절대 제외 기준 (Ignore)
1. **빈 여백의 원:** 문제 번호가 없는 여백에 단독으로 그려진 원은 무시한다.
2. **단순 근접 배치:** 문제 번호 근처에 위치만 가깝고 번호 자체를 감싸지 않은 원은 무시한다.
3. **지문/텍스트 강조용 원:** 문제 번호가 아닌 본문 텍스트, 키워드, 수식, 그래프를 감싸거나 강조하는 빨간 마크는 무시한다.
4. **오인식 유발 낙서:** 원형과 유사해 보이는 빨간 흔적이나 무관한 낙서는 채점 정보로 처리하지 마라.

# 판단 알고리즘
- Step 1: 이미지 내 빨간색 선/원형 객체를 검출한다.
- Step 2: 해당 객체 내부에 '문제 번호(숫자)'가 포함되어 있는지 위치 관계를 확인한다.
- Step 3: 객체 내부 혹은 바로 위에 문제 번호가 겹쳐져 있으면 '채점 대상'으로 판단한다.
- Step 4: 객체 내부에 문제 번호가 없으면 아무리 동그라미처럼 생겼어도 '무시(Ignore)' 처리한다.

# 오답 판정
- 문항 번호에 빗금(/), X, 세모(△) → 오답
- 파란색 원 → 오답 (오답 후 재풀이)
- 채점 표시 없음 → 오답/미풀이

# 시험지 정답률 활용
- "정답률 XX%" 또는 "정답 XX%" 텍스트가 있으면 읽어서 wrongItems에 correctRate 포함

# 참고 정보
- 과목: ${hintSubject || '수학'}
- 교재/시험지명: ${hintTextbook || '없음'}
- 단원: ${hintUnit || '없음'}
${modeInstruction ? '\n' + modeInstruction : ''}

# 섹션 규칙

## 연산(calculation) 섹션
- 문항 번호 옆 mark만 확인, 문제 내용 읽지 말 것
- summary에 {total, correct(빨간 동그라미), wrong} 집계

## 유형(concept) 섹션
- 문제 텍스트로 type 파악 (5~10자 키워드)
- problemTypes 배열에 {number, type, mark, result, note} 기록

## 모의고사(mock_exam) 섹션
- groupSummary: 유형별 {type, total, correct, wrong} 집계
- weakDetail: 오답 문항만 {number, type, mark, note}

# 출력 형식
JSON만 출력하라. 마크다운 코드펜스 없이 JSON 객체 하나만.

{
  "rawObservations": ["01번 문제 번호를 감싸는 빨간색 원", "02번 번호에 빨간 빗금"],
  "bookOrTest": "교재명/시험지명",
  "unit": "단원명",
  "pageRange": "페이지 범위",
  "pageType": "calculation" | "concept" | "mock_exam" | "mixed",
  "wrongItems": [
    { "number": "02", "type": "겉넓이 계산", "correctRate": "69%", "mark": "빗금" }
  ],
  "sections": [
    { "sectionType": "calculation", "label": "단원명", "summary": { "total": 0, "correct": 0, "wrong": 0 } },
    { "sectionType": "concept", "problemTypes": [{ "number": "", "type": "", "mark": "", "result": "잘함"|"약점", "note": "" }] },
    { "sectionType": "mock_exam", "groupSummary": [{ "type": "", "total": 0, "correct": 0, "wrong": 0 }], "weakDetail": [{ "number": "", "type": "", "mark": "", "note": "" }] }
  ],
  "draftComment": "2~3문장. '실수' 단어 금지. 오답 번호+유형 명시. 다음 수업 계획 포함."
}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { images, imageBase64, mimeType, hintTextbook, hintUnit, hintSubject, mode } = req.body;
    // images: [{ imageBase64, mimeType }] 배열 (신규, 다중 업로드). 없으면 구버전 단일 imageBase64로 fallback.
    const imageList = Array.isArray(images) && images.length > 0
      ? images
      : (imageBase64 ? [{ imageBase64, mimeType }] : []);
    if (imageList.length === 0) return res.status(400).json({ error: '이미지가 없습니다.' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const prompt = buildPrompt(mode || 'auto', hintTextbook, hintUnit, imageList.length, hintSubject);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            ...imageList.map(img => ({ inline_data: { mime_type: img.mimeType || 'image/jpeg', data: img.imageBase64 } }))
          ]
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          maxOutputTokens: 24576
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
