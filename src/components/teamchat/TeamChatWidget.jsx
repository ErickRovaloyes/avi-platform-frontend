import { useState, useEffect, useRef } from 'react'
import { readTeamChat, sendTeamChatMessage } from '../../lib/storage'
import { subscribeTeamMessages } from '../../lib/teamChatService'
import s from './TeamChatWidget.module.css'

export default function TeamChatWidget({ account, agents, session }) {
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState('general')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const lastSeenTs = useRef(0)
  const bottomRef  = useRef(null)
  const accId = account?.id
  const channelRef = useRef(channel)
  channelRef.current = channel
  const openRef = useRef(open)
  openRef.current = open

  // Load messages for the active channel
  useEffect(() => {
    if (!accId) return
    readTeamChat(accId, channel).then(msgs => setMessages(msgs || [])).catch(() => setMessages([]))
  }, [accId, channel])

  // Real-time updates
  useEffect(() => {
    if (!accId) return
    const unsub = subscribeTeamMessages(({ accId: evtAcc, msg }) => {
      if (evtAcc && evtAcc !== accId) return
      if (msg.channel !== channelRef.current) {
        // Different channel — count as unread if from someone else
        if (!openRef.current && msg.authorId !== session?.id) setUnreadCount(c => c + 1)
        return
      }
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev
        const optimIdx = prev.findIndex(m => m._optimistic && m.authorId === msg.authorId && m.content === msg.content)
        if (optimIdx !== -1) { const copy = [...prev]; copy[optimIdx] = msg; return copy }
        return [...prev, msg]
      })
      if (!openRef.current && msg.authorId !== session?.id) setUnreadCount(c => c + 1)
    })
    return unsub
  }, [accId])

  useEffect(() => {
    if (open) {
      setUnreadCount(0)
      lastSeenTs.current = Date.now()
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, channel, open])

  function send() {
    if (!input.trim() || !accId) return
    const content = input.trim()
    setInput('')
    const optimId = 'opt_' + Date.now()
    const payload = {
      channel,
      authorId:     session?.id || 'unknown',
      authorName:   session?.name || 'Asesor',
      authorAvatar: session?.name?.slice(0, 2).toUpperCase() || '?',
      content,
    }
    setMessages(prev => [...prev, { ...payload, id: optimId, ts: Date.now(), _optimistic: true }])
    sendTeamChatMessage(accId, payload).catch(() => setMessages(prev => prev.filter(m => m.id !== optimId)))
  }

  const channelMsgs = messages
  const channels = [
    { id: 'general', label: '# general' },
    ...(agents || []).map(ag => ({ id: `ag_${ag.id}`, label: `# ${ag.name.toLowerCase()}` })),
  ]
  const fmt = ts => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

  if (!open) {
    return (
      <button className={s.fab} onClick={() => setOpen(true)} title="Chat interno del equipo">
        💬
        {unreadCount > 0 && <span className={s.fabBadge}>{unreadCount}</span>}
      </button>
    )
  }

  return (
    <div className={s.widget}>
      <div className={s.header}>
        <span className={s.headerTitle}>Chat del equipo</span>
        <button className={s.closeBtn} onClick={() => setOpen(false)}>✕</button>
      </div>

      <div className={s.body}>
        <div className={s.channelList}>
          {channels.map(ch => (
            <button key={ch.id}
              className={`${s.channelBtn} ${channel === ch.id ? s.channelActive : ''}`}
              onClick={() => setChannel(ch.id)}>
              {ch.label}
            </button>
          ))}
        </div>

        <div className={s.messages}>
          {channelMsgs.length === 0 && <div className={s.empty}>Sin mensajes en este canal</div>}
          {channelMsgs.map((msg, i) => {
            const isMe     = msg.authorId === session?.id
            const prevMsg  = channelMsgs[i - 1]
            const grouped  = prevMsg && prevMsg.authorId === msg.authorId && msg.ts - prevMsg.ts < 60000
            return (
              <div key={msg.id} className={`${s.msgGroup} ${grouped ? s.grouped : ''}`}>
                {!grouped && (
                  <div className={s.msgMeta}>
                    <span className={s.avatar} style={isMe ? { background: 'var(--accent)', color: 'white' } : {}}>
                      {msg.authorAvatar}
                    </span>
                    <span className={s.authorName}>{isMe ? 'Tú' : msg.authorName}</span>
                    <span className={s.msgTime}>{fmt(msg.ts)}</span>
                  </div>
                )}
                <div className={`${s.msgBubble} ${grouped ? s.msgIndent : ''}`}>{msg.content}</div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className={s.inputArea}>
        <input className={s.input}
          placeholder={`Mensaje en ${channels.find(c => c.id === channel)?.label || 'general'}...`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()} />
        <button className={s.sendBtn} onClick={send} disabled={!input.trim()}>↑</button>
      </div>
    </div>
  )
}
