import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  listCalendarBookings, createCalendarBooking, rescheduleCalendarBooking, updateCalendarBooking,
  setBookingStatus, deleteCalendarBooking, calendarBookingsExportUrl, calendarAvailability, getCountryHolidays,
} from '../../lib/storage'
import { getToken } from '../../lib/api'
import { normalizeForm, uid8 } from '../../lib/calendarForm'
import s from './CalendarsPanel.module.css'

const DAYS = [
  { key: 'mon', label: 'Lunes' }, { key: 'tue', label: 'Martes' }, { key: 'wed', label: 'Miércoles' },
  { key: 'thu', label: 'Jueves' }, { key: 'fri', label: 'Viernes' }, { key: 'sat', label: 'Sábado' }, { key: 'sun', label: 'Domingo' },
]
const TIMEZONES = [
  'America/Lima', 'America/Bogota', 'America/Mexico_City', 'America/Argentina/Buenos_Aires',
  'America/Santiago', 'America/New_York', 'America/Los_Angeles', 'Europe/Madrid', 'UTC',
]
const STATUS_META = {
  pending:     { label: 'Pendiente',   color: '#f5a623', bg: 'rgba(245,166,35,.14)' },
  confirmed:   { label: 'Confirmada',  color: '#22d98a', bg: 'rgba(34,217,138,.14)' },
  rescheduled: { label: 'Reagendada',  color: '#4fa8ff', bg: 'rgba(79,168,255,.14)' },
  cancelled:   { label: 'Cancelada',   color: '#ff5f5f', bg: 'rgba(255,95,95,.14)' },
  noshow:      { label: 'No Show',     color: '#c179ff', bg: 'rgba(193,121,255,.14)' },
  completed:   { label: 'Completada',  color: '#888',    bg: 'rgba(136,136,136,.14)' },
}
const FIELD_TYPES = [
  { value: 'text', label: 'Texto' }, { value: 'textarea', label: 'Área de texto' },
  { value: 'email', label: 'Email' }, { value: 'tel', label: 'Teléfono' },
  { value: 'select', label: 'Selección única' }, { value: 'multiselect', label: 'Selección múltiple' },
  { value: 'checkbox', label: 'Checkbox' }, { value: 'date', label: 'Fecha' },
  { value: 'time', label: 'Hora' }, { value: 'file', label: 'Archivo' },
]

