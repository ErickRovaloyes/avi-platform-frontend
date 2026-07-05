import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAccount } from '../../context/AccountContext'
import { useI18n } from '../../context/I18nContext'
import { LANGUAGES } from '../../lib/i18n'
import { THEMES, getTheme, setTheme } from '../../lib/theme'
import { NOTIF_TYPES, NOTIF_CHANNELS, getNotifPrefs, saveNotifPrefs } from '../../lib/notifPrefs'
import { cursorFxEnabled, setCursorFxEnabled } from '../common/CursorFX'

// Reescala una imagen a un cuadrado pequeño (avatar) → data URL liviano.
function downscaleAvatar(file, cb) {
  const reader = new FileReader()
  reader.onload = () => {
    const im = new Image()
    im.onload = () => {
      const size = 400
      const canvas = document.createElement('canvas')
      canvas.width = size; canvas.height = size
      const ctx = canvas.getContext('2d')
      const s = Math.min(im.width, im.height)
      ctx.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, size, size)
      try { cb(canvas.toDataURL('image/jpeg', 0.85)) } catch { cb(reader.result) }
    }
    im.src = reader.result
  }
  reader.readAsDataURL(file)
}

export default function ProfilePage({ onClose }) {
  const { session, stopImpersonating, updateProfile } = useAuth()
  const { account, allAgentAccounts } = useAccount()
  const { t, lang, setLang } = useI18n()
  const [theme, setTh] = useState(getTheme())
  const [cursorFx, setCursorFx] = useState(() => cursorFxEnabled())
  const [notifPrefs, setNotifPrefs] = useState(() => getNotifPrefs(account?.id, session?.id))

  const [photo, setPhoto] = useState(session?.photo || '')
  const [name, setName] = useState(session?.name || '')
  const [email, setEmail] = useState(session?.email || '')
  const [curPw, setCurPw] = useState(''); const [newPw, setNewPw] = useState(''); const [confPw, setConfPw] = useState('')
  const [savingInfo, setSavingInfo] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [msg, setMsg] = useState(null)  // { type:'ok'|'err', text }

  const initials = (session?.name || '?').slice(0, 2).toUpperCase()
  const roleName = account?.roles?.find(r => r.id === session?.roleId)?.name || (session?.type === 'superadmin' ? 'Super Admin' : 'Owner')

  const byAccount = {}
  for (const a of allAgentAccounts || []) {
    if (!byAccount[a.accountId]) byAccount[a.accountId] = { name: a.accountName, agents: [] }
    byAccount[a.accountId].agents.push(a)
  }
  const accounts = Object.entries(byAccount)

  function toggleNotif(typeKey, chKey) {
    setNotifPrefs(prev => {
      const next = { ...prev, [typeKey]: { ...prev[typeKey], [chKey]: !prev[typeKey]?.[chKey] } }
      saveNotifPrefs(account?.id, session?.id, next); return next
    })
  }
  function pickTheme(id) { setTh(id); setTheme(id) }
  function flash(type, text) { setMsg({ type, text }); setTimeout(() => setMsg(null), 3200) }

  async function savePhoto(nextPhoto) {
    setPhoto(nextPhoto)
    try { await updateProfile({ photo: nextPhoto }) } catch (e) { flash('err', e.message || 'No se pudo guardar la foto') }
  }
  async function saveInfo() {
    if (!name.trim()) return flash('err', 'El nombre no puede estar vacío')
    setSavingInfo(true)
    try { await updateProfile({ name: name.trim(), email: email.trim() }); flash('ok', 'Datos actualizados ✓') }
    catch (e) { flash('err', e.message || 'No se pudo actualizar') }
    setSavingInfo(false)
  }
  async function savePw() {
    if (!curPw || !newPw) return flash('err', 'Completa la contraseña actual y la nueva')
    if (newPw !== confPw) return flash('err', 'La confirmación no coincide')
    setSavingPw(true)
    try { await updateProfile({ currentPassword: curPw, newPassword: newPw }); setCurPw(''); setNewPw(''); setConfPw(''); flash('ok', 'Contraseña cambiada ✓') }
    catch (e) { flash('err', e.message || 'No se pudo cambiar la contraseña') }
    setSavingPw(false)
  }

  const page = { position: 'fixed', inset: 0, zIndex: 900, background: 'var(--ambience,transparent), var(--bg)', backgroundAttachment: 'fixed', overflowY: 'auto' }
  const bar = { position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'var(--glass-chrome,var(--bg2))', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)' }
  const wrap = { maxWidth: 760, margin: '0 auto', padding: '22px 20px 60px', display: 'flex', flexDirection: 'column', gap: 16 }
  const card = { background: 'var(--glass-card,var(--bg2))', border: '1px solid var(--border2)', borderRadius: 16, padding: 20 }
  const sTitle = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', fontWeight: 700, marginBottom: 12 }
  const label = { fontSize: 12, color: 'var(--text2)', fontWeight: 500, marginBottom: 5, display: 'block' }
  const field = { width: '100%', boxSizing: 'border-box' }
  const btn = { padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,var(--accent),var(--accent2))' }
  const ghost = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: 12.5 }

  return (
    <div style={page}>
      <div style={bar}>
        <button style={ghost} onClick={onClose}>← Volver</button>
        <strong style={{ fontSize: 16, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Mi perfil</strong>
        {msg && <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, color: msg.type === 'ok' ? 'var(--green)' : 'var(--red)' }}>{msg.text}</span>}
      </div>

      <div style={wrap}>
        {/* Héroe: avatar + identidad */}
        <div style={{ ...card, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {photo
              ? <img src={photo} alt="" style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent-glow)' }} onError={() => setPhoto('')} />
              : <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent),var(--accent2))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800 }}>{initials}</div>}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{session?.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>{session?.email}</div>
            <div style={{ marginTop: 6, display: 'inline-block', fontSize: 11, padding: '2px 9px', borderRadius: 10, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}>
              {session?.type === 'superadmin' ? '🛡 Super Admin' : `🎯 ${roleName}`}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <label style={{ ...ghost, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                ⤒ Subir foto
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) downscaleAvatar(f, savePhoto); e.target.value = '' }} />
              </label>
              {photo && <button style={ghost} onClick={() => savePhoto('')}>Quitar foto</button>}
            </div>
            <input style={{ ...field, marginTop: 8 }} placeholder="…o pega una URL de imagen" value={photo?.startsWith('data:') ? '' : photo}
              onChange={e => setPhoto(e.target.value)} onBlur={() => { if (!photo.startsWith('data:')) savePhoto(photo) }} />
          </div>
        </div>

        {/* Acceso super panel */}
        {(session?.type === 'superadmin' || session?.isImpersonating) && (
          <div style={card}>
            <button onClick={() => { stopImpersonating(); onClose() }}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--accent-glow)', background: 'var(--accent-dim)', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              🛡 Ir al panel superadmin
            </button>
          </div>
        )}

        {/* Datos personales */}
        <div style={card}>
          <div style={sTitle}>Datos personales</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}><label style={label}>Nombre</label><input style={field} value={name} onChange={e => setName(e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 220 }}><label style={label}>Correo</label><input style={field} type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          </div>
          <button style={{ ...btn, marginTop: 14, opacity: savingInfo ? .6 : 1 }} disabled={savingInfo} onClick={saveInfo}>{savingInfo ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>

        {/* Seguridad */}
        <div style={card}>
          <div style={sTitle}>Seguridad · contraseña</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}><label style={label}>Contraseña actual</label><input style={field} type="password" value={curPw} onChange={e => setCurPw(e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 200 }}><label style={label}>Nueva contraseña</label><input style={field} type="password" value={newPw} onChange={e => setNewPw(e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 200 }}><label style={label}>Confirmar</label><input style={field} type="password" value={confPw} onChange={e => setConfPw(e.target.value)} /></div>
          </div>
          <button style={{ ...btn, marginTop: 14, opacity: savingPw ? .6 : 1 }} disabled={savingPw} onClick={savePw}>{savingPw ? 'Cambiando…' : 'Cambiar contraseña'}</button>
        </div>

        {/* Apariencia */}
        <div style={card}>
          <div style={sTitle}>{t('profile.theme')}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {THEMES.map(th => (
              <button key={th.id} onClick={() => pickTheme(th.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', background: 'none', border: 'none' }}>
                <span style={{ width: 60, height: 42, borderRadius: 10, background: th.swatch, border: theme === th.id ? '2px solid var(--accent)' : '2px solid var(--border2)' }} />
                <span style={{ fontSize: 11, color: theme === th.id ? 'var(--accent)' : 'var(--text2)', fontWeight: theme === th.id ? 700 : 400 }}>{th.label}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { const on = !cursorFx; setCursorFx(on); setCursorFxEnabled(on) }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', background: cursorFx ? 'var(--accent-dim)' : 'var(--bg3)', border: `1px solid ${cursorFx ? 'var(--accent-glow)' : 'var(--border2)'}`, color: 'var(--text)' }}>
            <span style={{ fontSize: 13 }}><strong>🟣 Cursor AVI</strong><span style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Puntero de cristal con estela de marca.</span></span>
            <span style={{ flexShrink: 0, width: 40, height: 22, borderRadius: 12, position: 'relative', transition: 'background .2s', background: cursorFx ? 'linear-gradient(135deg,var(--accent),var(--accent2))' : 'var(--bg5)' }}>
              <span style={{ position: 'absolute', top: 2, left: cursorFx ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </span>
          </button>
        </div>

        {/* Idioma */}
        <div style={card}>
          <div style={sTitle}>{t('profile.language')}</div>
          <select value={lang} onChange={e => setLang(e.target.value)} style={field}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.native} — {l.label}</option>)}
          </select>
        </div>

        {/* Notificaciones */}
        {session?.type !== 'superadmin' && (
          <div style={card}>
            <div style={sTitle}>🔔 Notificaciones</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>Elige qué notificaciones recibir y por qué canales.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {NOTIF_TYPES.map(tp => (
                <div key={tp.key} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{tp.icon} {tp.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', margin: '2px 0 7px' }}>{tp.desc}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {NOTIF_CHANNELS.map(ch => {
                      const on = notifPrefs[tp.key]?.[ch.key] !== false
                      return (
                        <button key={ch.key} type="button" onClick={() => toggleNotif(tp.key, ch.key)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 16, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: on ? 'var(--accent)' : 'var(--bg3)', color: on ? '#fff' : 'var(--text2)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border2)'}` }}>
                          <span>{on ? '✓' : ''} {ch.icon} {ch.label}</span>
                          {!ch.ready && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'var(--bg1,var(--bg))', color: 'var(--text3)', border: '1px solid var(--border2)' }}>pronto</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cuentas IA */}
        <div style={card}>
          <div style={sTitle}>{t('profile.accounts')}</div>
          {accounts.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)' }}>{t('profile.noAccounts')}</div>}
          {accounts.map(([accId, info]) => (
            <div key={accId} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                <span>🏢 {info.name || accId}</span>
                <span style={{ fontSize: 11, color: 'var(--accent)' }}>{account?.id === accId ? roleName : t('profile.member')}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                {info.agents.map(a => <span key={a.agentId} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border2)' }}>🤖 {a.agentName}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
