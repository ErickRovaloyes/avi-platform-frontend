import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { demoSignup, demoRequestSignupCode, getDemoStatus, demoTemplateUrl } from '../../lib/storage'
import { setToken } from '../../lib/api'
import { getFingerprint } from '../../lib/fingerprint'

const OBJECTIVES = ['Atención al cliente', 'Ventas', 'Generación de leads', 'Reservas', 'Soporte técnico', 'Agendamiento']

// Definición de los pasos del onboarding (campos por paso).
const STEPS = [
  {
    title: 'Tus datos', subtitle: 'Empecemos por lo básico.',
    fields: [
      { k: 'name', label: 'Nombre completo', required: true },
      { k: 'email', label: 'Correo electrónico', type: 'email', required: true },
      { k: 'password', label: 'Contraseña', type: 'password', required: true },
      { k: 'phone', label: 'WhatsApp', placeholder: '+57 300 000 0000' },
      { k: 'company', label: 'Nombre de la empresa', required: true },
      { k: 'country', label: 'País' },
      { k: 'city', label: 'Ciudad' },
      { k: 'website', label: 'Sitio web (opcional)', placeholder: 'https://…' },
    ],
  },
  {
    title: 'Tu IA', subtitle: 'Configura tu asistente.',
    fields: [
      { k: 'iaName', label: 'Nombre de la IA', placeholder: 'Ej: Sofía, Max…', required: true },
      { k: 'industry', label: 'Industria o sector', placeholder: 'Ej: Inmobiliaria, Salud, Retail…' },
      { k: 'businessType', label: 'Tipo de negocio', placeholder: 'Ej: B2B, B2C, ecommerce…' },
      { k: 'objective', label: 'Objetivo principal de la IA', type: 'select', options: OBJECTIVES },
    ],
  },
  {
    title: 'Diagnóstico del negocio', subtitle: 'Cuéntanos para personalizar tu IA (entre más, mejor).',
    fields: [
      { k: 'whatCompanyDoes', label: '¿Qué hace tu empresa?', type: 'textarea' },
      { k: 'products', label: '¿Qué productos vendes?', type: 'textarea' },
      { k: 'services', label: '¿Qué servicios ofreces?', type: 'textarea' },
      { k: 'differentiator', label: '¿Qué te diferencia de la competencia?', type: 'textarea' },
      { k: 'idealClient', label: '¿Quién es tu cliente ideal?', type: 'textarea' },
      { k: 'faqs', label: 'Preguntas más frecuentes', type: 'textarea' },
      { k: 'objections', label: 'Objeciones más comunes', type: 'textarea' },
      { k: 'salesProcess', label: '¿Cómo funciona tu proceso comercial?', type: 'textarea' },
      { k: 'infoBeforeBuying', label: '¿Qué info pides antes de cerrar una venta?', type: 'textarea' },
      { k: 'hours', label: 'Horarios de atención' },
      { k: 'coverage', label: 'Cobertura geográfica' },
      { k: 'contactChannels', label: 'Canales de contacto' },
    ],
  },
]

