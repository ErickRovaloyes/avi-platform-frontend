import { useState, useRef } from 'react'
import { useAccount } from '../../context/AccountContext'
import { uploadChatMedia, mediaUrl } from '../../lib/storage'
import s from './CmsPanel.module.css'

// División PRODUCTOS/CATÁLOGO del CMS. A diferencia de los archivos sueltos, un
// producto tiene nombre, precio, varias fotos, descripción, categorías asignables
// y atributos personalizados (pares nombre/valor que crea el propio negocio).
const money = (n, cur) => {
  try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: cur || 'COP', maximumFractionDigits: 0 }).format(Number(n) || 0) }
  catch { return `${(Number(n) || 0).toLocaleString('es-CO')} ${cur || ''}`.trim() }
}
const emptyProduct = () => ({ name: '', description: '', price: 0, currency: 'COP', photos: [], categories: [], attributes: [], active: true })

export default function ProductsPanel() {
  const { account, addCmsProduct, updateCmsProduct, deleteCmsProduct, addCmsCategory } = useAccount()
  const accId = account?.id
  const products = account?.cmsProducts || []
  const categories = account?.cmsCategories || []

  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)   // { ...product } (nuevo o existente)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [newCat, setNewCat] = useState('')
  const fileRef = useRef(null)

  const setE = patch => setEditing(e => ({ ...e, ...patch }))
  const startNew = () => { setErr(''); setEditing(emptyProduct()) }
  const startEdit = p => { setErr(''); setEditing({ ...emptyProduct(), ...p }) }

  const matches = p => `${p.name} ${p.description || ''} ${(p.categories || []).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())
  const shown = q.trim() ? products.filter(matches) : products

  async function onPickPhotos(files) {
    const list = [...(files || [])].filter(f => f.type?.startsWith('image/'))
    if (!list.length || !accId) return
    setBusy('photos'); setErr('')
    try {
      const ids = []
      for (const f of list) { const up = await uploadChatMedia(accId, f, 'cms'); if (up?.mediaId) ids.push(up.mediaId) }
      setE({ photos: [...(editing.photos || []), ...ids] })
    } catch (e) { setErr('No se pudieron subir las fotos: ' + (e?.message || '')) }
    setBusy(''); if (fileRef.current) fileRef.current.value = ''
  }
  const removePhoto = mid => setE({ photos: (editing.photos || []).filter(x => x !== mid) })
  const movePhotoFirst = mid => setE({ photos: [mid, ...(editing.photos || []).filter(x => x !== mid)] })

  const toggleCat = name => setE({ categories: (editing.categories || []).includes(name) ? editing.categories.filter(c => c !== name) : [...(editing.categories || []), name] })
  function createCat() {
    const n = newCat.trim(); if (!n) return
    if (!categories.some(c => c.name.toLowerCase() === n.toLowerCase())) addCmsCategory(n)
    if (!(editing.categories || []).includes(n)) setE({ categories: [...(editing.categories || []), n] })
    setNewCat('')
  }

  const addAttr = () => setE({ attributes: [...(editing.attributes || []), { name: '', value: '' }] })
  const setAttr = (i, patch) => setE({ attributes: (editing.attributes || []).map((a, idx) => idx === i ? { ...a, ...patch } : a) })
  const removeAttr = i => setE({ attributes: (editing.attributes || []).filter((_, idx) => idx !== i) })

  function save() {
    if (!editing.name.trim()) { setErr('Ponle un nombre al producto'); return }
    const clean = {
      name: editing.name.trim(), description: (editing.description || '').trim(),
      price: Number(editing.price) || 0, currency: (editing.currency || 'COP').trim() || 'COP',
      photos: editing.photos || [], categories: editing.categories || [],
      attributes: (editing.attributes || []).filter(a => a.name.trim()).map(a => ({ name: a.name.trim(), value: (a.value ?? '').toString().trim() })),
      active: editing.active !== false,
    }
    if (editing.id) updateCmsProduct(editing.id, clean)
    else addCmsProduct(clean)
    setEditing(null); setErr('')
  }
  function remove(p) {
    if (!confirm(`¿Eliminar el producto "${p.name}"? El asistente dejará de poder ofrecerlo.`)) return
    deleteCmsProduct(p.id)
  }

  return (
    <div>
      <div className={s.intro}>
        📦 Crea tu <strong>catálogo de productos</strong>: cada uno con nombre, precio, varias fotos, descripción,
        <strong> categorías</strong> y <strong>atributos personalizados</strong> (color, talla, material… los defines tú).
      </div>

      <div className={s.toolbar}>
        <input className={s.search} placeholder="🔍 Buscar productos…" value={q} onChange={e => setQ(e.target.value)} />
        {!editing && <button className={s.newBtn} onClick={startNew}>+ Nuevo producto</button>}
      </div>

      {editing && (
        <div className={s.form}>
          {/* Fotos */}
          <div className={s.field}>
            <label>Fotos <span style={{ fontWeight: 400 }}>(la primera es la portada)</span></label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(editing.photos || []).map((mid, i) => (
                <div key={mid} style={{ position: 'relative', width: 82, height: 82, borderRadius: 8, overflow: 'hidden', border: `1px solid ${i === 0 ? 'var(--accent)' : 'var(--border2)'}` }}>
                  <img src={mediaUrl(accId, mid)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.opacity = '.3' }} />
                  {i === 0 && <span style={{ position: 'absolute', top: 2, left: 2, fontSize: 9, fontWeight: 700, color: '#fff', background: 'var(--accent)', borderRadius: 4, padding: '0 4px' }}>Portada</span>}
                  <div style={{ position: 'absolute', bottom: 0, right: 0, display: 'flex', gap: 2, padding: 2 }}>
                    {i !== 0 && <button type="button" title="Poner de portada" onClick={() => movePhotoFirst(mid)} style={miniBtn}>★</button>}
                    <button type="button" title="Quitar" onClick={() => removePhoto(mid)} style={{ ...miniBtn, color: '#ff5f5f' }}>✕</button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === 'photos'}
                style={{ width: 82, height: 82, borderRadius: 8, border: '1px dashed var(--border2)', background: 'var(--bg3)', color: 'var(--text3)', fontSize: 22, cursor: 'pointer' }}>
                {busy === 'photos' ? '…' : '＋'}
              </button>
              <input ref={fileRef} type="file" hidden accept="image/*" multiple onChange={e => onPickPhotos(e.target.files)} />
            </div>
          </div>

          <div className={s.row}>
            <div className={s.field} style={{ flex: 2 }}>
              <label>Nombre del producto *</label>
              <input className={s.input} value={editing.name} onChange={e => setE({ name: e.target.value })} placeholder="Ej: Camiseta Oversize" />
            </div>
            <div className={s.field}>
              <label>Precio</label>
              <input className={s.input} type="number" min="0" value={editing.price} onChange={e => setE({ price: e.target.value })} placeholder="0" />
            </div>
            <div className={s.field} style={{ maxWidth: 90 }}>
              <label>Moneda</label>
              <input className={s.input} value={editing.currency} onChange={e => setE({ currency: e.target.value.toUpperCase().slice(0, 6) })} placeholder="COP" />
            </div>
          </div>

          <div className={s.field}>
            <label>Descripción</label>
            <textarea className={s.textarea} value={editing.description} onChange={e => setE({ description: e.target.value })} placeholder="Detalles, materiales, medidas, para qué sirve…" />
          </div>

          {/* Categorías */}
          <div className={s.field}>
            <label>Categorías</label>
            <div className={s.tagSelect}>
              {categories.map(c => {
                const on = (editing.categories || []).includes(c.name)
                return <button type="button" key={c.id} className={`${s.tagChip} ${on ? s.tagChipOn : ''}`} onClick={() => toggleCat(c.name)}>{on ? '✓ ' : ''}{c.name}</button>
              })}
              <span className={s.tagAdd}>
                <input className={s.tagAddInput} placeholder="+ categoría" value={newCat} onChange={e => setNewCat(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createCat() } }} />
              </span>
            </div>
          </div>

          {/* Atributos personalizados */}
          <div className={s.field}>
            <label>Atributos personalizados <span style={{ fontWeight: 400 }}>(nombre + valor: Color / Rojo, Talla / M…)</span></label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(editing.attributes || []).map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                  <input className={s.input} style={{ flex: 1 }} placeholder="Atributo (ej: Color)" value={a.name} onChange={e => setAttr(i, { name: e.target.value })} />
                  <input className={s.input} style={{ flex: 1 }} placeholder="Valor (ej: Rojo)" value={a.value} onChange={e => setAttr(i, { value: e.target.value })} />
                  <button type="button" className={s.delBtn} onClick={() => removeAttr(i)}>🗑</button>
                </div>
              ))}
              <button type="button" className={s.ghostBtn} style={{ alignSelf: 'flex-start' }} onClick={addAttr}>+ Añadir atributo</button>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
            <input type="checkbox" checked={editing.active !== false} onChange={e => setE({ active: e.target.checked })} />
            Producto activo (visible para el asistente)
          </label>

          {err && <div className={s.err}>{err}</div>}
          <div className={s.formActions}>
            <button type="button" className={s.ghostBtn} onClick={() => { setEditing(null); setErr('') }}>Cancelar</button>
            <button type="button" className={s.newBtn} onClick={save} disabled={!!busy}>{editing.id ? 'Guardar cambios' : 'Crear producto'}</button>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <div className={s.empty}>{q.trim() ? 'Sin resultados.' : 'Aún no hay productos. Crea el primero para tu catálogo.'}</div>
      ) : (
        <div className={s.grid}>
          {shown.map(p => (
            <div key={p.id} className={s.card} style={{ opacity: p.active === false ? 0.6 : 1 }}>
              <div className={s.thumb} style={{ cursor: 'pointer', position: 'relative' }} onClick={() => startEdit(p)}>
                {p.photos?.[0]
                  ? <img src={mediaUrl(accId, p.photos[0])} alt={p.name} onError={e => { e.currentTarget.style.display = 'none' }} />
                  : <span>📦</span>}
                {p.photos?.length > 1 && <span style={{ position: 'absolute', bottom: 6, right: 6, fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,.6)', borderRadius: 6, padding: '1px 6px' }}>🖼 {p.photos.length}</span>}
              </div>
              <div className={s.cardBody}>
                <div className={s.cardName} style={{ fontWeight: 700, cursor: 'pointer' }} onClick={() => startEdit(p)}>{p.name}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>{money(p.price, p.currency)}</div>
                {p.description && <div style={{ fontSize: 11.5, color: 'var(--text3)', margin: '2px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</div>}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                  {(p.categories || []).map(c => <span key={c} className={s.badge}>🏷 {c}</span>)}
                  {(p.attributes || []).slice(0, 3).map((a, i) => <span key={i} className={s.badge}>{a.name}: {a.value}</span>)}
                  {(p.attributes || []).length > 3 && <span className={s.badge}>+{p.attributes.length - 3}</span>}
                </div>
                <div className={s.cardFoot}>
                  {p.active === false && <span className={s.badge} style={{ color: 'var(--amber)' }}>oculto</span>}
                  <button className={s.delBtn} title="Editar" onClick={() => startEdit(p)}>✎</button>
                  <button className={s.delBtn} title="Eliminar" onClick={() => remove(p)}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const miniBtn = { width: 20, height: 20, borderRadius: 5, border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
