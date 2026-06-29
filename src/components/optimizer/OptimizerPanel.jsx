import { useState, useEffect, useCallback, useRef } from 'react'
import { optimizerStatus, optimizerRun, optimizerSuggestions, optimizerSetSuggestionStatus } from '../../lib/storage'
import ChangeAgentPanel from '../changeagent/ChangeAgentPanel'

// Instrucción para el Agente de Cambios derivada del cambio propuesto por la sugerencia.
function buildInstruction(sg) {
  const pc = sg.proposedChange || {}
  const lines = [`Aplica esta mejora al prompt (sugerencia ${sg.code} del Optimizador): ${sg.title}.`]
  if (pc.section) lines.push(`Sección a modificar: ${pc.section}.`)
  if (pc.add) lines.push(`Agrega: ${pc.add}`)
  if (pc.remove) lines.push(`Quita: ${pc.remove}`)
  if (pc.replace) lines.push(`Reemplaza: ${pc.replace}`)
  if (pc.justification) lines.push(`Motivo: ${pc.justification}`)
  return lines.join('\n')
}

const SEV = { alta: '#ff5f5f', media: '#f5a623', baja: '#22d98a' }
const TYPE_LABEL = { prompt: 'Prompt', rag: 'RAG', knowledge: 'Conocimiento', tools: 'Herramientas', flow: 'Flujo', model: 'Modelo' }
const STATUS_LABEL = { new: 'Nueva', active: 'Activa', in_review: 'En revisión', applied: 'Aplicada', discarded: 'Descartada', resolved: 'Resuelta' }

