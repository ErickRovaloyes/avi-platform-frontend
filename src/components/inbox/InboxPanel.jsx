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
import MediaMessage from '../media/MediaMessage'
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
  const { account, selectedAgent, getConvos, markRead, setConvoLabels, assignConvo, toggleAI, reloadConvos, pendingOpen, consumePendingOpen } = useAccount()
  const replyRef = useRef(null)
  const [selectedConvId, setSelectedConvId] = useState(null)
  const [reply, setReply] = useState('')
  const [showLabels, setShowLabels] = useState(false)
  const [showPipelineModal, setShowPipelineModal] = useState(false)
  const [showSidePanel, setShowSidePanel] = useState(false)
  const [showRunFlow, setShowRunFlow] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [channelFilter, setChannelFilter] = useState(null)
  const [skinId, setSkinId] = useState('auto')
  const [showSkinMenu, setShowSkinMenu] = useState(false)
  const bottomRef = useRef(null)
  const skinMenuRef = useRef(null)

  const allConvos = getConvos(selectedAgent?.id) || []
  const convos = channelFilter ? allConvos.filter(c => c.channel === channelFilter) : allConvos
  const selectedConv = convos.find(c => c.id === selectedConvId)

  // Channels that have at least one conversation
  const activeChannelTypes = [...new Set(allConvos.map(c => c.channel || 'webchat').filter(Boolean))]
  const CHANNEL_LABELS = { webchat: '🌐 Web', whatsapp: '📱 WhatsApp', messenger: '💬 Messenger', instagram: '📸 Instagram', test: '🧪 Test' }

  useEffect(() => {
    if (convos.length > 0 && !selectedConvId) setSelectedConvId(convos[0]?.id)
  }, [convos.length])

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

  async function sendReply() {
    if (!reply.trim() || !selectedConvId || !selectedAgent || !account) return
    const text = reply.trim()
    setReply('')
    try {
      // El backend entrega al canal real (WhatsApp/Messenger/IG) y persiste el
      // mensaje; la UI se actualiza por socket (message:new).
      await sendManualMessage(account.id, selectedAgent.id, selectedConvId, text, session?.name || 'Asesor')
    } catch (e) {
      setReply(text) // restaurar para reintentar
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
      {/* ── Conversation list ── */}
      <div className={s.convList}>
        <div className={s.listHdr}>
          <span>{convos.length} chat{convos.length !== 1 ? 's' : ''}{channelFilter && ` · ${CHANNEL_LABELS[channelFilter] || channelFilter}`}</span>
        </div>
        <div className={s.channelFilters}>
          <button className={`${s.filterChip} ${!channelFilter ? s.filterActive : ''}`} onClick={() => setChannelFilter(null)}>Todos</button>
          {activeChannelTypes.map(ch => (
            <button key={ch} className={`${s.filterChip} ${channelFilter === ch ? s.filterActive : ''}`} onClick={() => setChannelFilter(ch)}>
              {CHANNEL_LABELS[ch] || ch}
            </button>
          ))}
        </div>
        {convos.length === 0 && channelFilter && (
          <div className={s.noFilterResults}>
            Sin chats en este canal.
            <button className={s.clearFilterBtn} onClick={() => setChannelFilter(null)}>Ver todos</button>
          </div>
        )}
        {convos.map(conv => {
          const convLabels = (conv.labels || []).map(getLabel).filter(Boolean)
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
                <div className={s.cPreview}>{conv.preview || 'Sin mensajes'}</div>
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
                {selectedConv.messages.map((msg, i) => {
                  const isUser = msg.sender === 'user'
                  const isAI = msg.sender === 'ai' || (msg.role === 'assistant' && msg.sender !== 'human')
                  const isHuman = msg.sender === 'human'
                  const isRight = isAI || isHuman
                  const fromFlow = msg.fromFlow
                  return (
                    <div key={i} className={`${s.msgGroup} ${isRight ? s.msgRight : s.msgLeft}`}>
                      <div className={s.senderTag}>
                        {isUser && <span className={`${s.tagUser} skinTag`}>👤 {msg.senderName || selectedConv.guestName}</span>}
                        {isAI && <span className={`${s.tagAI} skinTag`}>🤖 Agente IA{fromFlow ? ' · flujo' : ''}</span>}
                        {isHuman && <span className={`${s.tagHuman} skinTag`}>💬 {msg.senderName || 'Asesor'}</span>}
                      </div>
                      <div className={`${s.msg} ${isUser ? `${s.msgUser} skinMsgUser` : isAI ? `${s.msgAI} skinMsgAI` : `${s.msgHuman} skinMsgHuman`} ${fromFlow ? s.msgFlow : ''}`}>
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
                        {msg.content && <div style={{ marginTop: msg.mediaId ? 6 : 0 }}>{msg.content}</div>}
                      </div>
                      <div className={`${s.msgTime} skinChatTime`}>
                        {fmt(msg.ts)}
                        {isRight && msg.status && <MsgStatus status={msg.status} />}
                      </div>
                    </div>
                  )
                })}
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
          <div className={`${s.inputArea} skinInputArea`}>
            <div className={s.inputLabel}>
              Respondiendo como <strong>{session?.name}</strong>
              {selectedConv.aiEnabled === false && <span className={s.aiOffBadge}> · IA desactivada</span>}
              {selectedConv.flowRunning && <span className={s.flowRunningLabel}> · Flujo ejecutándose...</span>}
            </div>
            <div className={s.inputRow}>
              <MediaInput
                accId={account?.id}
                agId={selectedAgent?.id}
                convId={selectedConvId}
                sender="human"
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
