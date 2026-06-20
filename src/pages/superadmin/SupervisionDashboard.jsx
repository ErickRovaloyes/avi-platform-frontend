import { useState, useEffect, useMemo, useCallback } from 'react'
import { getSubscriptionsOverview, subscriptionAction } from '../../lib/storage'
import { getSocket } from '../../lib/api'
import { AccountSubscriptionControl } from './SubscriptionsPanels'

const STATUS_META = {
  active:    { label: 'Activa',  color: '#22d98a' },
  grace:     { label: 'Gracia',  color: '#f5a623' },
  suspended: { label: 'Suspendida', color: '#ff5f5f' },
  expired:   { label: 'Vencida', color: '#ff5f5f' },
  none:      { label: 'Sin suscripción', color: '#8a8a8a' },
}
const fmtDate = ts => ts ? new Date(Number(ts)).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'
const pctColor = p => p == null ? 'var(--text3)' : p >= 100 ? '#ff5f5f' : p >= 90 ? '#ff8c42' : p >= 80 ? '#f5a623' : '#22d98a'

const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }
const kpiCard = { ...card, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }

function Kpi({ label, value, color }) {
  return <div style={kpiCard}><div style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--text)', fontFamily: 'var(--font-display)' }}>{value}</div><div style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</div></div>
}
function Bars({ data, total }) {
  const entries = Object.entries(data || {})
  if (!entries.length) return <div style={{ fontSize: 12, color: 'var(--text3)' }}>Sin datos.</div>
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, width: 90, color: 'var(--text2)', flexShrink: 0 }}>{k}</span>
          <div style={{ flex: 1, height: 18, background: 'var(--bg3)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${(v / max) * 100}%`, height: '100%', background: 'linear-gradient(90deg,var(--accent),var(--accent2))' }} />
          </div>
          <strong style={{ fontSize: 13, width: 36, textAlign: 'right' }}>{v}</strong>
        </div>
      ))}
    </div>
  )
}
function StatCard({ label, value, color }) {
  return <div style={{ ...card, padding: '12px 14px', borderColor: color + '55' }}>
    <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>{label}</div>
  </div>
}

// Genera el centro de alertas a partir de la lista de cuentas.
function buildAlerts(accounts) {
  const out = []
  for (const a of accounts) {
    if (a.isDemo) {
      if (a.status === 'expired') out.push({ sev: 'crit', accId: a.accId, name: a.name, text: 'Demo expirada' })
      else if (a.demoDaysLeft != null && a.demoDaysLeft <= 1) out.push({ sev: 'crit', accId: a.accId, name: a.name, text: `Demo expira en ${a.demoDaysLeft <= 0 ? 'horas' : '1 día'}` })
      else if (a.demoDaysLeft != null && a.demoDaysLeft <= 3) out.push({ sev: 'warn', accId: a.accId, name: a.name, text: `Demo expira en ${a.demoDaysLeft} días` })
    } else if (a.hasSub) {
      if (a.status === 'suspended' || a.status === 'expired') out.push({ sev: 'crit', accId: a.accId, name: a.name, text: 'Cuenta suspendida' })
      else if (a.status === 'grace') out.push({ sev: 'warn', accId: a.accId, name: a.name, text: `En gracia · ${a.graceDaysLeft ?? '?'} días` })
      else if (a.cycleDaysLeft != null && a.cycleDaysLeft <= 0) out.push({ sev: 'warn', accId: a.accId, name: a.name, text: 'Pago vence hoy' })
      else if (a.cycleDaysLeft != null && a.cycleDaysLeft <= 3) out.push({ sev: 'warn', accId: a.accId, name: a.name, text: `Vence en ${a.cycleDaysLeft} días` })
      else if (a.cycleDaysLeft != null && a.cycleDaysLeft <= 7) out.push({ sev: 'info', accId: a.accId, name: a.name, text: `Vence en ${a.cycleDaysLeft} días` })
      if (a.pct != null && a.pct >= 100) out.push({ sev: 'crit', accId: a.accId, name: a.name, text: 'Consumo 100%' })
      else if (a.pct != null && a.pct >= 90) out.push({ sev: 'warn', accId: a.accId, name: a.name, text: `Consumo ${a.pct}%` })
      else if (a.pct != null && a.pct >= 80) out.push({ sev: 'info', accId: a.accId, name: a.name, text: `Consumo ${a.pct}%` })
    }
  }
  const order = { crit: 0, warn: 1, info: 2 }
  return out.sort((x, y) => order[x.sev] - order[y.sev])
}

const VIEWS = [
  { id: 'all',     label: 'Todas' },
  { id: 'near',    label: 'Cercanas al límite' },
  { id: 'top',     label: 'Mayor consumo' },
  { id: 'upgrade', label: 'Oportunidades de upgrade' },
  { id: 'risk',    label: 'En riesgo de cancelación' },
]

