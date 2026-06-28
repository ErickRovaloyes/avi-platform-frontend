// Preferencias de notificaciones por usuario (qué tipos y por qué canales).
// Se guardan en localStorage por (cuenta, usuario), igual que el tema/avatar del
// perfil. La columna "Web" se aplica ya (in-app); Correo/SMS/App se guardan y se
// aplicarán a medida que esos canales de entrega se integren.

export const NOTIF_TYPES = [
  { key: 'message',  label: 'Mensaje nuevo',                 icon: '💬', desc: 'Cada vez que un cliente escribe en una conversación.' },
  { key: 'new_chat', label: 'Chat nuevo',                    icon: '🆕', desc: 'Cuando se abre una conversación nueva.' },
  { key: 'transfer', label: 'Transferencia a asesor (admin)', icon: '👤', desc: 'Cuando se te asigna/transfiere una conversación.' },
  { key: 'support',  label: 'Chat de soporte',               icon: '🎧', desc: 'Respuestas del equipo de soporte de AVI.' },
  { key: 'team',     label: 'Chat de equipo',                icon: '👥', desc: 'Mensajes en los canales del equipo.' },
  { key: 'internal', label: 'Chat interno (directo)',        icon: '🔒', desc: 'Mensajes directos (DM) de un compañero.' },
]

export const NOTIF_CHANNELS = [
  { key: 'web',   label: 'Web',       icon: '🖥', ready: true },
  { key: 'email', label: 'Correo',    icon: '✉️', ready: false },
  { key: 'sms',   label: 'SMS',       icon: '📲', ready: false },
  { key: 'app',   label: 'App móvil', icon: '📱', ready: false },
]

// Mapeo de los `type` que ya emite la plataforma → clave de preferencia.
export const TYPE_TO_PREF = { message: 'message', new_chat: 'new_chat', crm: 'transfer', support: 'support', team: 'team', teamchat: 'team', internal: 'internal' }

const KEY = (accId, userId) => `avi_notif_prefs_${accId || 'x'}_${userId || 'x'}`

// Por defecto, todo activado.
function defaults() {
  const d = {}
  for (const t of NOTIF_TYPES) { d[t.key] = {}; for (const c of NOTIF_CHANNELS) d[t.key][c.key] = true }
  return d
}

export function getNotifPrefs(accId, userId) {
  try {
    const raw = localStorage.getItem(KEY(accId, userId))
    if (!raw) return defaults()
    const saved = JSON.parse(raw)
    // Mezcla con defaults para tolerar tipos/canales nuevos.
    const base = defaults()
    for (const t of NOTIF_TYPES) for (const c of NOTIF_CHANNELS) {
      if (saved?.[t.key]?.[c.key] !== undefined) base[t.key][c.key] = !!saved[t.key][c.key]
    }
    return base
  } catch { return defaults() }
}

export function saveNotifPrefs(accId, userId, prefs) {
  try { localStorage.setItem(KEY(accId, userId), JSON.stringify(prefs)) } catch {}
}

// ¿Está habilitada la notificación de `type` por el canal `channel`?
export function isNotifEnabled(accId, userId, type, channel = 'web') {
  const prefKey = TYPE_TO_PREF[type] || type
  const prefs = getNotifPrefs(accId, userId)
  if (!prefs[prefKey]) return true // tipo desconocido → no bloquear
  return prefs[prefKey][channel] !== false
}
