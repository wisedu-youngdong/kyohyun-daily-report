// firebase-admin 초기화 — 예전엔 이 코드가 api/*.js 파일마다 따로 복붙돼 있었음(5곳).
// Vercel 환경변수엔 JSON을 그대로 넣으면 개행(private_key의 \n)이 깨지기 쉬워서,
// 서비스 계정 JSON 전체를 base64로 인코딩해 하나의 문자열로 저장 — 여기서 디코드.
import { initializeApp, cert, getApps } from 'firebase-admin/app';

export function ensureAdminApp() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 환경변수가 설정되지 않았습니다.');
    const serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
    initializeApp({ credential: cert(serviceAccount) });
  }
}
