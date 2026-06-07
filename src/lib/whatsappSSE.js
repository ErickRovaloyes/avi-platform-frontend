import { processWhatsAppWebhook, processMessengerWebhook, processInstagramWebhook } from './webhookHandler'

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
    }

    eventSource.onmessage = async (e) => {
      if (!e.data || e.data.trim() === '' || e.data.startsWith(':')) return
      try {
        const data = JSON.parse(e.data)
        if (!data?.payload || !data.accId || !data.agentId) return

        const { type = 'whatsapp', accId, agentId, payload } = data
        console.log(`[AVI-SSE] Evento: tipo=${type} acc=${accId} ag=${agentId}`)

        if (type === 'whatsapp') {
          await processWhatsAppWebhook(accId, agentId, payload)
        } else if (type === 'messenger') {
          await processMessengerWebhook(accId, agentId, payload)
        } else if (type === 'instagram') {
          await processInstagramWebhook(accId, agentId, payload)
        }

        onNewMessageCb?.()
      } catch (err) {
        console.error('[AVI-SSE] Error procesando:', err)
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
