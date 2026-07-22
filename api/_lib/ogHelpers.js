// OG 프리뷰 3형제(report-og/story-og/award-og) 공통 로직 — 인덱스→academyId 조회,
// Firestore REST 문서 조회(Admin SDK 없이 공개 읽기), 소셜 미리보기 HTML 셸.
// 예전엔 이 로직이 세 파일에 거의 그대로 복붙돼 있었음.
import { escapeHtml } from './email.js';

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
  // title/desc/redirectPath 등은 리포트 작성 화면에서 강사가 입력한 studentName/teacherNote/unit이나
  // URL의 id 쿼리 파라미터를 그대로 물고 들어올 수 있어(og-preview.js 참고) — 이스케이프 없이
  // 꽂으면 <meta content="..."> 속성 탈출은 물론 <script> 블록 안 redirectPath로 임의 스크립트
  // 삽입까지 가능했음(예: id=x';alert(1);//). escapeHtml은 <, >, ", ' 를 전부 엔티티로
  // 바꿔주므로 HTML 속성/텍스트 컨텍스트뿐 아니라 </script> 조기 종료, 따옴표 탈출도 함께 막는다.
  const t = escapeHtml(title), d = escapeHtml(desc), sn = escapeHtml(siteName);
  const img = escapeHtml(ogImg), url = escapeHtml(ogUrl), redirect = escapeHtml(redirectPath), loading = escapeHtml(loadingText);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t}</title>
  <meta name="description" content="${d}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${sn}" />
  <meta property="og:title" content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:image" content="${img}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${url}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image" content="${img}" />
  <meta name="theme-color" content="#0D2D6B" />
  <script>
    // 실제 앱으로 리다이렉트
    window.location.href = '${redirect}';
  </script>
</head>
<body>
  <p style="font-family:sans-serif;color:#8A8A8A;padding:40px;text-align:center;">${loading}</p>
</body>
</html>`;
}

export function sendOgHtml(res, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(html);
}
