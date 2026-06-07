/**
 * LocalStorage helpers para drafts, historial de cambios y ejecuciones de flujos.
 *
 * Diseño: claves namespaced por accId+flowId. Todo es JSON, cap a 50 entradas
 * (FIFO) por flujo para no saturar el storage.
 *
 *   avi_flow_draft_<accId>_<flowId>      → { nodes, startNodeId, savedAt }
 *   avi_flow_history_<accId>_<flowId>    → [{ ts, label, snapshot:{nodes,startNodeId} }, …]
 *   avi_flow_execs_<accId>_<flowId>      → [{ id, ts, durationMs, source, trace, … }, …]
 */

const DRAFT_KEY   = (a, f) => `avi_flow_draft_${a}_${f}`
const HISTORY_KEY = (a, f) => `avi_flow_history_${a}_${f}`
const EXECS_KEY   = (a, f) => `avi_flow_execs_${a}_${f}`

const HISTORY_CAP = 30
const EXECS_CAP   = 50

function readJson(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback }
  catch { return fallback }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ─── Drafts ─────────────────────────────────────────────────────────────────
export function getDraft(accId, flowId) {
  if (!accId || !flowId) return null
  return readJson(DRAFT_KEY(accId, flowId), null)
}
export function setDraft(accId, flowId, draft) {
  if (!accId || !flowId) return
  writeJson(DRAFT_KEY(accId, flowId), { ...draft, savedAt: Date.now() })
}
export function clearDraft(accId, flowId) {
  if (!accId || !flowId) return
  try { localStorage.removeItem(DRAFT_KEY(accId, flowId)) } catch {}
}

// ─── History de cambios ────────────────────────────────────────────────────
export function getHistory(accId, flowId) {
  if (!accId || !flowId) return []
  return readJson(HISTORY_KEY(accId, flowId), [])
}
export function pushHistory(accId, flowId, snapshot, label = '') {
  if (!accId || !flowId) return
  const list = getHistory(accId, flowId)
  const entry = {
    id: 'h_' + Math.random().toString(36).slice(2, 9),
    ts: Date.now(),
    label,
    snapshot: { nodes: snapshot.nodes || [], startNodeId: snapshot.startNodeId || null },
  }
  const next = [entry, ...list].slice(0, HISTORY_CAP)
  writeJson(HISTORY_KEY(accId, flowId), next)
  return entry
}
export function clearHistory(accId, flowId) {
  if (!accId || !flowId) return
  try { localStorage.removeItem(HISTORY_KEY(accId, flowId)) } catch {}
}

// ─── Ejecuciones ───────────────────────────────────────────────────────────
export function getExecutions(accId, flowId) {
  if (!accId || !flowId) return []
  return readJson(EXECS_KEY(accId, flowId), [])
}
export function pushExecution(accId, flowId, exec) {
  if (!accId || !flowId) return
  const list = getExecutions(accId, flowId)
  const entry = {
    id: 'exec_' + Math.random().toString(36).slice(2, 9),
    ts: Date.now(),
    ...exec,
  }
  const next = [entry, ...list].slice(0, EXECS_CAP)
  writeJson(EXECS_KEY(accId, flowId), next)
  return entry
}
export function clearExecutions(accId, flowId) {
  if (!accId || !flowId) return
  try { localStorage.removeItem(EXECS_KEY(accId, flowId)) } catch {}
}
