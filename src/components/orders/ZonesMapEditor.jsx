import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw'
import 'leaflet-draw/dist/leaflet.draw.css'
import { saveOrderZone, deleteOrderZone, saveOrdersConfig, geoTestAddress } from '../../lib/storage'

// Editor visual de zonas de entrega: el admin dibuja polígonos sobre un mapa
// (Leaflet + OpenStreetMap), les asigna nombre/ciudad/costo/tiempo/color/estado y
// los guarda. El asistente geocodifica la dirección del cliente y decide con
// point-in-polygon si cae dentro de la cobertura. Incluye un probador de dirección
// que replica exactamente esa lógica (endpoint /zones/geo-test).

const COLORS = ['#4fa8ff', '#f5a623', '#7c6fff', '#ff6eb4', '#22d98a', '#2dd4c8', '#ff5f5f']
const emptyZone = () => ({ id: '', name: '', city: '', fee: 0, minOrder: 0, etaMin: 0, active: true, color: COLORS[0], extraInfo: '', polygon: null })
const toRing = latlngs => (latlngs || []).map(p => [p.lat, p.lng])   // {lat,lng}[] → [lat,lng][]

const lbl = { fontSize: 12, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 4 }
const inp = { width: '100%', padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }
const btnPri = { padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }
const btnSec = { padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }
const cardBox = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }

