// Vercel Serverless — 공개 리포트 페이지에서 학부모가 자기 리포트의 질문/답변을 다시 확인할 때 씀.
// Firestore 규칙상 reportQuestions의 list는 직원 전용(전체 질문 열람 방지)이라, 특정 reportId로
// 스코프한 결과만 Admin SDK로 대신 조회해서 돌려준다. 질문 등록(create)은 여전히 클라이언트에서 직접.

import { getFirestore } from 'firebase-admin/firestore';
import { ensureAdminApp } from './_lib/adminApp.js';

function getAdminDb() { ensureAdminApp(); return getFirestore(); }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const { academyId, reportId } = req.query;
    if (!academyId || !reportId) {
      return res.status(400).json({ error: '필수 정보가 없습니다.' });
    }

    const db = getAdminDb();
    const snap = await db.collection('academies').doc(academyId).collection('reportQuestions')
      .where('reportId', '==', reportId)
      .get();

    // 학부모 화면에 필요한 필드만 반환 — studentId 등은 노출하지 않음
    const questions = snap.docs
      .map(d => {
        const data = d.data();
        return {
          id: d.id,
          questionText: data.questionText || '',
          answerText: data.answerText || null,
          askedAt: data.askedAt?.seconds || 0,
        };
      })
      .sort((a, b) => a.askedAt - b.askedAt);

    res.status(200).json({ questions });
  } catch (e) {
    console.error('질문 목록 조회 오류:', e.message);
    res.status(500).json({ error: '질문 목록을 불러오지 못했습니다.' });
  }
}
