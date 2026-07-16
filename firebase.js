import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBsjbqwj6aN2dS1xKUc5i68TemchWWas4U",
  authDomain: "kyohyun-daily-report.firebaseapp.com",
  projectId: "kyohyun-daily-report",
  storageBucket: "kyohyun-daily-report.firebasestorage.app",
  messagingSenderId: "478695038994",
  appId: "1:478695038994:web:3f0aad015c2b1e469df8cb",
  measurementId: "G-162BD7BMST"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// 멀티테넌시 마이그레이션 검증용 — VITE_USE_EMULATOR=1일 때만 Firestore/Auth를
// 로컬 에뮬레이터로 연결. 프로덕션 빌드/일반 개발에는 전혀 영향 없음(env var 없으면 그대로 실제 Firebase 사용).
if (import.meta.env.VITE_USE_EMULATOR === '1') {
  connectFirestoreEmulator(db, 'localhost', 8090);
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  console.warn('[firebase.js] 에뮬레이터 모드 — Firestore/Auth가 localhost로 연결됩니다.');
}
