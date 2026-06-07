/**
 * Sandbox runner — ejecuta un nodo individual o un flujo entero sin tocar
 * el servidor, capturando una traza paso-a-paso para mostrar en el panel
 * de pruebas y en el visualizador de ejecuciones.
 *
 * El runner usa los executors reales del registry, pero envuelve `ctx`
 * con stubs que evitan side-effects (no se persisten variables, no se
 * envían mensajes a clientes, etc.) — la persistencia se queda en memoria
 * y se devuelve como `trace`.
 *
 * Forma de la traza devuelta:
 *   {
 *     status: 'success' | 'error',
 *     startedAt, endedAt, durationMs,
 *     finalVars: { ... },
 *     steps: [
 *       { nodeId, type, label, status, startedAt, endedAt, durationMs,
 *         varsBefore, varsAfter, varsChanged, logs, error? }
 *     ]
 *   }
 */

import { executeNode, getNode } from './flowNodes'

// ─── Build sandbox ctx ────────────────────────────────────────────────────
function buildSandboxCtx(initialVars, recorder) {
  const variables = { ...initialVars }
  const ctx = {
    flowId:  'sandbox',
    accId:   initialVars.__accId   || 'sandbox-acc',
    agId:    initialVars.__agId    || 'sandbox-ag',
    convId:  initialVars.__convId  || 'sandbox-conv',
    // Use the real account when provided so AI nodes can resolve saved prompts
    // (provider/model) and the account's API keys. Falls back to an empty stub.
    account: initialVars.__account || { id: 'sandbox', flows: [], variables: [] },
    nodes:   [],
    variables,
    visited: new Set(),
    _logs:   [],
    // Routing flags used by the engine; we read them after each exec
    _nextOverride:       null,
    _suppressDefaultNext: false,
    awaitInput:          null,
    awaitEvent:          null,
  }
  // Mark in recorder so common.js setVarBoth-equivalents can hook in
  ctx._sandbox = recorder
  return ctx
}

// ─── Diff helpers ─────────────────────────────────────────────────────────
function diffVars(before, after) {
  const changed = {}
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
  for (const k of keys) {
    if (k.startsWith('__')) continue
    if (JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])) {
      changed[k] = { from: before?.[k], to: after?.[k] }
    }
  }
  return changed
}

// ─── Single-node run ──────────────────────────────────────────────────────
export async function runNodeSandbox(node, initialVars = {}) {
  const startedAt = Date.now()
  const recorder = { logs: [] }
  const ctx = buildSandboxCtx(initialVars, recorder)
  const def = getNode(node.type) || { label: node.type, icon: '•' }
  const varsBefore = { ...ctx.variables }

  // Patch logDebug-like to capture logs into recorder
  // The common helpers call logDebug(ctx, type, title, detail) → use ctx._logs
  const origPush = recorder.logs.push.bind(recorder.logs)
  ctx._captureLog = (entry) => origPush(entry)

  let status = 'success'
  let error = null
  try {
    await executeNode(node, ctx)
  } catch (err) {
    status = 'error'
    error = err.message || String(err)
  }
  const endedAt = Date.now()
  const varsAfter = { ...ctx.variables }

  const step = {
    nodeId: node.id,
    type: node.type,
    label: def.label || node.type,
    icon:  def.icon  || '•',
    status,
    startedAt, endedAt,
    durationMs: endedAt - startedAt,
    varsBefore,
    varsAfter,
    varsChanged: diffVars(varsBefore, varsAfter),
    logs: recorder.logs.slice(),
    error,
  }
  return {
    status,
    startedAt, endedAt, durationMs: endedAt - startedAt,
    finalVars: varsAfter,
    steps: [step],
  }
}

// ─── Full-flow run ────────────────────────────────────────────────────────
export async function runFlowSandbox(flow, initialVars = {}, { maxSteps = 50 } = {}) {
  const startedAt = Date.now()
  const recorder = { logs: [] }
  const ctx = buildSandboxCtx(initialVars, recorder)
  ctx.nodes = flow.nodes || []
  ctx._captureLog = (entry) => recorder.logs.push(entry)

  const steps = []
  let nodeId = flow.startNodeId
  let runs = 0
  let overallStatus = 'success'
  const visited = new Set()

  while (nodeId && runs < maxSteps) {
    if (visited.has(nodeId)) {
      steps.push({ status: 'skipped', nodeId, label: 'Ciclo evitado', error: 'Nodo ya visitado' })
      break
    }
    visited.add(nodeId)
    const node = (flow.nodes || []).find(n => n.id === nodeId)
    if (!node) {
      steps.push({ status: 'error', nodeId, label: 'Nodo no encontrado', error: `No existe ${nodeId}` })
      overallStatus = 'error'
      break
    }
    const def = getNode(node.type) || { label: node.type, icon: '•' }
    const stepStart = Date.now()
    const varsBefore = { ...ctx.variables }
    const logsBefore = recorder.logs.length

    // Reset per-node flags
    ctx._nextOverride = null
    ctx._suppressDefaultNext = false
    ctx.awaitInput = null
    ctx.awaitEvent = null

    let stepStatus = 'success'
    let stepError = null
    try {
      await executeNode(node, ctx)
    } catch (err) {
      stepStatus = 'error'
      stepError = err.message || String(err)
    }
    const stepEnd = Date.now()
    const varsAfter = { ...ctx.variables }

    steps.push({
      nodeId: node.id,
      type:   node.type,
      label:  def.label,
      icon:   def.icon,
      color:  def.color,
      status: stepStatus,
      startedAt: stepStart,
      endedAt:   stepEnd,
      durationMs: stepEnd - stepStart,
      varsBefore,
      varsAfter,
      varsChanged: diffVars(varsBefore, varsAfter),
      logs: recorder.logs.slice(logsBefore),
      error: stepError,
      nextChosen: null, // filled below
    })

    if (stepStatus === 'error') {
      overallStatus = 'error'
      // Follow error edge if present
      nodeId = node.connections?.error || null
      steps[steps.length - 1].nextChosen = nodeId ? `error → ${nodeId}` : null
    } else if (ctx.awaitInput || ctx.awaitEvent) {
      steps[steps.length - 1].nextChosen = ctx.awaitInput ? 'pausa: input' : 'pausa: evento'
      overallStatus = 'paused'
      break
    } else if (ctx._nextOverride) {
      nodeId = ctx._nextOverride
      steps[steps.length - 1].nextChosen = `override → ${nodeId}`
    } else if (ctx._suppressDefaultNext) {
      steps[steps.length - 1].nextChosen = 'sin siguiente (suppress)'
      nodeId = null
    } else {
      nodeId = node.connections?.success || null
      steps[steps.length - 1].nextChosen = nodeId ? `success → ${nodeId}` : 'fin de rama'
    }
    runs++
  }
  if (runs >= maxSteps) {
    overallStatus = 'error'
    steps.push({ status: 'error', label: 'Límite de pasos', error: `Más de ${maxSteps} pasos` })
  }

  const endedAt = Date.now()
  return {
    status: overallStatus,
    startedAt, endedAt, durationMs: endedAt - startedAt,
    finalVars: ctx.variables,
    steps,
  }
}
