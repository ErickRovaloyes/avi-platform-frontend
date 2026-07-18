import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getWooConfig, saveWooConfig, testWooConnection } from '../../lib/storage'
import VectorIndexCard from './VectorIndexCard'
import StoreProductsTab from './StoreProductsTab'

// Configuración de la Herramienta IA Especial "Tienda WooCommerce".
// La llave secreta vive en el servidor: aquí solo se muestra enmascarada.
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, maxWidth: 720 }
const label = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', margin: '12px 0 5px' }
const input = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg1)', color: 'var(--text)', fontSize: 13.5, boxSizing: 'border-box' }
// Catálogo de datos del pedido (debe coincidir con backend services/store.js).
const ORDER_FIELDS = [
  ['nombre', 'Nombre completo'], ['email', 'Email'], ['telefono', 'Teléfono'],
  ['direccion', 'Dirección de envío'], ['direccion2', 'Apartamento / referencia'],
  ['ciudad', 'Ciudad'], ['departamento', 'Departamento / Estado'],
  ['codigo_postal', 'Código postal'], ['pais', 'País (ISO 2 letras, ej. CO)'], ['notas', 'Notas del pedido'],
]

// Shell con sub-pestañas: Configuración · Productos (esta última solo si hay tienda conectada).
export default function StorePanel() {
  const { account } = useAccount()
  const connected = !!account?.woocommerce?.connected
  const SUBS = [
    { id: 'config', label: '⚙️ Configuración' },
    ...(connected ? [{ id: 'products', label: '📦 Productos' }] : []),
  ]
  const [sub, setSub] = useState('config')
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, padding: '14px 22px 0', flexWrap: 'wrap' }}>
        {SUBS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            style={{ padding: '7px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: `1px solid ${sub === t.id ? 'var(--accent)' : 'var(--border2)'}`,
              background: sub === t.id ? 'var(--accent)' : 'transparent', color: sub === t.id ? '#fff' : 'var(--text2)' }}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {sub === 'config' && <StoreConfigTab />}
        {sub === 'products' && connected && <StoreProductsTab />}
      </div>
    </div>
  )
}

