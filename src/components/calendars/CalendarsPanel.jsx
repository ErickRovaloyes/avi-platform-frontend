import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAccount } from '../../context/AccountContext'
import { SYSTEM_VARIABLE_GROUPS } from '../../lib/systemVariables'
import {
  listCalendarBookings, createCalendarBooking, rescheduleCalendarBooking, updateCalendarBooking,
  setBookingStatus, deleteCalendarBooking, calendarBookingsExportUrl, calendarAvailability, getCountryHolidays,
  resolveBookingChat, listContacts, createContact,
  listWhatsAppTemplates, googleStatus,
  listTables, createTable, updateTable, deleteTable, listShifts, createShift, updateShift, deleteShift,
  listMovies, createMovie, updateMovie, deleteMovie, listAuditoriums, createAuditorium, updateAuditorium, deleteAuditorium,
  listShowtimesCfg, createShowtime, updateShowtime, deleteShowtime,
  listRoomTypes, createRoomType, updateRoomType, deleteRoomType, listRates, setRates, clearRate,
  getPaymentsConfig,
} from '../../lib/storage'
import { getToken, getSocket } from '../../lib/api'
import AvailabilityCalendar from '../common/AvailabilityCalendar'
import { normalizeForm, uid8 } from '../../lib/calendarForm'
import HotelPmsTab from './HotelPmsTab'
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
      vertical: draft.vertical || 'appointment',
      sharedGroup: draft.sharedGroup || '',
      availability: draft.availability, exceptions: draft.exceptions,
      appointment: draft.appointment, formConfig: draft.formConfig,
      notifications: draft.notifications || {}, integrations: draft.integrations || {},
      payment: draft.payment || {}, bookingVars: draft.bookingVars || [],
    })
    setDirty(false)
  }

  const isRestaurant = draft.vertical === 'restaurant'
  const isCinema = draft.vertical === 'cinema'
  const isHotel = draft.vertical === 'hotel'
  const isSpecial = isRestaurant || isCinema || isHotel
  const TABS = [
    { id: 'general', label: 'General' },
    ...(isRestaurant ? [{ id: 'restaurant', label: '🍽 Mesas y turnos' }] : []),
    ...(isCinema ? [{ id: 'cinema', label: '🎬 Cartelera y salas' }] : []),
    ...(isHotel ? [{ id: 'hotel', label: '🏨 Habitaciones y tarifas' }, { id: 'pms', label: '🛎 Recepción (PMS)' }] : []),
    ...(!isSpecial ? [{ id: 'schedule', label: 'Disponibilidad' }, { id: 'appointment', label: 'Citas' }] : []),
    { id: 'bookings', label: 'Reservas' },
    ...(draft.type === 'form' && !isSpecial ? [{ id: 'form', label: 'Formulario' }] : []),
    { id: 'notifications', label: 'Notificaciones' },
    { id: 'payment', label: '💳 Pago previo' },
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
        {tab === 'restaurant'   && <RestaurantTab calendar={calendar} />}
        {tab === 'cinema'       && <CinemaTab calendar={calendar} />}
        {tab === 'hotel'        && <HotelTab calendar={calendar} />}
        {tab === 'pms'          && <HotelPmsTab calendar={calendar} />}
        {tab === 'bookings'     && <BookingsTab calendar={calendar} />}
        {tab === 'form'         && <FormTab draft={draft} set={set} />}
        {tab === 'notifications' && <NotificationsTab draft={draft} set={set} />}
        {tab === 'payment'      && <PaymentTab draft={draft} set={set} />}
        {tab === 'integrations' && <IntegrationsTab draft={draft} set={set} />}
        {tab === 'link'         && <PublicLinkTab calendar={calendar} />}
      </div>
    </div>
  )
}

const AREAS = [
  { key: 'indoor', label: 'Interior' }, { key: 'terrace', label: 'Terraza' },
  { key: 'vip', label: 'VIP' }, { key: 'bar', label: 'Barra' },
]

