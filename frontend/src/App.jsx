// App.jsx — Frissített verzió, ReportsPage hozzáadva
// Változtatások: import + új /reports route

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider }   from './context/AuthContext'
import ProtectedRoute     from './components/ProtectedRoute'
import Layout        from './components/layout/Layout'
import DashboardPage from './pages/DashboardPage'
import EmailsPage    from './pages/EmailsPage'
import DocsPage      from './pages/DocsPage'
import InsightsPage  from './pages/InsightsPage'
import ChatPage      from './pages/ChatPage'
import ReportsPage   from './pages/ReportsPage'
import CalendarPage  from './pages/CalendarPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ProtectedRoute>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/"          element={<DashboardPage />} />
              <Route path="/emails"    element={<EmailsPage />} />
              <Route path="/attention" element={<EmailsPage defaultFilter="NEEDS_ATTENTION" />} />
              <Route path="/docs"      element={<DocsPage />} />
              <Route path="/insights"  element={<InsightsPage />} />
              <Route path="/reports"   element={<ReportsPage />} />
              <Route path="/chat"      element={<ChatPage />} />
              <Route path="/calendar"  element={<CalendarPage />} />
              <Route path="*"          element={<Navigate to="/" replace />} />
            </Route>
          </Routes>

          <style>{`
            #toast-root {
              position: fixed; bottom: 20px; right: 20px;
              background: rgba(13,13,36,0.95);
              color: white; border-radius: 8px;
              padding: 10px 16px; font-size: 13px;
              font-family: Inter, sans-serif;
              min-width: 220px; max-width: 340px;
              border: 1px solid rgba(255,255,255,0.13);
              box-shadow: 0 8px 48px rgba(0,0,0,0.7);
              backdrop-filter: blur(16px);
              transform: translateY(60px); opacity: 0;
              transition: all 0.3s; z-index: 9999;
              pointer-events: none;
            }
            #toast-root.toast-visible { transform: translateY(0); opacity: 1; }
            #toast-root.toast-ok  { border-left: 2px solid #22c55e; }
            #toast-root.toast-err { border-left: 2px solid #f87171; }
          `}</style>
        </ProtectedRoute>
      </BrowserRouter>
    </AuthProvider>
  )
}
