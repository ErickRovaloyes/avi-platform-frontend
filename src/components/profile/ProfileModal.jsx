import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAccount } from '../../context/AccountContext'
import { useI18n } from '../../context/I18nContext'
import { LANGUAGES } from '../../lib/i18n'
import { THEMES, getTheme, setTheme } from '../../lib/theme'
import { NOTIF_TYPES, NOTIF_CHANNELS, getNotifPrefs, saveNotifPrefs } from '../../lib/notifPrefs'
import { playNotifSound } from '../../lib/notifSound'
import { cursorFxEnabled, setCursorFxEnabled } from '../common/CursorFX'

const AVATAR_KEY = 'avi_avatar_url'

export default function ProfileModal({ onClose }) {
  const { session, stopImpersonating } = useAuth()
  const { account, allAgentAccounts } = useAccount()
  const { t, lang, setLang } = useI18n()
  const [theme, setTh] = useState(getTheme())
  const [photo, setPhoto] = useState(() => { try { return localStorage.getItem(AVATAR_KEY) || '' } catch { return '' } })
  const [editPhoto, setEditPhoto] = useState(false)
  const [photoDraft, setPhotoDraft] = useState(photo)
  const [notifPrefs, setNotifPrefs] = useState(() => getNotifPrefs(account?.id, session?.id))
  const [cursorFx, setCursorFx] = useState(() => cursorFxEnabled())

  function toggleNotif(typeKey, chKey) {
    setNotifPrefs(prev => {
      const next = { ...prev, [typeKey]: { ...prev[typeKey], [chKey]: !prev[typeKey]?.[chKey] } }
      saveNotifPrefs(account?.id, session?.id, next)
      return next
    })
  }
  function toggleSound(typeKey) {
    setNotifPrefs(prev => {
      const cur = prev[typeKey]?.sound !== false
      const next = { ...prev, [typeKey]: { ...prev[typeKey], sound: !cur } }
      saveNotifPrefs(account?.id, session?.id, next)
      if (!cur) playNotifSound()
      return next
    })
  }

  const initials = (session?.name || '?').slice(0, 2).toUpperCase()
  const roleName = account?.roles?.find(r => r.id === session?.roleId)?.name || (session?.type === 'superadmin' ? 'Super Admin' : 'Owner')

  // Agrupar agentes por cuenta para mostrar "cuentas IA y rango"
  const byAccount = {}
  for (const a of allAgentAccounts || []) {
    if (!byAccount[a.accountId]) byAccount[a.accountId] = { name: a.accountName, agents: [] }
    byAccount[a.accountId].agents.push(a)
  }
  const accounts = Object.entries(byAccount)

  function savePhoto() {
    const url = photoDraft.trim()
    try { url ? localStorage.setItem(AVATAR_KEY, url) : localStorage.removeItem(AVATAR_KEY) } catch {}
    setPhoto(url); setEditPhoto(false)
  }
  function pickTheme(id) { setTh(id); setTheme(id) }

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
  const box = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, width: 'min(540px,95vw)', maxHeight: '90vh', overflowY: 'auto' }
  const head = { padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
  const section = { padding: '16px 20px', borderBottom: '1px solid var(--border)' }
  const sTitle = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', fontWeight: 700, marginBottom: 10 }
  const row = { display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, color: 'var(--text)' }
  const btn = { padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: 12 }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={head}>
          <strong style={{ color: 'var(--text)' }}>{t('profile.title')}</strong>
          <button style={{ ...btn, padding: '4px 10px' }} onClick={onClose}>✕</button>
        </div>

        {/* Cabecera con avatar */}
        <div style={{ ...section, display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            {photo
              ? <img src={photo} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border2)' }} onError={() => setPhoto('')} />
              : <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>{initials}</div>}
            <button title="Cambiar foto" onClick={() => { setPhotoDraft(photo); setEditPhoto(v => !v) }}
              style={{ position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: 11 }}>✎</button>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{session?.name || 'Usuario'}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>{session?.email || '—'}</div>
            <div style={{ marginTop: 4, display: 'inline-block', fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}>
              {session?.type === 'superadmin' ? '🛡 Super Admin' : `🎯 ${roleName}`}
            </div>
          </div>
        </div>

        {/* Acceso al panel superadmin (super admin directo o viendo una cuenta) */}
        {(session?.type === 'superadmin' || session?.isImpersonating) && (
          <div style={section}>
            <button
              onClick={() => { stopImpersonating(); onClose() }}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--accent-glow)', background: 'var(--accent-dim)', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              🛡 Ir al panel superadmin
            </button>
          </div>
        )}

        {editPhoto && (
          <div style={{ ...section, display: 'flex', gap: 8 }}>
            <input style={{ flex: 1, padding: 8, fontSize: 13, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 6 }}
              placeholder="URL de la foto (https://…)" value={photoDraft} onChange={e => setPhotoDraft(e.target.value)} />
            <button style={{ ...btn, background: 'var(--accent)', color: '#fff', border: 'none' }} onClick={savePhoto}>Guardar</button>
          </div>
        )}

        {/* Tema */}
        <div style={section}>
          <div style={sTitle}>{t('profile.theme')}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {THEMES.map(th => (
              <button key={th.id} onClick={() => pickTheme(th.id)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer', background: 'none', border: 'none' }}>
                <span style={{ width: 56, height: 40, borderRadius: 8, background: th.swatch, border: theme === th.id ? '2px solid var(--accent)' : '2px solid var(--border2)' }} />
                <span style={{ fontSize: 11, color: theme === th.id ? 'var(--accent)' : 'var(--text2)', fontWeight: theme === th.id ? 700 : 400 }}>{t('theme.' + th.id)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Efectos visuales */}
        <div style={section}>
          <div style={sTitle}>✨ Efectos visuales</div>
          <button type="button" onClick={() => { const on = !cursorFx; setCursorFx(on); setCursorFxEnabled(on) }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
              background: cursorFx ? 'var(--accent-dim)' : 'var(--bg3)',
              border: `1px solid ${cursorFx ? 'var(--accent-glow)' : 'var(--border2)'}`, color: 'var(--text)',
            }}>
            <span style={{ fontSize: 13 }}>
              <strong>🟣 Cursor AVI</strong>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                El puntero se convierte en una bolita de cristal con borde morado y deja una estela verde y dorada al moverse.
              </span>
            </span>
            <span style={{
              flexShrink: 0, width: 40, height: 22, borderRadius: 12, position: 'relative', transition: 'background .2s',
              background: cursorFx ? 'linear-gradient(135deg,var(--accent),var(--accent2))' : 'var(--bg5)',
            }}>
              <span style={{ position: 'absolute', top: 2, left: cursorFx ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </span>
          </button>
        </div>

        {/* Idioma */}
        <div style={section}>
          <div style={sTitle}>{t('profile.language')}</div>
          <select value={lang} onChange={e => setLang(e.target.value)}
            style={{ width: '100%', padding: 9, fontSize: 13, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 8 }}>
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.native} — {l.label}</option>
            ))}
          </select>
        </div>

        {/* Notificaciones — preferencias por tipo y canal */}
        {session?.type !== 'superadmin' && (
          <div style={section}>
            <div style={sTitle}>🔔 Notificaciones</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>Elige qué notificaciones recibir, por qué canales y si suenan. La entrega <strong>Web</strong> ya está activa; Correo, SMS y App móvil se irán habilitando.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {NOTIF_TYPES.map(tp => {
                const webOn = notifPrefs[tp.key]?.web !== false
                const soundOn = notifPrefs[tp.key]?.sound !== false
                return (
                <div key={tp.key} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{tp.icon} {tp.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', margin: '2px 0 7px' }}>{tp.desc}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {NOTIF_CHANNELS.map(ch => {
                      const on = notifPrefs[tp.key]?.[ch.key] !== false
                      return (
                        <button key={ch.key} type="button" onClick={() => toggleNotif(tp.key, ch.key)}
                          title={ch.ready ? `${ch.label}: ${on ? 'activado' : 'desactivado'}` : `${ch.label} — disponible próximamente (tu preferencia se guarda)`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 16, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            background: on ? 'var(--accent)' : 'var(--bg3)', color: on ? '#fff' : 'var(--text2)',
                            border: `1px solid ${on ? 'var(--accent)' : 'var(--border2)'}`, opacity: ch.ready ? 1 : 0.85,
                          }}>
                          <span>{on ? '✓' : ''} {ch.icon} {ch.label}</span>
                          {!ch.ready && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'var(--bg1)', color: 'var(--text3)', border: '1px solid var(--border2)' }}>pronto</span>}
                        </button>
                      )
                    })}
                    <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />
                    <button type="button" onClick={() => toggleSound(tp.key)} disabled={!webOn}
                      title={webOn ? (soundOn ? 'Sonará al llegar' : 'No sonará') : 'Activa el canal Web para que pueda sonar'}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 16, cursor: webOn ? 'pointer' : 'not-allowed', opacity: webOn ? 1 : .45, fontSize: 12, fontWeight: 600, background: (webOn && soundOn) ? 'var(--green,#22d98a)' : 'var(--bg3)', color: (webOn && soundOn) ? '#04231a' : 'var(--text2)', border: `1px solid ${(webOn && soundOn) ? 'var(--green,#22d98a)' : 'var(--border2)'}` }}>
                      {webOn && soundOn ? '🔊 Con sonido' : '🔇 Silencioso'}
                    </button>
                  </div>
                </div>
              )})}
            </div>
          </div>
        )}

        {/* Cuentas IA y rango */}
        <div style={{ ...section, borderBottom: 'none' }}>
          <div style={sTitle}>{t('profile.accounts')}</div>
          {accounts.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)' }}>{t('profile.noAccounts')}</div>}
          {accounts.map(([accId, info]) => (
            <div key={accId} style={{ marginBottom: 10 }}>
              <div style={{ ...row, fontWeight: 600 }}>
                <span>🏢 {info.name || accId}</span>
                <span style={{ fontSize: 11, color: 'var(--accent)' }}>{account?.id === accId ? roleName : t('profile.member')}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                {info.agents.map(a => (
                  <span key={a.agentId} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border2)' }}>
                    🤖 {a.agentName}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
