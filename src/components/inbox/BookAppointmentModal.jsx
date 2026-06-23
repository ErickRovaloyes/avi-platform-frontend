import { useState, useEffect, useMemo } from 'react'
import { useAccount } from '../../context/AccountContext'
import { calendarAvailability, createCalendarBooking } from '../../lib/storage'

// Modal para que un asesor humano agende una cita manualmente desde el chat.
// Reusa los endpoints de calendario (valida disponibilidad, sincroniza a Google,
// notifica al cliente, etc.). Prellena los datos del cliente con la conversación.
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }
const modal = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, width: 'min(560px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', margin: '12px 0 5px' }
const inp = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg1)', color: 'var(--text)', fontSize: 13.5, boxSizing: 'border-box' }
const todayStr = () => new Date().toLocaleDateString('en-CA')

export default function BookAppointmentModal({ accId, conv, onClose, onBooked }) {
  const { account } = useAccount()
  const calendars = useMemo(() => (account?.calendars || []).filter(c => c.status !== 'inactive'), [account])
  const [calId, setCalId] = useState(calendars[0]?.id || '')
  const cal = calendars.find(c => c.id === calId)
  const [date, setDate] = useState(todayStr())
  const [slots, setSlots] = useState(null)
  const [f, setF] = useState({
    time: '', duration: cal?.appointment?.defaultDuration || 30,
    clientName: conv?.guestName || '', clientPhone: conv?.waFrom || conv?.clientPhone || '', clientEmail: '', notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = patch => setF(p => ({ ...p, ...patch }))

  useEffect(() => { if (cal && !f.clientName) set({ duration: cal.appointment?.defaultDuration || 30 }) }, [calId]) // eslint-disable-line

  useEffect(() => {
    if (!calId || !date) { setSlots(null); return }
    let alive = true
    setSlots(null)
    calendarAvailability(accId, calId, date).then(r => { if (alive) setSlots(r?.slots || (Array.isArray(r) ? r : [])) }).catch(() => { if (alive) setSlots([]) })
    return () => { alive = false }
  }, [accId, calId, date])

  async function submit(e) {
    e.preventDefault()
    if (!calId) { setErr('Elige un calendario.'); return }
    if (!date || !f.time) { setErr('Elige fecha y hora.'); return }
    if (!f.clientName.trim()) { setErr('El nombre del cliente es obligatorio.'); return }
    setBusy(true); setErr('')
    try {
      const bk = await createCalendarBooking(accId, calId, {
        date, time: f.time, duration: f.duration,
        clientName: f.clientName.trim(), clientPhone: f.clientPhone, clientEmail: f.clientEmail, notes: f.notes,
        channel: 'asesor', status: 'confirmed', validate: false,
      })
      onBooked?.(bk, cal)
      onClose()
    } catch (e2) { setErr(e2.message || 'No se pudo agendar'); setBusy(false) }
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <form style={modal} onSubmit={submit}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>📅 Agendar cita</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text3)', margin: '4px 0 4px' }}>Para <strong>{conv?.guestName || 'este cliente'}</strong>. Se valida disponibilidad y se sincroniza/notifica como cualquier reserva.</p>

        {calendars.length === 0 ? (
          <div style={{ padding: 14, color: 'var(--amber, #f5a623)', fontSize: 13 }}>No tienes calendarios. Créalos en la pestaña <strong>Calendarios</strong>.</div>
        ) : (
          <>
            <label style={lbl}>Calendario</label>
            <select style={inp} value={calId} onChange={e => { setCalId(e.target.value); set({ time: '' }) }}>
              {calendars.map(c => <option key={c.id} value={c.id}>{c.name}{c.description ? ` — ${c.description.slice(0, 50)}` : ''}</option>)}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Fecha</label>
                <input style={inp} type="date" value={date} onChange={e => { setDate(e.target.value); set({ time: '' }) }} />
              </div>
              <div>
                <label style={lbl}>Hora</label>
                {slots === null ? (
                  <div style={{ ...inp, color: 'var(--text3)' }}>Cargando…</div>
                ) : slots.length ? (
                  <select style={inp} value={f.time} onChange={e => set({ time: e.target.value })}>
                    <option value="">— elegir —</option>
                    {slots.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <input style={inp} type="time" value={f.time} onChange={e => set({ time: e.target.value })} placeholder="Sin slots — hora manual" />
                )}
                {slots && slots.length === 0 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Sin horarios libres ese día. Puedes forzar una hora manual.</span>}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>Nombre del cliente</label><input style={inp} value={f.clientName} onChange={e => set({ clientName: e.target.value })} /></div>
              <div><label style={lbl}>Duración (min)</label><input style={inp} type="number" min="1" value={f.duration} onChange={e => set({ duration: Math.max(1, Number(e.target.value) || 1) })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>Teléfono</label><input style={inp} value={f.clientPhone} onChange={e => set({ clientPhone: e.target.value })} /></div>
              <div><label style={lbl}>Email</label><input style={inp} value={f.clientEmail} onChange={e => set({ clientEmail: e.target.value })} /></div>
            </div>
            <label style={lbl}>Nota (opcional)</label>
            <input style={inp} value={f.notes} onChange={e => set({ notes: e.target.value })} placeholder="Motivo / observaciones" />

            {err && <div style={{ marginTop: 12, padding: '8px 11px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: 'rgba(255,95,95,.12)', color: '#ff5f5f', border: '1px solid rgba(255,95,95,.35)' }}>{err}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button type="submit" disabled={busy} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{busy ? '⏳ Agendando…' : 'Agendar cita'}</button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
