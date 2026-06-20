import { useState, useRef, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { uploadChatMedia, uploadMedia, mediaUrl } from '../../lib/storage'

/**
 * Selector de stickers para el compositor del chat. La biblioteca de stickers es a
 * nivel de cuenta (account.stickers). Al hacer clic, envía el sticker por el mismo
 * camino que cualquier media (uploadMedia) → entrega al canal real + se persiste.
 */
export default function StickerPicker({ accId, agId, convId, senderName }) {
  const { account, addSticker, deleteSticker } = useAccount()
  const stickers = account?.stickers || []
  const [open, setOpen] = useState(false)
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

  async function send(stk) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(mediaUrl(accId, stk.mediaId))
      const blob = await res.blob()
      const ext = (stk.mime?.split('/')[1] || 'webp').replace('+xml', '')
      const file = new File([blob], `${stk.name || 'sticker'}.${ext}`, { type: stk.mime || 'image/webp' })
      await uploadMedia(accId, agId, convId, file, { sender: 'human', senderName })
      setOpen(false)
    } catch (e) { alert('No se pudo enviar el sticker: ' + (e?.message || 'error')) }
    setBusy(false)
  }

  async function upload(f) {
    if (!f) return
    setBusy(true)
    try {
      const up = await uploadChatMedia(accId, f, 'sticker')
      addSticker({ mediaId: up.mediaId, mime: up.mime, name: f.name.replace(/\.[^.]+$/, '') })
    } catch (e) { alert('No se pudo subir: ' + (e?.message || 'error')) }
    if (fileRef.current) fileRef.current.value = ''
    setBusy(false)
  }

  const btn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text2)', cursor: 'pointer', fontSize: 16 }
  const linkBtn = { background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12 }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button type="button" style={btn} title="Stickers" onClick={() => setOpen(o => !o)}>😀</button>
      {open && (
        <div style={{ position: 'absolute', bottom: '120%', left: 0, width: 290, maxHeight: 300, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 12, padding: 10, zIndex: 60, boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>Stickers</strong>
            <span style={{ display: 'flex', gap: 12 }}>
              <button type="button" style={linkBtn} onClick={() => fileRef.current?.click()}>＋ Subir</button>
              {stickers.length > 0 && <button type="button" style={linkBtn} onClick={() => setManage(m => !m)}>{manage ? 'Listo' : 'Editar'}</button>}
            </span>
          </div>
          <input ref={fileRef} type="file" hidden accept="image/*,.webp" onChange={e => upload(e.target.files?.[0])} />
          {stickers.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: 14, textAlign: 'center' }}>Sube tu primer sticker (una imagen, idealmente .webp).</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {stickers.map(stk => (
                <div key={stk.id} style={{ position: 'relative' }}>
                  <img src={mediaUrl(accId, stk.mediaId)} alt="" onClick={() => !manage && send(stk)}
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
  )
}
