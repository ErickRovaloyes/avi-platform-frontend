import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import AviLogo, { AviMark } from '../../components/common/AviLogo'
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
  const { loginSA, loginM } = useAuth()
  const [email,setEmail]=useState(''); const [pw,setPw]=useState(''); const [err,setErr]=useState(''); const [loading,setLoading]=useState(false)
  async function handle(e) {
    e.preventDefault(); setErr(''); setLoading(true)
    await new Promise(r=>setTimeout(r,300))
    if(!loginSA(email,pw)&&!loginM(email,pw)) setErr('Credenciales incorrectas.')
    setLoading(false)
  }
  return (
    <div className={s.page}>
      {/* Panel de marca (solo escritorio) */}
      <div className={s.hero}>
        <div className={s.heroInner}>
          <AviLogo size={44} nameStyle={{ fontSize: 26 }} />
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
          <div className={s.logoMobile}><AviMark size={40} /></div>
          <h1 className={s.title}>Inicia sesión</h1>
          <p className={s.sub}>Accede a tu panel</p>
          <form className={s.form} onSubmit={handle}>
            <div className={s.field}><label>Email</label><input type="email" placeholder="tu@email.com" value={email} onChange={e=>setEmail(e.target.value)} required /></div>
            <div className={s.field}><label>Contraseña</label><input type="password" placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)} required /></div>
            {err&&<div className={s.err}>{err}</div>}
            <button type="submit" className={s.btn} disabled={loading}>{loading?'Entrando...':'Entrar'}</button>
          </form>
          <div style={{ textAlign:'center', fontSize:13, color:'var(--text2)', marginTop:14 }}>
            ¿No tienes cuenta? <a href="/demo" style={{ color:'var(--accent)', fontWeight:600 }}>Prueba gratis 7 días</a>
          </div>
          <div className={s.hint}><strong>Demo:</strong><br/>Super Admin: <code>superadmin@avi.com</code> / <code>admin123</code><br/>Cuenta: <code>owner@company.com</code> / <code>demo123</code></div>
        </div>
      </div>
    </div>
  )
}
