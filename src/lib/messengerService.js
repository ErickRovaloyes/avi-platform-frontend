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

function tokenHint(tok) {
  const t = String(tok || '')
  if (!t) return ' — El campo Page Access Token está VACÍO.'
  if (!t.startsWith('EAA')) return ` — Tu token NO empieza con "EAA" (empieza con "${t.slice(0, 6)}…", longitud ${t.length}). Debe ser un PAGE ACCESS TOKEN de Facebook. Parece que pegaste otra cosa (token de usuario, App Secret o App ID). Regenéralo en Graph API Explorer eligiendo tu PÁGINA.`
  return ` — Tu token empieza con "EAA" (longitud ${t.length}) pero Meta lo rechaza: puede estar EXPIRADO o incompleto. Genera uno nuevo (idealmente de larga duración) para la página.`
}

export async function validateMessengerConfig({ pageId, pageAccessToken }) {
  try {
    const res = await fetch(`${GRAPH_URL}/${pageId}?fields=name,category&access_token=${pageAccessToken}`)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      let msg = err?.error?.message || `HTTP ${res.status}`
      if (/parse|oauth|access token|expired|malformed|sesión|session/i.test(msg)) msg += tokenHint(pageAccessToken)
      return { ok: false, error: msg }
    }
    const data = await res.json()
    return { ok: true, pageName: data.name, category: data.category }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// Campos de webhook que la PÁGINA debe suscribir a la app (Messenger + IG). SIN esta
// suscripción de la página, Meta NO envía los mensajes entrantes. El 1-clic lo hace
// solo; en la conexión MANUAL hay que hacerlo aquí (al "Probar"), con el page token.
const PAGE_SUBSCRIBE_FIELDS = 'messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,messaging_referrals'

export async function subscribeMessengerPage({ pageId, pageAccessToken }) {
  if (!pageId || !pageAccessToken) return { ok: false, error: 'Falta Page ID o Page Access Token' }
  try {
    const res = await fetch(
      `${GRAPH_URL}/${pageId}/subscribed_apps?subscribed_fields=${PAGE_SUBSCRIBE_FIELDS}&access_token=${encodeURIComponent(pageAccessToken)}`,
      { method: 'POST' }
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.success === false) return { ok: false, error: data?.error?.message || `HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