function RestaurantTab({ calendar }) {
  const { account } = useAccount()
  const accId = account?.id
  const [tables, setTables] = useState([])
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)

  async function reload() {
    if (!accId) return
    try {
      const [t, sh] = await Promise.all([listTables(accId, calendar.id), listShifts(accId, calendar.id)])
      setTables(t || []); setShifts(sh || [])
    } catch { /* noop */ }
    setLoading(false)
  }
  useEffect(() => { reload() }, [accId, calendar.id]) // eslint-disable-line

  // ── Mesas ──
  async function addTable() { await createTable(accId, calendar.id, { name: `Mesa ${tables.length + 1}`, area: 'indoor', capMin: 1, capMax: 2, joinable: true }); reload() }
  async function patchTable(id, patch) { setTables(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t)); await updateTable(accId, id, patch) }
  async function removeTable(id) { await deleteTable(accId, id); reload() }
  // ── Turnos ──
  async function addShift() { await createShift(accId, calendar.id, { name: 'Turno', startTime: '12:00', endTime: '16:00', avgOccupancyMin: 90, slotEveryMin: 15 }); reload() }
  async function patchShift(id, patch) { setShifts(ss => ss.map(s2 => s2.id === id ? { ...s2, ...patch } : s2)); await updateShift(accId, id, patch) }
  async function removeShift(id) { await deleteShift(accId, id); reload() }

  if (loading) return <div className={s.hint}>Cargando…</div>

  const totalCap = tables.reduce((a, t) => a + (Number(t.capMax) || 0), 0)

  return (
    <div>
      <p className={s.hint} style={{ marginBottom: 12 }}>Define las <strong>mesas</strong> (capacidad, área, si se pueden unir) y los <strong>turnos</strong> (horario + tiempo medio de ocupación). La disponibilidad se calcula buscando mesas o combinaciones que acomoden al grupo dentro del turno.</p>

      {/* Mesas */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px', fontWeight: 700, fontSize: 14 }}>
        <span>🪑 Mesas ({tables.length} · capacidad total {totalCap})</span>
        <button className={s.ghostBtn} onClick={addTable}>+ Mesa</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
        {tables.length === 0 && <span className={s.hint}>Aún no hay mesas. Agrega la primera.</span>}
        {tables.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '8px 10px' }}>
            <input className={s.input} style={{ width: 110 }} value={t.name || ''} onChange={e => patchTable(t.id, { name: e.target.value })} placeholder="Nombre" />
            <select className={s.select} style={{ width: 110 }} value={t.area || 'indoor'} onChange={e => patchTable(t.id, { area: e.target.value })}>
              {AREAS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
            <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Min
              <input type="number" min="1" className={s.input} style={{ width: 56 }} value={t.capMin ?? 1} onChange={e => patchTable(t.id, { capMin: Math.max(1, Number(e.target.value) || 1) })} /></label>
            <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Max
              <input type="number" min="1" className={s.input} style={{ width: 56 }} value={t.capMax ?? 2} onChange={e => patchTable(t.id, { capMax: Math.max(1, Number(e.target.value) || 2) })} /></label>
            <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={t.joinable !== false} onChange={e => patchTable(t.id, { joinable: e.target.checked })} /> Unible</label>
            <button className={s.ghostBtn} style={{ marginLeft: 'auto' }} onClick={() => removeTable(t.id)}>🗑</button>
          </div>
        ))}
      </div>

      {/* Turnos */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px', fontWeight: 700, fontSize: 14 }}>
        <span>🕑 Turnos ({shifts.length})</span>
        <button className={s.ghostBtn} onClick={addShift}>+ Turno</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shifts.length === 0 && <span className={s.hint}>Aún no hay turnos. Agrega uno (p. ej. Almuerzo 12:00–16:00).</span>}
        {shifts.map(sh => {
          const days = Array.isArray(sh.days) ? sh.days : []
          const toggleDay = k => patchShift(sh.id, { days: days.includes(k) ? days.filter(d => d !== k) : [...days, k] })
          return (
            <div key={sh.id} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input className={s.input} style={{ width: 120 }} value={sh.name || ''} onChange={e => patchShift(sh.id, { name: e.target.value })} placeholder="Nombre" />
                <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>De
                  <input type="time" className={s.input} style={{ width: 110 }} value={sh.startTime || '12:00'} onChange={e => patchShift(sh.id, { startTime: e.target.value })} /></label>
                <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>a
                  <input type="time" className={s.input} style={{ width: 110 }} value={sh.endTime || '16:00'} onChange={e => patchShift(sh.id, { endTime: e.target.value })} /></label>
                <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Ocupación (min)
                  <input type="number" min="15" step="15" className={s.input} style={{ width: 72 }} value={sh.avgOccupancyMin ?? 90} onChange={e => patchShift(sh.id, { avgOccupancyMin: Math.max(15, Number(e.target.value) || 90) })} /></label>
                <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Cada (min)
                  <input type="number" min="5" step="5" className={s.input} style={{ width: 64 }} value={sh.slotEveryMin ?? 15} onChange={e => patchShift(sh.id, { slotEveryMin: Math.max(5, Number(e.target.value) || 15) })} /></label>
                <button className={s.ghostBtn} style={{ marginLeft: 'auto' }} onClick={() => removeShift(sh.id)}>🗑</button>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {DAYS.map(d => (
                  <button key={d.key} onClick={() => toggleDay(d.key)}
                    style={{ fontSize: 11, padding: '3px 9px', borderRadius: 14, cursor: 'pointer', border: '1px solid var(--border2)', background: (days.length === 0 || days.includes(d.key)) ? 'var(--accent)' : 'transparent', color: (days.length === 0 || days.includes(d.key)) ? '#fff' : 'var(--text2)' }}>
                    {d.label.slice(0, 3)}
                  </button>
                ))}
                <span className={s.hint} style={{ alignSelf: 'center' }}>{days.length === 0 ? '(todos los días)' : ''}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CinemaTab({ calendar }) {
  const { account } = useAccount()
  const accId = account?.id
  const [movies, setMovies] = useState([])
  const [auds, setAuds] = useState([])
  const [shows, setShows] = useState([])
  const [loading, setLoading] = useState(true)
  const [editAud, setEditAud] = useState(null) // sala en edición de mapa

  async function reload() {
    if (!accId) return
    try {
      const [m, a, sh] = await Promise.all([listMovies(accId, calendar.id), listAuditoriums(accId, calendar.id), listShowtimesCfg(accId, calendar.id)])
      setMovies(m || []); setAuds(a || []); setShows(sh || [])
    } catch { /* noop */ }
    setLoading(false)
  }
  useEffect(() => { reload() }, [accId, calendar.id]) // eslint-disable-line

  const sectionHead = (label, btn) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0 8px', fontWeight: 700, fontSize: 14 }}>
      <span>{label}</span>{btn}
    </div>
  )

  if (loading) return <div className={s.hint}>Cargando…</div>
  const movieName = id => movies.find(m => m.id === id)?.title || '—'
  const audName = id => auds.find(a => a.id === id)?.name || '—'

  return (
    <div>
      <p className={s.hint}>Define la <strong>cartelera</strong> (películas), las <strong>salas</strong> con su mapa de asientos, y las <strong>funciones</strong>. El cliente elige función y selecciona asientos en el mapa.</p>

      {/* Películas */}
      {sectionHead(`🎞 Películas (${movies.length})`, <button className={s.ghostBtn} onClick={async () => { await createMovie(accId, calendar.id, { title: 'Nueva película', durationMin: 120 }); reload() }}>+ Película</button>)}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {movies.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '8px 10px' }}>
            <input className={s.input} style={{ width: 200 }} value={m.title || ''} onChange={e => { setMovies(ms => ms.map(x => x.id === m.id ? { ...x, title: e.target.value } : x)); updateMovie(accId, m.id, { title: e.target.value }) }} placeholder="Título" />
            <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Dur (min)<input type="number" className={s.input} style={{ width: 70 }} value={m.durationMin ?? 120} onChange={e => { const v = Number(e.target.value) || 0; setMovies(ms => ms.map(x => x.id === m.id ? { ...x, durationMin: v } : x)); updateMovie(accId, m.id, { durationMin: v }) }} /></label>
            <input className={s.input} style={{ width: 64 }} value={m.rating || ''} onChange={e => { setMovies(ms => ms.map(x => x.id === m.id ? { ...x, rating: e.target.value } : x)); updateMovie(accId, m.id, { rating: e.target.value }) }} placeholder="Clasif." />
            <button className={s.ghostBtn} style={{ marginLeft: 'auto' }} onClick={async () => { await deleteMovie(accId, m.id); reload() }}>🗑</button>
          </div>
        ))}
        {movies.length === 0 && <span className={s.hint}>Aún no hay películas.</span>}
      </div>

      {/* Salas */}
      {sectionHead(`🏛 Salas (${auds.length})`, <button className={s.ghostBtn} onClick={async () => { await createAuditorium(accId, calendar.id, { name: `Sala ${auds.length + 1}`, screenType: '2D', seatMap: { rows: [{ row: 'A', count: 10, type: 'standard' }, { row: 'B', count: 10, type: 'standard' }], blocked: [] } }); reload() }}>+ Sala</button>)}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {auds.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '8px 10px' }}>
            <input className={s.input} style={{ width: 130 }} value={a.name || ''} onChange={e => { setAuds(xs => xs.map(x => x.id === a.id ? { ...x, name: e.target.value } : x)); updateAuditorium(accId, a.id, { name: e.target.value }) }} placeholder="Nombre" />
            <select className={s.select} style={{ width: 90 }} value={a.screenType || '2D'} onChange={e => { setAuds(xs => xs.map(x => x.id === a.id ? { ...x, screenType: e.target.value } : x)); updateAuditorium(accId, a.id, { screenType: e.target.value }) }}>
              {['2D', '3D', 'IMAX', 'VIP'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className={s.hint}>{(a.seatMap?.rows || []).reduce((n, r) => n + (r.count || 0), 0)} asientos</span>
            <button className={s.ghostBtn} onClick={() => setEditAud(a)}>🪑 Editar mapa</button>
            <button className={s.ghostBtn} style={{ marginLeft: 'auto' }} onClick={async () => { await deleteAuditorium(accId, a.id); reload() }}>🗑</button>
          </div>
        ))}
        {auds.length === 0 && <span className={s.hint}>Aún no hay salas.</span>}
      </div>

      {/* Funciones */}
      {sectionHead(`🎬 Funciones (${shows.length})`, <button className={s.ghostBtn} disabled={!movies.length || !auds.length} onClick={async () => { await createShowtime(accId, calendar.id, { movieId: movies[0]?.id, auditoriumId: auds[0]?.id, date: new Date().toISOString().slice(0, 10), time: '19:00', format: '2D', price: 0 }); reload() }}>+ Función</button>)}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {!movies.length || !auds.length ? <span className={s.hint} style={{ color: '#f5a623' }}>Crea al menos una película y una sala para programar funciones.</span> : null}
        {shows.map(sh => (
          <div key={sh.id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '8px 10px' }}>
            <select className={s.select} style={{ width: 170 }} value={sh.movieId || ''} onChange={e => { setShows(xs => xs.map(x => x.id === sh.id ? { ...x, movieId: e.target.value } : x)); updateShowtime(accId, sh.id, { movieId: e.target.value }) }}>
              {movies.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
            <select className={s.select} style={{ width: 110 }} value={sh.auditoriumId || ''} onChange={e => { setShows(xs => xs.map(x => x.id === sh.id ? { ...x, auditoriumId: e.target.value } : x)); updateShowtime(accId, sh.id, { auditoriumId: e.target.value }) }}>
              {auds.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input type="date" className={s.input} style={{ width: 140 }} value={sh.date || ''} onChange={e => { setShows(xs => xs.map(x => x.id === sh.id ? { ...x, date: e.target.value } : x)); updateShowtime(accId, sh.id, { date: e.target.value }) }} />
            <input type="time" className={s.input} style={{ width: 110 }} value={sh.time || ''} onChange={e => { setShows(xs => xs.map(x => x.id === sh.id ? { ...x, time: e.target.value } : x)); updateShowtime(accId, sh.id, { time: e.target.value }) }} />
            <select className={s.select} style={{ width: 80 }} value={sh.format || '2D'} onChange={e => { setShows(xs => xs.map(x => x.id === sh.id ? { ...x, format: e.target.value } : x)); updateShowtime(accId, sh.id, { format: e.target.value }) }}>
              {['2D', '3D', 'IMAX', 'VIP'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>$<input type="number" className={s.input} style={{ width: 72 }} value={sh.price ?? 0} onChange={e => { const v = Number(e.target.value) || 0; setShows(xs => xs.map(x => x.id === sh.id ? { ...x, price: v } : x)); updateShowtime(accId, sh.id, { price: v }) }} /></label>
            <button className={s.ghostBtn} style={{ marginLeft: 'auto' }} onClick={async () => { await deleteShowtime(accId, sh.id); reload() }}>🗑</button>
          </div>
        ))}
      </div>

      {editAud && <SeatMapEditor aud={editAud} accId={accId} onClose={() => { setEditAud(null); reload() }} />}
    </div>
  )
}

// Editor visual del mapa de asientos de una sala (filas + bloqueo por clic).
function SeatMapEditor({ aud, accId, onClose }) {
  const [map, setMap] = useState(() => ({ rows: aud.seatMap?.rows || [], blocked: aud.seatMap?.blocked || [] }))
  const blocked = new Set(map.blocked)
  const toggleBlocked = code => setMap(m => ({ ...m, blocked: blocked.has(code) ? m.blocked.filter(c => c !== code) : [...m.blocked, code] }))
  const addRow = () => { const next = String.fromCharCode(65 + map.rows.length); setMap(m => ({ ...m, rows: [...m.rows, { row: next, count: 10, type: 'standard' }] })) }
  const setRow = (i, patch) => setMap(m => ({ ...m, rows: m.rows.map((r, j) => j === i ? { ...r, ...patch } : r) }))
  const delRow = i => setMap(m => ({ ...m, rows: m.rows.filter((_, j) => j !== i) }))
  async function save() { await updateAuditorium(accId, aud.id, { seatMap: map }); onClose() }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 14, padding: 18 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <strong>Mapa de asientos · {aud.name}</strong>
          <button className={s.ghostBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ textAlign: 'center', background: 'var(--bg3)', borderRadius: 8, padding: 6, fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>PANTALLA</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', marginBottom: 14 }}>
          {map.rows.map((r) => (
            <div key={r.row} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 18, fontSize: 11, color: 'var(--text3)' }}>{r.row}</span>
              {Array.from({ length: r.count }, (_, k) => k + 1).map(n => {
                const code = `${r.row}${n}`; const isBlk = blocked.has(code)
                return <button key={code} onClick={() => toggleBlocked(code)} title={code}
                  style={{ width: 22, height: 22, borderRadius: 4, fontSize: 9, cursor: 'pointer', border: '1px solid var(--border2)', background: isBlk ? '#555' : (r.type === 'vip' ? 'var(--amber-dim,rgba(245,166,35,.25))' : 'var(--accent-dim)'), color: isBlk ? '#999' : 'var(--text)' }}>{isBlk ? '✕' : n}</button>
              })}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Clic en un asiento = bloquear/desbloquear. Edita las filas:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {map.rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input className={s.input} style={{ width: 50 }} value={r.row} onChange={e => setRow(i, { row: e.target.value.toUpperCase().slice(0, 2) })} />
              <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Asientos<input type="number" className={s.input} style={{ width: 64 }} value={r.count} onChange={e => setRow(i, { count: Math.max(1, Number(e.target.value) || 1) })} /></label>
              <select className={s.select} style={{ width: 110 }} value={r.type || 'standard'} onChange={e => setRow(i, { type: e.target.value })}>
                <option value="standard">Estándar</option><option value="vip">VIP</option>
              </select>
              <button className={s.ghostBtn} onClick={() => delRow(i)}>🗑</button>
            </div>
          ))}
          <button className={s.ghostBtn} onClick={addRow}>+ Fila</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className={s.ghostBtn} onClick={onClose}>Cancelar</button>
          <button className={s.saveBtn} onClick={save}>💾 Guardar mapa</button>
        </div>
      </div>
    </div>
  )
}

