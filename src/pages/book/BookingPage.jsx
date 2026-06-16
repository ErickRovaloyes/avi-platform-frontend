import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicCalendar, getPublicAvailability, createPublicBooking } from '../../lib/storage'

// Próximos N días (en formato YYYY-MM-DD, fecha local del navegador).
function nextDays(n) {
  const out = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const x = new Date(d.getTime() + i * 86400000)
    out.push(x.toISOString().slice(0, 10))
  }
  return out
}
const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
function fmtDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return { dow: DOW[d.getDay()], day: d.getDate(), month: d.toLocaleString('es', { month: 'short' }) }
}

export default function BookingPage() {
  const { accId, calId } = useParams()
  const [cal, setCal] = useState(null)
  const [error, setError] = useState(null)
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState(null)
  const [time, setTime] = useState('')
  const [form, setForm] = useState({ clientName: '', clientPhone: '', clientEmail: '', answers: {}, whatsappConsent: false })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    getPublicCalendar(accId, calId).then(setCal).catch(() => setError('Este calendario no está disponible.'))
  }, [accId, calId])

  useEffect(() => {
    if (!date) { setSlots(null); return }
    setSlots(null); setTime('')
    getPublicAvailability(accId, calId, date).then(r => setSlots(r.slots || [])).catch(() => setSlots([]))
  }, [date, accId, calId])

  const days = useMemo(() => nextDays(21), [])
  const isForm = cal?.type === 'form'
  const fc = cal?.formConfig || {}
  const consentRequired = isForm && fc.whatsappConsent !== false
  const accent = cal?.color || '#7c6fff'

  function setAnswer(label, value) { setForm(f => ({ ...f, answers: { ...f.answers, [label]: value } })) }

  async function submit() {
    if (!date || !time) { alert('Elige fecha y hora'); return }
    // Calendario de reservas (no formulario): sólo la selección de horario.
    if (!isForm) {
      setSubmitting(true)
      try { const r = await createPublicBooking(accId, calId, { date, time }); setDone(r.booking) }
      catch (e) { alert(e.message || 'No se pudo reservar') }
      setSubmitting(false)
      return
    }
    // Calendario de formulario: pide datos + consentimiento.
    if (!form.clientName.trim() || !form.clientPhone.trim()) { alert('Nombre y teléfono son obligatorios'); return }
    if (consentRequired && !form.whatsappConsent) { alert('Debes autorizar el contacto por WhatsApp.'); return }
    for (const f of (fc.fields || [])) {
      if (f.required && !form.answers[f.label]) { alert(`El campo "${f.label}" es obligatorio`); return }
    }
    setSubmitting(true)
    try {
      const r = await createPublicBooking(accId, calId, { date, time, ...form })
      setDone(r.booking)
    } catch (e) { alert(e.message || 'No se pudo reservar') }
    setSubmitting(false)
  }

  const page = { minHeight: '100vh', background: '#0d0d12', color: '#ebebf0', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif' }
  const card = { width: '100%', maxWidth: 560, background: '#16161d', border: '1px solid #2a2a35', borderRadius: 16, overflow: 'hidden' }

  if (error) return <div style={page}><div style={{ ...card, padding: 30, textAlign: 'center' }}><h2>⚠ {error}</h2></div></div>
  if (!cal) return <div style={page}><div style={{ ...card, padding: 30, textAlign: 'center' }}>Cargando…</div></div>

  if (done) {
    return (
      <div style={page}><div style={{ ...card, padding: 30, textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>✅</div>
        <h2 style={{ marginTop: 8 }}>¡Reserva confirmada!</h2>
        <p style={{ color: '#a8a8b8' }}>{done.date} a las {done.time}</p>
        <p style={{ color: '#7a7a88', fontSize: 13, marginTop: 12 }}>Te contactaremos para los detalles. Puedes cerrar esta ventana.</p>
      </div></div>
    )
  }

  const label = { fontSize: 13, color: '#a8a8b8', marginBottom: 5, display: 'block' }
  const input = { width: '100%', padding: '10px 12px', background: '#0d0d12', border: '1px solid #2a2a35', borderRadius: 8, color: '#ebebf0', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }

  return (
    <div style={page}>
      <div style={card}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #2a2a35', background: `linear-gradient(135deg, ${accent}22, transparent)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: accent }} />
            <h2 style={{ margin: 0, fontSize: 18 }}>{cal.name}</h2>
          </div>
          {(fc.intro || cal.description) && <p style={{ color: '#a8a8b8', fontSize: 13, marginTop: 8, marginBottom: 0 }}>{fc.intro || cal.description}</p>}
          <div style={{ fontSize: 11, color: '#7a7a88', marginTop: 8 }}>🌐 {cal.timezone}</div>
        </div>

        <div style={{ padding: 24 }}>
          {/* 1) Fecha */}
          <label style={label}>1 · Elige un día</label>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 14 }}>
            {days.map(d => {
              const f = fmtDay(d); const active = d === date
              return (
                <button key={d} onClick={() => setDate(d)} style={{
                  flex: '0 0 auto', width: 64, padding: '8px 4px', borderRadius: 10, cursor: 'pointer',
                  background: active ? accent : '#0d0d12', color: active ? '#fff' : '#ebebf0',
                  border: `1px solid ${active ? accent : '#2a2a35'}`, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 11, opacity: .7 }}>{f.dow}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{f.day}</div>
                  <div style={{ fontSize: 10, opacity: .7 }}>{f.month}</div>
                </button>
              )
            })}
          </div>

          {/* 2) Hora */}
          {date && (
            <>
              <label style={label}>2 · Elige un horario</label>
              {slots === null ? <div style={{ color: '#7a7a88', fontSize: 13, marginBottom: 14 }}>Buscando horarios…</div>
                : slots.length === 0 ? <div style={{ color: '#f5a623', fontSize: 13, marginBottom: 14 }}>No hay horarios disponibles ese día.</div>
                : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
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

          {/* Reservas (no formulario): sólo confirmar el horario */}
          {date && time && !isForm && (
            <button onClick={submit} disabled={submitting} style={{
              width: '100%', padding: 13, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: accent, color: '#fff', fontSize: 15, fontWeight: 700, opacity: submitting ? .6 : 1, marginTop: 6,
            }}>{submitting ? 'Reservando…' : `Confirmar reserva · ${date} ${time}`}</button>
          )}

          {/* 3) Datos (sólo formulario) */}
          {date && time && isForm && (
            <>
              <label style={label}>3 · Tus datos</label>
              <input style={input} placeholder="Nombre completo *" value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} />
              <input style={input} placeholder="Teléfono *" value={form.clientPhone} onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))} />
              <input style={input} placeholder="Email" type="email" value={form.clientEmail} onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))} />

              {(fc.fields || []).map((f, i) => (
                <div key={i}>
                  <label style={label}>{f.label}{f.required ? ' *' : ''}</label>
                  <FieldInput field={f} value={form.answers[f.label]} onChange={v => setAnswer(f.label, v)} inputStyle={input} />
                </div>
              ))}

              {consentRequired && (
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#a8a8b8', margin: '8px 0 16px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.whatsappConsent} onChange={e => setForm(f => ({ ...f, whatsappConsent: e.target.checked }))} style={{ marginTop: 3 }} />
                  Autorizo ser contactado por WhatsApp para recibir información relacionada con mi reserva.
                </label>
              )}

              <button onClick={submit} disabled={submitting} style={{
                width: '100%', padding: 13, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: accent, color: '#fff', fontSize: 15, fontWeight: 700, opacity: submitting ? .6 : 1,
              }}>{submitting ? 'Reservando…' : `Confirmar reserva · ${date} ${time}`}</button>
            </>
          )}
        </div>
        <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: '#5a5a66', borderTop: '1px solid #2a2a35' }}>Powered by AVI Platform</div>
      </div>
    </div>
  )
}

function FieldInput({ field, value, onChange, inputStyle }) {
  const opts = (field.options || (field.optionsText ? String(field.optionsText).split(',').map(o => o.trim()) : []))
  switch (field.type) {
    case 'textarea': return <textarea style={{ ...inputStyle, minHeight: 70 }} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'checkbox': return <label style={{ display: 'flex', gap: 8, color: '#a8a8b8', fontSize: 13, marginBottom: 12 }}><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} /> Sí</label>
    case 'select': return <select style={inputStyle} value={value || ''} onChange={e => onChange(e.target.value)}><option value="">— elegir —</option>{opts.map(o => <option key={o} value={o}>{o}</option>)}</select>
    case 'date': return <input type="date" style={inputStyle} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'time': return <input type="time" style={inputStyle} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'email': return <input type="email" style={inputStyle} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'tel': return <input type="tel" style={inputStyle} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'file': return <input type="file" style={{ ...inputStyle, padding: 8 }} onChange={e => onChange(e.target.files?.[0]?.name || '')} />
    default: return <input style={inputStyle} value={value || ''} onChange={e => onChange(e.target.value)} />
  }
}
