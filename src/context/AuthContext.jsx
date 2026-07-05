import { createContext, useContext, useState, useEffect } from 'react'
import { getSession, clearSession, loginSuperAdmin, loginMember, impersonateAccount, switchAccountSession, refreshSession as apiRefreshSession, updateMyProfile as apiUpdateProfile } from '../lib/storage'
import { connectSocket, disconnectSocket, getToken, setToken } from '../lib/api'

const Ctx = createContext(null)
const SA_BACKUP_KEY = 'avi_sa_token_backup'

export function AuthProvider({ children }) {
  const [session, setS] = useState(() => getSession())

  // Reconnect socket on initial mount if there's a stored session (after page reload).
  // Without this, socket events like message:new and convos:updated never fire after refresh.
  useEffect(() => {
    if (session && getToken()) connectSocket(getToken())
  }, [])

  const loginSA = async (email, pw) => {
    try {
      const s = await loginSuperAdmin(email, pw)
      if (s) { setS(s); connectSocket(getToken()) }
      return !!s
    } catch { return false }
  }

  const loginM = async (email, pw) => {
    try {
      const s = await loginMember(email, pw)
      if (s) { setS(s); connectSocket(getToken()) }
      return !!s
    } catch { return false }
  }

  const impersonate = async (accountId) => {
    try {
      // Preserve the SA token so we can restore it after
      sessionStorage.setItem(SA_BACKUP_KEY, getToken())
      const s = await impersonateAccount(accountId)
      if (s) { setS(s); connectSocket(getToken()) }
      return !!s
    } catch { return false }
  }

  const stopImpersonating = () => {
    const saToken = sessionStorage.getItem(SA_BACKUP_KEY)
    sessionStorage.removeItem(SA_BACKUP_KEY)
    if (saToken) {
      setToken(saToken)
      connectSocket(saToken)
    } else {
      clearSession()
      disconnectSocket()
    }
    setS(getSession())
  }

  const logout = () => {
    clearSession()
    disconnectSocket()
    setS(null)
  }

  const can = (perm) => session?.type === 'superadmin' || !!session?.permissions?.[perm]

  const switchAccount = async (accountId) => {
    try {
      const s = await switchAccountSession(accountId)
      if (s) { setS(s); connectSocket(getToken()) }
      return !!s
    } catch { return false }
  }

  // Re-issues a JWT so freshly added account memberships (e.g. after accepting an invitation)
  // are reflected in allAccountIds without forcing the user to log out and back in.
  const refreshSession = async () => {
    try {
      const s = await apiRefreshSession()
      if (s) { setS(s); connectSocket(getToken()) }
      return s
    } catch { return null }
  }

  // Guarda el perfil propio y refresca la sesión con los datos nuevos.
  const updateProfile = async (payload) => {
    const s = await apiUpdateProfile(payload)
    if (s) setS(s)
    return s
  }

  const canAccessAgent = (agentId) => {
    if (session?.type === 'superadmin') return true
    const access = session?.agentAccess || []
    if (access.length === 0) return true
    return access.includes(agentId)
  }

  return (
    <Ctx.Provider value={{ session, loginSA, loginM, impersonate, stopImpersonating, logout, can, canAccessAgent, switchAccount, refreshSession, updateProfile }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() { return useContext(Ctx) }
