// NOTA: el procesamiento de webhooks (ejecutar el flujo + responder por
// WhatsApp/Messenger/IG) ahora ocurre EN EL SERVIDOR. El navegador ya NO ejecuta
// flujos: solo escucha esta señal SSE para refrescar el inbox. Las actualizaciones
// finas en tiempo real llegan por socket.io (message:new / convos:updated).

let eventSource = null
let isActive = false
let reconnectTimer = null
let onNewMessageCb = null
let onStatusCb = null

const SERVER = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function startWhatsAppListener(onNewMessage, onStatus) {
  onNewMessageCb = onNewMessage
  onStatusCb = onStatus
  if (isActive && eventSource?.readyState === EventSource.OPEN) return
  isActive = true
  connect()
  console.log('[AVI-SSE] Listener iniciado →', SERVER)
}

export function stopWhatsAppListener() {
  isActive = false
  eventSource?.close()
  eventSource = null
  if (reconnectTimer) clearTimeout(reconnectTimer)
  console.log('[AVI-SSE] Listener detenido')
}

function connect() {
  try {
    eventSource = new EventSource(`${SERVER}/api/whatsapp/events`)

    eventSource.onopen = () => {
      console.log('[AVI-SSE] ✓ SSE conectado')
      onStatusCb?.('connected')
      // Sync conversation state after reconnect in case socket events were missed
      onNewMessageCb?.()
    }

    eventSource.onmessage = (e) => {
      if (!e.data || e.data.trim() === '' || e.data.startsWith(':')) return
      try {
        const data = JSON.parse(e.data)
        if (!data?.accId || !data.agentId) return
        const { type = 'whatsapp', accId, agentId } = data
        console.log(`[AVI-SSE] Señal: tipo=${type} acc=${accId} ag=${agentId} → refrescar inbox`)
        // El servidor ya procesó el webhook y respondió. Aquí solo refrescamos
        // el inbox (y emitimos notificación). El detalle en tiempo real viene por
        // socket.io. NO se ejecuta ningún flujo en el navegador.
        onNewMessageCb?.({ type: 'new_message' })
      } catch (err) {
        console.error('[AVI-SSE] Error procesando señal:', err)
      }
    }

    eventSource.onerror = () => {
      console.warn('[AVI-SSE] SSE error, reconectando en 4s...')
      onStatusCb?.('error')
      eventSource?.close()
      eventSource = null
      if (isActive) reconnectTimer = setTimeout(connect, 4000)
    }
  } catch (err) {
    console.error('[AVI-SSE] Error al crear SSE:', err)
  }
}

export function getServerUrl() { return SERVER }
