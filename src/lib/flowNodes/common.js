/**
 * Helpers reused by every category executor. Centralized so node files stay focused
 * on what makes them unique.
 */

import { appendMsg, appendDebugEntry, setLocalVar, updateConvo } from '../storage'

// Variable interpolation — supports {{var}} and {{vars.x}}, falls back to literal
export function interpolate(text, vars = {}) {
  if (text === undefined || text === null) return ''
  return String(text).replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const k = key.trim()
    return vars[k] ?? `{{${k}}}`
  })
}

export function logDebug(ctx, type, title, detail) {
  // En sandbox capturamos en memoria; en producción lo enviamos a la API.
  if (ctx?._sandbox) {
    ctx._captureLog?.({ ts: Date.now(), type, title, detail })
    return
  }
  // Fire-and-forget — never block flow execution on a debug write
  try { appendDebugEntry(ctx.accId, ctx.agId, ctx.convId, { type, title, detail }) } catch {}
}

// Send a bot message to the conversation thread.
// Accepts plain text or an object with attachments/buttons metadata.
export async function sendBotMsg(ctx, content, metadata = {}) {
  if (ctx?._sandbox) {
    ctx._captureLog?.({
      ts: Date.now(), type: 'bot_message',
      title: typeof content === 'string' ? content : String(content || ''),
      detail: metadata,
    })
    return
  }
  const text = typeof content === 'string' ? content : String(content || '')
  // Fire-and-forget: DB persistence runs in background. The 'message:new' socket
  // event emitted by the backend is what updates the UI in real-time — callers
  // should NOT rely on the message being in DB before this returns.
  appendMsg(ctx.accId, ctx.agId, ctx.convId, {
    role: 'assistant', sender: 'ai',
    content: text,
    ts: Date.now(), fromFlow: true,
    ...metadata,
  }).catch(() => {})
  // Deliver to the external channel (WhatsApp/Messenger/IG) when running from a
  // webhook. On webchat there's no _outbound — the browser receives it via socket.
  if (ctx?._outbound && text) {
    try { Promise.resolve(ctx._outbound(text)).catch(() => {}) } catch {}
  }
}

// Lazily reads convo / runtime vars from ctx. Always returns a non-null object.
export function getVars(ctx) {
  return ctx?.variables || {}
}

// Persist a local variable on the conversation AND update ctx.variables in-memory.
// `key` may be a variable id OR a variable name — we resolve the account variable
// definition so the value becomes reachable via BOTH {{id}} and {{name}} in the
// same run, and is persisted under the canonical id.
export async function setVarBoth(ctx, key, value) {
  if (!key) return
  const def = (ctx.account?.variables || []).find(v => v.id === key || v.name === key)
  const canonicalId = def?.id || key
  // Reflect under every alias so later nodes resolve it however they reference it
  ctx.variables[key] = value
  ctx.variables[canonicalId] = value
  if (def?.name) ctx.variables[def.name] = value
  // Sandbox: solo memoria, no toca el servidor
  if (ctx?._sandbox) return
  try { await setLocalVar(ctx.accId, ctx.agId, ctx.convId, canonicalId, value) } catch {}
}

// Resolve a variable id OR a variable name to its current value
export function resolveVar(ctx, idOrName) {
  if (!idOrName) return undefined
  return ctx.variables?.[idOrName]
}

// Coerce a value to its likely type (used by JSON parse / formatter)
export function coerce(v, kind) {
  if (kind === 'number')  return Number(v)
  if (kind === 'boolean') return v === 'true' || v === true || v === 1
  if (kind === 'date')    return new Date(v)
  return v
}

// Safe JSON parse — returns fallback on failure
export function safeJson(str, fallback = null) {
  try { return JSON.parse(str) } catch { return fallback }
}

// Format a date in es-ES with a few preset shapes
export function fmtDate(value, preset = 'long') {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  switch (preset) {
    case 'date':  return d.toLocaleDateString('es')
    case 'time':  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    case 'iso':   return d.toISOString()
    case 'long':  return d.toLocaleString('es', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    case 'relative': {
      const diff = Date.now() - d.getTime()
      if (diff < 60_000)    return 'hace un momento'
      if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`
      if (diff < 86_400_000)return `hace ${Math.floor(diff / 3_600_000)} h`
      return `hace ${Math.floor(diff / 86_400_000)} d`
    }
    default: return d.toLocaleString('es')
  }
}

// Update the assignedTo metadata of the active conversation
export async function setAssignedTo(ctx, assignee) {
  await updateConvo(ctx.accId, ctx.agId, ctx.convId, { assignedTo: assignee })
}
