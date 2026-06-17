import { useState } from 'react'
import { searchStay, bookStay } from '../../lib/storage'

const todayStr = () => new Date().toISOString().slice(0, 10)
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)

// Flujo público de reserva de hotel: fechas + huéspedes → tipos disponibles con
// precio → datos → confirmar.
export default function HotelBooking({ accId, calId, cal }) {
  const accent = cal?.color || '#7c6fff'
  const [checkin, setCheckin] = useState(addDays(todayStr(), 1))
  const [checkout, setCheckout] = useState(addDays(todayStr(), 2))
  const [guests, setGuests] = useState(2)
  const [results, setResults] = useState(null) // { options, nights }
  const [pick, setPick] = useState(null)        // opción elegida
  const [client, setClient] = useState({ name: '', phone: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  const nights = Math.max(0, Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000))

  async function search() {
    if (nights < 1) { setError('El check-out debe ser posterior al check-in.'); return }
    setBusy(true); setError(''); setResults(null); setPick(null)
    try { setResults(await searchStay(accId, calId, { checkin, checkout, guests })) }
    catch (e) { setError(e.message || 'No se pudo buscar disponibilidad') }
    setBusy(false)
  }
  async function confirm() {
    if (!client.name.trim() || !client.phone.trim()) { setError('Completa tu nombre y teléfono.'); return }
    setBusy(true); setError('')
    try { const r = await bookStay(accId, calId, { roomTypeId: pick.roomTypeId, checkin, checkout, guests, client }); setDone(r.booking) }
    catch (e) { setError(e.message || 'No se pudo completar la reserva') }
    setBusy(false)
  }

  const page = { minHeight: '100vh', background: '#0d0d12', color: '#ebebf0', display: 'flex', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif' }
  const card = { width: '100%', maxWidth: 560, background: '#16161d', border: '1px solid #2a2a35', borderRadius: 16, overflow: 'hidden' }
  const label = { fontSize: 13, color: '#a8a8b8', marginBottom: 5, display: 'block' }
  const input = { width: '100%', padding: '10px 12px', background: '#0d0d12', border: '1px solid #2a2a35', borderRadius: 8, color: '#ebebf0', fontSize: 14, boxSizing: 'border-box' }
  const btn = (bg, dim) => ({ padding: '12px 16px', borderRadius: 10, border: 'none', cursor: dim ? 'default' : 'pointer', background: bg, color: '#fff', fontSize: 15, fontWeight: 700, opacity: dim ? .6 : 1 })

  if (done) return (
    <div style={page}><div style={{ ...card, padding: 30, textAlign: 'center' }}>
      <div style={{ fontSize: 52 }}>🏨</div>
      <h2 style={{ marginTop: 8 }}>¡Reserva confirmada!</h2>
      <p style={{ color: '#a8a8b8' }}>{done.roomType} · {done.nights} noche(s)</p>
      <p style={{ color: '#a8a8b8' }}>Check-in {done.checkin} · Check-out {done.checkout}</p>
      <p style={{ fontSize: 20, fontWeight: 700, marginTop: 10 }}>Total: {done.total} {done.currency}</p>
      <p style={{ color: '#7a7a88', fontSize: 13, marginTop: 12 }}>Te esperamos. Puedes cerrar esta ventana.</p>
    </div></div>
  )

  return (
    <div style={page}>
      <div style={card}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #2a2a35', background: `linear-gradient(135deg, ${accent}22, transparent)` }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>🏨 {cal?.name}</h2>
        </div>
        <div style={{ padding: 22 }}>
          {/* Buscador */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 140 }}><label style={label}>Check-in</label>
              <input type="date" style={input} min={todayStr()} value={checkin} onChange={e => { setCheckin(e.target.value); if (checkout <= e.target.value) setCheckout(addDays(e.target.value, 1)) }} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}><label style={label}>Check-out</label>
              <input type="date" style={input} min={addDays(checkin, 1)} value={checkout} onChange={e => setCheckout(e.target.value)} />
            </div>
            <div style={{ width: 100 }}><label style={label}>Huéspedes</label>
              <select style={input} value={guests} onChange={e => setGuests(Number(e.target.value))}>
                {Array.from({ length: 8 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <button onClick={search} disabled={busy} style={{ ...btn(accent, busy), width: '100%', marginBottom: 14 }}>{busy && !pick ? 'Buscando…' : `Buscar (${nights} noche${nights !== 1 ? 's' : ''})`}</button>

          {error && <div style={{ color: '#ff7676', fontSize: 13, marginBottom: 10, textAlign: 'center' }}>{error}</div>}

          {/* Resultados */}
          {results && !pick && (
            <>
              {results.options.length === 0 ? <div style={{ color: '#f5a623', textAlign: 'center' }}>No hay habitaciones disponibles para esas fechas y huéspedes.</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {results.options.map(o => (
                    <button key={o.roomTypeId} onClick={() => setPick(o)} style={{ textAlign: 'left', padding: 0, borderRadius: 12, cursor: 'pointer', background: '#0d0d12', border: '1px solid #2a2a35', color: '#ebebf0', overflow: 'hidden' }}>
                      {o.photos?.length > 0 && (
                        <img src={o.photos[0]} alt={o.name} style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }} onError={e => { e.currentTarget.style.display = 'none' }} />
                      )}
                      <div style={{ padding: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{o.name}</div>
                            <div style={{ fontSize: 12, color: '#7a7a88' }}>Hasta {o.capacity} huésped(es){o.amenities?.length ? ` · ${o.amenities.join(', ')}` : ''}</div>
                            {o.description && <div style={{ fontSize: 12, color: '#9a9aa8', marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{o.description}</div>}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 18, fontWeight: 700 }}>{o.total} {o.currency}</div>
                            <div style={{ fontSize: 11, color: '#7a7a88' }}>{o.nights} noche(s)</div>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Datos + confirmar */}
          {pick && (
            <div style={{ background: '#0d0d12', border: '1px solid #2a2a35', borderRadius: 12, padding: 16 }}>
              <button onClick={() => setPick(null)} style={{ background: 'none', border: 'none', color: accent, cursor: 'pointer', fontSize: 13, marginBottom: 8 }}>← Ver otras habitaciones</button>
              {pick.photos?.length > 0 && (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10, paddingBottom: 2 }}>
                  {pick.photos.slice(0, 6).map((p, i) => (
                    <img key={i} src={p} alt={`${pick.name} ${i + 1}`} style={{ height: 90, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} onError={e => { e.currentTarget.style.display = 'none' }} />
                  ))}
                </div>
              )}
              <div style={{ fontWeight: 700 }}>{pick.name}</div>
              {pick.description && <div style={{ fontSize: 13, color: '#9a9aa8', margin: '4px 0' }}>{pick.description}</div>}
              {pick.amenities?.length > 0 && <div style={{ fontSize: 12, color: '#7a7a88', marginBottom: 4 }}>{pick.amenities.join(' · ')}</div>}
              <div style={{ fontSize: 13, color: '#a8a8b8', marginBottom: 4 }}>{checkin} → {checkout} · {pick.nights} noche(s) · {guests} huésped(es)</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Total: {pick.total} {pick.currency}</div>
              <input placeholder="Nombre completo" value={client.name} onChange={e => setClient(c => ({ ...c, name: e.target.value }))} style={{ ...input, marginBottom: 8 }} />
              <input placeholder="Teléfono" value={client.phone} onChange={e => setClient(c => ({ ...c, phone: e.target.value }))} style={{ ...input, marginBottom: 8 }} />
              <input placeholder="Email (opcional)" value={client.email} onChange={e => setClient(c => ({ ...c, email: e.target.value }))} style={{ ...input, marginBottom: 12 }} />
              <button onClick={confirm} disabled={busy} style={{ ...btn(accent, busy), width: '100%' }}>{busy ? 'Reservando…' : 'Confirmar reserva'}</button>
            </div>
          )}
        </div>
        <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: '#5a5a66', borderTop: '1px solid #2a2a35' }}>Powered by AVI Platform</div>
      </div>
    </div>
  )
}
