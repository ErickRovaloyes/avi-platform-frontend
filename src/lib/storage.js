import { api, getToken, setToken, clearToken, API_BASE } from './api.js'

export { getToken, setToken, clearToken, API_BASE }

// ── Suscripciones: tipos de cuenta, planes y suscripción por cuenta ─────────────
export async function listAccountTypes()                 { return api.get('/api/account-types') }
export async function createAccountType(payload)         { return api.post('/api/account-types', payload) }
export async function updateAccountType(id, payload)     { return api.put(`/api/account-types/${id}`, payload) }
export async function deleteAccountType(id)              { return api.delete(`/api/account-types/${id}`) }
export async function listSubscriptionPlans()            { return api.get('/api/subscription-plans') }
export async function createSubscriptionPlan(payload)    { return api.post('/api/subscription-plans', payload) }
export async function updateSubscriptionPlan(id, payload){ return api.put(`/api/subscription-plans/${id}`, payload) }
export async function deleteSubscriptionPlan(id)         { return api.delete(`/api/subscription-plans/${id}`) }
export async function getSubscriptionsOverview()         { return api.get('/api/admin/subscriptions/overview') }
export async function getCommercialMetrics()             { return api.get('/api/admin/subscriptions/commercial') }
export async function assistantGate(accId, convId)       { return api.get(`/api/public/assistant-gate/${accId}/${convId}`) }
// Antifraude Demo
export async function demoSignup(payload)                {
  const fd = new FormData()
  for (const [k, v] of Object.entries(payload)) { if (k !== 'document' && v != null && v !== '') fd.append(k, v) }
  if (payload.document) fd.append('document', payload.document, payload.document.name)
  return api.postForm('/api/public/demo-signup', fd)
}
// Solicita el código de verificación de correo para el registro Demo. Devuelve
// { skip:true } si la verificación no está activa (el frontend continúa directo),
// o { sent:true } si se envió un código.
export async function demoRequestSignupCode(email)       { return api.post('/api/public/demo-signup/request-code', { email }) }
export function demoTemplateUrl()                        { return `${API_BASE}/api/public/demo-template` }
export async function getDemoDashboard()                 { return api.get('/api/admin/demo/dashboard') }
export async function listDemoRegistrations(params = {}) { const qs = new URLSearchParams(params).toString(); return api.get(`/api/admin/demo/registrations${qs ? '?' + qs : ''}`) }
export async function getDemoOverrides()                 { return api.get('/api/admin/demo/overrides') }
export async function allowDemo(payload)                 { return api.post('/api/admin/demo/allow', payload) }
export async function removeDemoOverride(id)             { return api.delete(`/api/admin/demo/overrides/${id}`) }
export async function setDemoIpRestriction(enabled)      { return api.post('/api/admin/demo/ip-restriction', { enabled }) }
// Configuración de Demo: interruptor de registro + plantilla de descubrimiento
export async function getDemoStatus()                    { return api.get('/api/public/demo-status') }
export async function getDemoRegistration()              { return api.get('/api/admin/demo/registration') }
export async function setDemoRegistration(enabled)       { return api.post('/api/admin/demo/registration', { enabled }) }
export async function listDemoTemplates()                { return api.get('/api/admin/demo/templates') }
export async function uploadDemoTemplate(file, name)     { const fd = new FormData(); fd.append('file', file, file.name); if (name) fd.append('name', name); return api.postForm('/api/admin/demo/templates', fd) }
export async function activateDemoTemplate(id)           { return api.post(`/api/admin/demo/templates/${id}/activate`, {}) }
export async function deleteDemoTemplate(id)             { return api.delete(`/api/admin/demo/templates/${id}`) }
export async function downloadDemoTemplate(id, filename) {
  const res = await fetch(`${API_BASE}/api/admin/demo/templates/${id}/download`, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!res.ok) throw new Error('No se pudo descargar')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename || 'plantilla'
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}
export async function getAccountSubscription(accId)      { return api.get(`/api/accounts/${accId}/subscription`) }
export async function assignAccountSubscription(accId, payload) { return api.put(`/api/accounts/${accId}/subscription`, payload) }
export async function subscriptionAction(accId, type, value) { return api.post(`/api/accounts/${accId}/subscription/action`, { type, value }) }
// Módulos override por cuenta (superadmin). `modules` = array de ids habilitados, o null = heredar del tipo / todos.
export async function updateAccountModules(accId, modules) { return api.put(`/api/superadmin/accounts/${accId}`, { modules }) }
export async function saUpdateAccount(accId, payload)     { return api.put(`/api/superadmin/accounts/${accId}`, payload) }

// ── API keys (API pública entrante) ───────────────────────────────────────────
export async function listApiKeys(accId)                 { return api.get(`/api/accounts/${accId}/api-keys`) }
export async function createApiKey(accId, payload)       { return api.post(`/api/accounts/${accId}/api-keys`, payload) }
export async function deleteApiKey(accId, id)            { return api.delete(`/api/accounts/${accId}/api-keys/${id}`) }

// ── CRM Contacts ──────────────────────────────────────────────────────────────
export async function listContacts(accId)              { return api.get(`/api/accounts/${accId}/contacts`) }
export async function createContact(accId, payload)    { return api.post(`/api/accounts/${accId}/contacts`, payload) }
export async function updateContact(accId, id, p)      { return api.put(`/api/accounts/${accId}/contacts/${id}`, p) }
export async function deleteContact(accId, id)         { return api.delete(`/api/accounts/${accId}/contacts/${id}`) }
export async function getContact(accId, id)            { return api.get(`/api/accounts/${accId}/contacts/${id}`) }
export async function listContactConversations(accId, contactId) { return api.get(`/api/accounts/${accId}/contacts/${contactId}/conversations`) }
export async function importContacts(accId, contacts, dedupeByPhone = true) { return api.post(`/api/accounts/${accId}/contacts/import`, { contacts, dedupeByPhone }) }
// Mensajes masivos (campañas)
export async function listCampaigns(accId)               { return api.get(`/api/accounts/${accId}/campaigns`) }
export async function previewCampaign(accId, audience)   { return api.post(`/api/accounts/${accId}/campaigns/preview`, { audience }) }
export async function createCampaign(accId, payload)     { return api.post(`/api/accounts/${accId}/campaigns`, payload) }
export async function updateCampaign(accId, id, payload) { return api.put(`/api/accounts/${accId}/campaigns/${id}`, payload) }
export async function sendCampaign(accId, id)            { return api.post(`/api/accounts/${accId}/campaigns/${id}/send`, {}) }
export async function resendCampaign(accId, id)          { return api.post(`/api/accounts/${accId}/campaigns/${id}/resend`, {}) }
export async function cancelCampaign(accId, id)          { return api.post(`/api/accounts/${accId}/campaigns/${id}/cancel`, {}) }
export async function deleteCampaign(accId, id)          { return api.delete(`/api/accounts/${accId}/campaigns/${id}`) }

