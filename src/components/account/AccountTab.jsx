import { useState, useEffect, useCallback } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getAccountSubscription, updateAccountApi } from '../../lib/storage'
import { getSocket } from '../../lib/api'
import AccountChatThemeTab from '../inbox/AccountChatThemeTab'

// Nombre de la cuenta editable (owner). El apodo interno no cambia al renombrar.
function AccountNameEditor() {
  const { account, reloadAccount } = useAccount()
  const [name, setName] = useState(account?.name || '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { setName(account?.name || '') }, [account?.name])
  async function save() {
    if (!name.trim() || name.trim() === account?.name) { setEditing(false); return }
    setSaving(true); setMsg('')
    try { await updateAccountApi(account.id, { name: name.trim() }); await reloadAccount?.(); setEditing(false); setMsg('✓') }
    catch (e) { setMsg(e.message || 'Error') }
    setSaving(false); setTimeout(() => setMsg(''), 2500)
  }
  const rowS = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }
  return (
    <>
      <div style={rowS}>
        <span style={{ color: 'var(--text2)' }}>Nombre</span>
        {editing ? (
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={name} onChange={e => setName(e.target.value)} style={{ width: 180, padding: '5px 8px' }} autoFocus onKeyDown={e => e.key === 'Enter' && save()} />
            <button onClick={save} disabled={saving} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{saving ? '…' : 'Guardar'}</button>
            <button onClick={() => { setEditing(false); setName(account?.name || '') }} style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12 }}>✕</button>
          </span>
        ) : (
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <strong>{account?.name || '—'}</strong>
            <button onClick={() => setEditing(true)} title="Cambiar nombre" style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12 }}>✎</button>
            {msg && <span style={{ fontSize: 12, color: 'var(--green)' }}>{msg}</span>}
          </span>
        )}
      </div>
      {account?.nickname && account.nickname !== account.name && (
        <div style={rowS}><span style={{ color: 'var(--text2)' }}>Identificador interno</span><span style={{ color: 'var(--text3)' }} title="Apodo fijo de la cuenta (no cambia al renombrar)">{account.nickname}</span></div>
      )}
    </>
  )
}

// Zonas horarias comunes (IANA) para el selector; se puede escribir cualquier otra.
const COMMON_TZS = [
  'America/Lima', 'America/Bogota', 'America/Mexico_City', 'America/Argentina/Buenos_Aires',
  'America/Santiago', 'America/Caracas', 'America/Sao_Paulo', 'America/New_York',
  'America/Los_Angeles', 'America/Chicago', 'Europe/Madrid', 'Europe/London',
  'Europe/Paris', 'Africa/Casablanca', 'Asia/Dubai', 'Asia/Shanghai', 'Asia/Tokyo', 'UTC',
]

