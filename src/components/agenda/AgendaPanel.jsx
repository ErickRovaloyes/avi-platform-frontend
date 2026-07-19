import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  getAgenda, resolveBookingChat, crmUpdateTask,
  rescheduleCalendarBooking, updateCalendarBooking, setBookingStatus,
} from '../../lib/storage'
import s from './AgendaPanel.module.css'

const WD = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const HOUR_H = 46 // px por hora en la vista Semana
const TASK_COLOR_KEY = 'avi.agenda.taskColor'
const HIDDEN_KEY = 'avi.agenda.hidden'

const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseYmd = str => { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d) }
function startOfWeek(d) { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const hhmmToMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const minToHhmm = min => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`

const itemDate = it => it.type === 'booking' ? it.date : ymd(new Date(it.dueAt))
const itemStartMin = it => it.type === 'booking' ? hhmmToMin(it.time) : (() => { const d = new Date(it.dueAt); return d.getHours() * 60 + d.getMinutes() })()
const itemEndMin = it => it.type === 'booking' ? itemStartMin(it) + (it.duration || 30) : itemStartMin(it) + 30
const layerKey = it => it.type === 'task' ? 'tasks' : it.calendarId
const chipTitle = it => it.type === 'booking'
  ? `${it.time} · ${it.calendarName} · ${it.clientName || '—'} (${it.status})`
  : `Tarea: ${it.title}${it.assigneeName ? ` · ${it.assigneeName}` : ''}`

// Reparte en columnas los items que se solapan en el tiempo (vista Semana).
function layoutDay(items) {
  const sorted = [...items].sort((a, b) => itemStartMin(a) - itemStartMin(b) || itemEndMin(a) - itemEndMin(b))
  const colEnds = []
  const placed = sorted.map(it => {
    let ci = colEnds.findIndex(end => end <= itemStartMin(it))
    if (ci === -1) { ci = colEnds.length; colEnds.push(itemEndMin(it)) } else colEnds[ci] = itemEndMin(it)
    return { it, col: ci }
  })
  const n = Math.max(1, colEnds.length)
  return placed.map(({ it, col }) => ({ it, left: (col / n) * 100, width: (1 / n) * 100 }))
}

export default function AgendaPanel({ goToTab }) {
  const { account, openConversation, updateCalendar, pendingTab } = useAccount()
  const accId = account?.id
  const [view, setView] = useState('month')
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })

  // Al navegar aquí con una fecha (p. ej. desde una cita del inbox) → enfócala.
  useEffect(() => {
    const d = pendingTab?.tab === 'agenda' && pendingTab?.extra?.date
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) { setCursor(parseYmd(d)); setView('week') }
  }, [pendingTab?.ts])
  const [data, setData] = useState({ calendars: [], items: [] })
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')) } catch { return new Set() } })
  const [taskColor, setTaskColor] = useState(() => { try { return localStorage.getItem(TASK_COLOR_KEY) || '#f5a623' } catch { return '#f5a623' } })
  const [dayOpen, setDayOpen] = useState(null)
  const [sel, setSel] = useState(null)

  const range = useMemo(() => {
    if (view === 'week') { const s0 = startOfWeek(cursor); return { from: ymd(s0), to: ymd(addDays(s0, 6)), days: Array.from({ length: 7 }, (_, i) => addDays(s0, i)) } }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const gridStart = startOfWeek(first)
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
    return { from: ymd(cells[0]), to: ymd(cells[41]), cells }
  }, [view, cursor])

  const reload = useCallback(async () => {
    if (!accId) return
    setLoading(true)
    try { setData(await getAgenda(accId, range.from, range.to)) } catch { setData({ calendars: [], items: [] }) }
    setLoading(false)
  }, [accId, range.from, range.to])
  useEffect(() => { reload() }, [reload])

  useEffect(() => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])) } catch {} }, [hidden])
  useEffect(() => { try { localStorage.setItem(TASK_COLOR_KEY, taskColor) } catch {} }, [taskColor])

  const calendars = data.calendars || []
  const isVisible = useCallback(it => !hidden.has(layerKey(it)), [hidden])
  const toggle = key => setHidden(h => { const n = new Set(h); n.has(key) ? n.delete(key) : n.add(key); return n })
  const colorOf = useCallback(it => it.type === 'task' ? taskColor : (it.color || '#7c6fff'), [taskColor])

  const visItems = useMemo(() => (data.items || []).filter(isVisible), [data.items, isVisible])
  const byDay = useMemo(() => {
    const m = {}
    for (const it of visItems) { const d = itemDate(it); (m[d] = m[d] || []).push(it) }
    for (const k in m) m[k].sort((a, b) => itemStartMin(a) - itemStartMin(b))
    return m
  }, [visItems])

  function nav(delta) { const d = new Date(cursor); if (view === 'week') d.setDate(d.getDate() + delta * 7); else d.setMonth(d.getMonth() + delta); setCursor(d) }
  function today() { const d = new Date(); d.setHours(0, 0, 0, 0); setCursor(d) }
  function onCalColor(id, color) {
    setData(d => ({ ...d, calendars: d.calendars.map(c => c.id === id ? { ...c, color } : c), items: d.items.map(i => i.type === 'booking' && i.calendarId === id ? { ...i, color } : i) }))
    try { updateCalendar(id, { color }) } catch {}
  }

  const periodLabel = view === 'week'
    ? (() => { const s0 = startOfWeek(cursor), e0 = addDays(s0, 6); return `${s0.getDate()} ${MONTHS[s0.getMonth()].slice(0, 3)} – ${e0.getDate()} ${MONTHS[e0.getMonth()].slice(0, 3)} ${e0.getFullYear()}` })()
    : `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
  const taskCount = (data.items || []).filter(i => i.type === 'task').length

  return (
    <div className={s.root}>
      <div className={s.head}>
        <div>
          <div className={s.title}>📆 Calendario general</div>
          <div className={s.sub}>Reservas de tus calendarios y tareas del CRM en una sola vista.</div>
        </div>
        <div className={s.headActions}>
          <div className={s.viewToggle}>
            <button className={view === 'month' ? s.vtActive : ''} onClick={() => setView('month')}>Mes</button>
            <button className={view === 'week' ? s.vtActive : ''} onClick={() => setView('week')}>Semana</button>
          </div>
          <button className={s.ghost} onClick={() => nav(-1)} title="Anterior">←</button>
          <button className={s.ghost} onClick={today}>Hoy</button>
          <button className={s.ghost} onClick={() => nav(1)} title="Siguiente">→</button>
          <span className={s.period}>{periodLabel}</span>
          <button className={s.ghost} onClick={reload} title="Actualizar">↻</button>
        </div>
      </div>

      <div className={s.body}>
        <aside className={s.layers}>
          <div className={s.layersTitle}>Capas</div>
          <LayerRow color={taskColor} onColor={setTaskColor} on={!hidden.has('tasks')} onToggle={() => toggle('tasks')} label="✅ Tareas" count={taskCount} onGo={() => goToTab?.('crm')} />
          {calendars.map(c => {
            const cnt = (data.items || []).filter(i => i.type === 'booking' && i.calendarId === c.id).length
            return <LayerRow key={c.id} color={c.color} onColor={col => onCalColor(c.id, col)} on={!hidden.has(c.id)} onToggle={() => toggle(c.id)} label={`📅 ${c.name}`} count={cnt} onGo={() => goToTab?.('config')} />
          })}
          {calendars.length === 0 && <div className={s.hint}>No tienes calendarios todavía.</div>}
          <div className={s.layersFoot}>Marca/desmarca para mostrar u ocultar. El color de cada calendario es el suyo propio (se guarda). El de Tareas se guarda en este dispositivo.</div>
        </aside>

        <div className={s.cal}>
          {loading && <div className={s.loading}>Cargando…</div>}
          {view === 'month'
            ? <MonthView cells={range.cells} cursor={cursor} byDay={byDay} colorOf={colorOf} onDay={setDayOpen} onItem={setSel} />
            : <WeekView days={range.days} visItems={visItems} colorOf={colorOf} onItem={setSel} />}
        </div>
      </div>

      {dayOpen && <DayModal date={dayOpen} items={byDay[dayOpen] || []} colorOf={colorOf} onItem={it => { setDayOpen(null); setSel(it) }} onClose={() => setDayOpen(null)} />}
      {sel && <ItemEditor item={sel} accId={accId} openConversation={openConversation} goToTab={goToTab} onClose={() => setSel(null)} onSaved={() => { setSel(null); reload() }} />}
    </div>
  )
}