// Filtros guardados del inbox (global/personal)
export async function listSavedFilters(accId)            { return api.get(`/api/accounts/${accId}/saved-filters`) }
export async function createSavedFilter(accId, payload)  { return api.post(`/api/accounts/${accId}/saved-filters`, payload) }
export async function deleteSavedFilter(accId, id)       { return api.delete(`/api/accounts/${accId}/saved-filters/${id}`) }

// ── WhatsApp templates (HSM aprobadas por Meta) ─────────────────────────────────
export async function listWhatsAppTemplates(accId, agentId, channelId) {
  const qs = channelId ? `?channelId=${encodeURIComponent(channelId)}` : ''
  return api.get(`/api/whatsapp/${accId}/${agentId}/templates${qs}`)
}
// Todas las plantillas con su estado (para la pestaña de gestión en Canales).
export async function listWhatsAppTemplatesAll(accId, agentId, channelId) {
  const qs = channelId ? `?channelId=${encodeURIComponent(channelId)}` : ''
  return api.get(`/api/whatsapp/${accId}/${agentId}/templates/all${qs}`)
}
export async function createWhatsAppTemplate(accId, agentId, payload) {
  return api.post(`/api/whatsapp/${accId}/${agentId}/templates`, payload)
}
export async function updateWhatsAppTemplate(accId, agentId, payload) {
  return api.put(`/api/whatsapp/${accId}/${agentId}/templates`, payload)
}
export async function deleteWhatsAppTemplate(accId, agentId, name, channelId) {
  const qs = `?name=${encodeURIComponent(name)}${channelId ? `&channelId=${encodeURIComponent(channelId)}` : ''}`
  return api.delete(`/api/whatsapp/${accId}/${agentId}/templates${qs}`)
}
export async function sendWhatsAppTemplate(accId, agentId, payload) {
  return api.post(`/api/whatsapp/${accId}/${agentId}/send-template`, payload)
}

// ── CRM (notes, tasks, activity, kpis) ────────────────────────────────────────
export async function crmListNotes(accId, { targetType, targetId } = {}) {
  const qs = new URLSearchParams()
  if (targetType) qs.set('targetType', targetType)
  if (targetId)   qs.set('targetId', targetId)
  return api.get(`/api/accounts/${accId}/crm/notes?${qs}`)
}
export async function crmCreateNote(accId, payload)  { return api.post(`/api/accounts/${accId}/crm/notes`, payload) }
export async function crmDeleteNote(accId, id)       { return api.delete(`/api/accounts/${accId}/crm/notes/${id}`) }

export async function crmListTasks(accId, { targetType, targetId, assigneeId, status } = {}) {
  const qs = new URLSearchParams()
  if (targetType) qs.set('targetType', targetType)
  if (targetId)   qs.set('targetId', targetId)
  if (assigneeId) qs.set('assigneeId', assigneeId)
  if (status)     qs.set('status', status)
  return api.get(`/api/accounts/${accId}/crm/tasks?${qs}`)
}
export async function crmCreateTask(accId, payload)  { return api.post(`/api/accounts/${accId}/crm/tasks`, payload) }
export async function crmUpdateTask(accId, id, p)    { return api.put(`/api/accounts/${accId}/crm/tasks/${id}`, p) }
export async function crmDeleteTask(accId, id)       { return api.delete(`/api/accounts/${accId}/crm/tasks/${id}`) }

export async function crmListActivity(accId, { targetType, targetId, limit } = {}) {
  const qs = new URLSearchParams()
  if (targetType) qs.set('targetType', targetType)
  if (targetId)   qs.set('targetId', targetId)
  if (limit)      qs.set('limit', String(limit))
  return api.get(`/api/accounts/${accId}/crm/activity?${qs}`)
}
export async function crmKpis(accId, { from, to } = {}) {
  const qs = new URLSearchParams()
  if (from) qs.set('from', String(from))
  if (to)   qs.set('to', String(to))
  return api.get(`/api/accounts/${accId}/crm/kpis?${qs}`)
}

// ── Quick replies (saved responses) ────────────────────────────────────────────
export async function listQuickReplies(accId)            { return api.get(`/api/accounts/${accId}/quick-replies`) }
export async function createQuickReply(accId, payload)   { return api.post(`/api/accounts/${accId}/quick-replies`, payload) }
export async function updateQuickReply(accId, id, p)     { return api.put(`/api/accounts/${accId}/quick-replies/${id}`, p) }
export async function deleteQuickReply(accId, id)        { return api.delete(`/api/accounts/${accId}/quick-replies/${id}`) }

// ── Media helpers ──────────────────────────────────────────────────────────────
// Direct URL to the raw bytes — works in <img>/<audio>/<video> tags.
export function mediaUrl(accId, mediaId) {
  return `${API_BASE}/api/media/${accId}/${mediaId}/raw`
}
// Generic upload for team chat / support (no conversation thread).
// Returns { mediaId, kind, mime, filename, sizeBytes }
export async function uploadChatMedia(accId, file, context = 'chat', filename) {
  const fd = new FormData()
  fd.append('file', file, filename || file.name || 'media')
  if (context) fd.append('context', context)
  return api.postForm(`/api/media/${accId}/upload`, fd)
}

// Upload a File/Blob, returns { id, mediaId, kind, mime, filename, sizeBytes, ts }
export async function uploadMedia(accId, agId, convId, file, { sender = 'human', senderName = '', caption = '', filename, kind, transcription } = {}) {
  const fd = new FormData()
  // Pass an explicit filename when the Blob has none (e.g. recorded audio)
  fd.append('file', file, filename || file.name || 'media')
  if (sender)        fd.append('sender', sender)
  if (senderName)    fd.append('senderName', senderName)
  if (caption)       fd.append('caption', caption)
  if (kind)          fd.append('kind', kind)
  // Transcripción ya calculada en la vista previa (audios salientes del asesor).
  if (transcription) fd.append('transcription', transcription)
  return api.postForm(`/api/conversations/${accId}/${agId}/${convId}/media`, fd)
}

