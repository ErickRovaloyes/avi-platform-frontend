import { useState, useEffect, useCallback } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getPmsConfig, savePmsConfig, testPmsConnection, resetPmsCredentials,
  getPmsProperties, getPmsRooms, getPmsAvailability, getPmsMonthAvailability, getPmsDebug } from '../../lib/storage'

// Configuración de la Herramienta IA Especial "pms" (HosRoom/Kunas).
// El asistente puede mostrar habitaciones con fotos reales, ver disponibilidad
// con precios, reservar (con link de pago), hacer seguimiento y registrar
// solicitudes de reagenda/cancelación para el equipo.
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, maxWidth: 760 }
const lbl = { fontSize: 12.5, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 5 }
const inp = { width: '100%', padding: '9px 11px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, color: 'var(--text)', fontSize: 13.5, boxSizing: 'border-box' }

// Shell con subpestañas: Configuración · Propiedades · Disponibilidad.
export default function PmsPanel() {
  const { account } = useAccount()
  const connected = !!account?.pms?.connected
  const SUBS = [
    { id: 'config', label: '⚙️ Configuración' },
    ...(connected ? [{ id: 'rooms', label: '🛏 Propiedades' }, { id: 'avail', label: '📅 Disponibilidad' }] : []),
  ]
  const [sub, setSub] = useState('config')

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, padding: '14px 22px 0', flexWrap: 'wrap' }}>
        {SUBS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            style={{ padding: '7px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: `1px solid ${sub === t.id ? 'var(--accent)' : 'var(--border2)'}`,
              background: sub === t.id ? 'var(--accent)' : 'transparent', color: sub === t.id ? '#fff' : 'var(--text2)' }}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {sub === 'config' && <PmsConfigTab />}
        {sub === 'rooms'  && connected && <PmsPropertiesTab />}
        {sub === 'avail'  && connected && <PmsAvailabilityTab />}
      </div>
    </div>
  )
}

