/**
 * Messenger Service — Facebook Messenger Cloud API
 * Send/receive messages via Meta Graph API v19
 */

const GRAPH_URL = 'https://graph.facebook.com/v19.0'

export async function sendMessengerText({ pageId, pageAccessToken, recipientId, text }) {
  const res = await fetch(`${GRAPH_URL}/me/messages?access_token=${pageAccessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`[Messenger] ${err?.error?.message || `HTTP ${res.status}`}`)
  }
  return res.json()
}

export function parseMessengerWebhook(body) {
  const messages = []
  for (const entry of body?.entry || []) {
    for (const event of entry?.messaging || []) {
      const text = event.message?.text || ''
      const attachments = event.message?.attachments || []
      // Take the first attachment that the server enriched with internal media
      const enriched = attachments.find(a => a._internalMedia)?._internalMedia || null
      if (!text && !enriched) continue
      messages.push({
        senderId: event.sender?.id,
        senderName: event.sender?.name || null,
        text,
        messageId: event.message?.mid,
        pageId: entry.id,
        timestamp: event.timestamp,
        internalMedia: enriched,
      })
    }
  }
  return messages
}

export async function validateMessengerConfig({ pageId, pageAccessToken }) {
  try {
    const res = await fetch(`${GRAPH_URL}/${pageId}?fields=name,category&access_token=${pageAccessToken}`)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { ok: false, error: err?.error?.message || `HTTP ${res.status}` }
    }
    const data = await res.json()
    return { ok: true, pageName: data.name, category: data.category }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
