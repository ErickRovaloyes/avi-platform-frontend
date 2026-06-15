import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { uid, linkId, DEFAULT_CHANNEL_LIMITS } from '../lib/storage'
import { api, getSocket, connectSocket, getToken } from '../lib/api'

// Last-visited tracking (client-only preference — stays in localStorage)
const LV_KEY = (aId, gId) => `avi_lv_${aId}_${gId}`
const touchLastVisited = (aId, gId) => localStorage.setItem(LV_KEY(aId, gId), String(Date.now()))
const getLastVisited   = (aId, gId) => parseInt(localStorage.getItem(LV_KEY(aId, gId)) || '0', 10)

const Ctx = createContext(null)

export function AccountProvider({ children }) {
  const { session, canAccessAgent, switchAccount } = useAuth()
  const accountId    = session?.accountId
  const allAccountIds = session?.allAccountIds || (accountId ? [accountId] : [])

  // ── Core state ──────────────────────────────────────────────────────────────
  const [account, setAccount] = useState(null)
  const [accountsMap, setAccountsMap] = useState({})       // accId → lightweight account obj
  const [convos,  setConvos]  = useState({})               // `${accId}_${agId}` → []
  const [platformSettings, setPlatformSettings] = useState({
    changeAgentModel: 'gpt-4o-mini',
    changeAgentDefaultLimit: 20,
    channelLimits: { ...DEFAULT_CHANNEL_LIMITS },
  })
  // effectiveKeys[provider] = { key: '...', source: 'account' | 'platform' | 'none' }
  // Use these in any AI call so the chat works even when the account hasn't set its own keys
  // (will fall back to the platform-wide defaults configured by the super admin).
  const [effectiveKeys, setEffectiveKeys] = useState({})
  const loadingRef = useRef(false)

  // Deep-link a una conversación: cualquier vista (tickets, pipeline) puede pedir
  // abrir un chat concreto. AdminShell cambia a la pestaña Inbox y InboxPanel
  // selecciona la conversación. Se limpia tras consumirse.
  const [pendingOpen, setPendingOpen] = useState(null) // { agentId, convId }
  const openConversation = useCallback((agentId, convId) => {
    if (!agentId || !convId) return
    setPendingOpen({ agentId, convId, ts: Date.now() })
  }, [])
  const consumePendingOpen = useCallback(() => setPendingOpen(null), [])

  const loadEffectiveKeys = useCallback(async (accId = accountId) => {
    if (!accId) return
    try {
      const data = await api.get(`/api/accounts/${accId}/effective-keys`)
      setEffectiveKeys(data || {})
    } catch { /* non-critical */ }
  }, [accountId])

  // ── Loaders ─────────────────────────────────────────────────────────────────
  const loadAccount = useCallback(async (accId = accountId) => {
    if (!accId) return
    try {
      const data = await api.get(`/api/accounts/${accId}`)
      if (accId === accountId) setAccount(data)
      setAccountsMap(m => ({ ...m, [accId]: data }))
    } catch (err) {
      console.error('[AccountCtx] loadAccount', err)
    }
  }, [accountId])

  const loadConvos = useCallback(async (accId = accountId, agents = null) => {
    if (!accId) return
    const acc = agents ? { agents } : accountsMap[accId] || account
    if (!acc) return
    const visible = (acc.agents || []).filter(a => canAccessAgent(a.id))
    const results = await Promise.allSettled(
      visible.map(ag =>
        api.get(`/api/conversations/${accId}/${ag.id}`)
          .then(list => ({ key: `${accId}_${ag.id}`, list }))
      )
    )
    const updates = {}
    for (const r of results) {
      if (r.status === 'fulfilled') updates[r.value.key] = r.value.list
    }
    setConvos(prev => ({ ...prev, ...updates }))
  }, [accountId, account, accountsMap, canAccessAgent])

  const loadPlatformSettings = useCallback(async () => {
    try {
      // Public integrations (meta App ID etc) — available to all users
      const pub = await api.get('/api/platform/integrations').catch(() => ({}))
      if (pub.metaAppId) setPlatformSettings(prev => ({ ...prev, metaAppId: pub.metaAppId }))
      // Full settings — readable by ANY authenticated user (server masks the API keys for non-SA).
      // This is what feeds changeAgentModel into getChangeAgentInfo() so the user sees the
      // model the super admin actually configured (e.g. deepseek-chat), not the hardcoded default.
      const s = await api.get('/api/platform/settings').catch(() => null)
      if (s) setPlatformSettings(prev => ({ ...prev, ...s }))
    } catch {}
  }, [session?.type])

  // ── Bootstrap on session change ──────────────────────────────────────────────
  useEffect(() => {
    if (!accountId) { setAccount(null); setConvos({}); setEffectiveKeys({}); return }
    ;(async () => {
      await loadAccount()
      // Also load lightweight data for all other accounts in the session.
      // Depending on allAccountIds.join(',') ensures that when the session
      // gets new accounts (e.g. after accepting an invitation + refresh), the
      // newly-added accounts are loaded immediately without a page reload.
      for (const aId of allAccountIds) {
        if (aId !== accountId && !accountsMap[aId]) loadAccount(aId)
      }
    })()
    loadPlatformSettings()
    loadEffectiveKeys()
  }, [accountId, allAccountIds.join(',')])

  // ── Reload convos when account agents load ───────────────────────────────────
  useEffect(() => {
    if (account) loadConvos()
  }, [account?.agents?.map(a => a.id).join(',')])

  // ── Socket.io real-time updates ──────────────────────────────────────────────
  useEffect(() => {
    if (!accountId) return
    const socket = getSocket()

    // Defensive: ensure socket is connected (in case AuthContext effect hasn't fired yet
    // or socket dropped). Without a connection, no events arrive.
    if (!socket.connected && getToken()) connectSocket(getToken())

    const onAccountUpdated = ({ accId }) => {
      if (!accId) return
      if (accId === accountId) loadAccount()
      else if (allAccountIds.includes(accId)) loadAccount(accId)
    }

    const onConvosUpdated = ({ accId, agId }) => {
      if (allAccountIds.includes(accId)) {
        const key = `${accId}_${agId}`
        api.get(`/api/conversations/${accId}/${agId}`)
          .then(list => setConvos(prev => ({ ...prev, [key]: list })))
          .catch(() => {})
      }
    }

    const onMessageNew = ({ accId, agId, convId, message }) => {
      const key = `${accId}_${agId}`
      setConvos(prev => {
        const oldList = prev[key] || []
        // Update the matching conv with the new message, OR keep it as-is if dup.
        let touched = null
        const others = []
        for (const c of oldList) {
          if (c.id !== convId) { others.push(c); continue }
          const dup = (c.messages || []).some(m =>
            (m.id && message.id && m.id === message.id) ||
            (m.content === message.content && m.sender === message.sender && Math.abs((m.ts || 0) - (message.ts || 0)) < 10000)
          )
          if (dup) {
            others.push(c) // leave unchanged + don't reorder
          } else {
            touched = {
              ...c,
              messages: [...(c.messages || []), message],
              preview: message.content?.slice(0, 60) || c.preview,
              updatedAt: Date.now(),
              unread: message.sender === 'user' ? true : c.unread,
            }
          }
        }
        // WhatsApp-style ordering: the freshly-touched conversation jumps to the top,
        // every other conversation keeps its relative position.
        const newList = touched ? [touched, ...others] : others
        return { ...prev, [key]: newList }
      })
    }

    // Estado de entrega de mensajes salientes (sent/delivered/read/failed)
    const onMessageStatus = ({ accId, agId, convId, messageId, status }) => {
      const key = `${accId}_${agId}`
      setConvos(prev => {
        const list = prev[key]
        if (!list) return prev
        return {
          ...prev,
          [key]: list.map(c => c.id !== convId ? c : {
            ...c,
            messages: (c.messages || []).map(m => m.id === messageId ? { ...m, status } : m),
          }),
        }
      })
    }

    socket.on('account:updated', onAccountUpdated)
    socket.on('convos:updated',  onConvosUpdated)
    socket.on('message:new',     onMessageNew)
    socket.on('message:status',  onMessageStatus)

    return () => {
      socket.off('account:updated', onAccountUpdated)
      socket.off('convos:updated',  onConvosUpdated)
      socket.off('message:new',     onMessageNew)
      socket.off('message:status',  onMessageStatus)
    }
  }, [accountId, allAccountIds.join(',')])

  // ── Derived state ────────────────────────────────────────────────────────────
  const visibleAgents = (account?.agents || []).filter(a => canAccessAgent(a.id))
  const [selectedAgentId, setSelectedAgentIdRaw] = useState(null)

  useEffect(() => {
    if (visibleAgents.length && !selectedAgentId) setSelectedAgentIdRaw(visibleAgents[0]?.id)
  }, [visibleAgents.map(a => a.id).join(',')])

  const setSelectedAgentId = useCallback((agId) => {
    if (agId && accountId) touchLastVisited(accountId, agId)
    setSelectedAgentIdRaw(agId)
  }, [accountId])

  const switchToAgent = useCallback(async (tAccId, tAgId) => {
    touchLastVisited(tAccId, tAgId)
    if (tAccId !== accountId) {
      // Optimistic: use cached account data immediately so the UI doesn't flash
      if (accountsMap[tAccId]) setAccount(accountsMap[tAccId])
      await switchAccount(tAccId)
      // Fresh data loads via useEffect([accountId])
    }
    setSelectedAgentIdRaw(tAgId)
  }, [accountId, switchAccount, accountsMap])

  const allAgentAccounts = allAccountIds
    .flatMap(aId => {
      const acc = accountsMap[aId]
      if (!acc) return []
      return (acc.agents || []).map(ag => ({
        accountId:   acc.id,
        accountName: acc.name,
        agentId:     ag.id,
        agentName:   ag.name,
        agentStatus: ag.status,
        agent:       ag,
        lastVisited: getLastVisited(acc.id, ag.id),
        unreadCount: (convos[`${acc.id}_${ag.id}`] || []).filter(c => c.unread).length,
      }))
    })
    .sort((a, b) => b.unreadCount - a.unreadCount || b.lastVisited - a.lastVisited)

  const totalUnread = visibleAgents.reduce(
    (s, ag) => s + (convos[`${accountId}_${ag.id}`] || []).filter(c => c.unread).length, 0
  )

  const selectedAgent = visibleAgents.find(a => a.id === selectedAgentId) || visibleAgents[0]

  // ── Compat: db object for any legacy code ────────────────────────────────────
  const db = account
    ? { accounts: Object.values(accountsMap), platformSettings }
    : { accounts: [], platformSettings }

  const reloadDB     = () => loadAccount()
  const reloadConvos = () => loadConvos()

  // ── Optimistic mutate helper ─────────────────────────────────────────────────
  function optimistic(localFn, apiFn) {
    setAccount(acc => { if (!acc) return acc; const next = JSON.parse(JSON.stringify(acc)); localFn(next); return next })
    apiFn().catch(() => loadAccount())
  }

  // ── Agents ───────────────────────────────────────────────────────────────────
  function updateAgent(agentId, updates) {
    optimistic(
      acc => { const i = acc.agents.findIndex(a => a.id === agentId); if (i !== -1) acc.agents[i] = { ...acc.agents[i], ...updates } },
      () => api.put(`/api/agents/${accountId}/${agentId}`, updates)
    )
  }
  function deleteAgent(agentId) {
    optimistic(
      acc => { acc.agents = acc.agents.filter(a => a.id !== agentId) },
      () => api.delete(`/api/agents/${accountId}/${agentId}`)
    )
  }

  // ── Multi-prompts ─────────────────────────────────────────────────────────────
  function addPrompt(agentId, data) {
    const newPrompt = { id: 'pr_' + uid(), ...data, isActive: false }
    optimistic(
      acc => { const ag = acc.agents.find(a => a.id === agentId); if (ag) { if (!ag.prompts) ag.prompts = []; ag.prompts.push(newPrompt) } },
      () => api.post(`/api/agents/${accountId}/${agentId}/prompts`, newPrompt)
    )
  }
  function updatePrompt(agentId, promptId, updates) {
    optimistic(
      acc => { const ag = acc.agents.find(a => a.id === agentId); if (ag?.prompts) { const i = ag.prompts.findIndex(p => p.id === promptId); if (i !== -1) ag.prompts[i] = { ...ag.prompts[i], ...updates } } },
      () => api.put(`/api/agents/${accountId}/${agentId}/prompts/${promptId}`, updates)
    )
  }
  function setActivePrompt(agentId, promptId) {
    optimistic(
      acc => { const ag = acc.agents.find(a => a.id === agentId); if (ag?.prompts) { ag.prompts.forEach(p => { p.isActive = p.id === promptId }); const active = ag.prompts.find(p => p.id === promptId); if (active) ag.systemPrompt = active.content } },
      () => api.put(`/api/agents/${accountId}/${agentId}/prompts/${promptId}`, { isActive: true })
    )
  }
  function deletePrompt(agentId, promptId) {
    optimistic(
      acc => { const ag = acc.agents.find(a => a.id === agentId); if (ag?.prompts) ag.prompts = ag.prompts.filter(p => p.id !== promptId) },
      () => api.delete(`/api/agents/${accountId}/${agentId}/prompts/${promptId}`)
    )
  }

  // ── Channels ──────────────────────────────────────────────────────────────────
  async function addChannel(agentId, channelData) {
    const data = await api.post(`/api/agents/${accountId}/${agentId}/channels`, channelData)
    await loadAccount()
    return data
  }
  function updateChannel(agentId, channelId, updates) {
    optimistic(
      acc => { const ag = acc.agents.find(a => a.id === agentId); if (ag?.channels) { const i = ag.channels.findIndex(c => c.id === channelId); if (i !== -1) ag.channels[i] = { ...ag.channels[i], ...updates } } },
      () => api.put(`/api/agents/${accountId}/${agentId}/channels/${channelId}`, updates)
    )
  }
  function removeChannel(agentId, channelId) {
    optimistic(
      acc => { const ag = acc.agents.find(a => a.id === agentId); if (ag?.channels) ag.channels = ag.channels.filter(c => c.id !== channelId) },
      () => api.delete(`/api/agents/${accountId}/${agentId}/channels/${channelId}`)
    )
  }
  function getChannelLimit(channelType) {
    const acc = account
    if (!acc) return 0
    const plan = acc.plan || 'free'
    const planLimits = platformSettings?.channelLimits?.[plan] || DEFAULT_CHANNEL_LIMITS[plan] || DEFAULT_CHANNEL_LIMITS.free
    const override = acc.channelLimitsOverride || {}
    const v = override[channelType]
    return (v !== null && v !== undefined) ? v : (planLimits[channelType] ?? 0)
  }
  function canAdd(agentId, channelType) {
    const limit = getChannelLimit(channelType)
    if (limit === -1) return true
    let count = 0
    for (const ag of account?.agents || []) {
      count += (ag.channels || []).filter(c => c.type === channelType).length
    }
    return count < limit
  }

  // ── Legacy Links ──────────────────────────────────────────────────────────────
  function addLink(agentId, label) {
    const id = linkId()
    const newChannel = { id, type: 'webchat', name: label, status: 'active', config: {}, createdAt: Date.now() }
    optimistic(
      acc => { const ag = acc.agents.find(a => a.id === agentId); if (ag) { if (!ag.links) ag.links = []; ag.links.push({ id, label, createdAt: Date.now() }); if (!ag.channels) ag.channels = []; ag.channels.push(newChannel) } },
      () => api.post(`/api/agents/${accountId}/${agentId}/channels`, newChannel)
    )
    return id
  }
  function deleteLink(agentId, lId) {
    optimistic(
      acc => { const ag = acc.agents.find(a => a.id === agentId); if (ag) { ag.links = (ag.links || []).filter(l => l.id !== lId); ag.channels = (ag.channels || []).filter(c => c.id !== lId) } },
      () => api.delete(`/api/agents/${accountId}/${agentId}/channels/${lId}`)
    )
  }

  // ── Account settings ──────────────────────────────────────────────────────────
  function setOpenAIKey(key)    { optimistic(acc => { acc.openaiKey    = key }, () => api.put(`/api/accounts/${accountId}`, { openaiKey: key })) }
  function setDeepseekKey(key)  { optimistic(acc => { acc.deepseekKey  = key }, () => api.put(`/api/accounts/${accountId}`, { deepseekKey: key })) }
  function setAnthropicKey(key) { optimistic(acc => { acc.anthropicKey = key }, () => api.put(`/api/accounts/${accountId}`, { anthropicKey: key })) }

  // ── Members ───────────────────────────────────────────────────────────────────
  function addMember(data) {
    const newMember = { id: 'mem_' + uid(), ...data, status: 'active', avatar: data.name.slice(0, 2).toUpperCase(), agentAccess: data.agentAccess || [] }
    optimistic(acc => acc.members.push(newMember), () => api.post(`/api/members/${accountId}`, newMember))
  }
  function updateMember(memberId, updates) {
    optimistic(acc => { const i = acc.members.findIndex(m => m.id === memberId); if (i !== -1) acc.members[i] = { ...acc.members[i], ...updates } }, () => api.put(`/api/members/${accountId}/${memberId}`, updates))
  }
  function deleteMember(memberId) {
    optimistic(acc => { acc.members = acc.members.filter(m => m.id !== memberId) }, () => api.delete(`/api/members/${accountId}/${memberId}`))
  }

  // ── Roles ─────────────────────────────────────────────────────────────────────
  function addRole(data) {
    const newRole = { id: 'role_' + uid(), ...data, isSystem: false }
    optimistic(acc => acc.roles.push(newRole), () => api.post(`/api/roles/${accountId}`, newRole))
  }
  function updateRole(roleId, updates) {
    optimistic(acc => { const i = acc.roles.findIndex(r => r.id === roleId); if (i !== -1) acc.roles[i] = { ...acc.roles[i], ...updates } }, () => api.put(`/api/roles/${accountId}/${roleId}`, updates))
  }
  function deleteRole(roleId) {
    optimistic(acc => { acc.roles = acc.roles.filter(r => r.id !== roleId) }, () => api.delete(`/api/roles/${accountId}/${roleId}`))
  }

  // ── Labels ────────────────────────────────────────────────────────────────────
  function addLabel(data) {
    const newLabel = { id: 'lbl_' + uid(), ...data }
    optimistic(acc => acc.labels.push(newLabel), () => api.post(`/api/labels/${accountId}`, newLabel))
  }
  function updateLabel(id, upd) {
    optimistic(acc => { const i = acc.labels.findIndex(l => l.id === id); if (i !== -1) acc.labels[i] = { ...acc.labels[i], ...upd } }, () => api.put(`/api/labels/${accountId}/${id}`, upd))
  }
  function deleteLabel(id) {
    optimistic(acc => { acc.labels = acc.labels.filter(l => l.id !== id) }, () => api.delete(`/api/labels/${accountId}/${id}`))
  }

  // ── Convos (local state ops + API) ───────────────────────────────────────────
  function getConvos(agentId) { return convos[`${accountId}_${agentId}`] || [] }
  function getAllGuestNames(agentId) { return getConvos(agentId).map(c => ({ id: c.id, name: c.guestName, convId: c.id })) }

  function _patchConvo(agentId, convId, patch) {
    const key = `${accountId}_${agentId}`
    setConvos(prev => ({ ...prev, [key]: (prev[key] || []).map(c => c.id === convId ? { ...c, ...patch } : c) }))
  }
  function markRead(agentId, convId) {
    _patchConvo(agentId, convId, { unread: false })
    api.put(`/api/conversations/${accountId}/${agentId}/${convId}`, { unread: false }).catch(() => {})
  }
  function markUnread(agentId, convId) {
    _patchConvo(agentId, convId, { unread: true })
    api.put(`/api/conversations/${accountId}/${agentId}/${convId}`, { unread: true }).catch(() => {})
  }
  function setConvoLabels(agentId, convId, labelIds) {
    _patchConvo(agentId, convId, { labels: labelIds })
    api.put(`/api/conversations/${accountId}/${agentId}/${convId}`, { labels: labelIds }).catch(() => {})
  }
  // assignee: { id, name } or null to unassign
  function assignConvo(agentId, convId, assignee) {
    _patchConvo(agentId, convId, { assignedTo: assignee })
    api.put(`/api/conversations/${accountId}/${agentId}/${convId}`, { assignedTo: assignee }).catch(() => {})
  }
  function toggleAI(agentId, convId, enabled) {
    _patchConvo(agentId, convId, { aiEnabled: enabled })
    api.put(`/api/conversations/${accountId}/${agentId}/${convId}`, { aiEnabled: enabled }).catch(() => {})
  }
  function setLocalVar(agentId, convId, varId, value) {
    _patchConvo(agentId, convId, { localVars: { ...(getConvos(agentId).find(c => c.id === convId)?.localVars || {}), [varId]: value } })
    api.patch(`/api/conversations/${accountId}/${agentId}/${convId}/vars`, { varId, value }).catch(() => {})
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────────
  function addPipeline(name) {
    const p = { id: 'pipe_' + uid(), name, stages: [{ id: 'st_' + uid(), name: 'Nuevo Lead', color: '#4fa8ff', order: 0 }], cards: [] }
    optimistic(acc => acc.pipelines.push(p), () => api.post(`/api/pipelines/${accountId}`, p))
  }
  function updatePipeline(id, upd) {
    optimistic(acc => { const i = acc.pipelines.findIndex(p => p.id === id); if (i !== -1) acc.pipelines[i] = { ...acc.pipelines[i], ...upd } }, () => api.put(`/api/pipelines/${accountId}/${id}`, upd))
  }
  function deletePipeline(id) {
    optimistic(acc => { acc.pipelines = acc.pipelines.filter(p => p.id !== id) }, () => api.delete(`/api/pipelines/${accountId}/${id}`))
  }
  function addStage(pipeId, name, color) {
    const s = { id: 'st_' + uid(), name, color: color || '#7c6fff', order: (account?.pipelines?.find(p => p.id === pipeId)?.stages?.length || 0) }
    optimistic(acc => { const p = acc.pipelines.find(p => p.id === pipeId); if (p) p.stages.push(s) }, () => api.put(`/api/pipelines/${accountId}/${pipeId}`, { addStage: s }))
  }
  function deleteStage(pipeId, stageId) {
    optimistic(acc => { const p = acc.pipelines.find(p => p.id === pipeId); if (p) { p.stages = p.stages.filter(s => s.id !== stageId); p.cards = p.cards.map(c => c.stageId === stageId ? { ...c, stageId: null } : c) } }, () => api.put(`/api/pipelines/${accountId}/${pipeId}`, { deleteStage: stageId }))
  }
  function addCard(pipeId, stageId, data) {
    const card = { id: 'card_' + uid(), stageId, ...data, createdAt: Date.now() }
    optimistic(acc => { const p = acc.pipelines.find(p => p.id === pipeId); if (p) p.cards.push(card) }, () => api.put(`/api/pipelines/${accountId}/${pipeId}`, { addCard: card }))
  }
  function updateCard(pipeId, cardId, updates) {
    optimistic(acc => { const p = acc.pipelines.find(p => p.id === pipeId); if (p) { const i = p.cards.findIndex(c => c.id === cardId); if (i !== -1) p.cards[i] = { ...p.cards[i], ...updates } } }, () => api.put(`/api/pipelines/${accountId}/${pipeId}`, { updateCard: { id: cardId, ...updates } }))
  }
  function moveCard(pipeId, cardId, newStageId) { updateCard(pipeId, cardId, { stageId: newStageId }) }
  function moveCardToPipeline(fromPipeId, cardId, toPipeId, toStageId) {
    optimistic(acc => {
      const fp = acc.pipelines.find(p => p.id === fromPipeId)
      const tp = acc.pipelines.find(p => p.id === toPipeId)
      if (!fp || !tp) return
      const card = fp.cards.find(c => c.id === cardId)
      if (!card) return
      fp.cards = fp.cards.filter(c => c.id !== cardId)
      tp.cards.push({ ...card, stageId: toStageId, id: 'card_' + uid() })
    }, () => api.put(`/api/pipelines/${accountId}/${fromPipeId}`, { moveCard: { cardId, toPipeId, toStageId } }))
  }
  function deleteCard(pipeId, cardId) {
    optimistic(acc => { const p = acc.pipelines.find(p => p.id === pipeId); if (p) p.cards = p.cards.filter(c => c.id !== cardId) }, () => api.put(`/api/pipelines/${accountId}/${pipeId}`, { deleteCard: cardId }))
  }
  function linkConvoToPipeline(agentId, convId, pipeId, stageId, cardData) {
    const cardId = 'card_' + uid()
    const card = { id: cardId, stageId, ...cardData, convId, agentId, createdAt: Date.now() }
    optimistic(acc => { const p = acc.pipelines.find(p => p.id === pipeId); if (p) p.cards.push(card) }, () => api.put(`/api/pipelines/${accountId}/${pipeId}`, { addCard: card }))
    const conv = getConvos(agentId).find(c => c.id === convId)
    const newCards = [...(conv?.pipelineCards || []), { pipelineId: pipeId, cardId }]
    _patchConvo(agentId, convId, { pipelineCards: newCards })
    api.put(`/api/conversations/${accountId}/${agentId}/${convId}`, { pipelineCards: newCards }).catch(() => {})
    return cardId
  }
  function unlinkConvoFromPipeline(agentId, convId, pipeId, cardId) {
    deleteCard(pipeId, cardId)
    const conv = getConvos(agentId).find(c => c.id === convId)
    const newCards = (conv?.pipelineCards || []).filter(pc => pc.cardId !== cardId)
    _patchConvo(agentId, convId, { pipelineCards: newCards })
    api.put(`/api/conversations/${accountId}/${agentId}/${convId}`, { pipelineCards: newCards }).catch(() => {})
  }

  // ── Variables ─────────────────────────────────────────────────────────────────
  function addVariable(data) {
    const v = { id: 'var_' + uid(), ...data }
    optimistic(acc => { if (!acc.variables) acc.variables = []; acc.variables.push(v) }, () => api.post(`/api/variables/${accountId}`, v))
  }
  function updateVariable(id, upd) {
    optimistic(acc => { const i = (acc.variables || []).findIndex(v => v.id === id); if (i !== -1) acc.variables[i] = { ...acc.variables[i], ...upd } }, () => api.put(`/api/variables/${accountId}/${id}`, upd))
  }
  function deleteVariable(id) {
    optimistic(acc => { acc.variables = (acc.variables || []).filter(v => v.id !== id) }, () => api.delete(`/api/variables/${accountId}/${id}`))
  }

  // ── AI Tools ──────────────────────────────────────────────────────────────────
  function addAITool(data) {
    const t = { id: 'tool_' + uid(), ...data, createdAt: Date.now() }
    optimistic(acc => { if (!acc.aiTools) acc.aiTools = []; acc.aiTools.push(t) }, () => api.post(`/api/ai_tools/${accountId}`, t))
  }
  function updateAITool(id, upd) {
    optimistic(acc => { const i = (acc.aiTools || []).findIndex(t => t.id === id); if (i !== -1) acc.aiTools[i] = { ...acc.aiTools[i], ...upd } }, () => api.put(`/api/ai_tools/${accountId}/${id}`, upd))
  }
  function deleteAITool(id) {
    optimistic(acc => { acc.aiTools = (acc.aiTools || []).filter(t => t.id !== id) }, () => api.delete(`/api/ai_tools/${accountId}/${id}`))
  }
  function assignToolToAgent(agentId, toolId) {
    optimistic(acc => { const ag = acc.agents.find(a => a.id === agentId); if (ag && !ag.aiToolIds.includes(toolId)) ag.aiToolIds.push(toolId) }, () => api.put(`/api/agents/${accountId}/${agentId}`, { addToolId: toolId }))
  }
  function removeToolFromAgent(agentId, toolId) {
    optimistic(acc => { const ag = acc.agents.find(a => a.id === agentId); if (ag) ag.aiToolIds = ag.aiToolIds.filter(t => t !== toolId) }, () => api.put(`/api/agents/${accountId}/${agentId}`, { removeToolId: toolId }))
  }

  // ── Flows ─────────────────────────────────────────────────────────────────────
  function addFlow(data) {
    const f = { id: 'flow_' + uid(), ...data, nodes: [], startNodeId: null, createdAt: Date.now() }
    optimistic(acc => { if (!acc.flows) acc.flows = []; acc.flows.push(f) }, () => api.post(`/api/flows/${accountId}`, f))
  }
  function updateFlow(id, upd) {
    optimistic(acc => { const i = (acc.flows || []).findIndex(f => f.id === id); if (i !== -1) acc.flows[i] = { ...acc.flows[i], ...upd } }, () => api.put(`/api/flows/${accountId}/${id}`, upd))
  }
  function deleteFlow(id) {
    optimistic(acc => { acc.flows = (acc.flows || []).filter(f => f.id !== id) }, () => api.delete(`/api/flows/${accountId}/${id}`))
  }
  // Import a flow definition into the CURRENT account (used by "Importar").
  // Always assigns a fresh id so it never collides with an existing flow.
  async function importFlow(data) {
    const f = {
      id: 'flow_' + uid(),
      name: data?.name || 'Flujo importado',
      trigger: data?.trigger || 'manual',
      triggerKeyword: data?.triggerKeyword || '',
      startNodeId: data?.startNodeId || null,
      nodes: Array.isArray(data?.nodes) ? data.nodes : [],
      createdAt: Date.now(),
    }
    optimistic(acc => { if (!acc.flows) acc.flows = []; acc.flows.push(f) }, () => api.post(`/api/flows/${accountId}`, f))
    return f.id
  }
  // Copy a flow into ANOTHER account the user has access to. Validated server-side
  // against the caller's account list. Refreshes the target account's cache.
  async function copyFlowToAccount(flow, targetAccId) {
    if (!flow || !targetAccId) return
    if (!allAccountIds.includes(targetAccId)) throw new Error('Sin acceso a esa cuenta')
    const payload = {
      id: 'flow_' + uid(),
      name: flow.name || 'Flujo',
      trigger: flow.trigger || 'manual',
      triggerKeyword: flow.triggerKeyword || '',
      startNodeId: flow.startNodeId || null,
      nodes: Array.isArray(flow.nodes) ? flow.nodes : [],
    }
    await api.post(`/api/flows/${targetAccId}`, payload)
    if (targetAccId === accountId) loadAccount()
    else loadAccount(targetAccId)
    return payload.id
  }

  // ── WhatsApp config ───────────────────────────────────────────────────────────
  function setAgentWhatsAppConfig(agentId, config) {
    optimistic(acc => {
      const agent = acc.agents.find(a => a.id === agentId)
      if (!agent) return
      agent.whatsapp = config
      if (!agent.channels) agent.channels = []
      const waIdx = agent.channels.findIndex(c => c.type === 'whatsapp')
      if (waIdx !== -1) agent.channels[waIdx] = { ...agent.channels[waIdx], config, status: config.status || 'disconnected' }
      else agent.channels.push({ id: 'ch_wa_' + uid(), type: 'whatsapp', name: 'WhatsApp principal', status: config.status || 'disconnected', config, createdAt: Date.now() })
    }, () => api.put(`/api/agents/${accountId}/${agentId}`, { whatsapp: config }))
  }

  // ── RAG ───────────────────────────────────────────────────────────────────────
  function updateAgentRag(agentId, ragUpdates) {
    optimistic(acc => { const ag = acc.agents.find(a => a.id === agentId); if (ag) ag.rag = { ...(ag.rag || { enabled: false, files: [] }), ...ragUpdates } }, () => api.put(`/api/agents/${accountId}/${agentId}`, { rag: ragUpdates }))
  }

  // ── API key resolution ────────────────────────────────────────────────────────
  // Returns the effective key for a given provider, preferring the account's
  // own key, falling back to the platform-default configured by the super admin.
  // Also exposes the source so the UI can show a "using platform key" badge.
  function getEffectiveApiKey(provider = 'openai') {
    return effectiveKeys?.[provider]?.key || ''
  }
  function getApiKeySource(provider = 'openai') {
    return effectiveKeys?.[provider]?.source || 'none'
  }

  // ── Change Agent ──────────────────────────────────────────────────────────────
  // Token-based credit pools. Each category (basic / medium / complex) has its
  // own monthly cap. Per-account override (`changeAgentTokenLimitsOverride`)
  // beats the platform-wide default (`platformSettings.changeAgentTokenLimits`).
  const DEFAULT_TOKEN_LIMITS = { basic: 50000, medium: 30000, complex: 15000 }

  function getChangeAgentInfo() {
    const override = account?.changeAgentTokenLimitsOverride
    const platform = platformSettings?.changeAgentTokenLimits || DEFAULT_TOKEN_LIMITS
    const limits = {
      basic:   override?.basic   ?? platform.basic   ?? DEFAULT_TOKEN_LIMITS.basic,
      medium:  override?.medium  ?? platform.medium  ?? DEFAULT_TOKEN_LIMITS.medium,
      complex: override?.complex ?? platform.complex ?? DEFAULT_TOKEN_LIMITS.complex,
    }
    const month = new Date().toISOString().slice(0, 7)
    const entry = (account?.changeAgentUsage || []).find(e => e.month === month)
    const used = {
      basic:   entry?.basicUsed   || 0,
      medium:  entry?.mediumUsed  || 0,
      complex: entry?.complexUsed || 0,
    }
    const remaining = {
      basic:   Math.max(0, limits.basic   - used.basic),
      medium:  Math.max(0, limits.medium  - used.medium),
      complex: Math.max(0, limits.complex - used.complex),
    }
    return {
      limits, used, remaining,
      model: platformSettings?.changeAgentModel || 'gpt-4o-mini',
      // Legacy fields for backwards-compat
      limit: limits.basic + limits.medium + limits.complex,
    }
  }

  function useChangeAgentSlot(category = 'medium', tokens = 0) {
    const month = new Date().toISOString().slice(0, 7)
    const usedField = `${category}Used`
    optimistic(acc => {
      if (!acc.changeAgentUsage) acc.changeAgentUsage = []
      const i = acc.changeAgentUsage.findIndex(e => e.month === month)
      if (i !== -1) {
        acc.changeAgentUsage[i].used = (acc.changeAgentUsage[i].used || 0) + 1
        acc.changeAgentUsage[i][usedField] = (acc.changeAgentUsage[i][usedField] || 0) + tokens
      } else {
        acc.changeAgentUsage.push({ month, used: 1, basicUsed: 0, mediumUsed: 0, complexUsed: 0, [usedField]: tokens })
      }
    }, () => api.post(`/api/accounts/${accountId}/change-agent-usage`, { category, tokens }))
  }

  return (
    <Ctx.Provider value={{
      account, db, reloadDB, reloadConvos,
      allAgentAccounts, switchToAgent,
      pendingOpen, openConversation, consumePendingOpen,
      visibleAgents, selectedAgent, selectedAgentId, setSelectedAgentId,
      totalUnread, getConvos, getAllGuestNames, markRead, markUnread, setConvoLabels, assignConvo, toggleAI, setLocalVar,
      updateAgent, deleteAgent,
      addPrompt, updatePrompt, setActivePrompt, deletePrompt,
      addChannel, updateChannel, removeChannel, getChannelLimit, canAdd,
      addLink, deleteLink,
      setOpenAIKey, setDeepseekKey, setAnthropicKey,
      addMember, updateMember, deleteMember, addRole, updateRole, deleteRole,
      addLabel, updateLabel, deleteLabel,
      addPipeline, updatePipeline, deletePipeline, addStage, deleteStage,
      addCard, updateCard, moveCard, moveCardToPipeline, deleteCard,
      linkConvoToPipeline, unlinkConvoFromPipeline,
      addVariable, updateVariable, deleteVariable,
      addAITool, updateAITool, deleteAITool, assignToolToAgent, removeToolFromAgent,
      addFlow, updateFlow, deleteFlow, importFlow, copyFlowToAccount,
      accessibleAccounts: allAccountIds.map(id => accountsMap[id]).filter(Boolean),
      setAgentWhatsAppConfig,
      updateAgentRag,
      getChangeAgentInfo, useChangeAgentSlot,
      platformSettings,
      effectiveKeys, getEffectiveApiKey, getApiKeySource,
      reloadEffectiveKeys: loadEffectiveKeys,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAccount() { return useContext(Ctx) }
