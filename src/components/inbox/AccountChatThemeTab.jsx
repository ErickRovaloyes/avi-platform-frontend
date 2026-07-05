import { useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import { saveAccountChatTheme } from '../../lib/storage'

// Tema de chat PREDETERMINADO de la cuenta: lo fija el owner/admin y aplica a
// TODOS los usuarios de la cuenta. Cada usuario puede sobreescribirlo en un chat
// puntual (queda personal). Debe coincidir con los skins de InboxPanel.
const SKINS = [
  { id: 'auto', label: '🎨 Automático (según el canal)' },
  { id: 'webchat', label: '🌐 Webchat' },
  { id: 'whatsapp', label: '📱 WhatsApp' },
  { id: 'whatsapp-dark', label: '🌙 WhatsApp oscuro' },
  { id: 'messenger', label: '💬 Messenger' },
  { id: 'messenger-dark', label: '🌙 Messenger oscuro' },
  { id: 'instagram', label: '📸 Instagram' },
  { id: 'instagram-dark', label: '🌙 Instagram oscuro' },
  { id: 'custom', label: '🎨 Personalizado (foto + colores)' },
]

function downscale(file, cb) {
  const reader = new FileReader()
  reader.onload = () => {
    const im = new Image()
    im.onload = () => {
      const max = 1600
      let { width, height } = im
      if (width > max || height > max) { const r = Math.min(max / width, max / height); width = Math.round(width * r); height = Math.round(height * r) }
      const c = document.createElement('canvas'); c.width = width; c.height = height
      c.getContext('2d').drawImage(im, 0, 0, width, height)
      try { cb(c.toDataURL('image/jpeg', 0.82)) } catch { cb(reader.result) }
    }
    im.src = reader.result
  }
  reader.readAsDataURL(file)
}

export default function AccountChatThemeTab() {
  const { account, reloadAccount } = useAccount()
  const initial = account?.chatTheme || { skin: 'auto', custom: {} }
  const [skin, setSkin] = useState(initial.skin || 'auto')
  const [custom, setCustom] = useState(initial.custom || {})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const upd = patch => setCustom(c => ({ ...c, ...patch }))
  async function save() {
    setSaving(true); setMsg('')
    try {
      await saveAccountChatTheme(account.id, { skin, custom: skin === 'custom' ? custom : (custom || {}) })
      await reloadAccount?.()
      setMsg('Guardado ✓ · aplica a todos los usuarios de la cuenta')
    } catch (e) { setMsg(e.message || 'Error al guardar') }
    setSaving(false); setTimeout(() => setMsg(''), 3500)
  }

  const card = { background: 'var(--glass-card,var(--bg2))', border: '1px solid var(--border2)', borderRadius: 14, padding: 18, maxWidth: 640 }
  const cInput = { display: 'block', width: '100%', height: 34, marginTop: 4, background: 'none', border: '1px solid var(--border2)', borderRadius: 8, cursor: 'pointer', padding: 0 }
  const lbl = { flex: 1, fontSize: 12, color: 'var(--text2)', fontWeight: 600 }

  return (
    <div style={{ padding: 4 }}>
      <div style={card}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>🎨 Apariencia del chat (predeterminada)</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 16px' }}>
          Fija el tema de chat que verán <strong>todos los usuarios</strong> de esta cuenta por defecto.
          Cada asesor puede cambiarlo en un chat puntual desde el menú ⋯ del chat (queda personal solo para él).
        </p>

        <label style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Tema predeterminado</label>
        <select value={skin} onChange={e => setSkin(e.target.value)} style={{ width: '100%', maxWidth: 340 }}>
          {SKINS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>

        {skin === 'custom' && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <label style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>Fondo del chat</label>
            <input type="url" placeholder="Pega un enlace web (https://…)" value={(custom.bgImage || '').startsWith('data:') ? '' : (custom.bgImage || '')}
              onChange={e => upd({ bgImage: e.target.value })} style={{ maxWidth: 420 }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', padding: '6px 12px', border: '1px solid var(--accent-glow)', borderRadius: 8, background: 'var(--accent-dim)' }}>
                ⤒ Subir imagen
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) downscale(f, url => upd({ bgImage: url })); e.target.value = '' }} />
              </label>
              {custom.bgImage && <><img src={custom.bgImage} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border2)' }} /><button onClick={() => upd({ bgImage: '' })} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12 }}>✕ Quitar</button></>}
            </div>
            <div style={{ display: 'flex', gap: 12, maxWidth: 420 }}>
              <label style={lbl}>Fondo<input type="color" value={custom.bgColor || '#0b141a'} onChange={e => upd({ bgColor: e.target.value })} style={cInput} /></label>
              <label style={lbl}>Burbuja cliente<input type="color" value={custom.custBubbleColor || '#26323b'} onChange={e => upd({ custBubbleColor: e.target.value })} style={cInput} /></label>
              <label style={lbl}>Burbuja propia<input type="color" value={custom.ownBubbleColor || '#3b82f6'} onChange={e => upd({ ownBubbleColor: e.target.value })} style={cInput} /></label>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 18 }}>
          <button onClick={save} disabled={saving}
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', cursor: saving ? 'default' : 'pointer', fontSize: 14, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,var(--accent),var(--accent2))', opacity: saving ? .6 : 1 }}>
            {saving ? 'Guardando…' : 'Guardar predeterminado'}
          </button>
          {msg && <span style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 600 }}>{msg}</span>}
        </div>
      </div>
    </div>
  )
}
