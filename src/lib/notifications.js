/**
 * Notification storage — localStorage por cuenta.
 *
 * Shape de una notificación:
 * {
 *   id:      string,
 *   type:    'message' | 'flow' | 'crm' | 'system' | 'mention' | 'error',
 *   icon:    string (emoji),
 *   title:   string,
 *   body:    string,
 *   ts:      number (ms),
 *   read:    boolean,
 *   link?:   string (tab id para navegar),
 *   meta?:   object (datos adicionales según tipo),
 * }
 */

const KEY = (accId) => `avi_notifs_${accId}`
const CAP = 100  // máximo de notificaciones por cuenta

function read(accId) {
  if (!accId) return []
  try { return JSON.parse(localStorage.getItem(KEY(accId)) || '[]') } catch { return [] }
}
function write(accId, list) {
  try { localStorage.setItem(KEY(accId), JSON.stringify(list.slice(0, CAP))) } catch {}
}

export function getNotifications(accId) {
  return read(accId)
}

export function pushNotification(accId, notif) {
  if (!accId) return null
  const entry = {
    id:   'n_' + Math.random().toString(36).slice(2, 9),
    ts:   Date.now(),
    read: false,
    icon: '🔔',
    ...notif,
  }
  const list = read(accId)
  write(accId, [entry, ...list])
  return entry
}

export function markRead(accId, id) {
  const list = read(accId).map(n => n.id === id ? { ...n, read: true } : n)
  write(accId, list)
}

export function markAllRead(accId) {
  const list = read(accId).map(n => ({ ...n, read: true }))
  write(accId, list)
}

export function deleteNotification(accId, id) {
  write(accId, read(accId).filter(n => n.id !== id))
}

export function clearAll(accId) {
  try { localStorage.removeItem(KEY(accId)) } catch {}
}

export function unreadCount(accId) {
  return read(accId).filter(n => !n.read).length
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