function PmsConfigTab() {
  const { account, reloadAccount } = useAccount()
  const accId = account?.id
  const flows = account?.flows || []

  const [cfg, setCfg] = useState({ provider: '', baseUrl: '', currency: 'COP', maxPhotos: 4, notifyTeam: true, postBookingFlowId: '', hasToken: false, hasApiKey: false, propertyId: '', pricingPlanId: '', connected: false, hotelName: '', providers: [] })
  const [token, setToken] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!accId) return
    getPmsConfig(accId).then(c => setCfg(prev => ({ ...prev, ...c }))).catch(() => {})
  }, [accId])

  const set = (k, v) => setCfg(p => ({ ...p, [k]: v }))
  const providers = cfg.providers?.length ? cfg.providers : [{ id: 'hosroom', label: 'HosRoom' }, { id: 'kunas', label: 'Kunas' }]
  const selProv = providers.find(p => p.id === cfg.provider)
  const isKunas = cfg.provider === 'kunas'

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const payload = {
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        currency: cfg.currency,
        maxPhotos: cfg.maxPhotos,
        notifyTeam: cfg.notifyTeam,
        postBookingFlowId: cfg.postBookingFlowId,
        propertyId: cfg.propertyId,
        pricingPlanId: cfg.pricingPlanId,
      }
      if (token.trim()) payload.token = token.trim()
      if (apiKey.trim()) payload.apiKey = apiKey.trim()
      payload.username = cfg.username || ''
      if (password.trim()) payload.password = password
      const r = await savePmsConfig(accId, payload)
      setCfg(prev => ({ ...prev, ...(r?.config || {}) }))
      setToken(''); setApiKey(''); setPassword('')
      setMsg({ ok: true, text: 'Guardado ✓' })
      reloadAccount?.()
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    setBusy(false)
  }

  async function test() {
    setTesting(true); setMsg(null)
    try {
      const r = await testPmsConnection(accId)
      setMsg({ ok: !!r.ok, text: r.message || (r.ok ? 'Conexión OK' : 'Fallo de conexión') })
      if (r.ok) { const c = await getPmsConfig(accId).catch(() => null); if (c) setCfg(prev => ({ ...prev, ...c })); reloadAccount?.() }
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    setTesting(false)
  }

  async function reset() {
    if (!confirm('¿Reiniciar las credenciales del PMS? Se borrarán el token y la key guardados y el asistente quedará desconectado del PMS hasta que los vuelvas a cargar.')) return
    setResetting(true); setMsg(null)
    try {
      const r = await resetPmsCredentials(accId)
      setCfg(prev => ({ ...prev, ...(r?.config || {}), hasToken: false, hasApiKey: false, username: '', hasPassword: false, propertyId: '', pricingPlanId: '', hotelName: '' }))
      setToken(''); setApiKey(''); setPassword('')
      setMsg({ ok: true, text: 'Credenciales reiniciadas ✓' })
      reloadAccount?.()
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    setResetting(false)
  }

  return (
    <div style={{ padding: 22, overflowY: 'auto' }}>
      <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>🏨 PMS hotelero</h2>
      <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 16px', maxWidth: 760 }}>
        Conecta el PMS de tu hotel para que el asistente pueda <strong>mostrar habitaciones con fotos reales,
        consultar disponibilidad con precios, crear reservas con link de pago y hacer seguimiento</strong>.
        La herramienta especial <code style={{ margin: '0 4px' }}>pms</code> está en <strong>Herramientas IA</strong>;
        <strong> se activa asignándola a un prompt</strong>.
      </p>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
          Conexión
          {cfg.connected && <span style={{ marginLeft: 10, fontSize: 11.5, color: '#22d98a', fontWeight: 600 }}>● Conectado{cfg.hotelName ? ` — ${cfg.hotelName}` : ''}</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <div>
            <label style={lbl}>Proveedor PMS</label>
            <select value={cfg.provider || ''} onChange={e => set('provider', e.target.value)} style={inp}>
              <option value="">— Elige un proveedor —</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.label}{p.comingSoon ? ' (próximamente)' : ''}</option>
              ))}
            </select>
            {selProv?.comingSoon && <span style={{ fontSize: 11, color: '#f5a623', marginTop: 3, display: 'block' }}>Este proveedor estará disponible próximamente. Por ahora usa HosRoom.</span>}
          </div>
          <div>
            <label style={lbl}>Token {isKunas ? 'de Kunas' : 'del hotel'} (API)</label>
            <input type="password" value={token} onChange={e => setToken(e.target.value)}
              placeholder={cfg.hasToken ? '•••••••• (guardado — vacío = conservar)' : 'Pega el token que te da el PMS'} style={inp} />
            <span style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3, display: 'block' }}>Lo genera el hotel en su cuenta del PMS. Nunca sale del servidor.</span>
          </div>
        </div>

        {isKunas && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginTop: 12 }}>
              <div>
                <label style={lbl}>Usuario de Kunas</label>
                <input type="text" value={cfg.username || ''} onChange={e => set('username', e.target.value)} autoComplete="off"
                  placeholder="Tu usuario de Kunas" style={inp} />
              </div>
              <div>
                <label style={lbl}>Contraseña de Kunas</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password"
                  placeholder={cfg.hasPassword ? '•••••••• (guardada — vacío = conservar)' : 'Tu contraseña de Kunas'} style={inp} />
              </div>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
              El <strong>token, usuario y contraseña</strong> se usan para el primer inicio de sesión; con eso obtenemos la <strong>key (pKey)</strong>, la propiedad y el plan de tarifa automáticamente.
            </div>
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginTop: 12 }}>
          <div>
            <label style={lbl}>Moneda</label>
            <input type="text" value={cfg.currency || 'COP'} onChange={e => set('currency', e.target.value.toUpperCase())} placeholder="COP" style={inp} />
          </div>
          <div>
            <label style={lbl}>Máx. fotos por habitación</label>
            <input type="number" min="1" max="10" value={cfg.maxPhotos ?? 4} onChange={e => set('maxPhotos', Number(e.target.value) || 4)} style={inp} />
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={cfg.notifyTeam !== false} onChange={e => set('notifyTeam', e.target.checked)} />
            Avisar al equipo (nota interna) cuando el asistente cree reservas o reciba solicitudes de cambio/cancelación
          </label>
          <div style={{ maxWidth: 380 }}>
            <label style={lbl}>Flujo al crearse una reserva <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional)</span></label>
            <select value={cfg.postBookingFlowId || ''} onChange={e => set('postBookingFlowId', e.target.value)} style={inp}>
              <option value="">— Sin flujo —</option>
              {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <span style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3, display: 'block' }}>Se ejecuta en la conversación tras confirmarse la reserva (confirmación, indicaciones de llegada, upsell…).</span>
          </div>
        </div>

        {msg && (
          <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 8, fontSize: 12.5,
            background: msg.ok ? 'rgba(34,217,138,.12)' : 'rgba(255,95,95,.12)',
            border: `1px solid ${msg.ok ? '#22d98a55' : '#ff5f5f55'}`,
            color: msg.ok ? '#22d98a' : '#ff5f5f' }}>{msg.text}</div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={save} disabled={busy}
            style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
          <button onClick={test} disabled={testing}
            style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {testing ? 'Probando…' : '🔌 Probar conexión'}
          </button>
          {(cfg.hasToken || cfg.hasApiKey || cfg.hasPassword) && (
            <button onClick={reset} disabled={resetting} title="Borra el token/key guardados y desconecta el PMS"
              style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid rgba(255,95,95,.35)', background: 'transparent', color: '#ff5f5f', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginLeft: 'auto' }}>
              {resetting ? 'Reiniciando…' : '↺ Reiniciar credenciales'}
            </button>
          )}
        </div>
      </div>

      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Qué puede hacer el asistente</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.7 }}>
          <li>🛏 <strong>Mostrar habitaciones</strong> con sus fotos reales, capacidad, descripción y planes.</li>
          <li>📅 <strong>Consultar disponibilidad</strong> por fechas y ocupación, con precios y cotización total (y alternativas si no hay cupo).</li>
          <li>✅ <strong>Reservar</strong>: crea la reserva en el PMS con los datos del huésped y envía el link de pago.</li>
          <li>🔎 <strong>Seguimiento</strong>: consulta el estado de una reserva por su código.</li>
          <li>❌ <strong>Cancelar</strong>: en <strong>Kunas</strong> cancela la reserva de verdad en el PMS; en HosRoom registra la solicitud y avisa al equipo (su API aún no expone cancelación).</li>
          <li>🔁 <strong>Reagendar</strong>: registra la solicitud de cambio de fechas y avisa al equipo para gestionarla en el PMS.</li>
        </ul>
      </div>
    </div>
  )
}

