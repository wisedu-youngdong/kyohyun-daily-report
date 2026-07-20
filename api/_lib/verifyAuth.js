// AI 호출 비용이 드는 엔드포인트(polish/analyze-photo)를 로그인 없이 아무나 두드려
// Gemini 할당량을 소진시킬 수 있던 문제 — 클라이언트가 보내는 Firebase ID 토큰을 검증한다.
import { getAuth } from 'firebase-admin/auth';
import { ensureAdminApp } from './adminApp.js';

// Authorization: Bearer <idToken> 헤더를 검증해 디코드된 토큰을 돌려주고, 없거나 유효하지
// 않으면 null. 호출부에서 null이면 401로 응답하면 됨.
export async function verifyIdTokenHeader(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    ensureAdminApp();
    return await getAuth().verifyIdToken(token);
  } catch {
    return null;
  }
}
