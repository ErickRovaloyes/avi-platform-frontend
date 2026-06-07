import { useState, useEffect, useMemo } from 'react'
import { useAccount } from '../../context/AccountContext'
import { queryTokenUsage } from '../../lib/storage'
import s from './AnalyticsPanels.module.css'

const RANGES = [
  { id: '7d',   label: 'Últimos 7 días',  days: 7 },
  { id: '30d',  label: 'Últimos 30 días', days: 30 },
  { id: '90d',  label: 'Últimos 90 días', days: 90 },
  { id: 'month', label: 'Mes actual',     custom: () => {
      const d = new Date(); d.setDate(1); d.setHours(0,0,0,0)
      return { from: d.getTime(), to: Date.now() }
    } },
  { id: 'all',  label: 'Todo',            days: 3650 },
]

const SOURCE_LABELS = {
  chat: '💬 Chat',
  'change-agent': '🤖 Agente Cambios',
  'prompt-generator': '📝 Generador',
  classify: '🔍 Clasificación',
  'rag-embed': '📚 Embeddings RAG',
}

function rangeBounds(rangeId) {
  const r = RANGES.find(x => x.id === rangeId) || RANGES[1]
  if (r.custom) return r.custom()
  const to = Date.now()
  const from = to - r.days * 86_400_000
  return { from, to }
}

function fmtNum(n) { return Number(n || 0).toLocaleString() }
function fmtUsd(n) { return '$' + Number(n || 0).toFixed(4) }
function fmtDate(s) { return s ? new Date(s).toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '' }