// ─── Helpers de franjas <-> celdas de 30 min ─────────────────────────────────
const SLOTS_PER_DAY = 48 // 30-min
function slotToTime(s) { const h = Math.floor(s / 2); return `${String(h).padStart(2, '0')}:${s % 2 ? '30' : '00'}` }
function timeToSlot(t) { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 2 + ((m || 0) >= 30 ? 1 : 0) }
function franjasToSet(slots) {
  const set = new Set()
  ;(slots || []).forEach(sl => { const a = timeToSlot(sl.start), b = timeToSlot(sl.end); for (let i = a; i < b; i++) set.add(i) })
  return set
}
function setToFranjas(set) {
  const arr = [...set].sort((a, b) => a - b); const out = []; let start = null, prev = null
  for (const i of arr) {
    if (start === null) { start = i; prev = i }
    else if (i === prev + 1) prev = i
    else { out.push({ start: slotToTime(start), end: slotToTime(prev + 1) }); start = i; prev = i }
  }
  if (start !== null) out.push({ start: slotToTime(start), end: slotToTime(prev + 1) })
  return out
}
const ymd = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const COUNTRIES = [
  { code: '', name: '— sin festivos —' }, { code: 'PE', name: 'Perú' }, { code: 'CO', name: 'Colombia' },
  { code: 'MX', name: 'México' }, { code: 'AR', name: 'Argentina' }, { code: 'CL', name: 'Chile' },
  { code: 'EC', name: 'Ecuador' }, { code: 'BO', name: 'Bolivia' }, { code: 'VE', name: 'Venezuela' },
  { code: 'UY', name: 'Uruguay' }, { code: 'PY', name: 'Paraguay' }, { code: 'CR', name: 'Costa Rica' },
  { code: 'GT', name: 'Guatemala' }, { code: 'PA', name: 'Panamá' }, { code: 'DO', name: 'Rep. Dominicana' },
  { code: 'US', name: 'Estados Unidos' }, { code: 'ES', name: 'España' },
]
// Clave de día de la semana (mon..sun) a partir de una fecha YYYY-MM-DD
function dowKey(dateStr) { const d = new Date(dateStr + 'T00:00:00'); return DAYS[(d.getDay() + 6) % 7].key }
const hmToMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const minToHm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`
function slotsSummary(slots) {
  if (!slots || !slots.length) return ''
  const sorted = [...slots].sort((a, b) => hmToMin(a.start) - hmToMin(b.start))
  return `${sorted[0].start}–${sorted[sorted.length - 1].end}`
}
// Genera los slots individuales desde los RANGOS (horario semanal o excepción custom).
function genFromWindows(draft, date) {
  const ap = draft.appointment || {}
  const defDur = Number(ap.defaultDuration) || 30
  const buffer = Number(ap.buffer) || 0
  const ex = (draft.exceptions || []).find(e => e.date === date)
  let windows
  if (ex?.type === 'custom') windows = ex.slots || []
  else { const day = draft.availability?.[dowKey(date)]; if (!day || day.enabled === false) return []; windows = day.slots || [] }
  const step = defDur + buffer, out = []
  for (const w of windows) for (let t = hmToMin(w.start); t + defDur <= hmToMin(w.end); t += step) out.push({ start: minToHm(t), duration: defDur, blocked: false })
  return out
}
// Slots a mostrar para una fecha: explícitos si está personalizada; si no, generados.
function genDaySlots(draft, date) {
  const ex = (draft.exceptions || []).find(e => e.date === date)
  if (ex?.type === 'block') return []
  if (ex?.type === 'slots') return (ex.slots || []).map(sl => ({ start: sl.start || sl.time, duration: Number(sl.duration) || (draft.appointment?.defaultDuration || 30), blocked: !!sl.blocked }))
  return genFromWindows(draft, date)
}
// Estado/etiqueta de una fecha para la celda del calendario mensual.
function effForDate(draft, dateStr, holidaySet) {
  const ap = draft.appointment || {}
  const ex = (draft.exceptions || []).find(e => e.date === dateStr)
  if (ex?.type === 'block') return { status: 'block', label: 'bloqueado' }
  if (ex?.type === 'slots') { const n = (ex.slots || []).filter(sl => !sl.blocked).length; return { status: 'custom', label: `${n} horario${n === 1 ? '' : 's'}` } }
  if (ex?.type === 'custom') return { status: 'custom', label: slotsSummary(ex.slots || []) }
  if (ap.holidayMode === 'block' && holidaySet?.has(dateStr)) return { status: 'holiday', label: 'festivo' }
  const day = draft.availability?.[dowKey(dateStr)] || { enabled: false, slots: [] }
  if (day.enabled === false) return { status: 'closed', label: 'cerrado' }
  return { status: 'open', label: slotsSummary(day.slots || []) }
}

export default function CalendarsPanel() {
  const { account, addCalendar, deleteCalendar } = useAccount()
  const calendars = account?.calendars || []
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('booking')

  const open = calendars.find(c => c.id === openId)
  if (open) return <CalendarEditor calendar={open} onBack={() => setOpenId(null)} />

  function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    const id = addCalendar({ name: newName.trim(), type: newType })
    setNewName(''); setCreating(false)
    setOpenId(id)
  }

  return (
    <div className={s.panel}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>🗓 Calendarios</h2>
          <p className={s.sub}>Administra calendarios de reservas y formularios de agendamiento. Cada calendario maneja su disponibilidad, excepciones y reservas de forma independiente.</p>
        </div>
        <div className={s.actions}>
          {creating ? (
            <form onSubmit={handleCreate} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input autoFocus className={s.search} placeholder="Nombre…" value={newName} onChange={e => setNewName(e.target.value)} style={{ minWidth: 150 }} />
              <select className={s.select} value={newType} onChange={e => setNewType(e.target.value)} style={{ width: 'auto' }}>
                <option value="booking">Reservas</option>
                <option value="form">Formulario</option>
              </select>
              <button type="submit" className={s.newBtn}>Crear</button>
              <button type="button" className={s.ghostBtn} onClick={() => setCreating(false)}>✕</button>
            </form>
          ) : (
            <button className={s.newBtn} onClick={() => setCreating(true)}>+ Nuevo calendario</button>
          )}
        </div>
      </div>

      {calendars.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>🗓</div>
          <h3 style={{ margin: 0 }}>Aún no tienes calendarios</h3>
          <p style={{ color: 'var(--text2)', maxWidth: 420 }}>Crea un calendario de <strong>Reservas</strong> para gestionar disponibilidad y citas, o uno de <strong>Formulario</strong> para agendar desde un enlace público.</p>
          <button className={s.newBtn} onClick={() => setCreating(true)}>+ Crear primer calendario</button>
        </div>
      ) : (
        <div className={s.grid}>
          {calendars.map(c => (
            <div key={c.id} className={s.card} onClick={() => setOpenId(c.id)}>
              <div className={s.cardTop}>
                <span className={s.dot} style={{ background: c.color || '#7c6fff' }} />
                <span className={s.cardName}>{c.name}</span>
                <span className={s.cardType}>{c.type === 'form' ? '📝 Formulario' : '📅 Reservas'}</span>
              </div>
              <div className={s.cardDesc}>{c.description || 'Sin descripción'}</div>
              <div className={s.cardFoot}>
                <span className={`${s.badge} ${c.status === 'active' ? s.badgeOn : s.badgeOff}`}>{c.status === 'active' ? 'Activo' : 'Inactivo'}</span>
                <span className={s.hint}>{c.timezone}</span>
                <button className={s.cardDel} onClick={e => { e.stopPropagation(); if (confirm(`¿Eliminar "${c.name}" y sus reservas?`)) deleteCalendar(c.id) }} title="Eliminar">🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Editor ──────────────────────────────────────────────────────────────────
function CalendarEditor({ calendar, onBack }) {
  const { updateCalendar, deleteCalendar } = useAccount()
  const [tab, setTab] = useState('general')
  const [draft, setDraft] = useState(calendar)
  const [dirty, setDirty] = useState(false)

  useEffect(() => { setDraft(calendar); setDirty(false) }, [calendar.id]) // eslint-disable-line

  const set = useCallback((patch) => { setDraft(d => ({ ...d, ...patch })); setDirty(true) }, [])

  function save() {
    updateCalendar(calendar.id, {
      name: draft.name, description: draft.description, timezone: draft.timezone,
      color: draft.color, status: draft.status, flowId: draft.flowId || null,
      availability: draft.availability, exceptions: draft.exceptions,
      appointment: draft.appointment, formConfig: draft.formConfig,
    })
    setDirty(false)
  }

  const TABS = [
    { id: 'general', label: 'General' },
    { id: 'schedule', label: 'Disponibilidad' },
    { id: 'appointment', label: 'Citas' },
    { id: 'bookings', label: 'Reservas' },
    ...(draft.type === 'form' ? [{ id: 'form', label: 'Formulario' }] : []),
    { id: 'integrations', label: 'Integraciones' },
    { id: 'link', label: 'Enlace público' },
  ]

  return (
    <div className={s.editor}>
      <div className={s.edTop}>
        <button className={s.backBtn} onClick={onBack}>← Volver</button>
        <span className={s.dot} style={{ background: draft.color }} />
        <span className={s.edName}>{draft.name}</span>
        {dirty ? <span className={s.dirtyTag}>● Sin guardar</span> : <span className={s.savedTag}>✓ Guardado</span>}
        <button className={s.saveBtn} onClick={save} disabled={!dirty}>💾 Guardar</button>
        <button className={s.ghostBtn} onClick={() => { if (confirm(`¿Eliminar "${draft.name}"?`)) { deleteCalendar(calendar.id); onBack() } }}>🗑</button>
      </div>
      <div className={s.tabs}>
        {TABS.map(t => (
          <button key={t.id} className={`${s.tab} ${tab === t.id ? s.tabActive : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className={s.body}>
        {tab === 'general'      && <GeneralTab draft={draft} set={set} />}
        {tab === 'schedule'     && <ScheduleTab draft={draft} set={set} />}
        {tab === 'appointment'  && <AppointmentTab draft={draft} set={set} />}
        {tab === 'bookings'     && <BookingsTab calendar={calendar} />}
        {tab === 'form'         && <FormTab draft={draft} set={set} />}
        {tab === 'integrations' && <IntegrationsTab />}
        {tab === 'link'         && <PublicLinkTab calendar={calendar} />}
      </div>
    </div>
  )
}