function StoreConfigTab() {
  const { account } = useAccount()
  const accId = account?.id
  const [cfg, setCfg] = useState(null)
  const [form, setForm] = useState({
    platform: 'woocommerce',
    storeUrl: '', consumerKey: '', consumerSecret: '',
    shopDomain: '', adminToken: '', apiSecret: '',
    currency: '', maxImagesPerProduct: 4,
    gateway: { mode: 'native', methodId: '', methodTitle: '' },
    abandonedCart: { enabled: false, hours: 20, maxReminders: 1, message: '' },
    orderForm: [{ key: 'nombre', required: true }, { key: 'email', required: true }, { key: 'telefono', required: true }],
    orderNotify: { created: { mode: 'default', flowId: null }, paid: { mode: 'default', flowId: null }, status: { mode: 'off', flowId: null } },
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!accId) return
    getWooConfig(accId).then(c => {
      setCfg(c)
      setForm(f => ({
        ...f,
        platform: c.platform || 'woocommerce',
        storeUrl: c.storeUrl || '', shopDomain: c.shopDomain || '',
        currency: c.currency || '', maxImagesPerProduct: c.maxImagesPerProduct || 4,
        gateway: c.gateway || { mode: 'native', methodId: '', methodTitle: '' },
        abandonedCart: { enabled: false, hours: 20, maxReminders: 1, message: '', ...(c.abandonedCart || {}) },
        orderForm: Array.isArray(c.orderForm) && c.orderForm.length ? c.orderForm : f.orderForm,
        orderNotify: c.orderNotify && typeof c.orderNotify === 'object' ? { ...f.orderNotify, ...c.orderNotify } : f.orderNotify,
      }))
    }).catch(() => {})
  }, [accId])

  const isShopify = form.platform === 'shopify'
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function setGw(k, v) { setForm(f => ({ ...f, gateway: { ...f.gateway, [k]: v } })) }
  function setAc(k, v) { setForm(f => ({ ...f, abandonedCart: { ...f.abandonedCart, [k]: v } })) }
  function toggleCollect(key) { setForm(f => { const has = (f.orderForm || []).some(x => x.key === key); return { ...f, orderForm: has ? f.orderForm.filter(x => x.key !== key) : [...(f.orderForm || []), { key, required: false }] } }) }
  function toggleRequired(key) { setForm(f => ({ ...f, orderForm: (f.orderForm || []).map(x => x.key === key ? { ...x, required: !x.required } : x) })) }
  function setON(ev, patch) { setForm(f => ({ ...f, orderNotify: { ...f.orderNotify, [ev]: { ...(f.orderNotify?.[ev] || {}), ...patch } } })) }
  const flows = account?.flows || []

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const r = await saveWooConfig(accId, { ...form })
      setCfg(r.config)
      setForm(f => ({ ...f, consumerKey: '', consumerSecret: '', adminToken: '', apiSecret: '' })) // no conservar secretos en el form
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
      <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>🛒 Tienda (WooCommerce / Shopify)</h2>
      <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 16px', maxWidth: 720 }}>
        Conecta tu tienda. La herramienta especial <code style={{ margin: '0 4px' }}>tienda</code> está
        en <strong>Herramientas IA</strong>; <strong>se activa asignándola a un prompt</strong>, igual que las demás. Una vez
        asignada y con la tienda conectada, el asistente podrá buscar productos, enviarlos con fotos, crear pedidos, enviar el link
        de pago y confirmar el pago automáticamente.
      </p>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Conexión
            {cfg && <span style={{ marginLeft: 10, fontSize: 11.5, fontWeight: 600, color: cfg.connected ? '#22d98a' : 'var(--text3)' }}>
              {cfg.connected ? (cfg.webhookActive ? '● Conectada · webhook activo' : '● Conectada') : '○ Sin conectar'}
            </span>}
          </div>
        </div>

        <label style={label}>Plataforma</label>
        <select style={input} value={form.platform} onChange={e => set('platform', e.target.value)}>
          <option value="woocommerce">WooCommerce</option>
          <option value="shopify">Shopify</option>
        </select>

        {!isShopify ? (
          <>
            <label style={label}>URL de la tienda</label>
            <input style={input} placeholder="https://mitienda.com" value={form.storeUrl} onChange={e => set('storeUrl', e.target.value)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={label}>Consumer key {cfg?.consumerKeyMasked && <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(actual: {cfg.consumerKeyMasked})</span>}</label>
                <input style={input} placeholder="ck_..." value={form.consumerKey} onChange={e => set('consumerKey', e.target.value)} />
              </div>
              <div>
                <label style={label}>Consumer secret {cfg?.hasKeys && cfg?.platform === 'woocommerce' && <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(guardado — vacío = conservar)</span>}</label>
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
          </>
        ) : (
          <>
            <label style={label}>Dominio Shopify</label>
            <input style={input} placeholder="mitienda.myshopify.com" value={form.shopDomain} onChange={e => set('shopDomain', e.target.value)} />
            <label style={label}>Admin API access token {cfg?.adminTokenMasked && cfg?.platform === 'shopify' && <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(guardado: {cfg.adminTokenMasked} — vacío = conservar)</span>}</label>
            <input style={input} type="password" placeholder="shpat_..." value={form.adminToken} onChange={e => set('adminToken', e.target.value)} />
            <label style={label}>API secret key <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional{cfg?.hasApiSecret ? ' — guardada, vacío = conservar' : ''}; necesaria para el índice de productos en tiempo real)</span></label>
            <input style={input} type="password" placeholder="shpss_… (Configuración de la app → API credentials)" value={form.apiSecret} onChange={e => set('apiSecret', e.target.value)} />
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={label}>Moneda <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(autodetectada)</span></label>
            <input style={input} placeholder="COP, USD…" value={form.currency} onChange={e => set('currency', e.target.value)} />
          </div>
          <div>
            <label style={label}>Máx. fotos por producto que envía la IA</label>
            <input style={input} type="number" min={1} max={10} value={form.maxImagesPerProduct} onChange={e => set('maxImagesPerProduct', e.target.value)} />
          </div>
        </div>

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

      {/* Datos a pedir al crear un pedido (envío/facturación) */}
      {cfg?.connected && (
        <div style={{ ...card, marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🚚 Datos a pedir al crear un pedido</div>
          <p style={{ fontSize: 12.5, color: 'var(--text3)', margin: '0 0 10px' }}>
            Marca qué datos debe recolectar el asistente <strong>antes</strong> de generar el link de pago. Los <strong>obligatorios</strong> se piden sí o sí; todos se guardan en el pedido de la tienda como datos de facturación/envío.
          </p>
          {ORDER_FIELDS.map(([key, lbl]) => {
            const f = (form.orderForm || []).find(x => x.key === key)
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={!!f} onChange={() => toggleCollect(key)} /> {lbl}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', opacity: f ? 1 : .4, cursor: f ? 'pointer' : 'default' }}>
                  <input type="checkbox" disabled={!f} checked={!!f?.required} onChange={() => toggleRequired(key)} /> obligatorio
                </label>
              </div>
            )
          })}
          <p style={{ fontSize: 11, color: 'var(--text3)', margin: '10px 0 0' }}>Guarda con el botón <strong>“Guardar y conectar”</strong> de arriba.</p>
        </div>
      )}

      {/* Mensajes de eventos del pedido (default / IA / flujo / off) */}
      {cfg?.connected && (
        <div style={{ ...card, marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🔔 Mensajes de eventos del pedido</div>
          <p style={{ fontSize: 12.5, color: 'var(--text3)', margin: '0 0 10px' }}>
            Cómo se avisa al cliente en cada evento: mensaje por defecto, <strong>redactado por la IA</strong> (con el prompt activo) o <strong>ejecutando un flujo</strong> (con tu mensaje dentro).
          </p>
          {[['created', '🛒 Pedido creado'], ['paid', '✅ Pago confirmado'], ['status', '📦 Cambio de estado del pedido']].map(([ev, lbl]) => {
            const conf = form.orderNotify?.[ev] || { mode: 'default' }
            return (
              <div key={ev} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 170px', fontSize: 13 }}>{lbl}</span>
                <select style={{ ...input, width: 'auto', minWidth: 180 }} value={conf.mode} onChange={e => setON(ev, { mode: e.target.value })}>
                  <option value="default">Mensaje por defecto</option>
                  <option value="ia">Lo redacta la IA (prompt)</option>
                  <option value="flow">Ejecutar un flujo</option>
                  <option value="off">No enviar nada</option>
                </select>
                {conf.mode === 'flow' && (
                  <select style={{ ...input, width: 'auto', minWidth: 170 }} value={conf.flowId || ''} onChange={e => setON(ev, { flowId: e.target.value || null })}>
                    <option value="">— Elige un flujo —</option>
                    {flows.map(fl => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
                  </select>
                )}
              </div>
            )
          })}
          <p style={{ fontSize: 11, color: 'var(--text3)', margin: '10px 0 0' }}>
            El “Cambio de estado” se dispara con los webhooks de WooCommerce (en preparación, completado, cancelado…). En el flujo tienes: <code>{'{{pedido_id}}'}</code> <code>{'{{pedido_estado}}'}</code> <code>{'{{total}}'}</code> <code>{'{{currency}}'}</code> y <code>{'{{pay_url}}'}</code> (en “creado”). Guarda con el botón de arriba.
          </p>
        </div>
      )}

      {/* Búsqueda inteligente (índice vectorial de productos) */}
      {cfg?.connected && (
        <VectorIndexCard
          accId={accId}
          source="store"
          allowRealtime={!isShopify || !!cfg?.hasApiSecret}
          realtimeHint={isShopify && !cfg?.hasApiSecret ? 'Para el modo Tiempo real en Shopify añade la "API secret key" de tu app en la conexión (verifica los webhooks). Mientras tanto, usa el modo Programado.' : ''}
          style={{ marginTop: 14 }}
        />
      )}

      {/* Recuperación de carritos abandonados */}
      <div style={{ ...card, marginTop: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!form.abandonedCart.enabled} onChange={e => setAc('enabled', e.target.checked)} />
          🛒 Recuperación de carritos abandonados
        </label>
        <p style={{ fontSize: 12.5, color: 'var(--text3)', margin: '6px 0 0' }}>
          Si el asistente crea un pedido y el cliente <strong>no paga</strong> tras las horas indicadas, se le envía un recordatorio
          con el link de pago por el canal de la conversación (WhatsApp si el chat es de WhatsApp).
        </p>
        {form.abandonedCart.enabled && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
              <div>
                <label style={label}>Horas sin pagar para recordar</label>
                <input style={input} type="number" min={1} max={168} value={form.abandonedCart.hours} onChange={e => setAc('hours', parseInt(e.target.value) || 20)} />
              </div>
              <div>
                <label style={label}>Máx. recordatorios</label>
                <input style={input} type="number" min={1} max={5} value={form.abandonedCart.maxReminders} onChange={e => setAc('maxReminders', parseInt(e.target.value) || 1)} />
              </div>
            </div>
            <label style={label}>Mensaje del recordatorio <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(el link se añade al final)</span></label>
            <textarea style={{ ...input, minHeight: 60, resize: 'vertical' }} placeholder="👋 ¿Terminamos tu compra? Dejaste un pedido sin completar. Puedes pagarlo aquí:" value={form.abandonedCart.message} onChange={e => setAc('message', e.target.value)} />
          </>
        )}
      </div>

      <div style={{ ...card, marginTop: 14, fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6 }}>
        {isShopify ? (
          <>
            <strong style={{ color: 'var(--text)' }}>¿Cómo obtener el token de Shopify?</strong><br />
            En tu admin de Shopify: <em>Configuración → Apps y canales de venta → Desarrollar apps → Crear una app</em>. Dale permisos
            de Admin API: <strong>read_products, write_draft_orders, read_orders</strong>. Instala la app y copia el
            <em> Admin API access token</em> (<code>shpat_…</code>) aquí, junto con tu dominio <code>xxx.myshopify.com</code>.
            El pago se confirma por sondeo automático.
          </>
        ) : (
          <>
            <strong style={{ color: 'var(--text)' }}>¿Cómo obtener las llaves de WooCommerce?</strong><br />
            En tu WordPress: <em>WooCommerce → Ajustes → Avanzado → REST API → Añadir clave</em>. Permisos:
            <strong> Lectura/Escritura</strong>. Copia el <em>Consumer key</em> y <em>Consumer secret</em>. Al guardar registramos
            automáticamente un webhook para confirmar los pagos.
          </>
        )}
      </div>
    </div>
  )
}
