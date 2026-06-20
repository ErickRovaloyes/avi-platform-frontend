import { useState, useEffect, useRef, useCallback } from 'react'
import {
  readTeamChat, sendTeamChatMessage,
  listTeamChannels, createTeamChannel, deleteTeamChannel, openTeamDM,
  uploadChatMedia,
} from '../../lib/storage'
import { subscribeTeamMessages, subscribeTeamChannels } from '../../lib/teamChatService'
import MediaInput from '../media/MediaInput'
import MediaMessage from '../media/MediaMessage'
import s from './TeamChatPanel.module.css'

export default function TeamChatPanel({ account, agents, session, selectedAgent }) {
  const accId = account?.id
  const myId  = session?.id
  const canManage = session?.type === 'superadmin' || !!session?.permissions?.admins

  const [activeChannel, setActiveChannel] = useState({ id: 'general', label: '# general', type: 'channel' })
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [customChannels, setCustomChannels] = useState([])
  const [dms, setDms]             = useState([])
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [showMemberPicker, setShowMemberPicker] = useState(false)
  const [unreadByChannel, setUnreadByChannel] = useState({})  // { channelId: count }
  const [toast, setToast]         = useState('')
  const bottomRef = useRef(null)
  const activeChannelRef = useRef(activeChannel)
  activeChannelRef.current = activeChannel

  const members = (account?.members || []).filter(m => m.id !== myId)

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2500) }

  // ── Load the list of channels + DMs ──────────────────────────────────────────
  const loadChannels = useCallback(async () => {
    if (!accId) return
    try {
      const { channels, dms } = await listTeamChannels(accId)
      setCustomChannels(channels || [])
      setDms(dms || [])
    } catch { setCustomChannels([]); setDms([]) }
  }, [accId])

  // ── Load messages for the active channel ─────────────────────────────────────
  const loadMessages = useCallback(async (channelId) => {
    if (!accId || !channelId) return
    try {
      const msgs = await readTeamChat(accId, channelId)
      setMessages(msgs || [])
    } catch { setMessages([]) }
  }, [accId])

  useEffect(() => { loadChannels() }, [loadChannels])
  useEffect(() => {
    loadMessages(activeChannel.id)
    // Clear pending indicator for the channel we just opened
    setUnreadByChannel(prev => {
      if (!prev[activeChannel.id]) return prev
      const next = { ...prev }; delete next[activeChannel.id]; return next
    })
  }, [activeChannel.id, loadMessages])

  // When the agent in the inbox changes, jump to that agent's channel
  useEffect(() => {
    if (selectedAgent) {
      setActiveChannel({ id: `ag_${selectedAgent.id}`, label: `# ${selectedAgent.name.toLowerCase()}`, type: 'channel' })
    }
  }, [selectedAgent?.id])

  // ── Real-time: new messages ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeTeamMessages(({ accId: evtAcc, msg }) => {
      if (evtAcc && evtAcc !== accId) return
      if (msg.channel !== activeChannelRef.current.id) {
        // Message for another channel/DM — mark it pending (unless it's my own)
        if (msg.authorId !== myId) {
          setUnreadByChannel(prev => ({ ...prev, [msg.channel]: (prev[msg.channel] || 0) + 1 }))
        }
        return
      }
      setMessages(prev => {
        // Replace a matching optimistic message, dedup by id
        if (prev.some(m => m.id === msg.id)) return prev
        const optimIdx = prev.findIndex(m => m._optimistic && m.authorId === msg.authorId && m.content === msg.content)
        if (optimIdx !== -1) {
          const copy = [...prev]; copy[optimIdx] = msg; return copy
        }
        return [...prev, msg]
      })
    })
    return unsub
  }, [accId])

  // ── Real-time: channel list changed (new DM, new/removed channel) ────────────
  useEffect(() => {
    const unsub = subscribeTeamChannels(({ accId: evtAcc }) => {
      if (evtAcc && evtAcc !== accId) return
      loadChannels()
    })
    return unsub
  }, [accId, loadChannels])

  // Al cambiar de canal salta al final al instante; mensajes nuevos del mismo
  // canal hacen scroll suave.
  const prevChannelRef = useRef(null)
  useEffect(() => {
    const changed = prevChannelRef.current !== activeChannel.id
    prevChannelRef.current = activeChannel.id
    bottomRef.current?.scrollIntoView({ behavior: changed ? 'auto' : 'smooth', block: 'end' })
  }, [messages.length, activeChannel.id])

  // ── Send ─────────────────────────────────────────────────────────────────────
  function send() {
    if (!input.trim() || !accId) return
    const content = input.trim()
    setInput('')
    const optimId = 'opt_' + Date.now()
    const payload = {
      channel:      activeChannel.id,
      authorId:     myId || 'unknown',
      authorName:   session?.name || 'Asesor',
      authorAvatar: session?.name?.slice(0, 2).toUpperCase() || '?',
      content,
    }
    // Optimistic render for the sender
    setMessages(prev => [...prev, { ...payload, id: optimId, ts: Date.now(), _optimistic: true }])
    sendTeamChatMessage(accId, payload).catch(() => {
      setMessages(prev => prev.filter(m => m.id !== optimId))
      flash('No se pudo enviar el mensaje')
    })
  }

  // Send an uploaded media file as a chat message
  function sendMedia(meta) {
    if (!meta?.mediaId) return
    const optimId = 'opt_' + Date.now()
    const payload = {
      channel:      activeChannel.id,
      authorId:     myId || 'unknown',
      authorName:   session?.name || 'Asesor',
      authorAvatar: session?.name?.slice(0, 2).toUpperCase() || '?',
      content:      '',
      media:        meta,
    }
    setMessages(prev => [...prev, { ...payload, id: optimId, ts: Date.now(), _optimistic: true }])
    sendTeamChatMessage(accId, payload).catch(() => {
      setMessages(prev => prev.filter(m => m.id !== optimId))
      flash('No se pudo enviar el archivo')
    })
  }

  // ── Create / delete custom channel ───────────────────────────────────────────
  async function handleCreateChannel(e) {
    e.preventDefault()
    if (!newChannelName.trim()) return
    try {
      const ch = await createTeamChannel(accId, newChannelName.trim())
      setNewChannelName('')
      setShowNewChannel(false)
      await loadChannels()
      setActiveChannel({ id: ch.id, label: `# ${ch.name}`, type: 'channel' })
      flash('Canal creado ✓')
    } catch (err) { flash('Error: ' + err.message) }
  }

  async function handleDeleteChannel(ch) {
    if (!confirm(`¿Eliminar el canal "${ch.name}" y todos sus mensajes?`)) return
    try {
      await deleteTeamChannel(accId, ch.id)
      await loadChannels()
      if (activeChannel.id === ch.id) setActiveChannel({ id: 'general', label: '# general', type: 'channel' })
      flash('Canal eliminado')
    } catch (err) { flash('Error: ' + err.message) }
  }

  // ── Open / start a DM ────────────────────────────────────────────────────────
  async function handleOpenDM(member) {
    setShowMemberPicker(false)
    try {
      const dm = await openTeamDM(accId, member.id)
      await loadChannels()
      setActiveChannel({ id: dm.id, label: member.name, type: 'dm', other: member })
    } catch (err) { flash('Error: ' + err.message) }
  }

  // Resolve the other participant of a DM into a member object for display
  function dmOther(dm) {
    const otherId = (dm.members || []).find(id => id !== myId)
    return (account?.members || []).find(m => m.id === otherId) || { id: otherId, name: 'Usuario' }
  }

  // ── Build the channel sidebar model ──────────────────────────────────────────
  const builtinChannels = [
    { id: 'general', label: '# general', type: 'channel' },
    ...(agents || []).map(ag => ({ id: `ag_${ag.id}`, label: `# ${ag.name.toLowerCase()}`, type: 'channel' })),
  ]
  const fmt = ts => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={s.panel}>
      {toast && <div className={s.toast}>{toast}</div>}

      <div className={s.channelSidebar}>
        {/* Canales */}
        <div className={s.sidebarSectionRow}>
          <span className={s.channelSidebarTitle}>Canales</span>
          {canManage && (
            <button className={s.addSmallBtn} title="Crear canal" onClick={() => { setShowNewChannel(v => !v); setShowMemberPicker(false) }}>
              {showNewChannel ? '✕' : '+'}
            </button>
          )}
        </div>

        {showNewChannel && (
          <form className={s.newChannelForm} onSubmit={handleCreateChannel}>
            <input
              autoFocus
              className={s.newChannelInput}
              placeholder="nombre-del-canal"
              value={newChannelName}
              onChange={e => setNewChannelName(e.target.value)}
            />
            <button type="submit" className={s.newChannelBtn}>Crear</button>
          </form>
        )}

        {builtinChannels.map(ch => (
          <button key={ch.id}
            className={`${s.channelBtn} ${activeChannel.id === ch.id ? s.channelActive : ''}`}
            onClick={() => setActiveChannel(ch)}>
            <span className={s.channelLabel}>{ch.label}</span>
            {unreadByChannel[ch.id] > 0 && <span className={s.unreadBadge}>{unreadByChannel[ch.id]}</span>}
          </button>
        ))}
        {customChannels.map(ch => (
          <div key={ch.id} className={s.channelRow}>
            <button
              className={`${s.channelBtn} ${activeChannel.id === ch.id ? s.channelActive : ''}`}
              onClick={() => setActiveChannel({ id: ch.id, label: `# ${ch.name}`, type: 'channel' })}>
              <span className={s.channelLabel}># {ch.name}</span>
              {unreadByChannel[ch.id] > 0 && <span className={s.unreadBadge}>{unreadByChannel[ch.id]}</span>}
            </button>
            {canManage && (
              <button className={s.channelDel} title="Eliminar canal" onClick={() => handleDeleteChannel(ch)}>✕</button>
            )}
          </div>
        ))}

        {/* Mensajes directos */}
        <div className={s.sidebarSectionRow} style={{ marginTop: 16 }}>
          <span className={s.channelSidebarTitle}>Mensajes directos</span>
          <button className={s.addSmallBtn} title="Nuevo mensaje" onClick={() => { setShowMemberPicker(v => !v); setShowNewChannel(false) }}>
            {showMemberPicker ? '✕' : '+'}
          </button>
        </div>

        {showMemberPicker && (
          <div className={s.memberPicker}>
            {members.length === 0 && <div className={s.memberPickerEmpty}>No hay otros miembros en el equipo.</div>}
            {members.map(m => (
              <button key={m.id} className={s.memberPickerItem} onClick={() => handleOpenDM(m)}>
                <span className={s.dmAvatar}>{m.avatar || m.name.slice(0, 2).toUpperCase()}</span>
                <span className={s.dmName}>{m.name}</span>
              </button>
            ))}
          </div>
        )}

        {dms.map(dm => {
          const other = dmOther(dm)
          return (
            <button key={dm.id}
              className={`${s.channelBtn} ${s.dmBtn} ${activeChannel.id === dm.id ? s.channelActive : ''}`}
              onClick={() => setActiveChannel({ id: dm.id, label: other.name, type: 'dm', other })}>
              <span className={s.dmAvatarSm}>{other.avatar || other.name.slice(0, 2).toUpperCase()}</span>
              <span className={s.channelLabel}>{other.name}</span>
              {unreadByChannel[dm.id] > 0 && <span className={s.unreadBadge}>{unreadByChannel[dm.id]}</span>}
            </button>
          )
        })}
        {dms.length === 0 && !showMemberPicker && (
          <div className={s.dmHint}>Usa + para escribirle a un compañero.</div>
        )}
      </div>

      <div className={s.chatArea}>
        <div className={s.chatHeader}>
          <span className={s.chatTitle}>
            {activeChannel.type === 'dm' ? `💬 ${activeChannel.label}` : activeChannel.label}
          </span>
          <span className={s.chatSub}>
            {activeChannel.type === 'dm'
              ? 'Conversación privada'
              : `Chat interno del equipo · ${account?.name || ''}`}
          </span>
        </div>

        <div className={s.messages} data-i18n-skip>
          {messages.length === 0 && (
            <div className={s.empty}>Sin mensajes todavía. ¡Sé el primero en escribir!</div>
          )}
          {messages.map((msg, i) => {
            const isMe    = msg.authorId === myId
            const prev    = messages[i - 1]
            const grouped = prev && prev.authorId === msg.authorId && msg.ts - prev.ts < 60000
            return (
              <div key={msg.id} className={`${s.msgGroup} ${grouped ? s.grouped : ''}`}
                style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                {!grouped && (
                  <div className={s.msgMeta} style={isMe ? { flexDirection: 'row-reverse' } : undefined}>
                    <span className={s.avatar} style={isMe ? { background: 'var(--accent)', color: 'white' } : {}}>
                      {msg.authorAvatar}
                    </span>
                    <span className={s.authorName}>{isMe ? 'Tú' : msg.authorName}</span>
                    <span className={s.msgTime}>{fmt(msg.ts)}</span>
                  </div>
                )}
                <div className={`${s.msgBubble} ${grouped ? s.msgIndent : ''}`}
                  style={{
                    padding: '8px 12px', borderRadius: 14, maxWidth: '100%',
                    background: isMe ? 'var(--accent)' : 'var(--bg3)',
                    color: isMe ? '#fff' : 'var(--text)',
                    border: isMe ? 'none' : '1px solid var(--border)',
                  }}>
                  {msg.media && (
                    <div className={s.msgMedia}>
                      <MediaMessage
                        accId={accId}
                        mediaId={msg.media.mediaId}
                        kind={msg.media.kind}
                        mime={msg.media.mime}
                        filename={msg.media.filename}
                        sizeBytes={msg.media.sizeBytes}
                      />
                    </div>
                  )}
                  {msg.content}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        <div className={s.inputArea}>
          <MediaInput
            uploadFn={(file, fn) => uploadChatMedia(accId, file, `team_${activeChannel.id}`, fn)}
            onUploaded={sendMedia}
          />
          <input className={s.input}
            placeholder={activeChannel.type === 'dm' ? `Mensaje a ${activeChannel.label}...` : `Mensaje en ${activeChannel.label}...`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()} />
          <button className={s.sendBtn} onClick={send} disabled={!input.trim()}>↑</button>
        </div>
      </div>
    </div>
  )
}
