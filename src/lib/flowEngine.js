/**
 * AVI Platform — Flow Execution Engine v3
 *
 * The engine itself is intentionally small. All node logic lives in flowNodes/
 * as declarative definitions + executors registered on a central registry.
 *
 * Each node has two output ports:
 *   connections.success → followed on successful execution
 *   connections.error   → followed when the executor throws
 *
 * Some nodes (if / switch / router / loop) take over routing themselves by
 * setting ctx._nextOverride + ctx._suppressDefaultNext.
 *
 * While a flow is running the conversation is flagged with `flowRunning: true`
 * so the agent IA doesn't respond in parallel.
 */

import { api } from './api'
import { appendDebugEntry, readConvos, updateConvo, recordFlowExecution } from './storage'
import { pushExecution } from './flowLocalStorage'

// Importing the index has the side effect of registering every node definition.
import { executeNode, getNode } from './flowNodes'

// AbortController por conversación: permite INTERRUMPIR la generación en curso cuando
// el usuario manda un mensaje nuevo (se aborta el fetch al modelo y se corta el flujo).
const _controllers = new Map()
export function cancel(convId) {
  const c = _controllers.get(convId)
  if (c) { try { c.abort() } catch {} return true }
  return false
}

// ─── Main executor ─────────────────────────────────────────────────────────
export async function executeFlow({ flowId, accId, agId, convId, triggerContext = {}, triggeredBy = { type: 'bot' }, outbound = null }) {
  const account = await api.get(`/api/public/accounts/${accId}`)
  if (!account) return

  const flow = account.flows?.find(f => f.id === flowId)
  if (!flow || !flow.nodes?.length) return

  // Flag the conversation so the IA pauses while the flow runs
  await updateConvo(accId, agId, convId, { flowRunning: true }).catch(() => {})

  const controller = new AbortController()
  _controllers.set(convId, controller)

  // Captura traza para historial de ejecuciones
  const trace = { steps: [], startedAt: Date.now(), status: 'success' }

  try {
    const variables = await buildVarContext(account, accId, agId, convId, triggerContext)
    const ctx = {
      flowId, accId, agId, convId, account,
      nodes: flow.nodes,
      variables,
      visited: new Set(),
      _trace: trace,  // hook leído por runNode para registrar cada paso
      _outbound: outbound, // delivery to external channels (WhatsApp/Messenger/IG); null on webchat
      _signal: controller.signal,  // cancelar la generación (interrumpir)
    }
    logDebug(accId, agId, convId, 'flow_run', `▶ Flujo "${flow.name}" iniciado`, { trigger: flow.trigger })
    await runNode(flow.startNodeId, ctx)
    logDebug(accId, agId, convId, 'flow_run', `✓ Flujo "${flow.name}" terminado`, {})
    trace.finalVars = ctx.variables
  } catch (err) {
    // Interrupción por mensaje nuevo → no es un error real; se rehará el flujo.
    if (controller.signal.aborted || err?.name === 'AbortError') { trace.status = 'aborted' }
    else {
      logDebug(accId, agId, convId, 'error', `✗ Error en flujo: ${err.message}`, {})
      trace.status = 'error'
      trace.error  = err.message
    }
  } finally {
    if (_controllers.get(convId) === controller) _controllers.delete(convId)
    trace.endedAt = Date.now()
    trace.durationMs = trace.endedAt - trace.startedAt
    try {
      pushExecution(accId, flowId, {
        status: trace.status,
        durationMs: trace.durationMs,
        startedAt: trace.startedAt,
        endedAt: trace.endedAt,
        finalVars: trace.finalVars,
        steps: trace.steps,
        triggeredBy: { ...triggeredBy, convId, agId },
        mockVars: triggerContext,
      })
    } catch {}
    // Registra también en el log GLOBAL del servidor para que las ejecuciones
    // del navegador (pruebas/webchat) aparezcan en "Logs globales" con su chat.
    recordFlowExecution(accId, {
      agentId: agId, convId, flowId, flowName: flow.name,
      trigger: flow.trigger, status: trace.status, error: trace.error,
      durationMs: trace.durationMs, startedAt: trace.startedAt,
    })
    await updateConvo(accId, agId, convId, { flowRunning: false }).catch(() => {})
  }
}

// ─── trigger dispatcher ────────────────────────────────────────────────────
// Looks up flows whose trigger matches the event and runs them.
export async function runTrigger({ trigger, accId, agId, convId, context = {} }) {
  try {
    const account = await api.get(`/api/public/accounts/${accId}`)
    const matching = (account?.flows || []).filter(f => {
      if (f.trigger !== trigger) return false
      if (trigger === 'keyword') {
        const kw = (f.triggerKeyword || '').trim().toLowerCase()
        if (!kw) return false
        return (context.message || '').toLowerCase().includes(kw)
      }
      return true
    })
    for (const f of matching) {
      await executeFlow({ flowId: f.id, accId, agId, convId, triggerContext: context })
    }
  } catch (err) {
    console.warn('[runTrigger]', err.message)
  }
}

