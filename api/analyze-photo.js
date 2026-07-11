function buildPrompt(mode, hintTextbook, hintUnit, pageCount = 1) {
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

  return `너는 학원 선생님의 교재/시험지 채점 결과를 정리해주는 보조 도구다.
${pageCount > 1 ? `\n## 다중 페이지 안내\n지금 ${pageCount}장의 사진이 순서대로 첨부됐다. 이 사진들은 같은 학생의 연속된 페이지(또는 같은 시험지의 여러 장)로 취급하라. rawObservations는 페이지 구분 없이 순서대로 통합해서 나열하되, 각 관찰 앞에 "(N페이지)"를 붙여 어느 사진에서 나온 관찰인지 표시하라. calculation 섹션의 summary는 모든 페이지의 집계를 합산한 하나의 총계로 내라. concept/mock_exam 섹션도 여러 페이지에 걸쳐 문항이 있으면 하나의 problemTypes/groupSummary 배열로 통합하라.\n` : ''}
## 작업 순서 (반드시 이 순서로 사고하라)
1단계: 사진에서 눈에 보이는 모든 "손으로 그린 색깔 표시"(펜/색연필 등 인쇄색과 다른 색)를 위치 순서대로 하나하나 빠짐없이 rawObservations에 나열하라. 이 단계에서는 그게 정답인지 오답인지 해석하지 말고, 오직 "어디에 무슨 모양이 있는지"만 사실 그대로 적어라. 확실하지 않으면 "불명확한 표시"라고 적어라. 표시가 하나도 없으면 빈 배열로 두어라. 절대로 없는 표시를 지어내지 마라.
${modeInstruction}
2단계: 1단계에서 나열한 rawObservations만 근거로 삼아 아래 섹션 규칙에 따라 sections를 작성하라. rawObservations에 없는 표시를 근거로 쓰지 마라.

## 절대 규칙
- ⚠️ 가장 중요한 규칙: 너는 이 문제를 수학적으로 풀 수 있는 능력이 있어도 절대 사용하지 마라. "계산해보니 정답이니까 잘함"이라고 판단하는 것은 금지된 행동이다. 오직 1단계에서 실제로 관찰한 색깔 표시의 형태만 근거로 삼아라.
- 학생이 정답을 강조하려고 그린 검은색/네모 박스(문제 풀이에 쓴 것과 같은 필기구로 답을 감싸는 박스)는 채점 표시가 아니다. 채점 표시는 오직 풀이에 쓴 필기구와 다른 색으로 나중에 추가된 표시만 해당한다.
- ⚠️ 색깔은 반드시 구체적으로 구분해서 관찰하라: "동그라미"라고만 적지 말고, rawObservations에는 항상 정확한 색을 명시하라 (예: "빨간색 동그라미", "파란색 동그라미", "검은색 동그라미"). 파란색·검은색·기타 색의 원은 "동그라미" 판정에 해당하지 않는다 — 오직 명확한 빨간색(붉은 계열) 원만 인정한다.
- ⚠️ 하나의 문제 위에 여러 표시가 겹쳐 있으면(예: 원 안에 X가 그어짐, 원 위에 별표가 덧그려짐, 원을 가로지르는 사선이 있음) 이는 "취소/무효 표시"로 간주하고 절대 "동그라미"로 분류하지 마라. 이 경우 mark는 그 위에 덧그려진 실제 형태(예: 사선이 있으면 "빗금", 별표면 "표시없음"으로 최대한 가깝게)로 기록하고 result는 "약점"으로 판정하라. rawObservations에도 "OO색 원 위에 X(또는 별표/사선)가 덧그려져 취소됨"처럼 겹침 상태를 그대로 서술하라.
- ⚠️ 판정 기준 (반드시 이 규칙을 그대로 따를 것 — 예외 없음):
  · 빨간색(붉은 계열) 원 단독 → result = "잘함", mark = "동그라미"
  · 그 외 모든 경우 → result = "약점"
  · "확인필요"는 사용 금지. 빨간 동그라미 단독이 아니면 전부 "약점".
  · mark 필드 세부 규칙 (채점 기호별 정확히 구분):
    - 빨간색 원(단독, 훼손 없음) → mark: "동그라미", result: "잘함"
    - 빗금(/) 또는 X표 → mark: "빗금", result: "약점" [단순 오답]
    - 세모(△) → mark: "세모", result: "약점" [오답, 재시도 필요]
    - 파란색 원(단독) → mark: "파란동그라미", result: "약점", note에 "오답 후 수정 완료" 명시
    - 빗금/세모 위에 파란색 원이 덧그려진 경우 → mark: "파란동그라미", result: "약점", note에 "오답 후 재풀이·수정 완료" 명시
    - 표시 없음 → mark: "표시없음", result: "약점"
  · 파란동그라미는 "오답이지만 스스로 고친 문제"로 draftComment에서 긍정적으로 언급하라.
- 인쇄된 교재 예제/풀이는 절대 채점 대상에 포함하지 마라. 채점 대상은 오직 학생이 직접 손으로 쓴 답안뿐이다.
- 점수나 총점, 백분율을 계산하지 마라.

## 섹션 규칙

### 연산(calculation) 섹션 규칙
- 문제 내용은 읽지 말고 문항 번호 옆 mark만 확인한다.
- 문항별 코멘트를 달지 마라. 대신 전체 집계만 낸다.
- label에 단원/페이지 범위를 적고, summary에 {total, correct(빨간 동그라미만), wrong(그 외 전부 — 체크/빗금/세모/표시없음 합산)} 개수를 넣어라. retry/unmarked 필드는 쓰지 말고 wrong에 통합하라.

### 유형(concept) 섹션 규칙
- 문제 텍스트와 풀이 과정을 참고해서 type을 정확한 개념 키워드(5~10자)로 축약하라. 단, 정답 여부 판정은 여전히 mark로만 한다 (문제를 직접 풀어서 판단 금지).
- problemTypes 배열에 문항별로 {number, type, mark, result, note}를 전부 채워라. note는 rawObservations 근거를 명시.

### 모의고사(mock_exam) 섹션 규칙
- 문항이 매우 많으므로 문항별 코멘트를 전부 달지 마라.
- groupSummary: 문제 유형별로 묶어 {type, total, correct, wrong} 집계. (correct=빨간 동그라미만, wrong=그 외 전부)
- weakDetail: result가 "약점"인 문항만 {number, type, mark, note}로 상세 기록. 잘한 문항은 상세 기록하지 않는다.

## 참고 정보 (선생님이 입력, 없으면 무시)
- 교재/시험지명 힌트: ${hintTextbook || '없음'}
- 단원 힌트: ${hintUnit || '없음'}

## 출력 형식
아래 JSON만 출력하라. 다른 텍스트, 마크다운 코드펜스, 설명 없이 JSON 객체 하나만. sectionType에 따라 필요한 필드만 채우고 나머지는 생략해도 된다.

{
  "rawObservations": ["실제 관찰한 표시들을 순서대로. 예: '05번 문제 전체에 빨간색 동그라미가 깨끗하게 둘러짐', '01번 문제 위에 파란색 원이 있고 그 위에 빨간색 X가 덧그려져 취소됨', '08번 문제에 파란색 원과 빨간색 별표가 겹쳐 그려짐'"],
  "bookOrTest": "교재명/시험지명",
  "unit": "단원명",
  "pageRange": "페이지 범위",
  "pageType": "calculation" | "concept" | "mock_exam" | "mixed",
  "sections": [
    {
      "sectionType": "calculation",
      "label": "예: 3단원 소수의 나눗셈 연산 문제",
      "summary": { "total": 0, "correct": 0, "wrong": 0 }
    },
    {
      "sectionType": "concept",
      "problemTypes": [ { "number": "", "type": "", "mark": "", "result": "잘함" | "약점", "note": "" } ]
    },
    {
      "sectionType": "mock_exam",
      "groupSummary": [ { "type": "", "total": 0, "correct": 0, "wrong": 0 } ],
      "weakDetail": [ { "number": "", "type": "", "mark": "", "note": "" } ]
    }
  ],
  "draftComment": "학부모 전달용 코멘트 2~3문장. 톤 원칙: ① 짧고 직접적 — 서술 없이 사실만 전달, ② 문제 번호 + 반드시 해당 문제의 유형/개념명 함께 명시 (예: '2번(외심 좌표 계산)', '5번(내심과 각도)'), ③ 다음 수업 계획 한 줄 포함, ④ 과장·칭찬 표현 절대 금지(인상적/훌륭/대단 등 사용 금지), ⑤ 선생님이 직접 쓴 것처럼 자연스럽게. 기호별 표현: 빗금·X → '다음 수업에서 짚고 넘어갈게요', 세모 → '한 번 더 풀어볼 문제', 파란동그라미 → '처음엔 틀렸는데 본인이 다시 검토해서 고쳤습니다' (담담하게). 예시: '오늘 삼각형의 외심·내심 단원 10문제 풀었습니다. 1번(외심의 성질)·3번(내심과 각도)는 잘 잡고 있어요. 2번(외심 좌표 계산)·6번(내심 응용)은 다음 수업에서 짚고 넘어갈게요.'"
}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { images, imageBase64, mimeType, hintTextbook, hintUnit, mode } = req.body;
    // images: [{ imageBase64, mimeType }] 배열 (신규, 다중 업로드). 없으면 구버전 단일 imageBase64로 fallback.
    const imageList = Array.isArray(images) && images.length > 0
      ? images
      : (imageBase64 ? [{ imageBase64, mimeType }] : []);
    if (imageList.length === 0) return res.status(400).json({ error: '이미지가 없습니다.' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const prompt = buildPrompt(mode || 'auto', hintTextbook, hintUnit, imageList.length);

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
