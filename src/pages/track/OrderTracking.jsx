import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { API_BASE } from '../../lib/api'

// Página PÚBLICA de seguimiento de un pedido por su código. Sin login: consulta el
// endpoint público y se auto-refresca. Muestra el avance por estados.
const STEPS_DELIVERY = [
  { id: 'received',   label: 'Recibido',      icon: '📝' },
  { id: 'confirmed',  label: 'Confirmado',    icon: '✅' },
  { id: 'preparing',  label: 'En preparación', icon: '👨‍🍳' },
  { id: 'ready',      label: 'Listo',         icon: '📦' },
  { id: 'on_the_way', label: 'En camino',     icon: '🛵' },
  { id: 'delivered',  label: 'Entregado',     icon: '🎉' },
]
const STEPS_OTHER = STEPS_DELIVERY.filter(s => s.id !== 'on_the_way').map(s => s.id === 'delivered' ? { ...s, label: 'Entregado', icon: '🎉' } : s)
const TYPE_LABEL = { delivery: '🛵 Domicilio', pickup: '🏃 Para recoger', dinein: '🍽 En el local', scheduled: '⏰ Programado' }

function money(n, cur) { try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: cur || 'COP', maximumFractionDigits: 0 }).format(Number(n) || 0) } catch { return `${Math.round(Number(n) || 0).toLocaleString('es-CO')} ${cur || ''}` } }

export default function OrderTracking() {
  const { accId, code } = useParams()
  const [order, setOrder] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${accId}/track/${encodeURIComponent(code)}`)
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'No encontramos ese pedido.') }
      setOrder(await res.json()); setErr('')
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [accId, code])

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t) }, [load])

  const canceled = order?.status === 'canceled'
  const steps = order?.type === 'delivery' ? STEPS_DELIVERY : STEPS_OTHER
  const curIdx = order ? steps.findIndex(s => s.id === order.status) : -1
  const tsOf = id => order?.timeline?.find(t => t.status === id)?.at

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg,#0f1115)', color: 'var(--text,#e8eaed)', display: 'flex', justifyContent: 'center', padding: '24px 16px', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#8a8f98', marginTop: 80 }}>Cargando tu pedido…</div>
        ) : err ? (
          <div style={{ textAlign: 'center', marginTop: 80 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🔍</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{err}</div>
            <div style={{ fontSize: 13, color: '#8a8f98', marginTop: 6 }}>Verifica el código con el negocio.</div>
          </div>
        ) : order && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              {order.businessName && <div style={{ fontSize: 13, color: '#8a8f98', marginBottom: 2 }}>{order.businessName}</div>}
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: .3 }}>Pedido {order.code}</div>
              <div style={{ fontSize: 13, color: '#8a8f98', marginTop: 4 }}>{TYPE_LABEL[order.type] || order.type}</div>
            </div>

            {canceled ? (
              <div style={{ background: 'rgba(255,95,95,.12)', border: '1px solid #ff5f5f55', borderRadius: 14, padding: 22, textAlign: 'center', color: '#ff5f5f', fontWeight: 700, fontSize: 16 }}>
                ❌ Este pedido fue cancelado.
              </div>
            ) : (
              <div style={{ background: 'var(--bg2,#181b20)', border: '1px solid var(--border,#282c34)', borderRadius: 16, padding: '20px 18px' }}>
                {steps.map((s, i) => {
                  const done = i <= curIdx
                  const active = i === curIdx
                  const at = tsOf(s.id)
                  return (
                    <div key={s.id} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                          background: done ? (active ? 'linear-gradient(135deg,#22d98a,#12b47a)' : 'rgba(34,217,138,.18)') : 'var(--bg3,#22262e)',
                          border: `1px solid ${done ? '#22d98a' : 'var(--border2,#31363f)'}`, color: done && active ? '#04120b' : (done ? '#22d98a' : '#6b7280') }}>
                          {done && !active ? '✓' : s.icon}
                        </div>
                        {i < steps.length - 1 && <div style={{ width: 2, height: 26, background: i < curIdx ? '#22d98a' : 'var(--border2,#31363f)' }} />}
                      </div>
                      <div style={{ paddingTop: 5, paddingBottom: 14 }}>
                        <div style={{ fontSize: 14.5, fontWeight: active ? 800 : 600, color: done ? 'var(--text,#e8eaed)' : '#6b7280' }}>{s.label}{active && ' • ahora'}</div>
                        {at && <div style={{ fontSize: 11, color: '#8a8f98', marginTop: 1 }}>{new Date(at).toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {order.address?.text && <div style={{ marginTop: 14, fontSize: 13, color: '#a8adb5' }}>📍 {order.address.text}</div>}
            {order.tableLabel && <div style={{ marginTop: 14, fontSize: 13, color: '#a8adb5' }}>🍽 Mesa {order.tableLabel}</div>}
            {order.scheduledFor && <div style={{ marginTop: 8, fontSize: 13, color: '#a8adb5' }}>⏰ {order.scheduledFor}</div>}

            <div style={{ marginTop: 16, background: 'var(--bg2,#181b20)', border: '1px solid var(--border,#282c34)', borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#8a8f98', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 10 }}>Tu pedido</div>
              {(order.items || []).map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 5 }}>
                  <span><strong>{it.qty}×</strong> {it.name}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border,#282c34)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>Total: {money(order.total, order.currency)}</span>
                <span style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 20, fontWeight: 600,
                  background: order.paymentStatus === 'paid' ? 'rgba(34,217,138,.15)' : 'rgba(245,166,35,.15)',
                  color: order.paymentStatus === 'paid' ? '#22d98a' : '#f5a623' }}>
                  {order.paymentStatus === 'paid' ? '✓ Pagado' : (order.paymentMethod === 'cash' ? '💵 Contra entrega' : '💳 Pago pendiente')}
                </span>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button onClick={load} style={{ padding: '8px 18px', borderRadius: 20, border: '1px solid var(--border2,#31363f)', background: 'transparent', color: 'var(--text,#e8eaed)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>↻ Actualizar</button>
              <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 8 }}>Se actualiza solo cada 15 s</div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
