import { useState, useEffect, useCallback } from 'react'
import { listScheduledMessages, cancelScheduledMessage } from '../../lib/storage'
import { getSocket } from '../../lib/api'

const STATUS_META = {
  pending:   { label: 'Pendiente', color: '#f5a623', icon: '⏰' },
  sent:      { label: 'Enviado',   color: '#22d98a', icon: '✅' },
  failed:    { label: 'Falló',     color: '#ff5f5f', icon: '⚠️' },
  cancelled: { label: 'Cancelado', color: '#888',    icon: '🚫' },
}

const fmt = ts => ts ? new Date(Number(ts)).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

/**
 * Lista de mensajes programados de la cuenta: pendientes arriba y luego el historial
 * (enviados, fallidos, cancelados). Si se pasa `convId` solo muestra los de ese chat.
 */
export default function ScheduledMessagesPanel({ accId, convId = null, onGoToChat }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')   // pending | history

  const load = useCallback(async () => {
    if (!accId) return
    try { const r = await listScheduledMessages(accId, { convId }); setRows(r?.scheduled || []) }
    catch { setRows([]) }
    setLoading(false)
  }, [accId, convId])

  useEffect(() => { load() }, [load])
  // El worker del servidor avisa cuando entrega o falla un mensaje.
  useEffect(() => {
    if (!accId) return
    const sock = getSocket()
    const onUpd = ({ accId: a } = {}) => { if (!a || a === accId) load() }
    sock.on('scheduled:updated', onUpd)
    const id = setInterval(load, 60000)
    return () => { sock.off('scheduled:updated', onUpd); clearInterval(id) }
  }, [accId, load])

  async function cancel(r) {
    if (!confirm('¿Cancelar este mensaje programado?')) return
    setRows(rs => rs.map(x => x.id === r.id ? { ...x, status: 'cancelled' } : x))
    try { await cancelScheduledMessage(accId, r.id) } catch { load() }
  }

  const pending = rows.filter(r => r.status === 'pending')
  const history = rows.filter(r => r.status !== 'pending')
  const shown = tab === 'pending' ? pending : history

  const tabBtn = active => ({
    padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
    background: active ? 'var(--accent,#7c6fff)' : 'transparent', color: active ? '#fff' : 'var(--text2)',
  })

  return (
    <div style={{ padding: convId ? 0 : 20, maxWidth: 820 }}>
      {!convId && (
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>⏰ Mensajes programados</h2>
          <p style={{ fontSize: 12.5, color: 'var(--text2)', margin: '4px 0 0' }}>
            Mensajes que se enviarán solos a la hora indicada. En WhatsApp, Messenger e Instagram
            no pueden salirse de la ventana de 24 h del chat.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, background: 'var(--bg3)', borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 12 }}>
        <button style={tabBtn(tab === 'pending')} onClick={() => setTab('pending')}>
          Pendientes{pending.length > 0 ? ` (${pending.length})` : ''}
        </button>
        <button style={tabBtn(tab === 'history')} onClick={() => setTab('history')}>
          Historial{history.length > 0 ? ` (${history.length})` : ''}
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Cargando…</div>
      ) : shown.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)', padding: 20, textAlign: 'center', border: '1px dashed var(--border2)', borderRadius: 12 }}>
          {tab === 'pending' ? 'No hay mensajes programados pendientes.' : 'Todavía no hay mensajes programados enviados.'}
        </div>
      ) : shown.map(r => {
        const m = STATUS_META[r.status] || STATUS_META.pending
        const late = r.status === 'pending' && r.scheduledAt < Date.now()
        return (
          <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, marginBottom: 8, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontSize: 18 }}>{m.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: m.color, border: `1px solid ${m.color}`, borderRadius: 999, padding: '1px 8px' }}>
                  {m.label}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {r.status === 'sent' ? `Enviado ${fmt(r.sentAt)}` : `${late ? 'Programado (en cola)' : 'Se enviará'} ${fmt(r.scheduledAt)}`}
                </span>
                {r.channelType && <span style={{ fontSize: 11, color: 'var(--text3)' }}>· {r.channelType}</span>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {r.content?.length > 260 ? r.content.slice(0, 260) + '…' : r.content}
              </div>
              {r.error && <div style={{ fontSize: 11.5, color: '#ff5f5f', marginTop: 4 }}>{r.error}</div>}
              {r.createdByName && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>Por {r.createdByName}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {onGoToChat && r.conversationId && (
                <button onClick={() => onGoToChat(r)}
                  style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--accent,#7c6fff)', background: 'transparent', color: 'var(--accent,#7c6fff)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  💬 Ir al chat
                </button>
              )}
              {r.status === 'pending' && (
                <button onClick={() => cancel(r)}
                  style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--red,#ff5f5f)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  Cancelar
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
