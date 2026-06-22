import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getWooConfig, saveWooConfig, testWooConnection } from '../../lib/storage'

// Configuración de la Herramienta IA Especial "Tienda WooCommerce".
// La llave secreta vive en el servidor: aquí solo se muestra enmascarada.
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, maxWidth: 720 }
const label = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', margin: '12px 0 5px' }
const input = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg1)', color: 'var(--text)', fontSize: 13.5, boxSizing: 'border-box' }

export default function StorePanel() {
  const { account } = useAccount()
  const accId = account?.id
  const [cfg, setCfg] = useState(null)
  const [form, setForm] = useState({ storeUrl: '', consumerKey: '', consumerSecret: '', currency: '', gateway: { mode: 'native', methodId: '', methodTitle: '' } })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!accId) return
    getWooConfig(accId).then(c => {
      setCfg(c)
      setForm(f => ({ ...f, storeUrl: c.storeUrl || '', currency: c.currency || '', gateway: c.gateway || { mode: 'native', methodId: '', methodTitle: '' } }))
    }).catch(() => {})
  }, [accId])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function setGw(k, v) { setForm(f => ({ ...f, gateway: { ...f.gateway, [k]: v } })) }

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const r = await saveWooConfig(accId, { ...form })
      setCfg(r.config)
      setForm(f => ({ ...f, consumerKey: '', consumerSecret: '' })) // no conservar secretos en el form
      if (r.connection?.ok) {
        setMsg({ ok: true, text: `Conectada ✓${r.config?.webhookActive ? ' · webhook de pago activo' : (r.connection.webhookError ? ` · (no se pudo crear el webhook: ${r.connection.webhookError})` : '')}` })
      } else {
        setMsg({ ok: false, text: r.connection?.error || (r.config?.hasKeys ? 'Guardado, pero no se pudo conectar. Revisa la URL y las llaves.' : 'Guardado. Falta la URL o las llaves para conectar.') })
      }
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    setBusy(false)
  }
  async function test() {
    setBusy(true); setMsg(null)
    try { const r = await testWooConnection(accId); setMsg(r.ok ? { ok: true, text: 'Conexión correcta ✓' } : { ok: false, text: r.error || 'No se pudo conectar' }) }
    catch (e) { setMsg({ ok: false, text: e.message }) }
    setBusy(false)
  }

  return (
    <div style={{ padding: 22, overflowY: 'auto' }}>
      <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>🛒 Tienda (WooCommerce)</h2>
      <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 16px', maxWidth: 720 }}>
        Conecta tu tienda WooCommerce. La herramienta especial <code style={{ margin: '0 4px' }}>tienda_woocommerce</code> está
        en <strong>Herramientas IA</strong>; <strong>se activa asignándola a un prompt</strong> (en la pestaña Prompts), igual que
        las demás herramientas. Una vez asignada y con la tienda conectada, el asistente podrá buscar productos y responder sobre
        ellos, enviarlos con fotos, crear pedidos, enviar el link de pago y confirmar el pago automáticamente.
      </p>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Conexión
            {cfg && <span style={{ marginLeft: 10, fontSize: 11.5, fontWeight: 600, color: cfg.connected ? '#22d98a' : 'var(--text3)' }}>
              {cfg.connected ? (cfg.webhookActive ? '● Conectada · webhook activo' : '● Conectada') : '○ Sin conectar'}
            </span>}
          </div>
        </div>

        <label style={label}>URL de la tienda</label>
        <input style={input} placeholder="https://mitienda.com" value={form.storeUrl} onChange={e => set('storeUrl', e.target.value)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={label}>Consumer key {cfg?.consumerKeyMasked && <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(actual: {cfg.consumerKeyMasked})</span>}</label>
            <input style={input} placeholder="ck_..." value={form.consumerKey} onChange={e => set('consumerKey', e.target.value)} />
          </div>
          <div>
            <label style={label}>Consumer secret {cfg?.hasKeys && <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(guardado — déjalo vacío para conservarlo)</span>}</label>
            <input style={input} type="password" placeholder="cs_..." value={form.consumerSecret} onChange={e => set('consumerSecret', e.target.value)} />
          </div>
        </div>

        <label style={label}>Pasarela de pago</label>
        <select style={input} value={form.gateway?.mode || 'native'} onChange={e => setGw('mode', e.target.value)}>
          <option value="native">Nativa de WooCommerce (el cliente elige entre las pasarelas de tu tienda)</option>
          <option value="external">Forzar una pasarela específica (Stripe, Wompi, PayPal…)</option>
        </select>
        {form.gateway?.mode === 'external' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
            <div>
              <label style={label}>ID de la pasarela <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(slug WooCommerce)</span></label>
              <input style={input} placeholder="stripe · ppcp-gateway · wompi · …" value={form.gateway.methodId || ''} onChange={e => setGw('methodId', e.target.value)} />
            </div>
            <div>
              <label style={label}>Nombre visible</label>
              <input style={input} placeholder="Tarjeta / PayPal / Wompi…" value={form.gateway.methodTitle || ''} onChange={e => setGw('methodTitle', e.target.value)} />
            </div>
          </div>
        )}

        <label style={label}>Moneda <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional, solo para mostrar)</span></label>
        <input style={{ ...input, maxWidth: 160 }} placeholder="COP, USD…" value={form.currency} onChange={e => set('currency', e.target.value)} />

        {msg && (
          <div style={{ marginTop: 14, padding: '9px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            background: msg.ok ? 'rgba(34,217,138,.12)' : 'rgba(255,95,95,.12)', color: msg.ok ? '#22d98a' : '#ff5f5f',
            border: `1px solid ${msg.ok ? 'rgba(34,217,138,.35)' : 'rgba(255,95,95,.35)'}` }}>
            {msg.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={save} disabled={busy} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {busy ? '⏳ Guardando…' : 'Guardar y conectar'}
          </button>
          <button onClick={test} disabled={busy || !cfg?.hasKeys} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Probar conexión
          </button>
        </div>
      </div>

      <div style={{ ...card, marginTop: 14, fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>¿Cómo obtener las llaves?</strong><br />
        En tu WordPress: <em>WooCommerce → Ajustes → Avanzado → REST API → Añadir clave</em>. Permisos:
        <strong> Lectura/Escritura</strong> (para crear pedidos). Copia el <em>Consumer key</em> y <em>Consumer secret</em> aquí.
        Al guardar con la URL y las llaves correctas, registramos automáticamente un webhook para confirmar los pagos.
      </div>
    </div>
  )
}
