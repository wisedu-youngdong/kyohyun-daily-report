import { verifyIdTokenHeader } from './_lib/verifyAuth.js';
import { ensureAdminApp } from './_lib/adminApp.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { buildPrompt } from './_lib/analyzePrompt.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
  // 사진 여러 장을 병렬로 여러 번 Gemini 호출하면서(아래 참고) 각 호출이 20~30초씩 걸릴 수 있어
  // Vercel 기본 타임아웃(플랜에 따라 10초)보다 여유를 둠. 병렬이라 총 소요 시간은 "가장 느린
  // 한 장"에 수렴하므로 5장이어도 60초면 충분할 것으로 판단.
  maxDuration: 60,
};

// 채점 판정에 쓸 수 있는 모델 목록. A/B 비교용으로 요청마다 바꿔 낄 수 있지만, 클라이언트가
// 보낸 문자열을 그대로 URL에 넣으면 임의의(=훨씬 비싼) 모델을 호출당할 수 있어 화이트리스트로
// 제한한다. 기본값은 환경변수로 바꿀 수 있게 해서, 비교가 끝나 승자가 정해지면 코드 수정 없이
// Vercel 환경변수만 바꿔 전환하면 된다.
const ALLOWED_MODELS = [
  'gemini-2.5-pro',       // 현재 기본값 — 정확도 기준으로 채택돼 있던 모델
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.1-pro-preview',
];
const DEFAULT_MODEL = ALLOWED_MODELS.includes(process.env.GEMINI_ANALYZE_MODEL)
  ? process.env.GEMINI_ANALYZE_MODEL
  : 'gemini-2.5-pro';
const resolveModel = (requested) => (ALLOWED_MODELS.includes(requested) ? requested : DEFAULT_MODEL);

// Gemini가 unreadable:true로 판정한 결과를 기존 실패 경로(ok:false)로 변환한다 — 이렇게 하면
// 아래 handler의 "한 장이라도 실패하면 전체 미차감" 로직을 그대로 재사용할 수 있어 별도
// 크레딧 처리 코드가 필요 없다. 사진 품질 문제로 판독 자체가 안 되는 경우 크레딧을 받고
// 쓸모없는 결과를 주는 것보다, 재촬영을 안내하고 이번 호출은 무료로 처리하는 편이 낫다.
function finalizeParsed(parsed) {
  if (parsed && parsed.unreadable === true) {
    const reason = parsed.unreadableReason ? ` (${parsed.unreadableReason})` : '';
    return { ok: false, error: `사진에서 채점 표시를 읽을 수 없어요${reason}. 빛 반사 없이, 채점 표시가 화면에 다 들어오게 다시 찍어서 올려주세요.` };
  }
  return { ok: true, data: parsed };
}

