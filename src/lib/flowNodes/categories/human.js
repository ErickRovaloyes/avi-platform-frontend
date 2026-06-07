/**
 * Human assistance — transfer to a human, create a ticket, add an internal note,
 * close the case. Hooks into the existing conversation update + CRM endpoints.
 */

import { api } from '../../api'
import { interpolate, logDebug, sendBotMsg, setAssignedTo } from '../common'
import { updateConvo } from '../../storage'

export const humanNodes = [
  // ── 1) Transferir conversación ──────────────────────────────────────────
  {
    type: 'human_transfer',
    category: 'human',
    label: 'Transferir conversación',
    icon: '🙋', color: '#4fa8ff',
    description: 'Marca la conversación como "asignada a humano" y opcionalmente cierra la IA.',
    fields: [
      { key: 'departamento', label: 'Departamento', type: 'text', placeholder: 'ventas, soporte…' },
      { key: 'asignar_a',    label: 'Asignar a (miembro)', type: 'memberRef' },
      { key: 'disable_ai',   label: 'Apagar IA en esta conversación', type: 'toggle', default: true },
      { key: 'mensaje',      label: 'Mensaje al usuario', type: 'textarea',
        default: 'Te paso con un asesor humano. Un momento por favor.' },
    ],
    async exec(node, ctx) {
      const msg = interpolate(node.data?.mensaje || '', ctx.variables)
      if (msg.trim()) sendBotMsg(ctx, msg)
      if (node.data?.disable_ai !== false) {
        await updateConvo(ctx.accId, ctx.agId, ctx.convId, { aiEnabled: false })
      }
      // Try to find the member by id
      const memberId = node.data?.asignar_a
      let assignee = null
      if (memberId) {
        const members = ctx.account?.members || []
        const m = members.find(x => x.id === memberId)
        if (m) assignee = { id: m.id, name: m.name }
      }
      if (assignee) await setAssignedTo(ctx, assignee)
      logDebug(ctx, 'flow_run', `🙋 Transferido${assignee ? ' → ' + assignee.name : ''}`, { departamento: node.data?.departamento })
    },
  },

  // ── 2) Cola ─────────────────────────────────────────────────────────────
  // Marca la conv como "en cola" para un departamento — la UI puede filtrar por esto.
  {
    type: 'human_queue',
    category: 'human',
    label: 'Cola',
    icon: '🚦', color: '#4fa8ff',
    description: 'Pone la conversación en una cola hasta que un asesor la tome.',
    fields: [
      { key: 'cola', label: 'Nombre de la cola', type: 'text', placeholder: 'ventas_premium' },
      { key: 'prioridad', label: 'Prioridad', type: 'select', options: [
          { value: 'low', label: 'Baja' },
          { value: 'normal', label: 'Normal' },
          { value: 'high', label: 'Alta' },
        ], default: 'normal' },
    ],
    async exec(node, ctx) {
      logDebug(ctx, 'flow_run', `🚦 Cola: ${node.data?.cola} (prio: ${node.data?.prioridad})`, {})
      // Etiqueta visible en la conv para que el inbox la pueda agrupar/filtrar
      const cola = node.data?.cola
      if (cola) {
        await updateConvo(ctx.accId, ctx.agId, ctx.convId, { localVars: { ...ctx.variables, _queue: cola, _queue_priority: node.data?.prioridad } })
      }
    },
  },

  // ── 3) Ticket ───────────────────────────────────────────────────────────
  // Crea una task en el CRM marcada como "ticket" + asignada a un miembro.
  {
    type: 'human_ticket',
    category: 'human',
    label: 'Ticket',
    icon: '🎫', color: '#f5a623',
    description: 'Crea un ticket interno con prioridad y asignación.',
    fields: [
      { key: 'titulo',      label: 'Título', type: 'text' },
      { key: 'descripcion', label: 'Descripción', type: 'textarea' },
      { key: 'asignar_a',   label: 'Asignar a (miembro)', type: 'memberRef' },
      { key: 'prioridad',   label: 'Prioridad', type: 'select', options: [
          { value: 'low', label: 'Baja' },
          { value: 'normal', label: 'Normal' },
          { value: 'high', label: 'Alta' },
        ], default: 'normal' },
    ],
    async exec(node, ctx) {
      const title = interpolate(node.data?.titulo || '', ctx.variables) || 'Ticket sin título'
      const description = interpolate(node.data?.descripcion || '', ctx.variables)
      const memberId = node.data?.asignar_a
      let assignee = null
      if (memberId) {
        const m = (ctx.account?.members || []).find(x => x.id === memberId)
        if (m) assignee = m
      }
      await api.post(`/api/accounts/${ctx.accId}/crm/tasks`, {
        targetType: 'conversation', targetId: ctx.convId,
        title, description,
        priority: node.data?.prioridad || 'normal',
        assigneeId: assignee?.id || null, assigneeName: assignee?.name || '',
      })
      logDebug(ctx, 'flow_run', `🎫 Ticket creado: ${title}`, {})
    },
  },

  // ── 4) Nota Interna ─────────────────────────────────────────────────────
  {
    type: 'human_note',
    category: 'human',
    label: 'Nota interna',
    icon: '📝', color: '#7c6fff',
    description: 'Agrega una nota visible solo para el equipo en la conversación.',
    fields: [
      { key: 'texto', label: 'Texto', type: 'textarea', placeholder: '{{intent}} detectado · usuario molesto' },
    ],
    async exec(node, ctx) {
      const text = interpolate(node.data?.texto || '', ctx.variables)
      if (!text.trim()) return
      await api.post(`/api/accounts/${ctx.accId}/crm/notes`, {
        targetType: 'conversation', targetId: ctx.convId, content: text,
      })
      logDebug(ctx, 'flow_run', '📝 Nota interna añadida', { text: text.slice(0, 100) })
    },
  },

  // ── 5) Cerrar Caso ──────────────────────────────────────────────────────
  {
    type: 'human_close',
    category: 'human',
    label: 'Cerrar caso',
    icon: '✅', color: '#22d98a',
    description: 'Marca la conversación como cerrada y opcionalmente envía un mensaje de despedida.',
    fields: [
      { key: 'mensaje', label: 'Mensaje de cierre', type: 'textarea',
        default: 'Gracias por contactarnos. Que tengas un excelente día 👋' },
    ],
    async exec(node, ctx) {
      const msg = interpolate(node.data?.mensaje || '', ctx.variables)
      if (msg.trim()) sendBotMsg(ctx, msg)
      // Re-enables AI for future contacts but marks the current as resolved via a local var
      await updateConvo(ctx.accId, ctx.agId, ctx.convId, { localVars: { ...ctx.variables, _case_status: 'closed', _closed_at: Date.now() } })
      logDebug(ctx, 'flow_run', '✅ Caso cerrado', {})
    },
  },
]
