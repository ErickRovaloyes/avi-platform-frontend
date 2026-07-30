import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { crmAdvisorMetrics } from '../../lib/storage'

// Rangos rápidos → { from, to } en ms.
const RANGES = [
  { id: '7d',  label: '7 días',  days: 7 },
  { id: '30d', label: '30 días', days: 30 },
  { id: '90d', label: '90 días', days: 90 },
  { id: 'all', label: 'Todo',    days: null },
]

function fmtMs(ms) {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export default function AdvisorMetricsPanel() {
  const { account } = useAccount()
  const [range, setRange] = useState('30d')
  const [advisors, setAdvisors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!account?.id) return
    setLoading(true)
    const r = RANGES.find(x => x.id === range)
    const params = r?.days ? { from: Date.now() - r.days * 86400000, to: Date.now() } : {}
    crmAdvisorMetrics(account.id, params)
      .then(res => setAdvisors(res.advisors || []))
      .catch(() => setAdvisors([]))
      .finally(() => setLoading(false))
  }, [account?.id, range])

  const th = { textAlign: 'right', padding: '8px 10px', fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', whiteSpace: 'nowrap' }
  const td = { textAlign: 'right', padding: '9px 10px', fontSize: 13, color: 'var(--text1)', borderTop: '1px solid var(--border)' }
  const chip = on => ({ padding: '5px 12px', background: on ? 'var(--accent-dim, rgba(124,111,255,.15))' : 'var(--bg3)', color: on ? 'var(--accent,#7c6fff)' : 'var(--text2)', border: `1px solid ${on ? 'var(--accent,#7c6fff)' : 'var(--border2)'}`, borderRadius: 20, fontSize: 12, cursor: 'pointer' })

  const totals = advisors.reduce((a, x) => ({
    assigned: a.assigned + x.assigned, active: a.active + x.active, resolved: a.resolved + x.resolved,
    handoffs: a.handoffs + x.handoffs, humanMsgs: a.humanMsgs + x.humanMsgs,
  }), { assigned: 0, active: 0, resolved: 0, handoffs: 0, humanMsgs: 0 })

  return (
    <div style={{ padding: '4px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Desempeño de atención humana por asesor (según la conversación asignada).</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {RANGES.map(r => <button key={r.id} style={chip(range === r.id)} onClick={() => setRange(r.id)}>{r.label}</button>)}
        </div>
      </div>

      {loading && <div style={{ color: 'var(--text3)', fontSize: 13, padding: 12 }}>Cargando…</div>}
      {!loading && advisors.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13, padding: 12 }}>Sin conversaciones en este rango.</div>}
      {!loading && advisors.length > 0 && (
        <div style={{ overflowX: 'auto', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Asesor</th>
                <th style={th} title="Conversaciones asignadas">Asignadas</th>
                <th style={th} title="Abiertas (no cerradas ni archivadas)">Activas</th>
                <th style={th} title="Casos marcados como cerrados">Resueltas</th>
                <th style={th} title="Resueltas / asignadas">Tasa</th>
                <th style={th} title="Promedio de tiempo de primera respuesta">1ª resp.</th>
                <th style={th} title="Mensajes enviados por el asesor">Mensajes</th>
                <th style={th} title="Conversaciones que pasaron de IA a humano">Traspasos</th>
              </tr>
            </thead>
            <tbody>
              {advisors.map(a => (
                <tr key={a.advisorId || 'unassigned'}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: a.advisorId ? 'var(--text1)' : 'var(--text3)' }}>
                    {a.advisorId ? `🧑‍💼 ${a.name}` : '— Sin asignar'}
                  </td>
                  <td style={td}>{a.assigned}</td>
                  <td style={td}>{a.active}</td>
                  <td style={td}>{a.resolved}</td>
                  <td style={{ ...td, color: a.resolutionRate >= 70 ? '#22d98a' : a.resolutionRate >= 40 ? '#f5a623' : 'var(--text2)' }}>{a.resolutionRate}%</td>
                  <td style={td}>{fmtMs(a.avgFirstResponseMs)}</td>
                  <td style={td}>{a.humanMsgs}</td>
                  <td style={td}>{a.handoffs}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700, borderTop: '2px solid var(--border2)' }}>Total</td>
                <td style={{ ...td, fontWeight: 700, borderTop: '2px solid var(--border2)' }}>{totals.assigned}</td>
                <td style={{ ...td, fontWeight: 700, borderTop: '2px solid var(--border2)' }}>{totals.active}</td>
                <td style={{ ...td, fontWeight: 700, borderTop: '2px solid var(--border2)' }}>{totals.resolved}</td>
                <td style={{ ...td, borderTop: '2px solid var(--border2)' }}>—</td>
                <td style={{ ...td, borderTop: '2px solid var(--border2)' }}>—</td>
                <td style={{ ...td, fontWeight: 700, borderTop: '2px solid var(--border2)' }}>{totals.humanMsgs}</td>
                <td style={{ ...td, fontWeight: 700, borderTop: '2px solid var(--border2)' }}>{totals.handoffs}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
