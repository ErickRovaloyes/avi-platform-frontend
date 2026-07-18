import { useState, useEffect, useRef, useCallback } from 'react'
import { getVectorIndex, saveVectorIndex, syncVectorIndex, testVectorIndexSearch } from '../../lib/storage'

// Card "🔎 Búsqueda inteligente (IA)" — índice VECTORIAL de productos.
// Reutilizable para la Tienda (source='store', Woo/Shopify) y el Catálogo Meta
// (source='meta', solo modo programado). El asistente busca en este índice
// (semántico + tokens) en vez de en la API viva; si el índice falla, cae a la API.
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, maxWidth: 720 }
const label = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', margin: '12px 0 5px' }
const input = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg1)', color: 'var(--text)', fontSize: 13.5, boxSizing: 'border-box' }
const DAYS = [['', 'Cada N horas'], ['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miércoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sábado'], ['0', 'Domingo']]

export default function VectorIndexCard({ accId, source = 'store', allowRealtime = true, realtimeHint = '', style }) {
  const [st, setSt] = useState(null)         // status del servidor
  const [form, setForm] = useState({ enabled: false, mode: 'realtime', everyHours: 24, dayOfWeek: null, hour: 3 })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const pollRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const s = await getVectorIndex(accId, source)
      setSt(s)
      const mode = !allowRealtime ? 'scheduled' : (s.mode || 'realtime')
      setForm(f => ({ ...f, enabled: !!s.enabled, mode, everyHours: s.everyHours ?? 24, dayOfWeek: s.dayOfWeek ?? null, hour: s.hour ?? 3 }))
      return s
    } catch { return null }
  }, [accId, source, allowRealtime])
  useEffect(() => { if (accId) load() }, [accId, load])

  // Mientras sincroniza, sondea el estado cada 5s.
  useEffect(() => {
    if (!st?.syncing) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } ; return }
    if (!pollRef.current) pollRef.current = setInterval(() => { load().then(s => { if (s && !s.syncing) { clearInterval(pollRef.current); pollRef.current = null } }) }, 5000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [st?.syncing, load])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const r = await saveVectorIndex(accId, { ...form, source }, source)
      setSt(r.settings)
      setMsg(r.webhookError
        ? { ok: false, text: `Guardado, pero los webhooks fallaron: ${r.webhookError}` }
        : { ok: true, text: 'Guardado ✓' + (form.enabled && !r.settings?.count ? ' — sincronización inicial iniciada…' : '') })
      setTimeout(load, 1500)
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    setBusy(false)
  }
  async function syncNow() {
    setBusy(true); setMsg(null)
    try { await syncVectorIndex(accId, source); setMsg({ ok: true, text: 'Sincronización iniciada…' }); setTimeout(load, 1200) }
    catch (e) { setMsg({ ok: false, text: e.message }) }
    setBusy(false)
  }
  async function testSearch() {
    if (!q.trim()) return
    setBusy(true); setResults(null)
    try { const r = await testVectorIndexSearch(accId, q.trim(), source); setResults(r.indexed === false ? 'no-index' : (r.products || [])) }
    catch (e) { setResults('error:' + e.message) }
    setBusy(false)
  }

  const fmtDate = ts => ts ? new Date(ts).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'nunca'

  return (
    <div style={{ ...card, ...style }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!form.enabled} onChange={e => set('enabled', e.target.checked)} />
        🔎 Búsqueda inteligente (IA) — índice vectorial de productos
      </label>
      <p style={{ fontSize: 12.5, color: 'var(--text3)', margin: '6px 0 0' }}>
        Indexa los productos con <strong>embeddings semánticos</strong>: el asistente entiende preguntas naturales
        ("algo para regalar", "para piel grasa") con mucha más precisión que la búsqueda de la API.
        Las fotos y los pedidos siguen funcionando igual; si el índice falla, se usa la API automáticamente.
      </p>

      {form.enabled && (
        <>
          <label style={label}>Actualización del índice</label>
          <select style={input} value={form.mode} onChange={e => set('mode', e.target.value)} disabled={!allowRealtime && form.mode !== 'scheduled'}>
            {allowRealtime && <option value="realtime">⚡ Tiempo real (webhooks) + re-sync de seguridad diario</option>}
            <option value="scheduled">🕐 Programada (cada X horas o un día de la semana)</option>
          </select>
          {!allowRealtime && realtimeHint && <span style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginTop: 4 }}>{realtimeHint}</span>}

          {form.mode === 'scheduled' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 8 }}>
              <div>
                <label style={label}>Frecuencia</label>
                <select style={input} value={form.dayOfWeek === null || form.dayOfWeek === undefined ? '' : String(form.dayOfWeek)}
                  onChange={e => set('dayOfWeek', e.target.value === '' ? null : Number(e.target.value))}>
                  {DAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {form.dayOfWeek === null || form.dayOfWeek === undefined ? (
                <div>
                  <label style={label}>Cada (horas)</label>
                  <input style={input} type="number" min={1} max={168} value={form.everyHours}
                    onChange={e => set('everyHours', Math.min(168, Math.max(1, parseInt(e.target.value) || 24)))} />
                </div>
              ) : (
                <div>
                  <label style={label}>Hora del día</label>
                  <select style={input} value={form.hour} onChange={e => set('hour', Number(e.target.value))}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border2)', fontSize: 12.5, color: 'var(--text2)' }}>
            {st?.syncing
              ? <span>⏳ Sincronizando…</span>
              : <span><strong>{st?.count ?? 0}</strong> productos indexados · última sync: {fmtDate(st?.lastSyncAt)}</span>}
            {st?.error && <div style={{ color: '#ff5f5f', marginTop: 4 }}>⚠ {st.error}</div>}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={save} disabled={busy} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              {busy ? '…' : 'Guardar'}
            </button>
            <button onClick={syncNow} disabled={busy || st?.syncing} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              ↻ Sincronizar ahora
            </button>
          </div>

          {(st?.count > 0) && (
            <>
              <label style={label}>Probar la búsqueda</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...input, flex: 1 }} placeholder='Ej: "algo para regalar a mamá"' value={q}
                  onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') testSearch() }} />
                <button onClick={testSearch} disabled={busy || !q.trim()} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>Buscar</button>
              </div>
              {Array.isArray(results) && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text2)' }}>
                  {!results.length ? 'Sin resultados relevantes en el índice.' : results.slice(0, 6).map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                      {(p.images?.[0] || p.image_url) && <img src={p.images?.[0] || p.image_url} alt="" referrerPolicy="no-referrer" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover' }} />}
                      <span style={{ flex: 1 }}>{p.name}</span>
                      <span style={{ color: 'var(--text3)' }}>{p.price} {p.currency}</span>
                    </div>
                  ))}
                </div>
              )}
              {typeof results === 'string' && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: '#ff5f5f' }}>
                  {results === 'no-index' ? 'El índice está vacío o falta la API key de OpenAI.' : results.replace('error:', '')}
                </div>
              )}
            </>
          )}
        </>
      )}

      {msg && (
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
          background: msg.ok ? 'rgba(34,217,138,.12)' : 'rgba(255,95,95,.12)', color: msg.ok ? '#22d98a' : '#ff5f5f',
          border: `1px solid ${msg.ok ? 'rgba(34,217,138,.35)' : 'rgba(255,95,95,.35)'}` }}>
          {msg.text}
        </div>
      )}
      {!form.enabled && msg == null && st?.count > 0 && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text3)' }}>El índice tiene {st.count} productos pero está desactivado: la IA busca por la API viva.</div>
      )}
      {!form.enabled && (
        <div style={{ marginTop: 10 }}>
          <button onClick={save} disabled={busy} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
            Guardar
          </button>
        </div>
      )}
    </div>
  )
}