export default function SupervisionDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('all')
  const [q, setQ] = useState('')
  const [fType, setFType] = useState('')
  const [fPlan, setFPlan] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try { setData(await getSubscriptionsOverview()) } catch { setData(null) }
    setLoading(false)
  }, [])
  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    const sock = getSocket()
    const onUpd = () => reload()
    sock.on('account:updated', onUpd); sock.on('subscription:alert', onUpd)
    const id = setInterval(reload, 30000)
    return () => { sock.off('account:updated', onUpd); sock.off('subscription:alert', onUpd); clearInterval(id) }
  }, [reload])

  const accounts = data?.accounts || []
  const alerts = useMemo(() => buildAlerts(accounts), [accounts])

  const filtered = useMemo(() => {
    let rows = accounts.slice()
    if (q.trim()) { const n = q.toLowerCase(); rows = rows.filter(a => (a.name || '').toLowerCase().includes(n) || (a.email || '').toLowerCase().includes(n)) }
    if (fType) rows = rows.filter(a => a.typeName === fType)
    if (fPlan) rows = rows.filter(a => a.planName === fPlan)
    if (fStatus) rows = rows.filter(a => a.status === fStatus)
    if (view === 'near') rows = rows.filter(a => a.pct != null).sort((x, y) => y.pct - x.pct)
    else if (view === 'top') rows = rows.sort((x, y) => y.used - x.used).slice(0, 20)
    else if (view === 'upgrade') rows = rows.filter(a => (a.pct != null && a.pct >= 90) || a.status === 'grace').sort((x, y) => (y.pct || 0) - (x.pct || 0))
    else if (view === 'risk') rows = rows.filter(a => a.status === 'suspended' || a.status === 'expired' || a.status === 'grace' || (a.cycleDaysLeft != null && a.cycleDaysLeft <= 7 && !a.isDemo))
    else rows = rows.sort((x, y) => (x.name || '').localeCompare(y.name || ''))
    return rows
  }, [accounts, q, fType, fPlan, fStatus, view])

  async function quick(accId, type, value) {
    setBusy(true)
    try { await subscriptionAction(accId, type, value); await reload() } catch (e) { alert(e.message) }
    setBusy(false)
  }

  if (loading) return <div style={{ padding: 28, color: 'var(--text3)' }}>Cargando dashboard…</div>

  const k = data?.kpis || {}
  const sb = data?.statusBuckets || {}
  const cons = data?.consumption || {}
  const sel = { padding: '7px 9px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 7, color: 'var(--text)', fontSize: 12.5 }
  const mini = (bg, c = '#fff') => ({ padding: '4px 9px', borderRadius: 6, border: 'none', cursor: 'pointer', background: bg, color: c, fontSize: 11, fontWeight: 600 })

  return (
    <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>📊 Supervisión de cuentas</h1>
        <button style={mini('var(--bg3)', 'var(--text)')} onClick={reload}>↻ Actualizar</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12 }}>
        <Kpi label="Cuentas totales" value={k.total ?? 0} />
        <Kpi label="Activas" value={k.active ?? 0} color="#22d98a" />
        <Kpi label="Suspendidas" value={k.suspended ?? 0} color="#ff5f5f" />
        <Kpi label="Demo" value={k.demo ?? 0} color="#f5a623" />
        <Kpi label="De pago" value={k.paid ?? 0} color="#4fa8ff" />
        <Kpi label="Sin asignar" value={k.noSub ?? 0} color="#8a8a8a" />
      </div>

      {/* Distribuciones */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
        <div style={card}><div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>Por tipo de cuenta</div><Bars data={data?.byType} /></div>
        <div style={card}><div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>Por plan mensual</div><Bars data={data?.byPlan} /></div>
      </div>

      {/* Estado de suscripciones */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Estado de suscripciones</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
          <StatCard label="Al día" value={sb.alDia ?? 0} color="#22d98a" />
          <StatCard label="Próximas a vencer (7d)" value={sb.porVencer ?? 0} color="#4fa8ff" />
          <StatCard label="En período de gracia" value={sb.enGracia ?? 0} color="#f5a623" />
          <StatCard label="Suspendidas" value={sb.suspendidas ?? 0} color="#ff5f5f" />
          <StatCard label="Demo por expirar (3d)" value={sb.demoPorExpirar ?? 0} color="#ff8c42" />
        </div>
      </div>

      {/* Consumo */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Monitoreo de consumo</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
          <StatCard label="Normal (<80%)" value={cons.normal ?? 0} color="#22d98a" />
          <StatCard label="Alerta amarilla (80-89%)" value={cons.amarilla ?? 0} color="#f5a623" />
          <StatCard label="Alerta naranja (90-99%)" value={cons.naranja ?? 0} color="#ff8c42" />
          <StatCard label="Alerta roja (≥100%)" value={cons.roja ?? 0} color="#ff5f5f" />
        </div>
      </div>

      {/* Centro de alertas */}
      {alerts.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>🔔 Centro de alertas ({alerts.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {alerts.slice(0, 60).map((al, i) => {
              const c = al.sev === 'crit' ? '#ff5f5f' : al.sev === 'warn' ? '#f5a623' : '#4fa8ff'
              return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '5px 8px', background: c + '12', borderLeft: `3px solid ${c}`, borderRadius: 5 }}>
                <span style={{ color: c, fontWeight: 700 }}>●</span><strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{al.name}</strong>
                <span style={{ color: 'var(--text2)' }}>— {al.text}</span>
              </div>
            })}
          </div>
        </div>
      )}

      {/* Filtros + vistas */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {VIEWS.map(v => <button key={v.id} onClick={() => setView(v.id)} style={{ ...sel, cursor: 'pointer', background: view === v.id ? 'var(--accent)' : 'var(--bg3)', color: view === v.id ? '#fff' : 'var(--text)', border: 'none', fontWeight: 600 }}>{v.label}</button>)}
        <div style={{ flex: 1 }} />
        <input placeholder="Buscar cuenta/correo…" value={q} onChange={e => setQ(e.target.value)} style={{ ...sel, width: 180 }} />
        <select style={sel} value={fType} onChange={e => setFType(e.target.value)}><option value="">Tipo: todos</option>{(data?.types || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select>
        <select style={sel} value={fPlan} onChange={e => setFPlan(e.target.value)}><option value="">Plan: todos</option>{(data?.plans || []).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select>
        <select style={sel} value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">Estado: todos</option><option value="active">Activa</option><option value="grace">Gracia</option><option value="suspended">Suspendida</option><option value="expired">Vencida</option><option value="none">Sin suscripción</option></select>
      </div>

      {/* Tabla */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1.4fr 0.8fr auto', gap: 10, padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>
          <span>Cuenta</span><span>Tipo</span><span>Plan</span><span>Consumo</span><span>Vence</span><span>Estado</span>
        </div>
        {filtered.map(a => {
          const st = STATUS_META[a.status] || STATUS_META.none
          return (
            <div key={a.accId} style={{ borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1.4fr 0.8fr auto', gap: 10, padding: '10px 14px', alignItems: 'center', fontSize: 13, cursor: 'pointer' }} onClick={() => setExpanded(expanded === a.accId ? null : a.accId)}>
                <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div><div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.email || '—'}</div></div>
                <span style={{ color: a.isDemo ? '#f5a623' : 'var(--text2)' }}>{a.typeName}</span>
                <span style={{ color: 'var(--text2)' }}>{a.planName || '—'}</span>
                <div>
                  {a.pct != null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 7, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden', maxWidth: 90 }}><div style={{ width: `${Math.min(100, a.pct)}%`, height: '100%', background: pctColor(a.pct) }} /></div>
                      <span style={{ fontSize: 11.5, color: pctColor(a.pct), fontWeight: 700 }}>{a.pct}%</span>
                      <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>{a.used}/{a.limit}</span>
                    </div>
                  ) : a.isDemo ? <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{a.used}/{(data?.types || []).find(t => t.id === a.typeId)?.demoMaxConversations ?? 100} demo</span> : <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{a.used} · sin límite</span>}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>{a.isDemo ? fmtDate(a.demoExpiresAt) : fmtDate(a.currentPeriodEnd)}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.color + '22', borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>{st.label}</span>
              </div>
              {expanded === a.accId && (
                <div style={{ padding: '4px 14px 14px', background: 'var(--bg)' }}>
                  <AccountSubscriptionControl accId={a.accId} />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(a.status === 'suspended' || a.status === 'expired')
                      ? <button style={mini('var(--green)')} disabled={busy} onClick={() => quick(a.accId, 'reactivate')}>Reactivar</button>
                      : <button style={mini('transparent', 'var(--red)')} disabled={busy} onClick={() => quick(a.accId, 'suspend')}>Suspender</button>}
                    <button style={mini('transparent', 'var(--text2)')} disabled={busy} onClick={() => quick(a.accId, 'extendGrace', 5)}>+5d gracia</button>
                    <button style={mini('transparent', 'var(--text2)')} disabled={busy} onClick={() => quick(a.accId, 'resetConsumption')}>Reiniciar consumo</button>
                    {a.email && <a href={`mailto:${a.email}`} style={{ ...mini('transparent', 'var(--accent)'), textDecoration: 'none', border: '1px solid var(--border2)' }}>✉ Correo al propietario</a>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Sin cuentas que coincidan.</div>}
      </div>
    </div>
  )
}
