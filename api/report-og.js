// Vercel Serverless — /api/report-og?id=reportId
// Firebase Admin 없이 Firestore REST API 사용

export default async function handler(req, res) {
  const { id } = req.query;

  let studentName = '학생';
  let dateStr     = '';
  let teacherNote = '';
  let unit        = '';

  if (id) {
    try {
      // Firebase REST API — Admin SDK 없이 공개 읽기
      // 리포트가 academies/{academyId}/reports 밑으로 옮겨가면서(멀티테넌시 전환), 이 ID가
      // 어느 학원 소속인지 최상위 reportIndex에서 먼저 찾은 뒤 실제 문서를 조회해야 함
      const PROJECT = 'kyohyun-daily-report';
      const indexUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/reportIndex/${id}`;
      const indexRes = await fetch(indexUrl);
      if (indexRes.ok) {
        const indexData = await indexRes.json();
        const academyId = indexData.fields?.academyId?.stringValue;
        if (academyId) {
          const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/academies/${academyId}/reports/${id}`;
          const r = await fetch(url);
          if (r.ok) {
            const data = await r.json();
            const f = data.fields || {};
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
      }
    } catch (e) {
      console.error('Firebase fetch error:', e);
    }
  }

  const title = `${studentName} 학생의 수업 리포트${dateStr ? ` · ${dateStr}` : ''}`;
  const desc  = teacherNote
    ? `"${teacherNote.slice(0, 60)}${teacherNote.length > 60 ? '...' : ''}"`
    : '숫자를 넘어선 아이의 노력, 매 수업 진심으로 기록합니다.';
  const unitText = unit ? ` · ${unit}` : '';

  // OG 이미지 URL — api/og에 학생 이름 전달
  const ogImg = `https://dailyreportsystem.co.kr/api/og?title=${encodeURIComponent(studentName + ' 학생 리포트')}&sub=${encodeURIComponent(dateStr + unitText)}`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${desc}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="교현학원 데일리 리포트" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:image" content="${ogImg}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="https://dailyreportsystem.co.kr/report/${id}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${ogImg}" />
  <meta name="theme-color" content="#0D2D6B" />
  <script>
    // 실제 앱으로 리다이렉트
    window.location.href = '/report/${id}';
  </script>
</head>
<body>
  <p style="font-family:sans-serif;color:#8A8A8A;padding:40px;text-align:center;">리포트로 이동 중...</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(html);
}