// ── Subpestaña Propiedades: habitaciones con fotos y descripción ────────────────
function money(n, cur) { if (n == null) return ''; try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: cur || 'COP', maximumFractionDigits: 0 }).format(Number(n)) } catch { return `${Math.round(Number(n)).toLocaleString('es-CO')} ${cur || ''}` } }

function PmsPropertiesTab() {
  const { account } = useAccount()
  const accId = account?.id
  const currency = account?.pms?.currency || 'COP'
  const [properties, setProperties] = useState([])
  const [propId, setPropId] = useState('')
  const [rooms, setRooms] = useState([])
  const [property, setProperty] = useState(null)   // { name, description, photos }
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [box, setBox] = useState(null)   // { photos:[], i }
  const [dbg, setDbg] = useState(null)   // JSON crudo del PMS (diagnóstico)
  const provider = account?.pms?.provider

  async function runDebug() {
    setDbg('cargando')
    try { const r = await getPmsDebug(accId); setDbg(JSON.stringify(r, null, 2)) }
    catch (e) { setDbg('Error: ' + e.message) }
  }

  useEffect(() => {
    if (!box) return
    const onKey = e => { if (e.key === 'Escape') setBox(null); else if (e.key === 'ArrowLeft') setBox(b => ({ ...b, i: (b.i - 1 + b.photos.length) % b.photos.length })); else if (e.key === 'ArrowRight') setBox(b => ({ ...b, i: (b.i + 1) % b.photos.length })) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [box])

  useEffect(() => { if (accId) getPmsProperties(accId).then(r => setProperties(r.properties || [])).catch(() => {}) }, [accId])

  const load = useCallback(() => {
    if (!accId) return
    setLoading(true); setErr('')
    getPmsRooms(accId, propId).then(r => { setRooms(r.rooms || []); setProperty(r.property || null) }).catch(e => setErr(e.message)).finally(() => setLoading(false))
  }, [accId, propId])
  useEffect(() => { load() }, [load])

  return (
    <div style={{ padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>🛏 Habitaciones</h2>
        {properties.length > 1 && (
          <select value={propId} onChange={e => setPropId(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 200 }}>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <button onClick={load} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>↻ Refrescar</button>
        <button onClick={runDebug} title="Ver la respuesta cruda del PMS (para depurar el mapeo)" style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, marginLeft: 'auto' }}>🐛 Diagnóstico</button>
      </div>

      {dbg && (
        <div onClick={() => setDbg(null)} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4vh 4vw' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface1,#16171b)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(900px,95vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <strong style={{ fontSize: 13 }}>🐛 Respuesta cruda del PMS</strong>
              <button onClick={() => setDbg(null)} style={{ cursor: 'pointer', border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', borderRadius: 7, padding: '4px 10px', fontSize: 12 }}>Cerrar</button>
            </div>
            <textarea readOnly value={dbg === 'cargando' ? 'Consultando el PMS…' : dbg} style={{ flex: 1, minHeight: 300, resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text2)', padding: 14, fontSize: 11.5, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre', overflow: 'auto' }} />
          </div>
        </div>
      )}

      {property && (property.photos?.length || property.description) && (
        <div style={{ ...card, maxWidth: 'none', marginBottom: 16, padding: 0, overflow: 'hidden' }}>
          {property.photos?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: 10, background: 'var(--bg3)' }}>
              {property.photos.slice(0, 12).map((ph, k) => (
                <img key={k} src={ph} alt="" onClick={() => setBox({ photos: property.photos, i: k })}
                  style={{ height: 130, borderRadius: 8, objectFit: 'cover', cursor: 'pointer', flexShrink: 0 }} />
              ))}
            </div>
          )}
          {(property.name || property.description) && (
            <div style={{ padding: 14 }}>
              {property.name && <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🏨 {property.name}</div>}
              {property.description && <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.55 }}>{property.description}</div>}
            </div>
          )}
        </div>
      )}

      {loading ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>Cargando habitaciones…</div>
        : err ? <div style={{ padding: '10px 12px', borderRadius: 8, fontSize: 12.5, background: 'rgba(255,95,95,.12)', border: '1px solid #ff5f5f55', color: '#ff5f5f', maxWidth: 760 }}>{err}</div>
        : !rooms.length ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>El PMS no devolvió habitaciones para esta propiedad.</div>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16 }}>
            {rooms.map((r, i) => (
              <div key={r.id || i} style={{ ...card, maxWidth: 'none', padding: 0, overflow: 'hidden' }}>
                {r.photos?.length ? (
                  <div style={{ position: 'relative', aspectRatio: '16/10', background: 'var(--bg3)', cursor: 'pointer' }} onClick={() => setBox({ photos: r.photos, i: 0 })}>
                    <img src={r.photos[0]} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {r.photos.length > 1 && <span style={{ position: 'absolute', right: 8, bottom: 8, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(0,0,0,.6)', color: '#fff' }}>📷 {r.photos.length}</span>}
                  </div>
                ) : <div style={{ aspectRatio: '16/10', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 30 }}>🛏</div>}
                <div style={{ padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700 }}>{r.name}</div>
                    {r.capacity ? <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>👤 {r.capacity}</span> : null}
                  </div>
                  {r.description && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>{r.description}</div>}
                  {r.photos?.length > 1 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto' }}>
                      {r.photos.slice(0, 8).map((ph, k) => (
                        <img key={k} src={ph} alt="" onClick={() => setBox({ photos: r.photos, i: k })}
                          style={{ width: 54, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0, cursor: 'pointer', border: '1px solid var(--border2)' }} />
                      ))}
                    </div>
                  )}
                  {r.rates?.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {r.rates.slice(0, 4).map((rt, k) => (
                        <span key={k} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 16, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text2)' }}>
                          {rt.name}{rt.mealType === 'breakfast' ? ' 🍳' : ''}{rt.total != null ? ` · ${money(rt.total, currency)}` : (rt.perNight != null ? ` · ${money(rt.perNight, currency)}/noche` : '')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      {box && (
        <div onClick={() => setBox(null)} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={e => { e.stopPropagation(); setBox(b => ({ ...b, i: (b.i - 1 + b.photos.length) % b.photos.length })) }} style={boxNav('left')}>‹</button>
          <img src={box.photos[box.i]} alt="" style={{ maxWidth: '90vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 8 }} onClick={e => e.stopPropagation()} />
          <button onClick={e => { e.stopPropagation(); setBox(b => ({ ...b, i: (b.i + 1) % b.photos.length })) }} style={boxNav('right')}>›</button>
          <span style={{ position: 'absolute', top: 16, right: 20, color: '#fff', fontSize: 13 }}>{box.i + 1}/{box.photos.length} · Esc</span>
        </div>
      )}
    </div>
  )
}
const boxNav = side => ({ position: 'absolute', [side]: 16, top: '50%', transform: 'translateY(-50%)', width: 46, height: 46, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 26, cursor: 'pointer' })

// ── Subpestaña Disponibilidad: calendario mensual filtrable por propiedad ───────
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const WDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']
const pad2 = n => String(n).padStart(2, '0')

function PmsAvailabilityTab() {
  const { account } = useAccount()
  const accId = account?.id
  const now = new Date()
  const [properties, setProperties] = useState([])
  const [propId, setPropId] = useState('')
  const [rooms, setRooms] = useState([])
  const [roomId, setRoomId] = useState('')
  const [adults, setAdults] = useState(2)
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const currency = data?.currency || account?.pms?.currency || 'COP'

  useEffect(() => { if (accId) getPmsProperties(accId).then(r => setProperties(r.properties || [])).catch(() => {}) }, [accId])
  useEffect(() => { if (accId) getPmsRooms(accId, propId).then(r => { setRooms(r.rooms || []); setRoomId(x => x || r.rooms?.[0]?.id || '') }).catch(() => {}) }, [accId, propId])

  const load = useCallback(() => {
    if (!accId || !roomId) return
    setLoading(true); setErr(''); setData(null)
    getPmsMonthAvailability(accId, { year: ym.y, month: ym.m, roomTypeId: roomId, propertyId: propId, adults })
      .then(setData).catch(e => setErr(e.message)).finally(() => setLoading(false))
  }, [accId, roomId, propId, adults, ym])
  useEffect(() => { load() }, [load])

  function shift(delta) { setYm(v => { let m = v.m + delta, y = v.y; if (m < 1) { m = 12; y-- } if (m > 12) { m = 1; y++ } return { y, m } }) }

  // Rejilla del mes (lunes primero).
  const firstDow = (new Date(Date.UTC(ym.y, ym.m - 1, 1)).getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate()
  const today = new Date().toISOString().slice(0, 10)
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div style={{ padding: 22 }}>
      <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>📅 Disponibilidad</h2>
      <p style={{ fontSize: 12.5, color: 'var(--text3)', margin: '0 0 16px', maxWidth: 760 }}>Disponibilidad real por día para la habitación seleccionada. Verde = hay cupo; rojo = sin cupo.</p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        {properties.length > 1 && (
          <div><label style={lbl}>Propiedad</label>
            <select value={propId} onChange={e => { setPropId(e.target.value); setRoomId('') }} style={{ ...inp, width: 'auto', minWidth: 180 }}>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
        )}
        <div><label style={lbl}>Habitación</label>
          <select value={roomId} onChange={e => setRoomId(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 200 }}>
            {!rooms.length && <option value="">—</option>}
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select></div>
        <div><label style={lbl}>Adultos</label>
          <input type="number" min="1" max="10" value={adults} onChange={e => setAdults(Math.max(1, Number(e.target.value) || 1))} style={{ ...inp, width: 80 }} /></div>
        <button onClick={load} disabled={loading || !roomId} style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>{loading ? 'Consultando…' : '↻ Actualizar'}</button>
      </div>

      <div style={{ ...card, maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button onClick={() => shift(-1)} style={navBtn}>‹</button>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{MONTHS[ym.m - 1]} {ym.y}</div>
          <button onClick={() => shift(1)} style={navBtn}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
          {WDAYS.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', fontWeight: 700, paddingBottom: 4 }}>{w}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const date = `${ym.y}-${pad2(ym.m)}-${pad2(d)}`
            const past = date < today
            const info = data?.days?.[date]
            let bg = 'var(--bg3)', color = 'var(--text2)', label = ''
            if (past) { bg = 'transparent'; color = 'var(--text3)' }
            else if (loading) { bg = 'var(--bg3)' }
            else if (info?.error) { bg = 'var(--bg3)'; label = '?' }
            else if (info) {
              if (info.available > 0) { bg = 'rgba(34,217,138,.16)'; color = '#22d98a'; label = info.price != null ? money(info.price, currency).replace(/\s/g, '') : `${info.available}` }
              else { bg = 'rgba(255,95,95,.14)'; color = '#ff5f5f'; label = 'Lleno' }
            }
            return (
              <div key={i} title={info && !info.error && info.available > 0 ? `${info.available} disponible(s)${info.price != null ? ` · desde ${money(info.price, currency)}` : ''}` : ''}
                style={{ aspectRatio: '1', borderRadius: 8, background: bg, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, opacity: past ? .4 : 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color }}>{d}</div>
                {label && <div style={{ fontSize: 9.5, fontWeight: 700, color }}>{label}</div>}
              </div>
            )
          })}
        </div>
        {err && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 8, fontSize: 12.5, background: 'rgba(255,95,95,.12)', border: '1px solid #ff5f5f55', color: '#ff5f5f' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: 'var(--text3)' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'rgba(34,217,138,.5)', marginRight: 4 }} />Con cupo</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'rgba(255,95,95,.5)', marginRight: 4 }} />Sin cupo</span>
        </div>
      </div>
    </div>
  )
}
const navBtn = { width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 18 }
