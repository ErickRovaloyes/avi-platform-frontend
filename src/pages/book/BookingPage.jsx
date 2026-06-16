import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { getPublicCalendar, getPublicAvailability, getPublicMonthAvailability, createPublicBooking } from '../../lib/storage'
import { normalizeForm, isFieldVisible } from '../../lib/calendarForm'

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const pad = n => String(n).padStart(2, '0')
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
// Celdas de la cuadrícula del mes (con blancos iniciales para alinear Dom→Sáb).
function monthCells(y, m) {
  const firstDow = new Date(y, m - 1, 1).getDay()
  const days = new Date(y, m, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(`${y}-${pad(m)}-${pad(d)}`)
  return cells
}

export default function BookingPage() {
  const { accId, calId } = useParams()
  const [searchParams] = useSearchParams()
  const convRef = searchParams.get('conv') || ''   // chat de origen (nodo "Enviar calendario")
  const [cal, setCal] = useState(null)
  const [error, setError] = useState(null)
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState(null)
  const [time, setTime] = useState('')
  const [answers, setAnswers] = useState({})   // por field.id
  const [consent, setConsent] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(null)
  const [monthCur, setMonthCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 } })
  const [availDays, setAvailDays] = useState(null) // Set de 'YYYY-MM-DD' con cupo (null = cargando)

  useEffect(() => {
    getPublicCalendar(accId, calId).then(setCal).catch(() => setError('Este calendario no está disponible.'))
  }, [accId, calId])
  useEffect(() => {
    if (!date) { setSlots(null); return }
    setSlots(null); setTime('')
    getPublicAvailability(accId, calId, date).then(r => setSlots(r.slots || [])).catch(() => setSlots([]))
  }, [date, accId, calId])
  // Días con cupo del mes mostrado → ilumina la cuadrícula.
  useEffect(() => {
    if (!cal) return
    setAvailDays(null)
    getPublicMonthAvailability(accId, calId, monthCur.y, monthCur.m, cal.appointment?.defaultDuration)
      .then(r => setAvailDays(new Set(r.days || [])))
      .catch(() => setAvailDays(new Set()))
  }, [cal, monthCur.y, monthCur.m, accId, calId])

  const isForm = cal?.type === 'form'
  const fc = cal?.formConfig || {}
  const accent = cal?.color || '#7c6fff'
  // Pasos: formulario → del builder; reservas → sólo selección de horario.
  const steps = useMemo(() => isForm ? normalizeForm(fc) : [{ id: 'sch', title: 'Elige tu horario', type: 'schedule' }], [isForm, fc])
  const allFields = useMemo(() => steps.flatMap(st => st.fields || []), [steps])
  const consentRequired = isForm && fc.whatsappConsent !== false
  const step = steps[stepIdx]
  const isLast = stepIdx === steps.length - 1

  function setAns(id, v) { setAnswers(a => ({ ...a, [id]: v })) }

  const today = todayStr()
  const curMonthKey = today.slice(0, 7)
  const cursorKey = `${monthCur.y}-${pad(monthCur.m)}`
  const canPrev = cursorKey > curMonthKey
  function shiftMonth(delta) {
    setMonthCur(c => { let m = c.m + delta, y = c.y; if (m < 1) { m = 12; y-- } if (m > 12) { m = 1; y++ } return { y, m } })
  }

  function validateStep(st) {
    if (st.type === 'schedule') { if (!date || !time) return 'Elige una fecha y un horario.'; return null }
    for (const f of (st.fields || [])) {
      if (!isFieldVisible(f, answers)) continue
      if (f.required && !answers[f.id]) return `Completa el campo "${f.label}".`
    }
    return null
  }

  function next() {
    const err = validateStep(step)
    if (err) { alert(err); return }
    if (!isLast) { setStepIdx(i => i + 1); return }
    submit()
  }

  async function submit() {
    if (consentRequired && !consent) { alert('Debes autorizar el contacto por WhatsApp para reservar.'); return }
    const payload = { date, time, answers: {}, whatsappConsent: consent, ...(convRef ? { conversationId: convRef } : {}) }
    for (const f of allFields) {
      if (!isFieldVisible(f, answers)) continue
      const v = answers[f.id]
      if (f.map === 'clientName') payload.clientName = v
      else if (f.map === 'clientPhone') payload.clientPhone = v
      else if (f.map === 'clientEmail') payload.clientEmail = v
      else if (v != null && v !== '' && v !== false) payload.answers[f.label || f.id] = v
    }
    setSubmitting(true)
    try { const r = await createPublicBooking(accId, calId, payload); setDone(r.booking) }
    catch (e) { alert(e.message || 'No se pudo reservar') }
    setSubmitting(false)
  }

  const page = { minHeight: '100vh', background: '#0d0d12', color: '#ebebf0', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif' }
  const card = { width: '100%', maxWidth: 560, background: '#16161d', border: '1px solid #2a2a35', borderRadius: 16, overflow: 'hidden' }
  const label = { fontSize: 13, color: '#a8a8b8', marginBottom: 5, display: 'block' }
  const input = { width: '100%', padding: '10px 12px', background: '#0d0d12', border: '1px solid #2a2a35', borderRadius: 8, color: '#ebebf0', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }
  const btn = (bg, dim) => ({ padding: '12px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', background: bg, color: '#fff', fontSize: 15, fontWeight: 700, opacity: dim ? .6 : 1 })

  if (error) return <div style={page}><div style={{ ...card, padding: 30, textAlign: 'center' }}><h2>⚠ {error}</h2></div></div>
  if (!cal) return <div style={page}><div style={{ ...card, padding: 30, textAlign: 'center' }}>Cargando…</div></div>

  if (done) {
    return (
      <div style={page}><div style={{ ...card, padding: 30, textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>✅</div>
        <h2 style={{ marginTop: 8 }}>{fc.successMessage ? '¡Listo!' : '¡Reserva confirmada!'}</h2>
        <p style={{ color: '#a8a8b8' }}>{done.date} a las {done.time}</p>
        <p style={{ color: '#7a7a88', fontSize: 13, marginTop: 12 }}>{fc.successMessage || 'Te contactaremos para los detalles. Puedes cerrar esta ventana.'}</p>
      </div></div>
    )
  }

  return (
    <div style={page}>
      <div style={card}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #2a2a35', background: `linear-gradient(135deg, ${accent}22, transparent)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: accent }} />
            <h2 style={{ margin: 0, fontSize: 18 }}>{cal.name}</h2>
          </div>
          {stepIdx === 0 && (fc.intro || cal.description) && <p style={{ color: '#a8a8b8', fontSize: 13, marginTop: 8, marginBottom: 0 }}>{fc.intro || cal.description}</p>}
          <div style={{ fontSize: 11, color: '#7a7a88', marginTop: 8 }}>🌐 {cal.timezone}{steps.length > 1 ? ` · Paso ${stepIdx + 1} de ${steps.length}` : ''}</div>
        </div>

        <div style={{ padding: 24 }}>
          {steps.length > 1 && <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{step.title}</div>}

          {step.type === 'schedule' ? (
            <>
              <label style={label}>Elige un día</label>
              <div style={{ background: '#0d0d12', border: '1px solid #2a2a35', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <button onClick={() => canPrev && shiftMonth(-1)} disabled={!canPrev} aria-label="Mes anterior"
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #2a2a35', background: '#16161d', color: '#ebebf0', cursor: canPrev ? 'pointer' : 'default', opacity: canPrev ? 1 : .3, fontSize: 16 }}>‹</button>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{MONTHS[monthCur.m - 1]} {monthCur.y}</div>
                  <button onClick={() => shiftMonth(1)} aria-label="Mes siguiente"
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #2a2a35', background: '#16161d', color: '#ebebf0', cursor: 'pointer', fontSize: 16 }}>›</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                  {DOW.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 10, color: '#7a7a88', padding: '2px 0' }}>{d}</div>)}
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
                      <button key={ds} disabled={disabled} onClick={() => !disabled && setDate(ds)}
                        title={disabled ? 'Sin disponibilidad' : 'Disponible'}
                        style={{
                          aspectRatio: '1 / 1', borderRadius: 8, fontSize: 14, fontWeight: 600,
                          cursor: disabled ? 'default' : 'pointer',
                          border: `1px solid ${selected ? accent : available ? accent + '66' : '#23232c'}`,
                          background: selected ? accent : available ? accent + '1f' : 'transparent',
                          color: selected ? '#fff' : disabled ? '#44444f' : '#ebebf0',
                          opacity: loading ? .5 : 1, transition: 'background .12s',
                        }}>{dayNum}</button>
                    )
                  })}
                </div>
                {availDays !== null && availDays.size === 0 && (
                  <div style={{ fontSize: 12, color: '#7a7a88', textAlign: 'center', marginTop: 10 }}>No hay días disponibles este mes. Prueba el siguiente ›</div>
                )}
              </div>
              {date && (
                <>
                  <label style={label}>Elige un horario</label>
                  {slots === null ? <div style={{ color: '#7a7a88', fontSize: 13 }}>Buscando horarios…</div>
                    : slots.length === 0 ? <div style={{ color: '#f5a623', fontSize: 13 }}>No hay horarios disponibles ese día.</div>
                      : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {slots.map(t => (
                            <button key={t} onClick={() => setTime(t)} style={{
                              padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                              background: t === time ? accent : '#0d0d12', color: t === time ? '#fff' : '#ebebf0',
                              border: `1px solid ${t === time ? accent : '#2a2a35'}`, fontSize: 13,
                            }}>{t}</button>
                          ))}
                        </div>
                      )}
                </>
              )}
            </>
          ) : (
            (step.fields || []).filter(f => isFieldVisible(f, answers)).map(f => (
              <div key={f.id}>
                <label style={label}>{f.label}{f.required ? ' *' : ''}</label>
                {f.help && <div style={{ fontSize: 11, color: '#7a7a88', marginTop: -2, marginBottom: 5 }}>{f.help}</div>}
                <FieldInput field={f} value={answers[f.id]} onChange={v => setAns(f.id, v)} inputStyle={input} />
              </div>
            ))
          )}

          {/* Consentimiento WhatsApp en el último paso */}
          {isLast && consentRequired && (
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#a8a8b8', margin: '8px 0 16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
              Autorizo ser contactado por WhatsApp para recibir información relacionada con mi reserva.
            </label>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            {stepIdx > 0 && <button onClick={() => setStepIdx(i => i - 1)} style={{ ...btn('#26262f'), flex: '0 0 auto' }}>← Atrás</button>}
            <button onClick={next} disabled={submitting} style={{ ...btn(accent, submitting), flex: 1 }}>
              {submitting ? 'Reservando…' : isLast ? `Confirmar reserva${date && time ? ` · ${date} ${time}` : ''}` : 'Siguiente →'}
            </button>
          </div>
        </div>
        <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: '#5a5a66', borderTop: '1px solid #2a2a35' }}>Powered by AVI Platform</div>
      </div>
    </div>
  )
}

