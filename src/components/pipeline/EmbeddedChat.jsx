import { useState, useRef, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { sendManualMessage } from '../../lib/storage'

// Chat embebido y ligero: muestra los mensajes de una conversación (del estado
// del contexto, que se actualiza por socket) y permite responder con el envío
// manual real. Pensado para usar dentro de modales (pipeline / tickets).
export default function EmbeddedChat({ agentId, convId, height = 280 }) {
  const { account, getConvos } = useAccount()
  const conv = (getConvos(agentId) || []).find(c => c.id === convId)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [conv?.messages?.length])

  if (!conv) return <div style={{ color: 'var(--text3)', fontSize: 13, padding: 12 }}>No se encontró la conversación vinculada.</div>

  async function send() {
    if (!text.trim()) return
    const t = text.trim(); setText(''); setSending(true); setError('')
    try { await sendManualMessage(account.id, agentId, convId, t) }
    catch (e) { setText(t); setError(e?.message || 'No se pudo enviar') }
    finally { setSending(false) }
  }

  const bubble = (mine) => ({
    alignSelf: mine ? 'flex-end' : 'flex-start',
    background: mine ? 'var(--green,#22d98a)' : 'var(--bg3)',
    color: mine ? '#06281c' : 'var(--text1)',
    padding: '6px 10px', borderRadius: 10, maxWidth: '80%', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border2)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ height, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg1)' }}>
        {(conv.messages || []).length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13 }}>Sin mensajes todavía.</div>}
        {(conv.messages || []).map((m, i) => {
          const mine = m.sender === 'human' || m.sender === 'ai'
          return (
            <div key={m.id || i} style={bubble(mine)}>
              {m.content}
              {m.sender === 'ai' && <span style={{ display: 'block', fontSize: 9, opacity: .6, marginTop: 2 }}>🤖 IA</span>}
              {m.sender === 'human' && <span style={{ display: 'block', fontSize: 9, opacity: .6, marginTop: 2 }}>👤 {m.senderName || 'Asesor'}</span>}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      {error && <div style={{ color: 'var(--red,#ff5f5f)', fontSize: 11, padding: '4px 10px' }}>⚠ {error}</div>}
      <div style={{ display: 'flex', gap: 6, padding: 8, borderTop: '1px solid var(--border2)', background: 'var(--bg2)' }}>
        <input
          style={{ flex: 1, padding: 8, fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }}
          placeholder="Escribe un mensaje…" value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()} />
        <button onClick={send} disabled={sending || !text.trim()}
          style={{ padding: '8px 14px', background: 'var(--green,#22d98a)', color: '#06281c', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', opacity: (sending || !text.trim()) ? .6 : 1 }}>
          {sending ? '…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}
