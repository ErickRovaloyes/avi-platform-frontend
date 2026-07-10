import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getSocket } from '../../lib/api'
import { listOrders, getOrdersMenu, updateOrder } from '../../lib/storage'

// Tablero operativo de pedidos (Fase 1b): kanban en vivo de los pedidos que crea
// el asistente. Cambia el estado, asigna repartidor, marca pago y cancela; suena
// una alerta al entrar un pedido nuevo. Se actualiza por socket ('orders:updated').

const COLUMNS = [
  { id: 'received',   label: 'Recibidos',      color: '#f5a623' },
  { id: 'confirmed',  label: 'Confirmados',    color: '#4fa8ff' },
  { id: 'preparing',  label: 'En preparación', color: '#b266ff' },
  { id: 'ready',      label: 'Listos',         color: '#22d98a' },
  { id: 'on_the_way', label: 'En camino',      color: '#3ad1c8' },
  { id: 'delivered',  label: 'Entregados',     color: '#7d8590' },
]
const STATUS_LABEL = { received: 'Recibido', confirmed: 'Confirmado', preparing: 'En preparación', ready: 'Listo', on_the_way: 'En camino', delivered: 'Entregado', canceled: 'Cancelado' }
const TYPE_LABEL = { delivery: '🛵 Domicilio', pickup: '🏃 Recoger', dinein: '🍽 En el local', scheduled: '⏰ Programado' }

function nextStatus(o) {
  switch (o.status) {
    case 'received':   return 'confirmed'
    case 'confirmed':  return 'preparing'
    case 'preparing':  return 'ready'
    case 'ready':      return o.type === 'delivery' ? 'on_the_way' : 'delivered'
    case 'on_the_way': return 'delivered'
    default:           return null
  }
}
function money(n, cur) { try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: cur || 'COP', maximumFractionDigits: 0 }).format(Number(n) || 0) } catch { return `${Math.round(Number(n) || 0).toLocaleString('es-CO')} ${cur || ''}` } }
function ago(ts) {
  if (!ts) return ''
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}
// Alerta sonora sintetizada (sin assets): dos tonos cortos.
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return
    const ac = new Ctx()
    const play = (freq, start, dur) => {
      const o = ac.createOscillator(), g = ac.createGain()
      o.type = 'sine'; o.frequency.value = freq
      o.connect(g); g.connect(ac.destination)
      g.gain.setValueAtTime(0.0001, ac.currentTime + start)
      g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + start + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur)
      o.start(ac.currentTime + start); o.stop(ac.currentTime + start + dur)
    }
    play(880, 0, 0.18); play(1180, 0.16, 0.22)
    setTimeout(() => ac.close().catch(() => {}), 700)
  } catch {}
}

