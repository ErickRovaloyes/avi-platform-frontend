import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAccount } from '../../context/AccountContext'
import { crmListTasks, crmCreateTask, crmUpdateTask, crmListCardLinks, crmCreateCardLink, crmDeleteCardLink } from '../../lib/storage'
import { TASK_TYPES, taskTypeLabel } from '../../lib/taskTypes'
import { formatLeadOrigin } from '../../lib/leadOrigin'
import TicketPicker from '../crm/TicketPicker'
import EmbeddedChat from './EmbeddedChat'

const PRIORITIES = [
  { id: 'baja',    label: 'Baja',    color: '#8b9a90' },
  { id: 'media',   label: 'Media',   color: '#4fa8ff' },
  { id: 'alta',    label: 'Alta',    color: '#f5a623' },
  { id: 'urgente', label: 'Urgente', color: '#ff5f5f' },
]
const SOURCES = ['WhatsApp', 'Messenger', 'Instagram', 'Webchat', 'Llamada', 'Referido', 'Campaña', 'Redes sociales', 'Presencial', 'IA', 'Otro']
const toDateInput = ts => ts ? new Date(Number(ts)).toISOString().slice(0, 10) : ''

// NB: Field/Section a nivel de módulo (no dentro del render) para no remontar los
// inputs en cada tecla — de lo contrario se pierde el foco al escribir.
const M_LBL = { fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '.04em' }
const Field = ({ label, children }) => <div><label style={M_LBL}>{label}</label>{children}</div>
const Section = ({ title, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <strong style={{ color: 'var(--text1)', fontSize: 12.5, letterSpacing: '.02em' }}>{title}</strong>
    {children}
  </div>
)

// Popup de una card del pipeline: edición completa del negocio/lead + chat vinculado.
export default function PipelineCardModal({ pipe, card, onClose, onOpenCard }) {
  const { account, visibleAgents, getConvos, updateCard, deleteCard, openConversation } = useAccount()
  const stages = [...(pipe?.stages || [])].sort((a, b) => a.order - b.order)
  const members = account?.members || []

  // ── Estado editable ─────────────────────────────────────────────────────────
  const [title, setTitle]       = useState(card.title || '')
  const [contact, setContact]   = useState(card.contact || '')
  const [phone, setPhone]       = useState(card.phone || '')
  const [email, setEmail]       = useState(card.email || '')
  const [stageId, setStageId]   = useState(card.stageId || '')
  const [value, setValue]       = useState(card.value ?? '')
  const [prob, setProb]         = useState(card.probability ?? '')
  const [expClose, setExpClose] = useState(toDateInput(card.expectedClose))
  const [status, setStatus]     = useState(card.status || 'open')
  const [lostReason, setLostReason] = useState(card.lostReason || '')
  const [priority, setPriority] = useState(card.priority || 'media')
  const [ownerId, setOwnerId]   = useState(card.ownerId || '')
  const [source, setSource]     = useState(card.source || '')
  const [tags, setTags]         = useState((card.tags || []).join(', '))
  const [nextAction, setNextAction]         = useState(card.nextAction || '')
  const [nextActionDate, setNextActionDate] = useState(toDateInput(card.nextActionDate))
  const [notes, setNotes]       = useState(card.notes || '')

  const [showChat, setShowChat] = useState(false)
  const [saved, setSaved]       = useState(false)

  // ── Tareas del ticket (asociadas a esta tarjeta) ────────────────────────────
  const [tasks, setTasks]       = useState([])
  const [ntTitle, setNtTitle]   = useState('')
  const [ntAssignee, setNtAssignee] = useState('')
  const [ntDue, setNtDue]       = useState('')
  const [ntType, setNtType]     = useState('general')
  useEffect(() => {
    if (!account?.id || !card?.id) return
    crmListTasks(account.id, { targetType: 'card', targetId: card.id }).then(setTasks).catch(() => setTasks([]))
  }, [account?.id, card?.id])
  async function reloadTasks() {
    try { setTasks(await crmListTasks(account.id, { targetType: 'card', targetId: card.id })) } catch { /* noop */ }
  }
  async function addTaskToCard() {
    if (!ntTitle.trim()) return
    const m = members.find(x => x.id === ntAssignee)
    await crmCreateTask(account.id, {
      targetType: 'card', targetId: card.id, title: ntTitle.trim(), type: ntType,
      dueAt: ntDue ? new Date(ntDue).getTime() : null,
      assigneeId: ntAssignee || null, assigneeName: m ? (m.name || m.email) : '',
    })
    setNtTitle(''); setNtAssignee(''); setNtDue(''); setNtType('general'); reloadTasks()
  }
  async function toggleCardTask(t) { await crmUpdateTask(account.id, t.id, { status: t.status === 'done' ? 'open' : 'done' }); reloadTasks() }

  // ── Relaciones con otros tickets (posiblemente de otro pipeline) ────────────
  const [links, setLinks] = useState([])
  const [relPick, setRelPick] = useState(null)
  const [relType, setRelType] = useState('relacionado')
  useEffect(() => {
    if (!account?.id || !card?.id) return
    crmListCardLinks(account.id, card.id).then(r => setLinks(r.links || [])).catch(() => setLinks([]))
  }, [account?.id, card?.id])
  async function reloadLinks() { try { setLinks((await crmListCardLinks(account.id, card.id)).links || []) } catch { /* noop */ } }
  async function addLink() {
    if (!relPick) return
    if (relPick.cardId === card.id) { alert('No puedes vincular una tarjeta consigo misma.'); return }
    await crmCreateCardLink(account.id, { aPipeline: pipe.id, aCard: card.id, bPipeline: relPick.pipelineId, bCard: relPick.cardId, relation: relType })
    setRelPick(null); setRelType('relacionado'); reloadLinks()
  }
  async function removeLink(id) { await crmDeleteCardLink(account.id, id); reloadLinks() }

  const link = useMemo(() => {
    if (card.convId && card.agentId) return { agentId: card.agentId, convId: card.convId }
    if (card.contact) {
      for (const ag of visibleAgents || []) {
        const c = (getConvos(ag.id) || []).find(x => (x.guestName || '') === card.contact)
        if (c) return { agentId: ag.id, convId: c.id }
      }
    }
    return null
  }, [card, visibleAgents, getConvos])

  function saveAll() {
    const member = members.find(m => m.id === ownerId)
    const patch = {
      title: title.trim() || card.title,
      contact: contact.trim(),
      phone: phone.trim(),
      email: email.trim(),
      value,
      probability: prob === '' ? null : Math.max(0, Math.min(100, Number(prob) || 0)),
      expectedClose: expClose ? new Date(expClose + 'T12:00:00').getTime() : null,
      status,
      lostReason: status === 'lost' ? lostReason : '',
      priority,
      ownerId: ownerId || '',
      owner: member ? (member.name || member.email) : '',
      source: source.trim(),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      nextAction: nextAction.trim(),
      nextActionDate: nextActionDate ? new Date(nextActionDate + 'T12:00:00').getTime() : null,
      notes,
      ...(status === 'won' ? { wonAt: card.wonAt || Date.now() } : {}),
    }
    // Cambio de etapa: reinicia el reloj de estancamiento (movedAt) y registra historial.
    if (stageId && stageId !== card.stageId) { patch.stageId = stageId; patch.movedAt = Date.now() }
    updateCard(pipe.id, card.id, patch)
    setSaved(true); setTimeout(() => setSaved(false), 2200)
  }
  function remove() {
    if (!confirm(`¿Eliminar la tarjeta "${card.title}"?`)) return
    deleteCard(pipe.id, card.id); onClose()
  }
  function goInbox() { if (link) { openConversation(link.agentId, link.convId); onClose() } }

  // ── Estilos ───────────────────────────────────────────────────────────────
  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
  const box  = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, width: 'min(620px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
  const head = { padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }
  const body = { padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }
  const foot = { padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0, background: 'var(--bg2)' }
  const inp  = { padding: '8px 10px', fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 8, width: '100%', boxSizing: 'border-box' }
  const lbl  = M_LBL
  const btn  = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text1)', cursor: 'pointer', fontSize: 13 }
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }

  // Portal a <body>: el overlay usa position:fixed y, si se renderiza dentro del
  // tablero, un ancestro con transform/animación (p. ej. la animación global de
  // los "_panel_") se convierte en su bloque contenedor y lo recorta por abajo.
  // Montándolo en <body> el bloque contenedor vuelve a ser el viewport → centrado.
  const modal = (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={head}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input style={{ ...inp, fontSize: 15, fontWeight: 700, background: 'transparent', border: '1px solid transparent', padding: '4px 6px' }}
              value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del negocio"
              onFocus={e => e.target.style.border = '1px solid var(--border2)'} onBlur={e => e.target.style.border = '1px solid transparent'} />
            {card.source === 'ia' && <span style={{ fontSize: 10.5, color: 'var(--accent)', marginLeft: 6 }}>✨ Detectado por IA</span>}
          </div>
          <button style={{ ...btn, padding: '4px 10px' }} onClick={onClose}>✕</button>
        </div>

        <div style={body}>
          {/* Contacto */}
          <Section title="👤 Contacto">
            <div style={grid}>
              <Field label="Nombre"><input style={inp} value={contact} onChange={e => setContact(e.target.value)} placeholder="Nombre del cliente" /></Field>
              <Field label="Teléfono"><input style={inp} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+57…" /></Field>
              <Field label="Email"><input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@cliente.com" /></Field>
            </div>
          </Section>

          {/* Negocio */}
          <Section title="💼 Negocio">
            <div style={grid}>
              <Field label="Etapa">
                <select style={inp} value={stageId} onChange={e => setStageId(e.target.value)}>
                  {stages.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                </select>
              </Field>
              <Field label="Valor ($)"><input style={inp} value={value} onChange={e => setValue(e.target.value)} placeholder="0" /></Field>
              <Field label="Probabilidad (%)"><input style={inp} type="number" min="0" max="100" value={prob} onChange={e => setProb(e.target.value)} placeholder="50" /></Field>
              <Field label="Cierre esperado"><input style={inp} type="date" value={expClose} onChange={e => setExpClose(e.target.value)} /></Field>
            </div>
            <Field label="Estado">
              <div style={{ display: 'flex', gap: 6 }}>
                {[['open', 'Abierto', '#4fa8ff'], ['won', 'Ganado', '#22d98a'], ['lost', 'Perdido', '#ff5f5f']].map(([k, l, col]) => (
                  <button key={k} onClick={() => setStatus(k)} style={{ ...btn, flex: 1, ...(status === k ? { background: col, color: '#fff', border: 'none', fontWeight: 700 } : {}) }}>{l}</button>
                ))}
              </div>
            </Field>
            {status === 'lost' && (
              <Field label="Motivo de la pérdida">
                <input style={inp} value={lostReason} onChange={e => setLostReason(e.target.value)} placeholder="Precio, competencia, sin respuesta…" />
              </Field>
            )}
          </Section>

          {/* Gestión */}
          <Section title="🎯 Gestión">
            <div style={grid}>
              <Field label="Prioridad">
                <div style={{ display: 'flex', gap: 5 }}>
                  {PRIORITIES.map(p => (
                    <button key={p.id} onClick={() => setPriority(p.id)} title={p.label}
                      style={{ ...btn, flex: 1, padding: '7px 4px', fontSize: 11, ...(priority === p.id ? { background: p.color, color: '#fff', border: 'none', fontWeight: 700 } : {}) }}>{p.label}</button>
                  ))}
                </div>
              </Field>
              <Field label="Responsable">
                <select style={inp} value={ownerId} onChange={e => setOwnerId(e.target.value)}>
                  <option value="">— sin asignar —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                </select>
              </Field>
              <Field label="Fuente">
                <input style={inp} list="pipe-sources" value={source} onChange={e => setSource(e.target.value)} placeholder="¿De dónde llegó?" />
                <datalist id="pipe-sources">{SOURCES.map(s => <option key={s} value={s} />)}</datalist>
              </Field>
            </div>
            {(() => {
              const o = formatLeadOrigin(card.origin)
              return o ? (
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                  Origen del lead (automático): <span style={{ color: o.color, fontWeight: 700 }}>{o.icon} {o.label}</span>{o.detail ? ` · ${o.detail}` : ''}
                </div>
              ) : null
            })()}
            <Field label="Etiquetas (separadas por coma)">
              <input style={inp} value={tags} onChange={e => setTags(e.target.value)} placeholder="vip, mayorista, recurrente" />
            </Field>
          </Section>

          {/* Seguimiento */}
          <Section title="⏭ Próxima acción">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '2 1 220px' }}><label style={lbl}>Qué hay que hacer</label>
                <input style={inp} value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="Ej: llamar para cerrar, enviar cotización…" /></div>
              <div style={{ flex: '1 1 130px' }}><label style={lbl}>Cuándo</label>
                <input style={inp} type="date" value={nextActionDate} onChange={e => setNextActionDate(e.target.value)} /></div>
            </div>
            <Field label="Notas del negocio">
              <textarea style={{ ...inp, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Contexto, acuerdos, objeciones del cliente…" />
            </Field>
          </Section>

          {/* Tareas del ticket */}
          <Section title="✅ Tareas">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tasks.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Sin tareas para este ticket todavía.</div>}
              {tasks.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8 }}>
                  <button onClick={() => toggleCardTask(t)} title={t.status === 'done' ? 'Reabrir' : 'Completar'} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>{t.status === 'done' ? '✅' : '⬜'}</button>
                  <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text1)', textDecoration: t.status === 'done' ? 'line-through' : 'none', opacity: t.status === 'done' ? .6 : 1 }}>{t.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{taskTypeLabel(t.type)}</span>
                  {t.assigneeName && <span style={{ fontSize: 11, color: 'var(--accent,#7c6fff)' }}>👤 {t.assigneeName}</span>}
                  {t.dueAt && <span style={{ fontSize: 11, color: 'var(--text3)' }}>📅 {new Date(Number(t.dueAt)).toLocaleDateString('es', { day: '2-digit', month: 'short' })}</span>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <input style={{ ...inp, flex: '2 1 160px', width: 'auto' }} value={ntTitle} onChange={e => setNtTitle(e.target.value)} placeholder="Nueva tarea..." onKeyDown={e => { if (e.key === 'Enter') addTaskToCard() }} />
              <select style={{ ...inp, flex: '1 1 120px', width: 'auto' }} value={ntType} onChange={e => setNtType(e.target.value)}>
                {TASK_TYPES.map(tt => <option key={tt.value} value={tt.value}>{tt.icon} {tt.label}</option>)}
              </select>
              <select style={{ ...inp, flex: '1 1 130px', width: 'auto' }} value={ntAssignee} onChange={e => setNtAssignee(e.target.value)}>
                <option value="">👤 Encargado</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>
              <input type="date" style={{ ...inp, flex: '1 1 130px', width: 'auto' }} value={ntDue} onChange={e => setNtDue(e.target.value)} />
              <button style={{ ...btn, background: 'var(--accent,#4fa8ff)', color: '#fff', border: 'none', fontWeight: 600 }} onClick={addTaskToCard}>+ Añadir</button>
            </div>
          </Section>

          {/* Relaciones con otros tickets */}
          <Section title="🔗 Relaciones">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {links.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Sin tickets vinculados.</div>}
              {links.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8 }}>
                  <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', minWidth: 62 }}>{l.relation}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--text1)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🧲 {l.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{l.pipelineName}</div>
                  </div>
                  {onOpenCard && l.cardId && <button style={{ ...btn, padding: '4px 9px' }} onClick={() => onOpenCard(l.pipelineId, l.cardId)}>Abrir</button>}
                  <button style={{ ...btn, padding: '4px 9px', color: 'var(--red,#ff5f5f)' }} onClick={() => removeLink(l.id)}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
              <div style={{ flex: '2 1 200px' }}><TicketPicker value={relPick} onChange={setRelPick} /></div>
              <select style={{ ...inp, flex: '1 1 120px', width: 'auto' }} value={relType} onChange={e => setRelType(e.target.value)}>
                <option value="relacionado">Relacionado</option>
                <option value="duplicado">Duplicado</option>
                <option value="bloquea">Bloquea</option>
                <option value="depende">Depende de</option>
              </select>
              <button style={{ ...btn, background: 'var(--accent,#4fa8ff)', color: '#fff', border: 'none', fontWeight: 600 }} onClick={addLink} disabled={!relPick}>+ Vincular</button>
            </div>
          </Section>

          {/* Chat vinculado */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--text1)', fontSize: 12.5 }}>💬 Conversación</strong>
              {link ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={btn} onClick={() => setShowChat(v => !v)}>{showChat ? 'Ocultar chat' : 'Ver / responder aquí'}</button>
                  <button style={{ ...btn, background: 'var(--accent,#4fa8ff)', color: '#fff', border: 'none', fontWeight: 600 }} onClick={goInbox}>Abrir en Inbox</button>
                </div>
              ) : <span style={{ color: 'var(--text3)', fontSize: 12 }}>Sin conversación vinculada.</span>}
            </div>
            {link && showChat && <EmbeddedChat agentId={link.agentId} convId={link.convId} />}
          </div>
        </div>

        <div style={foot}>
          <button style={{ ...btn, color: 'var(--red,#ff5f5f)', borderColor: 'var(--red,#ff5f5f)' }} onClick={remove}>🗑 Eliminar</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {saved && <span style={{ fontSize: 12.5, color: '#22d98a', fontWeight: 600 }}>✓ Guardado</span>}
            <button style={{ ...btn, background: 'var(--accent,#4fa8ff)', color: '#fff', border: 'none', fontWeight: 700, padding: '9px 20px' }} onClick={saveAll}>Guardar cambios</button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
