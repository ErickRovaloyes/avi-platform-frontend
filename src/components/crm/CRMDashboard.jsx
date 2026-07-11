import { useState, useEffect, useMemo } from 'react'
import { useAccount } from '../../context/AccountContext'
import { crmKpis, crmClassifyConversations, crmExecSummaryPreview, crmExecSummarySend, crmPipelineVelocity, crmRetention, crmQaRun, crmQaReview } from '../../lib/storage'
import s from './CRMPanel.module.css'

const TOPIC_LABEL = { ventas: '🛒 Ventas', soporte: '🛠 Soporte', queja: '⚠️ Quejas', informacion: 'ℹ️ Información', agendamiento: '🗓 Agendamiento', pedido: '📦 Pedidos', otro: '💬 Otro' }
const SENT = { positivo: { label: '😊 Positivo', color: '#22d98a' }, neutral: { label: '😐 Neutral', color: '#8b9a90' }, negativo: { label: '😠 Negativo', color: '#ff5f5f' } }
const OUTCOME = { atendido: { label: '✅ Atendido', color: '#22d98a' }, derivado: { label: '🙋 Derivado a humano', color: '#4fa8ff' }, sin_respuesta: { label: '🔕 Sin respuesta', color: '#ff5f5f' } }
function fmtDur(ms) {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60); return `${h}h ${m % 60}m`
}

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
function fmtUsd(n) { const v = Number(n || 0); return '$' + (v < 1 ? v.toFixed(4) : v.toFixed(2)) }