function GeneralTab({ draft, set }) {
  const { account } = useAccount()
  const flows = account?.flows || []
  const ap = draft.appointment || {}
  const updAp = patch => set({ appointment: { ...ap, ...patch } })
  return (
    <div>
      <div className={s.field}><label>Nombre</label><input className={s.input} value={draft.name || ''} onChange={e => set({ name: e.target.value })} /></div>
      <div className={s.field}><label>Descripción</label><textarea className={s.textarea} value={draft.description || ''} onChange={e => set({ description: e.target.value })} /></div>
      <div className={s.row3}>
        <div className={s.field}><label>Zona horaria</label>
          <select className={s.select} value={draft.timezone || 'America/Lima'} onChange={e => set({ timezone: e.target.value })}>
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
        <div className={s.field}><label>Estado</label>
          <select className={s.select} value={draft.status || 'active'} onChange={e => set({ status: e.target.value })}>
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </select>
        </div>
        <div className={s.field}><label>Color</label>
          <input type="color" value={draft.color || '#7c6fff'} onChange={e => set({ color: e.target.value })} style={{ width: 60, height: 36, background: 'none', border: '1px solid var(--border2)', borderRadius: 6, cursor: 'pointer' }} />
        </div>
      </div>
      <div className={s.row2}>
        <div className={s.field}><label>País en el cual se basarán los días festivos</label>
          <select className={s.select} value={ap.holidayCountry || ''} onChange={e => updAp({ holidayCountry: e.target.value })}>
            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
        <div className={s.field}><label>Días festivos</label>
          <select className={s.select} value={ap.holidayMode || 'work'} onChange={e => updAp({ holidayMode: e.target.value })} disabled={!ap.holidayCountry}>
            <option value="work">Trabajar festivos (normal)</option>
            <option value="block">Bloquear festivos (sin reservas)</option>
          </select>
        </div>
      </div>
      <div className={s.field}>
        <label>Flujo a ejecutar al crear una reserva (opcional)</label>
        <select className={s.select} value={draft.flowId || ''} onChange={e => set({ flowId: e.target.value || null })}>
          <option value="">— ninguno —</option>
          {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <span className={s.hint}>Se ejecuta cuando alguien reserva desde el enlace público. Recibe variables: {'{{cliente_nombre}}'}, {'{{cliente_telefono}}'}, {'{{reserva_fecha}}'}, {'{{reserva_hora}}'}, {'{{booking_id}}'}.</span>
      </div>
      <WeeklySchedule draft={draft} set={set} />
    </div>
  )
}

// Horario general de la semana (rangos por día). La base de la que se generan
// los horarios disponibles en "Disponibilidad".
function WeeklySchedule({ draft, set }) {
  const av = draft.availability || {}
  const setDay = (k, patch) => set({ availability: { ...av, [k]: { ...(av[k] || { enabled: false, slots: [] }), ...patch } } })
  const addFr = k => { const d = av[k] || { slots: [] }; setDay(k, { enabled: true, slots: [...(d.slots || []), { start: '09:00', end: '13:00' }] }) }
  const setFr = (k, i, field, val) => { const d = av[k] || { slots: [] }; setDay(k, { slots: (d.slots || []).map((sl, j) => j === i ? { ...sl, [field]: val } : sl) }) }
  const delFr = (k, i) => { const d = av[k] || { slots: [] }; setDay(k, { slots: (d.slots || []).filter((_, j) => j !== i) }) }
  function copyMon() {
    const mon = av.mon || { enabled: false, slots: [] }
    const next = { ...av }
    DAYS.forEach(d => { if (d.key !== 'mon') next[d.key] = { enabled: mon.enabled, slots: JSON.parse(JSON.stringify(mon.slots || [])) } })
    set({ availability: next })
  }
  return (
    <div className={s.field} style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label>Horario general de la semana</label>
        <button className={s.miniBtn} onClick={copyMon}>⎘ Copiar lunes a todos</button>
      </div>
      <span className={s.hint}>Horarios de atención base por día (al minuto). En la pestaña <strong>Disponibilidad</strong> puedes personalizar y bloquear fechas concretas.</span>
      {DAYS.map(d => {
        const day = av[d.key] || { enabled: false, slots: [] }
        return (
          <div key={d.key} className={s.dayRow}>
            <div className={s.dayHead}>
              <span className={s.dayName}>{d.label}</span>
              <label className={s.switch}>
                <input type="checkbox" checked={day.enabled !== false} onChange={e => setDay(d.key, { enabled: e.target.checked })} />
                {day.enabled !== false ? 'Abierto' : 'Cerrado'}
              </label>
            </div>
            {day.enabled !== false && (
              <>
                {(day.slots || []).map((sl, i) => (
                  <div key={i} className={s.slotRow}>
                    <input type="time" className={s.timeInput} value={sl.start} onChange={e => setFr(d.key, i, 'start', e.target.value)} />
                    <span style={{ color: 'var(--text3)' }}>—</span>
                    <input type="time" className={s.timeInput} value={sl.end} onChange={e => setFr(d.key, i, 'end', e.target.value)} />
                    <button className={s.delMini} onClick={() => delFr(d.key, i)}>✕</button>
                  </div>
                ))}
                <button className={s.miniBtn} onClick={() => addFr(d.key)}>+ Franja</button>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Vista mensual unificada: disponibilidad semanal + excepciones por fecha.
function ScheduleTab({ draft, set }) {
  const { account } = useAccount()
  const accId = account?.id
  const ap = draft.appointment || {}
  const today = new Date()
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [editDate, setEditDate] = useState(null)
  const [holidays, setHolidays] = useState({}) // date -> name

  useEffect(() => {
    if (!ap.holidayCountry) { setHolidays({}); return }
    let alive = true
    getCountryHolidays(ap.holidayCountry, cursor.y).then(list => { if (alive) setHolidays(Object.fromEntries((list || []).map(h => [h.date, h.name]))) })
    return () => { alive = false }
  }, [ap.holidayCountry, cursor.y])
  const holidaySet = useMemo(() => new Set(Object.keys(holidays)), [holidays])

  const exceptions = draft.exceptions || []
  function upsertEx(date, patch) {
    const others = exceptions.filter(e => e.date !== date)
    set({ exceptions: patch == null ? others : [...others, { date, ...patch }] })
  }

  const first = new Date(cursor.y, cursor.m, 1)
  const startDow = (first.getDay() + 6) % 7
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate())
  function move(delta) { const m = cursor.m + delta; setCursor({ y: cursor.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }) }

  const STATUS_CLS = { block: s.dayBlock, holiday: s.dayHoliday, custom: s.dayCustom, open: s.dayOpen, closed: '' }
  const countryName = (COUNTRIES.find(c => c.code === ap.holidayCountry) || {}).name

  return (
    <div>
      <p className={s.hint} style={{ marginBottom: 10 }}>
        Vista mensual. <strong>Doble clic</strong> (o clic) en un día para ver/editar sus horarios disponibles uno a uno, bloquear horas concretas y ver las citas agendadas. El horario base de la semana se configura en <strong>General</strong>.
        {ap.holidayCountry && <> Festivos de <strong>{countryName}</strong> {ap.holidayMode === 'block' ? '🔒 bloqueados.' : 'marcados (se trabaja).'}</>}
      </p>
      <div className={s.calNav}>
        <button className={s.ghostBtn} onClick={() => move(-1)}>←</button>
        <span style={{ fontWeight: 700 }}>{MONTHS_ES[cursor.m]} {cursor.y}</span>
        <button className={s.ghostBtn} onClick={() => move(1)}>→</button>
      </div>
      <div className={s.monthGrid}>
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} className={s.monthDow}>{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const date = ymd(cursor.y, cursor.m, d)
          const eff = effForDate(draft, date, holidaySet)
          const isHol = holidaySet.has(date)
          return (
            <button key={i}
              className={`${s.monthCell} ${STATUS_CLS[eff.status] || ''} ${editDate === date ? s.monthCellSel : ''} ${date === todayStr ? s.monthToday : ''}`}
              onClick={() => setEditDate(date)} onDoubleClick={() => setEditDate(date)}
              title={isHol ? holidays[date] : 'Clic para editar'}>
              <span className={s.mcNum}>{d}</span>
              <span className={s.mcHours}>{eff.label}</span>
              {isHol && <span className={s.holDot} title={holidays[date]} />}
            </button>
          )
        })}
      </div>

      {editDate && (
        <DayEditor
          date={editDate} draft={draft} exceptions={exceptions} upsertEx={upsertEx}
          holidayName={holidays[editDate]} holidayBlocked={ap.holidayMode === 'block' && holidaySet.has(editDate)}
          accId={accId} calendarId={draft.id} color={draft.color}
          onClose={() => setEditDate(null)}
        />
      )}
    </div>
  )
}

function DayEditor({ date, draft, exceptions, upsertEx, holidayName, holidayBlocked, accId, calendarId, color, onClose }) {
  const wk = dowKey(date)
  const wkLabel = (DAYS.find(d => d.key === wk) || {}).label || ''
  const ex = exceptions.find(e => e.date === date)
  const mode = ex?.type === 'block' ? 'block' : ex?.type === 'slots' ? 'slots' : 'normal'

  const [bookings, setBookings] = useState([])
  const reloadBookings = useCallback(() => {
    if (!accId || !calendarId) return
    listCalendarBookings(accId, calendarId, { date }).then(setBookings).catch(() => setBookings([]))
  }, [accId, calendarId, date])
  useEffect(() => { reloadBookings() }, [reloadBookings])

  const slots = genDaySlots(draft, date)
  const editable = mode === 'slots'
  const setSlots = newSlots => upsertEx(date, { type: 'slots', slots: newSlots })
  const personalizar = () => upsertEx(date, { type: 'slots', slots: mode === 'slots' ? (ex.slots || []) : genFromWindows(draft, date) })
  const blockTime = startTime => upsertEx(date, { type: 'slots', slots: genFromWindows(draft, date).map(sl => sl.start === startTime ? { ...sl, blocked: true } : sl) })

  return (
    <div className={s.dayEditor}>
      <div className={s.dayHead}>
        <span className={s.dayName}>{date} · {wkLabel}</span>
        {holidayName && <span className={s.holTag}>🎉 {holidayName}{holidayBlocked ? ' · bloqueado' : ''}</span>}
        <button className={s.delMini} style={{ marginLeft: 'auto' }} onClick={onClose}>✕</button>
      </div>
      <div className={s.segRow}>
        <button className={`${s.miniBtn} ${mode === 'normal' ? s.miniBtnActive : ''}`} onClick={() => upsertEx(date, null)}>Horario semanal</button>
        <button className={`${s.miniBtn} ${mode === 'slots' ? s.miniBtnActive : ''}`} onClick={personalizar}>🕒 Personalizar horarios</button>
        <button className={`${s.miniBtn} ${mode === 'block' ? s.miniBtnActive : ''}`} onClick={() => upsertEx(date, { type: 'block' })}>🚫 Bloquear día</button>
      </div>
      {mode === 'normal' && <p className={s.hint} style={{ marginTop: 8 }}>Usa el horario semanal de los {wkLabel.toLowerCase()} (se configura en General). Pulsa “Personalizar horarios” para editar/bloquear horarios concretos, o haz clic en un horario para bloquearlo.</p>}
      {mode === 'block' && <p className={s.hint} style={{ marginTop: 8 }}>Día bloqueado: no se aceptan reservas.</p>}
      {mode === 'slots' && <p className={s.hint} style={{ marginTop: 8 }}>Horarios individuales: arrastra para mover/redimensionar, o selecciona uno para cambiar su hora/duración (al minuto) o bloquearlo.</p>}

      {mode !== 'block' && (
        <SlotTimeline
          slots={slots} editable={editable}
          onSlotsChange={editable ? setSlots : null}
          onBlockTime={!editable ? blockTime : null}
          defaultDuration={draft.appointment?.defaultDuration || 30}
          bookings={bookings} date={date} accId={accId} color={color || '#7c6fff'}
          onBookingChanged={reloadBookings}
        />
      )}
    </div>
  )
}

// Línea de tiempo del día (estilo Google Calendar): cada HORARIO disponible es un
// bloque individual editable (mover/redimensionar/duración al minuto/bloquear) y
// se ven las citas agendadas.
function SlotTimeline({ slots = [], editable, onSlotsChange, onBlockTime, defaultDuration = 30, bookings = [], date, accId, color = '#7c6fff', onBookingChanged }) {
  const PX = 0.8, DAY = 1440
  const ref = useRef(null)
  const [sel, setSel] = useState(null)
  const [selBId, setSelBId] = useState(null)
  const [drag, setDrag] = useState(null)
  const slotsRef = useRef(slots); slotsRef.current = slots
  const onChangeRef = useRef(onSlotsChange); onChangeRef.current = onSlotsChange
  useEffect(() => { if (ref.current) ref.current.scrollTop = 7 * 60 * PX - 16 }, [])
  const snap = m => Math.round(m / 5) * 5

  function startDrag(e, idx, edge) {
    if (!editable) return
    e.preventDefault(); e.stopPropagation()
    const sl = slots[idx]; setSel(idx); setSelBId(null)
    setDrag({ idx, edge, startY: e.clientY, s: hmToMin(sl.start), dur: Number(sl.duration) || defaultDuration })
  }
  useEffect(() => {
    if (!drag) return
    function move(ev) {
      const dm = snap((ev.clientY - drag.startY) / PX)
      let ns = drag.s, nd = drag.dur
      if (drag.edge === 'top') { ns = Math.max(0, Math.min(drag.s + drag.dur - 5, drag.s + dm)); nd = drag.dur - (ns - drag.s) }
      else if (drag.edge === 'bottom') { nd = Math.max(5, Math.min(DAY - drag.s, drag.dur + dm)) }
      else { ns = Math.max(0, Math.min(DAY - drag.dur, drag.s + dm)) }
      onChangeRef.current?.(slotsRef.current.map((sl, i) => i === drag.idx ? { ...sl, start: minToHm(ns), duration: nd } : sl))
    }
    function up() { setDrag(null) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [drag])

  const addSlot = () => onSlotsChange?.([...(slots || []), { start: '09:00', duration: defaultDuration, blocked: false }])
  const updSel = patch => onSlotsChange?.(slots.map((sl, i) => i === sel ? { ...sl, ...patch } : sl))
  const delSel = () => { onSlotsChange?.(slots.filter((_, i) => i !== sel)); setSel(null) }

  const selB = bookings.find(b => b.id === selBId)
  async function bkPatch(b, patch) { try { await updateCalendarBooking(accId, b.id, patch); onBookingChanged?.() } catch (e) { alert(e.message) } }
  async function bkStatus(b, st) { try { await setBookingStatus(accId, b.id, st); onBookingChanged?.() } catch (e) { alert(e.message) } }
  async function bkResched(b) { const t = prompt('Nueva hora (HH:MM):', b.time); if (!t) return; try { await rescheduleCalendarBooking(accId, b.id, { date, time: t }); onBookingChanged?.() } catch (e) { alert(e.message) } }
  async function bkDel(b) { if (!confirm('¿Eliminar esta reserva?')) return; try { await deleteCalendarBooking(accId, b.id); setSelBId(null); onBookingChanged?.() } catch (e) { alert(e.message) } }

  return (
    <div>
      <div className={s.tlLegend}>
        <span><i style={{ background: color }} /> Horarios disponibles{editable ? ' (arrastra para ajustar)' : ''}</span>
        <span><i style={{ background: '#7c6fff' }} /> Citas agendadas</span>
        {editable && <button className={s.miniBtn} onClick={addSlot}>+ Horario</button>}
      </div>
      <div className={s.tlWrap} ref={ref}>
        <div className={s.tlInner} style={{ height: DAY * PX }} onClick={() => { setSel(null); setSelBId(null) }}>
          {Array.from({ length: 25 }).map((_, h) => (
            <div key={h} className={s.tlHour} style={{ top: h * 60 * PX }}><span>{String(h).padStart(2, '0')}:00</span></div>
          ))}
          {(slots || []).map((sl, i) => {
            const dur = Number(sl.duration) || defaultDuration
            const top = hmToMin(sl.start) * PX, height = Math.max(10, dur * PX)
            const blocked = !!sl.blocked
            return (
              <div key={i} className={`${s.tlSlot} ${sel === i ? s.tlSlotSel : ''}`}
                style={{ top, height, background: blocked ? 'rgba(255,95,95,.14)' : color + '2e', borderColor: blocked ? '#ff5f5f' : color, cursor: editable ? 'move' : 'pointer' }}
                onMouseDown={e => startDrag(e, i, 'move')}
                onClick={e => { e.stopPropagation(); if (editable) { setSel(i); setSelBId(null) } else if (onBlockTime) onBlockTime(sl.start) }}>
                {editable && !blocked && <div className={s.tlHandleTop} onMouseDown={e => startDrag(e, i, 'top')} />}
                <span className={s.tlSlotLabel} style={blocked ? { textDecoration: 'line-through', opacity: .7 } : undefined}>{sl.start} · {dur}m</span>
                {editable && !blocked && <div className={s.tlHandleBot} onMouseDown={e => startDrag(e, i, 'bottom')} />}
              </div>
            )
          })}
          {bookings.filter(b => b.status !== 'cancelled').map(b => {
            const top = hmToMin(b.time) * PX, height = Math.max(14, (b.duration || 30) * PX)
            const meta = STATUS_META[b.status] || STATUS_META.pending
            return (
              <div key={b.id} className={`${s.tlBooking} ${selBId === b.id ? s.tlBookingSel : ''}`}
                style={{ top, height, borderLeftColor: meta.color }}
                onClick={e => { e.stopPropagation(); setSelBId(b.id); setSel(null) }}>
                <span>{b.time} · {b.clientName || 'Reserva'}</span>
                <span className={s.tlBkMeta}>{b.duration}m · {meta.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {!editable && onBlockTime && <p className={s.hint} style={{ marginTop: 6 }}>Haz clic en un horario para bloquearlo (la fecha pasará a “personalizada”).</p>}

      {editable && sel != null && slots[sel] && (
        <div className={s.tlEdit}>
          <strong>Horario</strong>
          <input type="time" className={s.timeInput} value={slots[sel].start} onChange={e => updSel({ start: e.target.value })} />
          <span>Dur.</span>
          <input type="number" min="1" step="1" className={s.durInput} value={slots[sel].duration || defaultDuration} onChange={e => updSel({ duration: Math.max(1, Number(e.target.value) || 1) })} /> min
          <label className={s.switch}><input type="checkbox" checked={!!slots[sel].blocked} onChange={e => updSel({ blocked: e.target.checked })} /> Bloqueado</label>
          <button className={s.delMini} style={{ marginLeft: 'auto' }} onClick={delSel}>Eliminar</button>
        </div>
      )}

      {selB && (
        <div className={s.tlEdit}>
          <strong>Cita</strong>
          <span className={s.hint}>{selB.time} · {selB.clientName || '—'}{selB.clientPhone ? ` · ${selB.clientPhone}` : ''}</span>
          <span>Dur.</span>
          <input key={`${selB.id}_${selB.duration}`} type="number" min="1" step="1" className={s.durInput} defaultValue={selB.duration}
            onBlur={e => { const v = Math.max(1, Number(e.target.value) || selB.duration); if (v !== selB.duration) bkPatch(selB, { duration: v }) }} /> min
          <select className={s.statusSelect} value={selB.status} onChange={e => bkStatus(selB, e.target.value)}>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className={s.delMini} onClick={() => bkResched(selB)} title="Reagendar">🔁</button>
          <button className={s.delMini} style={{ marginLeft: 'auto' }} onClick={() => bkDel(selB)}>🗑</button>
        </div>
      )}
    </div>
  )
}

function AppointmentTab({ draft, set }) {
  const ap = draft.appointment || {}
  const upd = patch => set({ appointment: { ...ap, ...patch } })
  const types = ap.types || []
  return (
    <div>
      <div className={s.row3}>
        <div className={s.field}><label>Duración por defecto (min)</label><input type="number" className={s.input} value={ap.defaultDuration ?? 30} onChange={e => upd({ defaultDuration: Number(e.target.value) })} /></div>
        <div className={s.field}><label>Buffer entre citas (min)</label><input type="number" className={s.input} value={ap.buffer ?? 0} onChange={e => upd({ buffer: Number(e.target.value) })} /></div>
        <div className={s.field}><label>Máx. citas por día (0 = sin límite)</label><input type="number" className={s.input} value={ap.maxPerDay ?? 0} onChange={e => upd({ maxPerDay: Number(e.target.value) })} /></div>
      </div>
      <div className={s.row3}>
        <div className={s.field}><label>Antelación mínima (min)</label><input type="number" className={s.input} value={ap.minAdvanceMin ?? 60} onChange={e => upd({ minAdvanceMin: Number(e.target.value) })} /></div>
        <div className={s.field}><label>Antelación máxima (días)</label><input type="number" className={s.input} value={ap.maxAdvanceDays ?? 60} onChange={e => upd({ maxAdvanceDays: Number(e.target.value) })} /></div>
        <div className={s.field}><label>Capacidad simultánea</label><input type="number" className={s.input} value={ap.capacity ?? 1} disabled={!ap.allowSimultaneous} onChange={e => upd({ capacity: Number(e.target.value) })} /></div>
      </div>
      <label className={s.switch} style={{ marginBottom: 16 }}>
        <input type="checkbox" checked={!!ap.allowSimultaneous} onChange={e => upd({ allowSimultaneous: e.target.checked })} />
        Permitir reservas simultáneas (varias citas en el mismo horario)
      </label>
      <div className={s.field}>
        <label>Tipos de cita con duración variable</label>
        <span className={s.hint}>Opcional. Define tipos con su propia duración (ej. "Consulta inicial · 60 min").</span>
        {types.map((t, i) => (
          <div key={i} className={s.slotRow} style={{ marginTop: 6 }}>
            <input className={s.input} placeholder="Nombre del tipo" value={t.name || ''} onChange={e => upd({ types: types.map((x, k) => k === i ? { ...x, name: e.target.value } : x) })} />
            <input type="number" className={s.timeInput} placeholder="min" value={t.duration ?? 30} onChange={e => upd({ types: types.map((x, k) => k === i ? { ...x, duration: Number(e.target.value) } : x) })} />
            <button className={s.delMini} onClick={() => upd({ types: types.filter((_, k) => k !== i) })}>✕</button>
          </div>
        ))}
        <button className={s.miniBtn} style={{ marginTop: 6 }} onClick={() => upd({ types: [...types, { name: '', duration: 30 }] })}>+ Tipo de cita</button>
      </div>
    </div>
  )
}

function FormTab({ draft, set }) {
  const fc = draft.formConfig || {}
  const steps = useMemo(() => normalizeForm(fc), [fc])
  const allFields = steps.flatMap(st => st.fields || [])
  const setSteps = newSteps => set({ formConfig: { ...fc, steps: newSteps } })
  const upd = patch => set({ formConfig: { ...fc, ...patch } })

  const updStep = (i, patch) => setSteps(steps.map((st, k) => k === i ? { ...st, ...patch } : st))
  const moveStep = (i, dir) => { const j = i + dir; if (j < 0 || j >= steps.length) return; const a = [...steps];[a[i], a[j]] = [a[j], a[i]]; setSteps(a) }
  const delStep = i => setSteps(steps.filter((_, k) => k !== i))
  const addFieldsStep = () => setSteps([...steps, { id: 'st_' + uid8(), title: 'Nuevo paso', type: 'fields', fields: [] }])
  const addScheduleStep = () => { if (steps.some(st => st.type === 'schedule')) return; setSteps([...steps, { id: 'st_' + uid8(), title: 'Elige tu horario', type: 'schedule' }]) }
  const updField = (si, fi, patch) => updStep(si, { fields: steps[si].fields.map((f, k) => k === fi ? { ...f, ...patch } : f) })
  const addField = si => updStep(si, { fields: [...(steps[si].fields || []), { id: 'f_' + uid8(), label: '', type: 'text', required: false }] })
  const delField = (si, fi) => updStep(si, { fields: steps[si].fields.filter((_, k) => k !== fi) })
  const moveField = (si, fi, dir) => { const fs = [...steps[si].fields]; const j = fi + dir; if (j < 0 || j >= fs.length) return;[fs[fi], fs[j]] = [fs[j], fs[fi]]; updStep(si, { fields: fs }) }
  const hasSchedule = steps.some(st => st.type === 'schedule')

  return (
    <div>
      <p className={s.hint} style={{ marginBottom: 12 }}>Constructor del formulario público (asistente por pasos). Debe incluir un paso de <strong>selección de horario</strong>. El flujo a ejecutar al reservar se configura en General.</p>
      <div className={s.row2}>
        <div className={s.field}><label>Texto de introducción</label><textarea className={s.textarea} value={fc.intro || ''} onChange={e => upd({ intro: e.target.value })} placeholder="Reserva tu cita en pocos pasos…" /></div>
        <div className={s.field}><label>Mensaje de éxito</label><textarea className={s.textarea} value={fc.successMessage || ''} onChange={e => upd({ successMessage: e.target.value })} placeholder="¡Reserva confirmada! Te contactaremos pronto." /></div>
      </div>
      <div className={s.field}><label>Consentimiento WhatsApp</label>
        <label className={s.switch}><input type="checkbox" checked={fc.whatsappConsent !== false} onChange={e => upd({ whatsappConsent: e.target.checked })} /> Exigir autorización de contacto por WhatsApp</label>
      </div>

      <div className={s.field}>
        <label>Pasos del formulario</label>
        {steps.map((st, si) => (
          <div key={st.id} className={s.stepCard}>
            <div className={s.stepHead}>
              <span className={s.stepBadge}>{st.type === 'schedule' ? '🗓 Horario' : `Paso ${si + 1}`}</span>
              <input className={s.input} style={{ flex: 1 }} value={st.title || ''} onChange={e => updStep(si, { title: e.target.value })} placeholder="Título del paso" />
              <button className={s.delMini} onClick={() => moveStep(si, -1)} disabled={si === 0}>↑</button>
              <button className={s.delMini} onClick={() => moveStep(si, 1)} disabled={si === steps.length - 1}>↓</button>
              <button className={s.delMini} onClick={() => delStep(si)}>🗑</button>
            </div>
            {st.type === 'schedule'
              ? <div className={s.hint} style={{ padding: '6px 2px' }}>El usuario elige fecha y hora disponible del calendario en este paso.</div>
              : <div>
                {(st.fields || []).map((f, fi) => (
                  <FieldRow key={f.id} field={f} allFields={allFields}
                    onChange={patch => updField(si, fi, patch)} onDel={() => delField(si, fi)}
                    onUp={() => moveField(si, fi, -1)} onDown={() => moveField(si, fi, 1)} />
                ))}
                <button className={s.miniBtn} style={{ marginTop: 6 }} onClick={() => addField(si)}>+ Campo</button>
              </div>}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className={s.miniBtn} onClick={addFieldsStep}>+ Paso</button>
          {!hasSchedule && <button className={s.miniBtn} onClick={addScheduleStep}>+ Paso de horario</button>}
        </div>
        {!hasSchedule && <p className={s.hint} style={{ color: '#f5a623', marginTop: 6 }}>⚠ Falta el paso de selección de horario.</p>}
      </div>
    </div>
  )
}

function FieldRow({ field, allFields, onChange, onDel, onUp, onDown }) {
  const [open, setOpen] = useState(false)
  const needsOptions = ['select', 'multiselect'].includes(field.type)
  const others = allFields.filter(f => f.id !== field.id && f.label)
  return (
    <div className={s.fieldCard}>
      <div className={s.slotRow} style={{ flexWrap: 'wrap', gap: 6 }}>
        <input className={s.input} style={{ flex: 1, minWidth: 120 }} placeholder="Etiqueta" value={field.label || ''} onChange={e => onChange({ label: e.target.value })} />
        <select className={s.select} style={{ width: 'auto' }} value={field.type || 'text'} onChange={e => onChange({ type: e.target.value })}>
          {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <label className={s.switch}><input type="checkbox" checked={!!field.required} onChange={e => onChange({ required: e.target.checked })} /> Obligatorio</label>
        <button className={s.delMini} onClick={() => setOpen(o => !o)} title="Más opciones">⚙</button>
        <button className={s.delMini} onClick={onUp}>↑</button>
        <button className={s.delMini} onClick={onDown}>↓</button>
        <button className={s.delMini} onClick={onDel}>✕</button>
      </div>
      {field.map && <span className={s.hint}>Vinculado a: {field.map === 'clientName' ? 'Nombre' : field.map === 'clientPhone' ? 'Teléfono' : 'Email'} de la reserva</span>}
      {open && (
        <div className={s.fieldOpts}>
          <input className={s.input} placeholder="Texto de ayuda (opcional)" value={field.help || ''} onChange={e => onChange({ help: e.target.value })} />
          <input className={s.input} placeholder="Placeholder (opcional)" value={field.placeholder || ''} onChange={e => onChange({ placeholder: e.target.value })} />
          {needsOptions && <input className={s.input} placeholder="Opciones separadas por coma" value={(field.options || []).join(', ')} onChange={e => onChange({ options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) })} />}
          <div className={s.condRow}>
            <span className={s.hint}>Mostrar sólo si</span>
            <select className={s.select} style={{ width: 'auto' }} value={field.showIf?.field || ''} onChange={e => onChange({ showIf: e.target.value ? { field: e.target.value, value: field.showIf?.value || '' } : null })}>
              <option value="">(siempre)</option>
              {others.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            {field.showIf?.field && <><span className={s.hint}>=</span><input className={s.input} style={{ width: 120 }} placeholder="valor" value={field.showIf?.value || ''} onChange={e => onChange({ showIf: { field: field.showIf.field, value: e.target.value } })} /></>}
          </div>
        </div>
      )}
    </div>
  )
}

function IntegrationsTab() {
  return (
    <div>
      <div className={s.notice}>
        <strong>🔗 Sincronización con calendarios externos</strong>
        <p style={{ marginTop: 8 }}>La conexión OAuth bidireccional con <strong>Google Calendar</strong> y <strong>Zoho Calendar</strong> (bloquear disponibilidad cuando se crea un evento externo, liberar al eliminarlo, y webhooks en tiempo real) está planificada como siguiente fase del módulo.</p>
        <p style={{ marginTop: 8, color: 'var(--text3)' }}>La arquitectura ya soporta eventos externos: cada reserva tiene un campo <code>external_id</code> para enlazar con el evento de Google/Zoho durante la sincronización.</p>
      </div>
    </div>
  )
}

function PublicLinkTab({ calendar }) {
  const { account } = useAccount()
  const url = `${window.location.origin}/book/${account?.id}/${calendar.id}`
  const iframe = `<iframe src="${url}" width="100%" height="720" style="border:0;border-radius:12px"></iframe>`
  const copy = (text) => { navigator.clipboard?.writeText(text); }
  return (
    <div>
      <div className={s.field}><label>URL pública</label><div className={s.linkBox}>{url}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={s.ghostBtn} onClick={() => copy(url)}>📋 Copiar enlace</button>
          <a className={s.ghostBtn} href={url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>↗ Abrir</a>
        </div>
      </div>
      <div className={s.field}><label>Código embebible (iframe)</label><div className={s.linkBox}>{iframe}</div>
        <button className={s.ghostBtn} onClick={() => copy(iframe)}>📋 Copiar código</button>
      </div>
      {calendar.status !== 'active' && <div className={s.notice} style={{ color: '#f5a623' }}>⚠ El calendario está <strong>inactivo</strong>: el enlace público no aceptará reservas hasta que lo actives.</div>}
    </div>
  )
}

// ─── Reservas ────────────────────────────────────────────────────────────────
function BookingsTab({ calendar }) {
  const { account } = useAccount()
  const accId = account?.id
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('date_desc')
  const [showNew, setShowNew] = useState(false)

  const reload = useCallback(async () => {
    if (!accId) return
    setLoading(true)
    try { setRows(await listCalendarBookings(accId, calendar.id, status ? { status } : {})) } catch { setRows([]) }
    setLoading(false)
  }, [accId, calendar.id, status])
  useEffect(() => { reload() }, [reload])

  const filtered = useMemo(() => {
    let list = rows
    if (q.trim()) { const k = q.toLowerCase(); list = list.filter(b => [b.clientName, b.clientPhone, b.clientEmail].some(v => (v || '').toLowerCase().includes(k))) }
    const [field, dir] = sort.split('_')
    list = [...list].sort((a, b) => {
      const av = field === 'date' ? `${a.date} ${a.time}` : (a[field] || '')
      const bv = field === 'date' ? `${b.date} ${b.time}` : (b[field] || '')
      return dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    return list
  }, [rows, q, sort])

  async function changeStatus(b, st) { await setBookingStatus(accId, b.id, st); reload() }
  async function reschedule(b) {
    const date = prompt('Nueva fecha (YYYY-MM-DD):', b.date); if (!date) return
    const time = prompt('Nueva hora (HH:MM):', b.time); if (!time) return
    try { await rescheduleCalendarBooking(accId, b.id, { date, time }); reload() } catch (e) { alert(e.message) }
  }
  async function del(b) { if (confirm('¿Eliminar esta reserva?')) { await deleteCalendarBooking(accId, b.id); reload() } }

  function exportCsv() {
    const url = calendarBookingsExportUrl(accId, calendar.id, status ? { status } : {})
    // El endpoint requiere auth: descargamos con fetch + blob
    fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.blob()).then(blob => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
        a.download = `reservas_${calendar.name}.csv`; a.click(); URL.revokeObjectURL(a.href)
      }).catch(() => alert('No se pudo exportar'))
  }

  return (
    <div>
      <div className={s.toolbar}>
        <input className={s.search} placeholder="🔍 Buscar cliente / teléfono / email…" value={q} onChange={e => setQ(e.target.value)} />
        <select className={s.statusSelect} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={s.statusSelect} value={sort} onChange={e => setSort(e.target.value)}>
          <option value="date_desc">Fecha ↓</option>
          <option value="date_asc">Fecha ↑</option>
          <option value="clientName_asc">Cliente A-Z</option>
          <option value="status_asc">Estado</option>
        </select>
        <button className={s.ghostBtn} onClick={() => setShowNew(v => !v)}>{showNew ? '✕' : '+ Reserva'}</button>
        <button className={s.ghostBtn} onClick={exportCsv}>⬇ Exportar CSV</button>
        <button className={s.ghostBtn} onClick={reload}>↻</button>
      </div>

      {showNew && <NewBookingForm calendar={calendar} accId={accId} onDone={() => { setShowNew(false); reload() }} />}

      {loading ? <div className={s.hint}>Cargando…</div> : (
        <div className={s.bkTable}>
          <div className={s.bkHead}><span>Fecha</span><span>Hora</span><span>Duración</span><span>Cliente</span><span>Contacto</span><span>Estado</span><span></span></div>
          {filtered.length === 0 && <div className={s.bkRow} style={{ gridColumn: '1 / -1', color: 'var(--text3)' }}>Sin reservas.</div>}
          {filtered.map(b => {
            const st = STATUS_META[b.status] || STATUS_META.pending
            return (
              <div key={b.id} className={s.bkRow}>
                <span>{b.date}</span>
                <span>{b.time}</span>
                <span title="Duración en minutos (editable)">
                  <input type="number" min="1" step="1" defaultValue={b.duration} className={s.durInput}
                    onBlur={e => { const v = Math.max(1, Number(e.target.value) || b.duration); if (v !== b.duration) updateCalendarBooking(accId, b.id, { duration: v }).then(reload).catch(() => {}) }} />
                  <span className={s.hint}> min</span>
                </span>
                <span style={{ color: 'var(--text)' }}>{b.clientName || '—'}<div className={s.hint}>{b.channel}</div></span>
                <span className={s.hint}>{b.clientPhone}<br />{b.clientEmail}</span>
                <select className={s.statusSelect} value={b.status} onChange={e => changeStatus(b, e.target.value)} style={{ color: st.color }}>
                  {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className={s.delMini} title="Reagendar" onClick={() => reschedule(b)}>🔁</button>
                  <button className={s.delMini} title="Eliminar" onClick={() => del(b)}>🗑</button>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NewBookingForm({ calendar, accId, onDone }) {
  const [f, setF] = useState({ date: '', time: '', duration: calendar.appointment?.defaultDuration || 30, clientName: '', clientPhone: '', clientEmail: '' })
  const [slots, setSlots] = useState(null)
  const set = patch => setF(p => ({ ...p, ...patch }))
  useEffect(() => {
    if (!f.date) { setSlots(null); return }
    calendarAvailability(accId, calendar.id, f.date).then(r => setSlots(r.slots || [])).catch(() => setSlots([]))
  }, [f.date, accId, calendar.id])
  async function submit(e) {
    e.preventDefault()
    if (!f.date || !f.time || !f.clientName) { alert('Fecha, hora y nombre son obligatorios'); return }
    try { await createCalendarBooking(accId, calendar.id, { ...f, channel: 'manual', status: 'confirmed', validate: false }); onDone() }
    catch (err) { alert(err.message) }
  }
  return (
    <form onSubmit={submit} className={s.dayRow} style={{ marginBottom: 12 }}>
      <div className={s.row3}>
        <div className={s.field}><label>Fecha</label><input type="date" className={s.input} value={f.date} onChange={e => set({ date: e.target.value })} /></div>
        <div className={s.field}><label>Hora</label>
          {slots && slots.length ? (
            <select className={s.select} value={f.time} onChange={e => set({ time: e.target.value })}><option value="">— elegir —</option>{slots.map(t => <option key={t} value={t}>{t}</option>)}</select>
          ) : <input type="time" className={s.input} value={f.time} onChange={e => set({ time: e.target.value })} />}
          {slots && slots.length === 0 && <span className={s.hint}>Sin slots libres ese día (puedes forzar una hora manual arriba).</span>}
        </div>
        <div className={s.field}><label>Nombre</label><input className={s.input} value={f.clientName} onChange={e => set({ clientName: e.target.value })} /></div>
      </div>
      <div className={s.row3}>
        <div className={s.field}><label>Teléfono</label><input className={s.input} value={f.clientPhone} onChange={e => set({ clientPhone: e.target.value })} /></div>
        <div className={s.field}><label>Email</label><input className={s.input} value={f.clientEmail} onChange={e => set({ clientEmail: e.target.value })} /></div>
        <div className={s.field}><label>Duración (min)</label>
          <input type="number" min="1" step="1" className={s.input} value={f.duration} onChange={e => set({ duration: Math.max(1, Number(e.target.value) || 1) })} />
          <span className={s.hint}>Ajuste al minuto (ej. 33, 43…).</span>
        </div>
      </div>
      <button type="submit" className={s.newBtn} style={{ alignSelf: 'flex-start' }}>Crear reserva</button>
    </form>
  )
}
