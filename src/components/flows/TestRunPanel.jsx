import { useState } from 'react'
import { runNodeSandbox, runFlowSandbox } from '../../lib/flowSandbox'
import ResponseViewer from './ResponseViewer'
import s from './TestRunPanel.module.css'

// Nodos cuya respuesta interesa expandir en visor grande.
const HTTP_LIKE = new Set(['http_request', 'custom_api', 'webhook', 'n8n_webhook'])

function pickResponsePayload(step) {
  if (!step?.varsAfter) return null
  const va = step.varsAfter
  return va._last_http_response ?? va._last_n8n_response ?? null
}

/**
 * Panel para ejecutar un nodo o un flujo entero en sandbox con variables mockeadas.
 *
 * Props:
 *   mode:     'node' | 'flow'
 *   node:     (mode='node') la def del nodo a probar
 *   flow:     (mode='flow') el flujo
 *   variables: catálogo de variables del account (para sugerir nombres)
 *   onSaved?: (executionEntry) => void  — llamado tras guardar la ejecución
 *   onClose?: () => void
 */
export default function TestRunPanel({
  mode = 'node',
  node, flow,
  variables = [],
  initialMockVars = {},
  account = null,
  agId = null,
  onSaved,
  onClose,
  embedded = false,
}) {
  const [mockVars, setMockVars] = useState(() => {
    const arr = []
    // Seed con variables del account (sin valor)
    variables.forEach(v => arr.push({ key: v.name || v.id, value: initialMockVars[v.name || v.id] ?? '' }))
    // Añadir extras conocidos
    if (!arr.some(r => r.key === '_lastUserMessage')) {
      arr.push({ key: '_lastUserMessage', value: initialMockVars._lastUserMessage ?? '' })
    }
    return arr.length ? arr : [{ key: '', value: '' }]
  })
  const [running, setRunning] = useState(false)
  const [result, setResult]   = useState(null)
  const [openStep, setOpenStep] = useState(null)
  const [viewer, setViewer]   = useState(null) // { title, subtitle, data }

  function buildVars() {
    const out = {}
    mockVars.forEach(({ key, value }) => {
      if (!key) return
      // Intenta parsear como JSON, si no, queda como string
      let v = value
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
            /^-?\d+(\.\d+)?$/.test(trimmed) ||
            trimmed === 'true' || trimmed === 'false' || trimmed === 'null') {
          try { v = JSON.parse(trimmed) } catch { v = value }
        }
      }
      out[key] = v
    })
    return out
  }

  async function run() {
    setRunning(true); setResult(null); setOpenStep(null)
    try {
      const vars = buildVars()
      // Inject the real account context so AI/integration nodes can resolve
      // saved prompts (provider/model) and the account's API keys.
      if (account) {
        vars.__account = account
        vars.__accId   = account.id
        if (agId) vars.__agId = agId
      }
      const r = mode === 'node'
        ? await runNodeSandbox(node, vars)
        : await runFlowSandbox(flow, vars)
      setResult(r)
      onSaved?.({
        source: 'test',
        scope:  mode === 'node' ? `node:${node?.type}` : `flow:${flow?.id}`,
        mockVars: vars,
        ...r,
      })
    } catch (e) {
      setResult({ status: 'error', steps: [{ status: 'error', error: e.message || String(e) }] })
    } finally {
      setRunning(false)
    }
  }

  function updateRow(idx, patch) {
    setMockVars(rows => rows.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }
  function addRow() { setMockVars(rows => [...rows, { key: '', value: '' }]) }
  function removeRow(idx) { setMockVars(rows => rows.filter((_, i) => i !== idx)) }

  return (
    <div className={`${s.panel} ${embedded ? s.embedded : ''}`}>
      <div className={s.header}>
        <h4 className={s.title}>
          {mode === 'node'
            ? <>▶ Probar nodo <code>{node?.type}</code></>
            : <>▶ Probar flujo <strong>{flow?.name}</strong></>}
        </h4>
        {onClose && <button className={s.closeBtn} onClick={onClose}>✕</button>}
      </div>

      <div className={s.body}>
        {/* Mock variables */}
        <section className={s.section}>
          <div className={s.sectionTitle}>
            <span>🧪 Variables de prueba</span>
            <span className={s.sectionHint}>El sandbox no toca tus chats ni la BD.</span>
          </div>
          <div className={s.varsList}>
            {mockVars.map((row, idx) => (
              <div key={idx} className={s.varRow}>
                <input
                  className={s.varKey}
                  placeholder="nombre_variable"
                  value={row.key}
                  onChange={e => updateRow(idx, { key: e.target.value })}
                />
                <input
                  className={s.varVal}
                  placeholder="valor (texto, número, JSON…)"
                  value={typeof row.value === 'string' ? row.value : JSON.stringify(row.value)}
                  onChange={e => updateRow(idx, { value: e.target.value })}
                />
                <button className={s.varRemove} onClick={() => removeRow(idx)} title="Eliminar">✕</button>
              </div>
            ))}
            <button className={s.varAdd} onClick={addRow}>+ Variable</button>
          </div>
        </section>

        {/* Run button */}
        <div className={s.runRow}>
          <button className={s.runBtn} onClick={run} disabled={running}>
            {running ? '⏳ Ejecutando…' : '▶ Ejecutar prueba'}
          </button>
          {result && (
            <span className={`${s.statusPill} ${s['status_' + result.status]}`}>
              {result.status === 'success' ? '✓ Éxito' : result.status === 'paused' ? '⏸ Pausado' : '✗ Error'}
              <span className={s.duration}>{result.durationMs}ms</span>
            </span>
          )}
        </div>

        {/* Results */}
        {result && (
          <section className={s.results}>
            <div className={s.sectionTitle}>
              <span>📋 Traza ({result.steps.length} {result.steps.length === 1 ? 'paso' : 'pasos'})</span>
            </div>
            <div className={s.steps}>
              {result.steps.map((step, idx) => (
                <StepRow
                  key={idx}
                  step={step}
                  open={openStep === idx}
                  onToggle={() => setOpenStep(openStep === idx ? null : idx)}
                  onExpandResponse={payload => setViewer({
                    title: `Respuesta — ${step.label || step.type}`,
                    subtitle: step.varsAfter?._last_http_status
                      ? `HTTP ${step.varsAfter._last_http_status}`
                      : undefined,
                    data: payload,
                  })}
                />
              ))}
            </div>

            {/* Final vars panel */}
            {result.finalVars && Object.keys(result.finalVars).length > 0 && (
              <div className={s.finalBlock}>
                <div className={s.sectionTitle}>
                  <span>🗃 Variables finales</span>
                  <button
                    className={s.expandLink}
                    onClick={() => setViewer({
                      title: 'Variables finales',
                      data: filterSnapshotPublic(result.finalVars),
                    })}
                  >🔍 Expandir</button>
                </div>
                <pre className={s.varDump}>{stringifyVars(result.finalVars)}</pre>
              </div>
            )}
          </section>
        )}
      </div>

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

function filterSnapshotPublic(vars) {
  const out = {}
  for (const [k, v] of Object.entries(vars || {})) {
    if (!k.startsWith('__')) out[k] = v
  }
  return out
}

// ─── Single step in the trace ───────────────────────────────────────────────
function StepRow({ step, open, onToggle, onExpandResponse }) {
  const isError = step.status === 'error'
  const changedKeys = Object.keys(step.varsChanged || {})
  const isHttp = HTTP_LIKE.has(step.type)
  const responsePayload = isHttp ? pickResponsePayload(step) : null
  const hasResponse = responsePayload !== null && responsePayload !== undefined
  return (
    <div className={`${s.step} ${isError ? s.stepError : ''}`}>
      <button className={s.stepHead} onClick={onToggle}>
        <span className={s.stepIcon}>{step.icon || '•'}</span>
        <span className={s.stepLabel}>{step.label || step.type || 'paso'}</span>
        <span className={`${s.stepStatus} ${s['status_' + step.status]}`}>
          {step.status === 'success' ? '✓'
            : step.status === 'error' ? '✗'
            : step.status === 'skipped' ? '↷' : '?'}
        </span>
        {step.durationMs != null && <span className={s.stepDur}>{step.durationMs}ms</span>}
        {changedKeys.length > 0 && <span className={s.stepChanges}>{changedKeys.length} cambios</span>}
        <span className={s.stepCaret}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className={s.stepBody}>
          {step.error && (
            <div className={s.errorBlock}>
              <strong>Error:</strong> {step.error}
            </div>
          )}
          {step.nextChosen && (
            <div className={s.metaLine}><strong>Ruta:</strong> {step.nextChosen}</div>
          )}
          {hasResponse && (
            <button
              className={s.expandResponseBtn}
              onClick={() => onExpandResponse?.(responsePayload)}
              title="Abrir la respuesta completa en un visor grande con búsqueda y copiar"
            >
              🌐 Ver respuesta completa
              <span className={s.expandHint}>{previewSize(responsePayload)}</span>
            </button>
          )}
          {changedKeys.length > 0 && (
            <div>
              <div className={s.subTitle}>Cambios en variables</div>
              <table className={s.diffTable}>
                <thead><tr><th>Variable</th><th>Antes</th><th>Después</th></tr></thead>
                <tbody>
                  {changedKeys.map(k => (
                    <tr key={k}>
                      <td><code>{k}</code></td>
                      <td className={s.diffOld}>{formatVal(step.varsChanged[k].from)}</td>
                      <td className={s.diffNew}>{formatVal(step.varsChanged[k].to)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {step.logs?.length > 0 && (
            <div>
              <div className={s.subTitle}>Logs ({step.logs.length})</div>
              <ul className={s.logList}>
                {step.logs.map((l, i) => (
                  <li key={i}>
                    <span className={s.logType}>{l.type}</span>
                    <span className={s.logTitle}>{l.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!step.error && !changedKeys.length && !step.logs?.length && (
            <div className={s.metaLine} style={{ color: 'var(--text3)' }}>Sin cambios ni logs en este paso.</div>
          )}
        </div>
      )}
    </div>
  )
}

function formatVal(v) {
  if (v === undefined) return <em className={s.empty}>undefined</em>
  if (v === null) return <em className={s.empty}>null</em>
  if (v === '') return <em className={s.empty}>(vacío)</em>
  if (typeof v === 'object') return <code>{JSON.stringify(v).slice(0, 80)}</code>
  return <code>{String(v).slice(0, 80)}</code>
}

function stringifyVars(vars) {
  const filtered = {}
  for (const [k, v] of Object.entries(vars || {})) {
    if (k.startsWith('__')) continue
    filtered[k] = v
  }
  return JSON.stringify(filtered, null, 2)
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
