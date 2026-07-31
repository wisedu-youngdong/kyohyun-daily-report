// 파트너 랜딩(/partner)에서 "직접 열어보기"로 연결할 살아있는 데모 리포트 1건을 생성한다.
// 실제 학생 데이터가 아니라 별도 academyId('demo-academy')에 격리된 가짜 데이터라
// 교현학원 등 실제 학원 데이터와 절대 섞이지 않는다. 문서 ID를 고정값으로 써서
// 재실행해도 안전(idempotent) — set()이 매번 같은 문서를 덮어씀.
//
// 에뮬레이터에서 먼저 검증:
//   FIRESTORE_EMULATOR_HOST=localhost:8090 node scripts/seed-demo-report.js
//
// 프로덕션 실행 (별도 승인 후에만!):
//   CONFIRM_PRODUCTION_SEED=yes GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/seed-demo-report.js

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';

const ACADEMY_ID = 'demo-academy';
const REPORT_ID = 'demo-report-1';

const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

if (!isEmulator && process.env.CONFIRM_PRODUCTION_SEED !== 'yes') {
  console.error('프로덕션 실행을 막았습니다.');
  console.error('FIRESTORE_EMULATOR_HOST가 설정되지 않았는데(=프로덕션을 향함) CONFIRM_PRODUCTION_SEED=yes도 없습니다.');
  console.error('에뮬레이터로 먼저 확인하거나, 실제로 프로덕션에 실행할 의도라면 CONFIRM_PRODUCTION_SEED=yes를 설정하세요.');
  process.exit(1);
}

if (isEmulator) {
  initializeApp({ projectId: 'kyohyun-daily-report' });
} else {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath || !fs.existsSync(keyPath)) {
    console.error('GOOGLE_APPLICATION_CREDENTIALS가 없거나 파일을 찾을 수 없습니다.');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
}

const db = getFirestore();

async function main() {
  console.log('▸ 데모 리포트 시드 시작...');

  // 1. academies/demo-academy — 브랜딩만. users/teachers/students는 PublicReport.jsx가
  //    참조하지 않아 만들 필요 없음(리포트 문서 자체에 이름이 비정규화돼 있음).
  await db.doc(`academies/${ACADEMY_ID}`).set({
    academyName: '샘플학원',
    globalSkinColor: '#1A2540',
  });

  // 2. 리포트 본문 — 과장 없이 담담한 톤(CLAUDE.md "과장 표현 금지" 원칙과 동일하게 유지).
  //    사진(photoUrls)은 의도적으로 생략 — PublicReport.jsx가 photoUrls 없으면 그 섹션을
  //    자동으로 숨기므로(조건부 렌더), 실제 학생 사진을 구하거나 가짜로 만들 필요가 없다.
  await db.doc(`academies/${ACADEMY_ID}/reports/${REPORT_ID}`).set({
    studentId: 'demo-student-1', // PublicReport.jsx의 열람 기록(reportViews) addDoc이 이 필드를 그대로 읽어서
                                  // 씀 — undefined로 두면 Firestore 클라이언트 SDK가 즉시 예외를 던져
                                  // 리포트 자체는 로드됐는데도 화면이 "불러오지 못했습니다"로 넘어감
    studentName: '김민준',
    teacherName: '이수현',
    attendance: '정시',
    arrivalTime: '16:00',
    summary: '오늘은 지난주보다 계산 실수가 줄었어요. 틀린 문제도 개념보다는 계산 과정에서 나온 실수였습니다.',
    homeworkRating: 4.5, // toPct: 1~5 척도 x20 = 90%
    conceptRating: 4,    // toPct: 80%
    textbook: '쎈 수학 중2-1',
    unit: '일차함수와 그래프',
    pages: '42-47',
    hasTest: true,
    testName: '단원 확인 테스트',
    testScore: 82,
    teacherNote: '오늘 숙제 8문제 중 6문제를 맞았고, 틀린 2문제 모두 기울기 계산 실수였어요.\n두 문제 모두 개념을 몰라서 틀린 게 아니라 계산 과정에서 나온 실수라, 다음 시간엔 검산하는 습관을 같이 연습할게요.',
    wrongItems: [
      { number: 3, type: '계산 실수', memo: '기울기를 구할 때 부호를 반대로 씀' },
      { number: 7, type: '계산 실수', memo: '분수 계산에서 약분을 빠뜨림' },
    ],
    createdAt: FieldValue.serverTimestamp(),
  });

  // 3. reportIndex — PublicReport.jsx가 /report/:id를 열 때 이 리포트가 어느 학원 소속인지
  //    찾는 최상위 조회 문서(멀티테넌시 구조, 기존 리포트와 동일 패턴).
  await db.doc(`reportIndex/${REPORT_ID}`).set({ academyId: ACADEMY_ID });

  const url = isEmulator ? `(에뮬레이터) /report/${REPORT_ID}` : `https://dailyreportsystem.co.kr/report/${REPORT_ID}`;
  console.log(`▸ 완료. 데모 리포트: ${url}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
