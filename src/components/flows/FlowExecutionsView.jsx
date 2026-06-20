import { useState, useEffect } from 'react'
import { getExecutions, clearExecutions } from '../../lib/flowLocalStorage'
import { useAccount } from '../../context/AccountContext'
import FlowCanvas from './FlowCanvas'
import TestRunPanel from './TestRunPanel'
import ResponseViewer from './ResponseViewer'
import s from './FlowExecutionsView.module.css'

const HTTP_LIKE = new Set(['http_request', 'custom_api'])
function pickResponsePayload(step) {
  if (!step?.varsAfter) return null
  const va = step.varsAfter
  return va._last_http_response ?? null
}

/**
 * Vista "Ejecuciones" del flujo.
 *
 * Layout:
 *   - Sidebar izq: lista de ejecuciones del flujo
 *   - Centro:       canvas read-only con el recorrido del run seleccionado
 *   - Sidebar der: detalle del nodo seleccionado (vars antes/después, logs, error)
 *
 * Botón "Mockear datos y re-ejecutar" abre el TestRunPanel con las mockVars
 * de la ejecución para repetirla.
 */
export default function FlowExecutionsView({ flow, accId }) {
  const { account, selectedAgent } = useAccount() || {}
  const [execs, setExecs] = useState([])
  const [selectedExecId, setSelectedExecId] = useState(null)
  const [selectedStepIdx, setSelectedStepIdx] = useState(null)
  const [showMockRunner, setShowMockRunner] = useState(false)
  const [viewer, setViewer] = useState(null) // { title, subtitle, data }

  function reload() {
    setExecs(getExecutions(accId, flow.id))
  }

  useEffect(() => {
    reload()
    setSelectedExecId(null)
    setSelectedStepIdx(null)
  }, [flow.id, accId])

  const selected = execs.find(e => e.id === selectedExecId) || execs[0]
  const selectedStep = selected?.steps?.[selectedStepIdx]

  // Build runTrace for the canvas
  const runTrace = selected ? buildRunTrace(selected, flow) : null

  function handleSelectNode(nodeId) {
    if (!selected) return
    const idx = selected.steps.findIndex(st => st.nodeId === nodeId)
    if (idx !== -1) setSelectedStepIdx(idx)
  }

  if (execs.length === 0) {
    return (
      <div className={s.empty}>
        <div className={s.emptyIcon}>📊</div>
        <h3>Sin ejecuciones aún</h3>
        <p>Cuando ejecutes el flujo (manualmente, desde un chat o como prueba) aparecerá aquí su historial completo.</p>
        <p className={s.hint}>💡 Usa el botón <strong>▶ Probar flujo</strong> en la pestaña Editor para hacer una ejecución de prueba.</p>
      </div>
    )
  }

  return (
    <div className={s.view}>
      {/* ─── Sidebar izquierda: lista de ejecuciones ─── */}
      <div className={s.sidebar}>
        <div className={s.sidebarHeader}>
          <span className={s.sidebarTitle}>Ejecuciones ({execs.length})</span>
          <button
            className={s.clearBtn}
            onClick={() => { if (confirm('¿Borrar todo el historial de ejecuciones?')) { clearExecutions(accId, flow.id); reload() } }}
            title="Limpiar historial"
          >🗑</button>
        </div>
        <div className={s.execList}>
          {execs.map(e => (
            <button
              key={e.id}
              className={`${s.execItem} ${selected?.id === e.id ? s.execItemActive : ''}`}
              onClick={() => { setSelectedExecId(e.id); setSelectedStepIdx(null) }}
            >
              <div className={s.execRow1}>
                <span className={`${s.execDot} ${s['execDot_' + e.status]}`}>
                  {e.status === 'success' ? '✓' : e.status === 'error' ? '✗' : '⏸'}
                </span>
                <span className={s.execTime}>{fmtTime(e.ts)}</span>
                <span className={s.execDur}>{e.durationMs ?? '?'}ms</span>
              </div>
              <div className={s.execRow2}>
                <span className={s.execSource}>{sourceLabel(e)}</span>
                <span className={s.execSteps}>{e.steps?.length || 0} pasos</span>
              </div>
              {e.triggeredBy?.convId && (
                <div className={s.execRow3}>
                  <span className={s.execChat}>💬 chat: {e.triggeredBy.convId.slice(0, 14)}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Center: canvas read-only ─── */}
      <div className={s.center}>
        <div className={s.centerHeader}>
          {selected && (
            <>
              <div className={s.centerTitle}>
                <span className={`${s.bigDot} ${s['execDot_' + selected.status]}`}>
                  {selected.status === 'success' ? '✓' : selected.status === 'error' ? '✗' : '⏸'}
                </span>
                <div>
                  <div className={s.centerH1}>{fmtTime(selected.ts)}</div>
                  <div className={s.centerSub}>
                    {sourceLabel(selected)} · {selected.durationMs}ms · {selected.steps?.length} pasos
                  </div>
                </div>
              </div>
              <button
                className={s.mockBtn}
                onClick={() => setShowMockRunner(true)}
                title="Modificar las variables iniciales y volver a correr en sandbox"
              >🧪 Mockear datos y re-ejecutar</button>
            </>
          )}
        </div>
        <div className={s.canvasWrap}>
          {selected && (
            <FlowCanvas
              nodes={flow.nodes || []}
              startNodeId={flow.startNodeId}
              flowId={flow.id}
              readOnly
              runTrace={runTrace}
              onSelectNode={handleSelectNode}
            />
          )}
        </div>
      </div>

      {/* ─── Sidebar derecha: detalle del paso seleccionado ─── */}
      <div className={s.detail}>
        {selectedStep ? (
          <StepDetail
            step={selectedStep}
            onExpand={(title, data, subtitle) => setViewer({ title, data, subtitle })}
          />
        ) : selected ? (
          <div className={s.detailIntro}>
            <h4>📍 Selecciona un nodo</h4>
            <p>Haz click en un nodo del canvas para ver su estado en este momento de la ejecución.</p>
            <div className={s.stepsOverview}>
              <div className={s.stepsTitle}>Lista de pasos</div>
              {selected.steps.map((st, idx) => (
                <button
                  key={idx}
                  className={`${s.stepRow} ${s['stepRow_' + st.status]}`}
                  onClick={() => setSelectedStepIdx(idx)}
                >
                  <span className={s.stepRowIdx}>{idx + 1}</span>
                  <span className={s.stepRowIcon}>{st.icon || '•'}</span>
                  <span className={s.stepRowLabel}>{st.label || st.type}</span>
                  <span className={s.stepRowDur}>{st.durationMs ?? '?'}ms</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Mock runner modal */}
      {showMockRunner && selected && (
        <div className={s.modalBackdrop} onClick={e => e.target === e.currentTarget && setShowMockRunner(false)}>
          <div className={s.modalShell}>
            <TestRunPanel
              mode="flow"
              flow={flow}
              initialMockVars={selected.mockVars || {}}
              account={account}
              agId={selectedAgent?.id}
              onSaved={() => { reload(); setShowMockRunner(false) }}
              onClose={() => setShowMockRunner(false)}
            />
          </div>
        </div>
      )}

      {/* Response viewer (HTTP responses, snapshots, etc.) */}
      {viewer && (
        <ResponseViewer
          title={viewer.title}
          subtitle={viewer.subtitle}
          data={viewer.data}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  )
}

// ─── Detail panel for one step ────────────────────────────────────────────
function StepDetail({ step, onExpand }) {
  const changes = Object.entries(step.varsChanged || {})
  const isHttp = HTTP_LIKE.has(step.type)
  const responsePayload = isHttp ? pickResponsePayload(step) : null
  const hasResponse = responsePayload !== null && responsePayload !== undefined
  const httpStatus = step.varsAfter?._last_http_status
  return (
    <div className={s.detailContent}>
      <div className={s.detailHeader}>
        <span className={s.detailIcon}>{step.icon || '•'}</span>
        <div>
          <h4 className={s.detailTitle}>{step.label || step.type}</h4>
          <div className={s.detailSub}>
            <span className={`${s.statusPill} ${s['status_' + step.status]}`}>
              {step.status}
            </span>
            <span className={s.detailDur}>{step.durationMs}ms</span>
          </div>
        </div>
      </div>

      {step.error && (
        <div className={s.errorBox}>
          <strong>Error</strong>
          <div>{step.error}</div>
        </div>
      )}

      {hasResponse && (
        <button
          className={s.expandResponse}
          onClick={() => onExpand(
            `Respuesta — ${step.label || step.type}`,
            responsePayload,
            httpStatus ? `HTTP ${httpStatus}` : undefined,
          )}
        >
          🌐 Ver respuesta completa
          <span className={s.expandHintIn}>{previewSize(responsePayload)}</span>
        </button>
      )}

      {step.nextChosen && (
        <div className={s.metaBox}>
          <strong>Siguiente:</strong> {step.nextChosen}
        </div>
      )}

      {changes.length > 0 && (
        <div className={s.section}>
          <div className={s.sectionTitle}>📦 Variables modificadas ({changes.length})</div>
          <div className={s.diffList}>
            {changes.map(([k, v]) => (
              <div key={k} className={s.diffItem}>
                <code className={s.diffKey}>{k}</code>
                <div className={s.diffPair}>
                  <div className={s.diffOld}>− {fmtVal(v.from)}</div>
                  <div className={s.diffNew}>+ {fmtVal(v.to)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step.logs?.length > 0 && (
        <div className={s.section}>
          <div className={s.sectionTitle}>📝 Logs ({step.logs.length})</div>
          <ul className={s.logList}>
            {step.logs.map((l, i) => (
              <li key={i}><span className={s.logType}>{l.type}</span> {l.title}</li>
            ))}
          </ul>
        </div>
      )}

      <details className={s.varsDump}>
        <summary>
          📋 Snapshot completo
          <button
            className={s.snapshotExpand}
            onClick={e => { e.preventDefault(); onExpand('Snapshot de variables', filterSnapshot(step.varsAfter)) }}
          >🔍 Expandir</button>
        </summary>
        <pre>{JSON.stringify(filterSnapshot(step.varsAfter), null, 2)}</pre>
      </details>
    </div>
  )
}

function previewSize(payload) {
  try {
    const s = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const bytes = new Blob([s]).size
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  } catch { return '' }
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function buildRunTrace(exec, flow) {
  const nodeStatuses = {}
  const followedEdges = {}
  let prev = null
  for (const st of exec.steps || []) {
    if (!st.nodeId) continue
    nodeStatuses[st.nodeId] = st.status
    if (prev && prev.nodeId) {
      // Heuristic: si el step previo eligió success/error, marca esa arista
      if (prev.nextChosen?.startsWith('success')) followedEdges[`${prev.nodeId}_success`] = true
      else if (prev.nextChosen?.startsWith('error')) followedEdges[`${prev.nodeId}_error`] = true
    }
    prev = st
  }
  return { nodeStatuses, followedEdges }
}

function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function sourceLabel(exec) {
  const t = exec.triggeredBy?.type
  if (t === 'test')      return '🧪 Test'
  if (t === 'test-node') return '🧪 Test nodo'
  if (t === 'manual')    return '👤 Manual'
  if (t === 'bot')       return '🤖 Bot'
  return '?'
}

function fmtVal(v) {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  if (v === '') return '(vacío)'
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 100)
  return String(v).slice(0, 100)
}

function filterSnapshot(vars) {
  const out = {}
  for (const [k, v] of Object.entries(vars || {})) {
    if (!k.startsWith('__')) out[k] = v
  }
  return out
}