function FieldInput({ field, value, onChange, inputStyle }) {
  const opts = field.options || []
  const ph = field.placeholder || ''
  switch (field.type) {
    case 'textarea': return <textarea style={{ ...inputStyle, minHeight: 70 }} placeholder={ph} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'checkbox': return <label style={{ display: 'flex', gap: 8, color: '#a8a8b8', fontSize: 13, marginBottom: 12 }}><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} /> Sí</label>
    case 'select': return <select style={inputStyle} value={value || ''} onChange={e => onChange(e.target.value)}><option value="">— elegir —</option>{opts.map(o => <option key={o} value={o}>{o}</option>)}</select>
    case 'multiselect': return (
      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {opts.map(o => {
          const arr = Array.isArray(value) ? value : []
          const on = arr.includes(o)
          return <button key={o} type="button" onClick={() => onChange(on ? arr.filter(x => x !== o) : [...arr, o])}
            style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, background: on ? '#7c6fff' : '#0d0d12', color: '#ebebf0', border: `1px solid ${on ? '#7c6fff' : '#2a2a35'}` }}>{o}</button>
        })}
      </div>
    )
    case 'date': return <input type="date" style={inputStyle} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'time': return <input type="time" style={inputStyle} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'email': return <input type="email" style={inputStyle} placeholder={ph} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'tel': return <input type="tel" style={inputStyle} placeholder={ph} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'file': return <input type="file" style={{ ...inputStyle, padding: 8 }} onChange={e => onChange(e.target.files?.[0]?.name || '')} />
    default: return <input style={inputStyle} placeholder={ph} value={value || ''} onChange={e => onChange(e.target.value)} />
  }
}
