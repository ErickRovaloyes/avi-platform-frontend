import { useState, useEffect, useCallback } from 'react'
import { metaCatalogGet, metaCatalogDiscover, metaCatalogProducts, metaCatalogConnect, metaCatalogDisconnect } from '../../lib/storage'
import VectorIndexCard from '../inbox/VectorIndexCard'

// Conectar el catálogo de Meta (Commerce) de la cuenta y LEER sus productos.
// Reutiliza el token de los canales de WhatsApp ya conectados; si no, se puede
// pegar un Catalog ID + Access Token manualmente.
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 }
const inp = { padding: '9px 11px', background: 'var(--bg1)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontSize: 13.5, width: '100%', boxSizing: 'border-box' }
const btn = (bg, c = '#fff') => ({ padding: '9px 15px', borderRadius: 8, border: 'none', cursor: 'pointer', background: bg, color: c, fontSize: 13, fontWeight: 700 })
const lbl = { fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', margin: '12px 0 5px' }

export default function MetaCatalogPanel({ accId }) {
  const [status, setStatus] = useState(null)        // { connected, catalogId, name }
  const [discovered, setDiscovered] = useState(null) // [] | null
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [manual, setManual] = useState({ catalogId: '', accessToken: '' })

  const [products, setProducts] = useState(null)    // [] | null
  const [after, setAfter] = useState(null)
  const [loadingProd, setLoadingProd] = useState(false)

  const loadStatus = useCallback(async () => {
    try { setStatus(await metaCatalogGet(accId)) } catch { setStatus({ connected: false }) }
  }, [accId])
  useEffect(() => { loadStatus() }, [loadStatus])

  const loadProducts = useCallback(async (reset = true) => {
    setLoadingProd(true); setErr('')
    try {
      const r = await metaCatalogProducts(accId, { limit: 30, after: reset ? null : after })
      setProducts(p => reset ? (r.products || []) : [...(p || []), ...(r.products || [])])
      setAfter(r.after || null)
    } catch (e) { setErr(e.message || 'No se pudieron leer los productos') }
    setLoadingProd(false)
  }, [accId, after])

  useEffect(() => { if (status?.connected) loadProducts(true) }, [status?.connected]) // eslint-disable-line

  async function detect() {
    setBusy(true); setErr(''); setDiscovered(null)
    try { const r = await metaCatalogDiscover(accId); setDiscovered(r.catalogs || []) }
    catch (e) { setErr(e.message || 'No se pudieron detectar catálogos'); setDiscovered([]) }
    setBusy(false)
  }
  async function connect(body) {
    setBusy(true); setErr('')
    try { const s = await metaCatalogConnect(accId, body); setStatus(s); setProducts(null); setAfter(null) }
    catch (e) { setErr(e.message || 'No se pudo conectar el catálogo') }
    setBusy(false)
  }
  async function disconnect() {
    if (!confirm('¿Desconectar el catálogo de Meta?')) return
    setBusy(true)
    try { await metaCatalogDisconnect(accId); setStatus({ connected: false }); setProducts(null); setDiscovered(null) }
    catch (e) { setErr(e.message || 'Error') }
    setBusy(false)
  }

  if (!status) return <div style={{ padding: 24, color: 'var(--text3)' }}>Cargando…</div>

  return (
    <div style={{ padding: 24, maxWidth: 920, overflowY: 'auto' }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>🛍 Catálogo de Meta</h1>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 16px' }}>
        Conecta el catálogo de productos de tu cuenta de Meta (Commerce / WhatsApp Shopping) y lee su contenido aquí.
      </p>

      {err && <div style={{ ...card, color: '#ff5f5f', borderColor: '#ff5f5f55', background: 'rgba(255,95,95,.08)', fontSize: 13 }}>{err}</div>}

      {status.connected ? (
        <>
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22 }}>🛍</span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{status.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Catalog ID: {status.catalogId} · <span style={{ color: '#22d98a' }}>● Conectado</span></div>
            </div>
            <button style={btn('transparent', 'var(--text)')} onClick={() => loadProducts(true)} disabled={loadingProd}>↻ Actualizar</button>
            <button style={btn('transparent', '#ff5f5f')} onClick={disconnect} disabled={busy}>Desconectar</button>
          </div>

          {/* Búsqueda inteligente (índice vectorial). El catálogo Meta no tiene
              webhooks de producto → solo modo programado + sincronización manual. */}
          <VectorIndexCard
            accId={accId}
            source="meta"
            allowRealtime={false}
            realtimeHint="El catálogo de Meta no envía webhooks de producto: el índice se actualiza de forma programada o con «Sincronizar ahora»."
            style={{ marginBottom: 14, maxWidth: 'none' }}
          />

          {products === null && loadingProd ? (
            <div style={{ padding: 24, color: 'var(--text3)' }}>Leyendo productos…</div>
          ) : products && products.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text3)', textAlign: 'center', border: '1px dashed var(--border2)', borderRadius: 12 }}>El catálogo no tiene productos (o el token no tiene permiso para leerlos).</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
                {(products || []).map(p => <ProductCard key={p.id} p={p} />)}
              </div>
              {after && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button style={btn('var(--bg3)', 'var(--text)')} onClick={() => loadProducts(false)} disabled={loadingProd}>{loadingProd ? 'Cargando…' : 'Cargar más'}</button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div style={card}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Detección automática</div>
            <p style={{ fontSize: 12.5, color: 'var(--text2)', margin: '0 0 12px' }}>Busca catálogos accesibles con tus canales de WhatsApp ya conectados.</p>
            <button style={btn('linear-gradient(135deg,var(--accent),var(--accent2))')} onClick={detect} disabled={busy}>{busy ? 'Detectando…' : '🔎 Detectar catálogos'}</button>

            {discovered !== null && (
              discovered.length === 0 ? (
                <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text3)' }}>No se encontraron catálogos automáticamente. Usa la conexión manual de abajo.</div>
              ) : (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {discovered.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--border2)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>ID: {c.id}{c.displayPhone ? ` · ${c.displayPhone}` : ''}</div>
                      </div>
                      <button style={btn('var(--accent)')} onClick={() => connect({ catalogId: c.id })} disabled={busy}>Conectar</button>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          <div style={card}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Conexión manual</div>
            <p style={{ fontSize: 12.5, color: 'var(--text2)', margin: '0 0 6px' }}>Pega el ID del catálogo (Commerce Manager). El Access Token es opcional si ya tienes WhatsApp conectado.</p>
            <label style={lbl}>Catalog ID</label>
            <input style={inp} value={manual.catalogId} onChange={e => setManual(m => ({ ...m, catalogId: e.target.value }))} placeholder="p. ej. 1234567890" />
            <label style={lbl}>Access Token (opcional)</label>
            <input style={inp} value={manual.accessToken} onChange={e => setManual(m => ({ ...m, accessToken: e.target.value }))} placeholder="Token con permiso de catálogo (si no usas WhatsApp)" />
            <div style={{ marginTop: 12 }}>
              <button style={btn('var(--accent)')} disabled={busy || !manual.catalogId.trim()}
                onClick={() => connect({ catalogId: manual.catalogId.trim(), accessToken: manual.accessToken.trim() || undefined })}>
                Conectar catálogo
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ProductCard({ p }) {
  const avail = String(p.availability || '').replace(/_/g, ' ')
  const inStock = /in stock|available/i.test(avail)
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ aspectRatio: '1 / 1', background: 'var(--bg1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {p.image_url
          ? <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
          : <span style={{ fontSize: 34 }}>🛍</span>}
      </div>
      <div style={{ padding: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.name || p.retailer_id || 'Sin nombre'}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{p.price || ''}</span>
          {avail && <span style={{ fontSize: 10.5, fontWeight: 700, color: inStock ? '#22d98a' : '#f5a623', whiteSpace: 'nowrap' }}>{inStock ? '● ' : '○ '}{avail}</span>}
        </div>
        {p.brand && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{p.brand}</div>}
      </div>
    </div>
  )
}