// ── Constants ──────────────────────────────────────────────────────────────────
export const K = {
  webchatSession: (agId, chId) => `avi_ws_${agId}_${chId}`,
  lastVisited:    'avi_last_visited',
}

export const DEFAULT_CHANNEL_LIMITS = {
  free:       { webchat: 1,  test: 1,  whatsapp: 0, messenger: 0, instagram: 0 },
  starter:    { webchat: 3,  test: 2,  whatsapp: 1, messenger: 1, instagram: 1 },
  pro:        { webchat: 10, test: 5,  whatsapp: 3, messenger: 3, instagram: 3 },
  enterprise: { webchat: -1, test: -1, whatsapp: -1, messenger: -1, instagram: -1 },
}

// ── Utilities ──────────────────────────────────────────────────────────────────
export function uid()    { return Math.random().toString(36).slice(2, 10) }
export function linkId() { return Math.random().toString(36).slice(2, 9) }

// ── Session (JWT-backed) ───────────────────────────────────────────────────────
function decodeJwt(token) {
  try { return JSON.parse(atob(token.split('.')[1])) } catch { return null }
}

export function getSession() {
  const token = getToken()
  if (!token) return null
  const p = decodeJwt(token)
  if (!p) return null
  return {
    type:            p.type,
    id:              p.id,
    name:            p.name,
    email:           p.email,
    photo:           p.photo || null,
    accountId:       p.accountId,
    accountName:     p.accountName,
    allAccountIds:   p.allAccountIds || [],
    roleId:          p.roleId,
    permissions:     p.permissions || {},
    agentAccess:     p.agentAccess || [],
    isImpersonating: p.isImpersonating || false,
  }
}

export function clearSession() { clearToken() }

// ── Auth ───────────────────────────────────────────────────────────────────────
// El backend valida super admin Y miembro en el mismo endpoint. Devuelve la data
// cruda: { token, session } en éxito, o { twoFactorRequired, email } si el 2FA
// está activo. Guarda el token solo cuando llega.
export async function loginApi(email, password) {
  const data = await api.post('/api/auth/login', { email, password })
  if (data?.token) setToken(data.token)
  return data
}
// Compat: usadas por AuthContext. Ambas apuntan al mismo login.
export async function loginSuperAdmin(email, password) { return loginApi(email, password) }
export async function loginMember(email, password) { return loginApi(email, password) }

// Segundo paso del 2FA de login.
export async function verify2faApi(email, password, code) {
  const data = await api.post('/api/auth/2fa/verify', { email, password, code })
  if (data?.token) setToken(data.token)
  return data.session
}
export async function resend2faApi(email, password) {
  return api.post('/api/auth/2fa/resend', { email, password })
}

export async function switchAccountSession(accountId) {
  const data = await api.post('/api/auth/switch', { accountId })
  setToken(data.token)
  return data.session
}

export async function impersonateAccount(accountId) {
  const data = await api.post('/api/auth/impersonate', { accountId })
  setToken(data.token)
  return data.session
}

export async function refreshSession() {
  const data = await api.post('/api/auth/refresh', {})
  setToken(data.token)
  return data.session
}

// Tema de chat predeterminado de la cuenta (aplica a todos sus usuarios).
export async function saveAccountChatTheme(accId, chatTheme) { return api.put(`/api/accounts/${accId}`, { chatTheme }) }
// Actualiza datos de la cuenta (owner): p. ej. { name }.
export async function updateAccountApi(accId, payload) { return api.put(`/api/accounts/${accId}`, payload) }
// Historial de cambios de nombre (super admin).
export async function getAccountNameHistory(accId) { return api.get(`/api/superadmin/accounts/${accId}/name-history`) }

// Uso/cuota de almacenamiento del CMS (bytes) según el plan de la cuenta.
export async function getCmsUsage(accId) { return api.get(`/api/accounts/${accId}/cms-usage`) }

// Autoservicio: edita el propio perfil (nombre, correo, foto, contraseña).
export async function updateMyProfile(payload) {
  const data = await api.put('/api/auth/me', payload)
  setToken(data.token)
  return data.session
}

// ── Conversations ──────────────────────────────────────────────────────────────
export async function readConvos(accId, agId) {
  return api.get(`/api/conversations/${accId}/${agId}`)
}

// ── Tienda WooCommerce ──────────────────────────────────────────────────────────
// Config (autenticado, owner). El proxy de productos/pedidos es público (lo usa el
// webchat-en-navegador) y NUNCA expone las llaves (viven en el servidor).
export async function getWooConfig(accId)            { return api.get(`/api/woocommerce/${accId}/config`) }
export async function saveWooConfig(accId, cfg)      { return api.put(`/api/woocommerce/${accId}/config`, cfg) }
export async function testWooConnection(accId)       { return api.post(`/api/woocommerce/${accId}/test`, {}) }
export async function wooSearchProducts(accId, query, limit = 8) { return api.post(`/api/woocommerce/${accId}/products`, { query, limit }) }
export async function wooCreateOrder(accId, payload) { return api.post(`/api/woocommerce/${accId}/order`, payload) }

// ── Agenda (citas) ──────────────────────────────────────────────────────────────
export async function getSchedulingConfig(accId)        { return api.get(`/api/scheduling/${accId}/config`) }
export async function saveSchedulingConfig(accId, cfg)  { return api.put(`/api/scheduling/${accId}/config`, cfg) }
export async function schedulingToolCall(accId, fn, args, convId, agId) { return api.post(`/api/scheduling/${accId}/tool`, { fn, args, convId, agId }) }

// ── Pasarela de pago ──────────────────────────────────────────────────────────────
export async function getPaymentsConfig(accId)        { return api.get(`/api/payments/${accId}/config`) }
export async function savePaymentsConfig(accId, cfg)  { return api.put(`/api/payments/${accId}/config`, cfg) }
export async function testPaymentsConnection(accId)   { return api.post(`/api/payments/${accId}/test`, {}) }
export async function paymentsCreateLink(accId, payload) { return api.post(`/api/payments/${accId}/link`, payload) }
export async function paymentsStatus(accId, convId)   { return api.post(`/api/payments/${accId}/status`, { convId }) }

export async function createConvo(accId, agId, channelId, guestName, guestId, channelType = 'webchat', origin = null) {
  const data = await api.post(`/api/conversations/${accId}/${agId}`, { channelId, guestName, guestId, channelType, origin })
  return data.id
}

