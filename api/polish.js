export const maxDuration = 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { note, studentName, textbook, unit, diagTags, photoContext } = req.body;

    const context = [
      studentName && `학생: ${studentName}`,
      textbook && `교재: ${textbook}`,
      unit && `단원: ${unit}`,
      diagTags && `진단: ${diagTags}`,
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

[오답 피드백 구체성]
${photoContext ? '- "O번, O번을 틀렸습니다"처럼 문항 번호만 나열하지 말고, 사진 분석 결과에 담긴 개념 이름(예: 전개도, 겉넓이 계산, 인수분해 등)을 문장에 자연스럽게 녹여 어떤 과정에서 실수했는지 구체적으로 설명하세요.\n' : ''}- 교재(${textbook || ''})와 단원(${unit || ''})을 자연스럽게 언급하세요.
- 진단(${diagTags || ''})은 완곡하게 표현하되 흐릿하게 뭉개지 말고 명확히 전달하세요.

[교재·단원 불일치 처리 — 중요]
- [수업 정보]의 교재/단원과 [사진 분석 결과]에 실제로 담긴 내용이 서로 다른 과정·난이도로 보이면(예: 고등 교재로 입력돼 있는데 사진은 중학교 도형 문제), 절대 두 정보를 같은 내용인 것처럼 섞어 쓰지 마세요.
- 이럴 땐 [사진 분석 결과]에 실제로 나온 내용을 기준으로 정확하게 서술하고("오늘은 OOO 관련 문제를 복습했어요" 등), [수업 정보]의 교재명을 사진 내용과 같은 것처럼 단정하지 마세요.

[분량 및 형식]
- 인사말("안녕하세요, 학부모님")이나 맺음말 없이, 핵심 피드백만 2~3문장으로 간결하게 작성하세요.
- 과장이나 근거 없는 칭찬 없이 팩트 기반으로, 본문만 출력하세요 (따옴표·제목·부가설명 없이).`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 0 },
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

    // 프롬프트에서 인사말을 빼라고 지시해도 가끔 붙여서 응답하는 경우가 있어 안전망으로 한 번 더 제거
    const cleanedResult = result.trim().replace(/^안녕하세요[,.!]?\s*(학부모님[,.!]?)?\s*\n*/, '');

    res.status(200).json({ result: cleanedResult });

  } catch (e) {
    res.status(500).json({ error: '오류: ' + e.message });
  }
}
