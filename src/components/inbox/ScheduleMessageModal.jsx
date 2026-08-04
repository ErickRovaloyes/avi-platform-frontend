import { useState, useMemo } from 'react'
import { createScheduledMessage } from '../../lib/storage'

// Canales con ventana de servicio de 24 h: el mensaje programado no puede salirse de ella.
const WINDOW_CHANNELS = ['whatsapp', 'messenger', 'instagram']
const CHANNEL_LABEL = { whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram' }

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }
const modal = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, width: 'min(430px, 96vw)' }
const inp = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', margin: '12px 0 5px' }

// Fecha/hora local → valor de <input type="datetime-local">
const toLocalInput = d => {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Programa un mensaje de texto para un chat.
 * `conv` aporta el canal y el último mensaje del cliente, con lo que se calcula el
 * límite de la ventana de 24 h y se ofrecen atajos que nunca la sobrepasan.
 */
export default function ScheduleMessageModal({ accId, agentId, conv, initialText = '', onClose, onDone }) {
  const [text, setText] = useState(initialText)
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const channel = conv?.channel || conv?.channelType
  const hasWindow = WINDOW_CHANNELS.includes(channel)

  // Fin de la ventana = último mensaje ENTRANTE + 24 h.
  const windowEnd = useMemo(() => {
    if (!hasWindow) return 0
    let last = 0
    for (const m of conv?.messages || []) if (m.sender === 'user' && (m.ts || 0) > last) last = m.ts || 0
    return last ? last + 24 * 3600 * 1000 : 0
  }, [conv, hasWindow])

  const windowOpen = !hasWindow || (windowEnd > Date.now())
  const maxInput = hasWindow && windowEnd ? toLocalInput(new Date(windowEnd)) : undefined

  // Atajos que caen dentro de la ventana (los que no caben se ocultan).
  const presets = [
    { label: 'En 1 hora', ms: 60 * 60 * 1000 },
    { label: 'En 3 horas', ms: 3 * 60 * 60 * 1000 },
    { label: 'Mañana a las 9:00', at: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d } },
  ].map(p => ({ ...p, date: p.at ? p.at() : new Date(Date.now() + p.ms) }))
     .filter(p => p.date.getTime() > Date.now() && (!hasWindow || !windowEnd || p.date.getTime() <= windowEnd))

  async function submit() {
    setErr('')
    const at = new Date(when).getTime()
    if (!text.trim()) { setErr('Escribe el mensaje.'); return }
    if (!at || at <= Date.now()) { setErr('La fecha debe ser futura.'); return }
    if (hasWindow && windowEnd && at > windowEnd) {
      setErr(`La ventana de 24 h de ${CHANNEL_LABEL[channel]} se cierra el ${new Date(windowEnd).toLocaleString('es')}.`); return
    }
    setBusy(true)
    try {
      await createScheduledMessage(accId, { agentId, convId: conv.id, content: text.trim(), scheduledAt: at })
      onDone?.()
      onClose?.()
    } catch (e) { setErr(e?.message || 'No se pudo programar el mensaje.'); setBusy(false) }
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>⏰ Programar mensaje</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {hasWindow && !windowOpen ? (
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 9, fontSize: 13, background: 'rgba(255,95,95,.12)', color: '#ff5f5f', border: '1px solid rgba(255,95,95,.35)' }}>
            La ventana de 24 h de {CHANNEL_LABEL[channel]} está cerrada, así que no se pueden programar mensajes de texto en este chat.
            Espera a que el cliente escriba o envía una plantilla aprobada.
          </div>
        ) : (
          <>
            <label style={lbl}>Mensaje</label>
            <textarea style={{ ...inp, minHeight: 88, resize: 'vertical', fontFamily: 'inherit' }}
              value={text} onChange={e => setText(e.target.value)} placeholder="Escribe el mensaje que se enviará…" />

            <label style={lbl}>¿Cuándo se envía?</label>
            <input type="datetime-local" style={inp} value={when} max={maxInput}
              min={toLocalInput(new Date())} onChange={e => setWhen(e.target.value)} />

            {presets.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {presets.map(p => (
                  <button key={p.label} onClick={() => setWhen(toLocalInput(p.date))}
                    style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 11.5, cursor: 'pointer' }}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            {hasWindow && windowEnd > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
                ⏳ La ventana de 24 h de {CHANNEL_LABEL[channel]} se cierra el{' '}
                <strong>{new Date(windowEnd).toLocaleString('es')}</strong>. No se puede programar más allá de esa hora.
              </div>
            )}
            {!hasWindow && (
              <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10 }}>
                En este canal no hay límite de tiempo para programar.
              </div>
            )}

            {err && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, background: 'rgba(255,95,95,.12)', color: '#ff5f5f', border: '1px solid rgba(255,95,95,.35)' }}>{err}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={onClose} style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={submit} disabled={busy}
                style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--accent,#7c6fff)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1 }}>
                {busy ? 'Programando…' : '⏰ Programar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