// Clasifica el ORIGEN del lead a partir de los parámetros de la URL del webchat
// (UTM, gclid de Google, fbclid de Meta, id de anuncio) y del link de entrada.
// Devuelve un objeto normalizado { type, platform, adId, campaign, ... } o null
// si no hay ninguna señal (entonces el backend deriva link/directo).
export function classifyWebchatOrigin(searchParams, linkId) {
  const get = k => { try { return searchParams.get(k) || null } catch { return null } }
  const source   = get('utm_source')
  const medium   = get('utm_medium')
  const campaign = get('utm_campaign')
  const term     = get('utm_term')
  const content  = get('utm_content')
  const gclid    = get('gclid') || get('gbraid') || get('wbraid')
  const fbclid   = get('fbclid')
  const adId     = get('ad_id') || get('adid') || get('utm_ad') || get('hsa_ad') || content
  const s        = (source || '').toLowerCase()

  let platform = null
  if (gclid || /google|adwords|youtube|gdn/.test(s)) platform = 'google'
  else if (fbclid || /facebook|fb|meta|instagram|^ig$/.test(s)) platform = 'meta'

  const paidMedium = /cpc|ppc|paid|ads?/.test((medium || '').toLowerCase())
  const isAd = !!(gclid || fbclid || adId || (platform && paidMedium))

  let type = 'direct'
  if (isAd) type = 'ad'
  else if (source || medium || campaign) type = 'campaign'
  else if (linkId) type = 'link'

  const hasSignal = source || medium || campaign || gclid || fbclid || adId
  if (!hasSignal) return null
  return { type, platform, adId, campaign, source, medium, term, content,
    clickId: gclid || fbclid || null, linkId: linkId || null }
}

export async function appendMsg(accId, agId, convId, msg) {
  return api.post(`/api/conversations/${accId}/${agId}/${convId}/messages`, msg)
}

// Pide al servidor actualizar la MEMORIA persistente del cliente (resumen +
// estado) tras una respuesta del asistente. Fire-and-forget: no bloquea el chat.
export async function updateConversationMemory(accId, agId, convId) {
  return api.post(`/api/conversations/${accId}/${agId}/${convId}/memory`, {})
}

// Envío manual del asesor: el backend lo entrega al canal real (WhatsApp/
// Messenger/IG) y lo persiste. En webchat solo persiste.
export async function sendManualMessage(accId, agId, convId, text, senderName, replyToId) {
  return api.post(`/api/conversations/${accId}/${agId}/${convId}/send-manual`, { text, senderName, replyToId })
}

export async function updateConvo(accId, agId, convId, updates) {
  return api.put(`/api/conversations/${accId}/${agId}/${convId}`, updates)
}

export async function appendDebugEntry(accId, agId, convId, entry) {
  try { return await api.post(`/api/conversations/${accId}/${agId}/${convId}/debug`, entry) } catch { /* non-critical */ }
}

export async function setLocalVar(accId, agId, convId, varId, value) {
  return api.patch(`/api/conversations/${accId}/${agId}/${convId}/vars`, { varId, value })
}

export async function generateGuest() {
  return api.post('/api/conversations/guest', {})
}

// ── IA sobre media (transcripción de audio, análisis de imagen/archivo) ──────────
export async function transcribeMedia(accId, { mediaId, model, language } = {}) {
  return api.post(`/api/accounts/${accId}/ai/transcribe`, { mediaId, model, language })
}
// Transcribe un audio aún no enviado (vista previa): manda los bytes en base64.
export async function transcribeBlob(accId, { dataBase64, mime, filename, model, language } = {}) {
  return api.post(`/api/accounts/${accId}/ai/transcribe-blob`, { dataBase64, mime, filename, model, language })
}
export async function analyzeMedia(accId, { mediaId, model, prompt } = {}) {
  return api.post(`/api/accounts/${accId}/ai/analyze-media`, { mediaId, model, prompt })
}

// ── Social channel create-or-get ───────────────────────────────────────────────
export async function createOrGetWhatsAppConvo(accId, agentId, waFrom, waName, channelId = null) {
  const data = await api.post(`/api/conversations/${accId}/${agentId}/social`, { type: 'whatsapp', from: waFrom, name: waName, channelId })
  return data.id
}

export async function createOrGetMessengerConvo(accId, agentId, senderId, senderName, channelId) {
  const data = await api.post(`/api/conversations/${accId}/${agentId}/social`, { type: 'messenger', from: senderId, name: senderName, channelId })
  return data.id
}

export async function createOrGetInstagramConvo(accId, agentId, senderId, senderName, channelId) {
  const data = await api.post(`/api/conversations/${accId}/${agentId}/social`, { type: 'instagram', from: senderId, name: senderName, channelId })
  return data.id
}

// ── RAG helpers ────────────────────────────────────────────────────────────────
export async function readRagChunks(accId, agId) {
  return api.get(`/api/rag/${accId}/${agId}`)
}
// Recuperación SERVER-SIDE: devuelve solo el contexto top-K (pequeño). Úsalo en
// el motor de chat — NO descargues todos los chunks/embeddings al navegador.
export async function getRagContext(accId, agId, query, fileIds) {
  try { const r = await api.post(`/api/rag/context/${accId}/${agId}`, { query, fileIds: Array.isArray(fileIds) ? fileIds : undefined }); return r?.context || '' }
  catch { return '' }
}

export async function writeRagChunks(accId, agId, chunks) {
  return api.put(`/api/rag/${accId}/${agId}`, { chunks })
}

export async function deleteRagFileChunks(accId, agId, fileId) {
  return api.delete(`/api/rag/${accId}/${agId}/${fileId}`)
}

export async function getRagStorageSize(accId, agId) {
  const chunks = await readRagChunks(accId, agId)
  return new Blob([JSON.stringify(chunks)]).size
}

// ── Change-agent quota ─────────────────────────────────────────────────────────
export async function getChangeAgentUsageThisMonth(accId) {
  const data = await api.get(`/api/accounts/${accId}/change-agent-usage`)
  return data.used
}

export async function incrementChangeAgentUsage(accId) {
  return api.post(`/api/accounts/${accId}/change-agent-usage`, {})
}

// ── Platform settings ──────────────────────────────────────────────────────────
export async function getPlatformSettings() {
  return api.get('/api/platform/settings')
}

export async function updatePlatformSettings(updates) {
  return api.put('/api/platform/settings', updates)
}

