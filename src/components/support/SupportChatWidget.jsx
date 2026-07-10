import { useState, useEffect, useRef } from 'react'
import { readSupportTickets, createSupportTicket, addSupportTicketMessage, reportSupportTicket } from '../../lib/storage'
import { getSocket } from '../../lib/api'
import TicketRating from './TicketRating'
import EtaCountdown from './EtaCountdown'
import s from './SupportChatWidget.module.css'

const STATUS_LABELS = { open: 'Abierto', in_progress: 'En progreso', closed: 'Cerrado' }
const STATUS_COLORS = { open: 'var(--amber)', in_progress: 'var(--accent)', closed: 'var(--text3)' }

export default function SupportChatWidget({ account, session }) {
  const [open, setOpen]               = useState(false)
  const [tickets, setTickets]         = useState([])
  const [activeTicketId, setActiveTicketId] = useState(null)
  const [view, setView]               = useState('list')
  const [newSubject, setNewSubject]   = useState('')
  const [newMsg, setNewMsg]           = useState('')
  const [reply, setReply]             = useState('')
  const [unread, setUnread]           = useState(0)
  const bottomRef = useRef(null)
  const accId = account?.id

  const loadTickets = async () => {
    if (!accId) return
    try {
      const all = await readSupportTickets()
      setTickets((all || []).filter(t => t.accId === accId))
    } catch { setTickets([]) }
  }

  useEffect(() => {
    if (!accId) return
    loadTickets()
    const sock = getSocket()
    const onUpdate = ({ accId: evtAcc }) => {
      if (!evtAcc || evtAcc === accId) loadTickets()
    }
    sock.on('support:updated', onUpdate)
    return () => sock.off('support:updated', onUpdate)
  }, [accId])

  useEffect(() => {
    if (open) setUnread(0)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeTicketId, tickets.length, view])

  async function handleCreate(e) {
    e.preventDefault()
    if (!newMsg.trim()) return
    const ticket = await createSupportTicket({
      accId, accountName: account?.name || '',
      subject: newSubject.trim() || 'Soporte',
      message: newMsg.trim(),
      authorId: session?.id, authorName: session?.name,
    })
    await loadTickets()
    setActiveTicketId(ticket.id)
    setView('ticket')
    setNewSubject(''); setNewMsg('')
  }

  async function handleReply(ticketId) {
    if (!reply.trim()) return
    await addSupportTicketMessage(ticketId, { role: 'user', authorId: session?.id, authorName: session?.name, content: reply.trim() })
    await loadTickets()
    setReply('')
  }

  const activeTicket = tickets.find(t => t.id === activeTicketId)
  const fmt = ts => new Date(ts).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  if (!open) {
    return (
      <button className={s.fab} onClick={() => setOpen(true)} title="Soporte AVI">
        🎧
        {unread > 0 && <span className={s.fabBadge}>{unread}</span>}
      </button>
    )
  }

  return (
    <div className={s.widget}>
      <div className={s.header}>
        <div className={s.headerInfo}>
          <span className={s.headerTitle}>Soporte AVI</span>
          {view !== 'list' && (
            <button className={s.backBtn} onClick={() => setView('list')}>← Volver</button>
          )}
        </div>
        <button className={s.closeBtn} onClick={() => setOpen(false)}>✕</button>
      </div>

      {view === 'list' && (
        <div className={s.body}>
          <div className={s.listHeader}>
            <span className={s.listTitle}>Mis tickets</span>
            <button className={s.newBtn} onClick={() => setView('new')}>+ Nuevo</button>
          </div>
          {tickets.length === 0 && (
            <div className={s.empty}>
              <p>Sin tickets de soporte.</p>
              <button className={s.createFirstBtn} onClick={() => setView('new')}>Abrir un ticket</button>
            </div>
          )}
          {tickets.map(t => (
            <button key={t.id} className={s.ticketRow} onClick={() => { setActiveTicketId(t.id); setView('ticket') }}>
              <div className={s.ticketInfo}>
                <div className={s.ticketSubject}>{t.subject}</div>
                <div className={s.ticketMeta}>
                  {fmt(t.updatedAt)}
                  {(t.messages || [])[t.messages?.length - 1]?.role === 'support' && (
                    <span className={s.newReplyDot} />
                  )}
                </div>
              </div>
              <span className={s.statusBadge} style={{ color: STATUS_COLORS[t.status], background: STATUS_COLORS[t.status] + '18' }}>
                {STATUS_LABELS[t.status]}
              </span>
            </button>
          ))}
        </div>
      )}

      {view === 'new' && (
        <form className={s.body} onSubmit={handleCreate}>
          <div className={s.newForm}>
            <label className={s.label}>Asunto</label>
            <input className={s.input} placeholder="¿En qué te podemos ayudar?" value={newSubject}
              onChange={e => setNewSubject(e.target.value)} />
            <label className={s.label}>Descripción</label>
            <textarea className={s.textarea} rows={5} required placeholder="Describe tu problema o pregunta..."
              value={newMsg} onChange={e => setNewMsg(e.target.value)} />
            <button type="submit" className={s.submitBtn}>Enviar ticket</button>
          </div>
        </form>
      )}

      {view === 'ticket' && activeTicket && (
        <div className={s.ticketDetail}>
          <div className={s.ticketDetailHeader}>
            <span className={s.ticketDetailSubject}>{activeTicket.subject}</span>
            <span className={s.statusBadge} style={{ color: STATUS_COLORS[activeTicket.status], background: STATUS_COLORS[activeTicket.status] + '18' }}>
              {STATUS_LABELS[activeTicket.status]}
            </span>
          </div>
          {activeTicket.eta && <div style={{ padding: '0 12px', marginBottom: 6 }}><EtaCountdown eta={activeTicket.eta} closed={activeTicket.status === 'closed'} compact /></div>}
          <div style={{ padding: '0 12px 6px' }}>
            {activeTicket.reported && !activeTicket.reportResolved
              ? <span style={{ fontSize: 11, fontWeight: 700, color: '#ff5f5f' }}>⚠ Reportaste este ticket</span>
              : <>
                  {activeTicket.reported && activeTicket.reportResolved && <span style={{ fontSize: 11, fontWeight: 700, color: '#22d98a', marginRight: 8 }}>✓ Reporte atendido</span>}
                  <button onClick={async () => { const n = window.prompt('¿Qué pasa con este ticket? (motivo del reporte)'); if (n && n.trim()) { try { await reportSupportTicket(activeTicket.id, n.trim()); await loadTickets() } catch (e) { alert(e.message || 'No se pudo reportar') } } }}
                    style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 8, border: '1px solid rgba(255,95,95,.4)', background: 'transparent', color: '#ff5f5f', cursor: 'pointer' }}>⚠ {activeTicket.reported ? 'Reportar de nuevo' : 'Reportar'}</button>
                </>}
          </div>
          <div className={s.messages} data-i18n-skip>
            {(activeTicket.messages || []).map(msg => (
              msg.role === 'system' ? (
                <div key={msg.id} style={{ alignSelf: 'center', textAlign: 'center', fontSize: 11.5, color: 'var(--text3)', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '5px 10px', margin: '4px auto' }}>
                  {msg.content}
                </div>
              ) : (
              <div key={msg.id} className={`${s.msgRow} ${msg.role === 'user' ? s.msgUser : s.msgSupport}`}>
                <div className={s.msgAuthor}>{msg.role === 'support' ? '🎧 Soporte AVI' : '👤 ' + msg.authorName}</div>
                <div className={s.msgContent}>{msg.content}</div>
                <div className={s.msgTime}>{fmt(msg.ts)}</div>
              </div>
              )
            ))}
            <div ref={bottomRef} />
          </div>
          {activeTicket.status !== 'closed' && (
            <div className={s.replyArea}>
              <input className={s.replyInput} placeholder="Escribe una respuesta..."
                value={reply} onChange={e => setReply(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReply(activeTicket.id)} />
              <button className={s.sendBtn} onClick={() => handleReply(activeTicket.id)} disabled={!reply.trim()}>↑</button>
            </div>
          )}
          {activeTicket.status === 'closed' && (
            <div style={{ padding: '0 12px 12px', overflowY: 'auto' }}>
              <div className={s.closedBanner}>Este ticket está cerrado.</div>
              <TicketRating ticket={activeTicket} onRated={loadTickets} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
