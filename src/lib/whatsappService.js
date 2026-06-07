/**
 * AVI Platform — WhatsApp Cloud API Service
 *
 * Supports two modes:
 *   api          — número dedicado solo a la API (sin app en teléfono)
 *   coexistence  — número también activo en WhatsApp Business app
 *                  (usa el mismo endpoint, Meta maneja la coexistencia internamente)
 *
 * Ambos modos usan exactamente la misma API de Meta (Graph API v18+).
 * La diferencia de "coexistencia" es un flag de registro en Meta Business Manager,
 * no en el código. Por eso el cliente es idéntico — Meta enruta los mensajes
 * a ambos destinos (app + API) automáticamente cuando está habilitada.
 */

const GRAPH_VERSION = 'v19.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

// ─── Send a text message ──────────────────────────────────────────────────────
export async function sendWhatsAppText({ phoneNumberId, accessToken, to, text }) {
  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  return res.json()
}

// ─── Send a template message ──────────────────────────────────────────────────
export async function sendWhatsAppTemplate({ phoneNumberId, accessToken, to, templateName, languageCode = 'es', components = [] }) {
  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: templateName, language: { code: languageCode }, components },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  return res.json()
}

// ─── Mark message as read ─────────────────────────────────────────────────────
export async function markAsRead({ phoneNumberId, accessToken, messageId }) {
  await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
  })
}

// ─── Verify webhook (GET) ─────────────────────────────────────────────────────
export function verifyWebhook(query, verifyToken) {
  const mode = query['hub.mode']
  const token = query['hub.verify_token']
  const challenge = query['hub.challenge']
  if (mode === 'subscribe' && token === verifyToken) return challenge
  return null
}

// ─── Parse incoming webhook payload ──────────────────────────────────────────
export function parseWebhookPayload(body) {
  const results = []
  try {
    const entry = body?.entry?.[0]
    const changes = entry?.changes || []
    for (const change of changes) {
      const value = change.value
      if (change.field !== 'messages') continue
      const messages = value?.messages || []
      const contacts = value?.contacts || []
      const metadata = value?.metadata || {}
      for (const msg of messages) {
        const contact = contacts.find(c => c.wa_id === msg.from)
        const mediaCaption = msg.image?.caption || msg.video?.caption || msg.document?.caption || ''
        results.push({
          type: msg.type, // text, image, audio, document, etc.
          from: msg.from, // sender phone number
          fromName: contact?.profile?.name || msg.from,
          to: metadata.display_phone_number,
          phoneNumberId: metadata.phone_number_id,
          messageId: msg.id,
          timestamp: msg.timestamp,
          text: msg.text?.body || mediaCaption || '',
          // For media types — Meta's media id (server-side downloaded already)
          metaMediaId: msg.image?.id || msg.audio?.id || msg.document?.id || msg.video?.id || msg.sticker?.id,
          mediaCaption,
          documentName: msg.document?.filename || '',
          // Internal media saved by the server before the webhook fired
          internalMedia: msg._internalMedia || null,
        })
      }
    }
  } catch (e) {
    console.error('parseWebhookPayload error:', e)
  }
  return results
}

// ─── Validate connection (test API token) ─────────────────────────────────────
export async function validateWhatsAppConfig({ phoneNumberId, accessToken, businessAccountId }) {
  try {
    const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,platform_type`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error?.message || `HTTP ${res.status}`)
    }
    const data = await res.json()
    return {
      ok: true,
      displayPhone: data.display_phone_number,
      verifiedName: data.verified_name,
      qualityRating: data.quality_rating,
      platformType: data.platform_type, // 'CLOUD_API' or 'ON_PREMISE'
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// ─── Register webhook subscription ───────────────────────────────────────────
export async function registerWebhook({ businessAccountId, accessToken, appId, webhookUrl, verifyToken }) {
  // This is done in Meta Business Manager, not via API call from client
  // We return the instructions instead
  return {
    manual: true,
    steps: [
      `1. Ve a Meta for Developers → Tu App → WhatsApp → Configuration`,
      `2. En "Webhook", haz clic en "Edit"`,
      `3. URL del webhook: ${webhookUrl}`,
      `4. Verify Token: ${verifyToken}`,
      `5. Suscríbete al campo: messages`,
      `6. Guarda y verifica`,
    ]
  }
}

// ─── Coexistence mode note ────────────────────────────────────────────────────
export const COEXISTENCE_INFO = {
  title: 'Modo Coexistencia',
  description: 'Permite usar el número simultáneamente en la app de WhatsApp Business y en esta plataforma.',
  requirements: [
    'El número debe estar registrado en Meta Business Manager',
    'Solicitar habilitación de "API Coexistence" en tu cuenta de WhatsApp Business API',
    'Una vez habilitado por Meta, la app del teléfono y la API funcionan en paralelo',
    'Los mensajes entrantes llegan a ambos: app y webhook de AVI Platform',
    'Los mensajes salientes desde AVI van solo por API (no aparecen en el teléfono)',
  ],
  apiNote: 'El código de integración es idéntico al modo Solo API. La coexistencia es un flag habilitado por Meta en tu cuenta, no una diferencia de implementación.',
}