function HotelTab({ calendar }) {
  const { account } = useAccount()
  const accId = account?.id
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [rateRt, setRateRt] = useState(null) // tipo en edición de tarifas

  async function reload() {
    if (!accId) return
    try { setTypes(await listRoomTypes(accId, calendar.id) || []) } catch { /* noop */ }
    setLoading(false)
  }
  useEffect(() => { reload() }, [accId, calendar.id]) // eslint-disable-line

  async function add() { await createRoomType(accId, calendar.id, { name: 'Habitación', baseCapacity: 2, maxCapacity: 2, totalRooms: 1, basePrice: 100, currency: 'USD' }); reload() }
  async function patch(id, p) { setTypes(ts => ts.map(t => t.id === id ? { ...t, ...p } : t)); await updateRoomType(accId, id, p) }
  async function remove(id) { await deleteRoomType(accId, id); reload() }

  if (loading) return <div className={s.hint}>Cargando…</div>

  return (
    <div>
      <p className={s.hint} style={{ marginBottom: 12 }}>Define los <strong>tipos de habitación</strong> (capacidad, nº de habitaciones, precio base) y sus <strong>tarifas por temporada</strong>. La disponibilidad se calcula por noches: una estadía requiere cupo en todas sus noches.</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px', fontWeight: 700, fontSize: 14 }}>
        <span>🛏 Tipos de habitación ({types.length})</span>
        <button className={s.ghostBtn} onClick={add}>+ Tipo</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {types.length === 0 && <span className={s.hint}>Aún no hay tipos de habitación.</span>}
        {types.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '8px 10px' }}>
            <input className={s.input} style={{ width: 150 }} value={t.name || ''} onChange={e => patch(t.id, { name: e.target.value })} placeholder="Nombre" />
            <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Cap.<input type="number" min="1" className={s.input} style={{ width: 56 }} value={t.maxCapacity ?? 2} onChange={e => patch(t.id, { maxCapacity: Math.max(1, Number(e.target.value) || 2), baseCapacity: Math.max(1, Number(e.target.value) || 2) })} /></label>
            <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Habs.<input type="number" min="0" className={s.input} style={{ width: 56 }} value={t.totalRooms ?? 1} onChange={e => patch(t.id, { totalRooms: Math.max(0, Number(e.target.value) || 0) })} /></label>
            <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Overbook<input type="number" min="0" className={s.input} style={{ width: 52 }} value={t.overbookLimit ?? 0} onChange={e => patch(t.id, { overbookLimit: Math.max(0, Number(e.target.value) || 0) })} /></label>
            <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>$/noche<input type="number" min="0" className={s.input} style={{ width: 72 }} value={t.basePrice ?? 0} onChange={e => patch(t.id, { basePrice: Math.max(0, Number(e.target.value) || 0) })} /></label>
            <input className={s.input} style={{ width: 56 }} value={t.currency || 'USD'} onChange={e => patch(t.id, { currency: e.target.value.toUpperCase().slice(0, 3) })} />
            <button className={s.ghostBtn} onClick={() => setRateRt(t)}>📅 Tarifas</button>
            <button className={s.ghostBtn} style={{ marginLeft: 'auto' }} onClick={() => remove(t.id)}>🗑</button>
          </div>
        ))}
      </div>
      {rateRt && <RatesEditor rt={rateRt} accId={accId} onClose={() => setRateRt(null)} />}
    </div>
  )
}

