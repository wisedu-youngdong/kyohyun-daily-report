import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel이 빌드 시 자동으로 채워주는 커밋 해시 — 로컬 npm run build에선 비어있어 'local'로 표시됨.
// 배포된 버전을 식별하는 용도(버그 리포트 받았을 때 "그 수정 반영된 배포냐" 확인, 캐시된 옛
// 버전 보고 있는 사용자 구분)라 페이지 로드 시각이 아니라 빌드 시각을 그대로 굳혀서 씀.
const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || 'local';
const buildTime = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  server: { historyApiFallback: true },
  define: {
    __COMMIT_SHA__: JSON.stringify(commitSha.slice(0, 7)),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/firestore', 'firebase/auth', 'firebase/storage'],
          'vendor-ui': ['lucide-react'],
          'vendor-charts': ['recharts'],
        }
      }
    },
  }
})