// 이미지 한 장에 대해 Gemini를 호출하고 정제된 JSON을 돌려준다. 실패 시 { ok:false, error }.
async function analyzeOneImage(img, mode, hintTextbook, hintUnit, hintSubject, model = DEFAULT_MODEL) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  // pageCount는 항상 1 — 이 함수는 사진 한 장만 본다(아래 handler의 사진별 분리 호출 설계 참고)
  const prompt = buildPrompt(mode || 'auto', hintTextbook, hintUnit, 1, hintSubject);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: img.mimeType || 'image/jpeg', data: img.imageBase64 } }
        ]
      }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        maxOutputTokens: 65536
      }
    })
  });

  const data = await response.json();

  // 토큰 사용량 — 모델 비교 시 "얼마나 더 비싼가"를 추정이 아니라 실측으로 보기 위해 같이 올려보냄.
  // thoughts(내부 추론) 토큰은 별도 필드로 오는데 과금은 출력 토큰과 같은 단가라 합산한다.
  const um = data.usageMetadata || {};
  const usage = {
    promptTokens: um.promptTokenCount || 0,
    outputTokens: (um.candidatesTokenCount || 0) + (um.thoughtsTokenCount || 0),
    cachedTokens: um.cachedContentTokenCount || 0,
  };
  const withUsage = (result) => ({ ...result, usage });

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
    return { ok: false, error: userMsg };
  }

  const finishReason = data.candidates?.[0]?.finishReason;
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (!rawText) {
    console.error('Gemini 응답 없음. finishReason:', finishReason, 'full:', JSON.stringify(data));
    let reasonMsg = `AI가 응답하지 않았습니다. (finishReason: ${finishReason || '알수없음'}) 잠시 후 다시 시도해주세요.`;
    if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
      reasonMsg = '이미지가 안전 필터에 걸려 분석하지 못했습니다. 다른 사진으로 시도해주세요.';
    } else if (finishReason === 'MAX_TOKENS') {
      reasonMsg = '이 사진 한 장만으로도 응답이 중간에 잘렸습니다. 페이지를 나눠서 다시 찍어주세요.';
    }
    return { ok: false, error: reasonMsg };
  }

  const cleaned = rawText.replace(/```json|```/g, '').trim();

  try {
    return withUsage(finalizeParsed(JSON.parse(cleaned)));
  } catch {
    if (finishReason === 'MAX_TOKENS') {
      console.error('MAX_TOKENS로 응답 잘림. 길이:', cleaned.length);
      return { ok: false, error: '이 사진 한 장만으로도 응답이 중간에 잘렸습니다. 페이지를 나눠서 다시 찍어주세요.' };
    }
    // 앞뒤에 설명 텍스트가 섞였을 경우 첫 '{' ~ 마지막 '}' 구간만 추출해 재시도
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return withUsage(finalizeParsed(JSON.parse(cleaned.slice(start, end + 1))));
      } catch {
        console.error('JSON 파싱 2차 실패:', cleaned);
        return { ok: false, error: 'AI 응답을 정리하지 못했습니다. 다시 시도하거나 직접 입력해주세요.' };
      }
    }
    console.error('JSON 파싱 실패:', cleaned);
    return { ok: false, error: 'AI 응답을 정리하지 못했습니다. 다시 시도하거나 직접 입력해주세요.' };
  }
}

// 한 장씩 분리 호출(위 analyzeOneImage)로도 여전히 특정 번호를 놓치는 경우가 실사용 중
// 확인됨 — 같은 사진을 같은 프롬프트로 다시 불러도(temperature:0) 결과가 매번 똑같지 않다는
// 뜻이라(Gemini API가 문서상으로도 완전한 결정론을 보장하지 않음), 재시도 자체가 무의미하지
// 않다. identifiedNumbers엔 있는데 problemTypes/weakDetail 어디에도 없는 "붕 뜬" 번호만 골라
// 그 번호만 콕 집어 한 번 더 확인시킨다 — 매번 전체를 다시 부르는 것보다 훨씬 저렴하고,
// 애초에 놓친 적 없는 사진은 이 재확인 호출 자체가 안 붙는다.
function findMissingNumbers(sections) {
  const groups = [];
  (sections || []).forEach((s, sectionIdx) => {
    const known = new Set([
      ...(s.problemTypes || []).map(p => p.number),
      ...(s.weakDetail || []).map(p => p.number),
    ]);
    const missing = (s.identifiedNumbers || []).filter(n => !known.has(n));
    if (missing.length > 0) {
      groups.push({ sectionIdx, sectionType: s.sectionType, bookSection: s.bookSection, numbers: missing });
    }
  });
  return groups;
}

