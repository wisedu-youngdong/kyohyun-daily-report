// Vercel Serverless — /api/story-og?id=studentId
// Firebase Admin 없이 Firestore REST API 사용

import { fetchAcademyName } from './_lib/academyName.js';

export default async function handler(req, res) {
  const { id } = req.query;

  let studentName = '학생';
  let academyName = null;

  if (id) {
    try {
      // studentIndex에서 먼저 academyId를 찾은 뒤 실제 학생 문서를 조회 (멀티테넌시 전환 이후 구조)
      const PROJECT = 'kyohyun-daily-report';
      const indexUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/studentIndex/${id}`;
      const indexRes = await fetch(indexUrl);
      if (indexRes.ok) {
        const indexData = await indexRes.json();
        const academyId = indexData.fields?.academyId?.stringValue;
        if (academyId) {
          academyName = await fetchAcademyName(academyId);
          const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/academies/${academyId}/students/${id}`;
          const r = await fetch(url);
          if (r.ok) {
            const data = await r.json();
            studentName = data.fields?.name?.stringValue || '학생';
          }
        }
      }
    } catch (e) {
      console.error('Firebase fetch error:', e);
    }
  }

  const siteName = academyName ? `${academyName} 데일리 리포트` : '데일리 리포트 시스템';
  const title = `${studentName}의 성장 이야기`;
  const desc  = '숫자를 넘어선 아이의 노력, 매 수업 진심으로 기록합니다.';

  // OG 이미지 URL — api/og에 학생 이름 전달
  const ogImg = `https://dailyreportsystem.co.kr/api/og?title=${encodeURIComponent(studentName + ' 성장 이야기')}&sub=${encodeURIComponent('GROWTH STORY')}&academyName=${encodeURIComponent(academyName || '데일리 리포트 시스템')}`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${desc}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${siteName}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:image" content="${ogImg}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="https://dailyreportsystem.co.kr/story/${id}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${ogImg}" />
  <meta name="theme-color" content="#0D2D6B" />
  <script>
    // 실제 앱으로 리다이렉트
    window.location.href = '/story/${id}';
  </script>
</head>
<body>
  <p style="font-family:sans-serif;color:#8A8A8A;padding:40px;text-align:center;">성장 스토리로 이동 중...</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(html);
}
