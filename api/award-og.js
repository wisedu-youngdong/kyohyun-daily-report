// Vercel Serverless — /api/award-og?id=studentId
// Firebase Admin 없이 Firestore REST API 사용

import { fetchAcademyName } from './_lib/academyName.js';
import { fetchAcademyIdFromIndex, fetchAcademyDocFields, renderOgShell, sendOgHtml } from './_lib/ogHelpers.js';

export default async function handler(req, res) {
  const { id } = req.query;

  let studentName = '학생';
  let academyName = null;

  if (id) {
    try {
      // studentIndex에서 먼저 academyId를 찾은 뒤 실제 학생 문서를 조회 (멀티테넌시 전환 이후 구조)
      const academyId = await fetchAcademyIdFromIndex('studentIndex', id);
      if (academyId) {
        academyName = await fetchAcademyName(academyId);
        const fields = await fetchAcademyDocFields(academyId, `students/${id}`);
        studentName = fields?.name?.stringValue || '학생';
      }
    } catch (e) {
      console.error('Firebase fetch error:', e);
    }
  }

  const siteName = academyName ? `${academyName} 데일리 리포트` : '데일리 리포트 시스템';
  const title = `${studentName} 학생 성장 시상장`;
  const desc  = '숫자를 넘어선 아이의 노력, 매 수업 진심으로 기록합니다.';

  // OG 이미지 URL — api/og에 학생 이름 전달
  const ogImg = `https://dailyreportsystem.co.kr/api/og?title=${encodeURIComponent(studentName + ' 성장 시상장')}&sub=${encodeURIComponent('GROWTH AWARD')}&academyName=${encodeURIComponent(academyName || '데일리 리포트 시스템')}`;

  const html = renderOgShell({
    title, desc, siteName, ogImg,
    ogUrl: `https://dailyreportsystem.co.kr/award/${id}`,
    redirectPath: `/award/${id}`,
    loadingText: '성장 시상으로 이동 중...',
  });

  sendOgHtml(res, html);
}
