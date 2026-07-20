// 1회성 마이그레이션 — 학생 문서(공개 get 허용)에 직접 저장돼 있던 parentPhone을
// academies/{academyId}/studentContacts/{studentId}(직원 전용 컬렉션)로 옮기고 원본 필드는 지운다.
// idempotent: parentPhone 필드가 없는 학생은 건드리지 않으므로 여러 번 실행해도 안전.
// 실행 후 이 파일은 삭제할 것 — 확인 코드가 있어도 굳이 계속 배포해둘 이유가 없음.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function getAdminDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 환경변수가 설정되지 않았습니다.');
    const serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

export default async function handler(req, res) {
  if (req.query.confirm !== 'migrate-parent-phone-now') {
    return res.status(400).json({ error: '?confirm=migrate-parent-phone-now 쿼리 파라미터가 필요합니다.' });
  }

  try {
    const db = getAdminDb();
    const academiesSnap = await db.collection('academies').get();

    let studentsMigrated = 0;
    const perAcademy = [];

    for (const academyDoc of academiesSnap.docs) {
      const academyId = academyDoc.id;
      const studentsSnap = await db.collection('academies').doc(academyId).collection('students').get();

      let migratedInAcademy = 0;
      let batch = db.batch();
      let opsInBatch = 0;

      for (const studentDoc of studentsSnap.docs) {
        const data = studentDoc.data();
        if (data.parentPhone === undefined) continue; // 이미 마이그레이션됐거나 애초에 없던 학생

        const contactRef = db.collection('academies').doc(academyId).collection('studentContacts').doc(studentDoc.id);
        batch.set(contactRef, { parentPhone: data.parentPhone || '' }, { merge: true });
        batch.update(studentDoc.ref, { parentPhone: FieldValue.delete() });
        opsInBatch += 2;
        migratedInAcademy += 1;
        studentsMigrated += 1;

        // Firestore 배치는 최대 500 연산 — 여유 있게 400에서 커밋하고 새 배치 시작
        if (opsInBatch >= 400) {
          await batch.commit();
          batch = db.batch();
          opsInBatch = 0;
        }
      }
      if (opsInBatch > 0) await batch.commit();

      if (migratedInAcademy > 0) perAcademy.push({ academyId, migrated: migratedInAcademy });
    }

    res.status(200).json({ ok: true, studentsMigrated, perAcademy });
  } catch (e) {
    console.error('parentPhone 마이그레이션 오류:', e.message);
    res.status(500).json({ error: e.message });
  }
}
