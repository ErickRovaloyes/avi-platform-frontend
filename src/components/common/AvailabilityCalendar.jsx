import { useState, useEffect } from 'react'
import { calendarAvailability, calendarMonthAvailability } from '../../lib/storage'

/**
 * Selector visual de día + horario (igual que el link público de reservas), para
 * el agendamiento manual dentro de la plataforma. Cuadrícula de mes con los días
 * disponibles iluminados + chips de horario.
 *
 * Controlado: el padre tiene `date`/`time` y recibe onPickDate / onPickTime.
 * Carga por su cuenta la disponibilidad (mes y día) vía endpoints autenticados.
 */
const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const pad = n => String(n).padStart(2, '0')
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function monthCells(y, m) {
  const firstDow = new Date(y, m - 1, 1).getDay()
  const days = new Date(y, m, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(`${y}-${pad(m)}-${pad(d)}`)
  return cells
}

export default function AvailabilityCalendar({ accId, calId, duration, party, date, time, onPickDate, onPickTime, accent = '#7c6fff' }) {
  const [monthCur, setMonthCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 } })
  const [availDays, setAvailDays] = useState(null)   // Set<'YYYY-MM-DD'> | null (cargando)
  const [slots, setSlots] = useState(null)

  // Días con cupo del mes mostrado.
  useEffect(() => {
    if (!calId) { setAvailDays(new Set()); return }
    let alive = true
    setAvailDays(null)
    calendarMonthAvailability(accId, calId, monthCur.y, monthCur.m, duration, party)
      .then(r => { if (alive) setAvailDays(new Set(r?.days || [])) })
      .catch(() => { if (alive) setAvailDays(new Set()) })
    return () => { alive = false }
  }, [accId, calId, monthCur.y, monthCur.m, duration, party])

  // Horarios del día elegido.
  useEffect(() => {
    if (!calId || !date) { setSlots(null); return }
    let alive = true
    setSlots(null)
    calendarAvailability(accId, calId, date, duration, party)
      .then(r => { if (alive) setSlots(r?.slots || (Array.isArray(r) ? r : [])) })
      .catch(() => { if (alive) setSlots([]) })
    return () => { alive = false }
  }, [accId, calId, date, duration, party])

  const today = todayStr()
  const cursorKey = `${monthCur.y}-${pad(monthCur.m)}`
  const canPrev = cursorKey > today.slice(0, 7)
  function shiftMonth(delta) {
    setMonthCur(c => { let m = c.m + delta, y = c.y; if (m < 1) { m = 12; y-- } if (m > 12) { m = 1; y++ } return { y, m } })
  }

  const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', margin: '12px 0 5px' }
  const inp = { padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg1)', color: 'var(--text)', fontSize: 13.5, boxSizing: 'border-box' }

  return (
    <div>
      <label style={lbl}>Elige un día</label>
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--border2)', borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button type="button" onClick={() => canPrev && shiftMonth(-1)} disabled={!canPrev} aria-label="Mes anterior"
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', cursor: canPrev ? 'pointer' : 'default', opacity: canPrev ? 1 : .3, fontSize: 16 }}>‹</button>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{MONTHS[monthCur.m - 1]} {monthCur.y}</div>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Mes siguiente"
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', cursor: 'pointer', fontSize: 16 }}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          {DOW.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text3)', padding: '2px 0' }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {monthCells(monthCur.y, monthCur.m).map((ds, idx) => {
            if (!ds) return <div key={`b${idx}`} />
            const dayNum = Number(ds.slice(8))
            const loading = availDays === null
            const isPast = ds < today
            const available = !!availDays && availDays.has(ds)
            const selected = ds === date
            const disabled = isPast || (!loading && !available)
            return (
              <button key={ds} type="button" disabled={disabled} onClick={() => !disabled && onPickDate?.(ds)}
                title={disabled ? 'Sin disponibilidad' : 'Disponible'}
                style={{
                  aspectRatio: '1 / 1', borderRadius: 8, fontSize: 13.5, fontWeight: 600,
                  cursor: disabled ? 'default' : 'pointer',
                  border: `1px solid ${selected ? accent : available ? accent + '66' : 'var(--border)'}`,
                  background: selected ? accent : available ? accent + '1f' : 'transparent',
                  color: selected ? '#fff' : disabled ? 'var(--text3)' : 'var(--text)',
                  opacity: loading ? .5 : (disabled && !isPast ? .45 : 1), transition: 'background .12s',
                }}>{dayNum}</button>
            )
          })}
        </div>
        {availDays !== null && availDays.size === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 10 }}>No hay días disponibles este mes. Prueba el siguiente ›</div>
        )}
      </div>

      {date && (
        <>
          <label style={lbl}>Elige un horario</label>
          {slots === null ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>Buscando horarios…</div>
            : slots.length === 0 ? (
              <div>
                <div style={{ color: 'var(--amber, #f5a623)', fontSize: 12.5, marginBottom: 6 }}>Sin horarios libres ese día. Puedes forzar una hora manual:</div>
                <input style={{ ...inp, width: 160 }} type="time" value={time || ''} onChange={e => onPickTime?.(e.target.value)} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {slots.map(t => (
                  <button key={t} type="button" onClick={() => onPickTime?.(t)} style={{
                    padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                    background: t === time ? accent : 'var(--bg1)', color: t === time ? '#fff' : 'var(--text)',
                    border: `1px solid ${t === time ? accent : 'var(--border2)'}`,
                  }}>{t}</button>
                ))}
              </div>
            )}
        </>
      )}
    </div>
  )
}