// ─── Node runner ───────────────────────────────────────────────────────────
async function runNode(nodeId, ctx) {
  if (!nodeId || ctx.visited.has(nodeId)) return
  if (ctx._signal?.aborted) return   // interrumpido por un mensaje nuevo → detener el flujo
  ctx.visited.add(nodeId)

  const node = ctx.nodes.find(n => n.id === nodeId)
  if (!node) return

  const def = getNode(node.type)
  if (!def) {
    logDebug(ctx.accId, ctx.agId, ctx.convId, 'error', `✗ Tipo de nodo desconocido: ${node.type}`, {})
    const errNext = node.connections?.error
    if (errNext) await runNode(errNext, ctx)
    return
  }

  // El log de inicio vuelca la config del nodo. Para el Agente IA en modo "prompt
  // activo / de la lista", los campos inline (modelo/nombre/temperatura/prompt) NO se
  // usan — el modelo y el prompt vienen del PROMPT designado. Se omiten para no
  // confundir (p. ej. un 'modelo: gpt-4o-mini' heredado que en realidad NO se ejecuta).
  let logData = node.data
  if (node.type === 'ai_agent' && (node.data?.promptMode === 'active' || node.data?.promptMode === 'from_list')) {
    const { modelo, nombre, temperatura, prompt, ...rest } = node.data || {}
    logData = rest
  }
  logDebug(ctx.accId, ctx.agId, ctx.convId, 'flow_run',
    `→ [${def.label || node.type}] ejecutando`, { nodeId, data: logData })

  // Reset per-node routing flags
  ctx._nextOverride = null
  ctx._suppressDefaultNext = false
  ctx.awaitInput = null
  ctx.awaitEvent = null

  // Snapshot vars antes para la traza
  const varsBefore = ctx._trace ? { ...ctx.variables } : null
  const stepStart  = ctx._trace ? Date.now() : 0

  try {
    await executeNode(node, ctx)
  } catch (err) {
    logDebug(ctx.accId, ctx.agId, ctx.convId, 'error',
      `✗ Error en [${node.type}]: ${err.message}`, {})
    if (ctx._trace) {
      ctx._trace.steps.push({
        nodeId, type: node.type, label: def.label, icon: def.icon, color: def.color,
        status: 'error', error: err.message,
        startedAt: stepStart, endedAt: Date.now(), durationMs: Date.now() - stepStart,
        varsBefore, varsAfter: { ...ctx.variables },
        varsChanged: diffVars(varsBefore, ctx.variables),
        nextChosen: node.connections?.error ? `error → ${node.connections.error}` : null,
      })
      ctx._trace.status = 'error'
    }
    const errNext = node.connections?.error
    if (errNext) await runNode(errNext, ctx)
    return
  }

  // Registrar paso exitoso (o pausa) en la traza
  if (ctx._trace) {
    const isPaused = ctx.awaitInput || ctx.awaitEvent
    ctx._trace.steps.push({
      nodeId, type: node.type, label: def.label, icon: def.icon, color: def.color,
      status: isPaused ? 'paused' : 'success',
      startedAt: stepStart, endedAt: Date.now(), durationMs: Date.now() - stepStart,
      varsBefore, varsAfter: { ...ctx.variables },
      varsChanged: diffVars(varsBefore, ctx.variables),
      nextChosen: isPaused
        ? (ctx.awaitInput ? 'pausa: input' : 'pausa: evento')
        : ctx._nextOverride
          ? `override → ${ctx._nextOverride}`
          : ctx._suppressDefaultNext
            ? 'suppress'
            : (node.connections?.success ? `success → ${node.connections.success}` : 'fin'),
    })
    if (isPaused) ctx._trace.status = 'paused'
  }

  // Interrumpido mientras ejecutaba el nodo → no continuar al siguiente.
  if (ctx._signal?.aborted) return

  // If the executor signaled it's pausing for input/event, stop here.
  // The engine resumes later when the input arrives (or when the event fires).
  if (ctx.awaitInput || ctx.awaitEvent) return

  // Route via the executor's override if it took control
  if (ctx._nextOverride) { await runNode(ctx._nextOverride, ctx); return }
  if (ctx._suppressDefaultNext) return

  const successNext = node.connections?.success
  if (successNext) await runNode(successNext, ctx)
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function diffVars(before, after) {
  if (!before || !after) return {}
  const out = {}
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const k of keys) {
    if (k.startsWith('__')) continue
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      out[k] = { from: before[k], to: after[k] }
    }
  }
  return out
}

async function buildVarContext(account, accId, agId, convId, triggerContext = {}) {
  const convos = await readConvos(accId, agId)
  const conv = (convos || []).find(c => c.id === convId)
  const localVars = conv?.localVars || {}
  const ctx = { ...triggerContext }
  // Seed with the trigger payload's user message, if any
  if (triggerContext.message) ctx._lastUserMessage = triggerContext.message

  ;(account.variables || []).forEach(v => {
    // Prefer a value persisted on the conversation (set by a previous node, e.g.
    // the AI Agent's "save response in" field) over the variable's default.
    const val = localVars[v.id] ?? v.defaultValue ?? ''
    ctx[v.id] = val
    if (v.name) ctx[v.name] = val
  })
  // Make any extra localVars available under their raw keys too
  for (const [k, v] of Object.entries(localVars)) {
    if (!(k in ctx)) ctx[k] = v
  }
  return ctx
}

function logDebug(accId, agId, convId, type, title, detail) {
  appendDebugEntry(accId, agId, convId, { type, title, detail }).catch(() => {})
}
