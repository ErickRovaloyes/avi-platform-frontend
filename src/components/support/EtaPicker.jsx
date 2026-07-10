import { useState } from 'react'

// Selector visual de fecha y hora (calendario + hora + atajos rápidos), sin escribir a mano.
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const pad = n => String(n).padStart(2, '0')
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export default function EtaPicker({ value, onApply, onClose }) {
  const init = value ? new Date(value) : (() => { const d = new Date(); d.setHours(d.getHours() + 2, 0, 0, 0); return d })()
  const [draft, setDraft] = useState(init)
  const [view, setView] = useState(new Date(init.getFullYear(), init.getMonth(), 1))

  const year = view.getFullYear(), month = view.getMonth()
  const offset = (new Date(year, month, 1).getDay() + 6) % 7 // lunes primero
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const now = new Date()

  const patch = (fn) => { const x = new Date(draft); fn(x); setDraft(x) }
  const pick = (d) => { const dt = new Date(draft); dt.setFullYear(year, month, d); setDraft(dt) }
  const applyPreset = (fn) => { const d = fn(); setDraft(d); setView(new Date(d.getFullYear(), d.getMonth(), 1)) }
  const isPast = draft.getTime() < Date.now()

  const presets = [
    { label: '+1 hora',      fn: () => { const d = new Date(); d.setHours(d.getHours() + 1, d.getMinutes(), 0, 0); return d } },
    { label: '+3 horas',     fn: () => { const d = new Date(); d.setHours(d.getHours() + 3, d.getMinutes(), 0, 0); return d } },
    { label: '+6 horas',     fn: () => { const d = new Date(); d.setHours(d.getHours() + 6, d.getMinutes(), 0, 0); return d } },
    { label: 'Hoy 6:00 pm',  fn: () => { const d = new Date(); d.setHours(18, 0, 0, 0); return d } },
    { label: 'Mañana 9:00',  fn: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d } },
    { label: 'En 2 días',    fn: () => { const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(9, 0, 0, 0); return d } },
    { label: 'En 1 semana',  fn: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d } },
  ]

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }
  const box = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, width: 'min(420px,96vw)', padding: 18 }
  const navBtn = { background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', cursor: 'pointer', width: 30, height: 30, fontSize: 15 }
  const sel = { padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: 15, color: 'var(--text)' }}>📅 Fecha aproximada de entrega</strong>
          <button onClick={onClose} style={{ ...navBtn, width: 'auto', padding: '0 10px' }}>✕</button>
        </div>

        {/* Atajos rápidos */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {presets.map(p => (
            <button key={p.label} onClick={() => applyPreset(p.fn)}
              style={{ fontSize: 12, padding: '5px 10px', borderRadius: 16, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontWeight: 600 }}>{p.label}</button>
          ))}
        </div>

        {/* Calendario */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button style={navBtn} onClick={() => setView(new Date(year, month - 1, 1))}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{MONTHS[month]} {year}</span>
          <button style={navBtn} onClick={() => setView(new Date(year, month + 1, 1))}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 4 }}>
          {DOW.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', fontWeight: 700, padding: '2px 0' }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const cellDate = new Date(year, month, d)
            const selected = sameDay(cellDate, draft)
            const isToday = sameDay(cellDate, now)
            const past = cellDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())
            return (
              <button key={i} onClick={() => pick(d)} disabled={past}
                style={{
                  height: 34, borderRadius: 8, cursor: past ? 'not-allowed' : 'pointer', fontSize: 13,
                  border: `1px solid ${selected ? 'var(--accent)' : isToday ? 'var(--border2)' : 'transparent'}`,
                  background: selected ? 'var(--accent)' : 'transparent', color: selected ? '#fff' : past ? 'var(--text3)' : 'var(--text)',
                  fontWeight: selected || isToday ? 700 : 400, opacity: past ? 0.4 : 1,
                }}>{d}</button>
            )
          })}
        </div>

        {/* Hora */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>🕐 Hora:</span>
          <select style={sel} value={draft.getHours()} onChange={e => patch(x => x.setHours(Number(e.target.value)))}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}</option>)}
          </select>
          <span style={{ color: 'var(--text3)' }}>:</span>
          <select style={sel} value={draft.getMinutes() - draft.getMinutes() % 5} onChange={e => patch(x => x.setMinutes(Number(e.target.value)))}>
            {Array.from({ length: 12 }, (_, i) => i * 5).map(m => <option key={m} value={m}>{pad(m)}</option>)}
          </select>
        </div>

        {/* Preview + acciones */}
        <div style={{ marginTop: 14, fontSize: 12.5, color: isPast ? '#ff5f5f' : 'var(--text2)' }}>
          {isPast ? '⚠ La fecha elegida ya pasó.' : `Seleccionado: ${draft.toLocaleString('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
          {value ? <button onClick={() => onApply(null)} style={{ ...navBtn, width: 'auto', padding: '0 12px', color: '#ff5f5f', borderColor: 'rgba(255,95,95,.4)' }}>Quitar fecha</button> : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ ...navBtn, width: 'auto', padding: '0 14px' }}>Cancelar</button>
            <button onClick={() => onApply(draft.getTime())} style={{ padding: '0 16px', height: 30, borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Aplicar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
