/**
 * Flow control — if/switch/loop/wait/merge/router/error.
 *
 * Some of these (if / switch / loop) need to influence the engine's traversal,
 * so their executors signal the next node via ctx._nextOverride.
 */

import { interpolate, logDebug } from '../common'

// Compare operator helper
function compare(left, op, right) {
  const a = String(left ?? '').trim()
  const b = String(right ?? '').trim()
  const na = Number(a), nb = Number(b)
  switch (op) {
    case '==': case '=': return a === b
    case '!=': return a !== b
    case '>':  return na > nb
    case '<':  return na < nb
    case '>=': return na >= nb
    case '<=': return na <= nb
    case 'contains':     return a.toLowerCase().includes(b.toLowerCase())
    case 'starts_with':  return a.toLowerCase().startsWith(b.toLowerCase())
    case 'ends_with':    return a.toLowerCase().endsWith(b.toLowerCase())
    case 'regex': {
      try { return new RegExp(b).test(a) } catch { return false }
    }
    case 'empty':        return !a
    case 'not_empty':    return !!a
    default: return false
  }
}

function parseDuration(str) {
  const m = String(str || '').trim().match(/^(\d+)\s*(ms|s|m|h|d)?$/i)
  if (!m) return null
  const n = Number(m[1])
  const unit = (m[2] || 's').toLowerCase()
  const mult = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] || 1000
  return n * mult
}