// 놓친 번호만 짚어 다시 확인시키고 { number, mark, type }[] 를 돌려준다. 실패해도 그냥 빈
// 배열을 돌려줘 1차 결과는 그대로 살아있게 한다(재확인은 "있으면 좋은 보강"이지 필수 단계가 아님).
async function recheckMissingNumbers(img, missingGroups, model = DEFAULT_MODEL) {
  const listText = missingGroups.map(g =>
    `- ${g.bookSection ? `"${g.bookSection}" 섹션의 ` : ''}문항 번호: ${g.numbers.join(', ')}`
  ).join('\n');

  const prompt = `첨부한 사진은 채점 완료된 학습지/문제집입니다. 1차 분석에서 아래 문항 번호들은 번호 자체는 확인됐지만 채점 표시(정답 원 / 오답 사선)를 찾지 못해 결과에서 제외됐습니다.
${listText}

이 번호들에 대해서만, 이 사진에서 채점 표시를 아주 꼼꼼하게 다시 찾아주세요. 번호 바로 옆이나 근처의 아주 작고 흐릿한 원/사선도 놓치지 마세요. 다른 문항은 볼 필요 없습니다.

각 번호마다 다음 중 하나로만 판정하세요:
- "정답": 번호를 감싸거나 걸치는 원이 있음(느슨해도 원이면 정답)
- "오답": 번호 옆에 사선(빗금)이 있음(아무리 작아도)
- "표시없음": 다시 봐도 정말 아무 채점 표시가 없음(못 찾은 게 아니라 확신할 때만)

각 항목에 box_2d([ymin,xmin,ymax,xmax], 이미지 전체를 0~1000으로 정규화, 번호+채점 표시를
함께 감싸는 영역)도 같이 반환하세요.

JSON만 출력:
{"results": [{"number": "03", "mark": "정답" | "오답" | "표시없음", "type": "문제 내용 5~10자 키워드(모르면 빈 문자열)", "box_2d": [0,0,0,0]}]}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: img.mimeType || 'image/jpeg', data: img.imageBase64 } }
          ]
        }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 4096 }
      })
    });
    const data = await response.json();
    const um = data.usageMetadata || {};
    const usage = {
      promptTokens: um.promptTokenCount || 0,
      outputTokens: (um.candidatesTokenCount || 0) + (um.thoughtsTokenCount || 0),
      cachedTokens: um.cachedContentTokenCount || 0,
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return { results: Array.isArray(parsed.results) ? parsed.results : [], usage };
  } catch (e) {
    console.error('재확인 호출 실패(1차 결과 그대로 사용):', e.message);
    return { results: [], usage: null };
  }
}

// 두 호출의 토큰 사용량을 합산 — 한 장을 처리하는 데 실제로 들어간 총량
function addUsage(a, b) {
  if (!b) return a;
  if (!a) return b;
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
  };
}

// 재확인 호출 한 번에 잡아두는 시간. 이만큼도 안 남았으면 시작조차 하지 않는다.
const RECHECK_BUDGET_MS = 20000;

// analyzeOneImage + 놓친 번호 재확인을 한 세트로 묶은 함수. concept 섹션(유형별 문항, 이
// 서비스에서 가장 흔한 형태)만 병합 지원 — mock_exam은 원래 오답만 기록하는 구조(weakDetail)라
// "정답으로 재확인됨"을 끼워 넣을 자리가 없고, calculation은 문항별 상세가 아예 없어 해당 없음.
//
// deadlineAt: 이 시각까지는 결과를 돌려줘야 한다(handler가 maxDuration에서 역산해 넘겨줌).
// 재확인은 2차 Gemini 호출이라 1차와 합치면 한 장에 60초를 넘길 수 있는데, maxDuration에
// 걸려 함수가 통째로 죽으면 멀쩡히 끝난 1차 결과까지 같이 날아가고 사용자는 타임아웃만 본다.
// 재확인은 코드 주석대로 "있으면 좋은 보강"이지 필수 단계가 아니므로, 시간이 모자라면
// 건너뛰고 1차 결과를 살려서 돌려주는 쪽이 항상 낫다.
async function analyzeOneImageWithRecheck(img, mode, hintTextbook, hintUnit, hintSubject, deadlineAt, model) {
  const first = await analyzeOneImage(img, mode, hintTextbook, hintUnit, hintSubject, model);
  if (!first.ok) return first;

  const sections = first.data.sections || [];
  const missingGroups = findMissingNumbers(sections);
  if (missingGroups.length === 0) return first;

  if (deadlineAt && deadlineAt - Date.now() < RECHECK_BUDGET_MS) {
    console.warn(`남은 시간 부족 — 놓친 번호 재확인 건너뜀 (남은 ${Math.max(0, deadlineAt - Date.now())}ms)`);
    return first;
  }

  const { results: recheckResults, usage: recheckUsage } = await recheckMissingNumbers(img, missingGroups, model);
  const usage = addUsage(first.usage, recheckUsage);
  if (recheckResults.length === 0) return { ...first, usage };

  const byNumber = new Map(recheckResults.map(r => [r.number, r]));
  missingGroups.forEach(g => {
    if (g.sectionType !== 'concept') return;
    const s = sections[g.sectionIdx];
    g.numbers.forEach(number => {
      const r = byNumber.get(number);
      if (!r || (r.mark !== '정답' && r.mark !== '오답')) return; // 표시없음/응답누락 → missing 상태 그대로 유지
      s.problemTypes = [...(s.problemTypes || []), {
        number,
        type: r.type || '',
        mark: r.mark === '정답' ? '원' : '사선',
        result: r.mark === '정답' ? '잘함' : '약점',
        note: '',
        confidence: 'low',
        box_2d: r.box_2d,
      }];
    });
  });

  return { ok: true, data: { ...first.data, sections }, usage };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  // maxDuration(60초)에 걸려 함수가 강제 종료되면 응답 자체가 없어서 클라이언트는 원인도 모른 채
  // 타임아웃만 본다. 여기서 시작 시각을 잡아 "Gemini 작업은 언제까지"라는 마감을 만들고,
  // 남은 여유(아래 상수)는 크레딧 차감·응답 직렬화 같은 마무리 작업 몫으로 남겨둔다.
  const startedAt = Date.now();
  const geminiDeadline = startedAt + 52000;
  const decoded = await verifyIdTokenHeader(req);
  if (!decoded) return res.status(401).json({ error: '로그인이 필요합니다.' });

  try {
    const { images, imageBase64, mimeType, hintTextbook, hintUnit, hintSubject, mode, model: requestedModel } = req.body;
    // images: [{ imageBase64, mimeType }] 배열 (신규, 다중 업로드). 없으면 구버전 단일 imageBase64로 fallback.
    const imageList = Array.isArray(images) && images.length > 0
      ? images
      : (imageBase64 ? [{ imageBase64, mimeType }] : []);
    if (imageList.length === 0) return res.status(400).json({ error: '이미지가 없습니다.' });

    // 사진 분석은 건당 크레딧이 나가는 유료 호출 — Gemini를 부르기 전에 먼저 크레딧을 확인.
    // academyId는 클라이언트가 아니라 로그인 토큰(uid)으로 서버에서 직접 조회 — 클라이언트가
    // 다른 학원 ID를 보내 크레딧을 대신 소진시키는 걸 막기 위함.
    ensureAdminApp();
    const db = getFirestore();
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    const academyId = userSnap.exists ? userSnap.data().academyId : null;
    if (!academyId) return res.status(403).json({ error: '학원 정보를 확인할 수 없습니다.' });

    // 모델 교체는 A/B 비교용이라 플랫폼 관리자만 허용 — 일반 학원 계정이 임의로 더 비싼 모델을
    // 고르면 서비스가 비용을 그대로 떠안는다(크레딧은 모델과 무관하게 1회만 차감되므로).
    // 이미 읽어둔 userSnap을 그대로 써서 추가 조회 비용은 없음.
    const isPlatformAdmin = userSnap.data().isPlatformAdmin === true;
    const model = isPlatformAdmin ? resolveModel(requestedModel) : DEFAULT_MODEL;
    const billingRef = db.collection('academies').doc(academyId).collection('private').doc('billing');
    const billingSnap = await billingRef.get();
    const billingData = billingSnap.exists ? billingSnap.data() : {};
    // 무제한 학원(예: 자체 운영 학원) — 잔액 체크/차감을 건너뜀. SettingsView "무제한" 토글로 설정
    const isUnlimited = billingData.unlimited === true;
    const creditBalance = billingData.creditBalance || 0;
    if (!isUnlimited && creditBalance <= 0) {
      return res.status(200).json({ error: '크레딧이 부족합니다. 원장님께 문의해 충전 후 다시 시도해주세요.' });
    }

    // 사진마다 독립적으로(1장씩) Gemini를 병렬 호출 — 여러 장을 한 번에 한 호출로 보내면
    // 특정 사진에 쏟는 주의력이 떨어져, 그 사진 혼자 분석했을 땐 정상 인식되던 채점 표시를
    // 놓치는 현상이 실사용 중 반복 확인됨(3장/5장 모두 재현, 1장씩은 항상 정상). 장수와
    // 무관하게 크레딧은 이 요청 전체에 대해 1건만 차감 — 늘어난 Gemini API 비용은 서비스가
    // 흡수(가격 정책상 결정됨). 한 장이라도 실패하면 전체를 실패로 처리해 크레딧을 안 뗌 —
    // 일부만 성공한 결과를 그대로 돌려주면 "표시가 있는데도 빠진" 문제를 또 만드는 셈이라
    // 절반의 결과보다는 명확한 재시도 요청이 안전함.
    const geminiStartedAt = Date.now();
    const results = await Promise.all(
      imageList.map(img => analyzeOneImageWithRecheck(img, mode, hintTextbook, hintUnit, hintSubject, geminiDeadline, model))
    );
    // 모델별 속도 비교의 근거 — Vercel 로그에서 바로 확인할 수 있게 남긴다
    console.log(`[분석완료] model=${model} 사진=${imageList.length}장 Gemini=${Date.now() - geminiStartedAt}ms 전체=${Date.now() - startedAt}ms`);
    const failIdx = results.findIndex(r => !r.ok);
    if (failIdx !== -1) {
      const prefix = imageList.length > 1 ? `${failIdx + 1}번째 사진 분석 실패 — ` : '';
      return res.status(200).json({ error: prefix + results[failIdx].error });
    }

    // 각 사진 결과를 병합. photoIndex는 모델이 스스로 알 수 없는 값(한 장씩만 봤으므로)이라
    // 여기서 원본 업로드 순서(1-based) 기준으로 항상 명시적으로 덮어씀 — 클라이언트의 책 섹션
    // 판별(photoSections.js)과 사진별 그룹 UI가 이 값에 의존하므로 반드시 정확해야 함.
    const merged = {
      rawObservations: [],
      bookOrTest: '', unit: '', pageRange: '', pageType: 'concept',
      pageCutoff: false, pageCutoffNote: '',
      wrongItems: [], sections: [],
      // 모델 비교용 측정값 — 어떤 모델이 얼마나 걸렸고 토큰을 얼마나 썼는지.
      // 관리자 화면에 그대로 표시해 속도·비용을 실측으로 비교한다.
      meta: {
        model,
        elapsedMs: 0,
        usage: results.reduce((acc, r) => addUsage(acc, r.usage), null),
      },
    };
    results.forEach((r, i) => {
      const pi = i + 1;
      const d = r.data || {};
      if (Array.isArray(d.rawObservations)) {
        merged.rawObservations.push(...d.rawObservations.map(o =>
          imageList.length > 1 ? `(${pi}번째 사진) ${o}` : o
        ));
      }
      if (!merged.bookOrTest && d.bookOrTest) merged.bookOrTest = d.bookOrTest;
      if (!merged.unit && d.unit) merged.unit = d.unit;
      if (!merged.pageRange && d.pageRange) merged.pageRange = d.pageRange;
      if (d.pageType) merged.pageType = d.pageType;
      if (d.pageCutoff) {
        merged.pageCutoff = true;
        const note = d.pageCutoffNote ? `${pi}번째 사진: ${d.pageCutoffNote}` : `${pi}번째 사진`;
        merged.pageCutoffNote = [merged.pageCutoffNote, note].filter(Boolean).join(' / ');
      }
      (d.wrongItems || []).forEach(item => merged.wrongItems.push({ ...item, photoIndex: pi }));
      (d.sections || []).forEach(sec => merged.sections.push({ ...sec, photoIndex: pi }));
    });

    // 실제로 쓸 수 있는 결과를 돌려줄 때만 차감 — 위에서 하나라도 실패하면 여기 도달하지 않으므로
    // 실패한 요청에는 크레딧이 나가지 않음. 무제한 학원은 차감을 건너뜀(잔액 필드 자체를 안
    // 건드림) — 사용 내역 기록은 그대로 남겨서 무제한이어도 실제 사용량은 계속 볼 수 있게 함
    if (!isUnlimited) {
      await billingRef.update({ creditBalance: FieldValue.increment(-1) });
    }
    // 사용 내역 — 원장/플랫폼 관리자가 "이 학원이 언제 얼마나 썼는지" 조회할 수 있게 기록.
    // teacherEmail은 토큰 클레임에 이미 있어 추가 조회 없이 무료로 붙일 수 있음
    db.collection('academies').doc(academyId).collection('creditUsage').add({
      teacherUid: decoded.uid,
      teacherEmail: decoded.email || null,
      hintTextbook: hintTextbook || null,
      hintUnit: hintUnit || null,
      photoCount: imageList.length,
      model, // 비교 기간에 어떤 모델로 처리된 건인지 사용 내역에서 구분할 수 있게 함께 남김
      balanceAfter: isUnlimited ? null : creditBalance - 1,
      unlimited: isUnlimited,
      usedAt: FieldValue.serverTimestamp(),
    }).catch(e => console.error('크레딧 사용 로그 기록 실패(과금엔 영향 없음):', e.message));
    merged.meta.elapsedMs = Date.now() - startedAt;
    res.status(200).json(merged);
  } catch (e) {
    console.error('사진분석 에러:', e.message);
    res.status(500).json({ error: '오류: ' + e.message });
  }
}
