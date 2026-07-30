// Preferencias de notificaciones por usuario (qué tipos y por qué canales).
// Se guardan en localStorage por (cuenta, usuario) —para el aviso in-app "Web"— y
// TAMBIÉN en el backend (members.notif_prefs) para que el servidor pueda enviar los
// correos según la preferencia de cada quien. El canal "Correo" viene APAGADO por
// defecto (opt-in): solo llega si el usuario lo activa por tipo.
import { api } from './api'

export const NOTIF_TYPES = [
  { key: 'message',  label: 'Mensaje nuevo',                 icon: '💬', desc: 'Cada vez que un cliente escribe en una conversación.' },
  { key: 'new_chat', label: 'Chat nuevo',                    icon: '🆕', desc: 'Cuando se abre una conversación nueva.', emailReady: true },
  { key: 'transfer', label: 'Transferencia a asesor (admin)', icon: '👤', desc: 'Cuando se te asigna/transfiere una conversación.', emailReady: true },
  { key: 'support',  label: 'Chat de soporte',               icon: '🎧', desc: 'Respuestas del equipo de soporte de AVI.' },
  { key: 'team',     label: 'Chat de equipo',                icon: '👥', desc: 'Mensajes en los canales del equipo.' },
  { key: 'internal', label: 'Chat interno (directo)',        icon: '🔒', desc: 'Mensajes directos (DM) de un compañero.' },
  { key: 'task',     label: 'Tareas (CRM)',                  icon: '✅', desc: 'Cuando se te asigna una tarea o está por vencer.', emailReady: true },
  { key: 'flow_error', label: 'Errores de flujo',            icon: '⚠️', desc: 'Cuando un flujo falla durante su ejecución.', emailReady: true },
]

export const NOTIF_CHANNELS = [
  { key: 'web',   label: 'Web',       icon: '🖥', ready: true },
  { key: 'email', label: 'Correo',    icon: '✉️', ready: true },
  { key: 'sms',   label: 'SMS',       icon: '📲', ready: false },
  { key: 'app',   label: 'App móvil', icon: '📱', ready: false },
]

// ¿El canal `channel` está disponible para el tipo `type`? (Web siempre; Correo solo
// en los tipos con entrega real en el backend; SMS/App aún no.)
export function channelAvailable(type, channel) {
  if (channel === 'email') return !!NOTIF_TYPES.find(t => t.key === type)?.emailReady
  return !!NOTIF_CHANNELS.find(c => c.key === channel)?.ready
}

// Mapeo de los `type` que ya emite la plataforma → clave de preferencia.
export const TYPE_TO_PREF = { message: 'message', new_chat: 'new_chat', crm: 'transfer', support: 'support', team: 'team', teamchat: 'team', internal: 'internal', task: 'task', flow_error: 'flow_error' }

const KEY = (accId, userId) => `avi_notif_prefs_${accId || 'x'}_${userId || 'x'}`

// Por defecto: todos los canales activados EXCEPTO Correo (opt-in). Sonido activado.
function defaults() {
  const d = {}
  for (const t of NOTIF_TYPES) {
    d[t.key] = { sound: true }
    for (const c of NOTIF_CHANNELS) d[t.key][c.key] = (c.key === 'email') ? false : true
  }
  return d
}

// Mezcla unas prefs guardadas con los defaults (tolera tipos/canales nuevos).
function mergePrefs(saved) {
  const base = defaults()
  if (!saved || typeof saved !== 'object') return base
  for (const t of NOTIF_TYPES) {
    for (const c of NOTIF_CHANNELS) {
      if (saved?.[t.key]?.[c.key] !== undefined) base[t.key][c.key] = !!saved[t.key][c.key]
    }
    if (saved?.[t.key]?.sound !== undefined) base[t.key].sound = !!saved[t.key].sound
  }
  return base
}

export function getNotifPrefs(accId, userId) {
  try {
    const raw = localStorage.getItem(KEY(accId, userId))
    if (!raw) return defaults()
    return mergePrefs(JSON.parse(raw))
  } catch { return defaults() }
}

export function saveNotifPrefs(accId, userId, prefs) {
  try { localStorage.setItem(KEY(accId, userId), JSON.stringify(prefs)) } catch {}
}

// Trae las prefs guardadas en el backend (cuenta activa) y las cachea en localStorage.
// Devuelve las prefs mezcladas, o null si el backend no tiene nada / falla.
export async function pullNotifPrefs(accId, userId) {
  try {
    const { prefs } = await api.get('/api/auth/me/notif-prefs')
    if (prefs && typeof prefs === 'object') {
      const merged = mergePrefs(prefs)
      saveNotifPrefs(accId, userId, merged)
      return merged
    }
    // El backend aún no tiene prefs → Correo es opt-in: fuerza email OFF para no
    // mostrar activado algo que el servidor no va a enviar (hasta que se guarde).
    const local = getNotifPrefs(accId, userId)
    for (const t of NOTIF_TYPES) if (local[t.key]) local[t.key].email = false
    saveNotifPrefs(accId, userId, local)
    return local
  } catch { return null }   // sin sesión/red → se usa lo que haya en localStorage
}

// Persiste las prefs en el backend (para que el servidor decida los envíos por correo).
export async function pushNotifPrefs(prefs) {
  try { await api.put('/api/auth/me/notif-prefs', { prefs }) } catch { /* best-effort */ }
}

// ¿Está habilitada la notificación de `type` por el canal `channel`?
export function isNotifEnabled(accId, userId, type, channel = 'web') {
  const prefKey = TYPE_TO_PREF[type] || type
  const prefs = getNotifPrefs(accId, userId)
  if (!prefs[prefKey]) return true // tipo desconocido → no bloquear
  if (channel === 'email') return prefs[prefKey].email === true // Correo es opt-in
  return prefs[prefKey][channel] !== false
}

// ¿Debe SONAR la notificación de `type`? (además de estar habilitada por Web).
export function isSoundEnabled(accId, userId, type) {
  const prefKey = TYPE_TO_PREF[type] || type
  const prefs = getNotifPrefs(accId, userId)
  if (!prefs[prefKey]) return true
  return prefs[prefKey].sound !== false
}
