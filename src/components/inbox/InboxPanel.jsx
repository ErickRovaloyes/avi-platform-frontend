import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAccount } from '../../context/AccountContext'
import { appendMsg, appendDebugEntry, sendManualMessage } from '../../lib/storage'
import PipelineConvoModal from '../pipeline/PipelineConvoModal'
import ConvSidePanel from './ConvSidePanel'
import RunFlowModal from './RunFlowModal'
import WhatsAppTemplateModal from './WhatsAppTemplateModal'
import PresenceIndicator from './PresenceIndicator'
import MediaInput   from '../media/MediaInput'
import StickerPicker from './StickerPicker'
import MediaMessage from '../media/MediaMessage'
import FormattedMessage from '../common/FormattedMessage'
import CalendarMessage from '../common/CalendarMessage'
import ChatToolbar  from '../chat/ChatToolbar'
import s from './InboxPanel.module.css'
import t from './ChatThemes.module.css'

// ── Chat skin definitions ────────────────────────────────────────────────────
// Each skin maps to a CSS class in ChatThemes.module.css. The default skin for
// a conversation is the one matching its source channel; the asesor can pick a
// different one from the dropdown in the chat header — the preference is saved
// locally per (user, conversation) so it never affects other team members.
const SKINS = [
  { id: 'auto',      label: 'Auto (canal)', icon: '🎨', swatch: 'linear-gradient(135deg, #22d98a, #4fa8ff, #e1306c)' },
  { id: 'webchat',   label: 'Webchat',      icon: '🌐', swatch: '#1f2030',                                            cls: 'themeWebchat' },
  { id: 'whatsapp',  label: 'WhatsApp',     icon: '📱', swatch: '#efeae2 linear-gradient(0deg,#008069 30%,#efeae2 30%)', cls: 'themeWhatsapp' },
  { id: 'messenger', label: 'Messenger',    icon: '💬', swatch: 'linear-gradient(135deg,#fff 50%,#0084ff 50%)',         cls: 'themeMessenger' },
  { id: 'instagram', label: 'Instagram',    icon: '📸', swatch: 'linear-gradient(135deg,#833ab4,#c13584,#e1306c,#fd1d1d)', cls: 'themeInstagram' },
]

function channelToSkinId(channel) {
  if (channel === 'whatsapp')  return 'whatsapp'
  if (channel === 'messenger') return 'messenger'
  if (channel === 'instagram') return 'instagram'
  return 'webchat'
}