// Optimizador Inteligente del Prompt — Fase 1: pantalla de estado + botón
// "Actualizar análisis" (indexa de forma incremental, sin consumir tokens).
// Las sugerencias y el dashboard llegan en las fases siguientes.
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }
const fmt = ts => ts ? new Date(Number(ts)).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function OptimizerPanel({ agent, account }) {
  const accId = account?.id
  const agId = agent?.id
  const [status, setStatus] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState('')
  const [applyingSug, setApplyingSug] = useState(null)   // sugerencia abierta en el Agente de Cambios
  const pollRef = useRef(null)

  const load = useCallback(async () => {
    if (!accId || !agId) { setLoading(false); return }
    try {
      const [st, sg] = await Promise.all([optimizerStatus(accId, agId), optimizerSuggestions(accId, agId).catch(() => ({ suggestions: [] }))])
      setStatus(st); setSuggestions(sg.suggestions || [])
      setRunning(!!st.running)
      return st
    } catch (e) { setErr(e.message || 'Error') }
    finally { setLoading(false) }
  }, [accId, agId])

  useEffect(() => { setLoading(true); load() }, [load])
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  async function setSuggStatus(sid, status, appliedVersion) {
    try { await optimizerSetSuggestionStatus(accId, agId, sid, status, appliedVersion); load() }
    catch (e) { setErr(e.message || 'Error') }
  }
  // Tras aplicar el cambio en el Agente de Cambios: marca la sugerencia "Aplicada"
  // y guarda la frecuencia del momento para medir reapariciones después.
  function onSugApplied(sg) {
    setSuggStatus(sg.id, 'applied', `f${sg.frequency}@${Date.now()}`)
    setApplyingSug(null)
  }

  async function startRun() {
    if (running) return
    setErr(''); setRunning(true)
    try {
      await optimizerRun(accId, agId)
      // Sondea el estado hasta que el run termine.
      pollRef.current = setInterval(async () => {
        const st = await load()
        if (st && !st.running) { clearInterval(pollRef.current); pollRef.current = null; setRunning(false) }
      }, 2500)
    } catch (e) { setErr(e.message || 'No se pudo iniciar el análisis'); setRunning(false) }
  }

  if (!agId) return <div style={{ padding: 24, color: 'var(--text3)' }}>Selecciona un agente.</div>
  if (loading) return <div style={{ padding: 24, color: 'var(--text3)' }}>Cargando…</div>

  const s = status || {}
  const sug = s.suggestions || {}

  return (
    <div style={{ padding: 24, maxWidth: 940, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>🧠 Optimizador Inteligente del Prompt</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0', maxWidth: 620 }}>
            Analiza tus conversaciones de forma <strong>incremental</strong> (solo lo nuevo o modificado) para detectar
            oportunidades de mejora del prompt. El análisis no se ejecuta solo: corre cuando pulsas el botón.
          </p>
        </div>
        <button onClick={startRun} disabled={running}
          style={{ padding: '11px 18px', borderRadius: 10, border: 'none', cursor: running ? 'default' : 'pointer', fontSize: 14, fontWeight: 700, color: '#fff', background: running ? 'var(--bg3)' : 'linear-gradient(135deg,var(--accent),var(--accent2))', opacity: running ? 0.7 : 1, whiteSpace: 'nowrap' }}>
          {running ? '⏳ Analizando…' : '🔄 Actualizar análisis'}
        </button>
      </div>

      {err && <div style={{ ...card, color: '#ff5f5f', borderColor: '#ff5f5f55', background: 'rgba(255,95,95,.08)', marginBottom: 14, fontSize: 13 }}>{err}</div>}

      {running && (
        <div style={{ ...card, marginBottom: 14, background: 'var(--accent-dim)', borderColor: 'var(--accent-glow)', fontSize: 13, color: 'var(--text)' }}>
          ⏳ Procesando conversaciones nuevas/modificadas en segundo plano. Esta pasada <strong>no consume tokens de IA</strong> (Fase 1: indexado estructurado).
        </div>
      )}

      {/* Resumen de estado */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12, marginBottom: 16 }}>
        <Stat label="Último análisis" value={s.lastRun ? fmt(s.lastRun.at) : 'Nunca'} sub={s.lastRun?.startedBy ? `por ${s.lastRun.startedBy}` : ''} />
        <Stat label="Versión del prompt" value={s.promptVersion || '—'} sub={s.lastRun?.promptVersion && s.lastRun.promptVersion !== s.promptVersion ? `analizado: ${s.lastRun.promptVersion}` : 'actual'} />
        <Stat label="Conversaciones analizadas" value={(s.totalIndexed || 0).toLocaleString('es')} />
        <Stat label="Nuevas / modificadas" value={(s.pending || 0).toLocaleString('es')} sub="pendientes de analizar" accent={s.pending > 0 ? '#f5a623' : undefined} />
        <Stat label="Sugerencias activas" value={sug.active || 0} accent="#22d98a" />
        <Stat label="Aplicadas" value={sug.applied || 0} />
        <Stat label="Resueltas" value={sug.resolved || 0} />
        <Stat label="Estado" value={running ? 'Analizando' : 'Listo'} accent={running ? '#f5a623' : '#22d98a'} />
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 }}>
        ℹ El sistema <strong>no reanaliza toda la base</strong> de conversaciones: solo procesa lo nuevo o lo que cambió desde el último análisis.
      </div>

      {/* Sugerencias */}
      <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>Sugerencias de mejora {suggestions.length > 0 && <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({suggestions.length})</span>}</h2>
      {suggestions.length === 0 ? (
        <div style={{ ...card, color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 28 }}>
          Aún no hay sugerencias. Pulsa “Actualizar análisis”: si hay conversaciones con problemas, el análisis con IA
          generará recomendaciones aquí.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {suggestions.map(sg2 => <SuggestionCard key={sg2.id} sg={sg2} onStatus={setSuggStatus} onApply={setApplyingSug} />)}
        </div>
      )}

      {applyingSug && (
        <ChangeAgentPanel
          agentId={agId}
          initialInstruction={buildInstruction(applyingSug)}
          onApplied={() => onSugApplied(applyingSug)}
          onClose={() => setApplyingSug(null)}
        />
      )}
    </div>
  )
}

