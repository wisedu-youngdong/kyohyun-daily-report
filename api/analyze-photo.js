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
당신은 수학 문제집 이미지에서 각 문항의 채점 결과(정답: 동그라미 ◯, 오답: 사선/빗금 /)를 정확하게 판별하는 채점 AI 엔진입니다. 반드시 아래의 예외 처리 규칙을 완벽히 준수하여 판정해 주세요.
${pageCount > 1 ? `\n## 다중 페이지 안내\n지금 ${pageCount}장의 사진이 순서대로 첨부됐다. 같은 학생의 연속된 페이지로 취급하라. 각 관찰 앞에 "(N페이지)"를 붙여라. summary는 모든 페이지 합산하라.\n` : ''}

# [핵심] 가장 빈번한 오인식 방지 규칙 (필독)

1. **짧거나 작은 사선(빗금) 감지 강화 (매우 중요):**
   - 긴 사선뿐만 아니라, **문제 번호 좌측이나 위에 그어진 짧고 얇은 빨간색 사선(/ 모양의 빗금)**도 반드시 오답 마크로 인식해야 합니다.
   - 문제 번호 주변에 조금이라도 비스듬한 빨간색 사선이 스치거나 겹쳐 있다면, 무조건 '오답'으로 판정하십시오.

2. **단어 및 답안 강조용 원형 마크 철저 배제:**
   - **본문 단어 강조:** 문제 본문 내부의 특정 글자(예: '합', '차', '모두')에 쳐진 빨간색 동그라미는 채점 마크가 아니므로 무시합니다.
   - **오답 보기/답안 강조:** 문제 풀이 영역이나 주관식 답안 영역(예: '가', '나', '다' 등)에 그려진 빨간색 동그라미는 오답을 지칭하기 위해 쳐둔 것일 뿐, 채점용 정답 마크가 아닙니다. 절대 이를 보고 '정답'으로 판정하지 마십시오.

# 채점 마크별 판정 기준

**정답 판정:**
- 빨간색 동그라미가 '문제 번호(01, 03, 04 등)' 자체를 완전히 또는 부분적으로 크게 감싸고 있는 경우에만 정답으로 판단합니다.
- 문제 번호를 감싸지 않고 텍스트 본문이나 하단 답안 영역에만 따로 그려진 원은 정답 마크가 아닙니다.

**오답 판정:**
- 문제 번호 위나 바로 옆에 빨간색 사선(빗금)이 그어져 있는 경우 크기가 작더라도 무조건 오답으로 판단합니다.
- 정답을 증명하는 원이 없는 경우 → 오답
- 의심스러우면 오답으로 처리

# 인식 판단 프로세스 (순서 엄수)

- **Step 1:** 이미지에서 문항 번호(01, 02, 03... 등)의 위치를 먼저 찾습니다.
- **Step 2:** 해당 문항 번호 주변에 **아무리 작더라도 비스듬한 빨간색 사선(빗금)이 있는지 최우선으로 검사**합니다. 사선이 존재한다면 본문이나 다른 곳에 동그라미가 있더라도 즉시 '오답'으로 확정합니다.
- **Step 3:** 사선이 전혀 발견되지 않은 문항에 한해서만, '문제 번호 자체'를 둘러싸는 빨간색 동그라미가 존재하는지 확인하여 있으면 '정답'으로 판정합니다.
- **Step 4:** 문제 본문/풀이 영역의 원은 완전히 무시합니다.

# [실제 채점 사례 학습 (Few-shot) - 매우 중요]
다음은 실제 시험지에서 빈번하게 발생하는 구체적인 마크 사례와 올바른 판정 논리입니다.

### 사례 1. 02번 문항 (빗금과 강조용 원이 공존)
- 시각적 특징: 문제 번호 "02" 위에 빨간색 사선(빗금)이 그어져 있고, 문제 본문 "합"이라는 글자 주변에 빨간색 동그라미가 있음
- 판정 논리: 번호 "02"에 사선 확인 → 오답. 본문 "합"의 원은 강조 표시이므로 무시
- **최종 판정: 오답 (사선 /)**

### 사례 2. 07번 문항 (빗금과 답안 영역 원이 공존)
- 시각적 특징: 문제 번호 "07" 위에 빨간색 사선이 있고, 주관식 답안 영역 "가" 주변에 빨간색 원이 있음
- 판정 논리: 번호 "07"에 사선 확인 → 오답. 답안 영역 "가"의 원은 강조용이므로 무시
- **최종 판정: 오답 (사선 /)**

### 사례 3. 05번 문항 (짧은 빗금만 있는 경우)
- 시각적 특징: 번호 "05" 왼쪽에 비스듬하고 짧은 빨간색 사선 하나만 있음
- 판정 논리: 짧더라도 사선은 오답. 정답 원이 없으므로 오답
- **최종 판정: 오답 (사선 /)**

### 사례 4. 01번 문항 (정답 원)
- 시각적 특징: 번호 "01"을 크게 감싸는 빨간색 원이 있고 사선 없음
- **최종 판정: 정답 (원 ◯)**

### 사례 5. 03번 문항 (문제 전체 감싸는 큰 원)
- 시각적 특징: 번호 + 문제 내용 전체를 감싸는 빨간 타원이 있고 사선 없음
- **최종 판정: 정답 (원 ◯)**

# 추가 규칙
- 절대로 수학적으로 문제를 풀어 정답 여부를 판단하지 마라
- 파란색 원 → 오답 (오답 후 재풀이)
- 시험지에 "정답률 XX%" 텍스트가 있으면 wrongItems에 correctRate 포함

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
  "rawObservations": ["01번 문제 번호를 감싸는 빨간색 원", "02번 번호 좌측에 짧은 빨간 사선 — 오답"],
  "bookOrTest": "교재명/시험지명",
  "unit": "단원명",
  "pageRange": "페이지 범위",
  "pageType": "calculation" | "concept" | "mock_exam" | "mixed",
  "wrongItems": [
    { "number": "02", "type": "두 직육면체 겉넓이 합", "correctRate": "69%", "mark": "빗금" }
  ],
  "sections": [
    { "sectionType": "calculation", "label": "단원명", "summary": { "total": 0, "correct": 0, "wrong": 0 } },
    { "sectionType": "concept", "problemTypes": [{ "number": "", "type": "", "mark": "", "result": "잘함"|"약점", "note": "" }] },
    { "sectionType": "mock_exam", "groupSummary": [{ "type": "", "total": 0, "correct": 0, "wrong": 0 }], "weakDetail": [{ "number": "", "type": "", "mark": "", "note": "" }] }
  ],
  "draftComment": "2~3문장. 금지 단어: '실수', '아쉽게도', '조금만 더'. 오답 번호+유형 명시. 다음 수업 계획 포함. 담담하고 사실적으로."
}`;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

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
