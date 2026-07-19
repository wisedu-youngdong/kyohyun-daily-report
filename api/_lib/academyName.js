// _lib로 시작하는 폴더는 Vercel이 라우트로 만들지 않음 — report-og/story-og/award-og
// 세 파일이 공유하는 순수 헬퍼 전용 위치.
export async function fetchAcademyName(academyId) {
  if (!academyId) return null;
  try {
    const PROJECT = 'kyohyun-daily-report';
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/academies/${academyId}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.fields?.academyName?.stringValue || null;
  } catch {
    return null;
  }
}
