import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
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
