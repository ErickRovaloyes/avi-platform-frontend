import { useState, useRef, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { uploadChatMedia, uploadMedia, mediaUrl } from '../../lib/storage'
import { EMOJI_GROUPS } from '../chat/ChatToolbar'

/**
 * Selector unificado de Emojis + Stickers en un solo cuadro con dos pestañas.
 * · Emojis   → inserta el emoji en el cuadro de respuesta (onInsertText).
 * · Stickers → envía el sticker por el canal (uploadMedia), con subir/editar.
 */
export default function EmojiStickerPicker({ accId, agId, convId, senderName, onInsertText }) {
  const { account, addSticker, deleteSticker } = useAccount()
  const stickers = account?.stickers || []
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('emoji')      // 'emoji' | 'sticker'
  const [group, setGroup] = useState(EMOJI_GROUPS[0].name)
  const [busy, setBusy] = useState(false)
  const [manage, setManage] = useState(false)
  const fileRef = useRef(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  async function sendSticker(stk) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(mediaUrl(accId, stk.mediaId))
      const blob = await res.blob()
      const ext = (stk.mime?.split('/')[1] || 'webp').replace('+xml', '')
      const file = new File([blob], `${stk.name || 'sticker'}.${ext}`, { type: stk.mime || 'image/webp' })
      await uploadMedia(accId, agId, convId, file, { sender: 'human', senderName, kind: 'sticker' })
      setOpen(false)
    } catch (e) { alert('No se pudo enviar el sticker: ' + (e?.message || 'error')) }
    setBusy(false)
  }

  async function uploadSticker(f) {
    if (!f) return
    setBusy(true)
    try {
      const up = await uploadChatMedia(accId, f, 'sticker')
      addSticker({ mediaId: up.mediaId, mime: up.mime, name: f.name.replace(/\.[^.]+$/, '') })
    } catch (e) { alert('No se pudo subir: ' + (e?.message || 'error')) }
    if (fileRef.current) fileRef.current.value = ''
    setBusy(false)
  }

  const currentGroup = EMOJI_GROUPS.find(g => g.name === group) || EMOJI_GROUPS[0]
  const btn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text2)', cursor: 'pointer', fontSize: 16 }
  const tabBtn = active => ({ flex: 1, padding: '7px 0', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: 'none', background: active ? 'var(--bg3)' : 'transparent', color: active ? 'var(--text1)' : 'var(--text3)', borderBottom: active ? '2px solid var(--accent,#4fa8ff)' : '2px solid transparent' })
  const linkBtn = { background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12 }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button type="button" style={btn} title="Emojis y stickers" onClick={() => setOpen(o => !o)}>😊</button>
      {open && (
        <div style={{ position: 'absolute', bottom: '120%', left: 0, width: 300, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 12, zIndex: 60, boxShadow: '0 8px 24px rgba(0,0,0,.35)', overflow: 'hidden' }}>
          {/* Pestañas */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            <button type="button" style={tabBtn(tab === 'emoji')} onClick={() => setTab('emoji')}>😊 Emojis</button>
            <button type="button" style={tabBtn(tab === 'sticker')} onClick={() => setTab('sticker')}>🖼 Stickers</button>
          </div>

          {tab === 'emoji' ? (
            <div style={{ padding: 10 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                {EMOJI_GROUPS.map(g => (
                  <button key={g.name} type="button" onClick={() => setGroup(g.name)}
                    style={{ width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 15, border: '1px solid ' + (g.name === group ? 'var(--accent)' : 'transparent'), background: g.name === group ? 'var(--bg3)' : 'transparent' }}>
                    {g.emojis[0]}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
                {currentGroup.emojis.map((e, i) => (
                  <button key={i} type="button" onClick={() => { onInsertText?.(e) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4, borderRadius: 6 }}>{e}</button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ padding: 10, maxHeight: 300, overflow: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginBottom: 8 }}>
                <button type="button" style={linkBtn} onClick={() => fileRef.current?.click()}>＋ Subir</button>
                {stickers.length > 0 && <button type="button" style={linkBtn} onClick={() => setManage(m => !m)}>{manage ? 'Listo' : 'Editar'}</button>}
              </div>
              <input ref={fileRef} type="file" hidden accept="image/*,.webp" onChange={e => uploadSticker(e.target.files?.[0])} />
              {stickers.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text3)', padding: 14, textAlign: 'center' }}>Sube tu primer sticker (una imagen, idealmente .webp).</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {stickers.map(stk => (
                    <div key={stk.id} style={{ position: 'relative' }}>
                      <img src={mediaUrl(accId, stk.mediaId)} alt="" onClick={() => !manage && sendSticker(stk)}
                        style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'contain', cursor: manage ? 'default' : 'pointer', borderRadius: 8, background: 'var(--bg3)', padding: 4, boxSizing: 'border-box' }} />
                      {manage && <button type="button" onClick={() => deleteSticker(stk.id)} title="Eliminar"
                        style={{ position: 'absolute', top: -6, right: -6, background: '#ff5f5f', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 11, lineHeight: '16px' }}>×</button>}
                    </div>
                  ))}
                </div>
              )}
              {busy && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Procesando…</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
