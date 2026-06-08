import { useState, useMemo } from 'react'
import { useAccount } from '../../context/AccountContext'
import EmbeddedChat from './EmbeddedChat'

// Popup de opciones avanzadas de una card del pipeline. Incluye un chat embebido
// para ver/responder la conversación vinculada sin salir del CRM, y un botón
// para abrir la conversación completa en el Inbox.
export default function PipelineCardModal({ pipe, card, onClose }) {
  const { account, visibleAgents, getConvos, updateCard, deleteCard, openConversation } = useAccount()
  const stages = [...(pipe?.stages || [])].sort((a, b) => a.order - b.order)
  const [value, setValue] = useState(card.value || '')
  const [stageId, setStageId] = useState(card.stageId || '')
  const [showChat, setShowChat] = useState(false)

  // Resuelve la conversación vinculada: por convId/agentId de la card, o por
  // coincidencia de nombre con el contacto.
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

  function saveValue() {
    updateCard(pipe.id, card.id, { value })
  }
  function moveStage(sid) {
    setStageId(sid)
    updateCard(pipe.id, card.id, { stageId: sid })
  }
  function remove() {
    if (!confirm(`¿Eliminar la tarjeta "${card.title}"?`)) return
    deleteCard(pipe.id, card.id)
    onClose()
  }
  function goInbox() {
    if (!link) return
    openConversation(link.agentId, link.convId)
    onClose()
  }

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
  const box = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(560px, 95vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
  const head = { padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
  const body = { padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }
  const inp = { padding: 8, fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }
  const btn = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text1)', cursor: 'pointer', fontSize: 13 }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={head}>
          <strong style={{ color: 'var(--text1)' }}>{card.title}</strong>
          <button style={{ ...btn, padding: '4px 10px' }} onClick={onClose}>✕</button>
        </div>

        <div style={body}>
          {/* Datos / opciones avanzadas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {card.contact && <div style={{ color: 'var(--text2)', fontSize: 13 }}>👤 {card.contact}</div>}

            <label style={{ fontSize: 12, color: 'var(--text2)' }}>Etapa</label>
            <select style={inp} value={stageId} onChange={e => moveStage(e.target.value)}>
              {stages.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>

            <label style={{ fontSize: 12, color: 'var(--text2)' }}>Valor ($)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inp, flex: 1 }} value={value} onChange={e => setValue(e.target.value)} placeholder="0" />
              <button style={btn} onClick={saveValue}>Guardar</button>
            </div>
          </div>

          {/* Chat vinculado */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong style={{ color: 'var(--text1)', fontSize: 13 }}>💬 Conversación</strong>
              {link && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={btn} onClick={() => setShowChat(v => !v)}>{showChat ? 'Ocultar chat' : 'Ver / responder aquí'}</button>
                  <button style={{ ...btn, background: 'var(--accent,#4fa8ff)', color: '#04223f', border: 'none', fontWeight: 600 }} onClick={goInbox}>Abrir en Inbox</button>
                </div>
              )}
            </div>
            {!link && <div style={{ color: 'var(--text3)', fontSize: 13 }}>Esta tarjeta no tiene una conversación vinculada.</div>}
            {link && showChat && <EmbeddedChat agentId={link.agentId} convId={link.convId} />}
          </div>

          {/* Zona peligrosa */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button style={{ ...btn, color: 'var(--red,#ff5f5f)', borderColor: 'var(--red,#ff5f5f)' }} onClick={remove}>🗑 Eliminar tarjeta</button>
          </div>
        </div>
      </div>
    </div>
  )
}
