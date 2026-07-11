import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_BASE } from '../../lib/api'

// Portal del cliente (público): el cliente consulta sus pedidos y reservas por teléfono.
const ORDER_STATUS = { received: 'Recibido', confirmed: 'Confirmado', preparing: 'En preparación', ready: 'Listo', on_the_way: 'En camino', delivered: 'Entregado', canceled: 'Cancelado' }
const ORDER_COLOR = { received: '#f5a623', confirmed: '#4fa8ff', preparing: '#7c6fff', ready: '#4fa8ff', on_the_way: '#4fa8ff', delivered: '#22d98a', canceled: '#ff5f5f' }
const BOOK_STATUS = { pending: 'Pendiente', confirmed: 'Confirmada', rescheduled: 'Reprogramada', cancelled: 'Cancelada', noshow: 'No asistió', completed: 'Completada' }

export default function CustomerPortal() {
  const { accId } = useParams()
  const [phone, setPhone] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function search(e) {
    e?.preventDefault()
    if (!phone.trim() || loading) return
    setLoading(true); setErr('')
    try {
      const res = await fetch(`${API_BASE}/api/portal/${accId}?phone=${encodeURIComponent(phone.trim())}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'No se pudo consultar.')
      setData(j)
    } catch (e) { setErr(e.message); setData(null) }
    setLoading(false)
  }

  const money = (n, c) => `${Math.round(Number(n) || 0).toLocaleString('es-CO')} ${c || ''}`.trim()
  const wrap = { minHeight: '100vh', background: 'var(--bg,#0c120f)', color: 'var(--text,#e9f2ec)', fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px' }
  const card = { background: 'var(--bg2,#131c16)', border: '1px solid var(--border,#24322b)', borderRadius: 14, padding: 18, width: '100%', maxWidth: 560 }
  const chip = (c) => ({ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, color: c, background: c + '22' })

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 560, width: '100%', textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 30 }}>📱</div>
        <h1 style={{ fontSize: 22, margin: '6px 0 2px', fontWeight: 800 }}>{data?.businessName || 'Mi cuenta'}</h1>
        <p style={{ fontSize: 13, color: 'var(--text3,#93a89c)', margin: 0 }}>Consulta tus pedidos y reservas con tu teléfono.</p>
      </div>

      <form onSubmit={search} style={{ ...card, display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Tu número de teléfono" type="tel"
          style={{ flex: 1, padding: '11px 13px', fontSize: 15, borderRadius: 10, border: '1px solid var(--border2,#24322b)', background: 'var(--bg3,#18231d)', color: 'inherit' }} />
        <button type="submit" disabled={loading || !phone.trim()}
          style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: '#12b981', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>{loading ? '…' : 'Buscar'}</button>
      </form>

      {err && <div style={{ ...card, color: '#ff5f5f', fontSize: 13, marginBottom: 16 }}>{err}</div>}

      {data && (
        <>
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🛍 Mis pedidos <span style={{ color: 'var(--text3,#93a89c)', fontWeight: 400 }}>({data.orders.length})</span></div>
            {data.orders.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3,#93a89c)' }}>No encontramos pedidos con ese teléfono.</div>}
            {data.orders.map(o => (
              <div key={o.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border,#24322b)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Pedido {o.code}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3,#93a89c)' }}>{new Date(o.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {money(o.total, o.currency)}</div>
                </div>
                <span style={chip(ORDER_COLOR[o.status] || '#93a89c')}>{ORDER_STATUS[o.status] || o.status}</span>
                <a href={`/track/${accId}/${o.code}`} style={{ fontSize: 12, color: '#12b981', textDecoration: 'none', fontWeight: 600 }}>Seguir →</a>
              </div>
            ))}
          </div>

          {data.bookings.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🗓 Mis reservas <span style={{ color: 'var(--text3,#93a89c)', fontWeight: 400 }}>({data.bookings.length})</span></div>
              {data.bookings.map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border,#24322b)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{b.date} {b.time || ''}</div>
                    {b.notes && <div style={{ fontSize: 11.5, color: 'var(--text3,#93a89c)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.notes}</div>}
                  </div>
                  <span style={chip(b.status === 'confirmed' || b.status === 'completed' ? '#22d98a' : b.status === 'cancelled' || b.status === 'noshow' ? '#ff5f5f' : '#f5a623')}>{BOOK_STATUS[b.status] || b.status}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 24, fontSize: 11, color: 'var(--text3,#93a89c)' }}>Con tecnología de AVI</div>
    </div>
  )
}
