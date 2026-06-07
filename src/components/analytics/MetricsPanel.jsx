import { useState, useEffect, useMemo } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getBusinessMetrics } from '../../lib/storage'
import s from './AnalyticsPanels.module.css'

const RANGES = [
  { id: '7d',  label: '7 días',  days: 7 },
  { id: '30d', label: '30 días', days: 30 },
  { id: '90d', label: '90 días', days: 90 },
  { id: '365d',label: 'Año',     days: 365 },
]

const CHANNEL_LABELS = {
  webchat:   { name: 'Webchat',   icon: '💻', color: '#7c6fff' },
  test:      { name: 'Pruebas',   icon: '🧪', color: '#888' },
  whatsapp:  { name: 'WhatsApp',  icon: '🟢', color: '#25d366' },
  messenger: { name: 'Messenger', icon: '💬', color: '#0084ff' },
  instagram: { name: 'Instagram', icon: '📸', color: '#e1306c' },
}

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function rangeBounds(rangeId) {
  const r = RANGES.find(x => x.id === rangeId) || RANGES[1]
  const to = Date.now()
  const from = to - r.days * 86_400_000
  return { from, to }
}

function fmtNum(n) { return Number(n || 0).toLocaleString() }
function fmtUsd(n) { return '$' + Number(n || 0).toFixed(4) }
function fmtMs(ms) {
  if (!ms) return '—'
  if (ms < 1000) return ms + ' ms'
  const s = Math.round(ms / 1000)
  if (s < 60) return s + ' s'
  const m = Math.floor(s / 60), rem = s % 60
  return `${m}m ${rem}s`
}
function fmtPct(p) { return Number(p || 0).toFixed(1) + '%' }

