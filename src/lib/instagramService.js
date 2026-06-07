/**
 * Instagram Service — Instagram Messaging API (via Meta Graph API v19)
 * Instagram Direct Messages for Business accounts.
 */

const GRAPH_URL = 'https://graph.facebook.com/v19.0'

export async function sendInstagramText({ igAccountId, pageAccessToken, recipientId, text }) {
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
    throw new Error(`[Instagram] ${err?.error?.message || `HTTP ${res.status}`}`)
  }
  return res.json()
}

export function parseInstagramWebhook(body) {
  const messages = []
  for (const entry of body?.entry || []) {
    // ── Messenger-style payload (entry.messaging with attachments) ────────
    for (const event of entry?.messaging || []) {
      const text = event.message?.text || ''
      const attachments = event.message?.attachments || []
      const enriched = attachments.find(a => a._internalMedia)?._internalMedia || null
      if (!text && !enriched) continue
      messages.push({
        senderId:   event.sender?.id,
        senderName: event.sender?.name || null,
        text,
        messageId:  event.message?.mid,
        igAccountId: entry.id,
        timestamp:  event.timestamp,
        internalMedia: enriched,
      })
    }
    // ── Changes-style payload (entry.changes with values.messages) ─────────
    for (const change of entry?.changes || []) {
      if (change.field !== 'messages') continue
      const value = change.value
      if (!value?.messages) continue
      for (const msg of value.messages) {
        const contact = (value.contacts || []).find(c => c.wa_id === msg.from)
        const text = msg.text?.body || msg.text || ''
        const internalMedia = msg._internalMedia || null
        if (!text && !internalMedia) continue
        messages.push({
          senderId:   msg.from,
          senderName: contact?.profile?.name || null,
          text,
          messageId:  msg.id,
          igAccountId: value.metadata?.phone_number_id || entry.id,
          timestamp:  msg.timestamp,
          internalMedia,
        })
      }
    }
  }
  return messages
}

export async function validateInstagramConfig({ igAccountId, pageAccessToken }) {
  try {
    const res = await fetch(`${GRAPH_URL}/${igAccountId}?fields=name,username&access_token=${pageAccessToken}`)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { ok: false, error: err?.error?.message || `HTTP ${res.status}` }
    }
    const data = await res.json()
    return { ok: true, name: data.name, username: data.username }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