export default function ZonesMapEditor({ accId, zones, reload, flash, currency, cfg, setCfg }) {
  const mapEl = useRef(null)
  const map = useRef(null)
  const zoneLayer = useRef(null)     // LayerGroup con los polígonos guardados
  const draftLayer = useRef(null)    // polígono recién dibujado / en edición
  const testMarker = useRef(null)
  const drawer = useRef(null)        // instancia activa de L.Draw.Polygon

  const [editing, setEditing] = useState(null)   // zona en el formulario o null
  const [drawing, setDrawing] = useState(false)
  const [gKey, setGKey] = useState(cfg?.geoGoogleKey || '')
  const [gCountry, setGCountry] = useState(cfg?.geoCountry || '')
  const [savingGeo, setSavingGeo] = useState(false)
  const [testAddr, setTestAddr] = useState('')
  const [testRes, setTestRes] = useState(null)
  const [testing, setTesting] = useState(false)

  const money = n => { try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: currency || 'COP', maximumFractionDigits: 0 }).format(Number(n) || 0) } catch { return `${Number(n) || 0} ${currency || ''}` } }

  // ── Inicialización del mapa (una vez) ─────────────────────────────────────────
  useEffect(() => {
    if (map.current || !mapEl.current) return
    const m = L.map(mapEl.current, { center: [4.65, -74.1], zoom: 12, scrollWheelZoom: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(m)
    zoneLayer.current = L.layerGroup().addTo(m)
    map.current = m
    // El contenedor puede montar oculto/estrecho: recalcula tamaño tras el layout.
    setTimeout(() => m.invalidateSize(), 60)
    return () => { m.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Pinta las zonas guardadas cada vez que cambian ────────────────────────────
  useEffect(() => {
    const m = map.current, lg = zoneLayer.current
    if (!m || !lg) return
    lg.clearLayers()
    const bounds = []
    for (const z of (zones || [])) {
      if (!Array.isArray(z.polygon) || z.polygon.length < 3) continue
      const isEditing = editing && editing.id === z.id
      const poly = L.polygon(z.polygon, {
        color: z.color || COLORS[0], weight: 2,
        fillOpacity: z.active === false ? 0.08 : 0.28,
        dashArray: z.active === false ? '5,5' : null,
        opacity: isEditing ? 0.35 : 1,   // atenúa la copia guardada mientras se edita
      })
      poly.bindTooltip(`${z.name}${z.city ? ` · ${z.city}` : ''} — ${money(z.fee)}${z.active === false ? ' (inactiva)' : ''}`, { sticky: true })
      poly.on('click', () => openZone(z))
      poly.addTo(lg)
      z.polygon.forEach(p => bounds.push(p))
    }
    if (bounds.length && !editing) { try { m.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 }) } catch {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, editing])

  function clearDraft() {
    if (draftLayer.current) { map.current?.removeLayer(draftLayer.current); draftLayer.current = null }
    if (drawer.current) { try { drawer.current.disable() } catch {}; drawer.current = null }
    setDrawing(false)
  }

  // Empieza a dibujar un polígono; al terminar, abre el formulario (nueva zona o
  // reemplazo de forma en la que se está editando).
  function startDraw(forZone) {
    if (!map.current) return
    clearDraft()
    setDrawing(true)
    const dr = new L.Draw.Polygon(map.current, { allowIntersection: false, shapeOptions: { color: (forZone?.color) || COLORS[0], weight: 2 } })
    drawer.current = dr
    dr.enable()
    map.current.once(L.Draw.Event.CREATED, e => {
      const ring = toRing(e.layer.getLatLngs()[0])
      draftLayer.current = e.layer.addTo(map.current)
      setDrawing(false); drawer.current = null
      setEditing(prev => ({ ...(prev || forZone || emptyZone()), polygon: ring }))
    })
  }

  function openZone(z) {
    clearDraft()
    setEditing({ ...emptyZone(), ...z })
    try { if (Array.isArray(z.polygon) && z.polygon.length >= 3) map.current?.fitBounds(z.polygon, { padding: [40, 40], maxZoom: 15 }) } catch {}
  }
  function cancelEdit() { clearDraft(); setEditing(null) }

  async function saveZone() {
    if (!editing.name.trim()) return flash('El nombre de la zona es obligatorio', false)
    if (!Array.isArray(editing.polygon) || editing.polygon.length < 3) return flash('Dibuja el área de la zona en el mapa', false)
    try {
      await saveOrderZone(accId, editing)
      clearDraft(); setEditing(null); reload(); flash('Zona guardada ✓')
    } catch (e) { flash(e.message, false) }
  }
  async function removeZone(id) {
    if (!confirm('¿Eliminar esta zona de cobertura?')) return
    try { await deleteOrderZone(accId, id); clearDraft(); setEditing(null); reload(); flash('Zona eliminada ✓') } catch (e) { flash(e.message, false) }
  }

  async function saveGeo() {
    setSavingGeo(true)
    try {
      const r = await saveOrdersConfig(accId, { geoGoogleKey: gKey.trim(), geoCountry: gCountry.trim().toLowerCase() })
      setCfg?.(p => ({ ...p, ...(r?.config || {}) }))
      flash('Geocodificación guardada ✓')
    } catch (e) { flash(e.message, false) }
    setSavingGeo(false)
  }

  async function runTest() {
    const a = testAddr.trim(); if (!a) return
    setTesting(true); setTestRes(null)
    try {
      const r = await geoTestAddress(accId, a)
      setTestRes(r)
      const m = map.current
      if (m && r?.geo) {
        if (testMarker.current) m.removeLayer(testMarker.current)
        testMarker.current = L.circleMarker([r.geo.lat, r.geo.lng], {
          radius: 9, color: r.inCoverage ? '#22d98a' : '#ff5f5f', weight: 3, fillColor: r.inCoverage ? '#22d98a' : '#ff5f5f', fillOpacity: 0.6,
        }).addTo(m).bindPopup(`${r.inCoverage ? '✅ Dentro' : '❌ Fuera'} de cobertura${r.zone ? ` — ${r.zone.name}` : ''}`).openPopup()
        m.setView([r.geo.lat, r.geo.lng], 15)
      }
    } catch (e) { flash(e.message, false) }
    setTesting(false)
  }

  const e = editing
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 980 }}>
      <div style={cardBox}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>🗺 Zonas de entrega ({(zones || []).length})</div>
          <button style={btnPri} onClick={() => { setEditing(emptyZone()); startDraw(null) }}>✏️ Dibujar nueva zona</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 12px' }}>
          Dibuja el área de cobertura en el mapa. El asistente convierte la dirección del cliente en coordenadas y comprueba si cae dentro de alguna zona.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(260px, 340px)', gap: 14, alignItems: 'start' }}>
          {/* Mapa */}
          <div>
            <div ref={mapEl} style={{ height: 440, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border2)' }} />
            {drawing && <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6 }}>Haz clic en el mapa para marcar los vértices; doble clic para cerrar el polígono.</div>}
          </div>

          {/* Panel lateral: formulario de zona o lista */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {e ? (
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{e.id ? 'Editar zona' : 'Nueva zona'}</div>
                <div><label style={lbl}>Nombre *</label><input style={inp} value={e.name} onChange={ev => setEditing({ ...e, name: ev.target.value })} placeholder="Ej: Centro" /></div>
                <div><label style={lbl}>Ciudad</label><input style={inp} value={e.city} onChange={ev => setEditing({ ...e, city: ev.target.value })} placeholder="Ej: Bogotá" /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><label style={lbl}>Costo envío</label><input type="number" min="0" style={inp} value={e.fee} onChange={ev => setEditing({ ...e, fee: Number(ev.target.value) || 0 })} /></div>
                  <div><label style={lbl}>Tiempo (min)</label><input type="number" min="0" style={inp} value={e.etaMin} onChange={ev => setEditing({ ...e, etaMin: Number(ev.target.value) || 0 })} /></div>
                </div>
                <div><label style={lbl}>Pedido mínimo</label><input type="number" min="0" style={inp} value={e.minOrder} onChange={ev => setEditing({ ...e, minOrder: Number(ev.target.value) || 0 })} /></div>
                <div>
                  <label style={lbl}>Color</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {COLORS.map(c => <button key={c} type="button" onClick={() => setEditing({ ...e, color: c })}
                      style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', border: e.color === c ? '2px solid var(--text)' : '2px solid transparent' }} />)}
                  </div>
                </div>
                <div><label style={lbl}>Info adicional (la ve el cliente)</label><textarea style={{ ...inp, minHeight: 52, resize: 'vertical' }} value={e.extraInfo} onChange={ev => setEditing({ ...e, extraInfo: ev.target.value })} placeholder="Ej: entrega solo hasta las 8pm" /></div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text2)' }}>
                  <input type="checkbox" checked={e.active !== false} onChange={ev => setEditing({ ...e, active: ev.target.checked })} /> Zona activa
                </label>
                <div style={{ fontSize: 11.5, color: Array.isArray(e.polygon) && e.polygon.length >= 3 ? 'var(--green)' : 'var(--amber)' }}>
                  {Array.isArray(e.polygon) && e.polygon.length >= 3 ? `✓ Área definida (${e.polygon.length} puntos)` : '⚠ Falta dibujar el área'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={btnPri} onClick={saveZone}>Guardar</button>
                  <button style={btnSec} onClick={() => startDraw(e)}>{Array.isArray(e.polygon) && e.polygon.length >= 3 ? 'Redibujar' : 'Dibujar área'}</button>
                  <button style={btnSec} onClick={cancelEdit}>Cancelar</button>
                  {e.id && <button style={{ ...btnSec, color: '#ff5f5f', marginLeft: 'auto' }} onClick={() => removeZone(e.id)}>🗑</button>}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(zones || []).length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Aún no hay zonas. Dibuja la primera en el mapa.</div>}
                {(zones || []).map(z => (
                  <button key={z.id} onClick={() => openZone(z)}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border2)', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: z.color || COLORS[0], flexShrink: 0, opacity: z.active === false ? 0.4 : 1 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{z.name}{z.active === false ? ' · inactiva' : ''}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)' }}>{z.city ? z.city + ' · ' : ''}{money(z.fee)}{z.etaMin ? ` · ~${z.etaMin} min` : ''}{Array.isArray(z.polygon) && z.polygon.length >= 3 ? '' : ' · sin área'}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Probar dirección — replica la lógica del asistente */}
      <div style={cardBox}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>🔎 Probar una dirección</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...inp, flex: 1, minWidth: 220 }} value={testAddr} onChange={ev => setTestAddr(ev.target.value)}
            onKeyDown={ev => { if (ev.key === 'Enter') runTest() }} placeholder="Escribe una dirección (ej: Calle 100 #15-20, Bogotá)" />
          <button style={btnPri} onClick={runTest} disabled={testing}>{testing ? 'Probando…' : 'Probar'}</button>
        </div>
        {testRes && (
          <div style={{ marginTop: 10, fontSize: 13, padding: '10px 12px', borderRadius: 9, background: 'var(--bg3)', border: `1px solid ${testRes.inCoverage ? 'rgba(34,217,138,.5)' : 'rgba(255,95,95,.5)'}` }}>
            {!testRes.geo ? <span style={{ color: 'var(--amber)' }}>No se pudo ubicar la dirección. Prueba una más precisa o revisa la geocodificación.</span>
              : testRes.inCoverage
                ? <span style={{ color: 'var(--green)' }}>✅ Dentro de cobertura — <strong>{testRes.zone?.name}</strong>{testRes.zone?.city ? ` (${testRes.zone.city})` : ''}: envío {money(testRes.zone?.fee)}{testRes.zone?.etaMin ? ` · ~${testRes.zone.etaMin} min` : ''}{testRes.zone?.extraInfo ? ` · ${testRes.zone.extraInfo}` : ''}</span>
                : <span style={{ color: '#ff5f5f' }}>❌ Fuera de cobertura (la dirección se ubicó, pero no cae en ninguna zona activa).</span>}
          </div>
        )}
      </div>

      {/* Geocodificación (configurable) */}
      <div style={cardBox}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🌐 Geocodificación</div>
        <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 10px' }}>
          Por defecto se usa <strong>OpenStreetMap / Nominatim</strong> (gratis). Si pegas una <strong>API key de Google</strong>, se usará Google (más preciso). El código de país ayuda a la precisión.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) 130px', gap: 10, alignItems: 'end' }}>
          <div><label style={lbl}>API key de Google (opcional)</label><input style={inp} value={gKey} onChange={ev => setGKey(ev.target.value)} placeholder="AIza… (vacío = Nominatim gratis)" /></div>
          <div><label style={lbl}>País (ISO-2)</label><input style={inp} value={gCountry} onChange={ev => setGCountry(ev.target.value)} placeholder="co" maxLength={2} /></div>
        </div>
        <div style={{ marginTop: 10 }}><button style={btnPri} onClick={saveGeo} disabled={savingGeo}>{savingGeo ? 'Guardando…' : 'Guardar geocodificación'}</button></div>
      </div>
    </div>
  )
}
