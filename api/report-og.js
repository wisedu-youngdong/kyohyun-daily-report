// Vercel Serverless — /api/report-og?id=reportId
// Firebase Admin 없이 Firestore REST API 사용

import { fetchAcademyName } from './_lib/academyName.js';
import { fetchAcademyIdFromIndex, fetchAcademyDocFields, renderOgShell, sendOgHtml } from './_lib/ogHelpers.js';

export default async function handler(req, res) {
  const { id } = req.query;

  let studentName = '학생';
  let dateStr     = '';
  let teacherNote = '';
  let unit        = '';
  let academyName = null;

  if (id) {
    try {
      // 리포트가 academies/{academyId}/reports 밑으로 옮겨가면서(멀티테넌시 전환), 이 ID가
      // 어느 학원 소속인지 최상위 reportIndex에서 먼저 찾은 뒤 실제 문서를 조회해야 함
      const academyId = await fetchAcademyIdFromIndex('reportIndex', id);
      if (academyId) {
        academyName = await fetchAcademyName(academyId);
        const f = await fetchAcademyDocFields(academyId, `reports/${id}`);
        if (f) {
          studentName = f.studentName?.stringValue || '학생';
          unit        = f.unit?.stringValue || '';
          teacherNote = f.teacherNote?.stringValue || '';

          const ts = f.createdAt?.timestampValue;
          if (ts) {
            const d = new Date(ts);
            dateStr = `${d.getMonth() + 1}월 ${d.getDate()}일`;
          }
        }
      }
    } catch (e) {
      console.error('Firebase fetch error:', e);
    }
  }

  const siteName = academyName ? `${academyName} 데일리 리포트` : '데일리 리포트 시스템';
  const title = `${studentName} 학생의 수업 리포트${dateStr ? ` · ${dateStr}` : ''}`;
  const desc  = teacherNote
    ? `"${teacherNote.slice(0, 60)}${teacherNote.length > 60 ? '...' : ''}"`
    : '숫자를 넘어선 아이의 노력, 매 수업 진심으로 기록합니다.';
  const unitText = unit ? ` · ${unit}` : '';

  // OG 이미지 URL — api/og에 학생 이름 전달
  const ogImg = `https://dailyreportsystem.co.kr/api/og?title=${encodeURIComponent(studentName + ' 학생 리포트')}&sub=${encodeURIComponent(dateStr + unitText)}&academyName=${encodeURIComponent(academyName || '데일리 리포트 시스템')}`;

  const html = renderOgShell({
    title, desc, siteName, ogImg,
    ogUrl: `https://dailyreportsystem.co.kr/report/${id}`,
    redirectPath: `/report/${id}`,
    loadingText: '리포트로 이동 중...',
  });

  sendOgHtml(res, html);
}
