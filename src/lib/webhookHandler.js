/**
 * Webhook Handler — runs IN THE BROWSER
 * Processes WhatsApp, Messenger, and Instagram events forwarded via SSE.
 * accId and agentId are resolved server-side and passed here directly.
 */
import { createOrGetWhatsAppConvo, createOrGetMessengerConvo, createOrGetInstagramConvo, appendMsg, appendDebugEntry, readConvos, setLocalVar, recordTokenUsage } from './storage'
import { api } from './api'
import { parseWebhookPayload } from './whatsappService'
import { parseMessengerWebhook, sendMessengerText } from './messengerService'
import { parseInstagramWebhook, sendInstagramText } from './instagramService'
import { runTrigger, executeFlow } from './flowEngine'

// Cache of account data to avoid repeated fetches within a burst of messages
const accountCache = new Map()
async function fetchAccount(accId) {
  if (accountCache.has(accId)) return accountCache.get(accId)
  const data = await api.get(`/api/accounts/${accId}`)
  accountCache.set(accId, data)
  setTimeout(() => accountCache.delete(accId), 30000) // invalidate after 30s
  return data
}

// Dedup de mensajes entrantes por messageId. Defensa contra eventos SSE
// duplicados (p.ej. el mismo webhook recibido dos veces, o varias pestañas
// abiertas). Sin esto, un mensaje reprocesado vuelve a ejecutar el flujo y
// REENVÍA la respuesta al cliente real por WhatsApp/Messenger/IG.
const processedMessageIds = new Set()
function alreadyProcessed(messageId) {
  if (!messageId) return false
  if (processedMessageIds.has(messageId)) return true
  processedMessageIds.add(messageId)
  // Cap del tamaño — el Set mantiene orden de inserción, descartamos los más viejos
  if (processedMessageIds.size > 1000) {
    const oldest = processedMessageIds.values().next().value
    processedMessageIds.delete(oldest)
  }
  return false
}

// ─── WhatsApp ──────────────────────────────────────────────────────────────────

export async function processWhatsAppWebhook(accId, agentId, body) {
  const messages = parseWebhookPayload(body)
  console.log('[WebhookHandler] WA procesando', messages.length, 'mensaje(s)')

  const account = await fetchAccount(accId)
  const agent = account?.agents?.find(a => a.id === agentId)
  if (!agent) { console.warn('[WebhookHandler] Agente no encontrado:', agentId); return }

  for (const msg of messages) {
    if (!msg.text && !msg.internalMedia) continue
    if (alreadyProcessed(msg.messageId)) {
      console.log('[WebhookHandler] WA mensaje duplicado ignorado:', msg.messageId)
      continue
    }

    const channel = (agent.channels || []).find(
      ch => ch.type === 'whatsapp' && ch.status === 'connected' && ch.config?.phoneNumberId === msg.phoneNumberId
    ) || { id: 'whatsapp', name: 'WhatsApp', config: agent.whatsapp || {} }

    const convId = await createOrGetWhatsAppConvo(accId, agentId, msg.from, msg.fromName, channel?.id)

    await appendMsg(accId, agentId, convId, {
      role: 'user', sender: 'user',
      senderName: msg.fromName || msg.from,
      content: msg.text || msg.mediaCaption || '',
      ts: Date.now(),
      waMessageId: msg.messageId,
      channel: 'whatsapp', channelId: channel?.id,
      // Media metadata (already downloaded server-side; mediaId is internal)
      ...(msg.internalMedia ? {
        mediaId:   msg.internalMedia.mediaId,
        kind:      msg.internalMedia.kind,
        mime:      msg.internalMedia.mime,
        filename:  msg.internalMedia.filename,
        sizeBytes: msg.internalMedia.sizeBytes,
      } : {}),
    })
    await appendDebugEntry(accId, agentId, convId, {
      type: 'system',
      title: `📱 WhatsApp recibido de ${msg.fromName} [${channel?.name || 'WA'}]`,
      detail: { from: msg.from, text: msg.text.slice(0, 100), channelId: channel?.id },
    })

    const freshConvos = await readConvos(accId, agentId)
    const conv = freshConvos.find(c => c.id === convId)
    if (conv?.aiEnabled === false || conv?.flowRunning) continue

    // El flujo de entrada principal es el ÚNICO respondedor. Nunca se invoca la IA
    // directamente. Si no hay flujo, solo se corren flujos legacy por palabra clave.
    if (agent.fallbackFlowId) {
      await executeFlow({
        flowId: agent.fallbackFlowId, accId, agId: agentId, convId,
        triggerContext: { message: msg.text, _lastUserMessage: msg.text },
        outbound: async (text) => {
          if (channel?.config?.phoneNumberId && channel?.config?.accessToken) {
            const { sendWhatsAppText } = await import('./whatsappService')
            await sendWhatsAppText({
              phoneNumberId: channel.config.phoneNumberId,
              accessToken: channel.config.accessToken,
              to: msg.from, text,
            })
          }
        },
      })
    } else {
      await runTrigger({ trigger: 'keyword', accId, agId: agentId, convId, context: { message: msg.text } })
    }
  }
}

// ─── Messenger ─────────────────────────────────────────────────────────────────

