// OG 프리뷰 3형제(report-og/story-og/award-og) 공통 로직 — 인덱스→academyId 조회,
// Firestore REST 문서 조회(Admin SDK 없이 공개 읽기), 소셜 미리보기 HTML 셸.
// 예전엔 이 로직이 세 파일에 거의 그대로 복붙돼 있었음.

const PROJECT = 'kyohyun-daily-report';

export async function fetchAcademyIdFromIndex(indexCollection, id) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${indexCollection}/${id}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.fields?.academyId?.stringValue || null;
}

// path 예: 'students/abc123', 'reports/abc123' — academies/{academyId}/ 아래 문서를 조회
export async function fetchAcademyDocFields(academyId, path) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/academies/${academyId}/${path}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.fields || null;
}

export function renderOgShell({ title, desc, siteName, ogImg, ogUrl, redirectPath, loadingText }) {
  return `<!DOCTYPE html>
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
  <meta property="og:url" content="${ogUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${ogImg}" />
  <meta name="theme-color" content="#0D2D6B" />
  <script>
    // 실제 앱으로 리다이렉트
    window.location.href = '${redirectPath}';
  </script>
</head>
<body>
  <p style="font-family:sans-serif;color:#8A8A8A;padding:40px;text-align:center;">${loadingText}</p>
</body>
</html>`;
}

export function sendOgHtml(res, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(html);
}
