// Presencia de asesores en tiempo real vía socket.io.
// (Antes usaba BroadcastChannel, que solo veía pestañas del MISMO navegador;
// por eso nunca aparecían los demás asesores. Ahora usa el socket compartido.)

import { getSocket, connectSocket, getToken } from './api'

let sock = null
let currentConv = null
let currentUserId = null
let onChange = null
let listener = null

function dedupeByUser(users) {
  const seen = new Map()
  for (const u of users) if (u.userId && !seen.has(u.userId)) seen.set(u.userId, u)
  return [...seen.values()]
}

export function startPresence(accId, agId, convId, userId, userName, onChangeCallback) {
  stopPresence()
  sock = getSocket()
  if (!sock.connected && getToken()) connectSocket(getToken())
  currentConv = convId
  currentUserId = userId
  onChange = onChangeCallback

  listener = ({ convId: cid, users }) => {
    if (cid !== currentConv) return
    const others = dedupeByUser((users || []).filter(u => u.userId !== currentUserId))
    onChange?.(others)
  }
  sock.on('presence:list', listener)
  sock.emit('presence:join', { convId, userId, userName })
}

export function stopPresence() {
  if (sock) {
    if (currentConv) { try { sock.emit('presence:leave', { convId: currentConv }) } catch {} }
    if (listener) sock.off('presence:list', listener)
  }
  sock = null
  currentConv = null
  currentUserId = null
  onChange = null
  listener = null
}
