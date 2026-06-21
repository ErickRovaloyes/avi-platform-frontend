import { useState, useEffect, useCallback } from 'react'
import { getDemoDashboard } from '../../lib/storage'
import { getSocket } from '../../lib/api'

const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }
const fmtDate = ts => ts ? new Date(Number(ts)).toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '—'
const pctColor = p => p == null ? 'var(--text3)' : p >= 100 ? '#ff5f5f' : p >= 90 ? '#ff8c42' : p >= 80 ? '#f5a623' : '#22d98a'

function Kpi({ label, value, color }) {
  return <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 2 }}><div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--text)', fontFamily: 'var(--font-display)' }}>{value}</div><div style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</div></div>
}
function Bars({ data }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]).slice(0, 8)
  if (!entries.length) return <div style={{ fontSize: 12, color: 'var(--text3)' }}>Sin datos.</div>
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>{entries.map(([k, v]) => (
    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12.5, width: 110, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
      <div style={{ flex: 1, height: 16, background: 'var(--bg3)', borderRadius: 5, overflow: 'hidden' }}><div style={{ width: `${(v / max) * 100}%`, height: '100%', background: 'linear-gradient(90deg,var(--accent),var(--accent2))' }} /></div>
      <strong style={{ fontSize: 12.5, width: 30, textAlign: 'right' }}>{v}</strong>
    </div>
  ))}</div>
}

function DemoList({ title, rows, render }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>{title} {rows?.length ? `(${rows.length})` : ''}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
        {(rows || []).map(x => (
          <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, padding: '6px 8px', background: 'var(--bg3)', borderRadius: 7 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.company}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{x.industry !== '—' ? x.industry + ' · ' : ''}{x.country !== '—' ? x.country : ''}</div>
            </div>
            {render(x)}
          </div>
        ))}
        {(!rows || rows.length === 0) && <div style={{ fontSize: 12, color: 'var(--text3)', padding: 12, textAlign: 'center' }}>Sin datos.</div>}
      </div>
    </div>
  )
}

export default function DemoDashboardPanel() {
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => { try { setD(await getDemoDashboard()) } catch { setD(null) } setLoading(false) }, [])
  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    const sock = getSocket()
    const on = () => reload()
    sock.on('account:updated', on); sock.on('subscription:alert', on)
    const id = setInterval(reload, 30000)
    return () => { sock.off('account:updated', on); sock.off('subscription:alert', on); clearInterval(id) }
  }, [reload])

  if (loading) return <div style={{ padding: 28, color: 'var(--text3)' }}>Cargando dashboard de Demos…</div>
  const k = d?.kpis || {}
  const lists = d?.lists || {}
  const used = x => <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>{x.used}/{x.maxConv} {x.pct != null && <strong style={{ color: pctColor(x.pct) }}>· {x.pct}%</strong>}</span>
  const days = x => <span style={{ fontSize: 11.5, fontWeight: 700, color: x.daysLeft <= 1 ? '#ff5f5f' : x.daysLeft <= 3 ? '#f5a623' : 'var(--text2)' }}>{x.daysLeft != null ? `${x.daysLeft}d` : '—'}</span>

  return (
    <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>📈 Dashboard de Demos</h1>
        <button style={{ padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--bg3)', color: 'var(--text)', fontSize: 11.5, fontWeight: 600 }} onClick={reload}>↻ Actualizar</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
        <Kpi label="Demos creadas" value={k.created ?? 0} />
        <Kpi label="Activas" value={k.active ?? 0} color="#22d98a" />
        <Kpi label="Vencidas" value={k.expired ?? 0} color="#ff5f5f" />
        <Kpi label="Próximas a vencer (3d)" value={k.expiringSoon ?? 0} color="#ff8c42" />
        <Kpi label="Convertidas a pago" value={k.conversions ?? 0} color="#4fa8ff" />
        <Kpi label="Tasa de conversión" value={(k.conversionRate ?? 0) + '%'} color="#7c6fff" />
      </div>

      {/* Distribuciones */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
        <div style={card}><div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>Industrias más registradas</div><Bars data={d?.byIndustry} /></div>
        <div style={card}><div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>Países con más registros</div><Bars data={d?.byCountry} /></div>
      </div>

      {/* Alertas */}
      {d?.alerts?.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>🔔 Alertas ({d.alerts.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
            {d.alerts.map((a, i) => {
              const c = a.sev === 'crit' ? '#ff5f5f' : a.sev === 'warn' ? '#f5a623' : '#4fa8ff'
              return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '5px 8px', background: c + '12', borderLeft: `3px solid ${c}`, borderRadius: 5 }}>
                <span style={{ color: c, fontWeight: 700 }}>●</span><strong>{a.company}</strong><span style={{ color: 'var(--text2)' }}>— {a.text}</span>
              </div>
            })}
          </div>
        </div>
      )}

      {/* Listados inteligentes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12 }}>
        <DemoList title="Próximas a expirar" rows={lists.expiring} render={x => <><span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDate(x.expiresAt)}</span> {days(x)}</>} />
        <DemoList title="Más utilizadas" rows={lists.mostUsed} render={used} />
        <DemoList title="Mayor probabilidad de conversión" rows={lists.likely} render={used} />
        <DemoList title="Convertidas a pago" rows={lists.converted} render={x => <span style={{ fontSize: 11, color: '#22d98a', fontWeight: 700 }}>✓ Convertida</span>} />
      </div>
    </div>
  )
}