export default function TokenUsagePanel() {
  const { account, visibleAgents } = useAccount()
  const [rangeId, setRangeId]   = useState('30d')
  const [agentId, setAgentId]   = useState('')
  const [groupBy, setGroupBy]   = useState('model')
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const range = useMemo(() => rangeBounds(rangeId), [rangeId])

  useEffect(() => {
    if (!account?.id) return
    setLoading(true); setError('')
    queryTokenUsage(account.id, { from: range.from, to: range.to, agentId: agentId || undefined, groupBy })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [account?.id, range.from, range.to, agentId, groupBy])

  // Build simple SVG line chart for daily trend
  const trendSvg = useMemo(() => {
    const series = data?.dailyTrend || []
    if (series.length === 0) return null
    const W = 760, H = 160, PAD = 32
    const maxV = Math.max(...series.map(d => d.totalTokens), 1)
    const xStep = (W - PAD * 2) / Math.max(series.length - 1, 1)
    const pts = series.map((d, i) => {
      const x = PAD + i * xStep
      const y = H - PAD - (d.totalTokens / maxV) * (H - PAD * 2)
      return [x, y]
    })
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
    const area = path + ` L${pts[pts.length-1][0].toFixed(1)},${H-PAD} L${pts[0][0].toFixed(1)},${H-PAD} Z`
    return { path, area, W, H, PAD, maxV, series, pts }
  }, [data])

  return (
    <div className={s.panel}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Consumo de tokens</h1>
          <p className={s.sub}>Tokens consumidos y costo aproximado en USD por modelo, agente y origen.</p>
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
        <div className={s.filterGroup}>
          <label>Agrupar por</label>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)}>
            <option value="model">Modelo</option>
            <option value="agent">Agente</option>
            <option value="day">Día</option>
            <option value="source">Origen</option>
          </select>
        </div>
        <span style={{ marginLeft: 'auto', alignSelf: 'flex-end', fontSize: 11, color: 'var(--text3)' }}>
          {fmtDate(range.from)} → {fmtDate(range.to)}
        </span>
      </div>

      {/* KPI tiles */}
      {data && (
        <div className={s.kpiGrid}>
          <KpiTile label="Llamadas IA" value={fmtNum(data.totals.countCalls)} />
          <KpiTile label="Tokens input"   value={fmtNum(data.totals.promptTokens)}     hint="Texto enviado al modelo" />
          <KpiTile label="Tokens output"  value={fmtNum(data.totals.completionTokens)} hint="Respuesta del modelo" />
          <KpiTile label="Total tokens"   value={fmtNum(data.totals.totalTokens)}      color="#7c6fff" />
          <KpiTile label="Costo USD"      value={fmtUsd(data.totals.costUsd)}          color="#22d98a" hint="Estimado según tarifas de cada modelo" />
        </div>
      )}

      {/* Daily trend */}
      {trendSvg && (
        <div className={s.card}>
          <div className={s.cardTitle}>📈 Tendencia diaria — tokens consumidos</div>
          <svg width="100%" viewBox={`0 0 ${trendSvg.W} ${trendSvg.H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
            <defs>
              <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c6fff" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#7c6fff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={trendSvg.area} fill="url(#gradTokens)" />
            <path d={trendSvg.path} stroke="#7c6fff" strokeWidth="2" fill="none" />
            {trendSvg.pts.map((p, i) => (
              <g key={i}>
                <circle cx={p[0]} cy={p[1]} r="3" fill="#7c6fff" />
                <title>{trendSvg.series[i].day}: {fmtNum(trendSvg.series[i].totalTokens)} tokens · {fmtUsd(trendSvg.series[i].costUsd)}</title>
              </g>
            ))}
            <text x={trendSvg.PAD} y={trendSvg.H - 8} fontSize="10" fill="var(--text3)">{trendSvg.series[0]?.day}</text>
            <text x={trendSvg.W - trendSvg.PAD} y={trendSvg.H - 8} fontSize="10" fill="var(--text3)" textAnchor="end">{trendSvg.series[trendSvg.series.length-1]?.day}</text>
            <text x={4} y={14} fontSize="10" fill="var(--text3)">{fmtNum(trendSvg.maxV)}</text>
          </svg>
        </div>
      )}

      {/* Breakdown table */}
      <div className={s.card}>
        <div className={s.cardTitle}>📊 Desglose por {groupBy === 'model' ? 'modelo' : groupBy === 'agent' ? 'agente' : groupBy === 'source' ? 'origen' : 'día'}</div>
        {loading && <div className={s.empty}>Cargando...</div>}
        {error && <div className={s.error}>{error}</div>}
        {!loading && data?.groups?.length === 0 && <div className={s.empty}>Sin datos en este periodo.</div>}
        {data?.groups?.length > 0 && (
          <table className={s.table}>
            <thead>
              <tr>
                <th>{groupBy === 'model' ? 'Modelo' : groupBy === 'agent' ? 'Agente' : groupBy === 'source' ? 'Origen' : 'Día'}</th>
                <th style={{ textAlign: 'right' }}>Llamadas</th>
                <th style={{ textAlign: 'right' }}>Input</th>
                <th style={{ textAlign: 'right' }}>Output</th>
                <th style={{ textAlign: 'right' }}>Total tokens</th>
                <th style={{ textAlign: 'right' }}>Costo USD</th>
              </tr>
            </thead>
            <tbody>
              {data.groups.map((g, i) => (
                <tr key={i}>
                  <td>{renderKey(g, groupBy, visibleAgents)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtNum(g.countCalls)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtNum(g.promptTokens)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtNum(g.completionTokens)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtNum(g.totalTokens)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--green, #22d98a)', fontFamily: 'monospace' }}>{fmtUsd(g.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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

function renderKey(g, groupBy, agents) {
  const k = g.key
  if (groupBy === 'agent') {
    const ag = agents.find(a => a.id === k)
    return ag?.name || (k ? k : '(sin agente)')
  }
  if (groupBy === 'source') return SOURCE_LABELS[k] || k
  if (groupBy === 'model')  return (<span><strong>{k}</strong> {g.provider && <span style={{ color: 'var(--text3)', fontSize: 11 }}>· {g.provider}</span>}</span>)
  if (groupBy === 'day')    return k
  return String(k || '—')
}
