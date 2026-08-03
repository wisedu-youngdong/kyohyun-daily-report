import { verifyIdTokenHeader } from './_lib/verifyAuth.js';

export const maxDuration = 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await verifyIdTokenHeader(req))) return res.status(401).json({ error: '로그인이 필요합니다.' });

  try {
    const { note, studentName, textbook, unit, diagTags, photoContext, contentType } = req.body;

    const context = [
      studentName && `학생: ${studentName}`,
      textbook && `교재: ${textbook}`,
      unit && `단원: ${unit}`,
      diagTags && `진단: ${diagTags}`,
      contentType && `사진 종류: ${contentType}`,
    ].filter(Boolean).join(' / ');

    const prompt = `당신은 이 학생을 오랫동안 꼼꼼히 관찰해온 학원 선생님입니다. 아래 [선생님 메모]를 학부모님께 보낼 리포트 문장으로 다듬어주세요.

${context ? `[수업 정보]\n${context}\n\n` : ''}${photoContext ? `[사진 분석 결과]\n${photoContext}\n\n` : ''}[선생님 메모]\n${note}

[톤앤매너 — 가장 중요]
- 로봇처럼 딱딱한 보고서체("~입니다.", "~가 필요합니다.")는 지양하고, 부드러운 하십시오체 또는 해요체로 따뜻하고 정중하게 써주세요.
- 학부모님이 "선생님이 우리 아이를 정말 꼼꼼히 챙겨주시는구나"라고 느낄 수 있는 다정하면서도 전문적인 어조여야 합니다.
- 나쁜 예: "도형의 전개도 개념에 대한 이해가 부족합니다."
- 좋은 예: "전개도를 보고 겉넓이를 구하는 과정에서 아직 헷갈려하는 모습을 보여, 다음 수업에서 1:1로 다시 한번 짚어드릴 예정이에요."

[뻔한 표현 금지 — 품질에서 가장 중요]
- "전반적으로 성실히 참여했습니다", "열심히 하는 모습을 보였습니다", "좋은 태도를 보였습니다"처럼 어느 학생에게나 붙일 수 있는 뻔한 문장은 절대 쓰지 마세요.
- [선생님 메모]/[사진 분석 결과]에 없는 내용을 지어내지 말되, 있는 내용을 일반론으로 뭉개지도 마세요 — 실제로 적힌 구체적인 장면·문항·개념·숫자 중 하나는 반드시 문장에 그대로 살려서, "오늘 이 학생에게만 해당하는 이야기"라는 게 드러나야 합니다.

[표현 다양성]
- 첫 문장은 반드시 "${studentName || '학생'} 학생은" 으로 시작하되 (OOO, 이름, 아이 같은 대체어 절대 금지), 그 뒤 문장 구조·어미·연결어는 매번 다르게 구성해 기계적으로 복사한 듯한 느낌이 없도록 하세요.
- 학생 이름은 이 첫 문장에서 딱 한 번만 쓰세요. 이후 문장에서는 이름을 절대 반복하지 말고, 한국어 특성상 자연스러운 주어 생략을 쓰거나 "이 부분은", "다음 시간에는" 처럼 자연스럽게 이어가세요.

${contentType ? `[사진 종류 반영]\n- 이 사진은 "${contentType}"입니다. 자연스러운 도입부에 이 종류를 녹이세요 — 예를 들어 "숙제"면 "숙제를 보니", "숙제에서" 처럼, "테스트"면 "오늘 테스트에서", "이번 테스트를 보니" 처럼 시작하되, 매번 똑같은 문구를 기계적으로 반복하지 말고 자연스럽게 변형하세요. "기타"면 종류를 억지로 문장에 넣지 말고 내용 자체로 자연스럽게 시작하세요.\n\n` : ''}[오답 피드백 구체성]
${photoContext ? '- "O번, O번을 틀렸습니다"처럼 문항 번호만 나열하지 말고, 사진 분석 결과에 담긴 개념 이름(예: 전개도, 겉넓이 계산, 인수분해 등)을 문장에 자연스럽게 녹여 어떤 과정에서 실수했는지 구체적으로 설명하세요.\n' : ''}- 교재(${textbook || ''})와 단원(${unit || ''})을 자연스럽게 언급하세요.
- 진단(${diagTags || ''})은 완곡하게 표현하되 흐릿하게 뭉개지 말고 명확히 전달하세요.

[구조 — 결론 먼저, 근거는 그다음 — 가장 중요]
- 학부모가 가장 궁금한 건 "그래서 우리 아이가 어떤 부분을 더 챙겨야 하는가"라는 결론입니다. 문항번호 나열부터 시작하지 말고, 첫 문장(들)에서 오늘 학습 전반에서 드러난 핵심 패턴부터 요약하세요 (예: "OOO 학생은 이번 숙제에서 개념을 여러 단계로 연결해야 하는 응용문제에서 어려움을 보였어요").
- 그다음 문장에서 그 결론의 근거가 되는 구체적인 내용을 이어가세요.

[오답 항목 누락 금지 — 매우 중요]
- [선생님 메모]에 나열된 오답 문항은 세미콜론(;)으로 구분된 별개의 항목입니다. 문항번호가 어딘가에는 반드시 등장해야 하며, "그 외 몇 문제", "몇몇 문제에서" 처럼 통째로 생략하는 것은 절대 금지입니다.
- 단, 문항을 하나하나 개별 문장으로 늘어놓지 마세요. 같은 개념·유형으로 묶이는 항목은 한 문장에 그룹으로 담으세요 (예: "14번, 16번을 각각 틀렸고 19번도 틀렸습니다" ❌ → "마름모에서 선분 길이를 구하는 14번, 등변사다리꼴에서 각을 구하는 16번처럼 응용문제 전반에서 개념을 연결하는 데 연습이 더 필요해 보여요" ⭕). 유형이 다르면 그룹을 나눠도 되지만, 그룹 수는 최소화하세요.

[교재·단원 불일치 처리 — 중요]
- [수업 정보]의 교재/단원과 [사진 분석 결과]에 실제로 담긴 내용이 서로 다른 과정·난이도로 보이면(예: 고등 교재로 입력돼 있는데 사진은 중학교 도형 문제), 절대 두 정보를 같은 내용인 것처럼 섞어 쓰지 마세요.
- 이럴 땐 [사진 분석 결과]에 실제로 나온 내용을 기준으로 정확하게 서술하고("오늘은 OOO 관련 문제를 복습했어요" 등), [수업 정보]의 교재명을 사진 내용과 같은 것처럼 단정하지 마세요.

[분량 및 형식]
- 인사말("안녕하세요, 학부모님")이나 맺음말 없이, 핵심 피드백만 간결하게 작성하세요. 오답 항목이 적으면(1~3개) 2~3문장이면 충분하지만, 많으면(4개 이상) 위 [오답 항목 누락 금지] 규칙을 지키기 위해 5~6문장까지 늘려도 됩니다 — 짧게 쓰겠다고 항목을 누락하지 마세요.
- 과장이나 근거 없는 칭찬 없이 팩트 기반으로, 본문만 출력하세요 (따옴표·제목·부가설명 없이).

[한 줄 요약 — 마지막에 추가로]
본문을 다 쓴 뒤, 새 줄에 구분자 \`///SUMMARY///\` 를 쓰고 그 다음 줄에 이 리포트 전체를 관통하는 핵심을 15~30자 한 문장으로 요약하세요. 학부모가 이 한 줄만 읽어도 오늘 수업의 결론을 알 수 있어야 합니다(예: "평행선과 선분의 길이의 비, 개념은 잡혔고 응용에서 아직 시간이 걸립니다."). 본문의 첫 문장을 그대로 복사하지 말고 더 압축하세요. 과장 표현 금지.

[선생님 피드백 3단 — 마지막에 추가로, 매우 중요]
위 본문과는 별개로, 같은 관찰 내용을 아래 3단 구조로도 재구성하세요. 본문을 요약하는 게 아니라 다른 두 각도(잘한 점 / 보완할 점)로 나누고, 마지막에 짧은 격려 메시지를 씁니다.

1. strengths(잘하고 있는 점): 이 학생이 오늘 실제로 잘한 부분.
   - [선생님 메모]나 [사진 분석 결과]에 실제 근거가 없으면 억지로 만들지 말고 strengths 전체를 null로 쓰세요(빈 칭찬 금지 — 이게 가장 중요합니다).
   - headline: 결론 한 문장(리포트에서 가장 크게 보이는 문장이라 뻔한 문장 금지 — 위 [뻔한 표현 금지] 규칙 그대로 적용)
   - evidence: 0~3개, 구체적 근거가 있으면 {"no": "N번", "text": "..."}, 문항 번호 없이 관찰만 있으면 {"no": "", "text": "..."}
2. improvements(보완이 필요한 점): 오답/약점 패턴.
   - headline: 결론 한 문장
   - evidence: [오답 문제] 목록에 있는 문항 번호를 no에 정확히 반영하세요(지어내지 마세요, 목록에 없는 번호 금지). 최대 3개 — 4개 이상이면 같은 유형끼리 묶어서 대표 문항만 남기세요.
3. closing(선생님 한마디): 학부모에게 남기는 짧고 따뜻한 마무리 인사. 2~4문장, **공백 포함 200자를 절대 넘기지 마세요**(넘으면 서버에서 강제로 잘립니다 — 문장이 중간에 끊기지 않도록 미리 200자 안에서 끝맺으세요). 오늘 관찰한 태도·노력에 대한 개인적인 감상과 앞으로의 다짐 위주로, 본문이나 headline 문장을 그대로 복사하지 말고 선생님의 목소리로 새로 쓰세요.

이 3단을 JSON으로 만들어 새 줄에 구분자 \`///FEEDBACK///\`를 쓰고 그 다음 줄에 아래 형식 그대로 출력하세요(설명·코드블록 없이 JSON 객체 하나만):
{"strengths":{"headline":"...","evidence":[{"no":"...","text":"..."}]},"improvements":{"headline":"...","evidence":[{"no":"...","text":"..."}]},"closing":{"text":"..."}}
strengths 또는 improvements에 넣을 내용이 전혀 없으면 그 값을 null로 쓰세요. evidence가 0개면 빈 배열 []로 쓰세요.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // thinkingConfig(thinkingBudget:0)는 gemini-2.5의 "생각 모드가 출력 토큰을 먹어치워
        // 응답이 잘리는" 문제의 방어책이었는데, gemini-3.6-flash에서는 이 필드 자체를
        // "Request contains an invalid argument"로 거부해 전체 요청이 실패했음(2026-08-03
        // 발견) — analyze-photo.js/narrative.js는 애초에 이 필드가 없어서 멀쩡했음. 필드를
        // 빼는 것으로 즉시 복구
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 4096,
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API 오류:', response.status, errText.slice(0, 200));
      return res.status(502).json({ error: `API 오류 (${response.status})` });
    }

    const data = await response.json();
    
    // thinking 모드 대응 — parts 중 text 타입만 추출
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    if (candidate?.finishReason === 'MAX_TOKENS') {
      console.error('Gemini 응답이 MAX_TOKENS로 잘림. maxOutputTokens 조정 필요.');
    }
    const textPart = parts.find(p => p.text && !p.thought);
    const result = textPart?.text 
      || parts.find(p => p.text)?.text
      || parts.map(p => p.text || '').join('')
      || data.candidates?.[0]?.content?.parts?.[0]?.text
      || '';

    if (!result) {
      console.error('Gemini 응답 파싱 실패:', JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ error: '응답을 가져오지 못했습니다. 다시 시도해주세요.' });
    }

    // 한 줄 요약을 구분자로 분리 — JSON 응답 모드 대신 구분자를 쓰는 이유: 이 함수는 이미
    // thinking 파트 추출, MAX_TOKENS 폴백 등 plain text 기준 파싱이 얽혀 있어, JSON 모드로
    // 바꾸면 그 파싱 로직을 통째로 다시 짜야 함. 구분자가 없으면(모델이 규칙을 안 지킨 드문
    // 경우) summary는 빈 문자열로 두고 본문만 정상 반환 — 요약 배너는 PublicReport.jsx가
    // 빈 값일 때 숨기므로 사용자에게 보이는 실패로 이어지지 않음.
    const [bodyPart, summaryAndFeedback] = result.split('///SUMMARY///');
    // 프롬프트에서 인사말을 빼라고 지시해도 가끔 붙여서 응답하는 경우가 있어 안전망으로 한 번 더 제거
    const cleanedResult = bodyPart.trim().replace(/^안녕하세요[,.!]?\s*(학부모님[,.!]?)?\s*\n*/, '');
    const [summaryPart, feedbackPart] = (summaryAndFeedback || '').split('///FEEDBACK///');
    const summary = (summaryPart || '').trim().replace(/^["']|["']$/g, '');

    // 선생님 피드백 3단(잘한 점/보완할 점/한마디) — 구분자가 없거나(모델이 규칙을 안 지킨 드문
    // 경우) JSON 파싱에 실패해도 본문/요약은 이미 정상 확보됐으니 feedback만 null로 두고
    // 그대로 반환. 화면(PublicReport/ParentCard)이 feedback null이면 그 섹션을 통째로 숨기므로
    // 사용자에게 보이는 실패로 이어지지 않음(3단계에서 이미 처리됨).
    let feedback = null;
    if (feedbackPart) {
      try {
        const parsed = JSON.parse(feedbackPart.trim().replace(/^```json\s*|\s*```$/g, ''));
        // closing 200자 하드 제한(4단계 결정) — 프롬프트로 지시해도 모델이 넘길 수 있어 서버에서 강제
        if (parsed.closing?.text && parsed.closing.text.length > 200) {
          parsed.closing.text = parsed.closing.text.slice(0, 200).trim();
        }
        feedback = parsed;
      } catch (e) {
        console.error('선생님 피드백 3단 JSON 파싱 실패(본문/요약은 정상):', e.message);
      }
    }

    res.status(200).json({ result: cleanedResult, summary, feedback });

  } catch (e) {
    res.status(500).json({ error: '오류: ' + e.message });
  }
}
