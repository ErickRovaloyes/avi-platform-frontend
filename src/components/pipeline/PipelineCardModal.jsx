import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAccount } from '../../context/AccountContext'
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
export default function PipelineCardModal({ pipe, card, onClose }) {
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
              <Field label="Origen">
                <input style={inp} list="pipe-sources" value={source} onChange={e => setSource(e.target.value)} placeholder="¿De dónde llegó?" />
                <datalist id="pipe-sources">{SOURCES.map(s => <option key={s} value={s} />)}</datalist>
              </Field>
            </div>
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