export async function processMessengerWebhook(accId, agentId, body) {
  const messages = parseMessengerWebhook(body)
  console.log('[WebhookHandler] Messenger procesando', messages.length, 'mensaje(s)')

  const account = await fetchAccount(accId)
  const agent = account?.agents?.find(a => a.id === agentId)
  if (!agent) { console.warn('[WebhookHandler] Agente no encontrado:', agentId); return }

  for (const msg of messages) {
    if (!msg.text) continue
    if (alreadyProcessed(msg.messageId)) {
      console.log('[WebhookHandler] Messenger mensaje duplicado ignorado:', msg.messageId)
      continue
    }

    const channel = (agent.channels || []).find(
      ch => ch.type === 'messenger' && ch.status === 'connected' && ch.config?.pageId === msg.pageId
    )
    if (!channel) { console.warn('[WebhookHandler] Canal Messenger no encontrado para pageId:', msg.pageId); continue }

    const convId = await createOrGetMessengerConvo(accId, agentId, msg.senderId, msg.senderName, channel.id)

    await appendMsg(accId, agentId, convId, {
      role: 'user', sender: 'user',
      senderName: msg.senderName || `FB #${msg.senderId.slice(-4)}`,
      content: msg.text || '',
      ts: Date.now(),
      channel: 'messenger', channelId: channel.id,
      ...(msg.internalMedia ? {
        mediaId:   msg.internalMedia.mediaId,
        kind:      msg.internalMedia.kind,
        mime:      msg.internalMedia.mime,
        filename:  msg.internalMedia.filename,
        sizeBytes: msg.internalMedia.sizeBytes,
      } : {}),
    })
    await appendDebugEntry(accId, agentId, convId, {
      type: 'system',
      title: `💬 Messenger recibido [${channel.name}]`,
      detail: { from: msg.senderId, text: msg.text.slice(0, 100) },
    })

    const freshConvos = await readConvos(accId, agentId)
    const conv = freshConvos.find(c => c.id === convId)
    if (conv?.aiEnabled === false || conv?.flowRunning) continue

    // Solo el flujo de entrada principal responde — nunca la IA directamente.
    if (agent.fallbackFlowId) {
      await executeFlow({
        flowId: agent.fallbackFlowId, accId, agId: agentId, convId,
        triggerContext: { message: msg.text, _lastUserMessage: msg.text },
        outbound: async (text) => {
          await sendMessengerText({
            pageId: channel.config.pageId,
            pageAccessToken: channel.config.pageAccessToken,
            recipientId: msg.senderId, text,
          })
        },
      })
    } else {
      await runTrigger({ trigger: 'keyword', accId, agId: agentId, convId, context: { message: msg.text } })
    }
  }
}

// ─── Instagram ─────────────────────────────────────────────────────────────────

export async function processInstagramWebhook(accId, agentId, body) {
  const messages = parseInstagramWebhook(body)
  console.log('[WebhookHandler] Instagram procesando', messages.length, 'mensaje(s)')

  const account = await fetchAccount(accId)
  const agent = account?.agents?.find(a => a.id === agentId)
  if (!agent) { console.warn('[WebhookHandler] Agente no encontrado:', agentId); return }

  for (const msg of messages) {
    if (!msg.text) continue
    if (alreadyProcessed(msg.messageId)) {
      console.log('[WebhookHandler] Instagram mensaje duplicado ignorado:', msg.messageId)
      continue
    }

    const channel = (agent.channels || []).find(
      ch => ch.type === 'instagram' && ch.status === 'connected' && ch.config?.igAccountId === msg.igAccountId
    )
    if (!channel) { console.warn('[WebhookHandler] Canal Instagram no encontrado para igAccountId:', msg.igAccountId); continue }

    const convId = await createOrGetInstagramConvo(accId, agentId, msg.senderId, msg.senderName, channel.id)

    await appendMsg(accId, agentId, convId, {
      role: 'user', sender: 'user',
      senderName: msg.senderName || `IG #${msg.senderId.slice(-4)}`,
      content: msg.text || '',
      ts: Date.now(),
      channel: 'instagram', channelId: channel.id,
      ...(msg.internalMedia ? {
        mediaId:   msg.internalMedia.mediaId,
        kind:      msg.internalMedia.kind,
        mime:      msg.internalMedia.mime,
        filename:  msg.internalMedia.filename,
        sizeBytes: msg.internalMedia.sizeBytes,
      } : {}),
    })
    await appendDebugEntry(accId, agentId, convId, {
      type: 'system',
      title: `📸 Instagram recibido [${channel.name}]`,
      detail: { from: msg.senderId, text: msg.text.slice(0, 100) },
    })

    const freshConvos = await readConvos(accId, agentId)
    const conv = freshConvos.find(c => c.id === convId)
    if (conv?.aiEnabled === false || conv?.flowRunning) continue

    // Solo el flujo de entrada principal responde — nunca la IA directamente.
    if (agent.fallbackFlowId) {
      await executeFlow({
        flowId: agent.fallbackFlowId, accId, agId: agentId, convId,
        triggerContext: { message: msg.text, _lastUserMessage: msg.text },
        outbound: async (text) => {
          await sendInstagramText({
            igAccountId: channel.config.igAccountId,
            pageAccessToken: channel.config.pageAccessToken,
            recipientId: msg.senderId, text,
          })
        },
      })
    } else {
      await runTrigger({ trigger: 'keyword', accId, agId: agentId, convId, context: { message: msg.text } })
    }
  }
}