// ── Token usage tracking ───────────────────────────────────────────────────────
// Fire-and-forget reporter. Never throws (analytics must not break the chat flow).
export async function recordTokenUsage(accId, { agentId, conversationId, provider, model, promptTokens, completionTokens, source = 'chat' }) {
  if (!accId || !model) return
  if ((promptTokens || 0) + (completionTokens || 0) === 0) return
  try {
    await api.post(`/api/accounts/${accId}/token-usage`, {
      agentId, conversationId, provider, model, promptTokens, completionTokens, source,
    })
  } catch { /* non-critical */ }
}

export async function queryTokenUsage(accId, { from, to, agentId, model, groupBy } = {}) {
  const qs = new URLSearchParams()
  if (from)    qs.set('from', String(from))
  if (to)      qs.set('to', String(to))
  if (agentId) qs.set('agentId', agentId)
  if (model)   qs.set('model', model)
  if (groupBy) qs.set('groupBy', groupBy)
  return api.get(`/api/accounts/${accId}/token-usage?${qs}`)
}

export async function getBusinessMetrics(accId, { from, to, agentId } = {}) {
  const qs = new URLSearchParams()
  if (from)    qs.set('from', String(from))
  if (to)      qs.set('to', String(to))
  if (agentId) qs.set('agentId', agentId)
  return api.get(`/api/accounts/${accId}/metrics?${qs}`)
}

// ── Prompt change history ──────────────────────────────────────────────────────
export async function listPromptHistory(accId, { agentId, limit = 50, offset = 0 } = {}) {
  const qs = new URLSearchParams()
  if (agentId) qs.set('agentId', agentId)
  qs.set('limit', String(limit))
  qs.set('offset', String(offset))
  return api.get(`/api/accounts/${accId}/prompt-history?${qs}`)
}
export async function getPromptHistoryEntry(accId, id) {
  return api.get(`/api/accounts/${accId}/prompt-history/${id}`)
}

// ── Model pricing ──────────────────────────────────────────────────────────────
export async function getModelPricing() {
  return api.get('/api/model-pricing')
}
export async function updateModelPricing(model, payload) {
  return api.put(`/api/model-pricing/${encodeURIComponent(model)}`, payload)
}
export async function deleteModelPricing(model) {
  return api.delete(`/api/model-pricing/${encodeURIComponent(model)}`)
}

// ── Backup helpers ─────────────────────────────────────────────────────────────
export async function readBackups(accId, agId, type = null) {
  const qs = type ? `?type=${encodeURIComponent(type)}` : ''
  return api.get(`/api/backups/${accId}/${agId}${qs}`)
}

export async function createBackup(accId, agId, label = '', type = 'master') {
  return api.post(`/api/backups/${accId}/${agId}`, { label, type })
}
// JSON completo del backup (la lista no lo trae; necesario para exportar/descargar).
export async function getBackupData(accId, agId, bkId) {
  return api.get(`/api/backups/${accId}/${agId}/${bkId}/data`)
}

export async function deleteBackup(accId, agId, id) {
  return api.delete(`/api/backups/${accId}/${agId}/${id}`)
}

export async function restoreBackup(accId, agId, id) {
  return api.post(`/api/backups/${accId}/${agId}/${id}/restore`, {})
}

export async function getBackupSettings(accId, agId) {
  return api.get(`/api/backups/${accId}/${agId}/settings`)
}

export async function saveBackupSettings(accId, agId, settings) {
  return api.put(`/api/backups/${accId}/${agId}/settings`, settings)
}

export async function checkAndAutoBackup(accId, agId) {
  try {
    const settings = await getBackupSettings(accId, agId)
    if (!settings?.autoBackup) return
    const freqMs = { hourly: 3_600_000, daily: 86_400_000, weekly: 604_800_000 }
    const elapsed = Date.now() - (settings.lastBackupAt || 0)
    if (elapsed < (freqMs[settings.frequency] || freqMs.daily)) return
    await createBackup(accId, agId, 'Auto-backup')
    await saveBackupSettings(accId, agId, { ...settings, lastBackupAt: Date.now() })
  } catch { /* ignore auto-backup errors */ }
}

// ── Team Chat ──────────────────────────────────────────────────────────────────
export async function readTeamChat(accId, channel) {
  const q = channel ? `?channel=${encodeURIComponent(channel)}` : ''
  return api.get(`/api/teamchat/${accId}${q}`)
}

export async function sendTeamChatMessage(accId, msg) {
  return api.post(`/api/teamchat/${accId}`, msg)
}

// Custom channels + direct messages
export async function listTeamChannels(accId) {
  return api.get(`/api/teamchat/${accId}/channels`)
}
export async function createTeamChannel(accId, name) {
  return api.post(`/api/teamchat/${accId}/channels`, { name })
}
export async function deleteTeamChannel(accId, chId) {
  return api.delete(`/api/teamchat/${accId}/channels/${chId}`)
}
export async function openTeamDM(accId, memberId) {
  return api.post(`/api/teamchat/${accId}/dm`, { memberId })
}

// ── Support Tickets ────────────────────────────────────────────────────────────
export async function readSupportTickets() {
  return api.get('/api/support')
}

export async function createSupportTicket(payload) {
  return api.post('/api/support', payload)
}

export async function addSupportTicketMessage(ticketId, payload) {
  return api.post(`/api/support/${ticketId}/messages`, payload)
}

export async function updateSupportTicketStatus(ticketId, status) {
  return api.put(`/api/support/${ticketId}/status`, { status })
}

export async function assignSupportTicket(ticketId, saId, saName) {
  return api.put(`/api/support/${ticketId}/assign`, { saId, saName })
}

export async function updateSupportTicket(ticketId, payload) {
  return api.put(`/api/support/${ticketId}`, payload)
}

// ── Logs de flujos / errores ────────────────────────────────────────────────────
export async function listFlowExecutions(accId, params = {}) {
  const qs = new URLSearchParams(params).toString()
  return api.get(`/api/accounts/${accId}/flow-executions${qs ? '?' + qs : ''}`)
}
export async function listErrorLog(accId, params = {}) {
  const qs = new URLSearchParams(params).toString()
  return api.get(`/api/accounts/${accId}/error-log${qs ? '?' + qs : ''}`)
}
// Registra una ejecución de flujo del navegador (pruebas/webchat) en el log global.
export async function recordFlowExecution(accId, payload) {
  try { return await api.post(`/api/accounts/${accId}/flow-executions`, payload) } catch { /* non-critical */ }
}

