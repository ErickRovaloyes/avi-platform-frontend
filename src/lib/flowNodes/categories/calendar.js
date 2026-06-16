/**
 * Calendar / Reservas — nodos que operan sobre el módulo de Calendarios.
 * En el navegador (pruebas/webchat) usan el endpoint público flow-op; en canales
 * reales corre la versión backend (services/bookings). Mismo contrato.
 */

import { interpolate, logDebug, setVarBoth, sendBotMsg } from '../common'
import { calendarFlowOp, getPublicCalendar } from '../../storage'

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function resolveDate(raw, vars) {
  const v = interpolate(raw || '', vars).trim().toLowerCase()
  const today = new Date().toISOString().slice(0, 10)
  if (!v || v === 'hoy' || v === 'today') return today
  if (['mañana', 'manana', 'tomorrow'].includes(v)) return addDays(today, 1)
  const m = v.match(/^\+(\d+)d$/); if (m) return addDays(today, parseInt(m[1], 10))
  return v.slice(0, 10)
}
function accIdOf(ctx) {
  const a = ctx.accId || ctx.variables?.__accId
  if (!a || a === 'sandbox-acc') throw new Error('Calendario no disponible en sandbox. Prueba en un chat real.')
  return a
}

export const calendarNodes = [
  {
    type: 'send_calendar', category: 'calendar', label: 'Enviar calendario',
    icon: '🗓', color: '#ff6eb4',
    description: 'Envía un botón con calendario para que el cliente agende. La reserva queda referenciada a este chat (sus notificaciones corren aquí).',
    fields: [
      { key: 'calendarId', label: 'Calendario', type: 'calendarRef' },
      { key: 'mensaje', label: 'Mensaje', type: 'textarea', default: 'Agenda tu cita en el siguiente enlace:' },
      { key: 'buttonText', label: 'Texto del botón', type: 'text', default: '📅 Agendar cita' },
    ],
    async exec(node, ctx) {
      const calendarId = interpolate(node.data?.calendarId || '', ctx.variables)
      if (!calendarId) throw new Error('Elige un calendario')
      const accId = accIdOf(ctx)
      const msg = interpolate(node.data?.mensaje || 'Agenda tu cita:', ctx.variables)
      const buttonText = interpolate(node.data?.buttonText || '📅 Agendar cita', ctx.variables)
      let cal = null
      try { cal = await getPublicCalendar(accId, calendarId) } catch { /* opcional */ }
      const origin = (typeof window !== 'undefined' && window.location?.origin) || ''
      const url = `${origin}/book/${accId}/${calendarId}?conv=${encodeURIComponent(ctx.convId)}`
      await sendBotMsg(ctx, `${msg}\n${url}`, {
        calendar: { accId, calId: calendarId, convId: ctx.convId, name: cal?.name || 'Calendario', color: cal?.color || '#7c6fff', buttonText, url, message: msg },
      })
      logDebug(ctx, 'flow_run', `🗓 Calendario enviado: ${cal?.name || calendarId}`, { url })
    },
  },
  {
    type: 'calendar_check', category: 'calendar', label: 'Consultar disponibilidad',
    icon: '🗓', color: '#ff6eb4',
    description: 'Devuelve los horarios libres de un calendario para una fecha.',
    fields: [
      { key: 'calendarId', label: 'Calendario', type: 'calendarRef' },
      { key: 'fecha', label: 'Fecha', type: 'text', default: 'hoy' },
      { key: 'duracion', label: 'Duración (min, opcional)', type: 'number' },
      { key: 'destino', label: 'Guardar horarios en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const calendarId = interpolate(node.data?.calendarId || '', ctx.variables)
      if (!calendarId) throw new Error('Elige un calendario')
      const date = resolveDate(node.data?.fecha, ctx.variables)
      const r = await calendarFlowOp(accIdOf(ctx), { op: 'availability', calendarId, date, duration: node.data?.duracion ? Number(node.data.duracion) : undefined })
      const slots = r?.slots || []
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, JSON.stringify(slots))
      ctx.variables._calendar_slots = slots
      ctx.variables._calendar_date = date
      logDebug(ctx, 'flow_run', `🗓 ${slots.length} horario(s) libres el ${date}`, { slots })
    },
  },
  {
    type: 'calendar_list_bookings', category: 'calendar', label: 'Consultar reservas',
    icon: '📋', color: '#ff6eb4',
    description: 'Devuelve las reservas de un calendario para una fecha.',
    fields: [
      { key: 'calendarId', label: 'Calendario', type: 'calendarRef' },
      { key: 'fecha', label: 'Fecha', type: 'text', default: 'hoy' },
      { key: 'destino', label: 'Guardar reservas en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const calendarId = interpolate(node.data?.calendarId || '', ctx.variables)
      if (!calendarId) throw new Error('Elige un calendario')
      const date = resolveDate(node.data?.fecha, ctx.variables)
      const r = await calendarFlowOp(accIdOf(ctx), { op: 'list', calendarId, date })
      const list = r?.bookings || []
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, JSON.stringify(list))
      ctx.variables._calendar_bookings = list
      logDebug(ctx, 'flow_run', `📋 ${list.length} reserva(s) el ${date}`, {})
    },
  },
  {
    type: 'calendar_book', category: 'calendar', label: 'Crear reserva',
    icon: '📅', color: '#ff6eb4',
    description: 'Crea una reserva en un horario disponible.',
    fields: [
      { key: 'calendarId', label: 'Calendario', type: 'calendarRef' },
      { key: 'fecha', label: 'Fecha', type: 'text', placeholder: '{{reserva_fecha}}' },
      { key: 'hora', label: 'Hora (HH:MM)', type: 'text', placeholder: '{{reserva_hora}}' },
      { key: 'duracion', label: 'Duración (min, opcional)', type: 'number' },
      { key: 'nombre', label: 'Nombre del cliente', type: 'text', placeholder: '{{cliente_nombre}}' },
      { key: 'telefono', label: 'Teléfono', type: 'text', placeholder: '{{cliente_telefono}}' },
      { key: 'email', label: 'Email', type: 'text', placeholder: '{{cliente_email}}' },
      { key: 'destino', label: 'Guardar ID de reserva en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const calendarId = interpolate(node.data?.calendarId || '', ctx.variables)
      if (!calendarId) throw new Error('Elige un calendario')
      const date = resolveDate(node.data?.fecha, ctx.variables)
      const time = interpolate(node.data?.hora || '', ctx.variables).slice(0, 5)
      const r = await calendarFlowOp(accIdOf(ctx), {
        op: 'create', calendarId, date, time,
        duration: node.data?.duracion ? Number(node.data.duracion) : undefined,
        client: {
          name: interpolate(node.data?.nombre || '', ctx.variables),
          phone: interpolate(node.data?.telefono || '', ctx.variables),
          email: interpolate(node.data?.email || '', ctx.variables),
          channel: 'flow',
        },
      })
      const bk = r?.booking
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, bk?.id || '')
      ctx.variables._last_booking_id = bk?.id
      logDebug(ctx, 'flow_run', `✅ Reserva ${bk?.id} · ${date} ${time}`, {})
    },
  },
  {
    type: 'calendar_reschedule', category: 'calendar', label: 'Reagendar reserva',
    icon: '🔁', color: '#ff6eb4',
    description: 'Cambia la fecha/hora de una reserva.',
    fields: [
      { key: 'bookingId', label: 'ID de la reserva', type: 'text', placeholder: '{{_last_booking_id}}' },
      { key: 'fecha', label: 'Nueva fecha', type: 'text' },
      { key: 'hora', label: 'Nueva hora (HH:MM)', type: 'text' },
      { key: 'destino', label: 'Guardar estado en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const bookingId = interpolate(node.data?.bookingId || '', ctx.variables)
      if (!bookingId) throw new Error('Falta el ID de la reserva')
      const date = resolveDate(node.data?.fecha, ctx.variables)
      const time = interpolate(node.data?.hora || '', ctx.variables).slice(0, 5)
      const r = await calendarFlowOp(accIdOf(ctx), { op: 'reschedule', bookingId, date, time })
      const st = r?.booking?.status || 'rescheduled'
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, st)
      ctx.variables._last_booking_status = st
      logDebug(ctx, 'flow_run', `🔁 Reserva ${bookingId} reagendada a ${date} ${time}`, {})
    },
  },
  {
    type: 'calendar_cancel', category: 'calendar', label: 'Cancelar reserva',
    icon: '🚫', color: '#ff5f5f',
    description: 'Cancela una reserva.',
    fields: [
      { key: 'bookingId', label: 'ID de la reserva', type: 'text', placeholder: '{{_last_booking_id}}' },
      { key: 'destino', label: 'Guardar confirmación en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const bookingId = interpolate(node.data?.bookingId || '', ctx.variables)
      if (!bookingId) throw new Error('Falta el ID de la reserva')
      const r = await calendarFlowOp(accIdOf(ctx), { op: 'cancel', bookingId })
      const st = r?.booking?.status || 'cancelled'
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, st)
      ctx.variables._last_booking_status = st
      logDebug(ctx, 'flow_run', `🚫 Reserva ${bookingId} cancelada`, {})
    },
  },
  {
    type: 'calendar_get', category: 'calendar', label: 'Obtener reserva',
    icon: '🔎', color: '#ff6eb4',
    description: 'Devuelve los datos completos de una reserva.',
    fields: [
      { key: 'bookingId', label: 'ID de la reserva', type: 'text', placeholder: '{{_last_booking_id}}' },
      { key: 'destino', label: 'Guardar datos (JSON) en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const bookingId = interpolate(node.data?.bookingId || '', ctx.variables)
      if (!bookingId) throw new Error('Falta el ID de la reserva')
      const r = await calendarFlowOp(accIdOf(ctx), { op: 'get', bookingId })
      const bk = r?.booking
      if (!bk) throw new Error('Reserva no encontrada')
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, JSON.stringify(bk))
      ctx.variables._last_booking = bk
      logDebug(ctx, 'flow_run', `🔎 Reserva ${bookingId} · ${bk.status}`, {})
    },
  },
]
