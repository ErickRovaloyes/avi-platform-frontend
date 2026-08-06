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

// Topes por TAMAÑO, no solo por número de entradas. Un cap de 50 ejecuciones no limita nada
// en la práctica: cada una guarda la traza completa de sus nodos, así que 50 trazas de un
// flujo grande pasan de 800 KB. Con una clave por cuenta+flujo —y un superadmin que visita
// muchas cuentas— se llenaba el localStorage (5 MB) y, al no quedar sitio, `setToken` fallaba
// e IMPEDÍA ENTRAR A LAS CUENTAS. Una caché de depuración no puede dejar la app inservible.
const EXECS_MAX_BYTES   = 120 * 1024   // por flujo
const HISTORY_MAX_BYTES = 200 * 1024   // por flujo (snapshots, más valiosos)
const EXEC_TRACE_CAP    = 120          // pasos guardados por ejecución

function readJson(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback }
  catch { return fallback }
}

// Libera cachés de depuración de OTROS flujos/cuentas cuando no cabe lo que intentamos
// guardar. Se sacrifica lo más antiguo y prescindible antes que fallar.
function evictOtherDebugCaches(exceptKey) {
  const victims = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || k === exceptKey) continue
      if (k.startsWith('avi_flow_execs_') || k.startsWith('avi_flow_history_')) {
        victims.push([k, (localStorage.getItem(k) || '').length])
      }
    }
  } catch { return false }
  if (!victims.length) return false
  victims.sort((a, b) => b[1] - a[1])          // primero las más gordas
  try { localStorage.removeItem(victims[0][0]) } catch { return false }
  return true
}

// Guarda recortando: si no cabe, va soltando las entradas más antiguas; si aun así no cabe,
// libera cachés de otros flujos. Devuelve la lista realmente almacenada.
function writeCapped(key, list, maxBytes) {
  const arr = list.slice()
  while (arr.length) {
    const raw = JSON.stringify(arr)
    if (raw.length <= maxBytes) {
      try { localStorage.setItem(key, raw); return arr }
      catch { if (!evictOtherDebugCaches(key)) break }   // sin víctimas → recortar más
    } else {
      arr.pop()                                          // fuera la más antigua
    }
  }
  try { localStorage.removeItem(key) } catch {}
  return []
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
  writeCapped(HISTORY_KEY(accId, flowId), next, HISTORY_MAX_BYTES)
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
  // La traza es, con diferencia, lo que más pesa: se recorta conservando el PRINCIPIO
  // (donde suele estar la causa de un fallo) y dejando constancia de lo omitido.
  let trace = exec?.trace
  if (Array.isArray(trace) && trace.length > EXEC_TRACE_CAP) {
    const omitidos = trace.length - EXEC_TRACE_CAP
    trace = [...trace.slice(0, EXEC_TRACE_CAP), { truncated: true, omitted: omitidos }]
  }
  const entry = {
    id: 'exec_' + Math.random().toString(36).slice(2, 9),
    ts: Date.now(),
    ...exec,
    ...(trace !== undefined ? { trace } : {}),
  }
  const next = [entry, ...list].slice(0, EXECS_CAP)
  writeCapped(EXECS_KEY(accId, flowId), next, EXECS_MAX_BYTES)
  return entry
}

// Borra TODAS las cachés de depuración de flujos (de cualquier cuenta). La usa el arranque
// de la app para recuperarse de un localStorage ya saturado por la versión anterior.
export function purgeAllFlowDebugCaches() {
  let removed = 0
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.startsWith('avi_flow_execs_') || k.startsWith('avi_flow_history_'))) keys.push(k)
    }
    for (const k of keys) { try { localStorage.removeItem(k); removed++ } catch {} }
  } catch {}
  return removed
}
export function clearExecutions(accId, flowId) {
  if (!accId || !flowId) return
  try { localStorage.removeItem(EXECS_KEY(accId, flowId)) } catch {}
}