export const controlNodes = [
  // ── 1) IF ───────────────────────────────────────────────────────────────
  {
    type: 'if',
    category: 'control',
    label: 'IF',
    icon: '⚡', color: '#2dd4c8',
    description: 'Bifurca según condición. Éxito = verdadero, Error = falso.',
    fields: [
      { key: 'campo',    label: 'Variable / Texto', type: 'text', placeholder: '{{variable}} o valor literal' },
      { key: 'operador', label: 'Operador',         type: 'select', options: [
          { value: '==', label: '== igual' },
          { value: '!=', label: '!= distinto' },
          { value: '>',  label: '> mayor' },
          { value: '<',  label: '< menor' },
          { value: '>=', label: '>=' },
          { value: '<=', label: '<=' },
          { value: 'contains',    label: 'contiene' },
          { value: 'starts_with', label: 'empieza con' },
          { value: 'ends_with',   label: 'termina con' },
          { value: 'regex',       label: 'coincide regex' },
          { value: 'empty',       label: 'está vacío' },
          { value: 'not_empty',   label: 'no está vacío' },
        ], default: '==' },
      { key: 'valor', label: 'Valor a comparar', type: 'text' },
    ],
    async exec(node, ctx) {
      const left  = interpolate(node.data?.campo || '', ctx.variables)
      const right = interpolate(node.data?.valor || '', ctx.variables)
      const match = compare(left, node.data?.operador, right)
      logDebug(ctx, 'flow_run', `⚡ IF: "${left}" ${node.data?.operador} "${right}" → ${match ? 'TRUE' : 'FALSE'}`, {})
      // Tell the engine to follow success/error explicitly (not via default success-edge)
      ctx._nextOverride = match ? node.connections?.success : node.connections?.error
      ctx._suppressDefaultNext = true
    },
  },

  // ── 2) Switch ───────────────────────────────────────────────────────────
  {
    type: 'switch',
    category: 'control',
    label: 'Switch',
    icon: '🔀', color: '#2dd4c8',
    description: 'Múltiples rutas según el valor de una variable.',
    fields: [
      { key: 'campo', label: 'Variable a evaluar', type: 'text', placeholder: '{{intent}}' },
      { key: 'cases', label: 'Cases JSON', type: 'code', language: 'json',
        placeholder: '{"ventas": "node_x", "soporte": "node_y", "default": "node_z"}' },
    ],
    async exec(node, ctx) {
      const value = interpolate(node.data?.campo || '', ctx.variables).trim().toLowerCase()
      let cases = {}
      try { cases = JSON.parse(node.data?.cases || '{}') } catch {}
      const target = cases[value] || cases.default || node.connections?.success
      logDebug(ctx, 'flow_run', `🔀 Switch: "${value}" → ${target || '(ninguno)'}`, {})
      ctx._nextOverride = target
      ctx._suppressDefaultNext = true
    },
  },

  // ── 3) Router (alias semántico del Switch, sin código JSON) ─────────────
  {
    type: 'router',
    category: 'control',
    label: 'Router',
    icon: '🛣', color: '#2dd4c8',
    description: 'Bifurcación libre. La elección viene de una variable.',
    fields: [
      { key: 'variable',  label: 'Variable',         type: 'variableRef' },
      { key: 'rutas',     label: 'Rutas (clave: nodeId, una por línea)', type: 'textarea',
        placeholder: 'ventas:node_id_1\nsoporte:node_id_2' },
    ],
    async exec(node, ctx) {
      const value = (ctx.variables[node.data?.variable] || '').toString().trim().toLowerCase()
      const lines = String(node.data?.rutas || '').split('\n').map(s => s.trim()).filter(Boolean)
      const map = Object.fromEntries(lines.map(l => l.split(':').map(s => s.trim())))
      const target = map[value] || node.connections?.success
      ctx._nextOverride = target
      ctx._suppressDefaultNext = true
    },
  },

  // ── 4) Merge ────────────────────────────────────────────────────────────
  // Pure pass-through; useful as a meeting point for parallel-looking branches.
  {
    type: 'merge',
    category: 'control',
    label: 'Merge',
    icon: '⊕', color: '#888',
    description: 'Punto de unión sin lógica; continúa por la salida éxito.',
    async exec(_node, _ctx) { /* no-op */ },
  },

  // ── 5) Loop ─────────────────────────────────────────────────────────────
  // Iterates "count" times, redirecting to success each time then to error when done.
  {
    type: 'loop',
    category: 'control',
    label: 'Loop',
    icon: '🔁', color: '#7c6fff',
    description: 'Repite N veces o sobre un array.',
    fields: [
      { key: 'modo',  label: 'Modo', type: 'select', options: [
          { value: 'count', label: 'Contador (n veces)' },
          { value: 'array', label: 'Sobre array (JSON)' },
        ], default: 'count' },
      { key: 'n',     label: 'Número de iteraciones', type: 'number', min: 1, max: 100, default: 5 },
      { key: 'array', label: 'Array (JSON o {{var}})', type: 'text' },
      { key: 'variable_indice', label: 'Variable índice', type: 'variableRef' },
      { key: 'variable_item',   label: 'Variable item',   type: 'variableRef' },
    ],
    async exec(node, ctx) {
      // Loop semantics: the engine sees the node's executor return; we accumulate
      // state in ctx._loops keyed by nodeId. Each call increments the counter and
      // sets the item/index vars; when finished we send "done" via error edge.
      const key = `loop_${node.id}`
      const state = (ctx._loops ||= {})
      const cur = state[key] || { i: 0, items: null }

      if (node.data?.modo === 'array') {
        if (!cur.items) {
          let arr = []
          const raw = interpolate(node.data?.array || '[]', ctx.variables)
          try { arr = Array.isArray(raw) ? raw : JSON.parse(raw) } catch {}
          cur.items = arr
        }
        if (cur.i >= cur.items.length) {
          delete state[key]
          ctx._nextOverride = node.connections?.error
          ctx._suppressDefaultNext = true
          return
        }
        if (node.data?.variable_indice) ctx.variables[node.data.variable_indice] = cur.i
        if (node.data?.variable_item)   ctx.variables[node.data.variable_item]   = cur.items[cur.i]
        cur.i++
        state[key] = cur
        // success edge → body. The user is responsible for routing the body's
        // tail back to this loop node.
      } else {
        const n = Math.max(1, Math.min(100, Number(node.data?.n) || 1))
        if (cur.i >= n) {
          delete state[key]
          ctx._nextOverride = node.connections?.error
          ctx._suppressDefaultNext = true
          return
        }
        if (node.data?.variable_indice) ctx.variables[node.data.variable_indice] = cur.i
        cur.i++
        state[key] = cur
      }
    },
  },

  // ── 6) Espera ───────────────────────────────────────────────────────────
  {
    type: 'wait',
    category: 'control',
    label: 'Espera',
    icon: '⏱', color: '#ff6eb4',
    description: 'Pausa el flujo por un tiempo.',
    fields: [
      { key: 'duracion', label: 'Duración', type: 'text', default: '10s', placeholder: '500ms, 10s, 2m, 1h' },
    ],
    async exec(node, ctx) {
      const ms = parseDuration(node.data?.duracion || node.data?.seconds + 's' || '5s')
      const safe = Math.min(ms || 5000, 30_000) // hardcap at 30s in-flow to avoid blocking too long
      logDebug(ctx, 'flow_run', `⏱ Esperando ${safe}ms`, {})
      await new Promise(r => setTimeout(r, safe))
    },
  },

  // ── 7) Esperar Evento ───────────────────────────────────────────────────
  // Stops the flow until an external webhook arrives with the matching id.
  {
    type: 'wait_event',
    category: 'control',
    label: 'Esperar evento',
    icon: '📨', color: '#ff6eb4',
    description: 'Detiene el flujo hasta recibir un evento externo.',
    fields: [
      { key: 'evento', label: 'Nombre del evento', type: 'text', placeholder: 'pago_confirmado' },
      { key: 'timeout', label: 'Timeout (segundos)', type: 'number', min: 5, max: 86400, default: 3600 },
    ],
    async exec(node, ctx) {
      // For now we surface the waiting state on the conversation; an external
      // controller can resume the flow when the event arrives.
      ctx.awaitEvent = { name: node.data?.evento, timeout: Number(node.data?.timeout) || 3600 }
      logDebug(ctx, 'flow_run', `📨 Esperando evento: ${ctx.awaitEvent.name}`, ctx.awaitEvent)
    },
  },

  // ── 8) Error Handler ────────────────────────────────────────────────────
  // Catches errors raised by upstream nodes. By itself it's a pass-through;
  // its value is being placed on the error edge of a critical node.
  {
    type: 'error_handler',
    category: 'control',
    label: 'Error handler',
    icon: '🛡', color: '#ff5f5f',
    description: 'Punto de captura; los nodos críticos deben conectar su rama error aquí.',
    fields: [
      { key: 'mensaje_log', label: 'Mensaje de log', type: 'text', default: 'Error capturado' },
    ],
    async exec(node, ctx) {
      const msg = interpolate(node.data?.mensaje_log || 'Error', ctx.variables)
      logDebug(ctx, 'error', `🛡 ${msg}`, { error: ctx.variables?.error })
    },
  },
]
