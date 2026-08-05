import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { forgotPassword, resetPassword } from '../../lib/storage'
import { validatePassword, passwordChecks, PASSWORD_RULES_TEXT } from '../../lib/passwordRules'
import BrandLogo from '../../components/common/BrandLogo'
import s from './LoginPage.module.css'

const CHANNELS = [
  ['💬', 'WhatsApp'], ['📸', 'Instagram'], ['📘', 'Messenger'], ['🌐', 'Webchat'],
]
const FEATURES = [
  ['🤖', 'Agentes IA entrenados con tu negocio'],
  ['🔀', 'Flujos visuales y automatizaciones'],
  ['📇', 'CRM, campañas y recontactos inteligentes'],
  ['📅', 'Agenda, reservas y pagos integrados'],
]

export default function LoginPage() {
  const { login, complete2fa } = useAuth()
  const [email,setEmail]=useState(''); const [pw,setPw]=useState(''); const [err,setErr]=useState(''); const [loading,setLoading]=useState(false)
  const [twoFA,setTwoFA]=useState(false); const [code,setCode]=useState('')
  // Recuperar contraseña: '' (apagado) | 'ask' (pedir correo) | 'code' (código + nueva)
  const [forgot,setForgot]=useState(''); const [ok,setOk]=useState(''); const [newPw,setNewPw]=useState('')
  // Bloqueo por intentos: además del mensaje, se destaca el camino de salida.
  const [locked,setLocked]=useState(false)
  async function handle(e) {
    e.preventDefault(); setErr(''); setLoading(true)
    const r = await login(email, pw)
    if (r?.twoFactorRequired) { setTwoFA(true); setLoading(false); return }
    if (!r?.ok) { setErr(r?.error || 'Credenciales incorrectas.'); setLocked(/demasiados intentos/i.test(r?.error || '')) }
    setLoading(false)
  }
  async function handleCode(e) {
    e.preventDefault(); setErr(''); setLoading(true)
    const r = await complete2fa(email, pw, code.trim())
    if (!r?.ok) setErr(r?.error || 'Código incorrecto o expirado.')
    setLoading(false)
  }
  function openForgot() { setForgot('ask'); setErr(''); setOk(''); setCode(''); setNewPw(''); setLocked(false) }
  function closeForgot() { setForgot(''); setErr(''); setOk(''); setCode(''); setNewPw('') }
  async function handleForgot(e) {
    e.preventDefault(); setErr(''); setOk(''); setLoading(true)
    try {
      await forgotPassword(email.trim())
      // La respuesta es la misma exista o no la cuenta, así que el mensaje también.
      setOk('Si ese correo tiene una cuenta, te enviamos un código. Revisa tu bandeja (y el spam).')
      setForgot('code')
    } catch (e2) { setErr(e2.message || 'No se pudo enviar el código.') }
    setLoading(false)
  }
  async function handleReset(e) {
    e.preventDefault(); setErr(''); setOk(''); setLoading(true)
    try {
      await resetPassword(email.trim(), code.trim(), newPw)
      setOk('Contraseña actualizada. Ya puedes entrar con la nueva.')
      setForgot(''); setPw(''); setCode(''); setNewPw('')
    } catch (e2) { setErr(e2.message || 'No se pudo cambiar la contraseña.') }
    setLoading(false)
  }
  const linkBtn = { marginTop:8, background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:13 }
  return (
    <div className={s.page}>
      {/* Panel de marca (solo escritorio) */}
      <div className={s.hero}>
        <div className={s.heroInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <BrandLogo size={44} />
          </div>
          <h1 className={s.heroTitle}>
            Toda la conversación de tu negocio, <span className={s.heroGrad}>en una sola plataforma</span>.
          </h1>
          <p className={s.heroSub}>
            Centraliza tus canales, automatiza con IA y convierte cada chat en una venta.
          </p>
          <div className={s.chipRow}>
            {CHANNELS.map(([ic, l]) => <span key={l} className={s.chip}>{ic} {l}</span>)}
          </div>
          <ul className={s.featList}>
            {FEATURES.map(([ic, l]) => <li key={l}><span className={s.featIc}>{ic}</span>{l}</li>)}
          </ul>
        </div>
        <div className={s.heroFoot}>Construida para equipos que viven en la conversación.</div>
      </div>

      {/* Formulario */}
      <div className={s.formSide}>
        <div className={s.card}>
          <div className={s.logoMobile}><BrandLogo size={40} /></div>
          <h1 className={s.title}>
            {twoFA ? 'Verifica tu identidad' : forgot ? 'Recupera tu contraseña' : 'Inicia sesión'}
          </h1>
          <p className={s.sub}>
            {twoFA ? `Ingresa el código que enviamos a ${email}`
              : forgot === 'ask' ? 'Te enviaremos un código a tu correo'
              : forgot === 'code' ? `Ingresa el código que enviamos a ${email} y tu contraseña nueva`
              : 'Accede a tu panel'}
          </p>
          {forgot === 'ask' ? (
            <form className={s.form} onSubmit={handleForgot}>
              <div className={s.field}><label>Email</label>
                <input type="email" autoFocus placeholder="tu@email.com" value={email} onChange={e=>setEmail(e.target.value)} required />
              </div>
              {err&&<div className={s.err}>{err}</div>}
              <button type="submit" className={s.btn} disabled={loading || !email.trim()}>{loading?'Enviando...':'Enviarme el código'}</button>
              <button type="button" onClick={closeForgot} style={linkBtn}>← Volver</button>
            </form>
          ) : forgot === 'code' ? (
            <form className={s.form} onSubmit={handleReset}>
              {ok&&<div style={{ fontSize:12.5, color:'#22d98a', fontWeight:600, marginBottom:6 }}>{ok}</div>}
              <div className={s.field}><label>Código de verificación</label>
                <input inputMode="numeric" autoFocus placeholder="000000" value={code}
                  onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                  style={{ letterSpacing: 6, textAlign: 'center', fontSize: 20 }} required />
              </div>
              <div className={s.field}><label>Contraseña nueva</label>
                <input type="password" placeholder={PASSWORD_RULES_TEXT} value={newPw} onChange={e=>setNewPw(e.target.value)} required />
                {newPw && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'2px 12px', marginTop:5 }}>
                    {passwordChecks(newPw).map(c => (
                      <span key={c.label} style={{ fontSize:11, color: c.ok ? '#22d98a' : 'var(--text3)' }}>{c.ok ? '✓' : '○'} {c.label}</span>
                    ))}
                  </div>
                )}
              </div>
              {err&&<div className={s.err}>{err}</div>}
              <button type="submit" className={s.btn} disabled={loading || code.length<6 || !validatePassword(newPw).ok}>{loading?'Guardando...':'Cambiar contraseña'}</button>
              <button type="button" onClick={handleForgot} disabled={loading} style={linkBtn}>Reenviar código</button>
              <button type="button" onClick={closeForgot} style={linkBtn}>← Volver al inicio de sesión</button>
            </form>
          ) : twoFA ? (
            <form className={s.form} onSubmit={handleCode}>
              <div className={s.field}><label>Código de verificación</label>
                <input inputMode="numeric" autoFocus placeholder="000000" value={code}
                  onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                  style={{ letterSpacing: 6, textAlign: 'center', fontSize: 20 }} required />
              </div>
              {err&&<div className={s.err}>{err}</div>}
              <button type="submit" className={s.btn} disabled={loading || code.length<6}>{loading?'Verificando...':'Verificar y entrar'}</button>
              <button type="button" onClick={()=>{ setTwoFA(false); setCode(''); setErr('') }}
                style={{ marginTop:8, background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:13 }}>← Volver</button>
            </form>
          ) : (
          <form className={s.form} onSubmit={handle}>
            {ok&&<div style={{ fontSize:12.5, color:'#22d98a', fontWeight:600, marginBottom:6 }}>{ok}</div>}
            <div className={s.field}><label>Email</label><input type="email" placeholder="tu@email.com" value={email} onChange={e=>setEmail(e.target.value)} required /></div>
            <div className={s.field}><label>Contraseña</label><input type="password" placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)} required /></div>
            {err&&<div className={s.err}>{err}</div>}
            <button type="submit" className={s.btn} disabled={loading}>{loading?'Entrando...':'Entrar'}</button>
            <button type="button" onClick={openForgot} style={locked ? { ...linkBtn, color:'var(--accent)', fontWeight:700 } : linkBtn}>
              {locked ? '→ Recuperar mi contraseña y entrar ahora' : '¿Olvidaste tu contraseña?'}
            </button>
          </form>
          )}
          <div style={{ textAlign:'center', fontSize:13, color:'var(--text2)', marginTop:14 }}>
            ¿No tienes cuenta? <a href="/demo" style={{ color:'var(--accent)', fontWeight:600 }}>Prueba demo gratuita</a>
          </div>
        </div>
      </div>
    </div>
  )
}