export default function MetricsPanel() {
  const { account, visibleAgents } = useAccount()
  const [rangeId, setRangeId] = useState('30d')
  const [agentId, setAgentId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const range = useMemo(() => rangeBounds(rangeId), [rangeId])

  useEffect(() => {
    if (!account?.id) return
    setLoading(true); setError('')
    getBusinessMetrics(account.id, { from: range.from, to: range.to, agentId: agentId || undefined })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [account?.id, range.from, range.to, agentId])

  // Daily trend SVG
  const trend = useMemo(() => {
    const series = data?.dailyTrend || []
    if (!series.length) return null
    const W = 760, H = 180, PAD = 36
    const maxV = Math.max(...series.map(d => Math.max(d.conversations, d.messages / 5)), 1)
    const xStep = (W - PAD * 2) / Math.max(series.length - 1, 1)
    const convPts = series.map((d, i) => [PAD + i * xStep, H - PAD - (d.conversations / maxV) * (H - PAD * 2)])
    const msgPts  = series.map((d, i) => [PAD + i * xStep, H - PAD - ((d.messages / 5) / maxV) * (H - PAD * 2)])
    const toPath  = pts => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
    return { W, H, PAD, maxV, series, convPath: toPath(convPts), msgPath: toPath(msgPts), convPts, msgPts }
  }, [data])

  // Heatmap: 7 rows x 24 cols
  const heatmapMax = useMemo(() => {
    if (!data?.heatmap) return 0
    let m = 0
    for (const row of data.heatmap) for (const v of row) if (v > m) m = v
    return m
  }, [data])

  if (loading && !data) return <div className={s.panel}><div className={s.empty}>Cargando métricas...</div></div>
  if (error)            return <div className={s.panel}><div className={s.error}>{error}</div></div>
  if (!data)            return <div className={s.panel}><div className={s.empty}>Sin datos.</div></div>

  return (
    <div className={s.panel}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Métricas de negocio</h1>
          <p className={s.sub}>Indicadores operativos y de conversación para tu cuenta.</p>
        </div>
      </div>

      {/* Filters */}
      <div className={s.filters}>
        <div className={s.filterGroup}>
          <label>Periodo</label>
          <select value={rangeId} onChange={e => setRangeId(e.target.value)}>
            {RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div className={s.filterGroup}>
          <label>Agente</label>
          <select value={agentId} onChange={e => setAgentId(e.target.value)}>
            <option value="">Todos</option>
            {visibleAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className={s.kpiGrid}>
        <KpiTile label="Conversaciones" value={fmtNum(data.kpis.totalConversations)} color="#7c6fff" />
        <KpiTile label="Mensajes"       value={fmtNum(data.kpis.totalMessages)} />
        <KpiTile label="Resp. promedio" value={fmtMs(data.kpis.avgResponseTimeMs)} hint="Tiempo entre msg usuario → respuesta" />
        <KpiTile label="Derivado a humano" value={fmtPct(data.kpis.humanHandoffPct)} hint="% de conv. con asesor humano activo" color="#f5a623" />
        <KpiTile label="Tokens IA"      value={fmtNum(data.kpis.totalTokens)} />
        <KpiTile label="Costo IA"       value={fmtUsd(data.kpis.totalCostUsd)} color="#22d98a" />
      </div>

      {/* Daily trend */}
      {trend && (
        <div className={s.card}>
          <div className={s.cardTitle}>📈 Conversaciones y mensajes por día</div>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 2, background: '#7c6fff', verticalAlign: 'middle', marginRight: 4 }} /> Conversaciones</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 2, background: '#22d98a', verticalAlign: 'middle', marginRight: 4 }} /> Mensajes (÷5)</span>
          </div>
          <svg width="100%" viewBox={`0 0 ${trend.W} ${trend.H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
            <path d={trend.msgPath}  stroke="#22d98a" strokeWidth="2" fill="none" />
            <path d={trend.convPath} stroke="#7c6fff" strokeWidth="2" fill="none" />
            {trend.convPts.map((p, i) => (
              <g key={'c'+i}>
                <circle cx={p[0]} cy={p[1]} r="3" fill="#7c6fff" />
                <title>{trend.series[i].day}: {trend.series[i].conversations} conv · {trend.series[i].messages} msgs</title>
              </g>
            ))}
            <text x={trend.PAD}             y={trend.H - 8} fontSize="10" fill="var(--text3)">{trend.series[0]?.day}</text>
            <text x={trend.W - trend.PAD}   y={trend.H - 8} fontSize="10" fill="var(--text3)" textAnchor="end">{trend.series[trend.series.length-1]?.day}</text>
          </svg>
        </div>
      )}

      {/* Two columns: channels + heatmap */}
      <div className={s.twoCols}>
        <div className={s.card}>
          <div className={s.cardTitle}>📡 Conversaciones por canal</div>
          {data.conversationsByChannel.length === 0 && <div className={s.empty}>Sin datos.</div>}
          {data.conversationsByChannel.map(c => {
            const meta = CHANNEL_LABELS[c.channel] || { name: c.channel, icon: '📡', color: '#888' }
            const max = Math.max(...data.conversationsByChannel.map(x => x.count), 1)
            const pct = (c.count / max) * 100
            return (
              <div key={c.channel} className={s.barRow}>
                <span className={s.barLabel} style={{ color: meta.color }}>{meta.icon} {meta.name}</span>
                <div className={s.barTrack}><div className={s.barFill} style={{ width: pct + '%', background: meta.color }} /></div>
                <span className={s.barValue}>{c.count}</span>
              </div>
            )
          })}
        </div>

        <div className={s.card}>
          <div className={s.cardTitle}>🔥 Actividad por hora × día (mensajes)</div>
          <div className={s.heatmap}>
            <div className={s.heatmapHours}>
              <span></span>
              {Array.from({ length: 24 }, (_, h) => h).filter(h => h % 3 === 0).map(h => (
                <span key={h} className={s.heatmapHourLabel}>{String(h).padStart(2,'0')}h</span>
              ))}
            </div>
            {data.heatmap.map((row, dow) => (
              <div key={dow} className={s.heatmapRow}>
                <span className={s.heatmapDayLabel}>{DAYS_ES[dow]}</span>
                {row.map((v, h) => {
                  const intensity = heatmapMax ? v / heatmapMax : 0
                  return <div key={h} className={s.heatmapCell}
                    style={{ background: `rgba(124,111,255,${0.05 + intensity * 0.85})` }}
                    title={`${DAYS_ES[dow]} ${String(h).padStart(2,'0')}h — ${v} mensajes`} />
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top labels + agents */}
      <div className={s.twoCols}>
        <div className={s.card}>
          <div className={s.cardTitle}>🏷 Top etiquetas</div>
          {data.topLabels.length === 0 && <div className={s.empty}>Sin etiquetas aplicadas.</div>}
          {data.topLabels.map(l => (
            <div key={l.id} className={s.barRow}>
              <span className={s.barLabel} style={{ color: l.color || 'var(--text1)' }}>● {l.name}</span>
              <div className={s.barTrack}>
                <div className={s.barFill} style={{ width: ((l.count / data.topLabels[0].count) * 100) + '%', background: l.color || 'var(--accent)' }} />
              </div>
              <span className={s.barValue}>{l.count}</span>
            </div>
          ))}
        </div>

        <div className={s.card}>
          <div className={s.cardTitle}>🤖 Conversaciones por agente</div>
          {data.conversationsByAgent.length === 0 && <div className={s.empty}>Sin datos.</div>}
          {data.conversationsByAgent.map(a => (
            <div key={a.agentId} className={s.barRow}>
              <span className={s.barLabel}>{a.name}</span>
              <div className={s.barTrack}>
                <div className={s.barFill} style={{ width: ((a.count / data.conversationsByAgent[0].count) * 100) + '%' }} />
              </div>
              <span className={s.barValue}>{a.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline funnel */}
      {data.pipelineFunnel.length > 0 && (
        <div className={s.card}>
          <div className={s.cardTitle}>📊 Embudo de pipeline</div>
          {data.pipelineFunnel.map((stage, i) => {
            const max = Math.max(...data.pipelineFunnel.map(x => x.count), 1)
            return (
              <div key={i} className={s.barRow}>
                <span className={s.barLabel} style={{ color: stage.color || 'var(--text1)' }}>{stage.pipelineName} · {stage.stageName}</span>
                <div className={s.barTrack}>
                  <div className={s.barFill} style={{ width: ((stage.count / max) * 100) + '%', background: stage.color || 'var(--accent)' }} />
                </div>
                <span className={s.barValue}>{stage.count}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Token by model */}
      {data.tokenByModel.length > 0 && (
        <div className={s.card}>
          <div className={s.cardTitle}>💸 Tokens y costo por modelo</div>
          <table className={s.table}>
            <thead><tr><th>Modelo</th><th style={{ textAlign: 'right' }}>Tokens</th><th style={{ textAlign: 'right' }}>Costo USD</th></tr></thead>
            <tbody>
              {data.tokenByModel.map((m, i) => (
                <tr key={i}>
                  <td><strong>{m.model}</strong></td>
                  <td style={{ textAlign: 'right' }}>{fmtNum(m.totalTokens)}</td>
                  <td style={{ textAlign: 'right', color: '#22d98a', fontFamily: 'monospace' }}>{fmtUsd(m.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function KpiTile({ label, value, hint, color }) {
  return (
    <div className={s.kpiTile}>
      <div className={s.kpiLabel}>{label}</div>
      <div className={s.kpiValue} style={{ color: color || 'var(--text1)' }}>{value}</div>
      {hint && <div className={s.kpiHint}>{hint}</div>}
    </div>
  )
}
