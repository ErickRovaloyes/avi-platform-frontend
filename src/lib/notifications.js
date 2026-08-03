/**
 * Notificaciones — persistidas en el BACKEND (tabla `notifications`, por cuenta + miembro).
 *
 * Antes vivían solo en localStorage: se perdían al limpiar la caché, no se sincronizaban
 * entre dispositivos y desaparecían al recargar. Ahora el navegador sigue detectando los
 * eventos (sockets) pero las guarda en el servidor.
 *
 * Shape de una notificación:
 * { id, type, prefKey?, icon, title, body, ts, read, link?, meta? }
 */
import { api } from './api'

export async function fetchNotifications(accId, limit = 100) {
  if (!accId) return []
  try {
    const r = await api.get(`/api/accounts/${accId}/notifications?limit=${limit}`)
    return Array.isArray(r?.notifications) ? r.notifications : []
  } catch { return [] }
}

// Crea la notificación. `dedupeKey` (opcional) evita duplicados cuando el mismo usuario
// tiene varias pestañas o dispositivos abiertos recibiendo el mismo evento.
export async function pushNotification(accId, notif) {
  if (!accId) return null
  try {
    const r = await api.post(`/api/accounts/${accId}/notifications`, notif || {})
    return r?.notification || null      // null si fue descartada por duplicada
  } catch { return null }
}

export async function markRead(accId, id) {
  if (!accId || !id) return
  try { await api.put(`/api/accounts/${accId}/notifications/${id}/read`, {}) } catch {}
}

export async function markAllRead(accId) {
  if (!accId) return
  try { await api.put(`/api/accounts/${accId}/notifications/read-all`, {}) } catch {}
}

export async function deleteNotification(accId, id) {
  if (!accId || !id) return
  try { await api.delete(`/api/accounts/${accId}/notifications/${id}`) } catch {}
}

export async function clearAll(accId) {
  if (!accId) return
  try { await api.delete(`/api/accounts/${accId}/notifications`) } catch {}
}

// Agrupa notificaciones por día
export function groupByDay(notifs) {
  const groups = []
  const map = new Map()
  for (const n of notifs) {
    const key = dayKey(n.ts)
    if (!map.has(key)) { map.set(key, { label: dayLabel(n.ts), items: [] }); groups.push(map.get(key)) }
    map.get(key).items.push(n)
  }
  return groups
}

function dayKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(ts) {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(d, today)) return 'Hoy'
  if (sameDay(d, yesterday)) return 'Ayer'
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate()
}
