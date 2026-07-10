import { useState, useEffect, useRef } from 'react'
import { readSupportTickets, createSupportTicket, addSupportTicketMessage, uploadChatMedia, updateSupportTicket, reportSupportTicket } from '../../lib/storage'
import { getSocket } from '../../lib/api'
import { useAccount } from '../../context/AccountContext'
import ChatRefPicker from '../crm/ChatRefPicker'
import MediaInput from '../media/MediaInput'
import MediaMessage from '../media/MediaMessage'
import TicketRating from './TicketRating'
import EtaCountdown from './EtaCountdown'
import s from './SupportChatPanel.module.css'

const CHANNEL_ICON = { webchat: '💬', whatsapp: '📱', messenger: '📘', instagram: '📸', test: '🧪' }

// Chats referenciados por un ticket (en el header). Clic en un chip → abre el
// chat. Si es editable, permite agregar/quitar chats después de crear el ticket.
function TicketRefs({ refs, onOpen, onChangeRefs }) {
  const [editing, setEditing] = useState(false)
  const list = Array.isArray(refs) ? refs : []
  return (
    <div style={{ margin: '8px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>Chats referenciados:</span>
        {list.length === 0 && <span style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>ninguno</span>}
        {list.map(r => (
          <button key={r.convId} onClick={() => onOpen?.(r)} title="Ir al chat"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 14, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
            {CHANNEL_ICON[r.channel] || '💬'} {r.guestName} <span style={{ color: 'var(--accent,#4fa8ff)' }}>→ chat</span>
          </button>
        ))}
        {onChangeRefs && (
          <button onClick={() => setEditing(v => !v)}
            style={{ padding: '3px 9px', background: 'transparent', border: '1px dashed var(--border2)', borderRadius: 14, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
            {editing ? 'Listo' : '+ Agregar chat'}
          </button>
        )}
      </div>
      {editing && onChangeRefs && (
        <div style={{ marginTop: 8 }}>
          <ChatRefPicker value={list} onChange={onChangeRefs} />
        </div>
      )}
    </div>
  )
}

const STATUS_LABELS = { open: 'Abierto', in_progress: 'En progreso', closed: 'Cerrado' }
const STATUS_COLORS = { open: 'var(--amber)', in_progress: 'var(--accent)', closed: 'var(--text3)' }

export default function SupportChatPanel({ account, session }) {
  const { openConversation } = useAccount()
  const [tickets, setTickets]               = useState([])
  const [activeTicketId, setActiveTicketId] = useState(null)
  const [showNew, setShowNew]               = useState(false)
  const [newSubject, setNewSubject]         = useState('')
  const [newMsg, setNewMsg]                 = useState('')
  const [newRefs, setNewRefs]               = useState([])
  const [reply, setReply]                   = useState('')
  const [reportFor, setReportFor]           = useState(null)  // ticket a reportar
  const [reportNote, setReportNote]         = useState('')
  const bottomRef = useRef(null)
  const accId = account?.id

  async function handleReport() {
    if (!reportFor || !reportNote.trim()) return
    try { await reportSupportTicket(reportFor.id, reportNote.trim()); setReportFor(null); setReportNote(''); await load() }
    catch (e) { alert(e.message || 'No se pudo reportar') }
  }

  // Per-ticket "seen" tracking (client-side) so we can show a pending dot when
  // support replies and the user hasn't opened the ticket yet.
  const SEEN_KEY = `avi_support_seen_${accId}`
  const [seen, setSeen] = useState({})
  useEffect(() => {
    try { setSeen(JSON.parse(localStorage.getItem(SEEN_KEY) || '{}')) } catch { setSeen({}) }
  }, [accId])

  function markSeen(ticket) {
    if (!ticket) return
    const lastTs = ticket.messages?.[ticket.messages.length - 1]?.ts || ticket.updatedAt || 0
    setSeen(prev => {
      const next = { ...prev, [ticket.id]: lastTs }
      try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function lastMsgPreview(t) {
    const m = t.messages?.[t.messages.length - 1]
    if (!m) return ''
    const who = m.role === 'support' ? '🎧 Soporte: ' : 'Tú: '
    if (m.content && m.content.trim()) return who + m.content
    if (m.media) {
      const icon = m.media.kind === 'image' ? '🖼 Imagen' : m.media.kind === 'video' ? '🎬 Video' : m.media.kind === 'audio' ? '🎤 Audio' : '📎 Archivo'
      return who + icon
    }
    return ''
  }

  // Pending = last message is from support and newer than what the user has seen
  function isPending(t) {
    const m = t.messages?.[t.messages.length - 1]
    if (!m || m.role !== 'support') return false
    return (m.ts || 0) > (seen[t.id] || 0)
  }

  const load = async () => {
    if (!accId) return
    try {
      const all = await readSupportTickets()
      setTickets((all || []).filter(t => t.accId === accId))
    } catch { setTickets([]) }
  }

  useEffect(() => {
    if (!accId) return
    load()
    const sock = getSocket()
    const onUpdate = ({ accId: evtAcc }) => {
      if (!evtAcc || evtAcc === accId) load()
    }
    sock.on('support:updated', onUpdate)
    return () => sock.off('support:updated', onUpdate)
  }, [accId])

  // Al abrir un ticket salta al final al instante; mensajes nuevos del mismo
  // ticket hacen scroll suave.
  const prevTicketRef = useRef(null)
  useEffect(() => {
    const changed = prevTicketRef.current !== activeTicketId
    prevTicketRef.current = activeTicketId
    bottomRef.current?.scrollIntoView({ behavior: changed ? 'auto' : 'smooth', block: 'end' })
  }, [activeTicketId, tickets.length])

  async function handleCreate(e) {
    e.preventDefault()
    if (!newMsg.trim()) return
    const ticket = await createSupportTicket({
      accId, accountName: account?.name || '',
      subject: newSubject.trim() || 'Soporte',
      message: newMsg.trim(),
      authorId: session?.id, authorName: session?.name,
      refs: newRefs.map(r => ({ ...r, accId })),
    })
    await load()
    setActiveTicketId(ticket.id)
    setShowNew(false)
    setNewSubject('')
    setNewMsg('')
    setNewRefs([])
  }

  async function handleReply(ticketId) {
    if (!reply.trim()) return
    await addSupportTicketMessage(ticketId, { role: 'user', authorId: session?.id, authorName: session?.name, content: reply.trim() })
    await load()
    setReply('')
  }

  async function handleSendMedia(ticketId, meta) {
    if (!meta?.mediaId) return
    await addSupportTicketMessage(ticketId, { role: 'user', authorId: session?.id, authorName: session?.name, content: '', media: meta })
    await load()
  }

  const activeTicket = tickets.find(t => t.id === activeTicketId)
  const fmt = ts => new Date(ts).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  // Keep the open ticket marked as seen as new messages arrive
  useEffect(() => {
    if (activeTicket) markSeen(activeTicket)
  }, [activeTicketId, activeTicket?.messages?.length])

  return (
    <div className={s.panel}>
      <div className={s.ticketList}>
        <div className={s.listHeader}>
          <span className={s.listTitle}>Mis tickets</span>
          <button className={s.newBtn} onClick={() => { setShowNew(true); setActiveTicketId(null) }}>+ Nuevo</button>
        </div>
        <div className={s.ticketScroll}>
          {tickets.length === 0 && !showNew && (
            <div className={s.emptyList}>
              <p>Sin tickets de soporte.</p>
              <button className={s.createFirstBtn} onClick={() => setShowNew(true)}>Abrir un ticket</button>
            </div>
          )}
          {tickets.map(t => {
            const pending = isPending(t)
            return (
            <button key={t.id}
              className={`${s.ticketRow} ${t.id === activeTicketId ? s.ticketActive : ''}`}
              onClick={() => { setActiveTicketId(t.id); setShowNew(false); markSeen(t) }}>
              <div className={s.ticketInfo}>
                <div className={s.ticketSubject} style={pending ? { fontWeight: 700 } : undefined}>{t.subject}</div>
                <div className={s.ticketMeta}>{fmt(t.updatedAt)}</div>
                {lastMsgPreview(t) && (
                  <div className={s.ticketLastMsg} style={pending ? { color: 'var(--text)', fontWeight: 600 } : undefined}>
                    {lastMsgPreview(t)}
                  </div>
                )}
              </div>
              <div className={s.ticketRight}>
                <span className={s.statusBadge}
                  style={{ color: STATUS_COLORS[t.status], background: STATUS_COLORS[t.status] + '18' }}>
                  {STATUS_LABELS[t.status]}
                </span>
                {pending && <span className={s.pendingDot} title="Respuesta nueva sin leer" />}
              </div>
            </button>
            )
          })}
        </div>
      </div>

      <div className={s.detail}>
        {showNew && (
          <form className={s.newForm} onSubmit={handleCreate}>
            <div className={s.newFormTitle}>Nuevo ticket de soporte</div>
            <label className={s.label}>Asunto</label>
            <input className={s.input} placeholder="¿En qué te podemos ayudar?" value={newSubject}
              onChange={e => setNewSubject(e.target.value)} />
            <label className={s.label}>Descripción</label>
            <textarea className={s.textarea} rows={6} required placeholder="Describe tu problema o pregunta..."
              value={newMsg} onChange={e => setNewMsg(e.target.value)} />
            <div style={{ margin: '8px 0' }}>
              <ChatRefPicker value={newRefs} onChange={setNewRefs} />
            </div>
            <div className={s.formActions}>
              <button type="button" className={s.cancelBtn} onClick={() => setShowNew(false)}>Cancelar</button>
              <button type="submit" className={s.submitBtn}>Enviar ticket</button>
            </div>
          </form>
        )}

        {!showNew && activeTicket && (
          <>
            <div className={s.detailHeader} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div className={s.detailSubject}>{activeTicket.subject}</div>
                  <div className={s.detailMeta}>Ticket #{activeTicket.id.slice(-6)} · {fmt(activeTicket.createdAt)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={s.statusBadge}
                    style={{ color: STATUS_COLORS[activeTicket.status], background: STATUS_COLORS[activeTicket.status] + '18' }}>
                    {STATUS_LABELS[activeTicket.status]}
                  </span>
                  {activeTicket.reported
                    ? <span style={{ fontSize: 11, fontWeight: 700, color: '#ff5f5f' }}>⚠ Reportado</span>
                    : <button onClick={() => { setReportFor(activeTicket); setReportNote('') }}
                        style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(255,95,95,.4)', background: 'transparent', color: '#ff5f5f', cursor: 'pointer' }}>⚠ Reportar</button>}
                </div>
              </div>
              {activeTicket.eta && <EtaCountdown eta={activeTicket.eta} closed={activeTicket.status === 'closed'} compact />}
              <TicketRefs
                refs={activeTicket.refs}
                onOpen={r => openConversation?.(r.agentId, r.convId)}
                onChangeRefs={async (newRefs) => {
                  await updateSupportTicket(activeTicket.id, { refs: newRefs.map(r => ({ ...r, accId })) })
                  load()
                }}
              />
            </div>
            <div className={s.messages} data-i18n-skip>
              {(activeTicket.messages || []).map(msg => (
                msg.role === 'system' ? (
                  <div key={msg.id} style={{ alignSelf: 'center', textAlign: 'center', fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '6px 12px', margin: '4px auto' }}>
                    {msg.content}
                  </div>
                ) : (
                <div key={msg.id} className={`${s.msgRow} ${msg.role === 'user' ? s.msgUser : s.msgSupport}`}>
                  <div className={s.msgAuthor}>{msg.role === 'support' ? '🎧 Soporte AVI' : '👤 ' + msg.authorName}</div>
                  {msg.media && (
                    <div className={s.msgMedia}>
                      <MediaMessage accId={accId} mediaId={msg.media.mediaId} kind={msg.media.kind}
                        mime={msg.media.mime} filename={msg.media.filename} sizeBytes={msg.media.sizeBytes} />
                    </div>
                  )}
                  {msg.content && <div className={s.msgContent}>{msg.content}</div>}
                  <div className={s.msgTime}>{fmt(msg.ts)}</div>
                </div>
                )
              ))}
              <div ref={bottomRef} />
            </div>
            {activeTicket.status !== 'closed' ? (
              <div className={s.replyArea}>
                <MediaInput
                  uploadFn={(file, fn) => uploadChatMedia(accId, file, `support_${activeTicket.id}`, fn)}
                  onUploaded={meta => handleSendMedia(activeTicket.id, meta)}
                />
                <input className={s.replyInput} placeholder="Escribe una respuesta..."
                  value={reply} onChange={e => setReply(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleReply(activeTicket.id)} />
                <button className={s.sendBtn} onClick={() => handleReply(activeTicket.id)} disabled={!reply.trim()}>↑</button>
              </div>
            ) : (
              <div style={{ padding: '0 14px 14px' }}>
                <div className={s.closedBanner}>Este ticket está cerrado. Contacta a soporte para reabrirlo.</div>
                <TicketRating ticket={activeTicket} onRated={load} />
              </div>
            )}
          </>
        )}

        {!showNew && !activeTicket && (
          <div className={s.emptyDetail}>Selecciona un ticket o crea uno nuevo</div>
        )}
      </div>

      {reportFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setReportFor(null)}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, width: 'min(460px,96vw)', padding: 20 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>⚠ Reportar ticket</div>
            <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 12 }}>Cuéntanos qué pasa con la atención de este ticket. El equipo de soporte lo revisará con prioridad.</div>
            <textarea rows={4} autoFocus placeholder="Describe el motivo del reporte…" value={reportNote} onChange={e => setReportNote(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, resize: 'vertical' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setReportFor(null)} style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={handleReport} disabled={!reportNote.trim()} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: '#ff5f5f', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Enviar reporte</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
