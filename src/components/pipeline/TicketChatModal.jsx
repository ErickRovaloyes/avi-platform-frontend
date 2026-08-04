import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAccount } from '../../context/AccountContext'
import InboxPanel from '../inbox/InboxPanel'
import PipelineCardModal from './PipelineCardModal'

/**
 * Popup de un ticket con el CHAT REAL de la bandeja a la izquierda y la ficha del
 * ticket a la derecha.
 *
 * El chat no se reimplementa: se incrusta `InboxPanel` en modo embebido, así que
 * conserva todas sus funciones (media, audio, plantillas de WhatsApp, ventana de 24 h,
 * respuestas rápidas, sugerencia con IA, mensajes programados, destacados…).
 */
export default function TicketChatModal({ pipe, card, link, onClose, onOpenCard }) {
  const { setSelectedAgentId } = useAccount()

  // El chat del ticket puede ser de otro agente que el seleccionado en la bandeja:
  // se cambia antes de montar para que InboxPanel encuentre la conversación.
  useEffect(() => { if (link?.agentId) setSelectedAgentId(link.agentId) }, [link?.agentId])   // eslint-disable-line

  // Cerrar con Escape (el chat tiene sus propios popups, que se cierran antes por su cuenta).
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  }
  const shell = {
    background: 'var(--bg1, var(--bg2))', border: '1px solid var(--border)', borderRadius: 14,
    width: 'min(1500px, 97vw)', height: 'min(900px, 92vh)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  }
  const head = {
    padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  }

  return createPortal(
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div style={shell}>
        <div style={head}>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 14 }}>🎫 {card.title || 'Ticket'}</strong>
            <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>{pipe?.name}</span>
          </div>
          <button onClick={onClose} title="Cerrar"
            style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        {/* InboxPanel embebido: chat completo + ficha del ticket como panel lateral. */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <InboxPanel
            embedConvId={link.convId}
            sidePanel={
              <PipelineCardModal
                variant="panel"
                pipe={pipe}
                card={card}
                onClose={onClose}
                onOpenCard={onOpenCard}
              />
            }
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