// ── Google Sheets (OAuth + hojas vinculadas) ────────────────────────────────────
export async function googleStatus(accId)       { return api.get(`/api/accounts/${accId}/google/status`) }
export async function googleAuthUrl(accId)      { return api.get(`/api/accounts/${accId}/google/auth-url`) }
export async function googleDisconnect(accId)   { return api.delete(`/api/accounts/${accId}/google`) }
export async function listGoogleSheets(accId)   { return api.get(`/api/accounts/${accId}/google/sheets`) }
export async function addGoogleSheet(accId, p)  { return api.post(`/api/accounts/${accId}/google/sheets`, p) }
export async function removeGoogleSheet(accId, id) { return api.delete(`/api/accounts/${accId}/google/sheets/${id}`) }
// Ejecuta una operación de Sheets server-side (el nodo de flujo la usa cuando
// corre en el navegador: pruebas / webchat). body: { operation, spreadsheet, range, values }
export async function googleSheetsOp(accId, payload) { return api.post(`/api/accounts/${accId}/google/sheets-op`, payload) }
// Devuelve los nombres de columna (primera fila) de una hoja → { headers: [...] }
export async function googleSheetColumns(accId, { spreadsheet, range, worksheet }) {
  return api.post(`/api/accounts/${accId}/google/sheets-op`, { operation: 'headers', spreadsheet, range, worksheet })
}
// Devuelve las pestañas (hojas de trabajo) de un libro → { sheets: ['Hoja 1', ...] }
export async function googleWorksheets(accId, { spreadsheet }) {
  return api.post(`/api/accounts/${accId}/google/sheets-op`, { operation: 'worksheets', spreadsheet })
}

