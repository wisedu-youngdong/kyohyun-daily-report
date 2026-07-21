// Vercel Serverless — 공개 성장 스토리 페이지에서 "복습 효과" 증명 그래프에 쓸 완료된 복습 이력을 조회.
// Firestore 규칙상 reviews의 read/list는 직원 전용(강사가 남긴 조치 메모가 포함돼 있어서)이라,
// 특정 studentId·완료 건으로 스코프한 결과만 Admin SDK로 대신 조회해서 돌려준다.
// "복습 전 점수"는 원본 리포트(reportId)에서 가져와야 하는데, reports는 이미 클라이언트가
// (public list 허용 규칙으로) 직접 불러와 두고 있으므로 여기선 review만 반환하고 조합은 클라이언트에서 한다.

import { getFirestore } from 'firebase-admin/firestore';
import { ensureAdminApp } from './_lib/adminApp.js';

function getAdminDb() { ensureAdminApp(); return getFirestore(); }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const { academyId, studentId } = req.query;
    if (!academyId || !studentId) {
      return res.status(400).json({ error: '필수 정보가 없습니다.' });
    }

    const db = getAdminDb();
    const snap = await db.collection('academies').doc(academyId).collection('reviews')
      .where('studentId', '==', studentId)
      .where('status', '==', 'done')
      .get();

    const reviews = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        reportId: data.reportId || null,
        textbook: data.textbook || '',
        unit: data.unit || '',
        weakTypes: data.weakTypes || [],
        round: data.round || null,
        testScore: data.testScore ?? null,
        note: data.note || '',
        completedAt: data.completedAt?.seconds || 0,
      };
    }).sort((a, b) => b.completedAt - a.completedAt);

    res.status(200).json({ reviews });
  } catch (e) {
    console.error('복습 이력 조회 오류:', e.message);
    res.status(500).json({ error: '복습 이력을 불러오지 못했습니다.' });
  }
}
