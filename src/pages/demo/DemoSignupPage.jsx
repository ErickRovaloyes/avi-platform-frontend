import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { demoSignup } from '../../lib/storage'
import { setToken } from '../../lib/api'
import { getFingerprint } from '../../lib/fingerprint'

export default function DemoSignupPage() {
  const nav = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' })
  const [fp, setFp] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { setFp(getFingerprint()) }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (!form.name.trim() || !form.email.trim() || !form.password) { setErr('Completa nombre, correo y contraseña.'); return }
    setBusy(true)
    try {
      const r = await demoSignup({ ...form, fingerprint: fp })
      if (r?.token) { setToken(r.token); window.location.href = '/plataforma' }
      else { setErr('No se pudo crear la cuenta.'); setBusy(false) }
    } catch (e) {
      setErr(e?.message || 'No se pudo crear la cuenta Demo.')
      setBusy(false)
    }
  }

  const page = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }
  const card = { width: '100%', maxWidth: 420, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, padding: '36px 32px', boxShadow: 'var(--shadow-lg)' }
  const inp = { width: '100%', padding: '11px 13px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }
  const field = { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }
  const lbl = { fontSize: 12.5, color: 'var(--text2)', fontWeight: 600 }

  return (
    <div style={page}>
      <form style={card} onSubmit={submit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>▲</div>
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>AVI Asistente</strong>
        </div>
        <h1 style={{ fontSize: 22, margin: '6px 0 2px' }}>Prueba gratis</h1>
        <p style={{ fontSize: 13.5, color: 'var(--text2)', margin: '0 0 20px' }}>Crea tu cuenta Demo (7 días, hasta 100 conversaciones). Sin tarjeta.</p>

        <div style={field}><label style={lbl}>Nombre / empresa</label><input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Mi empresa" /></div>
        <div style={field}><label style={lbl}>Correo electrónico</label><input type="email" style={inp} value={form.email} onChange={e => set('email', e.target.value)} placeholder="tu@correo.com" autoComplete="email" /></div>
        <div style={field}><label style={lbl}>Contraseña</label><input type="password" style={inp} value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" autoComplete="new-password" /></div>
        <div style={field}><label style={lbl}>WhatsApp <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional)</span></label><input style={inp} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+57 300 000 0000" /></div>

        {err && <div style={{ fontSize: 13, color: '#ff5f5f', background: 'var(--red-dim)', border: '1px solid #ff5f5f44', borderRadius: 9, padding: '10px 12px', marginBottom: 14 }}>{err}</div>}

        <button type="submit" disabled={busy} style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,var(--accent),var(--accent2))', color: '#fff', fontSize: 14.5, fontWeight: 700 }}>
          {busy ? 'Creando tu cuenta…' : 'Crear cuenta Demo'}
        </button>
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text2)', marginTop: 16 }}>
          ¿Ya tienes cuenta? <Link to="/" style={{ color: 'var(--accent)', fontWeight: 600 }}>Inicia sesión</Link>
        </div>
      </form>
    </div>
  )
}