export default function DemoSignupPage() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ objective: OBJECTIVES[0] })
  const [fp, setFp] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null) // resultado del signup
  const [status, setStatus] = useState({ enabled: true, hasTemplate: false })
  const [docFile, setDocFile] = useState(null)
  const [codeStep, setCodeStep] = useState(false)  // verificación de correo activa
  const [code, setCode] = useState('')

  useEffect(() => { setFp(getFingerprint()) }, [])
  useEffect(() => { getDemoStatus().then(s => s && setStatus(s)).catch(() => {}) }, [])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const regEnabled = status.enabled !== false
  const hasTplStep = !!status.hasTemplate
  const totalSteps = STEPS.length + (hasTplStep ? 1 : 0)
  const isTplStep = step === STEPS.length
  const isLast = step === totalSteps - 1

  function validateStep() {
    if (isTplStep) { setErr(''); return true } // la plantilla es opcional
    for (const f of STEPS[step].fields) {
      if (f.required && !String(form[f.k] || '').trim()) { setErr(`Completa: ${f.label}`); return false }
    }
    setErr(''); return true
  }
  function next() { if (validateStep()) setStep(s => Math.min(totalSteps - 1, s + 1)) }
  function back() { setErr(''); setStep(s => Math.max(0, s - 1)) }

  // Crea la cuenta (con el código de verificación si aplica).
  async function doSignup(code) {
    setBusy(true); setErr('')
    try {
      const r = await demoSignup({ ...form, code, fingerprint: fp, document: docFile || undefined })
      if (r?.token) { setToken(r.token); setDone(r) }
      else { setErr('No se pudo crear la cuenta.'); setBusy(false) }
    } catch (e) {
      // Si el backend pide código (verificación activa) volvemos al paso de código.
      if (e?.data?.needCode || /código/i.test(e?.message || '')) { setCodeStep(true); setErr(e?.message || 'Código requerido.') }
      else setErr(e?.message || 'No se pudo crear la cuenta Demo.')
      setBusy(false)
    }
  }

  async function submit() {
    if (!validateStep()) return
    setBusy(true); setErr('')
    try {
      // Pide un código de verificación; si la verificación no está activa, sigue directo.
      const r = await demoRequestSignupCode(form.email)
      if (r?.sent) { setCodeStep(true); setBusy(false); return }
      // skip:true (o sin verificación) → crear cuenta directamente
      await doSignup()
    } catch (e) { setErr(e?.message || 'No se pudo continuar con el registro.'); setBusy(false) }
  }

  async function resendCode() {
    setErr('')
    try { await demoRequestSignupCode(form.email); setErr('Código reenviado ✓') }
    catch (e) { setErr(e?.message || 'No se pudo reenviar.') }
  }

  const page = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }
  const card = { width: '100%', maxWidth: 560, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, padding: '32px 30px', boxShadow: 'var(--shadow-lg)' }
  const inp = { width: '100%', padding: '11px 13px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl = { fontSize: 12.5, color: 'var(--text2)', fontWeight: 600, marginBottom: 5, display: 'block' }
  const btn = (bg, c = '#fff') => ({ padding: '11px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', background: bg, color: c, fontSize: 14, fontWeight: 700 })

  // ── Pantalla de éxito ──
  if (done) {
    const url = done.webchatUrl || (done.agentId && done.webchatLink ? `${window.location.origin}/chat/${done.accountId}/${done.agentId}/${done.webchatLink}` : null)
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 46 }}>🎉</div>
          <h1 style={{ fontSize: 22, margin: '6px 0' }}>¡Tu IA está lista!</h1>
          <p style={{ fontSize: 14, color: 'var(--text2)', margin: '0 0 18px' }}>Creamos un asistente personalizado para <strong>{form.company}</strong> con la información de tu negocio.</p>
          <div style={{ textAlign: 'left', background: 'var(--bg3)', borderRadius: 12, padding: 16, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Cuenta</span><strong>{form.company}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>IA</span><strong>{done.iaName}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Estado</span><span style={{ color: '#22d98a', fontWeight: 700 }}>Demo activa</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Vence</span><span>{done.demoExpiresAt ? new Date(Number(done.demoExpiresAt)).toLocaleDateString('es') : '7 días'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Conversaciones</span><span>{done.demoMaxConversations || 100} disponibles</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text2)' }}>Canal</span><span>🌐 Webchat activo</span></div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {url && <a href={url} target="_blank" rel="noreferrer" style={{ ...btn('var(--green)'), textDecoration: 'none' }}>💬 Probar mi IA</a>}
            <button style={btn('linear-gradient(135deg,var(--accent),var(--accent2))')} onClick={() => { window.location.href = '/plataforma' }}>Ir al panel de control →</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Paso de verificación de correo (solo si el super admin lo activó) ──
  if (codeStep && !done) {
    return (
      <div style={page}>
        <div style={{ ...card, maxWidth: 440, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>📧</div>
          <h1 style={{ fontSize: 21, margin: '8px 0 4px' }}>Verifica tu correo</h1>
          <p style={{ fontSize: 14, color: 'var(--text2)', margin: '0 0 18px' }}>Enviamos un código de 6 dígitos a <strong>{form.email}</strong>.</p>
          <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" placeholder="000000" autoFocus
            style={{ ...inp, letterSpacing: 8, textAlign: 'center', fontSize: 24, fontWeight: 700 }} />
          {err && <div style={{ color: '#ff5f5f', fontSize: 13, marginTop: 10 }}>{err}</div>}
          <button style={{ ...btn('linear-gradient(135deg,var(--accent),var(--accent2))'), width: '100%', marginTop: 14 }}
            onClick={() => doSignup(code)} disabled={busy || code.length < 6}>
            {busy ? 'Creando tu IA…' : 'Verificar y crear mi IA'}
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 13 }}>
            <button onClick={() => { setCodeStep(false); setCode(''); setErr('') }} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer' }}>← Volver</button>
            <button onClick={resendCode} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>Reenviar código</button>
          </div>
        </div>
      </div>
    )
  }

  if (!regEnabled) {
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: 'center', maxWidth: 440 }}>
          <div style={{ fontSize: 40 }}>🚧</div>
          <h1 style={{ fontSize: 20, margin: '8px 0' }}>Registro temporalmente cerrado</h1>
          <p style={{ fontSize: 14, color: 'var(--text2)' }}>El registro de cuentas Demo está deshabilitado por ahora. Vuelve más tarde o escríbenos para acceder.</p>
          <Link to="/" style={{ color: 'var(--accent)', fontWeight: 600 }}>Iniciar sesión</Link>
        </div>
      </div>
    )
  }

  const cur = isTplStep ? { title: 'Plantilla de descubrimiento', subtitle: 'Opcional, pero personaliza mucho más tu IA.' } : STEPS[step]
  return (
    <div style={page}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>▲</div>
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>AVI Asistente · Prueba gratis</strong>
        </div>

        {/* Progreso */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {Array.from({ length: totalSteps }).map((_, i) => <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i <= step ? 'var(--accent)' : 'var(--bg4,#1f1f2a)' }} />)}
        </div>

        <h1 style={{ fontSize: 20, margin: '0 0 2px' }}>{cur.title}</h1>
        <p style={{ fontSize: 13.5, color: 'var(--text2)', margin: '0 0 18px' }}>Paso {step + 1} de {totalSteps} · {cur.subtitle}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '52vh', overflowY: 'auto', paddingRight: 4 }}>
          {isTplStep ? (
            <>
              <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.5 }}>
                Descarga la plantilla de descubrimiento empresarial, complétala con toda la información de tu negocio y vuélvela a subir. Con ella creamos una IA mucho más precisa. <strong>Puedes omitir este paso</strong> y completarlo luego.
              </div>
              <a href={demoTemplateUrl()} target="_blank" rel="noreferrer" style={{ ...btn('var(--bg3)', 'var(--text)'), textDecoration: 'none', textAlign: 'center', border: '1px solid var(--border2)' }}>⬇ Descargar plantilla</a>
              <label style={lbl}>Sube la plantilla completada (PDF o DOCX)</label>
              <input type="file" accept=".pdf,.docx,.doc" onChange={e => setDocFile(e.target.files?.[0] || null)} style={{ ...inp, padding: 9 }} />
              {docFile && <div style={{ fontSize: 12.5, color: '#22d98a' }}>✓ {docFile.name}</div>}
            </>
          ) : cur.fields.map(f => (
            <div key={f.k}>
              <label style={lbl}>{f.label}{f.required && <span style={{ color: 'var(--accent)' }}> *</span>}</label>
              {f.type === 'textarea'
                ? <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={form[f.k] || ''} onChange={e => set(f.k, e.target.value)} placeholder={f.placeholder || ''} />
                : f.type === 'select'
                  ? <select style={inp} value={form[f.k] || f.options[0]} onChange={e => set(f.k, e.target.value)}>{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select>
                  : <input type={f.type || 'text'} style={inp} value={form[f.k] || ''} onChange={e => set(f.k, e.target.value)} placeholder={f.placeholder || ''} autoComplete={f.type === 'password' ? 'new-password' : 'off'} />}
            </div>
          ))}
        </div>

        {err && <div style={{ fontSize: 13, color: '#ff5f5f', background: 'var(--red-dim)', border: '1px solid #ff5f5f44', borderRadius: 9, padding: '10px 12px', marginTop: 14 }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, gap: 10 }}>
          {step > 0
            ? <button style={{ ...btn('transparent', 'var(--text2)'), border: '1px solid var(--border2)' }} onClick={back} disabled={busy}>← Atrás</button>
            : <Link to="/" style={{ fontSize: 13, color: 'var(--text2)' }}>Ya tengo cuenta</Link>}
          {!isLast
            ? <button style={btn('var(--accent)')} onClick={next}>Continuar →</button>
            : <button style={btn('linear-gradient(135deg,var(--accent),var(--accent2))')} onClick={submit} disabled={busy}>{busy ? 'Creando tu IA…' : '✨ Crear mi IA'}</button>}
        </div>
        {busy && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10, textAlign: 'center' }}>Analizando tu negocio y construyendo tu asistente personalizado…</div>}
      </div>
    </div>
  )
}
