/**
 * Flow node registry — central catalog of every node type.
 *
 * Each entry follows the common base schema:
 * {
 *   type:        string                — unique id used in node.type
 *   category:    string                — for grouping in the picker UI
 *   label:       string                — short display name
 *   icon:        string                — single emoji
 *   color:       string                — hex color for the node header
 *   description: string                — one-line help text
 *   version:     string                — semver of this definition
 *
 *   // Declarative schema of editable fields (renders the panel automatically)
 *   fields: [{ key, label, type, ...options }]
 *   inputs:  { [name]: { type, description } }    // documentation only for now
 *   outputs: { [name]: { type, description } }
 *
 *   // Execution
 *   exec: async (node, ctx) => void               — node executor
 *   stub: boolean                                 — if true, exec logs a stub message
 *
 *   retry:             { enabled: false, maxAttempts: 3 },
 *   timeoutMs:         30000,
 *   continueOnError:   false,
 * }
 */

const _registry = new Map()
const _categories = []

export const CATEGORY_META = {
  conversation:  { id: 'conversation',  label: 'Conversación',       icon: '💬', color: '#7c6fff' },
  ai:            { id: 'ai',            label: 'Inteligencia Artificial', icon: '🤖', color: '#22d98a' },
  memory:        { id: 'memory',        label: 'Memoria y Contexto', icon: '🧠', color: '#f5a623' },
  control:       { id: 'control',       label: 'Control de Flujo',   icon: '⚡', color: '#2dd4c8' },
  data:          { id: 'data',          label: 'Datos y Variables',  icon: '📊', color: '#4fa8ff' },
  knowledge:     { id: 'knowledge',     label: 'Base de Conocimiento', icon: '📚', color: '#c179ff' },
  integrations:  { id: 'integrations',  label: 'Integraciones',      icon: '🔌', color: '#ff8c42' },
  crm:           { id: 'crm',           label: 'CRM y Leads',        icon: '👥', color: '#22d98a' },
  calendar:      { id: 'calendar',      label: 'Agenda y Reservas',  icon: '📅', color: '#ff6eb4' },
  human:         { id: 'human',         label: 'Atención Humana',    icon: '🙋', color: '#4fa8ff' },
  analytics:     { id: 'analytics',     label: 'Analítica',          icon: '📈', color: '#22d98a' },
}

// Base interface — applied to every registered node before storing.
const BASE_DEFAULTS = {
  version: '1.0.0',
  active: true,
  description: '',
  fields: [],
  inputs: {},
  outputs: { result: { type: 'any', description: 'Resultado de la ejecución' } },
  retry: { enabled: false, maxAttempts: 3 },
  timeoutMs: 30000,
  continueOnError: false,
  logs: true,
  stub: false,
}

export function registerNode(def) {
  if (!def?.type)     throw new Error('Node definition needs a unique `type`')
  if (!def?.exec)     def.exec = async () => { throw new Error(`Nodo ${def.type} sin implementación`) }
  if (!def?.category) def.category = 'data'
  const merged = { ...BASE_DEFAULTS, ...def }
  _registry.set(def.type, merged)
  if (!_categories.includes(def.category)) _categories.push(def.category)
  return merged
}

export function registerMany(arr) { arr.forEach(registerNode) }

export function getNode(type)    { return _registry.get(type) }
export function listNodes()      { return Array.from(_registry.values()) }
export function listCategories() { return _categories.map(id => CATEGORY_META[id] || { id, label: id, icon: '•', color: '#888' }) }

export function listByCategory(categoryId) {
  return listNodes().filter(n => n.category === categoryId)
}

/**
 * Execute a node by its type. Honors retry/timeout/continueOnError from the
 * node definition. The flowEngine delegates here instead of switching on type.
 */
export async function executeNode(node, ctx) {
  const def = _registry.get(node.type)
  if (!def) throw new Error(`Tipo de nodo no registrado: ${node.type}`)

  const attempts = def.retry?.enabled ? Math.max(1, def.retry.maxAttempts) : 1
  let lastErr = null
  for (let i = 1; i <= attempts; i++) {
    try {
      // Per-execution timeout via Promise.race
      const exec = def.exec(node, ctx)
      const timeoutMs = def.timeoutMs || 30000
      const result = await Promise.race([
        exec,
        new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${timeoutMs}ms`)), timeoutMs)),
      ])
      return result
    } catch (err) {
      lastErr = err
      if (i < attempts) {
        // small backoff
        await new Promise(r => setTimeout(r, 250 * i))
      }
    }
  }
  if (def.continueOnError) {
    // Don't throw — flow continues via success branch with error in vars
    if (ctx?.variables) ctx.variables.error = lastErr?.message || 'error'
    return null
  }
  throw lastErr
}

export const _internals = { _registry, _categories }
