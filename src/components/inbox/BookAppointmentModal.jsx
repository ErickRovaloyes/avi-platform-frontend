import { useState, useMemo } from 'react'
import { useAccount } from '../../context/AccountContext'
import { createCalendarBooking } from '../../lib/storage'
import AvailabilityCalendar from '../common/AvailabilityCalendar'

// Modal para que un asesor humano agende una cita manualmente desde el chat.
// Reusa los endpoints de calendario (valida disponibilidad, sincroniza a Google,
// notifica al cliente, etc.). Prellena los datos del cliente con la conversación.
//
// UX: tan visual como el link público de reservas — usa AvailabilityCalendar
// (cuadrícula de mes con los días disponibles iluminados + chips de horario).

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }
const modal = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, width: 'min(560px, 96vw)', maxHeight: '92vh', overflowY: 'auto' }
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', margin: '12px 0 5px' }
const inp = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg1)', color: 'var(--text)', fontSize: 13.5, boxSizing: 'border-box' }

export default function BookAppointmentModal({ accId, conv, onClose, onBooked }) {
  const { account } = useAccount()
  const calendars = useMemo(() => (account?.calendars || []).filter(c => c.status !== 'inactive'), [account])
  const [calId, setCalId] = useState(calendars[0]?.id || '')
  const cal = calendars.find(c => c.id === calId)
  const accent = cal?.color || '#7c6fff'
  const isRestaurant = cal?.vertical === 'restaurant'

  const [date, setDate] = useState('')
  const [party, setParty] = useState(2)
  const [f, setF] = useState({
    time: '', duration: cal?.appointment?.defaultDuration || 30,
    clientName: conv?.guestName || '', clientPhone: conv?.waFrom || conv?.clientPhone || '', clientEmail: '', notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = patch => setF(p => ({ ...p, ...patch }))

  function pickCalendar(id) {
    const c = calendars.find(x => x.id === id)
    setCalId(id); setDate(''); set({ time: '', duration: c?.appointment?.defaultDuration || 30 })
  }

  async function submit(e) {
    e.preventDefault()
    if (!calId) { setErr('Elige un calendario.'); return }
    if (!date || !f.time) { setErr('Elige un día y un horario.'); return }
    if (!f.clientName.trim()) { setErr('El nombre del cliente es obligatorio.'); return }
    setBusy(true); setErr('')
    try {
      const bk = await createCalendarBooking(accId, calId, {
        date, time: f.time, duration: f.duration,
        clientName: f.clientName.trim(), clientPhone: f.clientPhone, clientEmail: f.clientEmail, notes: f.notes,
        ...(isRestaurant ? { partySize: party } : {}),
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
            <select style={inp} value={calId} onChange={e => pickCalendar(e.target.value)}>
              {calendars.map(c => <option key={c.id} value={c.id}>{c.name}{c.description ? ` — ${c.description.slice(0, 50)}` : ''}</option>)}
            </select>

            {isRestaurant && (
              <>
                <label style={lbl}>¿Cuántas personas?</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Array.from({ length: Math.max(8, cal?.appointment?.maxPartySize || 12) }, (_, i) => i + 1).map(n => (
                    <button key={n} type="button" onClick={() => { setParty(n); set({ time: '' }) }} style={{
                      minWidth: 38, padding: '7px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 13.5, fontWeight: 700,
                      background: n === party ? accent : 'var(--bg1)', color: n === party ? '#fff' : 'var(--text)',
                      border: `1px solid ${n === party ? accent : 'var(--border2)'}`,
                    }}>{n}</button>
                  ))}
                </div>
              </>
            )}

            <AvailabilityCalendar
              accId={accId} calId={calId} duration={f.duration}
              party={isRestaurant ? party : undefined}
              date={date} time={f.time}
              onPickDate={ds => { setDate(ds); set({ time: '' }) }}
              onPickTime={t => set({ time: t })}
              accent={accent}
            />

            {/* Datos del cliente */}
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 16 }}>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{date && f.time ? `📌 ${date} · ${f.time}` : 'Selecciona día y hora'}</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" disabled={busy || !date || !f.time} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: accent, color: '#fff', fontWeight: 600, fontSize: 13, cursor: busy ? 'default' : 'pointer', opacity: (busy || !date || !f.time) ? .6 : 1 }}>{busy ? '⏳ Agendando…' : 'Agendar cita'}</button>
              </div>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
