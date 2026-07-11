import { useState, useEffect, useMemo } from 'react'
import { useAccount } from '../../context/AccountContext'
import { crmKpis, crmClassifyConversations } from '../../lib/storage'
import s from './CRMPanel.module.css'

const TOPIC_LABEL = { ventas: '🛒 Ventas', soporte: '🛠 Soporte', queja: '⚠️ Quejas', informacion: 'ℹ️ Información', agendamiento: '🗓 Agendamiento', pedido: '📦 Pedidos', otro: '💬 Otro' }
const SENT = { positivo: { label: '😊 Positivo', color: '#22d98a' }, neutral: { label: '😐 Neutral', color: '#8b9a90' }, negativo: { label: '😠 Negativo', color: '#ff5f5f' } }

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
  const [classifying, setClassifying] = useState(false)
  const [classifyMsg, setClassifyMsg] = useState('')

  const range = useMemo(() => rangeBounds(rangeId), [rangeId])

  function loadKpis() {
    if (!account?.id) return
    setLoading(true); setError('')
    crmKpis(account.id, range).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false))
  }
  useEffect(() => { loadKpis() }, [account?.id, range.from, range.to])

  async function analyze() {
    if (!account?.id || classifying) return
    setClassifying(true); setClassifyMsg('')
    try {
      let total = 0
      // Clasifica en lotes hasta agotar (o 8 lotes máx. por clic, para no eternizarse).
      for (let i = 0; i < 8; i++) {
        const r = await crmClassifyConversations(account.id, 25)
        total += r.classified || 0
        setClassifyMsg(`Analizadas ${total}… (faltan ${r.remaining})`)
        if (!r.classified || !r.remaining) break
      }
      setClassifyMsg(total ? `✓ ${total} conversaciones analizadas` : 'Todo estaba al día')
      loadKpis()
    } catch (e) { setClassifyMsg('Error: ' + (e.message || 'no se pudo analizar')) }
    setClassifying(false)
  }

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

          {/* Voz del cliente — temas + sentimiento (clasificación IA) */}
          <div className={s.funnel}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div className={s.funnelTitle} style={{ margin: 0 }}>Voz del cliente <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 11 }}>· clasificación IA de conversaciones</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {classifyMsg && <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{classifyMsg}</span>}
                <button onClick={analyze} disabled={classifying}
                  style={{ padding: '7px 13px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                  {classifying ? 'Analizando…' : `✨ Analizar conversaciones${data.unclassified ? ` (${data.unclassified})` : ''}`}
                </button>
              </div>
            </div>

            {(data.classifiedTotal || 0) === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 12 }}>
                Aún no hay conversaciones analizadas. Pulsa <b>Analizar conversaciones</b> para descubrir de qué te hablan tus clientes y su sentimiento. Usa el <b>Modelo IA de Negocio</b> configurado en el Super Panel.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 700, marginBottom: 8 }}>TEMAS MÁS FRECUENTES</div>
                  {(() => { const max = Math.max(1, ...data.topics.map(t => t.count)); return data.topics.map(t => (
                    <div key={t.topic} style={{ marginBottom: 7 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                        <span>{TOPIC_LABEL[t.topic] || t.topic}</span><span style={{ fontWeight: 700 }}>{t.count}</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${(t.count / max) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                      </div>
                    </div>
                  )) })()}
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 700, marginBottom: 8 }}>SENTIMIENTO</div>
                  {['positivo', 'neutral', 'negativo'].map(k => {
                    const found = data.sentiment.find(x => x.sentiment === k)
                    const count = found?.count || 0
                    const pct = data.classifiedTotal ? Math.round(count / data.classifiedTotal * 100) : 0
                    return (
                      <div key={k} style={{ marginBottom: 7 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                          <span>{SENT[k].label}</span><span style={{ fontWeight: 700 }}>{count} · {pct}%</span>
                        </div>
                        <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: SENT[k].color, borderRadius: 4 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
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