// ── Calendarios / Reservas ───────────────────────────────────────────────────
export async function listCalendars(accId)               { return api.get(`/api/accounts/${accId}/calendars`) }
export async function createCalendarApi(accId, p)        { return api.post(`/api/accounts/${accId}/calendars`, p) }
export async function updateCalendarApi(accId, id, p)    { return api.put(`/api/accounts/${accId}/calendars/${id}`, p) }
export async function deleteCalendarApi(accId, id)       { return api.delete(`/api/accounts/${accId}/calendars/${id}`) }
export async function calendarAvailability(accId, calId, date, duration, party) {
  const qs = new URLSearchParams({ date }); if (duration) qs.set('duration', String(duration)); if (party) qs.set('party', String(party))
  return api.get(`/api/accounts/${accId}/calendars/${calId}/availability?${qs}`)
}
// Días con disponibilidad de un mes (autenticado) — para la cuadrícula visual del agendamiento manual.
export async function calendarMonthAvailability(accId, calId, year, month, duration, party) {
  const qs = new URLSearchParams({ year: String(year), month: String(month) }); if (duration) qs.set('duration', String(duration)); if (party) qs.set('party', String(party))
  return api.get(`/api/accounts/${accId}/calendars/${calId}/month-availability?${qs}`)
}
export async function listCalendarBookings(accId, calId, params = {}) {
  const qs = new URLSearchParams(params).toString()
  return api.get(`/api/accounts/${accId}/calendars/${calId}/bookings${qs ? '?' + qs : ''}`)
}
export async function createCalendarBooking(accId, calId, p) { return api.post(`/api/accounts/${accId}/calendars/${calId}/bookings`, p) }
// Restaurante (Fase 2): mesas, turnos, waitlist
export async function listTables(accId, calId)            { return api.get(`/api/accounts/${accId}/calendars/${calId}/tables`) }
export async function createTable(accId, calId, p)        { return api.post(`/api/accounts/${accId}/calendars/${calId}/tables`, p) }
export async function updateTable(accId, tableId, p)      { return api.put(`/api/accounts/${accId}/tables/${tableId}`, p) }
export async function deleteTable(accId, tableId)         { return api.delete(`/api/accounts/${accId}/tables/${tableId}`) }
export async function listShifts(accId, calId)            { return api.get(`/api/accounts/${accId}/calendars/${calId}/shifts`) }
export async function createShift(accId, calId, p)        { return api.post(`/api/accounts/${accId}/calendars/${calId}/shifts`, p) }
export async function updateShift(accId, shiftId, p)      { return api.put(`/api/accounts/${accId}/shifts/${shiftId}`, p) }
export async function deleteShift(accId, shiftId)         { return api.delete(`/api/accounts/${accId}/shifts/${shiftId}`) }
export async function listWaitlist(accId, calId, q = {})  { const qs = new URLSearchParams(q).toString(); return api.get(`/api/accounts/${accId}/calendars/${calId}/waitlist${qs ? '?' + qs : ''}`) }
export async function addWaitlist(accId, calId, p)        { return api.post(`/api/accounts/${accId}/calendars/${calId}/waitlist`, p) }
export async function updateWaitlist(accId, wid, status)  { return api.put(`/api/accounts/${accId}/waitlist/${wid}`, { status }) }
// Cine (Fase 3): config
export async function listMovies(accId, calId)           { return api.get(`/api/accounts/${accId}/calendars/${calId}/movies`) }
export async function createMovie(accId, calId, p)       { return api.post(`/api/accounts/${accId}/calendars/${calId}/movies`, p) }
export async function updateMovie(accId, movieId, p)     { return api.put(`/api/accounts/${accId}/movies/${movieId}`, p) }
export async function deleteMovie(accId, movieId)        { return api.delete(`/api/accounts/${accId}/movies/${movieId}`) }
export async function listAuditoriums(accId, calId)      { return api.get(`/api/accounts/${accId}/calendars/${calId}/auditoriums`) }
export async function createAuditorium(accId, calId, p)  { return api.post(`/api/accounts/${accId}/calendars/${calId}/auditoriums`, p) }
export async function updateAuditorium(accId, audId, p)  { return api.put(`/api/accounts/${accId}/auditoriums/${audId}`, p) }
export async function deleteAuditorium(accId, audId)     { return api.delete(`/api/accounts/${accId}/auditoriums/${audId}`) }
export async function listShowtimesCfg(accId, calId, q = {}) { const qs = new URLSearchParams(q).toString(); return api.get(`/api/accounts/${accId}/calendars/${calId}/showtimes${qs ? '?' + qs : ''}`) }
export async function createShowtime(accId, calId, p)    { return api.post(`/api/accounts/${accId}/calendars/${calId}/showtimes`, p) }
export async function updateShowtime(accId, showId, p)   { return api.put(`/api/accounts/${accId}/showtimes/${showId}`, p) }
export async function deleteShowtime(accId, showId)      { return api.delete(`/api/accounts/${accId}/showtimes/${showId}`) }
// Cine: flujo público de compra
export async function getCinemaListing(accId, calId, q = {}) { const qs = new URLSearchParams(q).toString(); return api.get(`/api/public/cinema/${accId}/${calId}/listing${qs ? '?' + qs : ''}`) }
export async function getShowtimeSeats(accId, showId)    { return api.get(`/api/public/cinema/${accId}/showtimes/${showId}/seats`) }
export async function holdShowtimeSeats(accId, showId, p){ return api.post(`/api/public/cinema/${accId}/showtimes/${showId}/hold`, p) }
export async function releaseShowtimeSeats(accId, showId, p){ return api.post(`/api/public/cinema/${accId}/showtimes/${showId}/release`, p) }
export async function bookShowtimeSeats(accId, showId, p){ return api.post(`/api/public/cinema/${accId}/showtimes/${showId}/book`, p) }
// Hotel (Fase 4a): config
export async function listRoomTypes(accId, calId)        { return api.get(`/api/accounts/${accId}/calendars/${calId}/room-types`) }
export async function createRoomType(accId, calId, p)    { return api.post(`/api/accounts/${accId}/calendars/${calId}/room-types`, p) }
export async function updateRoomType(accId, rtId, p)     { return api.put(`/api/accounts/${accId}/room-types/${rtId}`, p) }
export async function deleteRoomType(accId, rtId)        { return api.delete(`/api/accounts/${accId}/room-types/${rtId}`) }
export async function listRates(accId, rtId, q = {})     { const qs = new URLSearchParams(q).toString(); return api.get(`/api/accounts/${accId}/room-types/${rtId}/rates${qs ? '?' + qs : ''}`) }
export async function setRates(accId, rtId, p)           { return api.post(`/api/accounts/${accId}/room-types/${rtId}/rates`, p) }
export async function clearRate(accId, rtId, date)       { return api.delete(`/api/accounts/${accId}/room-types/${rtId}/rates?date=${encodeURIComponent(date)}`) }
// Hotel: flujo público de reserva
export async function searchStay(accId, calId, q = {})   { const qs = new URLSearchParams(q).toString(); return api.get(`/api/public/hotel/${accId}/${calId}/search${qs ? '?' + qs : ''}`) }
export async function bookStay(accId, calId, p)          { return api.post(`/api/public/hotel/${accId}/${calId}/book`, p) }
// Hotel PMS operativo (4b-4e)
export async function listRooms(accId, calId)            { return api.get(`/api/accounts/${accId}/calendars/${calId}/rooms`) }
export async function createRoom(accId, calId, p)        { return api.post(`/api/accounts/${accId}/calendars/${calId}/rooms`, p) }
export async function updateRoom(accId, roomId, p)       { return api.put(`/api/accounts/${accId}/rooms/${roomId}`, p) }
export async function deleteRoom(accId, roomId)          { return api.delete(`/api/accounts/${accId}/rooms/${roomId}`) }
export async function setRoomHk(accId, roomId, hkStatus) { return api.put(`/api/accounts/${accId}/rooms/${roomId}/hk`, { hkStatus }) }
export async function hotelArrivals(accId, calId, date)  { return api.get(`/api/accounts/${accId}/calendars/${calId}/arrivals?date=${date}`) }
export async function hotelDepartures(accId, calId, date){ return api.get(`/api/accounts/${accId}/calendars/${calId}/departures?date=${date}`) }
export async function hotelInHouse(accId, calId)         { return api.get(`/api/accounts/${accId}/calendars/${calId}/inhouse`) }
export async function hotelCheckIn(accId, bookingId, roomId)  { return api.post(`/api/accounts/${accId}/bookings/${bookingId}/checkin`, { roomId }) }
export async function hotelCheckOut(accId, bookingId)    { return api.post(`/api/accounts/${accId}/bookings/${bookingId}/checkout`, {}) }
export async function hotelChangeRoom(accId, bookingId, roomId) { return api.post(`/api/accounts/${accId}/bookings/${bookingId}/change-room`, { roomId }) }
export async function hotelWalkIn(accId, calId, p)       { return api.post(`/api/accounts/${accId}/calendars/${calId}/walkin`, p) }
export async function listHkTasks(accId, calId, q = {})  { const qs = new URLSearchParams(q).toString(); return api.get(`/api/accounts/${accId}/calendars/${calId}/hk-tasks${qs ? '?' + qs : ''}`) }
export async function updateHkTask(accId, taskId, p)     { return api.put(`/api/accounts/${accId}/hk-tasks/${taskId}`, p) }
export async function listMaintenance(accId, calId, q = {}) { const qs = new URLSearchParams(q).toString(); return api.get(`/api/accounts/${accId}/calendars/${calId}/maintenance${qs ? '?' + qs : ''}`) }
export async function createMaintenance(accId, calId, p) { return api.post(`/api/accounts/${accId}/calendars/${calId}/maintenance`, p) }
export async function resolveMaintenance(accId, mntId)   { return api.put(`/api/accounts/${accId}/maintenance/${mntId}/resolve`, {}) }
export async function getFolio(accId, bookingId)         { return api.get(`/api/accounts/${accId}/bookings/${bookingId}/folio`) }
export async function addFolioCharge(accId, bookingId, p){ return api.post(`/api/accounts/${accId}/bookings/${bookingId}/folio/charge`, p) }
export async function addFolioPayment(accId, bookingId, p){ return api.post(`/api/accounts/${accId}/bookings/${bookingId}/folio/payment`, p) }
export async function hotelReport(accId, calId, q = {})  { const qs = new URLSearchParams(q).toString(); return api.get(`/api/accounts/${accId}/calendars/${calId}/report${qs ? '?' + qs : ''}`) }
// Hotel: canales / OTAs (Airbnb, HosRoom, Booking, Kunas)
export async function listHotelChannels(accId, calId)    { return api.get(`/api/accounts/${accId}/calendars/${calId}/channels`) }
export async function createHotelChannel(accId, calId, p){ return api.post(`/api/accounts/${accId}/calendars/${calId}/channels`, p) }
export async function updateHotelChannel(accId, chanId, p){ return api.put(`/api/accounts/${accId}/channels/${chanId}`, p) }
export async function deleteHotelChannel(accId, chanId)  { return api.delete(`/api/accounts/${accId}/channels/${chanId}`) }
export async function syncHotelChannel(accId, chanId)    { return api.post(`/api/accounts/${accId}/channels/${chanId}/sync`, {}) }
export async function getChannelProviders(accId)         { return api.get(`/api/accounts/${accId}/channel-providers`) }
export async function testHotelChannel(accId, chanId)    { return api.post(`/api/accounts/${accId}/channels/${chanId}/test`, {}) }
export async function importChannelRooms(accId, chanId)  { return api.post(`/api/accounts/${accId}/channels/${chanId}/import-rooms`, {}) }
export async function updateCalendarBooking(accId, bookingId, p) { return api.put(`/api/accounts/${accId}/bookings/${bookingId}`, p) }
export async function rescheduleCalendarBooking(accId, bookingId, p) { return api.post(`/api/accounts/${accId}/bookings/${bookingId}/reschedule`, p) }
export async function setBookingStatus(accId, bookingId, status) { return api.post(`/api/accounts/${accId}/bookings/${bookingId}/status`, { status }) }
export async function deleteCalendarBooking(accId, bookingId) { return api.delete(`/api/accounts/${accId}/bookings/${bookingId}`) }
export function calendarBookingsExportUrl(accId, calId, params = {}) {
  const qs = new URLSearchParams(params).toString()
  return `${API_BASE}/api/accounts/${accId}/calendars/${calId}/bookings/export${qs ? '?' + qs : ''}`
}
// ── Messenger / Instagram (conexión 1-clic con la app global) ─────────────────
export async function metaPagesConnect(accId, body) { return api.post(`/api/meta/pages/connect`, body) }