function SuggestionCard({ sg, onStatus, onApply }) {
  const [open, setOpen] = useState(false)
  const sevColor = SEV[sg.severity] || 'var(--text3)'
  const pc = sg.proposedChange || {}
  const closed = sg.status === 'discarded' || sg.status === 'resolved'
  // Impacto tras aplicar: applied_version guarda "f<freqAlAplicar>@<ts>".
  const freqAtApply = sg.status === 'applied' && /^f(\d+)@/.test(sg.appliedVersion || '') ? Number(RegExp.$1) : null
  const reappeared = freqAtApply != null ? Math.max(0, (sg.frequency || 0) - freqAtApply) : null
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, opacity: closed ? 0.7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)' }}>{sg.code}</span>
        <strong style={{ fontSize: 14, flex: 1, minWidth: 160 }}>{sg.title}</strong>
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: `1px solid ${sevColor}`, color: sevColor }}>{sg.severity}</span>
        <span style={{ fontSize: 10.5, color: 'var(--text2)', background: 'var(--bg3)', borderRadius: 20, padding: '2px 8px' }}>{TYPE_LABEL[sg.problemType] || sg.problemType}</span>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{sg.frequency}× · {STATUS_LABEL[sg.status] || sg.status}</span>
      </div>
      {sg.description && <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 7, lineHeight: 1.5 }}>{sg.description}</div>}

      <button onClick={() => setOpen(o => !o)} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>
        {open ? '▲ Ocultar detalle' : '▼ Ver cambio propuesto y evidencia'}
      </button>
      {open && (
        <div style={{ marginTop: 8, background: 'var(--bg1)', border: '1px solid var(--border2)', borderRadius: 8, padding: 12, fontSize: 12.5, lineHeight: 1.55 }}>
          {pc.section && <Line k="Sección" v={pc.section} />}
          {pc.add && <Line k="Agregar" v={pc.add} color="#22d98a" />}
          {pc.remove && <Line k="Quitar" v={pc.remove} color="#ff5f5f" />}
          {pc.replace && <Line k="Reemplazar" v={pc.replace} color="#f5a623" />}
          {pc.justification && <Line k="Justificación" v={pc.justification} />}
          {pc.expected_impact && <Line k="Impacto esperado" v={pc.expected_impact} />}
          {sg.evidence && <Line k="Evidencia" v={typeof sg.evidence === 'string' ? sg.evidence : JSON.stringify(sg.evidence)} />}
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{(sg.conversations || []).length} conversación(es) relacionadas.</div>
        </div>
      )}

      {/* Impacto de una sugerencia ya aplicada */}
      {sg.status === 'applied' && (
        <div style={{ marginTop: 10, fontSize: 12.5, padding: '8px 11px', borderRadius: 8, background: reappeared ? 'rgba(245,166,35,.1)' : 'rgba(34,217,138,.1)', border: `1px solid ${reappeared ? '#f5a62355' : '#22d98a55'}`, color: 'var(--text)' }}>
          {reappeared
            ? <>⚠ El problema <strong>reapareció {reappeared}×</strong> desde que se aplicó. Quizá necesita otra mejora.</>
            : <>✓ Sin reapariciones desde que se aplicó. <button onClick={() => onStatus(sg.id, 'resolved')} style={{ ...btnGhost, padding: '3px 9px', marginLeft: 6 }}>Marcar resuelta</button></>}
        </div>
      )}

      {!closed && sg.status !== 'applied' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={() => onApply(sg)} disabled={!pc || (!pc.add && !pc.remove && !pc.replace && !pc.section)}
            title="Envía la mejora al Agente de Cambios (consume sus tokens; verás el costo y confirmarás)"
            style={{ padding: '7px 13px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,var(--accent),var(--accent2))', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
            ✨ Aplicar cambio
          </button>
          {sg.status !== 'in_review' && <button onClick={() => onStatus(sg.id, 'in_review')} style={btnGhost}>En revisión</button>}
          <button onClick={() => onStatus(sg.id, 'discarded')} style={{ ...btnGhost, color: '#ff5f5f', borderColor: '#ff5f5f55' }}>Descartar</button>
        </div>
      )}
      {sg.status === 'discarded' && <button onClick={() => onStatus(sg.id, 'active')} style={{ ...btnGhost, marginTop: 12 }}>Reactivar</button>}
    </div>
  )
}
const btnGhost = { padding: '7px 13px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }
function Line({ k, v, color }) {
  return <div style={{ marginBottom: 5 }}><span style={{ fontWeight: 700, color: 'var(--text3)' }}>{k}: </span><span style={{ color: color || 'var(--text)' }}>{v}</span></div>
}

function Stat({ label, value, sub, accent }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 13 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: accent || 'var(--text)', marginTop: 4 }}>{value}</div>
      {sub ? <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 2 }}>{sub}</div> : null}
    </div>
  )
}
