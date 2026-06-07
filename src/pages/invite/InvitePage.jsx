import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getInvite, acceptInvite } from '../../lib/storage'
import { useAuth } from '../../context/AuthContext'
import s from './InvitePage.module.css'

// Modes shown to a non-logged-in user. Logged-in users skip the chooser entirely.
const MODE_CHOOSE   = 'choose'
const MODE_LOGIN    = 'login'
const MODE_REGISTER = 'register'

export default function InvitePage() {
  const { token } = useParams()
  const { session, loginM, logout, refreshSession, switchAccount } = useAuth()
  const navigate = useNavigate()

  // ── State ────────────────────────────────────────────────────────────────
  const [invite, setInvite] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [mode, setMode] = useState(MODE_CHOOSE)

  // Registration fields
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')

  // Login fields
  const [loginEmail, setLoginEmail]       = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)

  // ── Load invite ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const inv = await getInvite(token)
        if (cancelled) return
        if (inv) setInvite(inv)
        else setNotFound(true)
      } catch {
        if (!cancelled) setNotFound(true)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  // ── Flow 1: logged-in user accepts directly ─────────────────────────────
  async function handleAcceptAsCurrentUser() {
    setError('')
    setLoading(true)
    try {
      const result = await acceptInvite(token, {
        name: session.name,
        email: session.email,
        // password not needed; member already exists somewhere in the system
      })
      if (!result) { setError('El enlace ya fue usado o es inválido'); setLoading(false); return }

      // Re-issue the JWT so the new account membership is reflected, then jump to it.
      const newSession = await refreshSession()
      if (!newSession) {
        setError('No se pudo refrescar la sesión. Cierra sesión y vuelve a entrar para ver la nueva cuenta.')
        setLoading(false)
        return
      }
      if (result.accountId && newSession.allAccountIds?.includes(result.accountId)) {
        // Switch into the new account so the user lands directly on it
        const ok = await switchAccount(result.accountId)
        if (!ok) console.warn('switchAccount falló — la cuenta aparecerá en el menú pero quedarás en la actual')
      }
      navigate('/plataforma')
    } catch (err) {
      setError(err.message || 'Error al procesar la invitación')
    }
    setLoading(false)
  }

  // ── Flow 2: log in with an existing account, then accept ────────────────
  async function handleLoginAndAccept(e) {
    e.preventDefault()
    setError('')
    if (!loginEmail.trim() || !loginPassword) { setError('Completa email y contraseña'); return }
    setLoading(true)
    try {
      const ok = await loginM(loginEmail.trim(), loginPassword)
      if (!ok) { setError('Credenciales incorrectas'); setLoading(false); return }
      // Now logged in — accept with the freshly-logged user
      const result = await acceptInvite(token, {
        name: loginEmail.trim(),  // backend uses email for matching; name will be set from member row
        email: loginEmail.trim(),
      })
      if (!result) { setError('El enlace ya fue usado o es inválido'); setLoading(false); return }
      await refreshSession()
      if (result.accountId) await switchAccount(result.accountId).catch(() => {})
      navigate('/plataforma')
    } catch (err) {
      setError(err.message || 'Error al procesar')
    }
    setLoading(false)
  }

  // ── Flow 3: register a brand-new account and accept ─────────────────────
  async function handleRegisterAndAccept(e) {
    e.preventDefault()
    setError('')
    if (!name.trim() || !email.trim())   { setError('Nombre y email son obligatorios'); return }
    if (password.length < 6)             { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (password !== confirm)            { setError('Las contraseñas no coinciden'); return }

    setLoading(true)
    try {
      const result = await acceptInvite(token, {
        name: name.trim(),
        email: email.trim(),
        password,
      })
      if (!result) { setError('El enlace ya fue usado o es inválido'); setLoading(false); return }

      // Auto-login with the freshly created credentials
      const ok = await loginM(email.trim(), password)
      if (ok) { navigate('/plataforma'); return }
      // If auto-login somehow fails, fall back to the success screen
      setDone(true)
    } catch (err) {
      setError(err.message || 'Error al procesar la invitación')
    }
    setLoading(false)
  }

  // ── Early-return screens ────────────────────────────────────────────────
  if (notFound) return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.logo}>▲</div>
        <div className={s.title}>Enlace inválido</div>
        <div className={s.sub}>Este enlace de invitación no existe o ya fue utilizado.</div>
        <button className={s.btn} onClick={() => navigate('/')}>Ir al inicio</button>
      </div>
    </div>
  )

  if (!invite) return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.logo}>▲</div>
        <div className={s.sub}>Verificando enlace...</div>
      </div>
    </div>
  )

  if (done) return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.logo}>▲</div>
        <div className={s.successIcon}>✓</div>
        <div className={s.title}>¡Listo!</div>
        <div className={s.sub}>Ya tienes acceso a la cuenta. Inicia sesión para continuar.</div>
        <button className={s.btn} onClick={() => navigate('/plataforma')}>Ir al panel</button>
      </div>
    </div>
  )

  // Compact summary of the invitation, reused across modes
  const InviteSummary = () => (
    <div className={s.inviteSummary}>
      Has sido invitado a colaborar en una cuenta de AVI Platform.
      {invite.createdBy && <> Invitación enviada por <strong>{invite.createdBy}</strong>.</>}
    </div>
  )

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.logo}>▲</div>
        <div className={s.title}>Invitación a AVI Platform</div>

        {/* ── Path A: user already has a session ────────────────────────── */}
        {session ? (
          <>
            <InviteSummary />
            <div className={s.acceptSection}>
              <div className={s.acceptInfo}>
                <div className={s.acceptLabel}>Sesión activa como:</div>
                <div className={s.acceptName}>{session.name} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· {session.email}</span></div>
              </div>
              {error && <div className={s.error}>{error}</div>}
              <button className={s.btn} onClick={handleAcceptAsCurrentUser} disabled={loading}>
                {loading ? 'Procesando...' : `✓ Aceptar como ${session.name}`}
              </button>
              <button className={s.btnSecondary} onClick={() => { logout(); setMode(MODE_CHOOSE) }}>
                Salir y usar otra cuenta
              </button>
              <button className={s.btnSecondary} onClick={() => navigate('/plataforma')}>
                Cancelar
              </button>
            </div>
          </>
        ) : mode === MODE_CHOOSE ? (
          /* ── Path B: chooser — login vs register ─────────────────────── */
          <>
            <InviteSummary />
            <div className={s.sub} style={{ marginTop: 6 }}>¿Cómo quieres aceptarla?</div>
            <div className={s.choiceRow}>
              <button className={s.choiceBtn} onClick={() => setMode(MODE_LOGIN)}>
                <span className={s.choiceIcon}>↩</span>
                <div className={s.choiceMeta}>
                  <span className={s.choiceTitle}>Ya tengo cuenta</span>
                  <span className={s.choiceSub}>Inicia sesión y se añadirá automáticamente esta cuenta a las que ya tienes.</span>
                </div>
              </button>
              <button className={s.choiceBtn} onClick={() => setMode(MODE_REGISTER)}>
                <span className={s.choiceIcon}>+</span>
                <div className={s.choiceMeta}>
                  <span className={s.choiceTitle}>Crear cuenta nueva</span>
                  <span className={s.choiceSub}>Regístrate y entrarás directamente a esta cuenta.</span>
                </div>
              </button>
            </div>
          </>
        ) : mode === MODE_LOGIN ? (
          /* ── Path B-1: login form ────────────────────────────────────── */
          <>
            <InviteSummary />
            <form className={s.form} onSubmit={handleLoginAndAccept}>
              <div className={s.field}>
                <label>Email</label>
                <input className={s.input} type="email" autoFocus required
                  value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="tu@email.com" />
              </div>
              <div className={s.field}>
                <label>Contraseña</label>
                <input className={s.input} type="password" required
                  value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="••••••••" />
              </div>
              {error && <div className={s.error}>{error}</div>}
              <button type="submit" className={s.btn} disabled={loading}>
                {loading ? 'Procesando...' : 'Iniciar sesión y aceptar'}
              </button>
            </form>
            <button className={s.backLink} onClick={() => { setMode(MODE_CHOOSE); setError('') }}>← Volver</button>
          </>
        ) : (
          /* ── Path B-2: register form ─────────────────────────────────── */
          <>
            <InviteSummary />
            <form className={s.form} onSubmit={handleRegisterAndAccept}>
              <div className={s.field}>
                <label>Nombre completo</label>
                <input className={s.input} required value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" />
              </div>
              <div className={s.field}>
                <label>Email</label>
                <input className={s.input} type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" />
              </div>
              <div className={s.field}>
                <label>Contraseña</label>
                <input className={s.input} type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
              <div className={s.field}>
                <label>Confirmar contraseña</label>
                <input className={s.input} type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repite la contraseña" />
              </div>
              {error && <div className={s.error}>{error}</div>}
              <button type="submit" className={s.btn} disabled={loading}>
                {loading ? 'Creando cuenta...' : 'Crear cuenta y unirse'}
              </button>
            </form>
            <button className={s.backLink} onClick={() => { setMode(MODE_CHOOSE); setError('') }}>← Volver</button>
          </>
        )}
      </div>
    </div>
  )
}
