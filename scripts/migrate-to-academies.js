// 멀티테넌시 마이그레이션 — 기존 flat 컬렉션을 academies/{academyId}/... 구조로 복사한다.
// 기존 컬렉션은 삭제하지 않는다(롤백 경로 보존). set()으로 매번 다시 계산해서 쓰므로 재실행해도 안전(idempotent).
//
// 실행 전 필수 환경변수:
//   DIRECTOR_EMAIL              원장 계정 이메일 (기존 users 컬렉션에 문서가 없는 계정 — Auth에서 UID 조회용)
//   GOOGLE_APPLICATION_CREDENTIALS  서비스 계정 키 JSON 파일 경로 (프로덕션 실행 시)
// 선택:
//   GLOBAL_SKIN_COLOR            학원 기본 스킨 색상 hex (기본값 아래 DEFAULT_SKIN_COLOR)
//
// 에뮬레이터에서 먼저 검증:
//   FIRESTORE_EMULATOR_HOST=localhost:8090 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
//   DIRECTOR_EMAIL=director@test.com node scripts/migrate-to-academies.js
//
// 프로덕션 실행 (별도 승인 후에만!):
//   CONFIRM_PRODUCTION_MIGRATION=yes GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
//   DIRECTOR_EMAIL=실제원장이메일 node scripts/migrate-to-academies.js

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';

const ACADEMY_ID = 'kyohyun';
const ACADEMY_NAME = '교현학원';
const DEFAULT_SKIN_COLOR = '#1A2540';
const CHUNK_SIZE = 400;

const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

if (!isEmulator && process.env.CONFIRM_PRODUCTION_MIGRATION !== 'yes') {
  console.error('프로덕션 실행을 막았습니다.');
  console.error('FIRESTORE_EMULATOR_HOST가 설정되지 않았는데(=프로덕션을 향함) CONFIRM_PRODUCTION_MIGRATION=yes 도 없습니다.');
  console.error('에뮬레이터로 먼저 검증하거나, 실제로 프로덕션에 실행할 의도라면 CONFIRM_PRODUCTION_MIGRATION=yes를 설정하세요.');
  process.exit(1);
}

