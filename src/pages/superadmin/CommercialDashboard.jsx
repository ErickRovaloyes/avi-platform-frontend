import { useState, useEffect, useCallback } from 'react'
import { getCommercialMetrics, getSubscriptionsOverview } from '../../lib/storage'
import { getSocket } from '../../lib/api'
import { downloadCSV, printReport } from '../../lib/reports'

const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }
const money = n => '$' + Number(n || 0).toLocaleString('es', { maximumFractionDigits: 2 })
const fmtDate = ts => ts ? new Date(Number(ts)).toLocaleDateString('es') : '—'

function Kpi({ label, value, color, hint }) {
  return <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 2 }}>
    <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--text)', fontFamily: 'var(--font-display)' }}>{value}</div>
    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</div>
    {hint && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{hint}</div>}
  </div>
}

export default function CommercialDashboard() {
  const [c, setC] = useState(null)
  const [ov, setOv] = useState(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try { const [cm, o] = await Promise.all([getCommercialMetrics(), getSubscriptionsOverview()]); setC(cm); setOv(o) } catch { /* */ }
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

  if (loading) return <div style={{ padding: 28, color: 'var(--text3)' }}>Cargando dashboard comercial…</div>

  const accounts = ov?.accounts || []
  const revByPlan = c?.revenueByPlan || {}
  const byPlanCount = ov?.byPlan || {}

  // ── Definición de reportes (columnas + filas) ──
  const REPORTS = [
    {
      id: 'consumo', title: 'Consumo mensual',
      columns: [
        { key: 'name', label: 'Cuenta' }, { key: 'typeName', label: 'Tipo' }, { key: 'planName', label: 'Plan' },
        { key: 'used', label: 'Usadas' }, { key: 'limit', label: 'Límite', value: r => r.limit ?? '' },
        { key: 'pct', label: '% consumo', value: r => r.pct != null ? r.pct + '%' : '' },
      ],
      rows: accounts,
    },
    {
      id: 'conversaciones', title: 'Conversaciones por cuenta',
      columns: [{ key: 'name', label: 'Cuenta' }, { key: 'used', label: 'Conversaciones (ciclo)' }],
      rows: [...accounts].sort((a, b) => b.used - a.used),
    },
    {
      id: 'porvencer', title: 'Cuentas próximas a vencer',
      columns: [
        { key: 'name', label: 'Cuenta' }, { key: 'planName', label: 'Plan' },
        { key: 'vence', label: 'Vence', value: r => fmtDate(r.isDemo ? r.demoExpiresAt : r.currentPeriodEnd) },
        { key: 'dias', label: 'Días restantes', value: r => r.isDemo ? r.demoDaysLeft : r.cycleDaysLeft },
      ],
      rows: accounts.filter(a => (a.isDemo ? a.demoDaysLeft : a.cycleDaysLeft) != null && (a.isDemo ? a.demoDaysLeft : a.cycleDaysLeft) <= 7),
    },
    {
      id: 'suspendidas', title: 'Cuentas suspendidas',
      columns: [{ key: 'name', label: 'Cuenta' }, { key: 'typeName', label: 'Tipo' }, { key: 'planName', label: 'Plan' }, { key: 'email', label: 'Correo' }],
      rows: accounts.filter(a => a.status === 'suspended' || a.status === 'expired'),
    },
    {
      id: 'conversion', title: 'Conversión Demo → Pago',
      columns: [{ key: 'k', label: 'Métrica' }, { key: 'v', label: 'Valor' }],
      rows: [
        { k: 'Demos creadas (histórico)', v: c?.demosCreated ?? 0 },
        { k: 'Conversiones a pago', v: c?.conversions ?? 0 },
        { k: 'Conversiones este mes', v: c?.conversionsThisMonth ?? 0 },
        { k: 'Tasa de conversión', v: (c?.conversionRate ?? 0) + '%' },
        { k: 'Demos activas', v: c?.activeDemos ?? 0 },
      ],
    },
    {
      id: 'ingresos', title: 'Ingresos por plan',
      columns: [{ key: 'plan', label: 'Plan' }, { key: 'cuentas', label: 'Cuentas' }, { key: 'ingreso', label: 'Ingreso/mes', value: r => money(r.ingreso) }],
      rows: Object.keys({ ...revByPlan, ...byPlanCount }).map(plan => ({ plan, cuentas: byPlanCount[plan] || 0, ingreso: revByPlan[plan] || 0 })),
    },
    {
      id: 'canales', title: 'Uso de canales por cuenta',
      columns: [
        { key: 'name', label: 'Cuenta' },
        { key: 'wc', label: 'Webchat', value: r => r.channelUsage?.webchat ?? 0 },
        { key: 'wa', label: 'WhatsApp', value: r => r.channelUsage?.whatsapp ?? 0 },
        { key: 'ms', label: 'Messenger', value: r => r.channelUsage?.messenger ?? 0 },
        { key: 'ig', label: 'Instagram', value: r => r.channelUsage?.instagram ?? 0 },
        { key: 'ts', label: 'Test', value: r => r.channelUsage?.test ?? 0 },
      ],
      rows: accounts,
    },
  ]

  const mini = (bg, c2 = '#fff') => ({ padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: bg, color: c2, fontSize: 11.5, fontWeight: 600 })

  return (
    <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>💼 Dashboard comercial</h1>
        <button style={mini('var(--bg3)', 'var(--text)')} onClick={reload}>↻ Actualizar</button>
      </div>

      {/* KPIs estratégicos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <Kpi label="MRR (ingresos recurrentes)" value={money(c?.mrr)} color="#22d98a" hint="suma de planes de pago activos" />
        <Kpi label="Demos activas" value={c?.activeDemos ?? 0} color="#f5a623" />
        <Kpi label="Conversiones Demo→Pago" value={c?.conversions ?? 0} color="#4fa8ff" hint={`${c?.conversionsThisMonth ?? 0} este mes`} />
        <Kpi label="Tasa de conversión" value={(c?.conversionRate ?? 0) + '%'} color="#7c6fff" />
        <Kpi label="Cuentas nuevas del mes" value={c?.newAccountsThisMonth ?? 0} />
        <Kpi label="Suspendidas" value={c?.suspendedAccounts ?? 0} color="#ff5f5f" />
        <Kpi label="Conversaciones del ciclo" value={Number(c?.totalConversationsCycle || 0).toLocaleString('es')} />
      </div>

      {/* Ingresos por plan */}
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>Ingresos por plan</div>
        {Object.keys(revByPlan).length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Aún no hay ingresos (define el precio mensual en Mensualidades y asigna planes).</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(revByPlan).sort((a, b) => b[1] - a[1]).map(([plan, rev]) => {
              const max = Math.max(...Object.values(revByPlan), 1)
              return <div key={plan} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 100, fontSize: 12.5, color: 'var(--text2)' }}>{plan} <span style={{ color: 'var(--text3)' }}>({byPlanCount[plan] || 0})</span></span>
                <div style={{ flex: 1, height: 18, background: 'var(--bg3)', borderRadius: 6, overflow: 'hidden' }}><div style={{ width: `${(rev / max) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#22d98a,#16b573)' }} /></div>
                <strong style={{ fontSize: 13, width: 80, textAlign: 'right' }}>{money(rev)}</strong>
              </div>
            })}
          </div>
        )}
      </div>

      {/* Reportes */}
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 4 }}>📑 Reportes exportables</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>Descarga en Excel (CSV) o genera un PDF (ventana de impresión → Guardar como PDF).</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {REPORTS.map(rep => (
            <div key={rep.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg3)', borderRadius: 8, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, minWidth: 160 }}>{rep.title}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{rep.rows.length} fila(s)</span>
              <button style={mini('var(--green)')} onClick={() => downloadCSV(`${rep.id}-${new Date().toISOString().slice(0, 10)}`, rep.columns, rep.rows)}>⬇ Excel</button>
              <button style={mini('var(--accent)')} onClick={() => printReport(rep.title, rep.columns, rep.rows)}>🖨 PDF</button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
        Nota: el crecimiento mes a mes de conversaciones e ingresos requiere snapshots históricos mensuales (aún no se almacenan); las cifras mostradas son del ciclo/mes actual en tiempo real.
      </div>
    </div>
  )
}
