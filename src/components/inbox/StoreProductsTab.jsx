import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount } from '../../context/AccountContext'
import { listStoreProducts, updateStoreProduct } from '../../lib/storage'

// Pestaña "Productos": todos los productos de la tienda, EDITABLES desde aquí
// (conexión doble canal: los cambios se escriben en WooCommerce/Shopify). Los que
// están en la base vectorial se etiquetan "🔎 Indexado".
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }
const input = { width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--bg1)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }
const lbl = { fontSize: 10.5, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', display: 'block', margin: '8px 0 3px' }

const editable = p => ({
  name: p.name || '', regularPrice: p.regularPrice ?? p.price ?? '', salePrice: p.salePrice || '',
  stockStatus: p.stockStatus || 'instock', status: p.status || 'publish', shortDescription: p.shortDescription || '',
})
const isDirty = it => JSON.stringify(it._edit) !== JSON.stringify(it._orig)

export default function StoreProductsTab() {
  const { account } = useAccount()
  const accId = account?.id
  const isShopify = (account?.woocommerce?.platform || 'woocommerce') === 'shopify'
  const currency = account?.woocommerce?.currency || ''
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [cursor, setCursor] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState('traditional')   // 'traditional' | 'semantic'
  const [info, setInfo] = useState('')              // aviso del modo semántico
  const [err, setErr] = useState('')
  const searchTimer = useRef(null)

  const fetchPage = useCallback(async (reset, opts = {}) => {
    if (!accId) return
    const m = opts.mode ?? mode
    const s = opts.search ?? search
    // Modo semántico: necesita consulta (embebe el texto para buscar por concepto).
    if (m === 'semantic' && !s.trim()) { setItems([]); setHasMore(false); setInfo('Escribe una consulta para probar la búsqueda semántica (por concepto: "algo para regalar", "para piel grasa"…).'); return }
    setLoading(true); setErr(''); setInfo('')
    try {
      const params = m === 'semantic'
        ? { search: s, mode: 'semantic' }
        : (reset ? { page: 1, search: s } : (cursor ? { cursor, search: s } : { page: page + 1, search: s }))
      const r = await listStoreProducts(accId, params)
      const mapped = (r.products || []).map((p, i) => ({ ...p, _rank: i + 1, _edit: editable(p), _orig: editable(p) }))
      setItems((reset || m === 'semantic') ? mapped : (a => [...a, ...mapped]))
      setHasMore(m === 'semantic' ? false : !!r.hasMore)
      setCursor(r.nextCursor || '')
      setPage(reset ? 1 : (cursor ? page : page + 1))
      if (m === 'semantic' && r.unavailable) setInfo('El índice vectorial está vacío o falta la API key de OpenAI. Actívalo y sincroniza en Configuración → «Búsqueda inteligente (IA)».')
      else if (m === 'semantic' && !mapped.length) setInfo('Sin resultados relevantes en el índice para esa consulta.')
      else if (m === 'semantic') setInfo('Resultados ordenados por relevancia semántica (solo productos indexados) — así busca la IA.')
    } catch (e) { setErr(e.message || 'No se pudieron cargar los productos') }
    setLoading(false)
  }, [accId, search, page, cursor, mode])

  useEffect(() => { fetchPage(true) /* primera carga */ }, [accId]) // eslint-disable-line

  // Búsqueda con debounce → recarga desde la primera página.
  function onSearch(v) {
    setSearch(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); setCursor(''); fetchPage(true, { search: v }) }, 500)
  }
  function switchMode(m) {
    if (m === mode) return
    setMode(m); setPage(1); setCursor('')
    fetchPage(true, { mode: m })
  }

  const setField = (id, k, v) => setItems(a => a.map(it => it.id === id ? { ...it, _edit: { ...it._edit, [k]: v }, _saved: false } : it))

  async function save(it) {
    setItems(a => a.map(x => x.id === it.id ? { ...x, _saving: true, _err: '' } : x))
    try {
      const patch = { ...it._edit }
      if (isShopify) { patch.variantId = it.variantId; delete patch.salePrice; delete patch.stockStatus }
      const r = await updateStoreProduct(accId, it.id, patch)
      setItems(a => a.map(x => x.id === it.id
        ? { ...x, ...r, _edit: editable(r), _orig: editable(r), _saving: false, _saved: true, _err: '', indexed: r.indexed ?? x.indexed }
        : x))
      setTimeout(() => setItems(a => a.map(x => x.id === it.id ? { ...x, _saved: false } : x)), 2500)
    } catch (e) {
      setItems(a => a.map(x => x.id === it.id ? { ...x, _saving: false, _err: e.message || 'No se pudo guardar' } : x))
    }
  }

  if (!account?.woocommerce?.connected) {
    return <div style={{ padding: 22, color: 'var(--text3)', fontSize: 13.5 }}>Conecta la tienda en la pestaña <strong>Configuración</strong> para ver y editar sus productos aquí.</div>
  }

  return (
    <div style={{ padding: 22, overflowY: 'auto' }}>
      <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>📦 Productos de la tienda</h2>
      <p style={{ fontSize: 12.5, color: 'var(--text3)', margin: '0 0 12px', maxWidth: 760 }}>
        Edítalos aquí y los cambios se guardan directamente en tu tienda ({isShopify ? 'Shopify' : 'WooCommerce'}).
        Los marcados con <span style={{ color: '#22d98a', fontWeight: 600 }}>🔎 Indexado</span> están en la base vectorial de búsqueda inteligente.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
        <input style={{ ...input, maxWidth: 420, flex: '1 1 260px' }} placeholder={mode === 'semantic' ? 'Buscar por concepto… (como la IA)' : 'Buscar productos…'} value={search} onChange={e => onSearch(e.target.value)} />
        {/* Switch Tradicional / Semántica: para comparar ambos buscadores. */}
        <div style={{ display: 'inline-flex', border: '1px solid var(--border2)', borderRadius: 9, overflow: 'hidden' }}>
          {[['traditional', '🔤 Tradicional'], ['semantic', '🔎 Semántica (IA)']].map(([m, l]) => (
            <button key={m} onClick={() => switchMode(m)}
              style={{ padding: '8px 12px', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                background: mode === m ? 'var(--accent)' : 'transparent', color: mode === m ? '#fff' : 'var(--text2)' }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text3)', margin: '0 0 12px' }}>
        {mode === 'semantic'
          ? 'Semántica: usa la base vectorial (embeddings) — entiende el concepto, no solo palabras exactas. Es como busca el asistente IA.'
          : 'Tradicional: búsqueda de la tienda por nombre/SKU (todos los productos, también borradores).'}
      </p>

      {info && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text2)' }}>{info}</div>}
      {err && <div style={{ marginBottom: 12, padding: '9px 12px', borderRadius: 8, fontSize: 12.5, background: 'rgba(255,95,95,.12)', border: '1px solid #ff5f5f55', color: '#ff5f5f' }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
        {items.map(it => {
          const dirty = isDirty(it)
          return (
            <div key={it.id} style={{ ...card, borderColor: dirty ? 'var(--accent)' : 'var(--border)' }}>
              <div style={{ display: 'flex', gap: 10 }}>
                {it.images?.[0]
                  ? <img src={it.images[0]} alt="" referrerPolicy="no-referrer" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: 'var(--bg3)' }} />
                  : <div style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>📦</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input style={{ ...input, fontWeight: 600 }} value={it._edit.name} onChange={e => setField(it.id, 'name', e.target.value)} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {mode === 'semantic' && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-dim, rgba(124,111,255,.14))', borderRadius: 20, padding: '2px 8px' }}>#{it._rank}</span>}
                    {it.indexed
                      ? <span style={{ fontSize: 10.5, fontWeight: 700, color: '#22d98a', background: 'rgba(34,217,138,.12)', border: '1px solid #22d98a55', borderRadius: 20, padding: '2px 8px' }}>🔎 Indexado</span>
                      : <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text3)', border: '1px solid var(--border2)', borderRadius: 20, padding: '2px 8px' }}>○ Sin indexar</span>}
                    {it.sku && <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>SKU {it.sku}</span>}
                    {it.permalink && <a href={it.permalink} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: 'var(--accent)' }}>ver ↗</a>}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isShopify ? '1fr 1fr' : '1fr 1fr', gap: 8, marginTop: 8 }}>
                <div>
                  <label style={lbl}>Precio {currency && `(${currency})`}</label>
                  <input style={input} value={it._edit.regularPrice} onChange={e => setField(it.id, 'regularPrice', e.target.value)} inputMode="decimal" />
                </div>
                {!isShopify ? (
                  <div>
                    <label style={lbl}>Precio oferta</label>
                    <input style={input} value={it._edit.salePrice} onChange={e => setField(it.id, 'salePrice', e.target.value)} inputMode="decimal" placeholder="—" />
                  </div>
                ) : (
                  <div>
                    <label style={lbl}>Estado</label>
                    <select style={input} value={it._edit.status} onChange={e => setField(it.id, 'status', e.target.value)}>
                      <option value="publish">Activo</option><option value="draft">Borrador</option>
                    </select>
                  </div>
                )}
              </div>

              {!isShopify && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                  <div>
                    <label style={lbl}>Stock</label>
                    <select style={input} value={it._edit.stockStatus} onChange={e => setField(it.id, 'stockStatus', e.target.value)}>
                      <option value="instock">En stock</option><option value="outofstock">Agotado</option><option value="onbackorder">Bajo pedido</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Publicación</label>
                    <select style={input} value={it._edit.status} onChange={e => setField(it.id, 'status', e.target.value)}>
                      <option value="publish">Publicado</option><option value="draft">Borrador</option>
                    </select>
                  </div>
                </div>
              )}

              <label style={lbl}>Descripción corta</label>
              <textarea style={{ ...input, minHeight: 44, resize: 'vertical', fontFamily: 'inherit' }} value={it._edit.shortDescription} onChange={e => setField(it.id, 'shortDescription', e.target.value)} placeholder="Resumen para el cliente…" />

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <button onClick={() => save(it)} disabled={!dirty || it._saving}
                  style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: (!dirty || it._saving) ? 'default' : 'pointer', fontSize: 12.5, fontWeight: 700,
                    background: (!dirty || it._saving) ? 'var(--bg3)' : 'var(--accent)', color: (!dirty || it._saving) ? 'var(--text3)' : '#fff' }}>
                  {it._saving ? 'Guardando…' : it._saved ? '✓ Guardado' : 'Guardar en la tienda'}
                </button>
                {dirty && !it._saving && <span style={{ fontSize: 11.5, color: 'var(--accent)' }}>cambios sin guardar</span>}
                {it._err && <span style={{ fontSize: 11.5, color: '#ff5f5f' }}>{it._err}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {loading && <div style={{ padding: 18, color: 'var(--text3)', fontSize: 13 }}>Cargando productos…</div>}
      {!loading && !items.length && !err && <div style={{ padding: 18, color: 'var(--text3)', fontSize: 13 }}>No se encontraron productos.</div>}
      {hasMore && !loading && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => fetchPage(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cargar más</button>
        </div>
      )}
    </div>
  )
}
