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
    description: 'Marca la conversación como "asignada a humano" y opcionalmente cierra la IA. Puede repartir entre varios asesores (round-robin).',
    fields: [
      { key: 'departamento', label: 'Departamento', type: 'text', placeholder: 'ventas, soporte…' },
      { key: 'asignar_modo', label: '¿A quién se asigna?', type: 'select', default: 'fijo',
        options: [
          { value: 'fijo',    label: 'Un asesor fijo' },
          { value: 'equipo',  label: 'Un equipo' },
          { value: 'lista',   label: 'Varios asesores' },
          { value: 'ninguno', label: 'Sin asignar' },
        ] },
      { key: 'asignar_a',        label: 'Asesor', type: 'memberRef',
        showIf: d => (d.asignar_modo || (d.asignar_a ? 'fijo' : 'fijo')) === 'fijo' },
      { key: 'asignar_equipo',   label: 'Equipo', type: 'teamRef',
        showIf: d => d.asignar_modo === 'equipo' },
      { key: 'asignar_miembros', label: 'Asesores', type: 'memberMulti',
        showIf: d => d.asignar_modo === 'lista' },
      { key: 'asignar_reparto',  label: 'Reparto', type: 'select', default: 'round_robin',
        showIf: d => d.asignar_modo === 'equipo' || d.asignar_modo === 'lista',
        options: [
          { value: 'round_robin', label: 'Round-robin (uno por turno)' },
          { value: 'todos',       label: 'Avisar a todos a la vez' },
        ] },
      { key: 'disable_ai',   label: 'Apagar IA en esta conversación', type: 'toggle', default: true },
      { key: 'mensaje_ia',   label: 'Que la IA redacte el mensaje', type: 'toggle', default: false,
        hint: 'La IA escribe el aviso usando el contexto real del chat. El texto de abajo se usa como indicación (y como respaldo si la IA falla).' },
      { key: 'mensaje',      label: 'Mensaje al usuario', type: 'textarea',
        default: 'Te paso con un asesor humano. Un momento por favor.' },
    ],
    async exec(node, ctx) {
      const d = node.data || {}
      // El reparto (y el mensaje redactado por IA) los resuelve el servidor: así el turno del
      // round-robin es el mismo para el motor del navegador y el del backend, y la API key
      // nunca sale al cliente. Compat: nodos antiguos con solo `asignar_a`.
      const cfg = {
        modo: d.asignar_modo || (d.asignar_a ? 'fijo' : 'ninguno'),
        asignar_a: d.asignar_a,
        equipoId: d.asignar_equipo,
        miembros: d.asignar_miembros,
        reparto: d.asignar_reparto || 'round_robin',
      }
      let assignee = null
      let aiMessage = null
      try {
        const r = await api.post(`/api/accounts/${ctx.accId}/flow/transfer-resolve`, {
          scope: `transfer:${ctx.flowId || 'flow'}:${node.id || 'node'}`,
          cfg, convId: ctx.convId, agId: ctx.agId,
          draft: !!d.mensaje_ia, extra: d.mensaje,
        })
        assignee = r?.assignees?.[0] || null
        aiMessage = r?.message || null
      } catch {
        // Sin servidor (o error): al menos respeta el asesor fijo configurado.
        const m = (ctx.account?.members || []).find(x => x.id === d.asignar_a)
        if (m) assignee = { id: m.id, name: m.name }
      }

      const msg = aiMessage || interpolate(d.mensaje || '', ctx.variables)
      if (msg.trim()) await sendBotMsg(ctx, msg)
      if (d.disable_ai !== false) {
        await updateConvo(ctx.accId, ctx.agId, ctx.convId, { aiEnabled: false })
      }
      if (assignee) await setAssignedTo(ctx, assignee)
      logDebug(ctx, 'flow_run', `🙋 Transferido${assignee ? ' → ' + assignee.name : ''}`, { departamento: d.departamento, modo: cfg.modo, redactadoPorIA: !!aiMessage })
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
      if (msg.trim()) await sendBotMsg(ctx, msg)
      // Marca resuelto y detiene recontactos (no recontactar un caso ya cerrado).
      await updateConvo(ctx.accId, ctx.agId, ctx.convId, { localVars: { ...ctx.variables, _case_status: 'closed', _closed_at: Date.now(), _recontact_stopped: '1' } })
      logDebug(ctx, 'flow_run', '✅ Caso cerrado', {})
    },
  },

  // ── 6) Detener recontactos ──────────────────────────────────────────────
  {
    type: 'recontact_stop',
    category: 'human',
    label: 'Detener recontactos',
    icon: '🛑', color: '#ff5f5f',
    description: 'Marca esta conversación para que NO se le envíen más recontactos automáticos (hasta que el cliente vuelva a escribir).',
    fields: [],
    async exec(node, ctx) {
      await updateConvo(ctx.accId, ctx.agId, ctx.convId, { localVars: { ...ctx.variables, _recontact_stopped: '1' } })
      logDebug(ctx, 'flow_run', '🛑 Recontactos detenidos en este chat', {})
    },
  },
]