export default function OrdersBoard() {
  const { account } = useAccount()
  const accId = account?.id
  const currency = account?.orders?.currency || 'COP'
  const [orders, setOrders] = useState([])
  const [zones, setZones] = useState([])
  const [couriers, setCouriers] = useState([])
  const [loading, setLoading] = useState(true)
  const [soundOn, setSoundOn] = useState(true)
  const [showClosed, setShowClosed] = useState(false)
  const [flash, setFlash] = useState({})       // { [orderId]: true }
  const knownRef = useRef(null)                 // Set de ids ya vistos (para alerta)
  const soundRef = useRef(true); soundRef.current = soundOn

  const zoneName = useCallback(id => zones.find(z => z.id === id)?.name || '', [zones])

  const load = useCallback(async () => {
    if (!accId) return
    try {
      const r = await listOrders(accId)
      const list = r?.orders || []
      // Alerta: pedidos nuevos (recibidos) que no habíamos visto antes.
      if (knownRef.current) {
        const fresh = list.filter(o => !knownRef.current.has(o.id) && o.status === 'received')
        if (fresh.length) {
          if (soundRef.current) beep()
          setFlash(f => { const n = { ...f }; fresh.forEach(o => { n[o.id] = true }); return n })
          fresh.forEach(o => setTimeout(() => setFlash(f => { const n = { ...f }; delete n[o.id]; return n }), 6000))
        }
      }
      knownRef.current = new Set(list.map(o => o.id))
      setOrders(list)
    } catch {}
    setLoading(false)
  }, [accId])

  useEffect(() => {
    if (!accId) return
    load()
    getOrdersMenu(accId).then(m => { setZones(m.zones || []); setCouriers(m.couriers || []) }).catch(() => {})
  }, [accId, load])

  // Live: refresca al recibir el evento (con debounce).
  useEffect(() => {
    if (!accId) return
    const socket = getSocket()
    let t = null
    const onUpd = () => { clearTimeout(t); t = setTimeout(load, 300) }
    socket.on('orders:updated', onUpd)
    return () => { clearTimeout(t); socket.off('orders:updated', onUpd) }
  }, [accId, load])

  async function patch(id, body, optimistic) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...optimistic } : o))
    try { await updateOrder(accId, id, body) } catch {}
    load()
  }
  const advance = o => { const ns = nextStatus(o); if (ns) patch(o.id, { status: ns }, { status: ns }) }
  const cancel = o => { if (confirm(`¿Cancelar el pedido ${o.code}?`)) patch(o.id, { status: 'canceled' }, { status: 'canceled' }) }
  const markPaid = o => patch(o.id, { paymentStatus: 'paid' }, { paymentStatus: 'paid' })
  const setCourier = (o, courierId) => patch(o.id, { courierId }, { courierId })

  const byStatus = useMemo(() => {
    const g = {}; for (const c of COLUMNS) g[c.id] = []
    for (const o of orders) if (g[o.status]) g[o.status].push(o)
    return g
  }, [orders])
  const canceledToday = useMemo(() => orders.filter(o => o.status === 'canceled'), [orders])
  const activeCount = orders.filter(o => !['delivered', 'canceled'].includes(o.status)).length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '18px 20px', boxSizing: 'border-box' }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 19, margin: 0 }}>🛵 Pedidos</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text3)' }}>{activeCount} activo(s)</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setSoundOn(v => !v)} title="Alerta sonora al entrar un pedido"
          style={pill(soundOn)}>{soundOn ? '🔔 Alerta ON' : '🔕 Alerta OFF'}</button>
        <button onClick={load} style={pill(false)} title="Refrescar">↻ Refrescar</button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Cargando pedidos…</div>
      ) : orders.length === 0 ? (
        <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text3)', maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🍽</div>
          <p style={{ fontSize: 14, margin: '0 0 6px', color: 'var(--text2)' }}>Todavía no hay pedidos.</p>
          <small>Cuando el asistente confirme un pedido, aparecerá aquí en tiempo real.</small>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', gap: 12, overflowX: 'auto', overflowY: 'hidden', minHeight: 0 }}>
          {COLUMNS.map(col => (
            <div key={col.id} style={{ flex: '0 0 274px', display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg2, rgba(255,255,255,.02))', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: col.color }} />
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{col.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>{byStatus[col.id].length}</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {byStatus[col.id].length === 0 && <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '10px 0' }}>—</div>}
                {byStatus[col.id].map(o => (
                  <OrderCard key={o.id} o={o} currency={currency} zoneName={zoneName} couriers={couriers}
                    flash={!!flash[o.id]} onAdvance={() => advance(o)} onCancel={() => cancel(o)} onPaid={() => markPaid(o)}
                    onCourier={cid => setCourier(o, cid)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cancelados */}
      {canceledToday.length > 0 && (
        <div style={{ marginTop: 12, flexShrink: 0 }}>
          <button onClick={() => setShowClosed(v => !v)} style={{ ...pill(false), fontSize: 11.5 }}>
            {showClosed ? '▾' : '▸'} Cancelados ({canceledToday.length})
          </button>
          {showClosed && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              {canceledToday.map(o => (
                <div key={o.id} style={{ fontSize: 11.5, color: 'var(--text3)', padding: '6px 10px', borderRadius: 8, background: 'var(--bg3, rgba(255,255,255,.03))', border: '1px solid var(--border)' }}>
                  {o.code} · {money(o.total, currency)} · {TYPE_LABEL[o.type] || o.type}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function OrderCard({ o, currency, zoneName, couriers, flash, onAdvance, onCancel, onPaid, onCourier }) {
  const ns = nextStatus(o)
  const paid = o.paymentStatus === 'paid'
  const isCash = o.paymentMethod === 'cash'
  const change = isCash && o.cashAmount && o.cashAmount > o.total ? o.cashAmount - o.total : 0
  return (
    <div style={{ background: 'var(--bg3, rgba(255,255,255,.03))', border: `1px solid ${flash ? '#f5a623' : 'var(--border2)'}`, borderRadius: 10, padding: 11, boxShadow: flash ? '0 0 0 2px #f5a62366' : 'none', transition: 'box-shadow .3s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: .3 }}>{o.code}</span>
        <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>{ago(o.createdAt)}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text2)' }}>{TYPE_LABEL[o.type] || o.type}</span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, marginBottom: 6 }}>
        {(o.items || []).map((it, i) => (
          <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <strong>{it.qty}×</strong> {it.combo?.length ? '🍱 ' : ''}{it.name}{it.modifiers?.length ? ` · ${it.modifiers.map(m => m.name).join(', ')}` : ''}
            {it.combo?.length ? <span style={{ color: 'var(--text3)' }}> ({it.combo.map(c => `${c.qty > 1 ? `${c.qty}× ` : ''}${c.name}`).join(', ')})</span> : ''}
          </div>
        ))}
      </div>

      {(o.customerName || o.customerPhone) && (
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 3 }}>👤 {o.customerName || '—'} {o.customerPhone && <a href={`tel:${o.customerPhone}`} style={{ color: 'var(--accent)' }}>{o.customerPhone}</a>}</div>
      )}
      {o.type === 'delivery' && o.address?.text && (
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 3 }}>📍 {o.address.text}{zoneName(o.zoneId) ? ` · ${zoneName(o.zoneId)}` : ''}</div>
      )}
      {o.type === 'dinein' && o.tableLabel && <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 3 }}>🍽 Mesa {o.tableLabel}</div>}
      {o.type === 'scheduled' && o.scheduledFor && <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 3 }}>⏰ {o.scheduledFor}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '7px 0' }}>
        <span style={{ fontSize: 13.5, fontWeight: 800 }}>{money(o.total, currency)}</span>
        <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 20, fontWeight: 600,
          background: paid ? 'rgba(34,217,138,.15)' : (isCash ? 'rgba(245,166,35,.15)' : 'rgba(79,168,255,.15)'),
          color: paid ? '#22d98a' : (isCash ? '#f5a623' : '#4fa8ff') }}>
          {paid ? '✓ Pagado' : (isCash ? '💵 Contra entrega' : '💳 Pendiente')}
        </span>
        {!paid && <button onClick={onPaid} title="Marcar como pagado" style={{ ...miniBtn, marginLeft: 'auto' }}>✓ Pagar</button>}
      </div>
      {change > 0 && <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 5 }}>Vuelto: {money(change, currency)} (paga con {money(o.cashAmount, currency)})</div>}

      {/* Repartidor (domicilio en camino/listo) */}
      {o.type === 'delivery' && couriers.length > 0 && (o.status === 'ready' || o.status === 'on_the_way') && (
        <select value={o.courierId || ''} onChange={e => onCourier(e.target.value || null)}
          style={{ width: '100%', fontSize: 11.5, padding: '5px 7px', borderRadius: 7, background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text)', marginBottom: 7 }}>
          <option value="">🛵 Asignar repartidor…</option>
          {couriers.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        {ns ? (
          <button onClick={onAdvance} style={{ ...miniBtn, flex: 1, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700 }}>
            → {STATUS_LABEL[ns]}
          </button>
        ) : (
          <span style={{ flex: 1, fontSize: 11.5, color: '#22d98a', fontWeight: 700, textAlign: 'center', padding: '6px 0' }}>✓ Completado</span>
        )}
        <button onClick={onCancel} title="Cancelar pedido" style={{ ...miniBtn, color: '#ff5f5f' }}>✕</button>
      </div>
    </div>
  )
}

const pill = on => ({ cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 20, border: `1px solid ${on ? 'var(--accent)' : 'var(--border2)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--text2)' })
const miniBtn = { cursor: 'pointer', fontSize: 11.5, fontWeight: 600, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--bg2, transparent)', color: 'var(--text)' }