const DIRECTOR_EMAIL = process.env.DIRECTOR_EMAIL;
if (!DIRECTOR_EMAIL) {
  console.error('DIRECTOR_EMAIL 환경변수가 필요합니다 (기존 users 컬렉션에 문서가 없는 원장 계정의 이메일).');
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
const auth = getAuth();

async function commitInChunks(writes) {
  for (let i = 0; i < writes.length; i += CHUNK_SIZE) {
    const batch = db.batch();
    for (const { ref, data } of writes.slice(i, i + CHUNK_SIZE)) {
      batch.set(ref, data);
    }
    await batch.commit();
  }
}

// 단순 복사 컬렉션: 문서 그대로 academies/{ACADEMY_ID}/{name}/{같은 ID}로
async function migratePlainCollection(name) {
  const snap = await db.collection(name).get();
  const writes = snap.docs.map(d => ({
    ref: db.doc(`academies/${ACADEMY_ID}/${name}/${d.id}`),
    data: d.data(),
  }));
  await commitInChunks(writes);
  return { old: snap.size, migrated: writes.length, ids: snap.docs.map(d => d.id) };
}

// students/reports: 본 문서 복사 + 인덱스 문서 생성
async function migrateWithIndex(name, indexName) {
  const snap = await db.collection(name).get();
  const writes = [];
  for (const d of snap.docs) {
    writes.push({ ref: db.doc(`academies/${ACADEMY_ID}/${name}/${d.id}`), data: d.data() });
    writes.push({ ref: db.doc(`${indexName}/${d.id}`), data: { academyId: ACADEMY_ID } });
  }
  await commitInChunks(writes);
  return { old: snap.size, migrated: snap.size, ids: snap.docs.map(d => d.id) };
}

async function migrateBranding() {
  const brandingSnap = await db.doc('settings/branding').get();
  const branding = brandingSnap.exists ? brandingSnap.data() : {};
  const skinColor = process.env.GLOBAL_SKIN_COLOR || DEFAULT_SKIN_COLOR;
  await db.doc(`academies/${ACADEMY_ID}`).set({
    ...branding,
    academyName: ACADEMY_NAME,
    globalSkinColor: skinColor,
  }, { merge: true });
  return { hadBranding: brandingSnap.exists, skinColor };
}

// users: 기존 flat 컬렉션(teachers 등, uid 필드로 찾던 방식)을 users/{uid}로 재작성 + 원장 계정 별도 생성
async function migrateUsers() {
  const snap = await db.collection('users').get();
  const writes = [];
  for (const d of snap.docs) {
    const data = d.data();
    if (!data.uid) {
      // uid 필드가 없다는 건 이미 users/{uid} 새 구조로 재작성된 문서(재실행 시 자기 자신)라는 뜻 — 정상, 건너뜀
      console.log(`  (users/${d.id}: 이미 새 구조 문서로 보여 건너뜀 — 재실행 시 정상)`);
      continue;
    }
    const { uid, ...rest } = data;
    writes.push({ ref: db.doc(`users/${uid}`), data: { ...rest, academyId: ACADEMY_ID } });
  }

  let directorUid = null;
  try {
    const directorRecord = await auth.getUserByEmail(DIRECTOR_EMAIL);
    directorUid = directorRecord.uid;
    writes.push({
      ref: db.doc(`users/${directorUid}`),
      data: { role: 'director', academyId: ACADEMY_ID, email: DIRECTOR_EMAIL },
    });
  } catch (e) {
    console.error(`  원장 계정(${DIRECTOR_EMAIL})을 Auth에서 찾을 수 없습니다: ${e.message}`);
    process.exit(1);
  }

  await commitInChunks(writes);
  return { old: snap.size, migrated: writes.length, directorUid };
}

async function main() {
  console.log(`▸ 마이그레이션 시작 (대상: ${isEmulator ? '에뮬레이터' : '⚠️ 프로덕션'}, academyId=${ACADEMY_ID})`);
  console.log('');

  const results = {};

  for (const name of ['teachers', 'reviews', 'commentTemplates', 'reportViews']) {
    results[name] = await migratePlainCollection(name);
    console.log(`  ${name}: ${results[name].old}건 → ${results[name].migrated}건 복사`);
  }

  results.students = await migrateWithIndex('students', 'studentIndex');
  console.log(`  students: ${results.students.old}건 → ${results.students.migrated}건 복사 (+studentIndex)`);

  results.reports = await migrateWithIndex('reports', 'reportIndex');
  console.log(`  reports: ${results.reports.old}건 → ${results.reports.migrated}건 복사 (+reportIndex)`);

  results.branding = await migrateBranding();
  console.log(`  settings/branding → academies/${ACADEMY_ID} 병합 (기존 브랜딩 문서 존재: ${results.branding.hadBranding}, 스킨색: ${results.branding.skinColor})`);

  results.users = await migrateUsers();
  console.log(`  users: 기존 ${results.users.old}건 + 원장 1건 → users/{uid} ${results.users.migrated}건 (원장 uid: ${results.users.directorUid})`);

  console.log('');
  console.log('▸ 검증: 원본 문서 ID가 신규 컬렉션에 전부 존재하는지 확인 (신규 쪽에 이미 다른 문서가 있어도 무관)');
  for (const name of ['students', 'teachers', 'reports', 'reviews', 'commentTemplates', 'reportViews']) {
    const missing = [];
    for (const id of results[name].ids) {
      const newDoc = await db.doc(`academies/${ACADEMY_ID}/${name}/${id}`).get();
      if (!newDoc.exists) missing.push(id);
    }
    const match = missing.length === 0 ? '✓' : `✗ 누락 ${missing.length}건: ${missing.join(', ')}`;
    console.log(`  ${name}: 원본 ${results[name].old}건 중 이관 확인 ${match}`);
  }

  const oldStudentsSnap = await db.collection('students').limit(1).get();
  if (!oldStudentsSnap.empty) {
    const oldDoc = oldStudentsSnap.docs[0];
    const newDoc = await db.doc(`academies/${ACADEMY_ID}/students/${oldDoc.id}`).get();
    const oldKeys = Object.keys(oldDoc.data()).sort();
    const newKeys = Object.keys(newDoc.data()).sort();
    const same = JSON.stringify(oldKeys) === JSON.stringify(newKeys);
    console.log(`  샘플 students/${oldDoc.id} 필드 일치: ${same ? '✓' : `✗ (원본: ${oldKeys}, 신규: ${newKeys})`}`);
  }

  console.log('');
  console.log('▸ 마이그레이션 완료. 기존 flat 컬렉션은 삭제하지 않았습니다 (롤백 경로 보존).');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
