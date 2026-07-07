import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import PublicReport from './PublicReport.jsx'
import GrowthStory from './GrowthStory.jsx'
import GrowthAward from './GrowthAward.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/report/:reportId" element={<PublicReport />} />
        <Route path="/story/:studentId" element={<GrowthStory />} />
        <Route path="/award/:studentId" element={<GrowthAward />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
