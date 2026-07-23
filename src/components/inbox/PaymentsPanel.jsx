import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getPaymentsConfig, savePaymentsConfig, testPaymentsConnection } from '../../lib/storage'
import { API_BASE } from '../../lib/api'

// Configuración de la PASARELA DE PAGO general. Empezamos con Wompi. La
// herramienta IA especial "pasarela_pago" (en Herramientas IA) genera links de
// pago y detecta el pago; al confirmarse dispara el flujo de éxito/fallo elegido.
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, maxWidth: 760 }
const field = { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }
const labelS = { fontSize: 12.5, fontWeight: 700 }
const inputS = { padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }
const hintS = { fontSize: 11.5, color: 'var(--text3)' }

export default function PaymentsPanel() {
  const { account } = useAccount()
  const accId = account?.id
  const flows = account?.flows || []
  const [cfg, setCfg] = useState(null)
  const [form, setForm] = useState({ provider: 'wompi', mode: 'production', currency: 'COP', publicKey: '', privateKey: '', eventsSecret: '', successFlowId: '', failureFlowId: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!accId) return
    getPaymentsConfig(accId).then(c => {
      setCfg(c)
      setForm(f => ({
        ...f,
        provider: c?.provider || 'wompi',
        mode: c?.mode || 'production',
        currency: c?.currency || 'COP',
        successFlowId: c?.successFlowId || '',
        failureFlowId: c?.failureFlowId || '',
      }))
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [accId])

  const upd = patch => setForm(f => ({ ...f, ...patch }))
  const webhookUrl = `${API_BASE}/api/payments/webhook/${accId}`

  // Etiquetas y campos según el proveedor. Bold no usa llave pública; su "llave privada"
  // es la llave de identidad (API key) y su secreto es el de firma del webhook.
  const isBold = form.provider === 'bold'
  const L = isBold ? {
    privateLabel: 'Llave de identidad (API key)', privatePlaceholder: 'Llave de identidad de Bold (Integraciones → Llaves de integración)',
    secretLabel: 'Llave secreta (firma del webhook)', secretPlaceholder: 'Llave secreta de Bold',
    secretHint: 'Es tu "Llave secreta" de Bold: bold.co → Integraciones → Llaves de integración → Botón de pagos (la MISMA sección que la llave de identidad). Verifica la firma del webhook. En Pruebas usa la llave secreta de pruebas.',
    webhookInstr: 'URL del webhook (pégala en Bold → Integraciones → Webhooks → Configurar webhook)',
  } : {
    privateLabel: 'Llave privada', privatePlaceholder: 'prv_prod_xxx',
    secretLabel: 'Secreto de eventos (webhook)', secretPlaceholder: 'Secreto de eventos de Wompi',
    secretHint: 'Lo da Wompi en su panel (Eventos). Sirve para verificar la firma de los avisos de pago.',
    webhookInstr: 'URL del webhook (pégala en el panel de Wompi → Eventos)',
  }

  async function save() {
    setBusy(true); setMsg(null)
    try {
      // Solo se envían los secretos si el usuario escribió algo (no se pisan con vacío).
      const payload = {
        provider: form.provider, mode: form.mode, currency: form.currency,
        successFlowId: form.successFlowId || null, failureFlowId: form.failureFlowId || null,
      }
      if (form.publicKey.trim())   payload.publicKey   = form.publicKey.trim()
      if (form.privateKey.trim())  payload.privateKey  = form.privateKey.trim()
      if (form.eventsSecret.trim()) payload.eventsSecret = form.eventsSecret.trim()
      const r = await savePaymentsConfig(accId, payload)
      setCfg(r?.config || null)
      setForm(f => ({ ...f, publicKey: '', privateKey: '', eventsSecret: '' }))
      const c = r?.connection
      if (c?.ok) setMsg({ ok: true, text: `Guardado y conectado${c.merchant ? ` · ${c.merchant}` : ''}.` })
      else if (r?.config?.connected) setMsg({ ok: false, text: `Guardado, pero la conexión falló: ${c?.error || 'revisa las llaves'}.` })
      else setMsg({ ok: true, text: 'Guardado. Completa las llaves para conectar la pasarela.' })
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    setBusy(false)
  }

  async function test() {
    setBusy(true); setMsg(null)
    try { const c = await testPaymentsConnection(accId); setMsg(c?.ok ? { ok: true, text: `Conexión OK${c.merchant ? ` · ${c.merchant}` : ''}.` } : { ok: false, text: c?.error || 'No se pudo conectar.' }) }
    catch (e) { setMsg({ ok: false, text: e.message }) }
    setBusy(false)
  }

  function copyWebhook() { navigator.clipboard?.writeText(webhookUrl).then(() => setMsg({ ok: true, text: 'URL del webhook copiada.' })).catch(() => {}) }

  return (
    <div style={{ padding: 22, overflowY: 'auto' }}>
      <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>💳 Pasarela de pago</h2>
      <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 16px', maxWidth: 760 }}>
        Conecta tu pasarela para que el asistente pueda <strong>generar links de pago</strong> y <strong>detectar los pagos</strong>.
        La herramienta especial <code style={{ margin: '0 4px' }}>pasarela_pago</code> está en <strong>Herramientas IA</strong>; <strong>se activa asignándola a un prompt</strong>.
        Cuando se confirma un pago se dispara el <strong>flujo de éxito</strong>; si no se procesa, el <strong>flujo de fallo</strong>.
      </p>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Proveedor</span>
          <select style={{ ...inputS, width: 'auto' }} value={form.provider} onChange={e => upd({ provider: e.target.value })}>
            <option value="wompi">Wompi</option>
            <option value="bold">Bold</option>
            <option value="stripe" disabled>Stripe (próximamente)</option>
            <option value="paypal" disabled>PayPal (próximamente)</option>
          </select>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
            background: cfg?.connected ? 'rgba(34,217,138,.14)' : 'rgba(255,95,95,.12)',
            color: cfg?.connected ? '#22d98a' : '#ff5f5f' }}>
            {cfg?.connected ? '● Conectado' : '○ Sin conectar'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ ...field, flex: 1, minWidth: 200 }}>
            <label style={labelS}>Entorno</label>
            <select style={inputS} value={form.mode} onChange={e => upd({ mode: e.target.value })}>
              <option value="production">Producción</option>
              <option value="sandbox">Pruebas (sandbox)</option>
            </select>
          </div>
          <div style={{ ...field, flex: 1, minWidth: 200 }}>
            <label style={labelS}>Moneda</label>
            <input style={inputS} value={form.currency} onChange={e => upd({ currency: e.target.value.toUpperCase() })} placeholder="COP" />
          </div>
        </div>

        {!isBold && (
          <div style={field}>
            <label style={labelS}>Llave pública {cfg?.hasPublicKey && <span style={{ color: '#22d98a', fontWeight: 600 }}>· configurada</span>}</label>
            <input style={inputS} value={form.publicKey} onChange={e => upd({ publicKey: e.target.value })} placeholder={cfg?.hasPublicKey ? '•••••••• (escribe para reemplazar)' : 'pub_prod_xxx'} />
          </div>
        )}
        <div style={field}>
          <label style={labelS}>{L.privateLabel} {cfg?.hasPrivateKey && <span style={{ color: '#22d98a', fontWeight: 600 }}>· configurada</span>}</label>
          <input style={inputS} type="password" value={form.privateKey} onChange={e => upd({ privateKey: e.target.value })} placeholder={cfg?.hasPrivateKey ? '•••••••• (escribe para reemplazar)' : L.privatePlaceholder} />
          <span style={hintS}>Las llaves nunca salen del servidor.</span>
        </div>
        <div style={field}>
          <label style={labelS}>{L.secretLabel} {cfg?.hasEventsSecret && <span style={{ color: '#22d98a', fontWeight: 600 }}>· configurado</span>}</label>
          <input style={inputS} type="password" value={form.eventsSecret} onChange={e => upd({ eventsSecret: e.target.value })} placeholder={cfg?.hasEventsSecret ? '•••••••• (escribe para reemplazar)' : L.secretPlaceholder} />
          <span style={hintS}>{L.secretHint}</span>
        </div>

        <div style={field}>
          <label style={labelS}>{L.webhookInstr}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inputS, flex: 1 }} readOnly value={webhookUrl} onFocus={e => e.target.select()} />
            <button onClick={copyWebhook} style={{ padding: '0 14px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer' }}>Copiar</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ ...field, flex: 1, minWidth: 220 }}>
            <label style={labelS}>✅ Flujo al CONFIRMARSE el pago</label>
            <select style={inputS} value={form.successFlowId} onChange={e => upd({ successFlowId: e.target.value })}>
              <option value="">— ninguno —</option>
              {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div style={{ ...field, flex: 1, minWidth: 220 }}>
            <label style={labelS}>⚠️ Flujo si el pago NO se procesa</label>
            <select style={inputS} value={form.failureFlowId} onChange={e => upd({ failureFlowId: e.target.value })}>
              <option value="">— ninguno —</option>
              {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        </div>

        {msg && (
          <div style={{ marginTop: 8, marginBottom: 4, padding: '9px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            background: msg.ok ? 'rgba(34,217,138,.12)' : 'rgba(255,95,95,.12)', color: msg.ok ? '#22d98a' : '#ff5f5f',
            border: `1px solid ${msg.ok ? 'rgba(34,217,138,.35)' : 'rgba(255,95,95,.35)'}` }}>{msg.text}</div>
        )}

        <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
          <button onClick={save} disabled={busy || !loaded} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {busy ? '⏳ Guardando…' : 'Guardar'}
          </button>
          <button onClick={test} disabled={busy || !loaded || !cfg?.connected} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Probar conexión
          </button>
        </div>
      </div>
    </div>
  )
}
