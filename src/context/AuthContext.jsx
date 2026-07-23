import { createContext, useContext, useState, useEffect } from 'react'
import { getSession, clearSession, loginSuperAdmin, loginMember, verify2faApi, impersonateAccount, switchAccountSession, refreshSession as apiRefreshSession, updateMyProfile as apiUpdateProfile } from '../lib/storage'
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

  // Al montar, re-emite el token de los miembros para traer la lista COMPLETA de cuentas
  // (allAccountIds). Sana tokens antiguos emitidos cuando el login solo incluía las cuentas
  // cuya contraseña coincidía, de modo que el selector "cambiar cuenta" las muestre todas.
  // No aplica a super admin ni a sesiones de impersonación.
  useEffect(() => {
    if (session?.type !== 'member' || session?.isImpersonating || session?.id === 'sa_impersonate' || !getToken()) return
    apiRefreshSession().then(s => { if (s) setS(s) }).catch(() => {})
  }, [])

  // Devuelve { ok } en éxito, { twoFactorRequired, email } si hace falta el código,
  // o { ok:false, error } si las credenciales fallan.
  const login = async (email, pw) => {
    try {
      const data = await loginMember(email, pw)
      if (data?.twoFactorRequired) return { twoFactorRequired: true, email: data.email }
      if (data?.session) { setS(data.session); connectSocket(getToken()); return { ok: true } }
      return { ok: false }
    } catch (e) { return { ok: false, error: e?.message } }
  }

  // Completa el 2FA con el código recibido por correo.
  const complete2fa = async (email, pw, code) => {
    try {
      const s = await verify2faApi(email, pw, code)
      if (s) { setS(s); connectSocket(getToken()); return { ok: true } }
      return { ok: false }
    } catch (e) { return { ok: false, error: e?.message } }
  }

  // Compat: viejas firmas booleanas (por si algo más las usa).
  const loginSA = async (email, pw) => (await login(email, pw)).ok
  const loginM  = async (email, pw) => (await login(email, pw)).ok

  const impersonate = async (accountId) => {
    try {
      // Preserve the SA token so we can restore it after (localStorage: sobrevive a recargar).
      localStorage.setItem(SA_BACKUP_KEY, getToken())
      const s = await impersonateAccount(accountId)
      if (s) { setS(s); connectSocket(getToken()) }
      return !!s
    } catch { return false }
  }

  const stopImpersonating = () => {
    const saToken = localStorage.getItem(SA_BACKUP_KEY) || sessionStorage.getItem(SA_BACKUP_KEY)
    localStorage.removeItem(SA_BACKUP_KEY)
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
    <Ctx.Provider value={{ session, login, complete2fa, loginSA, loginM, impersonate, stopImpersonating, logout, can, canAccessAgent, switchAccount, refreshSession, updateProfile }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() { return useContext(Ctx) }
