/**
 * Calendar / Bookings — all stubs for now. A real implementation requires
 * either an external calendar (Google/Outlook) or a dedicated bookings table.
 * The shape stays useful: when implemented, the contract here doesn't change.
 */

import { interpolate, logDebug, setVarBoth } from '../common'

const NEEDS_CALENDAR = '⚠ Esta funcionalidad requiere conectar un calendario (Google Calendar / Outlook) o una integración N8N que apunte a tu sistema de reservas. Disponible próximamente.'

export const calendarNodes = [
  {
    type: 'calendar_check',
    category: 'calendar',
    label: 'Consultar disponibilidad',
    icon: '🗓', color: '#ff6eb4',
    description: 'Busca slots disponibles en el calendario.',
    stub: true,
    fields: [
      { key: 'fecha_desde', label: 'Desde', type: 'text', default: '{{hoy}}' },
      { key: 'fecha_hasta', label: 'Hasta', type: 'text', default: '+7d' },
      { key: 'duracion_minutos', label: 'Duración (min)', type: 'number', default: 30 },
      { key: 'destino', label: 'Guardar slots en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      logDebug(ctx, 'flow_run', '🗓 calendar_check (stub)', node.data)
      // Fallback útil: si el usuario tiene un N8N integration tagged "calendar",
      // lo redirige; por ahora solo deja un placeholder.
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, '[]')
      throw new Error(NEEDS_CALENDAR)
    },
  },
  {
    type: 'calendar_book',
    category: 'calendar',
    label: 'Reservar',
    icon: '📅', color: '#ff6eb4',
    description: 'Crea una reserva en un slot.',
    stub: true,
    fields: [
      { key: 'slot',     label: 'Slot ISO', type: 'text' },
      { key: 'nombre',   label: 'Nombre del cliente', type: 'text' },
      { key: 'duracion', label: 'Duración (min)', type: 'number', default: 30 },
    ],
    async exec(_node, ctx) {
      logDebug(ctx, 'flow_run', '📅 calendar_book (stub)', {})
      throw new Error(NEEDS_CALENDAR)
    },
  },
  {
    type: 'calendar_reschedule',
    category: 'calendar',
    label: 'Reagendar',
    icon: '🔁', color: '#ff6eb4',
    description: 'Reagenda una reserva existente.',
    stub: true,
    fields: [
      { key: 'reservation_id', label: 'Reservation ID', type: 'text' },
      { key: 'nuevo_slot',     label: 'Nuevo slot ISO', type: 'text' },
    ],
    async exec(_node, ctx) {
      logDebug(ctx, 'flow_run', '🔁 calendar_reschedule (stub)', {})
      throw new Error(NEEDS_CALENDAR)
    },
  },
  {
    type: 'calendar_cancel',
    category: 'calendar',
    label: 'Cancelar',
    icon: '✕', color: '#ff5f5f',
    description: 'Cancela una reserva.',
    stub: true,
    fields: [{ key: 'reservation_id', label: 'Reservation ID', type: 'text' }],
    async exec(_node, ctx) {
      logDebug(ctx, 'flow_run', '✕ calendar_cancel (stub)', {})
      throw new Error(NEEDS_CALENDAR)
    },
  },
  {
    type: 'calendar_reminder',
    category: 'calendar',
    label: 'Recordatorio',
    icon: '🔔', color: '#ff6eb4',
    description: 'Programa un recordatorio antes de la cita.',
    stub: true,
    fields: [
      { key: 'reservation_id', label: 'Reservation ID', type: 'text' },
      { key: 'cuando_antes',   label: '¿Cuánto antes?', type: 'text', default: '1h' },
      { key: 'canal',          label: 'Canal', type: 'select', options: [
          { value: 'whatsapp', label: 'WhatsApp' },
          { value: 'email',    label: 'Email' },
          { value: 'sms',      label: 'SMS' },
        ], default: 'whatsapp' },
    ],
    async exec(_node, ctx) {
      logDebug(ctx, 'flow_run', '🔔 calendar_reminder (stub)', {})
      throw new Error(NEEDS_CALENDAR)
    },
  },
]