function LayerRow({ color, onColor, on, onToggle, label, count, onGo }) {
  return (
    <div className={s.layerRow}>
      <input type="checkbox" checked={on} onChange={onToggle} />
      <input type="color" className={s.swatch} value={color} onChange={e => onColor(e.target.value)} title="Color de la capa" />
      <span className={s.layerLabel} style={{ opacity: on ? 1 : 0.45 }}>{label}</span>
      <span className={s.layerCount}>{count}</span>
      <button className={s.layerGo} title="Ir a su sección" onClick={onGo}>↗</button>
    </div>
  )
}

function MonthView({ cells, cursor, byDay, colorOf, onDay, onItem }) {
  const todayStr = ymd(new Date())
  const month = cursor.getMonth()
  return (
    <div className={s.month}>
      {WD.map(d => <div key={d} className={s.monthDow}>{d}</div>)}
      {cells.map((d, i) => {
        const key = ymd(d); const items = byDay[key] || []; const other = d.getMonth() !== month
        return (
          <div key={i} className={`${s.mCell} ${other ? s.mOther : ''} ${key === todayStr ? s.mToday : ''}`} onClick={() => onDay(key)}>
            <div className={s.mNum}>{d.getDate()}</div>
            <div className={s.mItems}>
              {items.slice(0, 4).map(it => (
                <button key={it.type + it.id} className={s.chip} style={{ background: colorOf(it) + '22', borderLeftColor: colorOf(it) }}
                  onClick={e => { e.stopPropagation(); onItem(it) }} title={chipTitle(it)}>
                  <span className={s.chipTime}>{it.type === 'booking' ? it.time : minToHhmm(itemStartMin(it))}</span> {it.type === 'task' ? '✓ ' : ''}{it.title}
                </button>
              ))}
              {items.length > 4 && <button className={s.more} onClick={e => { e.stopPropagation(); onDay(key) }}>+{items.length - 4} más</button>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function WeekView({ days, visItems, colorOf, onItem }) {
  const hours = Array.from({ length: 24 }, (_, h) => h)
  const scrollRef = useRef(null)
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_H }, [])
  const todayStr = ymd(new Date())
  const byDay = {}
  for (const it of visItems) { const d = itemDate(it); (byDay[d] = byDay[d] || []).push(it) }
  return (
    <div className={s.week}>
      <div className={s.weekHeadRow}>
        <div className={s.weekCorner} />
        {days.map((d, i) => (
          <div key={i} className={`${s.weekDayHead} ${ymd(d) === todayStr ? s.weekToday : ''}`}>
            <span className={s.wdName}>{WD[i]}</span><span className={s.wdNum}>{d.getDate()}</span>
          </div>
        ))}
      </div>
      <div className={s.weekGridScroll} ref={scrollRef}>
        <div className={s.weekGrid}>
          <div className={s.hoursCol}>
            {hours.map(h => <div key={h} className={s.hourCell} style={{ height: HOUR_H }}><span>{pad(h)}:00</span></div>)}
          </div>
          {days.map((d, di) => {
            const key = ymd(d); const items = byDay[key] || []
            return (
              <div key={di} className={s.dayCol} style={{ height: 24 * HOUR_H }}>
                {hours.map(h => <div key={h} className={s.gridLine} style={{ top: h * HOUR_H }} />)}
                {layoutDay(items).map(({ it, left, width }) => {
                  const top = itemStartMin(it) / 60 * HOUR_H
                  const height = Math.max(18, (itemEndMin(it) - itemStartMin(it)) / 60 * HOUR_H - 2)
                  return (
                    <button key={it.type + it.id} className={s.event} onClick={() => onItem(it)}
                      style={{ top, height, left: `${left}%`, width: `calc(${width}% - 3px)`, background: colorOf(it) + '26', borderLeftColor: colorOf(it) }}
                      title={chipTitle(it)}>
                      <span className={s.evTime}>{it.type === 'booking' ? it.time : minToHhmm(itemStartMin(it))}</span>
                      <span className={s.evTitle}>{it.type === 'task' ? '✓ ' : ''}{it.title}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function DayModal({ date, items, colorOf, onItem, onClose }) {
  const d = parseYmd(date)
  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.dayModal} onClick={e => e.stopPropagation()}>
        <div className={s.dmHead}>
          <span>{WD[(d.getDay() + 6) % 7]} {d.getDate()} de {MONTHS[d.getMonth()]}</span>
          <button className={s.x} onClick={onClose}>✕</button>
        </div>
        <div className={s.dmList}>
          {items.length === 0 && <div className={s.hint}>Sin agenda este día.</div>}
          {items.map(it => (
            <button key={it.type + it.id} className={s.dmItem} onClick={() => onItem(it)} style={{ borderLeftColor: colorOf(it) }}>
              <span className={s.dmTime}>{it.type === 'booking' ? it.time : minToHhmm(itemStartMin(it))}</span>
              <span className={s.dmTitle}>{it.type === 'task' ? '✓ ' : '📅 '}{it.title}</span>
              <span className={s.dmMeta}>{it.type === 'booking' ? it.calendarName : (it.status === 'done' ? 'hecha' : 'tarea')}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ItemEditor({ item, accId, openConversation, goToTab, onClose, onSaved }) {
  const isBooking = item.type === 'booking'
  const initDue = isBooking ? null : new Date(item.dueAt)
  const [busy, setBusy] = useState(false)
  const [date, setDate] = useState(isBooking ? item.date : ymd(initDue))
  const [time, setTime] = useState(isBooking ? item.time : minToHhmm(initDue.getHours() * 60 + initDue.getMinutes()))
  const [duration, setDuration] = useState(isBooking ? item.duration : 30)
  const [status, setStatus] = useState(item.status)
  const [title, setTitle] = useState(item.title)

  async function save() {
    setBusy(true)
    try {
      if (isBooking) {
        if (date !== item.date || time !== item.time) await rescheduleCalendarBooking(accId, item.id, { date, time })
        if (Number(duration) !== item.duration) await updateCalendarBooking(accId, item.id, { duration: Number(duration) })
        if (status !== item.status) await setBookingStatus(accId, item.id, status)
      } else {
        const dueAt = new Date(`${date}T${time || '09:00'}`).getTime()
        await crmUpdateTask(accId, item.id, { title: title.trim() || 'Tarea', dueAt, status })
      }
      onSaved()
    } catch (e) { alert(e.message || 'No se pudo guardar'); setBusy(false) }
  }

  async function goChat() {
    if (isBooking) {
      try {
        const r = await resolveBookingChat(accId, item.id)
        if (r?.convId && r?.agentId) { openConversation(r.agentId, r.convId); onClose() }
        else alert('Esta reserva no tiene un chat asociado.')
      } catch { alert('No se pudo abrir el chat.') }
    } else {
      const ref = (item.refs || [])[0]
      if (ref?.convId && ref?.agentId) { openConversation(ref.agentId, ref.convId); onClose() }
      else alert('Esta tarea no tiene un chat vinculado.')
    }
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.editor} onClick={e => e.stopPropagation()}>
        <div className={s.edHead}>
          <span>{isBooking ? '📅 Reserva' : '✅ Tarea'}</span>
          <button className={s.x} onClick={onClose}>✕</button>
        </div>
        <div className={s.edBody}>
          {isBooking ? (
            <>
              <div className={s.edCliente}>{item.clientName || '—'}{item.clientPhone ? ` · ${item.clientPhone}` : ''}</div>
              <div className={s.edHint}>{item.calendarName}</div>
              <div className={s.edRow}>
                <label>Fecha<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
                <label>Hora<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
                <label>Duración<input type="number" min="1" value={duration} onChange={e => setDuration(e.target.value)} /></label>
              </div>
              <label>Estado
                <select value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="pending">Pendiente</option>
                  <option value="confirmed">Confirmada</option>
                  <option value="rescheduled">Reagendada</option>
                  <option value="noshow">No asistió</option>
                  <option value="completed">Completada</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label>Título<input type="text" value={title} onChange={e => setTitle(e.target.value)} /></label>
              <div className={s.edRow}>
                <label>Fecha<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
                <label>Hora<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
              </div>
              <label className={s.chk}><input type="checkbox" checked={status === 'done'} onChange={e => setStatus(e.target.checked ? 'done' : 'open')} /> Completada</label>
            </>
          )}
        </div>
        <div className={s.edFoot}>
          <button className={s.ghost} onClick={goChat}>💬 Ir al chat</button>
          <button className={s.ghost} onClick={() => { goToTab?.(isBooking ? 'config' : 'crm'); onClose() }}>{isBooking ? '📅 Ir al calendario' : '✅ Ir a tareas'}</button>
          <span style={{ flex: 1 }} />
          <button className={s.primary} disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}
