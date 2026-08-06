import { createContext, useContext, useState, useEffect } from 'react'
import { getSession, clearSession, loginSuperAdmin, loginMember, verify2faApi, impersonateAccount, switchAccountSession, refreshSession as apiRefreshSession, updateMyProfile as apiUpdateProfile, decodeJwt } from '../lib/storage'
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
      // Respalda SOLO el token del SUPER ADMIN (nunca el de una impersonación previa), para
      // que "volver al Super Panel" siempre restaure la sesión real de super admin. Si ya se
      // está impersonando (token de miembro), NO se sobreescribe el respaldo.
      const cur = getToken()
      if (session?.type === 'superadmin' && decodeJwt(cur)?.type === 'superadmin') {
        // Protegido: si localStorage está lleno esto lanza, y antes se abortaba la entrada
        // entera. Perder el respaldo solo afecta al botón "Volver", no a poder entrar.
        try { localStorage.setItem(SA_BACKUP_KEY, cur) } catch {}
      }
      const s = await impersonateAccount(accountId)
      if (!s) return false
      setS(s)
      connectSocket(getToken())
      // Comprobación real: si el token no llegó a guardarse, la sesión se perdería en la
      // siguiente recarga. Mejor avisar ahora que dejar al usuario a medias.
      if (!getToken()) {
        alert('No se pudo guardar la sesión: el almacenamiento del navegador está lleno. Cierra sesión y vuelve a entrar, o borra los datos del sitio.')
        return false
      }
      return true
    } catch (e) {
      // Este catch se tragaba el motivo, y por eso el fallo era invisible: la petición
      // devolvía 200, la pantalla no cambiaba y no había ninguna pista de por qué.
      console.error('[impersonate]', e)
      alert(`No se pudo entrar en la cuenta: ${e?.message || e}`)
      return false
    }
  }

  const stopImpersonating = () => {
    const saToken = localStorage.getItem(SA_BACKUP_KEY) || sessionStorage.getItem(SA_BACKUP_KEY)
    localStorage.removeItem(SA_BACKUP_KEY)
    sessionStorage.removeItem(SA_BACKUP_KEY)
    const saSession = saToken ? decodeJwt(saToken) : null
    // Solo se restaura un token válido de SUPER ADMIN; si el respaldo falta o quedó
    // corrupto (p. ej. un token de miembro), se fuerza un login limpio en vez de dejar
    // la sesión en un estado inconsistente (Super Panel con token de miembro).
    if (saToken && saSession?.type === 'superadmin') {
      setToken(saToken)
      connectSocket(saToken)
      setS(saSession)
    } else {
      clearSession()
      disconnectSocket()
      setS(null)
    }
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
