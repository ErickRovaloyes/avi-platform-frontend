import { api, getToken, setToken, clearToken, API_BASE } from './api.js'

export { getToken, setToken, clearToken, API_BASE }

// ── N8N integrations + API keys ──────────────────────────────────────────────
export async function listN8NIntegrations(params = {}) {
  const qs = new URLSearchParams(params)
  return api.get(`/api/n8n/integrations?${qs}`)
}
export async function createN8NIntegration(payload)      { return api.post('/api/n8n/integrations', payload) }
export async function updateN8NIntegration(id, payload)  { return api.put(`/api/n8n/integrations/${id}`, payload) }
export async function deleteN8NIntegration(id)           { return api.delete(`/api/n8n/integrations/${id}`) }
export async function testN8NIntegration(id)             { return api.post(`/api/n8n/integrations/${id}/test`, {}) }
export async function dispatchN8N(id, payload, opts = {}){ return api.post(`/api/n8n/integrations/${id}/dispatch`, { payload, ...opts }) }

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

// ── WhatsApp templates (HSM aprobadas por Meta) ─────────────────────────────────
export async function listWhatsAppTemplates(accId, agentId, channelId) {
  const qs = channelId ? `?channelId=${encodeURIComponent(channelId)}` : ''
  return api.get(`/api/whatsapp/${accId}/${agentId}/templates${qs}`)
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
export async function uploadMedia(accId, agId, convId, file, { sender = 'human', senderName = '', caption = '', filename } = {}) {
  const fd = new FormData()
  // Pass an explicit filename when the Blob has none (e.g. recorded audio)
  fd.append('file', file, filename || file.name || 'media')
  if (sender)     fd.append('sender', sender)
  if (senderName) fd.append('senderName', senderName)
  if (caption)    fd.append('caption', caption)
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
export async function loginSuperAdmin(email, password) {
  const data = await api.post('/api/auth/login', { email, password })
  setToken(data.token)
  return data.session
}

export async function loginMember(email, password) {
  const data = await api.post('/api/auth/login', { email, password })
  setToken(data.token)
  return data.session
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

// ── Conversations ──────────────────────────────────────────────────────────────
export async function readConvos(accId, agId) {
  return api.get(`/api/conversations/${accId}/${agId}`)
}

export async function createConvo(accId, agId, channelId, guestName, guestId, channelType = 'webchat') {
  const data = await api.post(`/api/conversations/${accId}/${agId}`, { channelId, guestName, guestId, channelType })
  return data.id
}

export async function appendMsg(accId, agId, convId, msg) {
  return api.post(`/api/conversations/${accId}/${agId}/${convId}/messages`, msg)
}

// Envío manual del asesor: el backend lo entrega al canal real (WhatsApp/
// Messenger/IG) y lo persiste. En webchat solo persiste.
export async function sendManualMessage(accId, agId, convId, text, senderName) {
  return api.post(`/api/conversations/${accId}/${agId}/${convId}/send-manual`, { text, senderName })
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
