import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut, inMemoryPersistence, setPersistence } from "firebase/auth";
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

// 관리자가 강사/원장 계정을 새로 만들 때 본인 로그인 세션이 바뀌지 않도록 하는 헬퍼.
// createUserWithEmailAndPassword(auth, ...)는 호출한 auth 인스턴스의 currentUser를
// 즉시 새 계정으로 바꿔버리는 게 SDK 문서화된 동작 — 별도 App 인스턴스를 쓰면
// 기본 auth(현재 로그인된 관리자 세션)는 전혀 건드리지 않는다.
let secondaryAuthPromise = null;
function getSecondaryAuth() {
  if (!secondaryAuthPromise) {
    const secondaryApp = initializeApp(firebaseConfig, 'Secondary');
    const secondaryAuth = getAuth(secondaryApp);
    if (import.meta.env.VITE_USE_EMULATOR === '1') {
      connectAuthEmulator(secondaryAuth, 'http://localhost:9099', { disableWarnings: true });
    }
    secondaryAuthPromise = setPersistence(secondaryAuth, inMemoryPersistence)
      .then(() => secondaryAuth)
      .catch(() => secondaryAuth);
  }
  return secondaryAuthPromise;
}

export async function createUserWithoutSignIn(email, password) {
  const secondaryAuth = await getSecondaryAuth();
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  const uid = cred.user.uid;
  try { await signOut(secondaryAuth); } catch { /* uid는 이미 발급됨, 무시 */ }
  return uid;
}
