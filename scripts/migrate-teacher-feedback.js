// 선생님 피드백 3단 마이그레이션 — 이미 발송된(isDraft:false) 리포트의 teacherNote를
// "잘하고 있는 점 / 보완이 필요한 점 / 선생님 한마디" 구조(report.feedback)로 재구성해 채워넣는다.
// teacherNote/summary 원문은 절대 건드리지 않고 feedback 필드만 새로 추가 — 이미 학부모에게
// 나간 문장을 마이그레이션이 바꿔버리면 안 되기 때문(2026-08-03 결정).
// 이미 feedback이 있는 문서는 건너뛰므로 재실행해도 안전(idempotent).
//
// 기본은 드라이런(dry-run) — 대상 건수만 보여주고 아무것도 쓰지 않음. 실제로 쓰려면 --apply.
//
// 실행 전 필수 환경변수:
//   GEMINI_API_KEY                  Gemini API 키 (재구성 호출용)
//   GOOGLE_APPLICATION_CREDENTIALS  서비스 계정 키 JSON 파일 경로 (프로덕션 실행 시)
//
// 에뮬레이터에서 먼저 검증(드라이런):
//   FIRESTORE_EMULATOR_HOST=localhost:8090 GEMINI_API_KEY=... node scripts/migrate-teacher-feedback.js
// 에뮬레이터에서 실제 적용:
//   FIRESTORE_EMULATOR_HOST=localhost:8090 GEMINI_API_KEY=... node scripts/migrate-teacher-feedback.js --apply
//
// 프로덕션 실행 (드라이런으로 대상 건수 먼저 확인한 뒤에만!):
//   CONFIRM_PRODUCTION_MIGRATION=yes GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
//   GEMINI_API_KEY=실제키 node scripts/migrate-teacher-feedback.js [--apply]

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const APPLY = process.argv.includes('--apply');

if (!isEmulator && process.env.CONFIRM_PRODUCTION_MIGRATION !== 'yes') {
  console.error('프로덕션 실행을 막았습니다.');
  console.error('FIRESTORE_EMULATOR_HOST가 설정되지 않았는데(=프로덕션을 향함) CONFIRM_PRODUCTION_MIGRATION=yes 도 없습니다.');
  console.error('에뮬레이터로 먼저 검증하거나, 실제로 프로덕션에 실행할 의도라면 CONFIRM_PRODUCTION_MIGRATION=yes를 설정하세요.');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

if (isEmulator) {
  initializeApp({ projectId: 'kyohyun-daily-report' });
} else {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath || !fs.existsSync(keyPath)) {
    console.error('GOOGLE_APPLICATION_CREDENTIALS가 없거나 파일을 찾을 수 없습니다. 프로덕션 실행에는 서비스 계정 키가 필요합니다.');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
}

const db = getFirestore();

// api/polish.js의 "선생님 피드백 3단" 스키마와 동일하되, 프롬프트 프레이밍이 다름 — 여기는
// 이미 발송된 완성 문장을 새로 쓰지 않고 재구성만 함(원문 보존이 마이그레이션의 핵심 약속)
function buildFeedbackPrompt(report) {
  const wrongList = (report.wrongItems || [])
    .filter(w => w.number)
    .map(w => `${w.number}번(${w.type || ''})`)
    .join(', ');

  return `아래는 이미 학부모에게 발송된 학습 리포트의 선생님 코멘트입니다. 문장을 새로 쓰거나 다듬지 말고, 있는 내용을 그대로 "잘하고 있는 점 / 보완이 필요한 점 / 선생님 한마디" 3단으로만 재구성하세요.

[원문 코멘트]
${report.teacherNote}

${wrongList ? `[오답 문항 목록]\n${wrongList}\n\n` : ''}[재구성 규칙]
1. strengths(잘하고 있는 점): 원문에 실제로 잘한 점 언급이 있을 때만 채우세요. 없으면 null.
   - headline: 원문 내용을 압축한 결론 한 문장(새로 지어내지 말 것)
   - evidence: 0~3개, {"no": "N번" 또는 "", "text": "..."}
2. improvements(보완이 필요한 점): 원문에 오답/약점 언급이 있을 때만 채우세요. 없으면 null.
   - headline: 결론 한 문장
   - evidence: [오답 문항 목록]에 있는 번호만 no에 쓰세요(지어내지 말 것). 목록이 없으면 no는 빈 문자열로.
3. closing(선생님 한마디): 원문의 마무리 어조·격려 표현을 살려 2~4문장, 공백 포함 200자 이내로 정리하세요(넘으면 200자에서 자연스럽게 끝맺을 수 있게 미리 줄이세요). 원문 전체를 압축해도 됩니다.

아래 형식 그대로 JSON만 출력하세요(설명·코드블록 없이 JSON 객체 하나만):
{"strengths":{"headline":"...","evidence":[{"no":"...","text":"..."}]},"improvements":{"headline":"...","evidence":[{"no":"...","text":"..."}]},"closing":{"text":"..."}}
strengths 또는 improvements에 넣을 내용이 없으면 그 값을 null로, evidence가 0개면 빈 배열 []로 쓰세요.`;
}

async function generateFeedback(report) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildFeedbackPrompt(report) }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    }),
  });
  if (!response.ok) {
    throw new Error(`Gemini API 오류 ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.find(p => p.text && !p.thought)?.text || parts.find(p => p.text)?.text || '';
  if (!text) throw new Error('빈 응답');
  const parsed = JSON.parse(text.trim().replace(/^```json\s*|\s*```$/g, ''));
  if (parsed.closing?.text && parsed.closing.text.length > 200) {
    parsed.closing.text = parsed.closing.text.slice(0, 200).trim();
  }
  return parsed;
}

async function main() {
  const academiesSnap = await db.collection('academies').get();
  let totalCandidates = 0, migrated = 0, skipped = 0, failed = 0;

  for (const academyDoc of academiesSnap.docs) {
    const academyId = academyDoc.id;
    // isDraft:false(발송 완료)만 대상 — 주간형도 발송 시점엔 최상위 teacherNote(총평)가
    // 채워지므로(WeeklyReviewView.jsx) 매일형과 같은 조건으로 함께 잡힘
    const reportsSnap = await db.collection(`academies/${academyId}/reports`)
      .where('isDraft', '==', false)
      .get();

    for (const doc of reportsSnap.docs) {
      const report = doc.data();
      if (!report.teacherNote || !report.teacherNote.trim()) { skipped++; continue; }
      if (report.feedback) { skipped++; continue; } // 이미 마이그레이션됨 — idempotent
      totalCandidates++;

      if (!APPLY) {
        console.log(`[드라이런] ${academyId}/${doc.id} — 대상`);
        continue;
      }

      try {
        const feedback = await generateFeedback(report);
        await doc.ref.set({ feedback }, { merge: true });
        migrated++;
        console.log(`v ${academyId}/${doc.id} 마이그레이션 완료`);
      } catch (e) {
        failed++;
        console.error(`x ${academyId}/${doc.id} 실패: ${e.message}`);
      }
      // Gemini API 요청 속도 제한 방어 — 연속 호출 사이 짧은 간격
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log('\n=== 마이그레이션 결과 ===');
  console.log(`대상: ${totalCandidates}건, 완료: ${migrated}건, 실패: ${failed}건, 건너뜀(이미 처리됨/노트 없음): ${skipped}건`);
  if (!APPLY) console.log('드라이런 모드였습니다 — 실제로 쓰려면 --apply 플래그를 추가하세요.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
