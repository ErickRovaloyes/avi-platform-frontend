import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import s from './LoginPage.module.css'

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
      <div className={s.card}>
        <div className={s.logo}><span className={s.mark}>▲</span><span className={s.name}>AVI Platform</span></div>
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
  )
}