const WA_WINDOW_MS = 24 * 60 * 60 * 1000
// Estado de la ventana de servicio de 24h de WhatsApp. Se reinicia con cada
// mensaje ENTRANTE del cliente; fuera de ella solo se permiten plantillas/flujo.
function waWindowState(conv) {
  if (!conv || conv.channel !== 'whatsapp') return null
  let lastTs = 0
  for (const m of conv.messages || []) { if (m.sender === 'user' && (m.ts || 0) > lastTs) lastTs = m.ts || 0 }
  const expiresAt = lastTs ? lastTs + WA_WINDOW_MS : 0
  return { lastTs, expiresAt, open: !!lastTs && Date.now() < expiresAt }
}
function fmtRemaining(ms) {
  if (ms <= 0) return ''
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

const EMPTY_FILTERS = { q: '', aiState: 'all', labelId: '', assignee: 'all', unread: false, flowRunning: false }
function countActiveFilters(f) {
  let n = 0
  if (f.q.trim()) n++
  if (f.aiState !== 'all') n++
  if (f.labelId) n++
  if (f.assignee !== 'all') n++
  if (f.unread) n++
  if (f.flowRunning) n++
  return n
}
// Aplica los filtros avanzados (parámetros del asistente) sobre la lista de chats.
function applyConvFilters(list, f) {
  let out = list
  const q = f.q.trim().toLowerCase()
  if (q) out = out.filter(c =>
    (c.guestName || '').toLowerCase().includes(q) ||
    (c.preview || '').toLowerCase().includes(q) ||
    (c.messages || []).some(m => (m.content || '').toLowerCase().includes(q))
  )
  if (f.aiState === 'on')  out = out.filter(c => c.aiEnabled !== false)
  if (f.aiState === 'off') out = out.filter(c => c.aiEnabled === false)
  if (f.labelId)           out = out.filter(c => (c.labels || []).includes(f.labelId))
  if (f.assignee === 'unassigned') out = out.filter(c => !c.assignedTo)
  else if (f.assignee !== 'all')   out = out.filter(c => (c.assignedTo?.id || c.assignedTo) === f.assignee)
  if (f.unread)            out = out.filter(c => c.unread)
  if (f.flowRunning)       out = out.filter(c => c.flowRunning)
  return out
}
// Filtros rápidos del riel izquierdo del inbox.
function applyQuickFilter(list, qf, myId) {
  if (qf === 'mine')   return list.filter(c => (c.assignedTo?.id || c.assignedTo) === myId)
  if (qf === 'human')  return list.filter(c => c.aiEnabled === false)
  if (qf === 'bot')    return list.filter(c => c.aiEnabled !== false)
  if (qf === 'unreplied') return list.filter(c => {
    if (c.unread) return true
    const msgs = c.messages || []
    const last = msgs[msgs.length - 1]
    return last && (last.sender === 'user' || last.role === 'user')
  })
  return list
}
const QUICK_FILTERS = [
  { id: 'all',       icon: '💬', label: 'Todas las conversaciones' },
  { id: 'mine',      icon: '🙋', label: 'Asignadas a mí' },
  { id: 'unreplied', icon: '⏳', label: 'Sin responder' },
  { id: 'human',     icon: '👤', label: 'Transferidas a humano' },
  { id: 'bot',       icon: '🤖', label: 'Atendidas por bot' },
]
function skinKey(userId, convId) { return `avi_chat_skin_${userId || 'anon'}_${convId}` }
function loadSkin(userId, convId) {
  try { return localStorage.getItem(skinKey(userId, convId)) || 'auto' } catch { return 'auto' }
}
function saveSkin(userId, convId, skinId) {
  try {
    if (skinId === 'auto') localStorage.removeItem(skinKey(userId, convId))
    else localStorage.setItem(skinKey(userId, convId), skinId)
  } catch {}
}

export default function InboxPanel() {
  const { session } = useAuth()
  const { account, selectedAgent, getConvos, markRead, markUnread, setConvoLabels, assignConvo, toggleAI, reloadConvos, pendingOpen, consumePendingOpen } = useAccount()
  const replyRef = useRef(null)
  const [selectedConvId, setSelectedConvId] = useState(null)
  const [reply, setReply] = useState('')
  const [replyingTo, setReplyingTo] = useState(null) // mensaje citado al responder (cita)
  const [showLabels, setShowLabels] = useState(false)
  const [showPipelineModal, setShowPipelineModal] = useState(false)
  const [showSidePanel, setShowSidePanel] = useState(false)
  const [showRunFlow, setShowRunFlow] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [debugMode, setDebugMode] = useState(false)
  const [channelFilter, setChannelFilter] = useState(null)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [quickFilter, setQuickFilter] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [, setNowTick] = useState(0) // refresca el estado de la ventana de 24h
  const [skinId, setSkinId] = useState('auto')
  const [showSkinMenu, setShowSkinMenu] = useState(false)
  const bottomRef = useRef(null)
  const skinMenuRef = useRef(null)

  const allConvos = getConvos(selectedAgent?.id) || []
  const byChannel = channelFilter ? allConvos.filter(c => c.channel === channelFilter) : allConvos
  const activeFilterCount = countActiveFilters(filters)
  const convosBase = activeFilterCount ? applyConvFilters(byChannel, filters) : byChannel
  const convos = applyQuickFilter(convosBase, quickFilter, session?.id)
  const quickCounts = {
    all: byChannel.length,
    mine: byChannel.filter(c => (c.assignedTo?.id || c.assignedTo) === session?.id).length,
    unreplied: applyQuickFilter(byChannel, 'unreplied', session?.id).length,
    human: byChannel.filter(c => c.aiEnabled === false).length,
    bot: byChannel.filter(c => c.aiEnabled !== false).length,
  }
  const selectedConv = convos.find(c => c.id === selectedConvId)

  // Channels that have at least one conversation
  const activeChannelTypes = [...new Set(allConvos.map(c => c.channel || 'webchat').filter(Boolean))]
  const CHANNEL_LABELS = { webchat: '🌐 Web', whatsapp: '📱 WhatsApp', messenger: '💬 Messenger', instagram: '📸 Instagram', test: '🧪 Test' }

  useEffect(() => {
    if (convos.length > 0 && !selectedConvId) setSelectedConvId(convos[0]?.id)
  }, [convos.length])

  // Tick cada minuto: mantiene actualizado el estado de la ventana de 24h de WA
  // (cuenta regresiva y transición abierta→cerrada sin esperar un nuevo evento).
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // Deep-link: abrir la conversación solicitada desde otra vista (tickets/pipeline)
  useEffect(() => {
    if (!pendingOpen?.convId) return
    if (pendingOpen.agentId && selectedAgent?.id !== pendingOpen.agentId) return // esperar al cambio de agente
    setSelectedConvId(pendingOpen.convId)
    setChannelFilter(null)
    consumePendingOpen?.()
  }, [pendingOpen?.ts, selectedAgent?.id])

  useEffect(() => {
    if (selectedConvId && !convos.find(c => c.id === selectedConvId)) {
      setSelectedConvId(convos[0]?.id || null)
    }
  }, [channelFilter])

  useEffect(() => {
    if (selectedConvId && selectedAgent) markRead(selectedAgent.id, selectedConvId)
  }, [selectedConvId])

  // En modo debug refrescamos la conversación para traer el debugLog actualizado
  // (los pasos de flujo se registran en BD; así aparecen casi en vivo).
  useEffect(() => {
    if (!debugMode || !selectedConvId) return
    reloadConvos()
    const iv = setInterval(() => reloadConvos(), 3000)
    return () => clearInterval(iv)
  }, [debugMode, selectedConvId])

  // Reload the chat skin preference whenever the user switches between conversations
  useEffect(() => {
    if (!selectedConvId) { setSkinId('auto'); return }
    setSkinId(loadSkin(session?.id, selectedConvId))
  }, [selectedConvId, session?.id])

  // Close the skin menu when clicking outside
  useEffect(() => {
    if (!showSkinMenu) return
    function onDocClick(e) { if (skinMenuRef.current && !skinMenuRef.current.contains(e.target)) setShowSkinMenu(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showSkinMenu])

  function applySkin(newId) {
    setSkinId(newId)
    saveSkin(session?.id, selectedConvId, newId)
    setShowSkinMenu(false)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedConv?.messages?.length])

  useEffect(() => { setReplyingTo(null) }, [selectedConvId])

  async function sendReply() {
    if (!reply.trim() || !selectedConvId || !selectedAgent || !account) return
    const w = waWindowState(selectedConv)
    if (w && !w.open) { alert('La ventana de 24 h de WhatsApp está cerrada. Solo puedes enviar una plantilla aprobada o ejecutar un flujo.'); return }
    const text = reply.trim()
    const quoted = replyingTo
    setReply(''); setReplyingTo(null)
    try {
      // El backend entrega al canal real (WhatsApp/Messenger/IG) y persiste el
      // mensaje; la UI se actualiza por socket (message:new).
      await sendManualMessage(account.id, selectedAgent.id, selectedConvId, text, session?.name || 'Asesor', quoted?.id)
    } catch (e) {
      setReply(text); setReplyingTo(quoted) // restaurar para reintentar
      alert(e?.message || 'No se pudo enviar el mensaje al canal.')
    }
  }

  function toggleLabel(labelId) {
    if (!selectedConv) return
    const cur = selectedConv.labels || []
    setConvoLabels(selectedAgent.id, selectedConvId,
      cur.includes(labelId) ? cur.filter(l => l !== labelId) : [...cur, labelId])
  }

  const labels = account?.labels || []
  const getLabel = id => labels.find(l => l.id === id)
  const fmt = ts => ts ? new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : ''
  const fmtDate = ts => ts ? new Date(ts).toLocaleDateString('es', { day: '2-digit', month: 'short' }) : ''

  if (!selectedAgent) return <div className={s.empty}><span>Selecciona un agente</span></div>
  if (allConvos.length === 0) return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>💬</span>
      <p>Sin conversaciones</p>
      <small>Comparte un link de webchat para recibir mensajes</small>
    </div>
  )

  return (
    <div className={s.inbox}>
      {/* ── Riel de filtros (donde estaba la barra de cuentas) ── */}
      <div style={{ width: 210, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg2)', overflowY: 'auto', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', padding: '4px 8px 6px' }}>Filtros</div>
        {QUICK_FILTERS.map(q => {
          const on = quickFilter === q.id
          return (
            <button key={q.id} onClick={() => setQuickFilter(q.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                background: on ? 'var(--accent-dim)' : 'transparent', border: '1px solid ' + (on ? 'var(--accent)' : 'transparent'),
                color: on ? 'var(--accent)' : 'var(--text2)', fontSize: 12.5 }}>
              <span>{q.icon}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.label}</span>
              <span style={{ fontSize: 10, color: on ? 'var(--accent)' : 'var(--text3)', fontWeight: 600 }}>{quickCounts[q.id] ?? 0}</span>
            </button>
          )
        })}
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', padding: '14px 8px 6px' }}>Filtros guardados</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', padding: '2px 8px' }}>Próximamente: guardar filtros personales y globales.</div>
      </div>
      {/* ── Conversation list ── */}
      <div className={s.convList}>
        <div className={s.listHdr} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{convos.length} chat{convos.length !== 1 ? 's' : ''}{channelFilter && ` · ${CHANNEL_LABELS[channelFilter] || channelFilter}`}</span>
          <button className={s.advFilterBtn} onClick={() => setShowFilters(v => !v)} title="Filtros avanzados"
            style={activeFilterCount ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : undefined}>
            ⛃ Filtros{activeFilterCount ? ` · ${activeFilterCount}` : ''}
          </button>
        </div>
        {showFilters && (
          <div className={s.filtersPanel}>
            <input className={s.filterSearch} placeholder="🔎 Buscar en nombre y mensajes…" value={filters.q}
              onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} />
            <div className={s.filterGrid}>
              <label className={s.filterLabel}>IA
                <select value={filters.aiState} onChange={e => setFilters(f => ({ ...f, aiState: e.target.value }))}>
                  <option value="all">Todas</option>
                  <option value="on">IA activa</option>
                  <option value="off">IA desactivada</option>
                </select>
              </label>
              <label className={s.filterLabel}>Etiqueta
                <select value={filters.labelId} onChange={e => setFilters(f => ({ ...f, labelId: e.target.value }))}>
                  <option value="">Todas</option>
                  {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <label className={s.filterLabel}>Asignado
                <select value={filters.assignee} onChange={e => setFilters(f => ({ ...f, assignee: e.target.value }))}>
                  <option value="all">Todos</option>
                  <option value="unassigned">Sin asignar</option>
                  {(account?.members || []).map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                </select>
              </label>
            </div>
            <div className={s.filterChecks}>
              <label><input type="checkbox" checked={filters.unread} onChange={e => setFilters(f => ({ ...f, unread: e.target.checked }))} /> No leídos</label>
              <label><input type="checkbox" checked={filters.flowRunning} onChange={e => setFilters(f => ({ ...f, flowRunning: e.target.checked }))} /> Flujo activo</label>
              {activeFilterCount > 0 && <button className={s.clearFilterBtn} onClick={() => setFilters(EMPTY_FILTERS)}>Limpiar</button>}
            </div>
          </div>
        )}
        <div className={s.channelFilters}>
          <button className={`${s.filterChip} ${!channelFilter ? s.filterActive : ''}`} onClick={() => setChannelFilter(null)}>Todos</button>
          {activeChannelTypes.map(ch => (
            <button key={ch} className={`${s.filterChip} ${channelFilter === ch ? s.filterActive : ''}`} onClick={() => setChannelFilter(ch)}>
              {CHANNEL_LABELS[ch] || ch}
            </button>
          ))}
        </div>
        {convos.length === 0 && activeFilterCount > 0 && (
          <div className={s.noFilterResults}>
            Ningún chat coincide con los filtros.
            <button className={s.clearFilterBtn} onClick={() => setFilters(EMPTY_FILTERS)}>Limpiar filtros</button>
          </div>
        )}
        {convos.length === 0 && channelFilter && (
          <div className={s.noFilterResults}>
            Sin chats en este canal.
            <button className={s.clearFilterBtn} onClick={() => setChannelFilter(null)}>Ver todos</button>
          </div>
        )}
        {convos.map(conv => {
          const convLabels = (conv.labels || []).map(getLabel).filter(Boolean)
          const lastMsg = conv.messages?.[conv.messages.length - 1]
          const lastOutbound = lastMsg && (lastMsg.sender === 'human' || lastMsg.sender === 'ai')
          return (
            <button key={conv.id}
              className={`${s.convItem} ${conv.id === selectedConvId ? s.convActive : ''}`}
              onClick={() => setSelectedConvId(conv.id)}>
              <div className={s.avatar}>{conv.initials}</div>
              <div className={s.cMeta}>
                <div className={s.cTop}>
                  <span className={s.cName}>{conv.guestName}</span>
                  {conv.unread && <span className={s.unreadDot} />}
                  {conv.flowRunning && <span className={s.flowBadge}>⚡</span>}
                  {conv.channel === 'whatsapp' && <span className={s.waBadge}>WA</span>}
                  {conv.channel === 'messenger' && <span className={s.waBadge} style={{background:'rgba(79,168,255,.15)',color:'#4fa8ff'}}>FB</span>}
                  {conv.channel === 'instagram' && <span className={s.waBadge} style={{background:'rgba(225,48,108,.15)',color:'#e1306c'}}>IG</span>}
                  {conv.channel === 'test' && <span className={s.waBadge} style={{background:'rgba(245,166,35,.15)',color:'#f5a623'}}>TEST</span>}
                  <span className={s.cTime}>{fmtDate(conv.updatedAt)}</span>
                  {/* Marcar leído / no leído manualmente */}
                  <span
                    role="button"
                    title={conv.unread ? 'Marcar como leído' : 'Marcar como no leído'}
                    onClick={(e) => { e.stopPropagation(); conv.unread ? markRead(selectedAgent.id, conv.id) : markUnread(selectedAgent.id, conv.id) }}
                    style={{ marginLeft: 4, cursor: 'pointer', fontSize: 12, opacity: .65 }}>
                    {conv.unread ? '✓' : '◌'}
                  </span>
                </div>
                {convLabels.length > 0 && (
                  <div className={s.cLabels}>
                    {convLabels.slice(0, 2).map(l => (
                      <span key={l.id} className={s.miniLabel}
                        style={{ background: l.color + '22', color: l.color, borderColor: l.color + '44' }}>
                        {l.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className={s.cPreview}>
                  {lastOutbound && lastMsg.status && <MsgStatus status={lastMsg.status} />}
                  {' '}{conv.preview || 'Sin mensajes'}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Chat area ── */}
      {selectedConv ? (() => {
        // Resolve the actual skin class to apply: explicit user pick > channel-default
        const effectiveSkinId = skinId === 'auto' ? channelToSkinId(selectedConv.channel) : skinId
        const skinDef         = SKINS.find(x => x.id === effectiveSkinId) || SKINS[1]
        const themeClass      = skinDef.cls ? `${t.themed} ${t[skinDef.cls]}` : ''
        // Línea de tiempo: mensajes + (en modo debug) entradas del debugLog,
        // ordenadas por ts para que los pasos del flujo aparezcan ENTRE mensajes.
        const timeline = debugMode
          ? [
              ...(selectedConv.messages || []).map((m, i) => ({ kind: 'msg', ts: m.ts || 0, m, i })),
              ...(selectedConv.debugLog || []).map((d, i) => ({ kind: 'debug', ts: d.ts || 0, d, i })),
            ].sort((a, b) => (a.ts - b.ts) || (a.kind === 'debug' ? -1 : 1))
          : (selectedConv.messages || []).map((m, i) => ({ kind: 'msg', ts: m.ts || 0, m, i }))
        return (
        <div className={`${s.chatArea} ${themeClass}`}>
          {/* Header */}
          <div className={`${s.chatHdr} skinHeader`}>
            <div className={s.chatAvatar}>{selectedConv.initials}</div>
            <div className={s.chatInfo}>
              <div className={s.chatName}>{selectedConv.guestName}</div>
              <div className={s.chatSub}>
                {selectedConv.channel === 'whatsapp' ? '📱 WhatsApp' : selectedConv.channel === 'messenger' ? '💬 Messenger' : selectedConv.channel === 'instagram' ? '📸 Instagram' : selectedConv.channel === 'test' ? '🧪 Prueba' : '🌐 Webchat'} · {fmtDate(selectedConv.createdAt)}
                {selectedConv.flowRunning && <span className={s.flowRunningBadge}>⚡ Flujo activo</span>}
              </div>
            </div>

            {/* Presence indicator (with multi-asesor list + assignment chip) */}
            <PresenceIndicator
              accId={account?.id}
              agId={selectedAgent?.id}
              convId={selectedConvId}
              userId={session?.id}
              userName={session?.name || 'Asesor'}
              assignedTo={selectedConv.assignedTo}
            />

            {/* Active labels */}
            <div className={s.activeLabels}>
              {(selectedConv.labels || []).map(getLabel).filter(Boolean).map(l => (
                <span key={l.id} className={s.activeLabel}
                  style={{ background: l.color + '22', color: l.color, borderColor: l.color + '55' }}>
                  {l.name}
                </span>
              ))}
            </div>

            {/* Chat toolbar: quick replies, emojis, assign, export */}
            <ChatToolbar
              accountId={account?.id}
              conv={selectedConv}
              members={account?.members || []}
              session={session}
              currentAssignee={selectedConv.assignedTo}
              onInsertText={txt => {
                setReply(prev => prev + (prev && !prev.endsWith(' ') && !txt.startsWith(' ') ? ' ' : '') + txt)
                setTimeout(() => replyRef.current?.focus(), 50)
              }}
              onAssign={(member) => assignConvo(selectedAgent.id, selectedConvId, member)}
            />

            {/* Action buttons */}
            <button
              className={s.iconBtn}
              onClick={() => setDebugMode(d => !d)}
              title="Modo debug: ver flujos y acciones entre cada mensaje"
              style={debugMode ? { background: 'rgba(245,166,35,.18)', borderColor: 'rgba(245,166,35,.5)', color: '#f5a623' } : undefined}
            >🐛 {debugMode ? 'ON' : ''}</button>
            <button className={s.iconBtn} onClick={() => setShowRunFlow(true)} title="Ejecutar flujo">⚡</button>
            <button className={s.iconBtn} onClick={() => setShowPipelineModal(true)} title="Pipeline">📊</button>
            <button
              className={`${s.aiToggle} ${selectedConv.aiEnabled !== false ? s.aiOn : s.aiOff}`}
              onClick={() => toggleAI(selectedAgent.id, selectedConvId, selectedConv.aiEnabled === false)}
              title="Toggle IA"
            >
              🤖 {selectedConv.aiEnabled !== false ? 'ON' : 'OFF'}
            </button>

            {/* Labels picker */}
            <div className={s.labelPicker}>
              <button className={s.iconBtn} onClick={() => setShowLabels(!showLabels)}>🏷</button>
              {showLabels && (
                <div className={s.labelDrop}>
                  <div className={s.labelDropTitle}>Etiquetas CRM</div>
                  {labels.map(l => {
                    const active = (selectedConv.labels || []).includes(l.id)
                    return (
                      <button key={l.id} className={`${s.labelOpt} ${active ? s.labelOptActive : ''}`}
                        onClick={() => toggleLabel(l.id)}>
                        <span className={s.lDot} style={{ background: l.color }} />
                        {l.name}
                        {active && <span className={s.lCheck}>✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Skin / appearance picker (per-user, per-conversation, local only) */}
            <div className={t.themeMenuWrap} ref={skinMenuRef}>
              <button
                className={`${s.iconBtn} iconButtonReset`}
                onClick={() => setShowSkinMenu(o => !o)}
                title="Cambiar apariencia del chat (solo para ti)"
              >🎨</button>
              {showSkinMenu && (
                <div className={t.themeMenu}>
                  <div className={t.themeMenuTitle}>Apariencia del chat</div>
                  {SKINS.map(sk => {
                    const isActive = skinId === sk.id
                    const isChannelDefault = sk.id !== 'auto' && sk.id === channelToSkinId(selectedConv.channel)
                    return (
                      <button key={sk.id}
                        className={`${t.themeMenuItem} ${isActive ? t.themeMenuItemActive : ''}`}
                        onClick={() => applySkin(sk.id)}
                      >
                        <span className={t.themeSwatch} style={{ background: sk.swatch }} />
                        <span>{sk.icon} {sk.label}</span>
                        {isChannelDefault && skinId === 'auto' && <span className={t.themeMenuItemDefault}>activo</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Side panel toggle */}
            <button
              className={`${s.iconBtn} iconButtonReset ${showSidePanel ? s.iconBtnActive : ''}`}
              onClick={() => setShowSidePanel(!showSidePanel)}
              title="Panel de usuario"
            >⊞</button>
          </div>

          {/* Chat body + side panel */}
          <div className={s.chatBody}>
            <div className={s.messagesWrap}>
              <div className={`${s.messages} skinMessages`} onClick={() => setShowLabels(false)}>
                {selectedConv.messages.length === 0 && (
                  <div className={s.noMsgs}>Esperando mensajes...</div>
                )}
                {timeline.map((item) => {
                  if (item.kind === 'debug') {
                    return <DebugStep key={`dbg_${item.i}_${item.ts}`} entry={item.d} />
                  }
                  const msg = item.m
                  const i = item.i
                  const isUser = msg.sender === 'user'
                  const isAI = msg.sender === 'ai' || (msg.role === 'assistant' && msg.sender !== 'human')
                  const isHuman = msg.sender === 'human'
                  const isRight = isAI || isHuman
                  const fromFlow = msg.fromFlow
                  return (
                    <div key={`msg_${i}`} className={`${s.msgGroup} ${isRight ? s.msgRight : s.msgLeft}`}>
                      <div className={s.senderTag}>
                        {isUser && <span className={`${s.tagUser} skinTag`}>👤 {msg.senderName || selectedConv.guestName}</span>}
                        {isAI && <span className={`${s.tagAI} skinTag`}>🤖 Agente IA{fromFlow ? ' · flujo' : ''}</span>}
                        {isHuman && <span className={`${s.tagHuman} skinTag`}>💬 {msg.senderName || 'Asesor'}</span>}
                        {msg.fromTemplate && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,217,138,.14)', color: '#22d98a', border: '1px solid rgba(34,217,138,.4)' }}>
                            📋 Plantilla{msg.templateName ? `: ${msg.templateName}` : ''}
                          </span>
                        )}
                      </div>
                      <div
                        className={`${s.msg} ${isUser ? `${s.msgUser} skinMsgUser` : isAI ? `${s.msgAI} skinMsgAI` : `${s.msgHuman} skinMsgHuman`} ${fromFlow ? s.msgFlow : ''}`}
                        style={msg.status === 'failed' ? { background: 'rgba(255,95,95,.14)', border: '1px solid rgba(255,95,95,.55)' } : undefined}
                        title={msg.status === 'failed' ? `No se entregó: ${msg.sendError || 'error desconocido'}` : undefined}
                      >
                        {msg.replyTo && (
                          <div style={{ borderLeft: '3px solid var(--accent)', background: 'rgba(0,0,0,.08)', borderRadius: 6, padding: '4px 8px', marginBottom: 5, fontSize: 12, color: 'var(--text2)' }}>
                            <div style={{ fontWeight: 600, fontSize: 10, opacity: .85 }}>↩ {msg.replyTo.sender === 'user' ? 'Cliente' : 'Asistente'}</div>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{msg.replyTo.content || (msg.replyTo.kind ? `[${msg.replyTo.kind}]` : '…')}</div>
                          </div>
                        )}
                        {msg.status === 'failed' && (
                          <div style={{ fontSize: 11, color: '#ff7676', fontWeight: 600, marginBottom: 3 }}>
                            ⚠ No entregado{msg.sendError ? ` — ${msg.sendError}` : ''}
                          </div>
                        )}
                        {msg.mediaId && (
                          <MediaMessage
                            accId={account?.id}
                            mediaId={msg.mediaId}
                            kind={msg.kind}
                            mime={msg.mime}
                            filename={msg.filename}
                            sizeBytes={msg.sizeBytes}
                          />
                        )}
                        {msg.kind === 'audio' && !msg.content && msg.transcriptionError && (
                          <div style={{ fontSize: 11, color: '#f5a623', marginTop: 6 }}>
                            ⚠ No se pudo transcribir el audio — {msg.transcriptionError}
                          </div>
                        )}
                        {msg.calendar
                          ? <div style={{ marginTop: msg.mediaId ? 6 : 0 }}><CalendarMessage calendar={msg.calendar} text={msg.content} /></div>
                          : (msg.content && <div style={{ marginTop: msg.mediaId ? 6 : 0 }}><FormattedMessage text={msg.content} /></div>)}
                      </div>
                      <div className={`${s.msgTime} skinChatTime`}>
                        {fmt(msg.ts)}
                        {isRight && msg.status && <MsgStatus status={msg.status} />}
                        <button onClick={() => { setReplyingTo(msg); replyRef.current?.focus() }} title="Responder citando este mensaje"
                          style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 11, padding: '0 2px', opacity: .6 }}>↩</button>
                      </div>
                    </div>
                  )
                })}
                {selectedConv.flowRunning && (
                  <div className={`${s.msgGroup} ${s.msgRight}`}>
                    <div className={s.senderTag}><span className={`${s.tagAI} skinTag`}>🤖 Agente IA</span></div>
                    <div className={`${s.msg} ${s.msgAI} skinMsgAI ${s.typingBubble}`}>
                      <span className={s.typingDots}><span></span><span></span><span></span></span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            {showSidePanel && (
              <ConvSidePanel
                conv={selectedConv}
                agentId={selectedAgent?.id}
                onClose={() => setShowSidePanel(false)}
              />
            )}
          </div>

          {/* Reply input */}
          {(() => {
            const waWindow = waWindowState(selectedConv)
            const windowClosed = waWindow && !waWindow.open
            return (
              <div className={`${s.inputArea} skinInputArea`}>
                <div className={s.inputLabel}>
                  Respondiendo como <strong>{session?.name}</strong>
                  {selectedConv.aiEnabled === false && <span className={s.aiOffBadge}> · IA desactivada</span>}
                  {selectedConv.flowRunning && <span className={s.flowRunningLabel}> · Flujo ejecutándose...</span>}
                  {waWindow?.open && <span className={s.waOk}> · 🟢 Ventana 24 h: {fmtRemaining(waWindow.expiresAt - Date.now())} restantes</span>}
                </div>
                {windowClosed ? (
                  <div className={s.waClosed}>
                    <div className={s.waClosedMsg}>
                      🔒 La ventana de 24 h de WhatsApp está cerrada{waWindow.lastTs ? ` (último mensaje del cliente ${fmtDate(waWindow.lastTs)})` : ''}. No puedes enviar mensajes libres a este contacto. Solo puedes enviar una <strong>plantilla aprobada</strong> o ejecutar un <strong>flujo</strong>.
                    </div>
                    <div className={s.waClosedActions}>
                      <button className={s.waClosedBtn} onClick={() => setShowTemplates(true)}>📋 Enviar plantilla</button>
                      <button className={s.waClosedBtn} onClick={() => setShowRunFlow(true)}>⚡ Enviar flujo</button>
                    </div>
                  </div>
                ) : (
                  <div>
                  {replyingTo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', margin: '0 0 6px', background: 'var(--bg3)', borderLeft: '3px solid var(--accent)', borderRadius: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)' }}>↩ Respondiendo a {replyingTo.sender === 'user' ? (selectedConv.guestName || 'Cliente') : 'ti'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyingTo.content || (replyingTo.kind ? `[${replyingTo.kind}]` : '…')}</div>
                      </div>
                      <button onClick={() => setReplyingTo(null)} title="Cancelar" style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                  )}
                  <div className={s.inputRow}>
                    <MediaInput
                      accId={account?.id}
                      agId={selectedAgent?.id}
                      convId={selectedConvId}
                      sender="human"
                      senderName={session?.name || 'Asesor'}
                    />
                    <StickerPicker
                      accId={account?.id}
                      agId={selectedAgent?.id}
                      convId={selectedConvId}
                      senderName={session?.name || 'Asesor'}
                    />
                    {selectedConv.channel === 'whatsapp' && (
                      <button
                        className={`${s.sendBtn} skinSendBtn`}
                        title="Enviar plantilla de WhatsApp"
                        style={{ background: 'transparent', border: '1px solid var(--border2)' }}
                        onClick={() => setShowTemplates(true)}>📋</button>
                    )}
                    <input type="text" placeholder="Respuesta manual..." ref={replyRef}
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendReply()} />
                    <button className={`${s.sendBtn} skinSendBtn`} onClick={sendReply}>↑</button>
                  </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
        )
      })() : (
        <div className={s.noConv}>Selecciona una conversación</div>
      )}

      {/* Modals */}
      {showPipelineModal && selectedConv && (
        <PipelineConvoModal conv={selectedConv} agentId={selectedAgent?.id} onClose={() => setShowPipelineModal(false)} />
      )}
      {showTemplates && selectedConv && (
        <WhatsAppTemplateModal
          accId={account?.id}
          agentId={selectedAgent?.id}
          conv={selectedConv}
          onClose={() => setShowTemplates(false)}
          onSent={() => reloadConvos()}
        />
      )}
      {showRunFlow && selectedConv && (
        <RunFlowModal conv={selectedConv} agentId={selectedAgent?.id} onClose={() => setShowRunFlow(false)} />
      )}
    </div>
  )
}

// Paso del modo debug: chip centrado entre mensajes con categoría + valor.
// Cada tipo de acción tiene su propio color (flujo / paso / variable / etc).
const DEBUG_STYLE = {
  flow_start:   { cat: 'Flujo ejecutado',            icon: '⚡', color: '#7c6fff', bg: 'rgba(124,111,255,.12)', border: 'rgba(124,111,255,.4)' },
  flow_step:    { cat: 'Paso ejecutado',             icon: '▸', color: '#4fa8ff', bg: 'rgba(79,168,255,.12)',  border: 'rgba(79,168,255,.4)' },
  variable_set: { cat: 'Valor de variable cambiado', icon: '📝', color: '#22d98a', bg: 'rgba(34,217,138,.12)', border: 'rgba(34,217,138,.4)' },
  message_sent: { cat: 'Mensaje enviado',            icon: '💬', color: '#2dd4c8', bg: 'rgba(45,212,200,.12)', border: 'rgba(45,212,200,.4)' },
  tool_call:    { cat: 'Herramienta ejecutada',      icon: '🔧', color: '#f5a623', bg: 'rgba(245,166,35,.12)', border: 'rgba(245,166,35,.4)' },
  tool_result:  { cat: 'Resultado de herramienta',   icon: '✅', color: '#f5a623', bg: 'rgba(245,166,35,.12)', border: 'rgba(245,166,35,.4)' },
  ai_response:  { cat: 'Respuesta IA',               icon: '🤖', color: '#c179ff', bg: 'rgba(193,121,255,.12)', border: 'rgba(193,121,255,.4)' },
  error:        { cat: 'Error',                      icon: '❌', color: '#ff5f5f', bg: 'rgba(255,95,95,.12)',  border: 'rgba(255,95,95,.45)' },
  system:       { cat: 'Sistema',                    icon: 'ℹ️', color: '#4fa8ff', bg: 'rgba(79,168,255,.1)',  border: 'rgba(79,168,255,.3)' },
  flow_run:     { cat: 'Flujo',                      icon: '•', color: 'var(--text2)', bg: 'var(--bg3)', border: 'var(--border2)' },
}
function fmtDebugVal(v) {
  if (v === undefined || v === null || v === '') return '(vacío)'
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s.length > 300 ? s.slice(0, 300) + '…' : s
}
function DebugStep({ entry }) {
  const st = DEBUG_STYLE[entry.type] || { cat: entry.type || 'Acción', icon: '•', color: 'var(--text2)', bg: 'var(--bg3)', border: 'var(--border2)' }
  const d = entry.detail && typeof entry.detail === 'object' ? entry.detail : null
  const tooltip = entry.detail
    ? (typeof entry.detail === 'object' ? JSON.stringify(entry.detail, null, 2) : String(entry.detail))
    : ''

  const wrap = { alignSelf: 'center', margin: '4px auto', maxWidth: '86%', width: 'fit-content' }
  const box  = { background: st.bg, border: `1px solid ${st.border}`, borderRadius: 12, padding: '6px 12px', textAlign: 'center', minWidth: 180 }
  const catLine = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', color: st.color, fontWeight: 700, opacity: .9 }
  const subBox = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', fontSize: 12, color: 'var(--text1)', wordBreak: 'break-word', textAlign: 'left' }
  const subLabel = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', fontWeight: 700, marginBottom: 2 }

  // ── Flujo ejecutado: nombre + ID ───────────────────────────────────────────
  if (entry.type === 'flow_start') {
    return (
      <div style={wrap}><div style={box} title={tooltip}>
        <div style={catLine}>{st.icon} {st.cat}</div>
        <div style={{ fontSize: 13, color: 'var(--text1)', marginTop: 2, fontWeight: 600 }}>{entry.title || '(sin nombre)'}</div>
        {d?.flowId && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>ID: {d.flowId}</div>}
      </div></div>
    )
  }

  // ── Variable cambiada: cuadrito anterior + cuadrito nuevo ──────────────────
  if (entry.type === 'variable_set' && d) {
    return (
      <div style={wrap}><div style={box} title={tooltip}>
        <div style={catLine}>{st.icon} {st.cat}</div>
        <div style={{ fontSize: 13, color: 'var(--text1)', margin: '2px 0 6px', fontWeight: 600 }}>{d.name || entry.title}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
          <div style={{ ...subBox, flex: 1 }}>
            <div style={subLabel}>Anterior</div>
            <div>{fmtDebugVal(d.from)}</div>
          </div>
          <div style={{ alignSelf: 'center', color: st.color, fontWeight: 700 }}>→</div>
          <div style={{ ...subBox, flex: 1, borderColor: st.border }}>
            <div style={{ ...subLabel, color: st.color }}>Nuevo</div>
            <div>{fmtDebugVal(d.to)}</div>
          </div>
        </div>
      </div></div>
    )
  }

  // ── Mensaje enviado: muestra el texto en su cuadro ─────────────────────────
  if (entry.type === 'message_sent') {
    return (
      <div style={wrap}><div style={{ ...box, maxWidth: 420 }} title={tooltip}>
        <div style={catLine}>{st.icon} {st.cat}</div>
        <div style={{ ...subBox, marginTop: 4 }}>{fmtDebugVal(entry.title)}</div>
      </div></div>
    )
  }

  // ── Genérico (paso, herramienta, IA, error, sistema) ───────────────────────
  return (
    <div style={wrap}><div style={box} title={tooltip}>
      <div style={catLine}>{st.icon} {st.cat}</div>
      <div style={{ fontSize: 12, color: 'var(--text1)', marginTop: 2, wordBreak: 'break-word', lineHeight: 1.4 }}>
        {entry.title}
      </div>
    </div></div>
  )
}

// Indicador de estado de un mensaje saliente (estilo WhatsApp).
function MsgStatus({ status }) {
  if (status === 'failed') return <span title="No entregado" style={{ marginLeft: 6, color: '#ff5f5f' }}>⚠</span>
  const read = status === 'read'
  const double = status === 'delivered' || status === 'read'
  const color = read ? '#53bdeb' : 'var(--text3)'
  const label = status === 'read' ? 'Visto' : status === 'delivered' ? 'Entregado' : 'Enviado'
  return (
    <span title={label} style={{ marginLeft: 6, color, fontSize: 11, letterSpacing: '-2px' }}>
      {double ? '✓✓' : '✓'}
    </span>
  )
}
