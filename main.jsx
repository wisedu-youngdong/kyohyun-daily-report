import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ErrorBoundary from './ErrorBoundary.jsx'

const App = lazy(() => import('./App.jsx'))
const PublicReport = lazy(() => import('./PublicReport.jsx'))
const GrowthStory = lazy(() => import('./GrowthStory.jsx'))
const GrowthAward = lazy(() => import('./GrowthAward.jsx'))
const ResetPasswordScreen = lazy(() => import('./views/ResetPasswordScreen.jsx'))
const SignupRequestScreen = lazy(() => import('./views/SignupRequestScreen.jsx'))

const RouteFallback = () => (
  <div style={{
    height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, sans-serif",
    color: '#0D2D6B', fontSize: '14px', fontWeight: 600,
  }}>
    불러오는 중...
  </div>
)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/report/:reportId" element={<PublicReport />} />
            <Route path="/story/:studentId" element={<GrowthStory />} />
            <Route path="/award/:studentId" element={<GrowthAward />} />
            <Route path="/auth/action" element={<ResetPasswordScreen />} />
            <Route path="/signup" element={<SignupRequestScreen />} />
            <Route path="/*" element={<App />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
