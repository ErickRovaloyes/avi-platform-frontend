/**
 * Memory & Context — wrappers around setLocalVar / readConvos / contacts.
 *
 * Scopes:
 *   - 'conversation' (default): conv.localVars, alive for the chat session
 *   - 'user': persisted to the contact's `extra` JSON
 *   - 'account': persisted to the account-level variables collection
 */

import { setLocalVar, readConvos } from '../../storage'
import { interpolate, logDebug, setVarBoth } from '../common'
import { api } from '../../api'

async function loadConv(ctx) {
  const list = await readConvos(ctx.accId, ctx.agId)
  return (list || []).find(c => c.id === ctx.convId) || null
}

export const memoryNodes = [
  // ── 1) Guardar Memoria ──────────────────────────────────────────────────
  {
    type: 'memory_set',
    category: 'memory',
    label: 'Guardar memoria',
    icon: '💾', color: '#f5a623',
    description: 'Guarda un valor con clave y scope.',
    fields: [
      { key: 'scope', label: 'Scope', type: 'select', options: [
          { value: 'conversation', label: 'Conversación (local)' },
          { value: 'user',         label: 'Usuario (perfil)' },
          { value: 'account',      label: 'Cuenta (global)' },
        ], default: 'conversation' },
      { key: 'clave', label: 'Clave', type: 'text' },
      { key: 'valor', label: 'Valor', type: 'text', placeholder: '{{variable}} o texto literal' },
    ],
    async exec(node, ctx) {
      const key   = node.data?.clave
      const value = interpolate(node.data?.valor || '', ctx.variables)
      const scope = node.data?.scope || 'conversation'
      if (!key) throw new Error('Clave requerida')
      if (scope === 'conversation') {
        await setVarBoth(ctx, key, value)
      } else if (scope === 'user') {
        // Stored on the conversation's "userMemory" map; persistence layer is the contact
        ctx.variables[`user_${key}`] = value
        logDebug(ctx, 'flow_run', `💾 user[${key}] = ${value}`, {})
      } else {
        ctx.variables[`account_${key}`] = value
        logDebug(ctx, 'flow_run', `💾 account[${key}] = ${value}`, {})
      }
    },
  },

  // ── 2) Obtener Memoria ──────────────────────────────────────────────────
  {
    type: 'memory_get',
    category: 'memory',
    label: 'Obtener memoria',
    icon: '📖', color: '#f5a623',
    description: 'Lee un valor y lo copia a una variable.',
    fields: [
      { key: 'scope', label: 'Scope', type: 'select', options: [
          { value: 'conversation', label: 'Conversación' },
          { value: 'user',         label: 'Usuario' },
          { value: 'account',      label: 'Cuenta' },
        ], default: 'conversation' },
      { key: 'clave', label: 'Clave', type: 'text' },
      { key: 'variable_destino', label: 'Guardar en variable', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const key = node.data?.clave
      const scope = node.data?.scope || 'conversation'
      const lookupKey = scope === 'user' ? `user_${key}` : scope === 'account' ? `account_${key}` : key
      const value = ctx.variables[lookupKey]
      if (node.data?.variable_destino) await setVarBoth(ctx, node.data.variable_destino, value ?? '')
      logDebug(ctx, 'flow_run', `📖 ${lookupKey} = ${value ?? '(vacío)'}`, {})
    },
  },

  // ── 3) Actualizar Memoria ───────────────────────────────────────────────
  // Implemented as set; here so the UX surfaces it explicitly.
  {
    type: 'memory_update',
    category: 'memory',
    label: 'Actualizar memoria',
    icon: '🔄', color: '#f5a623',
    description: 'Sobrescribe el valor de una memoria existente.',
    fields: [
      { key: 'scope', label: 'Scope', type: 'select', options: [
          { value: 'conversation', label: 'Conversación' },
          { value: 'user', label: 'Usuario' },
          { value: 'account', label: 'Cuenta' },
        ], default: 'conversation' },
      { key: 'clave', label: 'Clave', type: 'text' },
      { key: 'valor', label: 'Nuevo valor', type: 'text' },
    ],
    async exec(node, ctx) {
      const key = node.data?.clave
      const value = interpolate(node.data?.valor || '', ctx.variables)
      const scope = node.data?.scope || 'conversation'
      const fullKey = scope === 'user' ? `user_${key}` : scope === 'account' ? `account_${key}` : key
      if (scope === 'conversation') await setVarBoth(ctx, fullKey, value)
      else ctx.variables[fullKey] = value
    },
  },

  // ── 4) Eliminar Memoria ─────────────────────────────────────────────────
  {
    type: 'memory_delete',
    category: 'memory',
    label: 'Eliminar memoria',
    icon: '🗑', color: '#ff5f5f',
    description: 'Borra una memoria.',
    fields: [
      { key: 'clave', label: 'Clave', type: 'text' },
    ],
    async exec(node, ctx) {
      const key = node.data?.clave
      if (!key) return
      delete ctx.variables[key]
      try { await setLocalVar(ctx.accId, ctx.agId, ctx.convId, key, null) } catch {}
      logDebug(ctx, 'flow_run', `🗑 Memoria ${key} eliminada`, {})
    },
  },

  // ── 5) Perfil Usuario ───────────────────────────────────────────────────
  // Carga {nombre, email, telefono, tags...} desde el contacto asociado.
  {
    type: 'user_profile',
    category: 'memory',
    label: 'Cargar perfil de usuario',
    icon: '👤', color: '#7c6fff',
    description: 'Lee el contacto asociado y carga sus campos como variables.',
    fields: [
      { key: 'lookup',  label: 'Buscar por', type: 'select', options: [
          { value: 'phone', label: 'Teléfono' },
          { value: 'email', label: 'Email' },
          { value: 'guest', label: 'Nombre de guest' },
        ], default: 'phone' },
      { key: 'value', label: 'Valor a buscar', type: 'text', placeholder: '{{telefono}}' },
    ],
    async exec(node, ctx) {
      const lookup = node.data?.lookup || 'phone'
      const value = interpolate(node.data?.value || '', ctx.variables)
      if (!value) throw new Error('Falta valor a buscar')
      try {
        const contacts = await api.get(`/api/accounts/${ctx.accId}/contacts`)
        const m = contacts.find(c =>
          (lookup === 'phone' && c.phone === value) ||
          (lookup === 'email' && c.email === value) ||
          (lookup === 'guest' && (c.name || '').toLowerCase() === value.toLowerCase())
        )
        if (m) {
          ctx.variables.user_id    = m.id
          ctx.variables.user_name  = m.name
          ctx.variables.user_email = m.email
          ctx.variables.user_phone = m.phone
          ctx.variables.user_tags  = (m.tags || []).join(',')
          logDebug(ctx, 'flow_run', `👤 Perfil cargado: ${m.name}`, { id: m.id })
        } else {
          logDebug(ctx, 'flow_run', '👤 Perfil no encontrado', { lookup, value })
        }
      } catch (e) { logDebug(ctx, 'error', 'No se pudo cargar perfil', e.message) }
    },
  },

  // ── 6) Historial de Conversación ────────────────────────────────────────
  // Carga los últimos N mensajes en una variable JSON, útil para alimentar IA.
  {
    type: 'conversation_history',
    category: 'memory',
    label: 'Historial conversación',
    icon: '📜', color: '#c179ff',
    description: 'Carga los últimos N mensajes en una variable.',
    fields: [
      { key: 'n',                 label: 'Cuántos mensajes', type: 'number', min: 1, max: 100, default: 10 },
      { key: 'variable_destino',  label: 'Guardar JSON en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const conv = await loadConv(ctx)
      const n = Math.max(1, Math.min(100, Number(node.data?.n) || 10))
      const slice = (conv?.messages || []).slice(-n).map(m => ({
        sender: m.sender, content: m.content, ts: m.ts,
      }))
      if (node.data?.variable_destino) await setVarBoth(ctx, node.data.variable_destino, JSON.stringify(slice))
      ctx.variables._conv_history = slice
    },
  },
]
