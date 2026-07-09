import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getPmsConfig, savePmsConfig, testPmsConnection } from '../../lib/storage'

// Configuración de la Herramienta IA Especial "pms" (HosRoom/Kunas).
// El asistente puede mostrar habitaciones con fotos reales, ver disponibilidad
// con precios, reservar (con link de pago), hacer seguimiento y registrar
// solicitudes de reagenda/cancelación para el equipo.
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, maxWidth: 760 }
const lbl = { fontSize: 12.5, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 5 }
const inp = { width: '100%', padding: '9px 11px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, color: 'var(--text)', fontSize: 13.5, boxSizing: 'border-box' }

export default function PmsPanel() {
  const { account, reloadAccount } = useAccount()
  const accId = account?.id
  const flows = account?.flows || []

  const [cfg, setCfg] = useState({ provider: '', baseUrl: '', currency: 'COP', maxPhotos: 4, notifyTeam: true, postBookingFlowId: '', hasToken: false, hasApiKey: false, propertyId: '', pricingPlanId: '', connected: false, hotelName: '', providers: [] })
  const [token, setToken] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
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
      const r = await savePmsConfig(accId, payload)
      setCfg(prev => ({ ...prev, ...(r?.config || {}) }))
      setToken(''); setApiKey('')
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
          <div style={{ marginTop: 12 }}>
            <label style={lbl}>Key (segundo token de Kunas)</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder={cfg.hasApiKey ? '•••••••• (guardada — vacío = conservar)' : 'Pega la key que te da Kunas'} style={inp} />
            <span style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3, display: 'block' }}>Kunas usa 2 tokens: el token y la key. La propiedad y el plan de tarifa se detectan solos.</span>
          </div>
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