// Editor de tarifas por temporada de un tipo de habitación.
function RatesEditor({ rt, accId, onClose }) {
  const [rateList, setRateList] = useState([])
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [price, setPrice] = useState(rt.basePrice || 0)
  async function reload() { try { setRateList(await listRates(accId, rt.id) || []) } catch {} }
  useEffect(() => { reload() }, []) // eslint-disable-line
  async function apply() { await setRates(accId, rt.id, { from, to, price: Number(price) || 0 }); reload() }
  async function clear(d) { await clearRate(accId, rt.id, d); reload() }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 14, padding: 18 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}><strong>Tarifas · {rt.name}</strong><button className={s.ghostBtn} onClick={onClose}>✕</button></div>
        <div className={s.hint} style={{ marginBottom: 10 }}>Precio base: {rt.basePrice} {rt.currency}/noche. Aquí fijas precios distintos por temporada/fechas.</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
          <label className={s.hint} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>Desde<input type="date" className={s.input} value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label className={s.hint} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>Hasta<input type="date" className={s.input} value={to} onChange={e => setTo(e.target.value)} /></label>
          <label className={s.hint} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>Precio<input type="number" className={s.input} style={{ width: 80 }} value={price} onChange={e => setPrice(e.target.value)} /></label>
          <button className={s.ghostBtn} onClick={apply}>Aplicar</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rateList.length === 0 && <span className={s.hint}>Sin tarifas especiales (se usa el precio base).</span>}
          {rateList.map(r => (
            <div key={r.date} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 110 }}>{r.date}</span><strong>{r.price} {rt.currency}</strong>
              <button className={s.ghostBtn} style={{ marginLeft: 'auto' }} onClick={() => clear(r.date)}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function GeneralTab({ draft, set }) {
  const { account } = useAccount()
  const flows = account?.flows || []
  const ap = draft.appointment || {}
  const updAp = patch => set({ appointment: { ...ap, ...patch } })
  const isForm = draft.type === 'form'
  // El horario semanal y los festivos sólo aplican al agendamiento por franjas.
  // Restaurante (turnos), cine (funciones) y hotel (noches) definen su
  // disponibilidad en sus propias pestañas, así que aquí se ocultan.
  const isSpecial = ['restaurant', 'cinema', 'hotel'].includes(draft.vertical)
  return (
    <div>
      <div className={s.field}><label>Nombre</label><input className={s.input} value={draft.name || ''} onChange={e => set({ name: e.target.value })} /></div>
      {!isForm && (
        <div className={s.field}><label>Tipo de negocio</label>
          <select className={s.select} value={draft.vertical || 'appointment'} onChange={e => set({ vertical: e.target.value })}>
            <option value="appointment">📅 Agendamiento por horario (citas, consultas, servicios)</option>
            <option value="restaurant">🍽 Restaurante (mesas + nº de personas)</option>
            <option value="cinema">🎬 Cine (funciones + mapa de asientos)</option>
            <option value="hotel">🏨 Hotel (habitaciones + noches)</option>
          </select>
          <span className={s.hint}>Define cómo se calcula la disponibilidad. Restaurante usa mesas y turnos, cine usa funciones y hotel usa noches en vez de franjas horarias.</span>
        </div>
      )}
      <div className={s.field}><label>Descripción <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(el agente IA la usa para elegir este calendario al agendar/mostrar disponibilidad)</span></label><textarea className={s.textarea} placeholder="Ej: Citas de odontología general (limpieza, caries, revisión). Duración 30 min." value={draft.description || ''} onChange={e => set({ description: e.target.value })} /></div>
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
      {!isSpecial && (
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
      )}
      {!isSpecial && <SharedSpacesField draft={draft} set={set} />}
      <div className={s.field}>
        <label>Flujo a ejecutar al crear una reserva (opcional)</label>
        <select className={s.select} value={draft.flowId || ''} onChange={e => set({ flowId: e.target.value || null })}>
          <option value="">— ninguno —</option>
          {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <span className={s.hint}>Se ejecuta cuando alguien reserva desde el enlace público. Recibe variables: {'{{cliente_nombre}}'}, {'{{cliente_telefono}}'}, {'{{reserva_fecha}}'}, {'{{reserva_hora}}'}, {'{{booking_id}}'}.</span>
      </div>
      {!isSpecial && <WeeklySchedule draft={draft} set={set} />}
    </div>
  )
}

// Espacios compartidos: agrupa calendarios del MISMO tipo para que se excluyan
// mutuamente (una cita en uno bloquea el horario solapado en los demás).
function SharedSpacesField({ draft, set }) {
  const { account } = useAccount()
  const allCals = account?.calendars || []
  const myVertical = draft.vertical || 'appointment'
  const myGroup = (draft.sharedGroup || '').trim()

  // Grupos existentes entre calendarios del mismo tipo (id → calendarios miembros).
  const groups = {}
  for (const c of allCals.filter(c => (c.vertical || 'appointment') === myVertical)) {
    const g = (c.sharedGroup || '').trim()
    if (!g) continue
    ;(groups[g] ||= []).push(c)
  }
  const options = Object.entries(groups).map(([g, members]) => ({
    value: g, label: `Grupo: ${members.map(m => m.name).join(', ')}`,
  }))
  if (myGroup && !options.find(o => o.value === myGroup)) {
    options.unshift({ value: myGroup, label: 'Grupo nuevo (asígnalo también a otro calendario)' })
  }
  const mates = myGroup ? (groups[myGroup] || []).filter(c => c.id !== draft.id) : []

  return (
    <div className={s.field}>
      <label>🔗 Espacios compartidos <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(exclusión mutua de citas entre calendarios del mismo tipo)</span></label>
      <select
        className={s.select}
        value={myGroup || ''}
        onChange={e => {
          const v = e.target.value
          if (v === '__new__') set({ sharedGroup: 'grp_' + Math.random().toString(36).slice(2, 9) })
          else set({ sharedGroup: v })
        }}
      >
        <option value="">No compartir espacios</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        <option value="__new__">➕ Crear grupo nuevo…</option>
      </select>
      <span className={s.hint}>
        Los calendarios del mismo tipo que compartan grupo se excluyen mutuamente: si alguien agenda en uno, el horario que se solape queda bloqueado en los demás (no se superponen las citas).
        {myGroup
          ? (mates.length
              ? ` Comparte espacios con: ${mates.map(m => m.name).join(', ')}.`
              : ' Aún sin otros calendarios en el grupo — asigna este mismo grupo a otro calendario del mismo tipo para que se bloqueen entre sí.')
          : ''}
      </span>
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
  // Tiempo real: refresca al recibir un cambio de Google Calendar (webhook).
  useEffect(() => {
    const sock = getSocket()
    const onCal = p => { if (!p?.calendarId || p.calendarId === calendarId) reloadBookings() }
    sock.on('calendar:updated', onCal)
    return () => sock.off('calendar:updated', onCal)
  }, [reloadBookings, calendarId])

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
  const { account } = useAccount()
  const ap = draft.appointment || {}
  const upd = patch => set({ appointment: { ...ap, ...patch } })
  const types = ap.types || []
  const bookingVars = Array.isArray(draft.bookingVars) ? draft.bookingVars : []
  const updBV = next => set({ bookingVars: next })
  // Variables asignables: personalizadas (por id) + de sistema "Perfil e historial" (por nombre).
  const customVarOpts = (account?.variables || []).map(v => ({ value: v.id, name: v.name, group: v.isSystem ? 'Sistema (cuenta)' : 'Personalizadas' }))
  const sysProfileOpts = (SYSTEM_VARIABLE_GROUPS.find(g => g.group === 'Perfil e historial')?.vars || [])
    .filter(v => !v.name.includes('<')).map(v => ({ value: v.name, name: v.name, group: 'Sistema · Perfil e historial' }))
  const varOpts = [...customVarOpts, ...sysProfileOpts]
  const varGroups = [...new Set(varOpts.map(o => o.group))].map(g => ({ group: g, items: varOpts.filter(o => o.group === g) }))
  const varName = val => varOpts.find(o => o.value === val)?.name || val || '?'
  const [newBV, setNewBV] = useState({ label: '', variable: '' })
  function addBV() {
    if (!newBV.label.trim() || !newBV.variable) return
    updBV([...bookingVars, { label: newBV.label.trim(), variable: newBV.variable }])
    setNewBV({ label: '', variable: '' })
  }
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

      <div className={s.field} style={{ marginTop: 18 }}>
        <label>Guardar datos en variables al agendar</label>
        <span className={s.hint}>Igual que en <strong>Herramientas IA</strong>: escribe en texto qué dato debe obtener la IA de la conversación al agendar, y elige la variable donde guardarlo. Al agendar, la IA extrae ese dato y lo guarda en la variable — úsala luego con <code>{'{{variable}}'}</code>, en flujos o el CRM. El listado incluye tus variables y las de sistema de <strong>Perfil e historial</strong>.</span>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {bookingVars.map((m, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 16, background: 'var(--bg3)', border: '1px solid var(--border2)', fontSize: 12 }}>
              <span style={{ color: 'var(--text)' }}>{m.label}</span>
              <span style={{ color: 'var(--accent)' }}>→ {`{{${varName(m.variable)}}}`}</span>
              <button type="button" onClick={() => updBV(bookingVars.filter((_, k) => k !== i))}
                style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>
            </span>
          ))}
          {!bookingVars.length && <span className={s.hint} style={{ margin: 0 }}>Sin datos configurados todavía.</span>}
        </div>

        <div className={s.slotRow} style={{ marginTop: 8, gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className={s.input} style={{ flex: 2, minWidth: 180 }} value={newBV.label}
            placeholder="Qué debe obtener la IA (ej: Motivo de la consulta, Nº de acompañantes)"
            onChange={e => setNewBV(p => ({ ...p, label: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBV() } }} />
          <span style={{ color: 'var(--text3)', fontSize: 13, fontWeight: 700 }}>→</span>
          <select className={s.input} style={{ flex: 1, minWidth: 170 }} value={newBV.variable}
            onChange={e => setNewBV(p => ({ ...p, variable: e.target.value }))}>
            <option value="">Guardar en variable…</option>
            {varGroups.map(g => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map(o => <option key={o.value} value={o.value}>{`{{${o.name}}}`}</option>)}
              </optgroup>
            ))}
          </select>
          <button type="button" className={s.miniBtn} onClick={addBV} disabled={!newBV.label.trim() || !newBV.variable}>+ Añadir</button>
        </div>
        {!varOpts.length && <div className={s.notice} style={{ marginTop: 6 }}>Aún no hay variables en la cuenta. Créalas en la sección <strong>Variables</strong>.</div>}
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

const NOTIF_EVENTS = [
  { key: 'confirmation', label: 'Confirmación', desc: 'Al crear la reserva' },
  { key: 'reschedule', label: 'Reagendamiento', desc: 'Al reagendar' },
  { key: 'cancellation', label: 'Cancelación', desc: 'Al cancelar' },
  { key: 'reminder', label: 'Recordatorio', desc: 'Antes de la cita — pide confirmar asistencia' },
]
const GOOGLE_EVENTS = [
  { key: 'confirmed', label: 'Confirmó asistencia (Google)', desc: 'El invitado aceptó la cita en su Google Calendar', iaHint: 'Agradécele por confirmar y dile que lo esperas.' },
  { key: 'cancelled_by_guest', label: 'Canceló / borró (Google)', desc: 'El invitado rechazó o borró el evento en su Google Calendar', iaHint: 'Dile que viste que canceló y ofrécele reagendar.' },
]
const NOTIF_MODES = [
  { v: 'default', label: 'Mensaje por defecto' },
  { v: 'ia', label: 'Mensaje con IA' },
  { v: 'flow', label: 'Flujo' },
]
const NOTIF_VARS = '{{cliente_nombre}} {{cliente_telefono}} {{cliente_email}} {{reserva_fecha}} {{reserva_hora}} {{reserva_id}} {{calendario}} {{evento}}'

// Cuerpo compartido: selector de modo (mensaje por defecto / IA / flujo) + campos según el modo.
function EventBody({ e, evKey, updEvent, flows, defaultFlowId, showMinutes, iaHint }) {
  const mode = e.mode || (e.flowId ? 'flow' : 'default')
  return (
    <>
      <div className={s.row2}>
        <div className={s.field}><label>Tipo de mensaje</label>
          <select className={s.select} value={mode} onChange={ch => updEvent(evKey, { mode: ch.target.value })}>
            {NOTIF_MODES.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
          </select>
        </div>
        {showMinutes && <div className={s.field}><label>Minutos antes</label><input type="number" min="5" step="5" className={s.input} value={e.minutesBefore ?? 60} onChange={ch => updEvent(evKey, { minutesBefore: Math.max(5, Number(ch.target.value) || 60) })} /></div>}
      </div>
      {mode === 'flow' && (
        <div className={s.field}><label>Flujo a ejecutar</label>
          <select className={s.select} value={e.flowId || ''} onChange={ch => updEvent(evKey, { flowId: ch.target.value || null })}>
            <option value="">— usar flujo por defecto —</option>
            {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          {!(e.flowId || defaultFlowId) && <span className={s.hint} style={{ color: '#f5a623' }}>⚠ Sin flujo seleccionado: elige uno o define el flujo por defecto.</span>}
        </div>
      )}
      {mode === 'ia' && (
        <div className={s.field}><label>Instrucción para la IA (opcional)</label>
          <textarea className={s.input} rows={2} placeholder={iaHint || 'Ej: Agradece al cliente y recuérdale la hora de su cita.'} value={e.iaInstruction || ''} onChange={ch => updEvent(evKey, { iaInstruction: ch.target.value })} />
          <span className={s.hint}>La IA redacta el mensaje con el prompt activo del agente. Vacío = usa el texto sugerido.</span>
        </div>
      )}
      {mode === 'default' && (
        <div className={s.field}><label>Mensaje (opcional)</label>
          <textarea className={s.input} rows={2} placeholder="Vacío = usa el mensaje integrado del sistema." value={e.message || ''} onChange={ch => updEvent(evKey, { message: ch.target.value })} />
          <span className={s.hint}>Variables: <code>{NOTIF_VARS}</code></span>
        </div>
      )}
    </>
  )
}

function NotificationsTab({ draft, set }) {
  const { account } = useAccount()
  const waAgents = (account?.agents || []).filter(a => (a.channels || []).some(c => c.type === 'whatsapp'))
  const flows = account?.flows || []
  const n = draft.notifications || {}
  const upd = patch => set({ notifications: { ...n, ...patch } })
  const updEvent = (key, patch) => upd({ events: { ...(n.events || {}), [key]: { ...(n.events?.[key] || {}), ...patch } } })

  return (
    <div>
      <p className={s.hint} style={{ marginBottom: 12 }}>Cada evento de la reserva <strong>envía un mensaje</strong> en la conversación del cliente (el chat de origen si la reserva nació en uno, o un chat de WhatsApp con el teléfono del cliente). Puede ser un mensaje por defecto, redactado por la IA con el prompt activo, o la ejecución de un flujo. Recibe las variables de la reserva.</p>
      <div className={s.row2}>
        <div className={s.field}><label>Ejecutar como (agente)</label>
          <select className={s.select} value={n.whatsappAgentId || ''} onChange={e => upd({ whatsappAgentId: e.target.value || null })}>
            <option value="">— primer agente de la cuenta —</option>
            {(account?.agents || []).map(a => <option key={a.id} value={a.id}>{a.name}{(a.channels || []).some(c => c.type === 'whatsapp') ? ' · WhatsApp' : ''}</option>)}
          </select>
          <span className={s.hint}>Define el canal de salida (WhatsApp) y bajo qué agente corre.</span>
          {waAgents.length === 0 && <span className={s.hint} style={{ color: '#f5a623' }}>Ningún agente tiene WhatsApp conectado (Ajustes → Canales). Las notificaciones por WhatsApp no se entregarán.</span>}
        </div>
        <div className={s.field}><label>Flujo por defecto</label>
          <select className={s.select} value={n.flowId || ''} onChange={e => upd({ flowId: e.target.value || null })}>
            <option value="">— ninguno —</option>
            {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <span className={s.hint}>Se usa para los eventos en modo Flujo que no tengan uno específico.</span>
        </div>
      </div>
      <span className={s.hint}>Variables disponibles: <code>{NOTIF_VARS}</code></span>

      {NOTIF_EVENTS.map(ev => {
        const e = n.events?.[ev.key] || {}
        return (
          <div key={ev.key} className={s.dayRow} style={{ marginTop: 10 }}>
            <div className={s.dayHead}>
              <span className={s.dayName}>{ev.label}</span>
              <span className={s.hint}>{ev.desc}</span>
              <label className={s.switch} style={{ marginLeft: 'auto' }}><input type="checkbox" checked={!!e.enabled} onChange={ch => updEvent(ev.key, { enabled: ch.target.checked })} /> Activo</label>
            </div>
            {e.enabled && <EventBody e={e} evKey={ev.key} updEvent={updEvent} flows={flows} defaultFlowId={n.flowId} showMinutes={ev.key === 'reminder'} />}
          </div>
        )
      })}

      <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px solid var(--border, #2a2a3a)' }}>
        <div className={s.dayName} style={{ fontSize: 14 }}>📆 Sincronización con Google Calendar</div>
        <p className={s.hint} style={{ marginTop: 4, marginBottom: 10 }}>Si el invitado <strong>confirma, rechaza o borra</strong> la cita desde su propio Google Calendar, la plataforma lo detecta y le responde en el chat automáticamente. Requiere tener la sincronización con Google activa en el calendario.</p>
        {GOOGLE_EVENTS.map(ev => {
          const e = n.events?.[ev.key] || {}
          const active = (e.mode || 'default') !== 'off'
          return (
            <div key={ev.key} className={s.dayRow} style={{ marginTop: 10 }}>
              <div className={s.dayHead}>
                <span className={s.dayName}>{ev.label}</span>
                <span className={s.hint}>{ev.desc}</span>
                <label className={s.switch} style={{ marginLeft: 'auto' }}><input type="checkbox" checked={active} onChange={ch => updEvent(ev.key, { mode: ch.target.checked ? (e.mode && e.mode !== 'off' ? e.mode : 'default') : 'off' })} /> Activo</label>
              </div>
              {active && <EventBody e={e} evKey={ev.key} updEvent={updEvent} flows={flows} defaultFlowId={n.flowId} iaHint={ev.iaHint} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PaymentTab({ draft, set }) {
  const { account } = useAccount()
  const pay = draft.payment || {}
  const upd = patch => set({ payment: { ...pay, ...patch } })
  const [gw, setGw] = useState(null)
  useEffect(() => { if (account?.id) getPaymentsConfig(account.id).then(setGw).catch(() => setGw(null)) }, [account?.id])
  const connected = !!gw?.connected
  const gwCurrency = (gw?.currency || 'COP').toUpperCase()

  return (
    <div>
      <div className={s.field}>
        <label>💳 Pago previo a la reserva</label>
        <span className={s.hint}>Exige que el cliente <strong>pague antes de confirmar</strong> la reserva. El cupo se aparta mientras paga; si el pago llega, la reserva se confirma automáticamente y se envían las notificaciones. Si no paga a tiempo, el cupo se libera.</span>
      </div>

      {gw && (connected
        ? <span className={`${s.badge} ${s.badgeOn}`} style={{ alignSelf: 'flex-start' }}>✓ Pasarela conectada{gw.provider ? ` (${gw.provider})` : ''} · {gwCurrency}</span>
        : <div className={s.notice} style={{ color: '#f5a623' }}>⚠ No hay pasarela de pago conectada. Conéctala en <strong>Zona IA → 💳 Pasarela de pago</strong> para poder cobrar por adelantado.</div>)}

      <label className={s.switch} style={{ margin: '12px 0' }}>
        <input type="checkbox" checked={!!pay.enabled} disabled={!connected} onChange={e => upd({ enabled: e.target.checked })} />
        Exigir pago para reservar en este calendario
      </label>

      {pay.enabled && connected && (
        <>
          <div className={s.row2}>
            <div className={s.field}><label>Monto a cobrar</label>
              <input className={s.input} type="number" min="0" step="any" value={pay.amount ?? ''} onChange={e => upd({ amount: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="Ej: 50000" />
              <span className={s.hint}>En la unidad de la moneda (p. ej. {gwCurrency} 50000 = $50.000).</span>
            </div>
            <div className={s.field}><label>Moneda</label>
              <input className={s.input} value={pay.currency || gwCurrency} onChange={e => upd({ currency: e.target.value.toUpperCase().slice(0, 6) })} placeholder={gwCurrency} />
            </div>
          </div>
          <div className={s.field}><label>Concepto del pago (opcional)</label>
            <input className={s.input} value={pay.description || ''} onChange={e => upd({ description: e.target.value })} placeholder="Ej: Abono de la cita / seña de reserva" />
            <span className={s.hint}>Se muestra en el checkout. Si lo dejas vacío usamos “Reserva {'{calendario}'} {'{fecha}'} {'{hora}'}”.</span>
          </div>
          <div className={s.field}><label>Tiempo para pagar (minutos)</label>
            <input className={s.input} type="number" min="5" max="1440" value={pay.holdMinutes ?? 30} onChange={e => upd({ holdMinutes: Math.max(5, Number(e.target.value) || 30) })} />
            <span className={s.hint}>Cuánto se aparta el cupo esperando el pago. Pasado ese tiempo sin pagar, se libera. (por defecto 30)</span>
          </div>
          {(!pay.amount || Number(pay.amount) <= 0) && <div className={s.notice} style={{ color: '#f5a623' }}>Define un monto mayor que 0 para activar el cobro.</div>}
        </>
      )}
    </div>
  )
}

function IntegrationsTab({ draft, set }) {
  const { account } = useAccount()
  const integ = draft.integrations || {}
  const gi = integ.google || {}
  const updG = patch => set({ integrations: { ...integ, google: { ...gi, ...patch } } })
  const [gStatus, setGStatus] = useState(null)
  useEffect(() => { if (account?.id) googleStatus(account.id).then(setGStatus).catch(() => setGStatus(null)) }, [account?.id])

  return (
    <div>
      <div className={s.field}>
        <label>🗓 Google Calendar</label>
        <span className={s.hint}>Empuja las reservas como eventos a tu Google Calendar (crear/reagendar/cancelar) y bloquea la disponibilidad según tus eventos ocupados. Requiere conectar Google en <strong>Ajustes → Google</strong> (concediendo permiso de Calendar).</span>
      </div>
      {gStatus && (gStatus.connected
        ? <span className={`${s.badge} ${s.badgeOn}`} style={{ alignSelf: 'flex-start' }}>✓ Google conectado{(gStatus.connections?.length > 1) ? ` (${gStatus.connections.length} cuentas)` : gStatus.email ? ` (${gStatus.email})` : ''}</span>
        : <div className={s.notice} style={{ color: '#f5a623' }}>⚠ Google no está conectado. Conéctalo en <strong>Ajustes → Google</strong>. Si ya estaba conectado antes de esta función, vuelve a conectarlo para conceder el permiso de Calendar.</div>)}

      <label className={s.switch} style={{ margin: '12px 0' }}><input type="checkbox" checked={!!gi.enabled} onChange={e => updG({ enabled: e.target.checked })} /> Sincronizar reservas con Google Calendar</label>
      {gi.enabled && (
        <>
          {(gStatus?.connections || []).length > 0 && (
            <div className={s.field}>
              <label>Cuenta de Google</label>
              <select className={s.input} value={gi.connectionId || (gStatus.connections[0]?.id || '')} onChange={e => updG({ connectionId: e.target.value })}>
                {gStatus.connections.map(c => <option key={c.id} value={c.id}>{c.email || c.id}</option>)}
              </select>
              <span className={s.hint}>Este calendario sincroniza con esta cuenta. Cada calendario puede usar una cuenta distinta; conéctalas en <strong>Ajustes → Google</strong>.</span>
            </div>
          )}
          <div className={s.row2}>
            <div className={s.field}><label>ID del calendario de Google</label>
              <input className={s.input} value={gi.calendarId || 'primary'} onChange={e => updG({ calendarId: e.target.value })} placeholder="primary o el email del calendario" />
              <span className={s.hint}>“primary” es tu calendario principal.</span>
            </div>
            <div className={s.field}><label>Disponibilidad</label>
              <label className={s.switch}><input type="checkbox" checked={!!gi.blockBusy} onChange={e => updG({ blockBusy: e.target.checked })} /> Bloquear horarios cuando haya un evento ocupado en Google</label>
            </div>
          </div>

          <div className={s.field} style={{ marginTop: 8 }}>
            <label>Personalizar el evento en Google Calendar</label>
            <span className={s.hint}>Usa las variables de sistema de la cita: <code>{'{_cita_cliente}'}</code> <code>{'{_cita_servicio}'}</code> <code>{'{_cita_fecha}'}</code> <code>{'{_cita_hora}'}</code> <code>{'{_cita_telefono}'}</code> <code>{'{_cita_email}'}</code> <code>{'{_cita_duracion}'}</code> <code>{'{_cita_notas}'}</code> (también valen las cortas <code>{'{cliente}'}</code>, <code>{'{fecha}'}</code>…). Son las mismas que quedan en la conversación al agendar (ver Variables → De sistema → "Cita agendada"). Déjalo vacío para usar el formato por defecto.</span>
          </div>
          <div className={s.row2}>
            <div className={s.field}><label>Título del evento</label>
              <input className={s.input} value={gi.eventTitle || ''} onChange={e => updG({ eventTitle: e.target.value })} placeholder="{servicio} — {cliente}" />
            </div>
            <div className={s.field}><label>Ubicación</label>
              <input className={s.input} value={gi.location || ''} onChange={e => updG({ location: e.target.value })} placeholder="Dirección / sala / enlace (opcional)" />
            </div>
          </div>
          <div className={s.field}><label>Descripción del evento</label>
            <textarea className={s.textarea} value={gi.eventDescription || ''} onChange={e => updG({ eventDescription: e.target.value })} placeholder={'Cliente: {cliente}\nTel: {telefono}\nNotas: {notas}'} />
          </div>
          <label className={s.switch}><input type="checkbox" checked={!!gi.addGuest} onChange={e => updG({ addGuest: e.target.checked })} /> Invitar al cliente como asistente (recibe la invitación en su correo si tiene email)</label>
        </>
      )}

      <div className={s.notice} style={{ marginTop: 12 }}>
        <strong>Zoho Calendar</strong>
        <p style={{ marginTop: 6, color: 'var(--text3)' }}>La integración con Zoho Calendar está planificada como siguiente fase.</p>
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
  const { account, openConversation } = useAccount()
  const accId = account?.id
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('date_desc')
  const [showNew, setShowNew] = useState(false)
  // El alta manual (fecha+hora+duración) y la edición de duración son propias del
  // agendamiento por cita. En restaurante/cine/hotel se gestionan en sus pestañas.
  const isSpecial = ['restaurant', 'cinema', 'hotel'].includes(calendar.vertical)

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
  async function goToChat(b) {
    try {
      const r = await resolveBookingChat(accId, b.id)
      if (r?.convId && r?.agentId) openConversation(r.agentId, r.convId)
      else alert('Esta reserva no tiene un chat asociado (se creó manualmente o sin conversación).')
    } catch { alert('No se pudo abrir el chat de esta reserva.') }
  }

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
        {!isSpecial && <button className={s.ghostBtn} onClick={() => setShowNew(v => !v)}>{showNew ? '✕' : '+ Reserva'}</button>}
        <button className={s.ghostBtn} onClick={exportCsv}>⬇ Exportar CSV</button>
        <button className={s.ghostBtn} onClick={reload}>↻</button>
      </div>

      {showNew && !isSpecial && <NewBookingForm calendar={calendar} accId={accId} onDone={() => { setShowNew(false); reload() }} />}

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
                {isSpecial
                  ? <span className={s.hint}>{b.duration ? `${b.duration} min` : '—'}</span>
                  : <span title="Duración en minutos (editable)">
                      <input type="number" min="1" step="1" defaultValue={b.duration} className={s.durInput}
                        onBlur={e => { const v = Math.max(1, Number(e.target.value) || b.duration); if (v !== b.duration) updateCalendarBooking(accId, b.id, { duration: v }).then(reload).catch(() => {}) }} />
                      <span className={s.hint}> min</span>
                    </span>}
                <span style={{ color: 'var(--text)' }}>{b.clientName || '—'}
                  <div className={s.hint}>
                    {b.channel}
                    {(() => {
                      const gs = b.meta?.googleSync
                      if (b.externalId || gs?.status === 'ok') return <span title={`Sincronizado a Google Calendar${gs?.eventId ? ` (evento ${gs.eventId})` : ''}`} style={{ color: '#22d98a', marginLeft: 6 }}>· 🗓✓</span>
                      if (gs?.status === 'error') return <span title={`No se sincronizó a Google: ${gs.error || 'error'}`} style={{ color: '#ff5f5f', marginLeft: 6 }}>· 🗓✗</span>
                      return null
                    })()}
                  </div>
                </span>
                <span className={s.hint}>{b.clientPhone}<br />{b.clientEmail}</span>
                <select className={s.statusSelect} value={b.status} onChange={e => changeStatus(b, e.target.value)} style={{ color: st.color }}>
                  {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className={s.delMini} title="Ir al chat del cliente" onClick={() => goToChat(b)}>💬</button>
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
  const { account } = useAccount()
  const isRestaurant = calendar.vertical === 'restaurant'
  const accent = calendar.color || '#7c6fff'
  const [party, setParty] = useState(2)
  const [f, setF] = useState({ date: '', time: '', duration: calendar.appointment?.defaultDuration || 30, clientName: '', clientPhone: '', clientEmail: '' })
  const set = patch => setF(p => ({ ...p, ...patch }))

  // Lead: nuevo o existente. Confirmación: ninguna / IA / flujo.
  const [leadMode, setLeadMode] = useState('new')          // 'new' | 'existing'
  const [createLead, setCreateLead] = useState(false)      // crear contacto CRM (lead nuevo)
  const [contacts, setContacts] = useState([])
  const [cq, setCq] = useState('')
  const [picked, setPicked] = useState(null)               // contacto existente elegido
  const [confirmMethod, setConfirmMethod] = useState('none') // 'none' | 'ia' | 'flow'
  const [confirmFlowId, setConfirmFlowId] = useState('')
  const [busy, setBusy] = useState(false)

  const flows = account?.flows || []
  const templateFlows = flows.filter(fl => (fl.nodes || []).some(n => n.type === 'send_whatsapp_template'))
  // Para un lead NUEVO solo se puede confirmar por FLUJO (con plantilla de WhatsApp), ya que
  // no existe conversación previa: un mensaje de IA (texto libre) no se le puede entregar.
  const flowOptions = leadMode === 'new' ? templateFlows : flows

  useEffect(() => { listContacts(accId).then(r => setContacts(Array.isArray(r) ? r : (r?.contacts || []))).catch(() => setContacts([])) }, [accId])
  const matches = useMemo(() => {
    const k = cq.trim().toLowerCase()
    const list = k ? contacts.filter(c => [c.name, c.phone, c.email].some(v => (v || '').toLowerCase().includes(k))) : contacts
    return list.slice(0, 8)
  }, [contacts, cq])

  function chooseLeadMode(mode) {
    setLeadMode(mode)
    if (mode === 'new' && confirmMethod === 'ia') setConfirmMethod('none') // IA no aplica a lead nuevo
    if (mode === 'new') setPicked(null)
    setConfirmFlowId('')
  }
  function pickContact(c) { setPicked(c); set({ clientName: c.name || '', clientPhone: c.phone || '', clientEmail: c.email || '' }) }

  async function submit(e) {
    e.preventDefault()
    if (!f.date || !f.time) { alert('Elige día y horario'); return }
    if (leadMode === 'existing' && !picked) { alert('Selecciona un lead de la lista'); return }
    if (leadMode === 'new' && !f.clientName.trim()) { alert('El nombre del lead es obligatorio'); return }
    if (confirmMethod === 'flow' && !confirmFlowId) { alert('Elige el flujo de confirmación'); return }
    setBusy(true)
    try {
      let contactId = picked?.id || null
      // Lead nuevo con opción de crear contacto en el CRM.
      if (leadMode === 'new' && createLead) {
        try { const c = await createContact(accId, { name: f.clientName.trim(), phone: f.clientPhone.trim(), email: f.clientEmail.trim() }); contactId = c?.id || null } catch { /* no bloquea la reserva */ }
      }
      const meta = {}
      if (contactId) meta.contactId = contactId
      meta.confirm = confirmMethod === 'flow' ? { method: 'flow', flowId: confirmFlowId } : { method: confirmMethod }
      await createCalendarBooking(accId, calendar.id, {
        date: f.date, time: f.time, duration: f.duration,
        clientName: f.clientName, clientPhone: f.clientPhone, clientEmail: f.clientEmail,
        ...(isRestaurant ? { partySize: party } : {}),
        channel: 'manual', status: 'confirmed', validate: false, meta,
      })
      onDone()
    } catch (err) { alert(err.message); setBusy(false) }
  }

  const seg = (on) => ({ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: on ? accent : 'var(--bg1)', color: on ? '#fff' : 'var(--text)', border: `1px solid ${on ? accent : 'var(--border2)'}` })

  return (
    <form onSubmit={submit} className={s.dayRow} style={{ marginBottom: 12 }}>
      {isRestaurant && (
        <div className={s.field}>
          <label>¿Cuántas personas?</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Array.from({ length: Math.max(8, calendar.appointment?.maxPartySize || 12) }, (_, i) => i + 1).map(n => (
              <button key={n} type="button" onClick={() => { setParty(n); set({ time: '' }) }} style={seg(n === party)}>{n}</button>
            ))}
          </div>
        </div>
      )}

      {/* Lead: nuevo o existente */}
      <div className={s.field}>
        <label>Lead / contacto</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => chooseLeadMode('new')} style={seg(leadMode === 'new')}>➕ Nuevo lead</button>
          <button type="button" onClick={() => chooseLeadMode('existing')} style={seg(leadMode === 'existing')}>👥 Lead existente</button>
        </div>
      </div>

      {leadMode === 'existing' && (
        <div className={s.field}>
          <input className={s.input} placeholder="🔍 Buscar lead por nombre / teléfono / email…" value={cq} onChange={e => setCq(e.target.value)} />
          {picked && <span className={s.hint} style={{ color: 'var(--green, #22d98a)' }}>Seleccionado: <strong>{picked.name || picked.phone || picked.email}</strong></span>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, maxHeight: 180, overflowY: 'auto' }}>
            {matches.length === 0 && <span className={s.hint}>{contacts.length ? 'Sin coincidencias.' : 'No hay leads registrados todavía.'}</span>}
            {matches.map(c => (
              <button type="button" key={c.id} onClick={() => pickContact(c)}
                style={{ textAlign: 'left', padding: '7px 10px', borderRadius: 8, cursor: 'pointer', background: picked?.id === c.id ? accent + '22' : 'var(--bg1)', border: `1px solid ${picked?.id === c.id ? accent : 'var(--border2)'}`, color: 'var(--text)' }}>
                <strong style={{ fontSize: 13 }}>{c.name || '(sin nombre)'}</strong>
                <span className={s.hint} style={{ marginLeft: 6 }}>{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selector visual de día + horario (igual que el link público) */}
      <AvailabilityCalendar
        accId={accId} calId={calendar.id} duration={f.duration}
        party={isRestaurant ? party : undefined}
        date={f.date} time={f.time}
        onPickDate={ds => set({ date: ds, time: '' })}
        onPickTime={t => set({ time: t })}
        accent={accent}
      />

      <div className={s.row3}>
        <div className={s.field}><label>Nombre</label><input className={s.input} value={f.clientName} onChange={e => set({ clientName: e.target.value })} disabled={leadMode === 'existing'} /></div>
        <div className={s.field}><label>Teléfono</label><input className={s.input} value={f.clientPhone} onChange={e => set({ clientPhone: e.target.value })} disabled={leadMode === 'existing'} /></div>
        <div className={s.field}><label>Email</label><input className={s.input} value={f.clientEmail} onChange={e => set({ clientEmail: e.target.value })} disabled={leadMode === 'existing'} /></div>
      </div>

      {leadMode === 'new' && (
        <label className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={createLead} onChange={e => setCreateLead(e.target.checked)} /> Crear también un contacto (lead) en el CRM con estos datos
        </label>
      )}

      <div className={s.row3}>
        <div className={s.field}><label>Duración (min)</label>
          <input type="number" min="1" step="1" className={s.input} value={f.duration} onChange={e => set({ duration: Math.max(1, Number(e.target.value) || 1) })} />
          <span className={s.hint}>Ajuste al minuto (ej. 33, 43…).</span>
        </div>
      </div>

      {/* Confirmación de la cita */}
      <div className={s.field}>
        <label>Mensaje de confirmación</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setConfirmMethod('none')} style={seg(confirmMethod === 'none')}>No enviar</button>
          {leadMode === 'existing' && <button type="button" onClick={() => setConfirmMethod('ia')} style={seg(confirmMethod === 'ia')}>🤖 Mensaje IA</button>}
          <button type="button" onClick={() => setConfirmMethod('flow')} style={seg(confirmMethod === 'flow')}>🔀 Flujo</button>
        </div>
        {leadMode === 'new'
          ? <span className={s.hint}>Para un lead <strong>nuevo</strong> solo se puede confirmar por <strong>flujo con una plantilla de WhatsApp</strong> (no hay conversación previa para enviar un mensaje de IA).</span>
          : <span className={s.hint}>A un lead existente puedes enviarle un mensaje redactado por la <strong>IA</strong> o ejecutar un <strong>flujo</strong>.</span>}
        {confirmMethod === 'flow' && (
          <>
            <select className={s.select} value={confirmFlowId} onChange={e => setConfirmFlowId(e.target.value)} style={{ marginTop: 6 }}>
              <option value="">— elige un flujo —</option>
              {flowOptions.map(fl => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
            </select>
            {leadMode === 'new' && templateFlows.length === 0 && <span className={s.hint} style={{ color: '#f5a623' }}>⚠ No tienes flujos con un nodo de plantilla de WhatsApp. Crea uno en Flujos para poder confirmar leads nuevos.</span>}
          </>
        )}
      </div>

      <button type="submit" className={s.newBtn} style={{ alignSelf: 'flex-start' }} disabled={!f.date || !f.time || busy}>{busy ? 'Creando…' : 'Crear reserva'}</button>
    </form>
  )
}
