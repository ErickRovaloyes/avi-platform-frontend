import { useState, useEffect, useMemo } from 'react'
import { useAccount } from '../../context/AccountContext'
import { crmKpis } from '../../lib/storage'
import s from './CRMPanel.module.css'

const RANGES = [
  { id: '7d',  label: 'Últimos 7 días',  days: 7 },
  { id: '30d', label: 'Últimos 30 días', days: 30 },
  { id: '90d', label: 'Últimos 90 días', days: 90 },
  { id: 'all', label: 'Todo',            days: 36500 },
]

function rangeBounds(rangeId) {
  const r = RANGES.find(x => x.id === rangeId) || RANGES[1]
  return { from: Date.now() - r.days * 86400000, to: Date.now() }
}

function fmtMoney(n, currency = 'USD') {
  if (!n) return '$0'
  try { return new Intl.NumberFormat('es', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n) }
  catch { return '$' + Number(n || 0).toFixed(0) }
}
function fmtNum(n) { return Number(n || 0).toLocaleString() }
function fmtPct(n) { return Number(n || 0).toFixed(1) + '%' }

export default function CRMDashboard() {
  const { account } = useAccount()
  const [rangeId, setRangeId] = useState('30d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const range = useMemo(() => rangeBounds(rangeId), [rangeId])

  useEffect(() => {
    if (!account?.id) return
    setLoading(true); setError('')
    crmKpis(account.id, range)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [account?.id, range.from, range.to])

  return (
    <div>
      <div style={{ padding: '14px 18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text1, #fff)' }}>Dashboard CRM</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text3, #888)' }}>
            Vista ejecutiva de tu actividad comercial.
          </p>
        </div>
        <select
          value={rangeId} onChange={e => setRangeId(e.target.value)}
          style={{ padding: '6px 10px', fontSize: 12, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }}
        >
          {RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>

      {loading && <div className={s.empty}>Cargando...</div>}
      {error   && <div className={s.empty} style={{ color: '#ff5050' }}>{error}</div>}

      {data && (
        <>
          <div className={s.kpiGrid}>
            <KpiCard label="Conversaciones"  value={fmtNum(data.totalConversations)} accent="accent" />
            <KpiCard label="Contactos nuevos" value={fmtNum(data.contactsAdded)} />
            <KpiCard label="Deals abiertos"  value={fmtNum(data.dealsTotal)} accent="accent" />
            <KpiCard label="Valor del pipeline" value={fmtMoney(data.dealsValue)} accent="green" />
            <KpiCard label="Deals ganados"   value={fmtNum(data.dealsWon)} accent="green" hint={fmtMoney(data.wonValue) + ' ganados'} />
            <KpiCard label="Tasa conversión" value={fmtPct(data.dealsConversionPct)} hint="won / total" />
            <KpiCard label="Tareas abiertas" value={fmtNum(data.tasksOpen)} accent={data.tasksOverdue > 0 ? 'amber' : null} hint={data.tasksOverdue ? `${data.tasksOverdue} vencidas` : 'al día'} />
            <KpiCard label="Derivado a humano" value={fmtNum(data.humanHandoffs)} />
          </div>

          {data.dealsByStage && data.dealsByStage.length > 0 && (
            <div className={s.funnel}>
              <div className={s.funnelTitle}>Embudo de pipeline</div>
              {data.dealsByStage.map((st, i) => {
                const max = Math.max(...data.dealsByStage.map(x => x.value || x.count), 1)
                const v   = st.value || st.count
                const pct = (v / max) * 100
                return (
                  <div key={i} className={s.funnelRow}>
                    <span className={s.funnelLabel} style={{ color: st.color || 'var(--text2)' }}>{st.name}</span>
                    <div className={s.funnelBar}><div className={s.funnelFill} style={{ width: pct + '%', background: st.color || 'var(--accent)' }} /></div>
                    <span className={s.funnelVal}>{fmtNum(st.count)} · {fmtMoney(st.value)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function KpiCard({ label, value, hint, accent }) {
  const accentCls = accent === 'accent' ? s.kpiCardAccent : accent === 'green' ? s.kpiCardGreen : accent === 'amber' ? s.kpiCardAmber : ''
  return (
    <div className={`${s.kpiCard} ${accentCls}`}>
      <div className={s.kpiLabel}>{label}</div>
      <div className={s.kpiValue}>{value}</div>
      {hint && <div className={s.kpiHint}>{hint}</div>}
    </div>
  )
}
