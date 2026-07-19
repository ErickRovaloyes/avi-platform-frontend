import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { listGallery, createGalleryItem, deleteGalleryItem, uploadChatMedia, mediaUrl } from '../../lib/storage'

// Galería de medios con 3 divisiones: Personales · Equipo · CMS (solo lectura).
// Lo subido al CMS aparece aquí (unidireccional); lo subido a la galería NO va al CMS.
export default function GalleryModal({ accId, onClose, onSend }) {
  const { account } = useAccount()
  const [tab, setTab] = useState('personal')      // personal | team | cms
  const [data, setData] = useState({ personal: [], team: [] })
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied] = useState(null)

  const reload = () => { setLoading(true); listGallery(accId).then(r => setData(r || { personal: [], team: [] })).catch(() => setData({ personal: [], team: [] })).finally(() => setLoading(false)) }
  useEffect(() => { reload() }, [accId])

  // La división CMS se lee de account.cmsAssets (solo los que tienen medio).
  const cmsItems = (account?.cmsAssets || []).filter(a => a.mediaId).map(a => ({
    id: a.id, name: a.name || a.filename || 'Recurso', kind: a.kind || 'file', mediaId: a.mediaId, mime: a.mime || '', sizeBytes: a.sizeBytes || 0, filename: a.filename || '', _cms: true,
  }))
  const items = tab === 'cms' ? cmsItems : (data[tab] || [])

  async function onUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    try {
      for (const f of files) {
        const r = await uploadChatMedia(accId, f, 'gallery')
        await createGalleryItem(accId, { scope: tab, name: f.name, kind: r.kind, mediaId: r.mediaId, mime: r.mime, sizeBytes: r.sizeBytes, filename: r.filename || f.name })
      }
      reload()
    } catch (err) { alert(err.message || 'No se pudo subir') }
    finally { setUploading(false); if (e.target) e.target.value = '' }
  }
  async function del(it) {
    if (!confirm(`¿Eliminar "${it.name}" de la galería?`)) return
    try { await deleteGalleryItem(accId, it.id); reload() } catch (err) { alert(err.message) }
  }
  function copyLink(it) {
    try { navigator.clipboard?.writeText(mediaUrl(accId, it.mediaId)) } catch {}
    setCopied(it.id); setTimeout(() => setCopied(c => (c === it.id ? null : c)), 1400)
  }

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001, padding: 16 }
  const box = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, width: 'min(720px,96vw)', height: 'min(560px,90vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.4)' }
  const tabBtn = on => ({ padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: on ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}` })
  const smallBtn = { padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', cursor: 'pointer', fontSize: 11 }
  const fmtSize = b => !b ? '' : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <strong style={{ fontSize: 15 }}>🖼 Galería</strong>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          <button style={tabBtn(tab === 'personal')} onClick={() => setTab('personal')}>👤 Personales</button>
          <button style={tabBtn(tab === 'team')} onClick={() => setTab('team')}>👥 Equipo</button>
          <button style={tabBtn(tab === 'cms')} onClick={() => setTab('cms')}>📁 CMS</button>
          {tab !== 'cms' && (
            <label style={{ marginLeft: 'auto', alignSelf: 'center', marginRight: 12, ...smallBtn, padding: '6px 12px', fontSize: 12, background: 'var(--accent)', color: '#fff', border: 'none' }}>
              {uploading ? 'Subiendo…' : `⬆ Subir a ${tab === 'team' ? 'Equipo' : 'Personales'}`}
              <input type="file" multiple hidden disabled={uploading} onChange={onUpload} />
            </label>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {tab === 'cms' && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>Solo lectura. Estos archivos vienen del CMS de la cuenta.</div>}
          {loading && tab !== 'cms' ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>Cargando…</div> : (
            items.length === 0
              ? <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>{tab === 'cms' ? 'No hay recursos en el CMS todavía.' : 'Sin archivos. Sube el primero.'}</div>
              : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
                  {items.map(it => {
                    const url = mediaUrl(accId, it.mediaId)
                    return (
                      <div key={it.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg2)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ height: 100, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {it.kind === 'image' ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                            : it.kind === 'video' ? <video src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : it.kind === 'audio' ? <span style={{ fontSize: 34 }}>🎵</span>
                                : <span style={{ fontSize: 34 }}>📄</span>}
                        </div>
                        <div style={{ padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={it.name}>{it.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)' }}>{it.kind}{it.sizeBytes ? ` · ${fmtSize(it.sizeBytes)}` : ''}</div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {onSend && <button style={{ ...smallBtn, borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={() => { onSend(it); onClose() }}>Enviar</button>}
                            <button style={smallBtn} onClick={() => copyLink(it)}>{copied === it.id ? '✓' : '🔗'}</button>
                            {!it._cms && <button style={{ ...smallBtn, color: 'var(--red,#ff5f5f)' }} onClick={() => del(it)}>🗑</button>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
          )}
        </div>
      </div>
    </div>
  )
}