// ── Catálogo de Meta (Commerce) ───────────────────────────────────────────────
export async function metaCatalogGet(accId)        { return api.get(`/api/accounts/${accId}/meta-catalog`) }
export async function metaCatalogDiscover(accId)   { return api.get(`/api/accounts/${accId}/meta-catalog/discover`) }
export async function metaCatalogProducts(accId, { limit, after } = {}) {
  const qs = new URLSearchParams(); if (limit) qs.set('limit', String(limit)); if (after) qs.set('after', after)
  return api.get(`/api/accounts/${accId}/meta-catalog/products?${qs}`)
}
export async function metaCatalogConnect(accId, body)  { return api.post(`/api/accounts/${accId}/meta-catalog`, body) }
export async function metaCatalogDisconnect(accId)     { return api.delete(`/api/accounts/${accId}/meta-catalog`) }
// Proxy para el motor del navegador (webchat): busca productos del catálogo conectado.
export async function catalogSearchProducts(accId, query, limit = 100) { return api.post(`/api/meta-catalog/${accId}/search`, { query, limit }) }

// ── Optimizador Inteligente del Prompt ────────────────────────────────────────
export async function optimizerStatus(accId, agId)      { return api.get(`/api/accounts/${accId}/agents/${agId}/optimizer/status`) }
export async function optimizerRun(accId, agId)         { return api.post(`/api/accounts/${accId}/agents/${agId}/optimizer/run`, {}) }
export async function optimizerSuggestions(accId, agId) { return api.get(`/api/accounts/${accId}/agents/${agId}/optimizer/suggestions`) }
export async function optimizerSetSuggestionStatus(accId, agId, sid, status, appliedVersion) { return api.post(`/api/accounts/${accId}/agents/${agId}/optimizer/suggestions/${sid}/status`, { status, appliedVersion }) }
export async function optimizerDashboard(accId, agId) { return api.get(`/api/accounts/${accId}/agents/${agId}/optimizer/dashboard`) }

// ── Recontactos inteligentes ──────────────────────────────────────────────────
export async function getRecontactConfig(accId)       { return api.get(`/api/accounts/${accId}/recontact`) }
export async function saveRecontactConfig(accId, cfg) { return api.put(`/api/accounts/${accId}/recontact`, cfg) }
export async function diagnoseRecontact(accId)        { return api.get(`/api/accounts/${accId}/recontact/diagnose`) }
export async function testRecontact(accId, convId)    { return api.post(`/api/accounts/${accId}/recontact/test`, { convId: convId || null }) }

// Público (página de reservas)
export async function getPublicCalendar(accId, calId)    { return api.get(`/api/public/calendars/${accId}/${calId}`) }
export async function getPublicAvailability(accId, calId, date, duration, party) {
  const qs = new URLSearchParams({ date }); if (duration) qs.set('duration', String(duration)); if (party) qs.set('party', String(party))
  return api.get(`/api/public/calendars/${accId}/${calId}/availability?${qs}`)
}
export async function getPublicMonthAvailability(accId, calId, year, month, duration, party) {
  const qs = new URLSearchParams({ year: String(year), month: String(month) }); if (duration) qs.set('duration', String(duration)); if (party) qs.set('party', String(party))
  return api.get(`/api/public/calendars/${accId}/${calId}/month-availability?${qs}`)
}
export async function createPublicBooking(accId, calId, p) { return api.post(`/api/public/calendars/${accId}/${calId}/book`, p) }
// Operaciones de calendario para los nodos de flujo del navegador (pruebas/webchat)
export async function calendarFlowOp(accId, payload) { return api.post(`/api/public/calendars/${accId}/flow-op`, payload) }
// Festivos de un país y año → [{ date, name }]
export async function getCountryHolidays(country, year) {
  if (!country) return []
  try { const r = await api.get(`/api/holidays/${country}/${year}`); return r?.holidays || [] } catch { return [] }
}

// WhatsApp Coexistencia: intercambia el code del Embedded Signup por la config
// del canal (token incluido). El App Secret nunca toca el frontend.
export async function exchangeWhatsAppCoexistence(payload) {
  const r = await api.post('/api/whatsapp/coexistence/exchange', payload)
  return r?.config
}

// ── Invites ────────────────────────────────────────────────────────────────────
export async function createInvite({ accountId, agentId, roleId, createdBy }) {
  const data = await api.post('/api/invites', { accountId, agentId, roleId, createdBy })
  return data.token
}

export async function getInvite(token) {
  return api.get(`/api/invites/${token}`)
}

export async function acceptInvite(token, { name, email, password }) {
  return api.post(`/api/invites/${token}/accept`, { name, email, password })
}

export async function listInvites(accountId) {
  return api.get(`/api/invites?accountId=${accountId}`)
}

export async function revokeInvite(token) {
  return api.delete(`/api/invites/${token}`)
}
