import { useState } from 'react'
import { THEMES, getTheme, setTheme } from '../../lib/theme'
import { cursorFxEnabled, setCursorFxEnabled } from '../../components/common/CursorFX'
import { useI18n } from '../../context/I18nContext'
import { LANGUAGES } from '../../lib/i18n'

// "Mi perfil" del super admin como PÁGINA (no popup): identidad + tema + mouse + idioma.
export default function MyProfilePage({ session, updateProfile, flash }) {
  const { lang, setLang } = useI18n()
  const [f, setF] = useState({ name: session?.name || '', email: session?.email || '', photo: session?.photo || '', currentPassword: '', password: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [theme, setTh] = useState(getTheme())
  const [cursorFx, setCursorFx] = useState(() => cursorFxEnabled())
  const set = p => setF(prev => ({ ...prev, ...p }))

  async function save(e) {
    e.preventDefault()
    if (!f.name.trim() || !f.email.trim()) return flash?.('Nombre y correo son obligatorios')
    if (f.password) {
      if (!f.currentPassword) return flash?.('Escribe tu contraseña actual para cambiarla')
      if (f.password !== f.confirm) return flash?.('La confirmación de contraseña no coincide')
    }
    setSaving(true)
    try {
      const payload = { name: f.name.trim(), email: f.email.trim(), photo: f.photo || null }
      if (f.password) { payload.currentPassword = f.currentPassword; payload.newPassword = f.password }
      await updateProfile(payload)
      set({ currentPassword: '', password: '', confirm: '' })
      flash?.('Perfil actualizado ✓')
    } catch (err) { flash?.('Error: ' + (err.message || 'no se pudo guardar')) }
    finally { setSaving(false) }
  }
  function pickTheme(id) { setTh(id); setTheme(id) }
  function pickPhoto(e) {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 512 * 1024) return flash?.('La foto debe pesar menos de 512 KB')
    const r = new FileReader(); r.onload = () => set({ photo: String(r.result) }); r.readAsDataURL(file)
    e.target.value = ''
  }

  const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 16 }
  const cardTitle = { fontSize: 14, fontWeight: 800, marginBottom: 12, color: 'var(--text)' }
  const lbl = { fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }
  const inp = { width: '100%', padding: '9px 11px', fontSize: 13, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 8, boxSizing: 'border-box' }
  const btn = { padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,var(--accent),var(--accent2))' }

  return (
    <div className="saContent" style={{ padding: 24, maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>Mi perfil</h1>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 18px' }}>Tu identidad de super admin y las preferencias de la plataforma. Los cambios se aplican de inmediato.</p>

      <form onSubmit={save} style={card}>
        <div style={cardTitle}>Identidad</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 }}>
          {f.photo
            ? <img src={f.photo} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border2)' }} onError={e => { e.target.style.display = 'none' }} />
            : <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700 }}>{(f.name || '?').slice(0, 2).toUpperCase()}</div>}
          <label style={{ ...btn, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)' }}>Cambiar foto
            <input type="file" accept="image/*" hidden onChange={pickPhoto} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <div><label style={lbl}>Nombre completo</label><input required style={inp} value={f.name} onChange={e => set({ name: e.target.value })} /></div>
          <div><label style={lbl}>Correo</label><input required type="email" style={inp} value={f.email} onChange={e => set({ email: e.target.value })} /></div>
          <div><label style={lbl}>Contraseña actual</label><input type="password" style={inp} value={f.currentPassword} onChange={e => set({ currentPassword: e.target.value })} placeholder="Solo para cambiarla" /></div>
          <div><label style={lbl}>Nueva contraseña</label><input type="password" style={inp} value={f.password} onChange={e => set({ password: e.target.value })} /></div>
          <div><label style={lbl}>Confirmar contraseña</label><input type="password" style={inp} value={f.confirm} onChange={e => set({ confirm: e.target.value })} /></div>
        </div>
        <button type="submit" style={{ ...btn, marginTop: 14 }} disabled={saving}>{saving ? 'Guardando…' : 'Guardar perfil'}</button>
      </form>

      <div style={card}>
        <div style={cardTitle}>🎨 Tema de la plataforma</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {THEMES.map(th => (
            <button key={th.id} type="button" onClick={() => pickTheme(th.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', background: 'none', border: 'none' }}>
              <span style={{ width: 60, height: 42, borderRadius: 10, background: th.swatch, border: theme === th.id ? '2px solid var(--accent)' : '2px solid var(--border2)' }} />
              <span style={{ fontSize: 11, color: theme === th.id ? 'var(--accent)' : 'var(--text2)', fontWeight: theme === th.id ? 700 : 400 }}>{th.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={cardTitle}>🖱 Efecto del mouse</div>
        <button type="button" onClick={() => { const on = !cursorFx; setCursorFx(on); setCursorFxEnabled(on) }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', background: cursorFx ? 'var(--accent-dim)' : 'var(--bg3)', border: `1px solid ${cursorFx ? 'var(--accent-glow)' : 'var(--border2)'}`, color: 'var(--text)' }}>
          <span>Estela / halo del cursor</span>
          <span style={{ flexShrink: 0, width: 40, height: 22, borderRadius: 12, position: 'relative', background: cursorFx ? 'linear-gradient(135deg,var(--accent),var(--accent2))' : 'var(--bg5,#555)' }}>
            <span style={{ position: 'absolute', top: 2, left: cursorFx ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
          </span>
        </button>
      </div>

      <div style={card}>
        <div style={cardTitle}>🌐 Idioma de la plataforma</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {LANGUAGES.map(l => {
            const on = lang === l.code
            return (
              <button key={l.code} type="button" onClick={() => setLang(l.code)}
                style={{ padding: '7px 12px', borderRadius: 16, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, background: on ? 'var(--accent)' : 'var(--bg3)', color: on ? '#fff' : 'var(--text2)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border2)'}` }}>
                {l.native}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