// Conciencia temporal de la IA: zona horaria local + (opcional) fecha/hora base fija.
// Se guarda por cuenta y se inyecta en el prompt para que el asistente sepa la fecha
// y hora, y pueda razonar sobre cualquier zona horaria del mundo.
function AiDatetimeConfig() {
  const { account, reloadAccount } = useAccount()
  const [tz, setTz] = useState(account?.aiTimezone || 'America/Lima')
  const [enabled, setEnabled] = useState(account?.aiDatetimeEnabled !== false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [, setNow] = useState(0)
  useEffect(() => {
    setTz(account?.aiTimezone || 'America/Lima')
    setEnabled(account?.aiDatetimeEnabled !== false)
  }, [account?.aiTimezone, account?.aiDatetimeEnabled])
  // Refresca la vista previa cada minuto (siempre muestra la hora real).
  useEffect(() => { const id = setInterval(() => setNow(n => n + 1), 30000); return () => clearInterval(id) }, [])

  // Previsualización de la hora local REAL según la zona elegida.
  let preview = ''
  try {
    preview = new Date().toLocaleString('es', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { preview = 'Zona horaria inválida' }

  async function save() {
    setSaving(true); setMsg('')
    try {
      await updateAccountApi(account.id, { aiTimezone: tz.trim(), aiDatetimeEnabled: enabled })
      await reloadAccount?.()
      setMsg('✓ Guardado')
    } catch (e) { setMsg(e.message || 'Error') }
    setSaving(false); setTimeout(() => setMsg(''), 2500)
  }

  const lbl = { fontSize: 12.5, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 5 }
  const inp = { width: '100%', padding: '9px 11px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, color: 'var(--text)', fontSize: 13.5, boxSizing: 'border-box' }
  return (
    <div style={card}>
      <div style={cardTitle}>🕐 Fecha y hora de la IA</div>
      <p style={{ fontSize: 12.5, color: 'var(--text2)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Da a tu asistente conciencia de la fecha y hora actuales (en la zona horaria que elijas). Con esto responde
        correctamente sobre “hoy/mañana”, plazos y horarios, y puede calcular la hora en <strong>cualquier zona horaria del mundo</strong>.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, cursor: 'pointer', marginBottom: 14 }}>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        Inyectar la fecha y hora en el prompt de la IA
      </label>
      <div style={{ maxWidth: 320, opacity: enabled ? 1 : 0.5, pointerEvents: enabled ? 'auto' : 'none' }}>
        <label style={lbl}>Zona horaria local</label>
        <input list="avi-tz-list" value={tz} onChange={e => setTz(e.target.value)} placeholder="America/Lima" style={inp} />
        <datalist id="avi-tz-list">{COMMON_TZS.map(z => <option key={z} value={z} />)}</datalist>
      </div>
      {enabled && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text2)', background: 'var(--bg3)', borderRadius: 8, padding: '9px 11px' }}>
          La IA verá ahora: <strong style={{ color: 'var(--text)' }}>{preview || '—'}</strong>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <button onClick={save} disabled={saving} style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>{saving ? 'Guardando…' : 'Guardar'}</button>
        {msg && <span style={{ fontSize: 12.5, color: 'var(--green)' }}>{msg}</span>}
      </div>
    </div>
  )
}

const STATUS_META = {
  active:    { label: 'Activa',             color: '#22d98a', icon: '🟢' },
  grace:     { label: 'En período de gracia', color: '#f5a623', icon: '🟠' },
  suspended: { label: 'Suspendida',         color: '#ff5f5f', icon: '🔴' },
  expired:   { label: 'Vencida',            color: '#ff5f5f', icon: '🔴' },
}
const fmtDate = ts => ts ? new Date(Number(ts)).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'
const daysLeft = ts => ts ? Math.max(0, Math.ceil((Number(ts) - Date.now()) / 86400000)) : null
const CHANNELS = [
  { key: 'webchat', label: '🌐 Webchat', max: 'maxWebchatChannels' },
  { key: 'whatsapp', label: '📱 WhatsApp', max: 'maxWhatsappChannels' },
  { key: 'messenger', label: '💬 Messenger', max: 'maxMessengerChannels' },
  { key: 'instagram', label: '📸 Instagram', max: 'maxInstagramChannels' },
  { key: 'test', label: '🧪 Test', max: 'maxTestChannels' },
]

const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }
const cardTitle = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 12 }
const row = { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13.5, borderBottom: '1px solid var(--border)' }

function Alert({ kind, children }) {
  const colors = {
    info: { bg: 'var(--blue-dim)', bd: '#4fa8ff', c: '#4fa8ff' },
    warn: { bg: 'var(--amber-dim)', bd: '#f5a623', c: '#f5a623' },
    crit: { bg: 'var(--red-dim)', bd: '#ff5f5f', c: '#ff5f5f' },
  }[kind] || { bg: 'var(--bg3)', bd: 'var(--border2)', c: 'var(--text2)' }
  return <div style={{ background: colors.bg, border: `1px solid ${colors.bd}55`, color: colors.c, borderRadius: 10, padding: '11px 14px', fontSize: 13.5, fontWeight: 500 }}>{children}</div>
}

export default function AccountTab() {
  const { account } = useAccount()
  const accId = account?.id
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!accId) return
    try { setData(await getAccountSubscription(accId)) } catch { setData(null) }
    setLoading(false)
  }, [accId])

  useEffect(() => { reload() }, [reload])
  // Tiempo real: consumos, alertas y cambios de estado de la suscripción.
  useEffect(() => {
    if (!accId) return
    const sock = getSocket()
    const onUpd = ({ accId: a }) => { if (!a || a === accId) reload() }
    sock.on('account:updated', onUpd)
    sock.on('subscription:alert', onUpd)
    const id = setInterval(reload, 30000)
    return () => { sock.off('account:updated', onUpd); sock.off('subscription:alert', onUpd); clearInterval(id) }
  }, [accId, reload])

  if (loading) return <div style={{ padding: 28, color: 'var(--text3)' }}>Cargando información de la cuenta…</div>

  const sub = data?.subscription
  const limit = data?.effectiveMonthlyLimit
  const usage = data?.channelUsage || {}
  const type = sub?.type
  const plan = sub?.plan
  const st = STATUS_META[sub?.status] || STATUS_META.active
  const used = sub?.conversationCount ?? 0
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null
  const remaining = limit && limit > 0 ? Math.max(0, limit - used) : null
  const isDemo = !!type?.isDemo
  const demoDays = daysLeft(sub?.demoExpiresAt)
  const cycleDays = daysLeft(sub?.currentPeriodEnd)
  const graceDays = daysLeft(sub?.graceUntil)
  const barColor = pct == null ? 'var(--accent)' : pct >= 100 ? '#ff5f5f' : pct >= 90 ? '#ff8c42' : pct >= 80 ? '#f5a623' : '#22d98a'

  if (!sub) {
    return (
      <div style={{ padding: 28, maxWidth: 760 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>💼 Cuenta</h1>
        <Alert kind="info">Aún no hay una suscripción asignada a esta cuenta. Contacta al equipo de AVI Asistente para activar tu plan.</Alert>
      </div>
    )
  }

  return (
    <div style={{ padding: 28, maxWidth: 980, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>💼 Cuenta</h1>
        <span style={{ fontSize: 13, fontWeight: 700, color: st.color, background: st.color + '22', borderRadius: 20, padding: '5px 14px' }}>{st.icon} {st.label}{cycleDays != null && !isDemo && ` · ${cycleDays} días para el pago`}</span>
      </div>

      {/* ── Alertas ── */}
      {sub.status === 'suspended' && <Alert kind="crit">Tu suscripción ha vencido. Para reactivar el servicio debes realizar el pago correspondiente.</Alert>}
      {sub.status === 'grace' && <Alert kind="warn">Tu cuenta se encuentra en período de gracia. Dispones de {graceDays} día(s) para realizar el pago y evitar la suspensión del servicio.</Alert>}
      {pct != null && pct >= 100 && sub.status !== 'suspended' && <Alert kind="crit">Has alcanzado el límite de conversaciones de tu plan.</Alert>}
      {pct != null && pct >= 90 && pct < 100 && <Alert kind="crit">Has utilizado el 90% de las conversaciones disponibles. Considera actualizar tu plan.</Alert>}
      {pct != null && pct >= 80 && pct < 90 && <Alert kind="warn">Has utilizado el 80% de las conversaciones disponibles de tu plan.</Alert>}
      {isDemo && demoDays != null && demoDays < 3 && <Alert kind="warn">Tu cuenta Demo está próxima a vencer. Adquiere un plan de pago para continuar utilizando AVI Asistente.</Alert>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
        {/* ── General ── */}
        <div style={card}>
          <div style={cardTitle}>Información general</div>
          <AccountNameEditor />
          <div style={{ ...row }}>
            <span style={{ color: 'var(--text2)' }}>ID de cuenta</span>
            <button
              type="button"
              title="Copiar ID de cuenta"
              onClick={() => { navigator.clipboard?.writeText(accId || ''); }}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12.5, color: 'var(--text)', padding: 0 }}
            >
              {accId || '—'} ⧉
            </button>
          </div>
          <div style={{ ...row }}><span style={{ color: 'var(--text2)' }}>Creada el</span><span>{fmtDate(account?.createdAt)}</span></div>
          <div style={{ ...row }}><span style={{ color: 'var(--text2)' }}>Tipo de cuenta</span><strong>{type?.name || '—'}</strong></div>
          <div style={{ ...row, borderBottom: 'none' }}><span style={{ color: 'var(--text2)' }}>Estado</span><span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span></div>
        </div>

        {/* ── Suscripción ── */}
        <div style={card}>
          <div style={cardTitle}>Suscripción</div>
          <div style={{ ...row }}><span style={{ color: 'var(--text2)' }}>Plan mensual</span><strong>{plan?.name || (isDemo ? 'Demo (sin plan)' : '—')}</strong></div>
          <div style={{ ...row }}><span style={{ color: 'var(--text2)' }}>Inicio del ciclo</span><span>{fmtDate(sub.currentPeriodStart)}</span></div>
          <div style={{ ...row }}><span style={{ color: 'var(--text2)' }}>Vence el</span><span>{fmtDate(sub.currentPeriodEnd)}</span></div>
          <div style={{ ...row, borderBottom: 'none' }}><span style={{ color: 'var(--text2)' }}>Días para el próximo pago</span><strong>{cycleDays != null ? `${cycleDays} días` : '—'}</strong></div>
        </div>
      </div>

      {/* ── Consumo del plan ── */}
      {!isDemo && (
        <div style={card}>
          <div style={cardTitle}>Consumo del plan</div>
          {limit && limit > 0 ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 6 }}>
                <span><strong>{used.toLocaleString('es')}</strong> de <strong>{Number(limit).toLocaleString('es')}</strong> conversaciones utilizadas</span>
                <span style={{ color: barColor, fontWeight: 700 }}>{pct}%</span>
              </div>
              <div style={{ height: 12, borderRadius: 8, background: 'var(--bg4,#1f1f2a)', overflow: 'hidden', border: '1px solid var(--border2)' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: barColor, transition: 'width .3s' }} />
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 6 }}>{remaining?.toLocaleString('es')} conversaciones restantes</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>Plan sin límite predefinido (Enterprise). El consumo actual es <strong>{used.toLocaleString('es')}</strong> conversaciones este ciclo.</div>
          )}
        </div>
      )}

      {/* ── Demo ── */}
      {isDemo && (
        <div style={{ ...card, border: '1px solid #f5a62355' }}>
          <div style={cardTitle}>Prueba Demo</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
            <div><div style={{ fontSize: 11, color: 'var(--text3)' }}>Vence el</div><strong>{fmtDate(sub.demoExpiresAt)}</strong></div>
            <div><div style={{ fontSize: 11, color: 'var(--text3)' }}>Días restantes</div><strong style={{ color: demoDays != null && demoDays < 3 ? '#ff5f5f' : 'var(--text)' }}>{demoDays != null ? `${demoDays} días` : '—'}</strong></div>
            <div><div style={{ fontSize: 11, color: 'var(--text3)' }}>Conversaciones</div><strong>{used} / {type?.demoMaxConversations || 100}</strong></div>
            <div><div style={{ fontSize: 11, color: 'var(--text3)' }}>Restantes</div><strong>{Math.max(0, (type?.demoMaxConversations || 100) - used)}</strong></div>
          </div>
        </div>
      )}

      {/* ── Canales ── */}
      <div style={card}>
        <div style={cardTitle}>Canales</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '6px 18px', fontSize: 13.5 }}>
          <span style={{ color: 'var(--text3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Canal</span>
          <span style={{ color: 'var(--text3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right' }}>Utilizados</span>
          <span style={{ color: 'var(--text3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right' }}>Permitidos</span>
          {CHANNELS.map(c => {
            const u = usage[c.key] || 0
            const max = type ? (type[c.max] ?? 0) : 0
            const over = u >= max && max > 0
            return [
              <span key={c.key + 'l'}>{c.label}</span>,
              <span key={c.key + 'u'} style={{ textAlign: 'right', fontWeight: 600, color: over ? '#f5a623' : 'var(--text)' }}>{u}</span>,
              <span key={c.key + 'm'} style={{ textAlign: 'right', color: 'var(--text2)' }}>{max}</span>,
            ]
          })}
        </div>
      </div>

      {/* ── Conciencia temporal de la IA ── */}
      <AiDatetimeConfig />

      {/* ── Apariencia predeterminada del chat (aplica a todos los usuarios) ── */}
      <AccountChatThemeTab />

      {/* ── Acciones ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a href="mailto:comercial@aviasistente.com?subject=Renovar%20suscripci%C3%B3n" style={{ ...btnStyle('var(--green)'), textDecoration: 'none' }}>Renovar suscripción</a>
        <a href="mailto:comercial@aviasistente.com?subject=Cambiar%20de%20plan" style={{ ...btnStyle('var(--accent)'), textDecoration: 'none' }}>Cambiar de plan</a>
        {(plan?.name === 'Expert' || plan?.name === 'Enterprise' || (pct != null && pct >= 100) || isDemo) && (
          <a href="mailto:comercial@aviasistente.com?subject=Contacto%20comercial" style={{ ...btnStyle('transparent', 'var(--text)'), border: '1px solid var(--border2)', textDecoration: 'none' }}>Contactar equipo comercial</a>
        )}
      </div>
    </div>
  )
}

function btnStyle(bg, c = '#fff') {
  return { display: 'inline-flex', alignItems: 'center', padding: '10px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', background: bg, color: c, fontSize: 13.5, fontWeight: 600 }
}
