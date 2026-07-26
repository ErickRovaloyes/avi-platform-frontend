// Preferencia por usuario: mostrar u ocultar el copiloto flotante (bolita). Se guarda
// en localStorage (por usuario) y emite un evento para que el widget reaccione en vivo.

const KEY = uid => `avi_copilot_widget_${uid || 'x'}`
const EVT = 'avi:copilot-widget-pref'

export function getCopilotWidgetEnabled(userId) {
  try { const v = localStorage.getItem(KEY(userId)); return v === null ? true : v !== '0' } catch { return true }
}

export function setCopilotWidgetEnabled(userId, enabled) {
  try { localStorage.setItem(KEY(userId), enabled ? '1' : '0') } catch {}
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: { userId, enabled } })) } catch {}
}

export function onCopilotWidgetPrefChange(handler) {
  window.addEventListener(EVT, handler)
  return () => window.removeEventListener(EVT, handler)
}
