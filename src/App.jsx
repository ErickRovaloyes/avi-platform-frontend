import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AccountProvider } from './context/AccountContext'
import { I18nProvider } from './context/I18nContext'
import LoginPage from './pages/login/LoginPage'
import SuperAdminShell from './pages/superadmin/SuperAdminShell'
import AdminShell from './pages/admin/AdminShell'
import WebchatPage from './pages/webchat/WebchatPage'
import InvitePage from './pages/invite/InvitePage'

function Guards() {
  const { session } = useAuth()

  if (!session) {
    return (
      <Routes>
        <Route path="/chat/:accId/:agId/:lnkId" element={<WebchatPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }

  // Super admin (not impersonating)
  if (session.type === 'superadmin' && !session.accountId) {
    return (
      <Routes>
        <Route path="/superadmin/*" element={<SuperAdminShell />} />
        <Route path="/chat/:accId/:agId/:lnkId" element={<WebchatPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="*" element={<Navigate to="/superadmin" replace />} />
      </Routes>
    )
  }

  // Account member (or SA impersonating)
  if (session.type === 'member' || (session.type === 'superadmin' && session.accountId)) {
    return (
      <AccountProvider>
        <Routes>
          <Route path="/plataforma/*" element={<AdminShell />} />
          {/* Backwards-compat: old /admin URLs redirect to /plataforma */}
          <Route path="/admin/*" element={<Navigate to="/plataforma" replace />} />
          <Route path="/chat/:accId/:agId/:lnkId" element={<WebchatPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="*" element={<Navigate to="/plataforma" replace />} />
        </Routes>
      </AccountProvider>
    )
  }

  return <LoginPage />
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Guards />
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  )
}