export default function CRMDashboard() {
  const { account, openConversation } = useAccount()
  const [rangeId, setRangeId] = useState('30d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [classifying, setClassifying] = useState(false)
  const [classifyMsg, setClassifyMsg] = useState('')
  const [summary, setSummary] = useState(null)   // preview del resumen ejecutivo
  const [sumTo, setSumTo] = useState('')
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState('')

  const range = useMemo(() => rangeBounds(rangeId), [rangeId])

  const sumDays = { '7d': 7, '30d': 30, '90d': 90, all: 30 }[rangeId] || 7
  async function openSummary() {
    setSendMsg('')
    try { const sm = await crmExecSummaryPreview(account.id, sumDays); setSummary(sm); setSumTo(sm.ownerEmail || '') }
    catch (e) { setSummary({ error: e.message }) }
  }
  async function sendSummary() {
    if (sending) return
    setSending(true); setSendMsg('')
    try { const r = await crmExecSummarySend(account.id, { to: sumTo.trim(), days: sumDays }); setSendMsg(`✓ Enviado a ${r.to}`) }
    catch (e) { setSendMsg('✕ ' + (e.message || 'no se pudo enviar')) }
    setSending(false)
  }

  const [velocity, setVelocity] = useState(null)
  const [retention, setRetention] = useState(null)
  const [qaReviewList, setQaReviewList] = useState([])
  const [qaRunning, setQaRunning] = useState(false)
  const [qaMsg, setQaMsg] = useState('')
  function loadKpis() {
    if (!account?.id) return
    setLoading(true); setError('')
    crmKpis(account.id, range).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false))
    crmPipelineVelocity(account.id).then(setVelocity).catch(() => setVelocity(null))
    crmRetention(account.id).then(setRetention).catch(() => setRetention(null))
    crmQaReview(account.id).then(r => setQaReviewList(r.items || [])).catch(() => setQaReviewList([]))
  }

  async function runQa() {
    if (!account?.id || qaRunning) return
    setQaRunning(true); setQaMsg('')
    try {
      let total = 0
      // Evalúa en lotes hasta agotar (o 6 lotes por clic, para no eternizarse).
      for (let i = 0; i < 6; i++) {
        const r = await crmQaRun(account.id, 15)
        if (r.error) { setQaMsg('Error: ' + r.error); break }
        total += r.evaluated || 0
        setQaMsg(`Evaluadas ${total}… (faltan ${r.remaining})`)
        if (!r.evaluated || !r.remaining) break
      }
      setQaMsg(total ? `✓ ${total} conversaciones evaluadas` : 'Todo estaba al día')
      loadKpis()
    } catch (e) { setQaMsg('Error: ' + (e.message || 'no se pudo evaluar')) }
    setQaRunning(false)
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={openSummary} title="Genera un resumen del período y envíalo por email al dueño"
            style={{ padding: '7px 12px', fontSize: 12, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>📧 Resumen ejecutivo</button>
          <select
            value={rangeId} onChange={e => setRangeId(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 12, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }}
          >
            {RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {summary && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setSummary(null)}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, width: 'min(520px,96vw)', maxHeight: '90vh', overflowY: 'auto', padding: 20 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <strong style={{ fontSize: 16, color: 'var(--text)' }}>📧 Resumen ejecutivo</strong>
              <button onClick={() => setSummary(null)} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', cursor: 'pointer', padding: '4px 10px' }}>✕</button>
            </div>
            {summary.error ? <div style={{ color: '#ff5f5f', fontSize: 13, marginTop: 10 }}>{summary.error}</div> : (
              <>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>Últimos {summary.days} días · {summary.account}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                  {[
                    ['💰 Ventas', `${Math.round(summary.revenue).toLocaleString('es-CO')} ${summary.currency}`, `${summary.orders} pedidos`],
                    ['💬 Conversaciones', summary.conversations, `${summary.contactsAdded} contactos nuevos`],
                    ['⏱ 1ª respuesta', fmtDur(summary.avgFrt), `${summary.attendedPct}% atendidas`],
                    ['🗂 Pipeline', `${Math.round(summary.dealsValue).toLocaleString('es-CO')} ${summary.currency}`, `${summary.dealsOpen} deals · ${summary.dealsWon} ganados`],
                  ].map(([l, v, sub]) => (
                    <div key={l} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 17, fontWeight: 800 }}>{v}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 2, fontWeight: 600 }}>{l}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{sub}</div>
                    </div>
                  ))}
                </div>
                {summary.topics?.length > 0 && <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 12 }}><b>Temas:</b> {summary.topics.map(t => `${TOPIC_LABEL[t.topic] || t.topic} (${t.count})`).join(' · ')}</div>}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12 }}>
                  <label style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 600 }}>Enviar a</label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                    <input value={sumTo} onChange={e => setSumTo(e.target.value)} placeholder="correo@dueño.com"
                      style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13 }} />
                    <button onClick={sendSummary} disabled={sending || !sumTo.trim()}
                      style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>{sending ? 'Enviando…' : 'Enviar'}</button>
                  </div>
                  {sendMsg && <div style={{ fontSize: 12, marginTop: 8, color: sendMsg.startsWith('✓') ? '#22d98a' : '#ff5f5f' }}>{sendMsg}</div>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {loading && <div className={s.empty}>Cargando...</div>}
      {error   && <div className={s.empty} style={{ color: '#ff5050' }}>{error}</div>}

      {data && (
        <>
          <div className={s.kpiGrid}>
            <KpiCard label="Conversaciones"  value={fmtNum(data.totalConversations)} accent="accent" />
            <KpiCard label="Contactos nuevos" value={fmtNum(data.contactsAdded)} />
            <KpiCard label="Deals abiertos"  value={fmtNum(data.dealsTotal)} accent="accent" />
            <KpiCard label="Valor del pipeline" value={fmtMoney(data.dealsValue)} accent="green" />
            <KpiCard label="Forecast (ponderado)" value={fmtMoney(data.forecast)} accent="accent" hint="valor × probabilidad" />
            <KpiCard label="Deals ganados"   value={fmtNum(data.dealsWon)} accent="green" hint={fmtMoney(data.wonValue) + ' ganados'} />
            <KpiCard label="Deals perdidos"  value={fmtNum(data.dealsLost)} accent={data.dealsLost > 0 ? 'amber' : null} hint={data.lostValue ? fmtMoney(data.lostValue) + ' perdidos' : '—'} />
            <KpiCard label="Tasa conversión" value={fmtPct(data.dealsConversionPct)} hint="ganados / cerrados" />
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

          {velocity && velocity.stages && velocity.stages.length > 0 && (
            <div className={s.funnel}>
              <div className={s.funnelTitle}>Velocidad y conversión del embudo <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 11 }}>· tiempo por etapa y % que avanza</span></div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 420, borderCollapse: 'collapse', fontSize: 12.5, marginTop: 8 }}>
                  <thead><tr style={{ color: 'var(--text3)', textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px', fontWeight: 600 }}>Etapa</th>
                    <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'right' }}>Tiempo prom.</th>
                    <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'right' }}>Entraron</th>
                    <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'right' }}>Avanzan</th>
                  </tr></thead>
                  <tbody>
                    {velocity.stages.map(st => (
                      <tr key={st.stageId} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px', color: st.color || 'var(--text1)', fontWeight: 600 }}>{st.name}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{st.avgDays != null ? `${st.avgDays} d` : '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{st.entered}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: st.throughputPct >= 60 ? '#22d98a' : st.throughputPct >= 30 ? '#f5a623' : '#ff5f5f' }}>{st.throughputPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.lostReasons && data.lostReasons.length > 0 && (
            <div className={s.funnel}>
              <div className={s.funnelTitle}>Motivos de pérdida</div>
              {(() => { const max = Math.max(...data.lostReasons.map(r => r.count), 1); return data.lostReasons.map(r => (
                <div key={r.reason} style={{ marginBottom: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                    <span>{r.reason}</span><span style={{ fontWeight: 700 }}>{r.count}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(r.count / max) * 100}%`, height: '100%', background: '#ff5f5f', borderRadius: 4 }} />
                  </div>
                </div>
              )) })()}
            </div>
          )}

          {/* Retención / churn — recencia de compra de clientes */}
          {retention && retention.customers > 0 && (() => {
            const b = retention.buckets, tot = retention.customers || 1
            const rows = [
              { k: 'active', label: '🟢 Activos', sub: '≤30 días', color: '#22d98a', count: b.active },
              { k: 'atRisk', label: '🟡 En riesgo', sub: '31–60 días', color: '#f5a623', count: b.atRisk },
              { k: 'inactive', label: '🟠 Inactivos', sub: '61–90 días', color: '#ff8a3d', count: b.inactive },
              { k: 'churned', label: '🔴 Perdidos', sub: '+90 días', color: '#ff5f5f', count: b.churned },
            ]
            return (
              <div className={s.funnel}>
                <div className={s.funnelTitle}>Retención de clientes <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 11 }}>· por recencia de su última compra</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginTop: 10 }}>
                  {rows.map(r => (
                    <div key={r.k} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '11px 13px' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: r.color }}>{r.count}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, fontWeight: 600 }}>{r.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{r.sub} · {Math.round(r.count / tot * 100)}%</div>
                    </div>
                  ))}
                </div>
                {(b.atRisk + b.inactive) > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10, background: 'rgba(245,166,35,.1)', border: '1px solid rgba(245,166,35,.3)', borderRadius: 8, padding: '8px 11px' }}>
                    ⚠️ <b>{b.atRisk + b.inactive} clientes en riesgo</b> ({Number(retention.atRiskValue).toLocaleString('es-CO')} {retention.currency} en juego). Crea un segmento "No han vuelto" y lánzale una campaña de retención desde <b>Segmentos → Masivos</b>.
                  </div>
                )}
              </div>
            )
          })()}

          {/* ROI de la IA — costo del asistente */}
          {(data.aiCostUsd > 0 || data.totalConversations > 0) && (
            <div className={s.funnel}>
              <div className={s.funnelTitle}>ROI de la inteligencia artificial <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 11 }}>· costo del asistente en el período</span></div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '12px 14px', flex: '1 1 150px' }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtUsd(data.aiCostUsd)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, fontWeight: 600 }}>🤖 Costo de IA (USD)</div>
                </div>
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '12px 14px', flex: '1 1 150px' }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtUsd(data.aiCostPerConv)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, fontWeight: 600 }}>💬 Por conversación</div>
                </div>
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '12px 14px', flex: '1 1 150px' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#22d98a' }}>{data.attendedPct || 0}%</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, fontWeight: 600 }}>✅ Atendidas por IA</div>
                </div>
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '12px 14px', flex: '1 1 150px' }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtNum(data.totalConversations)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, fontWeight: 600 }}>🗣 Conversaciones</div>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10 }}>La IA atendió {fmtNum(data.totalConversations)} conversaciones por {fmtUsd(data.aiCostUsd)} en total ({fmtNum(data.aiTokens)} tokens). El {data.attendedPct || 0}% se resolvió sin intervención humana.</div>
            </div>
          )}

          {/* Atención — tiempo de 1ª respuesta + desenlace */}
          {(data.classifiedTotal || 0) > 0 && (
            <div className={s.funnel}>
              <div className={s.funnelTitle}>Atención al cliente <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 11 }}>· de las conversaciones analizadas</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 18, marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '12px 14px', flex: 1 }}>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtDur(data.avgFirstResponseMs)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, fontWeight: 600 }}>⏱ 1ª respuesta (prom.)</div>
                  </div>
                  <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '12px 14px', flex: 1 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#22d98a' }}>{data.attendedPct}%</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, fontWeight: 600 }}>✅ Atendidas</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 700, marginBottom: 8 }}>DESENLACE</div>
                  {(() => { const tot = (data.outcomes || []).reduce((s, o) => s + o.count, 0) || 1; return ['atendido', 'derivado', 'sin_respuesta'].map(k => {
                    const count = data.outcomes?.find(o => o.outcome === k)?.count || 0
                    const pct = Math.round(count / tot * 100)
                    const o = OUTCOME[k]
                    return (
                      <div key={k} style={{ marginBottom: 7 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                          <span>{o.label}</span><span style={{ fontWeight: 700 }}>{count} · {pct}%</span>
                        </div>
                        <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: o.color, borderRadius: 4 }} />
                        </div>
                      </div>
                    )
                  }) })()}
                </div>
              </div>
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
                Aún no hay conversaciones analizadas. Pulsa <b>Analizar conversaciones</b> para descubrir de qué te hablan tus clientes, su sentimiento y los <b>tiempos de atención</b>. Usa el <b>Modelo IA de Negocio</b> configurado en el Super Panel.
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

          {/* QA del asistente — muestreo + score de calidad de los chats IA */}
          <div className={s.funnel}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div className={s.funnelTitle} style={{ margin: 0 }}>QA del asistente <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 11 }}>· calidad de las respuestas de la IA</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {qaMsg && <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{qaMsg}</span>}
                <button onClick={runQa} disabled={qaRunning}
                  style={{ padding: '7px 13px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                  {qaRunning ? 'Evaluando…' : `🔍 Evaluar calidad IA${data.qaPending ? ` (${data.qaPending})` : ''}`}
                </button>
              </div>
            </div>

            {(data.qaEvaluated || 0) === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 12 }}>
                Aún no se ha evaluado la calidad de las respuestas de la IA. Pulsa <b>Evaluar calidad IA</b> para que el <b>Modelo IA de Negocio</b> revise los chats atendidos por el asistente, les ponga una <b>nota de 0 a 100</b> y detecte respuestas malas o <b>posibles alucinaciones</b> que convenga revisar a mano.
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 12 }}>
                  <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: qaColor(data.qaAvg) }}>{data.qaAvg != null ? data.qaAvg : '—'}<span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 600 }}>/100</span></div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginTop: 2 }}>Calidad promedio</div>
                  </div>
                  <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: data.qaReviewCount > 0 ? '#ff5f5f' : '#22d98a' }}>{fmtNum(data.qaReviewCount)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginTop: 2 }}>Necesitan revisión <span style={{ opacity: .7 }}>(&lt;50)</span></div>
                  </div>
                  <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{fmtNum(data.qaEvaluated)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginTop: 2 }}>Chats evaluados</div>
                  </div>
                </div>

                {qaReviewList.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 700, marginBottom: 8 }}>COLA DE REVISIÓN <span style={{ opacity: .7, fontWeight: 400 }}>· peores respuestas — clic para abrir el chat</span></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {qaReviewList.map(c => (
                        <button key={c.id} onClick={() => c.agentId && openConversation(c.agentId, c.id)}
                          title="Abrir la conversación en el Inbox"
                          style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '8px 12px', cursor: c.agentId ? 'pointer' : 'default', color: 'var(--text2)' }}>
                          <span style={{ flex: '0 0 auto', minWidth: 38, textAlign: 'center', fontWeight: 800, fontSize: 14, color: qaColor(c.score), background: qaColor(c.score) + '22', borderRadius: 6, padding: '3px 6px' }}>{c.score}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.guestName || 'Cliente'} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· {c.channel || 'chat'}</span></span>
                            <span style={{ display: 'block', fontSize: 11.5, color: '#ff8a8a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.flag || 'Respuesta de baja calidad'}</span>
                          </span>
                          <span style={{ flex: '0 0 auto', fontSize: 15, color: 'var(--text3)' }}>›</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function qaColor(score) {
  if (score == null) return 'var(--text3)'
  if (score >= 80) return '#22d98a'
  if (score >= 50) return '#e0a92e'
  return '#ff5f5f'
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
