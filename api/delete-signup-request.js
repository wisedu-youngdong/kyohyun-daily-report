// Vercel Serverless — 학원 가입 신청(대기/거절 상태) 삭제. 클라이언트 SDK로는 남의 Auth 계정을
// 못 지우므로 Admin SDK가 필요함. 파괴적 동작이라 두 겹으로 방어:
//   1. Authorization 헤더의 ID 토큰을 검증해 호출자가 플랫폼 관리자인지 확인
//   2. 대상 신청이 'approved'면 거부 — 이미 실제 학원이 된 계정을 실수로 지우는 것 방지
//      (클라이언트 UI도 승인된 건에는 삭제 버튼을 안 보여주지만, 서버에서도 다시 확인)
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function getAdmin() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 환경변수가 설정되지 않았습니다.');
    const serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
    initializeApp({ credential: cert(serviceAccount) });
  }
  return { auth: getAuth(), db: getFirestore() };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { uid } = req.body || {};
    if (!uid || typeof uid !== 'string') {
      return res.status(400).json({ error: '삭제할 신청의 uid가 필요합니다.' });
    }

    const idToken = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!idToken) return res.status(401).json({ error: '인증 정보가 없습니다.' });

    const { auth, db } = getAdmin();
    let callerUid;
    try {
      callerUid = (await auth.verifyIdToken(idToken)).uid;
    } catch {
      return res.status(401).json({ error: '유효하지 않은 인증 정보입니다.' });
    }

    const callerSnap = await db.collection('users').doc(callerUid).get();
    if (!callerSnap.exists || callerSnap.data().isPlatformAdmin !== true) {
      return res.status(403).json({ error: '플랫폼 관리자만 삭제할 수 있습니다.' });
    }

    const requestRef = db.collection('academySignupRequests').doc(uid);
    const requestSnap = await requestRef.get();
    if (requestSnap.exists && requestSnap.data().status === 'approved') {
      return res.status(400).json({ error: '이미 승인되어 학원이 된 신청은 여기서 삭제할 수 없습니다.' });
    }

    // Auth 계정이 이미 없어도(수동으로 콘솔에서 지웠거나 등) 나머지 정리는 계속 진행
    try {
      await auth.deleteUser(uid);
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
    }
    await requestRef.delete();
    await db.collection('users').doc(uid).delete();

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('가입 신청 삭제 오류:', e.message);
    res.status(500).json({ error: '삭제 중 오류가 발생했습니다.' });
  }
}
