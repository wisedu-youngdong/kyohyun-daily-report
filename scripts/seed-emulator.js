// 에뮬레이터 전용 시드 스크립트 — 목표 구조(academies/{academyId}/...)로 테스트 데이터를 만든다.
// 프로덕션에는 절대 연결되지 않음: FIRESTORE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST가
// 설정돼 있을 때만 admin SDK가 로컬 에뮬레이터로 연결된다.
//
// 실행: FIRESTORE_EMULATOR_HOST=localhost:8090 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 node scripts/seed-emulator.js

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('에뮬레이터 환경변수가 없습니다. 프로덕션에 잘못 연결되는 걸 막기 위해 중단합니다.');
  console.error('FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST를 설정하고 다시 실행하세요.');
  process.exit(1);
}

initializeApp({ projectId: 'kyohyun-daily-report' });
const db = getFirestore();
const auth = getAuth();

const ACADEMY_ID = 'kyohyun';
const DIRECTOR_EMAIL = 'director@test.com';
const DIRECTOR_PASSWORD = 'test1234';

async function main() {
  console.log('▸ 에뮬레이터 시드 시작...');

  // 1. 원장 Auth 계정
  let directorUid;
  try {
    const existing = await auth.getUserByEmail(DIRECTOR_EMAIL);
    directorUid = existing.uid;
    console.log(`  기존 원장 계정 재사용: ${directorUid}`);
  } catch {
    const created = await auth.createUser({ email: DIRECTOR_EMAIL, password: DIRECTOR_PASSWORD });
    directorUid = created.uid;
    console.log(`  원장 계정 생성: ${directorUid}`);
  }

  // 2. users/{uid}
  await db.doc(`users/${directorUid}`).set({ role: 'director', academyId: ACADEMY_ID });

  // 3. academies/{academyId} — 브랜딩
  await db.doc(`academies/${ACADEMY_ID}`).set({
    academyName: '교현학원',
    logoUrl: null,
    globalSkinColor: '#1A2540',
  });

  // 4. 강사
  const teacherRef = await db.collection(`academies/${ACADEMY_ID}/teachers`).add({
    name: '김선생님',
    createdAt: FieldValue.serverTimestamp(),
  });

  // 5. 학생 + studentIndex
  const studentRef = db.collection(`academies/${ACADEMY_ID}/students`).doc();
  await studentRef.set({
    name: '박지호',
    school: '교현초 5학년',
    parentPhone: '010-1234-5678',
    memo: '',
    textbooks: [{ id: 1, name: '초등 수학 5-2' }],
    studentType: 'new',
    assignedTeacherId: teacherRef.id,
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.doc(`studentIndex/${studentRef.id}`).set({ academyId: ACADEMY_ID });

  // 6. 리포트(최종 저장본) + reportIndex
  const reportRef = db.collection(`academies/${ACADEMY_ID}/reports`).doc();
  await reportRef.set({
    studentId: studentRef.id,
    studentName: '박지호',
    teacherId: teacherRef.id,
    teacherName: '김선생님',
    attendance: '정시',
    arrivalTime: '15:30',
    homeworkRating: 80,
    conceptRating: 70,
    hasTest: false,
    textbook: '초등 수학 5-2',
    subject: '수학',
    unit: '3단원 소수의 나눗셈',
    pages: '24~32쪽',
    diagnosis: [],
    teacherNote: '오늘 소수 나눗셈 개념을 잘 이해했습니다. 계산 실수만 조금 더 줄이면 좋겠어요.',
    nextPlan: '4단원 예습 진행',
    isDraft: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.doc(`reportIndex/${reportRef.id}`).set({ academyId: ACADEMY_ID });

  // 7. 방치된 draft 하나(일괄삭제 기능 테스트용)
  const draftRef = db.collection(`academies/${ACADEMY_ID}/reports`).doc();
  await draftRef.set({
    studentId: studentRef.id,
    studentName: '박지호',
    teacherId: teacherRef.id,
    teacherName: '김선생님',
    attendance: '정시',
    arrivalTime: '16:00',
    homeworkRating: 60,
    conceptRating: null,
    hasTest: false,
    textbook: '',
    subject: '수학',
    unit: '',
    diagnosis: [],
    teacherNote: '',
    isDraft: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.doc(`reportIndex/${draftRef.id}`).set({ academyId: ACADEMY_ID });

  console.log('▸ 시드 완료!');
  console.log(`  로그인: ${DIRECTOR_EMAIL} / ${DIRECTOR_PASSWORD}`);
  console.log(`  학생 ID(성장스토리 테스트용): ${studentRef.id}`);
  console.log(`  리포트 ID(공개 리포트 테스트용): ${reportRef.id}`);
  console.log(`  draft 리포트 ID(일괄삭제 테스트용): ${draftRef.id}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
