import { useState } from 'react'
import { rateSupportTicket } from '../../lib/storage'

// Calificación (1-10) + nota que deja quien creó el ticket, una vez que soporte lo cierra.
// Si el ticket ya fue calificado, muestra la calificación en modo lectura.
export default function TicketRating({ ticket, onRated }) {
  const [rating, setRating] = useState(0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const advisor = ticket?.assignedTo?.saName || 'el asesor'
  const rated = ticket?.rating != null

  const box = { border: '1px solid var(--border2)', borderRadius: 12, padding: 14, background: 'var(--bg2)', margin: '10px 0' }
  const title = { fontSize: 13.5, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }
  const sub = { fontSize: 12, color: 'var(--text3)', marginBottom: 10 }

  const colorFor = n => n <= 3 ? '#ff5f5f' : n <= 6 ? '#f5a623' : '#22d98a'

  if (rated) {
    return (
      <div style={box}>
        <div style={title}>⭐ Tu calificación</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: colorFor(ticket.rating) }}>{ticket.rating}<span style={{ fontSize: 14, color: 'var(--text3)', fontWeight: 500 }}>/10</span></span>
          <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>Calificaste la atención de {advisor}.</span>
        </div>
        {ticket.ratingNote && <div style={{ fontSize: 12.5, color: 'var(--text2)', fontStyle: 'italic', marginTop: 4 }}>“{ticket.ratingNote}”</div>}
      </div>
    )
  }

  async function submit() {
    if (!rating) { setErr('Elige una calificación del 1 al 10.'); return }
    setSaving(true); setErr('')
    try {
      await rateSupportTicket(ticket.id, rating, note.trim())
      onRated?.()
    } catch (e) { setErr(e.message || 'No se pudo enviar la calificación.'); setSaving(false) }
  }

  return (
    <div style={box}>
      <div style={title}>¿Cómo fue la atención de {advisor}?</div>
      <div style={sub}>Califica del 1 al 10 (1 = muy mala, 10 = excelente).</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
          const on = rating === n
          return (
            <button key={n} type="button" onClick={() => setRating(n)}
              style={{
                width: 34, height: 34, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                border: `1px solid ${on ? colorFor(n) : 'var(--border2)'}`,
                background: on ? colorFor(n) : 'var(--bg3)', color: on ? '#fff' : 'var(--text2)',
              }}>{n}</button>
          )
        })}
      </div>
      <textarea rows={2} placeholder="Nota adicional (opcional): cuéntanos cómo fue la atención…"
        value={note} onChange={e => setNote(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, resize: 'vertical' }} />
      {err && <div style={{ color: '#ff5f5f', fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ marginTop: 10 }}>
        <button type="button" onClick={submit} disabled={saving}
          style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          {saving ? 'Enviando…' : 'Enviar calificación'}
        </button>
      </div>
    </div>
  )
}
