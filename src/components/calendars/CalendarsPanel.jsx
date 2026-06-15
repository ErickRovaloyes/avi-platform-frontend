import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  listCalendarBookings, createCalendarBooking, rescheduleCalendarBooking,
  setBookingStatus, deleteCalendarBooking, calendarBookingsExportUrl, calendarAvailability,
} from '../../lib/storage'
import { getToken } from '../../lib/api'
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
    { id: 'availability', label: 'Disponibilidad' },
    { id: 'exceptions', label: 'Excepciones' },
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
        {tab === 'availability' && <AvailabilityTab draft={draft} set={set} />}
        {tab === 'exceptions'   && <ExceptionsTab draft={draft} set={set} />}
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
    </div>
  )
}

function AvailabilityTab({ draft, set }) {
  const av = draft.availability || {}
  function update(dayKey, patch) { set({ availability: { ...av, [dayKey]: { ...(av[dayKey] || { enabled: false, slots: [] }), ...patch } } }) }
  function setSlot(dayKey, idx, field, val) {
    const day = av[dayKey] || { slots: [] }
    const slots = (day.slots || []).map((sl, i) => i === idx ? { ...sl, [field]: val } : sl)
    update(dayKey, { slots })
  }
  function addSlot(dayKey) { const day = av[dayKey] || { slots: [] }; update(dayKey, { enabled: true, slots: [...(day.slots || []), { start: '09:00', end: '13:00' }] }) }
  function delSlot(dayKey, idx) { const day = av[dayKey] || { slots: [] }; update(dayKey, { slots: (day.slots || []).filter((_, i) => i !== idx) }) }

  return (
    <div>
      <p className={s.hint} style={{ marginBottom: 12 }}>Define los horarios de atención por día. Puedes agregar varias franjas (ej. mañana y tarde).</p>
      {DAYS.map(d => {
        const day = av[d.key] || { enabled: false, slots: [] }
        return (
          <div key={d.key} className={s.dayRow}>
            <div className={s.dayHead}>
              <span className={s.dayName}>{d.label}</span>
              <label className={s.switch}>
                <input type="checkbox" checked={!!day.enabled} onChange={e => update(d.key, { enabled: e.target.checked })} />
                {day.enabled ? 'Disponible' : 'Cerrado'}
              </label>
            </div>
            {day.enabled && (
              <>
                {(day.slots || []).map((sl, i) => (
                  <div key={i} className={s.slotRow}>
                    <input type="time" className={s.timeInput} value={sl.start} onChange={e => setSlot(d.key, i, 'start', e.target.value)} />
                    <span style={{ color: 'var(--text3)' }}>—</span>
                    <input type="time" className={s.timeInput} value={sl.end} onChange={e => setSlot(d.key, i, 'end', e.target.value)} />
                    <button className={s.delMini} onClick={() => delSlot(d.key, i)}>✕</button>
                  </div>
                ))}
                <button className={s.miniBtn} onClick={() => addSlot(d.key)}>+ Franja</button>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ExceptionsTab({ draft, set }) {
  const exceptions = draft.exceptions || []
  function add() { set({ exceptions: [...exceptions, { date: '', type: 'block', slots: [{ start: '08:00', end: '12:00' }], note: '' }] }) }
  function upd(i, patch) { set({ exceptions: exceptions.map((e, idx) => idx === i ? { ...e, ...patch } : e) }) }
  function del(i) { set({ exceptions: exceptions.filter((_, idx) => idx !== i) }) }
  function setSlot(i, sIdx, field, val) { const ex = exceptions[i]; upd(i, { slots: (ex.slots || []).map((sl, k) => k === sIdx ? { ...sl, [field]: val } : sl) }) }

  return (
    <div>
      <p className={s.hint} style={{ marginBottom: 12 }}>Bloquea días/horas concretas o define un horario especial para una fecha (ej. el 24 de diciembre sólo 08:00–12:00).</p>
      {exceptions.map((ex, i) => (
        <div key={i} className={s.dayRow}>
          <div className={s.slotRow} style={{ flexWrap: 'wrap' }}>
            <input type="date" className={s.timeInput} style={{ width: 150 }} value={ex.date || ''} onChange={e => upd(i, { date: e.target.value })} />
            <select className={s.select} style={{ width: 'auto' }} value={ex.type} onChange={e => upd(i, { type: e.target.value })}>
              <option value="block">Bloquear día completo</option>
              <option value="custom">Horario especial</option>
            </select>
            <input className={s.input} style={{ flex: 1, minWidth: 120 }} placeholder="Nota (opcional)" value={ex.note || ''} onChange={e => upd(i, { note: e.target.value })} />
            <button className={s.delMini} onClick={() => del(i)}>✕</button>
          </div>
          {ex.type === 'custom' && (
            <div style={{ paddingLeft: 4 }}>
              {(ex.slots || []).map((sl, k) => (
                <div key={k} className={s.slotRow}>
                  <input type="time" className={s.timeInput} value={sl.start} onChange={e => setSlot(i, k, 'start', e.target.value)} />
                  <span style={{ color: 'var(--text3)' }}>—</span>
                  <input type="time" className={s.timeInput} value={sl.end} onChange={e => setSlot(i, k, 'end', e.target.value)} />
                  <button className={s.delMini} onClick={() => upd(i, { slots: ex.slots.filter((_, x) => x !== k) })}>✕</button>
                </div>
              ))}
              <button className={s.miniBtn} onClick={() => upd(i, { slots: [...(ex.slots || []), { start: '14:00', end: '18:00' }] })}>+ Franja</button>
            </div>
          )}
        </div>
      ))}
      <button className={s.miniBtn} onClick={add}>+ Excepción</button>
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
  const { account } = useAccount()
  const flows = account?.flows || []
  const fc = draft.formConfig || {}
  const upd = patch => set({ formConfig: { ...fc, ...patch } })
  const fields = fc.fields || []
  return (
    <div>
      <p className={s.hint} style={{ marginBottom: 12 }}>Configura el formulario público de agendamiento. El paso de selección de horario muestra sólo los slots disponibles del calendario.</p>
      <div className={s.field}><label>Texto de introducción</label><textarea className={s.textarea} value={fc.intro || ''} onChange={e => upd({ intro: e.target.value })} placeholder="Reserva tu cita en pocos pasos…" /></div>
      <div className={s.row2}>
        <div className={s.field}><label>Flujo a ejecutar al reservar</label>
          <select className={s.select} value={draft.flowId || ''} onChange={e => set({ flowId: e.target.value || null })}>
            <option value="">— ninguno —</option>
            {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div className={s.field}><label>Consentimiento WhatsApp</label>
          <label className={s.switch}><input type="checkbox" checked={fc.whatsappConsent !== false} onChange={e => upd({ whatsappConsent: e.target.checked })} /> Exigir autorización de contacto por WhatsApp</label>
        </div>
      </div>
      <div className={s.field}>
        <label>Campos del formulario</label>
        <span className={s.hint}>Además de nombre, teléfono y email (siempre presentes). Marca los obligatorios.</span>
        {fields.map((f, i) => (
          <div key={i} className={s.slotRow} style={{ marginTop: 6, flexWrap: 'wrap' }}>
            <input className={s.input} style={{ flex: 1, minWidth: 120 }} placeholder="Etiqueta" value={f.label || ''} onChange={e => upd({ fields: fields.map((x, k) => k === i ? { ...x, label: e.target.value } : x) })} />
            <select className={s.select} style={{ width: 'auto' }} value={f.type || 'text'} onChange={e => upd({ fields: fields.map((x, k) => k === i ? { ...x, type: e.target.value } : x) })}>
              {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <label className={s.switch}><input type="checkbox" checked={!!f.required} onChange={e => upd({ fields: fields.map((x, k) => k === i ? { ...x, required: e.target.checked } : x) })} /> Obligatorio</label>
            <button className={s.delMini} onClick={() => upd({ fields: fields.filter((_, k) => k !== i) })}>✕</button>
          </div>
        ))}
        <button className={s.miniBtn} style={{ marginTop: 6 }} onClick={() => upd({ fields: [...fields, { label: '', type: 'text', required: false }] })}>+ Campo</button>
      </div>
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
          <div className={s.bkHead}><span>Fecha</span><span>Hora</span><span>Cliente</span><span>Contacto</span><span>Estado</span><span></span></div>
          {filtered.length === 0 && <div className={s.bkRow} style={{ gridColumn: '1 / -1', color: 'var(--text3)' }}>Sin reservas.</div>}
          {filtered.map(b => {
            const st = STATUS_META[b.status] || STATUS_META.pending
            return (
              <div key={b.id} className={s.bkRow}>
                <span>{b.date}</span>
                <span>{b.time}</span>
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
  const [f, setF] = useState({ date: '', time: '', clientName: '', clientPhone: '', clientEmail: '' })
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
      <div className={s.row2}>
        <div className={s.field}><label>Teléfono</label><input className={s.input} value={f.clientPhone} onChange={e => set({ clientPhone: e.target.value })} /></div>
        <div className={s.field}><label>Email</label><input className={s.input} value={f.clientEmail} onChange={e => set({ clientEmail: e.target.value })} /></div>
      </div>
      <button type="submit" className={s.newBtn} style={{ alignSelf: 'flex-start' }}>Crear reserva</button>
    </form>
  )
}
