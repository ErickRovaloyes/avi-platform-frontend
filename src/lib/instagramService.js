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

// Diagnóstico del token: la Graph API de Facebook espera un Page Access Token (empieza
// con "EAA"). Si el error es de token, decimos por qué (vacío, tipo equivocado, etc.).
function tokenHint(tok) {
  const t = String(tok || '')
  if (!t) return ' — El campo Page Access Token está VACÍO.'
  if (!t.startsWith('EAA')) return ` — Tu token NO empieza con "EAA" (empieza con "${t.slice(0, 6)}…", longitud ${t.length}). Debe ser un PAGE ACCESS TOKEN de Facebook. Parece que pegaste otra cosa (token de usuario, App Secret, App ID o un token de Instagram Login). Regenéralo en Graph API Explorer eligiendo tu PÁGINA.`
  return ` — Tu token empieza con "EAA" (longitud ${t.length}) pero Meta lo rechaza: puede estar EXPIRADO o incompleto. Genera uno nuevo (idealmente de larga duración) para la página.`
}

export async function validateInstagramConfig({ igAccountId, pageAccessToken }) {
  try {
    const res = await fetch(`${GRAPH_URL}/${igAccountId}?fields=name,username&access_token=${pageAccessToken}`)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      let msg = err?.error?.message || `HTTP ${res.status}`
      if (/parse|oauth|access token|expired|malformed|sesión|session/i.test(msg)) msg += tokenHint(pageAccessToken)
      return { ok: false, error: msg }
    }
    const data = await res.json()
    return { ok: true, name: data.name, username: data.username }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
