import { useState, useEffect, useCallback } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  getOrdersConfig, saveOrdersConfig, getOrdersMenu,
  saveOrderProduct, deleteOrderProduct, saveOrderGroup, deleteOrderGroup,
  saveOrderZone, deleteOrderZone, saveOrderCourier, deleteOrderCourier,
  saveOrderCoupon, deleteOrderCoupon, uploadChatMedia, mediaUrl, getOrderMetrics,
} from '../../lib/storage'

// Configuración de la Herramienta IA Especial "pedidos" (pedidos locales y a domicilio).
// El asistente muestra el menú con fotos, arma el carrito, captura el tipo de entrega
// y datos, calcula totales + envío por zona, cobra (link o contra entrega) y da seguimiento.
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, maxWidth: 860 }
const lbl = { fontSize: 12.5, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 5 }
const inp = { width: '100%', padding: '9px 11px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 9, color: 'var(--text)', fontSize: 13.5, boxSizing: 'border-box' }
const btnPri = { padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }
const btnSec = { padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }
const chip = (on) => ({ padding: '7px 13px', borderRadius: 20, border: `1px solid ${on ? 'var(--accent)' : 'var(--border2)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--text2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 })

const TYPE_OPTIONS = [
  { id: 'delivery', label: '🛵 Domicilio' },
  { id: 'pickup',   label: '🏃 Para recoger' },
  { id: 'dinein',   label: '🍽 En el local' },
  { id: 'scheduled', label: '⏰ Programado' },
]
const PAY_OPTIONS = [
  { id: 'online', label: '💳 Pago en línea (link)' },
  { id: 'cash',   label: '💵 Contra entrega / efectivo' },
]
// Estados que se avisan al cliente (con su placeholder por defecto).
const STATUS_MSGS = [
  { id: 'confirmed',  label: '✅ Confirmado',  ph: '✅ ¡Tu pedido {code} fue confirmado! Ya lo empezamos a preparar.' },
  { id: 'preparing',  label: '👨‍🍳 Preparando', ph: '👨‍🍳 Tu pedido {code} está en preparación.' },
  { id: 'ready',      label: '📦 Listo',       ph: '📦 Tu pedido {code} ya está listo.' },
  { id: 'on_the_way', label: '🛵 En camino',   ph: '🛵 ¡Tu pedido {code} va en camino!' },
  { id: 'delivered',  label: '🎉 Entregado',   ph: '🎉 Tu pedido {code} fue entregado. ¡Gracias por tu compra!' },
  { id: 'canceled',   label: '❌ Cancelado',   ph: '❌ Tu pedido {code} fue cancelado. Cualquier duda, escríbenos.' },
]
const DAYS = [
  { id: 'mon', label: 'Lunes' }, { id: 'tue', label: 'Martes' }, { id: 'wed', label: 'Miércoles' },
  { id: 'thu', label: 'Jueves' }, { id: 'fri', label: 'Viernes' }, { id: 'sat', label: 'Sábado' }, { id: 'sun', label: 'Domingo' },
]
const SECTIONS = [
  { id: 'config', label: '⚙️ Configuración' },
  { id: 'menu',   label: '🍔 Menú' },
  { id: 'mods',   label: '➕ Adiciones' },
  { id: 'zones',  label: '📍 Zonas de entrega' },
  { id: 'coupons', label: '🎟 Cupones' },
  { id: 'couriers', label: '🛵 Repartidores' },
  { id: 'metrics', label: '📊 Métricas' },
]

export default function OrdersPanel() {
  const { account, reloadAccount } = useAccount()
  const accId = account?.id
  const flows = account?.flows || []
  const [sec, setSec] = useState('config')

  const [cfg, setCfg] = useState({ enabled: true, orderTypes: ['delivery', 'pickup'], currency: 'COP', taxPct: 0, packagingFee: 0, minOrder: 0, freeDeliveryThreshold: 0, paymentMethods: ['online', 'cash'], notifyTeam: true, postOrderFlowId: '', businessName: '', connected: false })
  const [menu, setMenu] = useState({ products: [], groups: [], zones: [], couriers: [] })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const loadMenu = useCallback(() => { if (accId) getOrdersMenu(accId).then(setMenu).catch(() => {}) }, [accId])
  useEffect(() => { if (!accId) return; getOrdersConfig(accId).then(c => setCfg(p => ({ ...p, ...c }))).catch(() => {}); loadMenu() }, [accId, loadMenu])

  const set = (k, v) => setCfg(p => ({ ...p, [k]: v }))
  const toggle = (key, id) => setCfg(p => { const a = new Set(p[key] || []); a.has(id) ? a.delete(id) : a.add(id); return { ...p, [key]: [...a] } })
  function flash(text, ok = true) { setMsg({ ok, text }); setTimeout(() => setMsg(null), 2600) }

  async function saveConfig() {
    setBusy(true); setMsg(null)
    try {
      const r = await saveOrdersConfig(accId, {
        enabled: cfg.enabled, orderTypes: cfg.orderTypes, currency: cfg.currency, taxPct: cfg.taxPct,
        packagingFee: cfg.packagingFee, minOrder: cfg.minOrder, freeDeliveryThreshold: cfg.freeDeliveryThreshold,
        paymentMethods: cfg.paymentMethods, notifyTeam: cfg.notifyTeam, postOrderFlowId: cfg.postOrderFlowId, businessName: cfg.businessName,
        notifyCustomer: cfg.notifyCustomer, statusMessages: cfg.statusMessages, hours: cfg.hours,
      })
      setCfg(p => ({ ...p, ...(r?.config || {}) }))
      flash('Guardado ✓'); reloadAccount?.()
    } catch (e) { flash(e.message, false) }
    setBusy(false)
  }

  return (
    <div style={{ padding: 22, overflowY: 'auto' }}>
      <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>🛵 Pedidos y domicilios</h2>
      <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 16px', maxWidth: 860 }}>
        El asistente <strong>muestra el menú con fotos y precios, arma el pedido, captura el tipo de entrega y los datos,
        calcula el total con envío por zona, cobra en línea o contra entrega y hace seguimiento</strong>.
        La herramienta especial <code style={{ margin: '0 4px' }}>pedidos</code> está en <strong>Herramientas IA</strong>;
        <strong> se activa asignándola a un prompt</strong>.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {SECTIONS.map(sx => (
          <button key={sx.id} onClick={() => setSec(sx.id)} style={chip(sec === sx.id)}>{sx.label}</button>
        ))}
      </div>

      {msg && (
        <div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 8, fontSize: 12.5, maxWidth: 860,
          background: msg.ok ? 'rgba(34,217,138,.12)' : 'rgba(255,95,95,.12)',
          border: `1px solid ${msg.ok ? '#22d98a55' : '#ff5f5f55'}`, color: msg.ok ? '#22d98a' : '#ff5f5f' }}>{msg.text}</div>
      )}

      {sec === 'config' && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
            Configuración general
            {cfg.connected && <span style={{ marginLeft: 10, fontSize: 11.5, color: '#22d98a', fontWeight: 600 }}>● Activo</span>}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 16 }}>
            <input type="checkbox" checked={cfg.enabled !== false} onChange={e => set('enabled', e.target.checked)} />
            Módulo de pedidos activo
          </label>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Nombre del negocio <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional)</span></label>
            <input style={{ ...inp, maxWidth: 360 }} value={cfg.businessName || ''} onChange={e => set('businessName', e.target.value)} placeholder="Ej: Pizzería Napoli" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Tipos de pedido</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TYPE_OPTIONS.map(t => <button key={t.id} onClick={() => toggle('orderTypes', t.id)} style={chip((cfg.orderTypes || []).includes(t.id))}>{t.label}</button>)}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Métodos de pago</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PAY_OPTIONS.map(t => <button key={t.id} onClick={() => toggle('paymentMethods', t.id)} style={chip((cfg.paymentMethods || []).includes(t.id))}>{t.label}</button>)}
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 5, display: 'block' }}>El pago en línea usa la Pasarela de pago configurada en Zona IA → Pasarela de pago.</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
            <div>
              <label style={lbl}>Moneda</label>
              <input style={inp} value={cfg.currency || 'COP'} onChange={e => set('currency', e.target.value.toUpperCase())} placeholder="COP" />
            </div>
            <div>
              <label style={lbl}>Impuesto %</label>
              <input type="number" min="0" step="0.1" style={inp} value={cfg.taxPct ?? 0} onChange={e => set('taxPct', Number(e.target.value) || 0)} />
            </div>
            <div>
              <label style={lbl}>Empaque (fijo)</label>
              <input type="number" min="0" style={inp} value={cfg.packagingFee ?? 0} onChange={e => set('packagingFee', Number(e.target.value) || 0)} />
            </div>
            <div>
              <label style={lbl}>Pedido mínimo</label>
              <input type="number" min="0" style={inp} value={cfg.minOrder ?? 0} onChange={e => set('minOrder', Number(e.target.value) || 0)} />
            </div>
            <div>
              <label style={lbl}>Envío gratis desde</label>
              <input type="number" min="0" style={inp} value={cfg.freeDeliveryThreshold ?? 0} onChange={e => set('freeDeliveryThreshold', Number(e.target.value) || 0)} />
              <span style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginTop: 2 }}>0 = sin envío gratis</span>
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={cfg.notifyTeam !== false} onChange={e => set('notifyTeam', e.target.checked)} />
              Avisar al equipo (nota interna) cuando entre un pedido nuevo
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={cfg.notifyCustomer !== false} onChange={e => set('notifyCustomer', e.target.checked)} />
              Avisar al cliente por su canal cada cambio de estado del pedido
            </label>
            <div style={{ maxWidth: 380 }}>
              <label style={lbl}>Flujo al confirmarse un pedido <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional)</span></label>
              <select value={cfg.postOrderFlowId || ''} onChange={e => set('postOrderFlowId', e.target.value)} style={inp}>
                <option value="">— Sin flujo —</option>
                {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>

          {cfg.notifyCustomer !== false && (
            <div style={{ marginTop: 16 }}>
              <label style={lbl}>Mensajes al cliente por estado <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(vacío = usa el texto por defecto)</span></label>
              <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 8 }}>Variables: <code>{'{code}'}</code> código · <code>{'{estado}'}</code> estado · <code>{'{negocio}'}</code> negocio · <code>{'{total}'}</code> total</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 620 }}>
                {STATUS_MSGS.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)', width: 120, flexShrink: 0 }}>{s.label}</span>
                    <input style={{ ...inp, flex: 1 }} value={(cfg.statusMessages || {})[s.id] || ''} placeholder={s.ph}
                      onChange={e => set('statusMessages', { ...(cfg.statusMessages || {}), [s.id]: e.target.value })} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>
              <input type="checkbox" checked={!!cfg.hours?.enabled} onChange={e => set('hours', { ...(cfg.hours || { days: {} }), enabled: e.target.checked })} />
              🕒 Horario de atención (fuera de horario no se confirman pedidos; los programados sí)
            </label>
            {cfg.hours?.enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 420 }}>
                <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 2 }}>Formato <code>HH:MM-HH:MM</code>. Varios rangos con coma (ej. <code>12:00-15:00,18:00-23:00</code>). Vacío = cerrado ese día.</div>
                {DAYS.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--text2)', width: 76, flexShrink: 0 }}>{d.label}</span>
                    <input style={{ ...inp, flex: 1 }} value={(cfg.hours?.days || {})[d.id] || ''} placeholder="cerrado"
                      onChange={e => set('hours', { ...(cfg.hours || {}), enabled: true, days: { ...(cfg.hours?.days || {}), [d.id]: e.target.value } })} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <button onClick={saveConfig} disabled={busy} style={btnPri}>{busy ? 'Guardando…' : 'Guardar configuración'}</button>
          </div>
        </div>
      )}

      {sec === 'menu'  && <MenuSection accId={accId} menu={menu} reload={loadMenu} flash={flash} currency={cfg.currency} />}
      {sec === 'mods'  && <ModsSection accId={accId} menu={menu} reload={loadMenu} flash={flash} />}
      {sec === 'zones' && <ZonesSection accId={accId} menu={menu} reload={loadMenu} flash={flash} currency={cfg.currency} />}
      {sec === 'coupons' && <CouponsSection accId={accId} menu={menu} reload={loadMenu} flash={flash} currency={cfg.currency} />}
      {sec === 'couriers' && <CouriersSection accId={accId} menu={menu} reload={loadMenu} flash={flash} />}
      {sec === 'metrics' && <MetricsSection accId={accId} currency={cfg.currency} />}
    </div>
  )
}

// ── Menú: productos ──────────────────────────────────────────────────────────────
const emptyProduct = { id: '', category: '', name: '', description: '', price: 0, promoPrice: 0, imageUrl: '', modifierGroupIds: [], available: true }
function MenuSection({ accId, menu, reload, flash, currency }) {
  const [edit, setEdit] = useState(null)
  const [uploading, setUploading] = useState(false)
  const groups = menu.groups || []

  const previewUrl = e => e?.mediaId ? mediaUrl(accId, e.mediaId) : (e?.imageUrl || '')
  async function onPickImage(file) {
    if (!file) return
    setUploading(true)
    try { const r = await uploadChatMedia(accId, file, 'orders'); setEdit(prev => ({ ...prev, mediaId: r.mediaId, imageUrl: '' })) }
    catch (err) { flash(err.message || 'No se pudo subir', false) }
    setUploading(false)
  }

  async function save() {
    if (!edit.name.trim()) return flash('El nombre es obligatorio', false)
    try { await saveOrderProduct(accId, edit); setEdit(null); reload(); flash('Producto guardado ✓') }
    catch (e) { flash(e.message, false) }
  }
  async function remove(id) { if (!confirm('¿Eliminar este producto?')) return; try { await deleteOrderProduct(accId, id); reload(); flash('Eliminado ✓') } catch (e) { flash(e.message, false) } }

  const byCat = {}
  for (const p of (menu.products || [])) (byCat[p.category || 'Sin categoría'] ||= []).push(p)

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Menú / catálogo ({(menu.products || []).length})</div>
        <button onClick={() => setEdit({ ...emptyProduct })} style={btnPri}>+ Producto</button>
      </div>

      {edit && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
            <div><label style={lbl}>Nombre *</label><input style={inp} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
            <div><label style={lbl}>Categoría</label><input style={inp} value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })} placeholder="Ej: Pizzas" /></div>
            <div><label style={lbl}>Precio</label><input type="number" min="0" style={inp} value={edit.price} onChange={e => setEdit({ ...edit, price: Number(e.target.value) || 0 })} /></div>
            <div><label style={lbl}>Oferta 🔥 <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(0=sin oferta)</span></label><input type="number" min="0" style={inp} value={edit.promoPrice || 0} onChange={e => setEdit({ ...edit, promoPrice: Number(e.target.value) || 0 })} /></div>
          </div>
          <div style={{ marginTop: 10 }}><label style={lbl}>Descripción</label><input style={inp} value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} /></div>
          <div style={{ marginTop: 10 }}>
            <label style={lbl}>Foto del producto <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional)</span></label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {previewUrl(edit) ? (
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <img src={previewUrl(edit)} alt="" style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border2)' }} />
                  <button onClick={() => setEdit({ ...edit, mediaId: null, imageUrl: '' })} title="Quitar foto"
                    style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#ff5f5f', color: '#fff', cursor: 'pointer', fontSize: 11 }}>✕</button>
                </div>
              ) : <div style={{ width: 72, height: 72, borderRadius: 8, background: 'var(--bg2)', border: '1px dashed var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: 'var(--text3)', flexShrink: 0 }}>🍔</div>}
              <div style={{ flex: 1 }}>
                <label style={{ ...btnSec, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: uploading ? 'wait' : 'pointer' }}>
                  {uploading ? 'Subiendo…' : '⤒ Subir foto'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) onPickImage(f); e.target.value = '' }} />
                </label>
                <input style={{ ...inp, marginTop: 8 }} value={edit.imageUrl || ''} onChange={e => setEdit({ ...edit, imageUrl: e.target.value, mediaId: e.target.value ? null : edit.mediaId })} placeholder="…o pega una URL de imagen" />
              </div>
            </div>
          </div>
          {groups.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <label style={lbl}>Grupos de adiciones aplicables</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {groups.map(g => {
                  const on = (edit.modifierGroupIds || []).includes(g.id)
                  return <button key={g.id} onClick={() => setEdit({ ...edit, modifierGroupIds: on ? edit.modifierGroupIds.filter(x => x !== g.id) : [...(edit.modifierGroupIds || []), g.id] })} style={chip(on)}>{g.name}</button>
                })}
              </div>
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginTop: 12 }}>
            <input type="checkbox" checked={edit.available !== false} onChange={e => setEdit({ ...edit, available: e.target.checked })} /> Disponible
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={save} style={btnPri}>Guardar</button>
            <button onClick={() => setEdit(null)} style={btnSec}>Cancelar</button>
          </div>
        </div>
      )}

      {!(menu.products || []).length && !edit && <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Aún no hay productos. Agrega el primero para que el asistente pueda mostrar el menú.</div>}

      {Object.entries(byCat).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 6 }}>{cat}</div>
          {items.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--bg3)', marginBottom: 6 }}>
              {previewUrl(p) && <img src={previewUrl(p)} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover' }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name} {!p.available && <span style={{ fontSize: 10.5, color: '#f5a623' }}>· agotado</span>}</div>
                {p.description && <div style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.description}</div>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>
                {p.onSale
                  ? <><span style={{ color: '#22d98a' }}>🔥 {Number(p.promoPrice).toLocaleString('es-CO')}</span> <span style={{ textDecoration: 'line-through', color: 'var(--text3)', fontWeight: 400, fontSize: 11 }}>{Number(p.price).toLocaleString('es-CO')}</span></>
                  : <>{Number(p.price).toLocaleString('es-CO')} {currency}</>}
              </div>
              <button onClick={() => setEdit({ ...emptyProduct, ...p })} style={{ ...btnSec, padding: '5px 10px' }}>✎</button>
              <button onClick={() => remove(p.id)} style={{ ...btnSec, padding: '5px 10px', color: '#ff5f5f' }}>🗑</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Adiciones / modificadores ────────────────────────────────────────────────────
const emptyGroup = { id: '', name: '', minSelect: 0, maxSelect: 1, required: false, modifiers: [] }
function ModsSection({ accId, menu, reload, flash }) {
  const [edit, setEdit] = useState(null)
  async function save() {
    if (!edit.name.trim()) return flash('El nombre del grupo es obligatorio', false)
    try { await saveOrderGroup(accId, edit); setEdit(null); reload(); flash('Grupo guardado ✓') } catch (e) { flash(e.message, false) }
  }
  async function remove(id) { if (!confirm('¿Eliminar este grupo de adiciones?')) return; try { await deleteOrderGroup(accId, id); reload(); flash('Eliminado ✓') } catch (e) { flash(e.message, false) } }
  const setMod = (i, k, v) => setEdit(e => ({ ...e, modifiers: e.modifiers.map((m, j) => j === i ? { ...m, [k]: v } : m) }))

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Grupos de adiciones ({(menu.groups || []).length})</div>
        <button onClick={() => setEdit({ ...emptyGroup, modifiers: [{ name: '', priceDelta: 0, available: true }] })} style={btnPri}>+ Grupo</button>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text3)', margin: '0 0 14px' }}>Ej: "Tamaño" (personal/familiar), "Extras" (queso, tocineta). Se asignan a los productos desde la pestaña Menú.</p>

      {edit && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
            <div><label style={lbl}>Nombre del grupo *</label><input style={inp} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
            <div><label style={lbl}>Mín. selección</label><input type="number" min="0" style={inp} value={edit.minSelect} onChange={e => setEdit({ ...edit, minSelect: Number(e.target.value) || 0 })} /></div>
            <div><label style={lbl}>Máx. selección</label><input type="number" min="1" style={inp} value={edit.maxSelect} onChange={e => setEdit({ ...edit, maxSelect: Number(e.target.value) || 1 })} /></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginTop: 10 }}>
            <input type="checkbox" checked={!!edit.required} onChange={e => setEdit({ ...edit, required: e.target.checked })} /> Obligatorio
          </label>
          <div style={{ marginTop: 12 }}>
            <label style={lbl}>Opciones</label>
            {edit.modifiers.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input style={{ ...inp, flex: 2 }} placeholder="Nombre (ej. Extra queso)" value={m.name} onChange={e => setMod(i, 'name', e.target.value)} />
                <input type="number" style={{ ...inp, flex: 1 }} placeholder="+precio" value={m.priceDelta} onChange={e => setMod(i, 'priceDelta', Number(e.target.value) || 0)} />
                <button onClick={() => setEdit(e => ({ ...e, modifiers: e.modifiers.filter((_, j) => j !== i) }))} style={{ ...btnSec, padding: '5px 10px', color: '#ff5f5f' }}>✕</button>
              </div>
            ))}
            <button onClick={() => setEdit(e => ({ ...e, modifiers: [...e.modifiers, { name: '', priceDelta: 0, available: true }] }))} style={{ ...btnSec, marginTop: 4 }}>+ Opción</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={save} style={btnPri}>Guardar</button>
            <button onClick={() => setEdit(null)} style={btnSec}>Cancelar</button>
          </div>
        </div>
      )}

      {(menu.groups || []).map(g => (
        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, background: 'var(--bg3)', marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{g.name} {g.required && <span style={{ fontSize: 10.5, color: 'var(--accent)' }}>· obligatorio</span>}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{(g.modifiers || []).map(m => m.name + (m.priceDelta ? ` (+${Number(m.priceDelta).toLocaleString('es-CO')})` : '')).join(', ') || 'sin opciones'}</div>
          </div>
          <button onClick={() => setEdit({ ...emptyGroup, ...g, modifiers: g.modifiers?.length ? g.modifiers : [{ name: '', priceDelta: 0, available: true }] })} style={{ ...btnSec, padding: '5px 10px' }}>✎</button>
          <button onClick={() => remove(g.id)} style={{ ...btnSec, padding: '5px 10px', color: '#ff5f5f' }}>🗑</button>
        </div>
      ))}
    </div>
  )
}

// ── Zonas de entrega ─────────────────────────────────────────────────────────────
const emptyZone = { id: '', name: '', fee: 0, minOrder: 0, etaMin: 0 }
function ZonesSection({ accId, menu, reload, flash, currency }) {
  const [edit, setEdit] = useState(null)
  async function save() {
    if (!edit.name.trim()) return flash('El nombre de la zona es obligatorio', false)
    try { await saveOrderZone(accId, edit); setEdit(null); reload(); flash('Zona guardada ✓') } catch (e) { flash(e.message, false) }
  }
  async function remove(id) { if (!confirm('¿Eliminar esta zona?')) return; try { await deleteOrderZone(accId, id); reload(); flash('Eliminada ✓') } catch (e) { flash(e.message, false) } }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Zonas de entrega ({(menu.zones || []).length})</div>
        <button onClick={() => setEdit({ ...emptyZone })} style={btnPri}>+ Zona</button>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text3)', margin: '0 0 14px' }}>El asistente calcula el costo de envío según la zona que indique el cliente.</p>

      {edit && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
            <div><label style={lbl}>Nombre / barrio *</label><input style={inp} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="Ej: Centro" /></div>
            <div><label style={lbl}>Costo de envío</label><input type="number" min="0" style={inp} value={edit.fee} onChange={e => setEdit({ ...edit, fee: Number(e.target.value) || 0 })} /></div>
            <div><label style={lbl}>Pedido mínimo</label><input type="number" min="0" style={inp} value={edit.minOrder} onChange={e => setEdit({ ...edit, minOrder: Number(e.target.value) || 0 })} /></div>
            <div><label style={lbl}>Tiempo est. (min)</label><input type="number" min="0" style={inp} value={edit.etaMin} onChange={e => setEdit({ ...edit, etaMin: Number(e.target.value) || 0 })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={save} style={btnPri}>Guardar</button>
            <button onClick={() => setEdit(null)} style={btnSec}>Cancelar</button>
          </div>
        </div>
      )}

      {(menu.zones || []).map(z => (
        <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, background: 'var(--bg3)', marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{z.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Envío {Number(z.fee).toLocaleString('es-CO')} {currency}{z.minOrder ? ` · mín. ${Number(z.minOrder).toLocaleString('es-CO')}` : ''}{z.etaMin ? ` · ~${z.etaMin} min` : ''}</div>
          </div>
          <button onClick={() => setEdit({ ...emptyZone, ...z })} style={{ ...btnSec, padding: '5px 10px' }}>✎</button>
          <button onClick={() => remove(z.id)} style={{ ...btnSec, padding: '5px 10px', color: '#ff5f5f' }}>🗑</button>
        </div>
      ))}
    </div>
  )
}

// ── Repartidores ─────────────────────────────────────────────────────────────────
// ── Cupones de descuento ─────────────────────────────────────────────────────────
const emptyCoupon = { id: '', code: '', type: 'percent', value: 0, minOrder: 0, maxDiscount: 0, usesMax: 0, active: true, expiresAt: null }
function CouponsSection({ accId, menu, reload, flash, currency }) {
  const [edit, setEdit] = useState(null)
  const coupons = menu.coupons || []
  async function save() {
    if (!edit.code.trim()) return flash('El código es obligatorio', false)
    try { await saveOrderCoupon(accId, edit); setEdit(null); reload(); flash('Cupón guardado ✓') } catch (e) { flash(e.message, false) }
  }
  async function remove(id) { if (!confirm('¿Eliminar este cupón?')) return; try { await deleteOrderCoupon(accId, id); reload(); flash('Eliminado ✓') } catch (e) { flash(e.message, false) } }
  const toInput = ts => ts ? new Date(ts).toISOString().slice(0, 10) : ''

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Cupones de descuento ({coupons.length})</div>
        <button onClick={() => setEdit({ ...emptyCoupon })} style={btnPri}>+ Cupón</button>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text3)', margin: '0 0 14px' }}>El cliente da el código al asistente y se descuenta del subtotal.</p>

      {edit && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
            <div><label style={lbl}>Código *</label><input style={inp} value={edit.code} onChange={e => setEdit({ ...edit, code: e.target.value.toUpperCase() })} placeholder="BIENVENIDO10" /></div>
            <div><label style={lbl}>Tipo</label>
              <select style={inp} value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value })}>
                <option value="percent">Porcentaje (%)</option>
                <option value="fixed">Monto fijo</option>
              </select>
            </div>
            <div><label style={lbl}>{edit.type === 'fixed' ? 'Descuento' : 'Porcentaje %'}</label><input type="number" min="0" style={inp} value={edit.value} onChange={e => setEdit({ ...edit, value: Number(e.target.value) || 0 })} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginTop: 10 }}>
            <div><label style={lbl}>Pedido mínimo</label><input type="number" min="0" style={inp} value={edit.minOrder} onChange={e => setEdit({ ...edit, minOrder: Number(e.target.value) || 0 })} /></div>
            {edit.type === 'percent' && <div><label style={lbl}>Descuento máx. <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(0=sin tope)</span></label><input type="number" min="0" style={inp} value={edit.maxDiscount} onChange={e => setEdit({ ...edit, maxDiscount: Number(e.target.value) || 0 })} /></div>}
            <div><label style={lbl}>Usos máx. <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(0=ilimitado)</span></label><input type="number" min="0" style={inp} value={edit.usesMax} onChange={e => setEdit({ ...edit, usesMax: Number(e.target.value) || 0 })} /></div>
            <div><label style={lbl}>Vence <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional)</span></label><input type="date" style={inp} value={toInput(edit.expiresAt)} onChange={e => setEdit({ ...edit, expiresAt: e.target.value ? new Date(e.target.value + 'T23:59:59').getTime() : null })} /></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginTop: 10 }}>
            <input type="checkbox" checked={edit.active !== false} onChange={e => setEdit({ ...edit, active: e.target.checked })} /> Activo
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={save} style={btnPri}>Guardar</button>
            <button onClick={() => setEdit(null)} style={btnSec}>Cancelar</button>
          </div>
        </div>
      )}

      {coupons.map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, background: 'var(--bg3)', marginBottom: 6, opacity: c.active ? 1 : .55 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: .3 }}>🎟 {c.code} {!c.active && <span style={{ fontSize: 10.5, color: '#f5a623' }}>· inactivo</span>}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              {c.type === 'fixed' ? `-${Number(c.value).toLocaleString('es-CO')} ${currency}` : `-${c.value}%`}
              {c.minOrder ? ` · mín. ${Number(c.minOrder).toLocaleString('es-CO')}` : ''}
              {c.maxDiscount ? ` · tope ${Number(c.maxDiscount).toLocaleString('es-CO')}` : ''}
              {c.usesMax ? ` · ${c.usesCount}/${c.usesMax} usos` : ` · ${c.usesCount} usos`}
              {c.expiresAt ? ` · vence ${new Date(c.expiresAt).toLocaleDateString('es-CO')}` : ''}
            </div>
          </div>
          <button onClick={() => setEdit({ ...emptyCoupon, ...c })} style={{ ...btnSec, padding: '5px 10px' }}>✎</button>
          <button onClick={() => remove(c.id)} style={{ ...btnSec, padding: '5px 10px', color: '#ff5f5f' }}>🗑</button>
        </div>
      ))}
    </div>
  )
}

const emptyCourier = { id: '', name: '', phone: '', active: true }
function CouriersSection({ accId, menu, reload, flash }) {
  const [edit, setEdit] = useState(null)
  async function save() {
    if (!edit.name.trim()) return flash('El nombre es obligatorio', false)
    try { await saveOrderCourier(accId, edit); setEdit(null); reload(); flash('Repartidor guardado ✓') } catch (e) { flash(e.message, false) }
  }
  async function remove(id) { if (!confirm('¿Eliminar este repartidor?')) return; try { await deleteOrderCourier(accId, id); reload(); flash('Eliminado ✓') } catch (e) { flash(e.message, false) } }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Repartidores ({(menu.couriers || []).length})</div>
        <button onClick={() => setEdit({ ...emptyCourier })} style={btnPri}>+ Repartidor</button>
      </div>

      {edit && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
            <div><label style={lbl}>Nombre *</label><input style={inp} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
            <div><label style={lbl}>Teléfono</label><input style={inp} value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginTop: 10 }}>
            <input type="checkbox" checked={edit.active !== false} onChange={e => setEdit({ ...edit, active: e.target.checked })} /> Activo
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={save} style={btnPri}>Guardar</button>
            <button onClick={() => setEdit(null)} style={btnSec}>Cancelar</button>
          </div>
        </div>
      )}

      {(menu.couriers || []).map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, background: 'var(--bg3)', marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name} {!c.active && <span style={{ fontSize: 10.5, color: '#f5a623' }}>· inactivo</span>}</div>
            {c.phone && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.phone}</div>}
          </div>
          <button onClick={() => setEdit({ ...emptyCourier, ...c })} style={{ ...btnSec, padding: '5px 10px' }}>✎</button>
          <button onClick={() => remove(c.id)} style={{ ...btnSec, padding: '5px 10px', color: '#ff5f5f' }}>🗑</button>
        </div>
      ))}
    </div>
  )
}

// ── Métricas de pedidos ──────────────────────────────────────────────────────────
const DAY_MS = 86400000
const RANGES = [{ id: 7, label: '7 días' }, { id: 30, label: '30 días' }, { id: 90, label: '90 días' }]
const fmtDur = ms => {
  if (!ms || ms < 0) return '—'
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  if (h < 24) return `${h}h${r ? ` ${r}m` : ''}`
  const d = Math.floor(h / 24); return `${d}d ${h % 24}h`
}
function MetricsSection({ accId, currency }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const cur = data?.currency || currency || 'COP'
  const money = n => `${Math.round(Number(n) || 0).toLocaleString('es-CO')} ${cur}`

  const load = useCallback(async (d) => {
    setLoading(true); setErr('')
    try {
      const to = Date.now(), from = to - d * DAY_MS
      setData(await getOrderMetrics(accId, from, to))
    } catch (e) { setErr('No se pudieron cargar las métricas.') } finally { setLoading(false) }
  }, [accId])
  useEffect(() => { load(days) }, [days, load])

  const s = data?.summary || {}
  const maxDay = Math.max(1, ...(data?.byDay || []).map(d => d.revenue))
  const kpi = { flex: '1 1 150px', minWidth: 140, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 12, padding: '13px 15px' }
  const kpiV = { fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }
  const kpiL = { fontSize: 11.5, color: 'var(--text3)', marginTop: 4, fontWeight: 600 }
  const block = { ...card, maxWidth: 860, marginTop: 14 }
  const h4 = { fontSize: 13, fontWeight: 700, color: 'var(--text2)', margin: '0 0 12px' }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        {RANGES.map(r => (
          <button key={r.id} onClick={() => setDays(r.id)} style={chip(days === r.id)}>{r.label}</button>
        ))}
        <button onClick={() => load(days)} disabled={loading} style={{ ...btnSec, marginLeft: 'auto' }}>{loading ? 'Cargando…' : '↻ Actualizar'}</button>
      </div>

      {err && <div style={{ color: '#ff5f5f', fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {!data && loading && <div style={{ color: 'var(--text3)', fontSize: 13 }}>Cargando métricas…</div>}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={kpi}><div style={kpiV}>{money(s.revenue)}</div><div style={kpiL}>💰 Ventas</div></div>
            <div style={kpi}><div style={kpiV}>{s.valid || 0}</div><div style={kpiL}>🧾 Pedidos</div></div>
            <div style={kpi}><div style={kpiV}>{money(s.avgTicket)}</div><div style={kpiL}>🎯 Ticket promedio</div></div>
            <div style={kpi}><div style={kpiV}>{fmtDur(s.leadMs)}</div><div style={kpiL}>⏱ Tiempo de entrega</div></div>
            <div style={kpi}><div style={kpiV}>{s.canceled || 0} <span style={{ fontSize: 13, color: 'var(--text3)' }}>({s.cancelRate || 0}%)</span></div><div style={kpiL}>❌ Cancelados</div></div>
          </div>

          {(!data.byDay || !data.byDay.length)
            ? <div style={{ ...block, color: 'var(--text3)', fontSize: 13 }}>Aún no hay pedidos en este período.</div>
            : (
              <div style={block}>
                <h4 style={h4}>📈 Ventas por día</h4>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 130, overflowX: 'auto', paddingBottom: 4 }}>
                  {data.byDay.map(d => (
                    <div key={d.day} title={`${d.day}: ${money(d.revenue)} · ${d.orders} pedidos`} style={{ flex: '1 0 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 14 }}>
                      <div style={{ width: '100%', maxWidth: 26, height: `${Math.max(3, (d.revenue / maxDay) * 100)}%`, background: 'linear-gradient(180deg,var(--accent),color-mix(in srgb,var(--accent) 55%,transparent))', borderRadius: '5px 5px 2px 2px' }} />
                      <div style={{ fontSize: 8.5, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{d.day.slice(5)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
            <div style={{ ...block, marginTop: 0, flex: '1 1 380px' }}>
              <h4 style={h4}>🏆 Productos más pedidos</h4>
              {(data.topProducts || []).length ? (
                <BarList rows={data.topProducts.map(p => ({ label: p.name, value: p.qty, sub: money(p.revenue) }))} unit="und" />
              ) : <div style={{ color: 'var(--text3)', fontSize: 12.5 }}>Sin datos.</div>}
            </div>
            <div style={{ ...block, marginTop: 0, flex: '1 1 380px' }}>
              <h4 style={h4}>⏱ Tiempo promedio por estado (SLA)</h4>
              {(data.sla || []).length ? (
                <div>
                  {data.sla.map(x => (
                    <div key={x.status} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <span style={{ color: 'var(--text2)' }}>{x.label}</span>
                      <span style={{ fontWeight: 700 }}>{fmtDur(x.avgMs)} <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 11 }}>({x.samples})</span></span>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: 'var(--text3)', fontSize: 12.5 }}>Sin datos.</div>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
            <div style={{ ...block, marginTop: 0, flex: '1 1 240px' }}>
              <h4 style={h4}>🧭 Por tipo</h4>
              {(data.byType || []).length ? <BarList rows={data.byType.map(t => ({ label: t.label, value: t.orders, sub: money(t.revenue) }))} unit="" /> : <div style={{ color: 'var(--text3)', fontSize: 12.5 }}>—</div>}
            </div>
            <div style={{ ...block, marginTop: 0, flex: '1 1 240px' }}>
              <h4 style={h4}>💳 Por pago</h4>
              {(data.byPayment || []).length ? <BarList rows={data.byPayment.map(p => ({ label: PAY_LABEL[p.method] || p.method, value: p.orders, sub: money(p.revenue) }))} unit="" /> : <div style={{ color: 'var(--text3)', fontSize: 12.5 }}>—</div>}
            </div>
            <div style={{ ...block, marginTop: 0, flex: '1 1 240px' }}>
              <h4 style={h4}>📍 Zonas más pedidas</h4>
              {(data.topZones || []).length ? <BarList rows={data.topZones.map(z => ({ label: z.name, value: z.orders, sub: money(z.revenue) }))} unit="" /> : <div style={{ color: 'var(--text3)', fontSize: 12.5 }}>Sin zonas.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
const PAY_LABEL = { online: '💳 En línea', cash: '💵 Efectivo', sin_dato: 'Sin dato' }
function BarList({ rows, unit }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
            <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '62%' }}>{r.label}</span>
            <span style={{ fontWeight: 700 }}>{r.value}{unit ? ` ${unit}` : ''} {r.sub && <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 11 }}>· {r.sub}</span>}</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  )
}
