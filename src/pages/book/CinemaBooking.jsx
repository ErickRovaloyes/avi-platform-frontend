import { useEffect, useMemo, useState, useRef } from 'react'
import { getCinemaListing, getShowtimeSeats, holdShowtimeSeats, releaseShowtimeSeats, bookShowtimeSeats } from '../../lib/storage'

const sid = () => 'sess_' + Math.random().toString(36).slice(2)

// Flujo público de compra de entradas de cine: cartelera → función → mapa de
// asientos → hold (con cuenta regresiva) → datos → confirmar.
export default function CinemaBooking({ accId, calId, cal }) {
  const accent = cal?.color || '#e50914'
  const sessionId = useRef(sid()).current
  const [listing, setListing] = useState(null)
  const [show, setShow] = useState(null)        // función elegida
  const [seatMap, setSeatMap] = useState(null)
  const [selected, setSelected] = useState([])  // códigos de asiento
  const [hold, setHold] = useState(null)         // { expiresAt }
  const [secs, setSecs] = useState(0)
  const [client, setClient] = useState({ name: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  useEffect(() => { getCinemaListing(accId, calId).then(setListing).catch(() => setListing({ movies: [], showtimes: [] })) }, [accId, calId])

  // Carga el mapa de asientos al elegir función.
  useEffect(() => {
    if (!show) { setSeatMap(null); return }
    setSeatMap(null); setSelected([])
    getShowtimeSeats(accId, show.id).then(setSeatMap).catch(() => setSeatMap({ rows: [] }))
  }, [show, accId])

  // Cuenta regresiva del hold.
  useEffect(() => {
    if (!hold) return
    const t = setInterval(() => {
      const left = Math.max(0, Math.round((hold.expiresAt - Date.now()) / 1000))
      setSecs(left)
      if (left <= 0) { clearInterval(t); cancelHold('Se agotó el tiempo. Vuelve a elegir tus asientos.') }
    }, 500)
    return () => clearInterval(t)
  }, [hold]) // eslint-disable-line

  const moviesById = useMemo(() => Object.fromEntries((listing?.movies || []).map(m => [m.id, m])), [listing])
  const showsByMovie = useMemo(() => {
    const g = {}
    for (const sh of listing?.showtimes || []) (g[sh.movieId] ||= []).push(sh)
    return g
  }, [listing])

  function toggleSeat(code, state) {
    if (state !== 'free') return
    setSelected(sel => sel.includes(code) ? sel.filter(c => c !== code) : [...sel, code])
  }

  async function startHold() {
    if (!selected.length) return
    setBusy(true); setError('')
    try {
      const r = await holdShowtimeSeats(accId, show.id, { seats: selected, sessionId })
      setHold({ expiresAt: r.expiresAt }); setSecs(Math.round((r.expiresAt - Date.now()) / 1000))
    } catch (e) {
      setError(e.message || 'Esos asientos ya no están disponibles')
      getShowtimeSeats(accId, show.id).then(setSeatMap).catch(() => {}); setSelected([])
    }
    setBusy(false)
  }
  async function cancelHold(msg) {
    try { await releaseShowtimeSeats(accId, show.id, { seats: selected, sessionId }) } catch {}
    setHold(null); setSelected([]); setError(msg || '')
    getShowtimeSeats(accId, show.id).then(setSeatMap).catch(() => {})
  }
  async function confirm() {
    if (!client.name.trim() || !client.phone.trim()) { setError('Completa tu nombre y teléfono.'); return }
    setBusy(true); setError('')
    try {
      const r = await bookShowtimeSeats(accId, show.id, { seats: selected, client, sessionId })
      setDone(r.booking)
    } catch (e) { setError(e.message || 'No se pudo completar la compra'); }
    setBusy(false)
  }

  // ── Estilos ──
  const page = { minHeight: '100vh', background: '#0d0d12', color: '#ebebf0', display: 'flex', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif' }
  const card = { width: '100%', maxWidth: 640, background: '#16161d', border: '1px solid #2a2a35', borderRadius: 16, overflow: 'hidden' }
  const btn = (bg, dim) => ({ padding: '11px 16px', borderRadius: 10, border: 'none', cursor: dim ? 'default' : 'pointer', background: bg, color: '#fff', fontSize: 14, fontWeight: 700, opacity: dim ? .5 : 1 })

  if (!listing) return <div style={page}><div style={{ ...card, padding: 30, textAlign: 'center' }}>Cargando…</div></div>

  if (done) return (
    <div style={page}><div style={{ ...card, padding: 30, textAlign: 'center' }}>
      <div style={{ fontSize: 52 }}>🎟</div>
      <h2 style={{ marginTop: 8 }}>¡Entradas confirmadas!</h2>
      <p style={{ color: '#a8a8b8' }}>{moviesById[show.movieId]?.title} · {done.date} {done.time}</p>
      <p style={{ fontSize: 18, fontWeight: 700, marginTop: 10 }}>Asientos: {done.seats.join(', ')}</p>
      <p style={{ color: '#7a7a88', fontSize: 13, marginTop: 12 }}>Te esperamos. Puedes cerrar esta ventana.</p>
    </div></div>
  )

  return (
    <div style={page}>
      <div style={card}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #2a2a35', background: `linear-gradient(135deg, ${accent}22, transparent)` }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>🎬 {cal?.name}</h2>
        </div>
        <div style={{ padding: 22 }}>
          {/* Paso 1: cartelera */}
          {!show && (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Cartelera</div>
              {(listing.movies || []).length === 0 && <div style={{ color: '#7a7a88' }}>No hay funciones disponibles.</div>}
              {(listing.movies || []).map(m => (
                <div key={m.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700 }}>{m.title} {m.rating ? <span style={{ fontSize: 11, color: '#7a7a88' }}>· {m.rating}</span> : null} {m.durationMin ? <span style={{ fontSize: 11, color: '#7a7a88' }}>· {m.durationMin} min</span> : null}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                    {(showsByMovie[m.id] || []).map(sh => (
                      <button key={sh.id} onClick={() => setShow(sh)} style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: '#0d0d12', color: '#ebebf0', border: '1px solid #2a2a35', fontSize: 13 }}>
                        {sh.date} · <strong>{sh.time}</strong> · {sh.format}{sh.price ? ` · $${sh.price}` : ''}
                      </button>
                    ))}
                    {!(showsByMovie[m.id] || []).length && <span style={{ color: '#7a7a88', fontSize: 12 }}>Sin funciones programadas</span>}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Paso 2: mapa de asientos */}
          {show && (
            <>
              <button onClick={() => { if (hold) cancelHold(); setShow(null) }} style={{ background: 'none', border: 'none', color: accent, cursor: 'pointer', fontSize: 13, marginBottom: 8 }}>← Cambiar función</button>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{moviesById[show.movieId]?.title}</div>
              <div style={{ fontSize: 12, color: '#a8a8b8', marginBottom: 12 }}>{show.date} · {show.time} · {show.format}{show.price ? ` · $${show.price}` : ''}</div>

              {!seatMap ? <div style={{ color: '#7a7a88' }}>Cargando asientos…</div> : (
                <>
                  <div style={{ textAlign: 'center', background: '#1a1a22', borderRadius: 8, padding: 6, fontSize: 11, color: '#7a7a88', marginBottom: 14, letterSpacing: 4 }}>PANTALLA</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', marginBottom: 14 }}>
                    {seatMap.rows.map(r => (
                      <div key={r.row} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 16, fontSize: 11, color: '#7a7a88' }}>{r.row}</span>
                        {r.seats.map(seat => {
                          const isSel = selected.includes(seat.code)
                          const bg = seat.state === 'blocked' ? 'transparent'
                            : isSel ? accent
                            : seat.state === 'sold' ? '#3a3a44'
                            : seat.state === 'held' ? '#5a4a1a'
                            : (seat.type === 'vip' ? 'rgba(245,166,35,.3)' : '#23232c')
                          const clickable = seat.state === 'free' && !hold
                          return seat.state === 'blocked'
                            ? <span key={seat.code} style={{ width: 22, height: 22 }} />
                            : <button key={seat.code} disabled={!clickable && !isSel} onClick={() => toggleSeat(seat.code, hold ? 'sold' : seat.state)} title={`${seat.code} · ${seat.type}`}
                                style={{ width: 22, height: 22, borderRadius: 4, fontSize: 9, cursor: clickable ? 'pointer' : 'default', border: `1px solid ${isSel ? accent : '#33333d'}`, background: bg, color: '#ebebf0' }}>
                                {seat.number}
                              </button>
                        })}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 14, justifyContent: 'center', fontSize: 11, color: '#7a7a88', marginBottom: 14, flexWrap: 'wrap' }}>
                    <span>🟦 Libre</span><span style={{ color: '#f5a623' }}>▮ VIP</span><span>⬛ Ocupado</span><span style={{ color: accent }}>▮ Tu selección</span>
                  </div>

                  {error && <div style={{ color: '#ff7676', fontSize: 13, marginBottom: 10, textAlign: 'center' }}>{error}</div>}

                  {!hold ? (
                    <button onClick={startHold} disabled={!selected.length || busy} style={{ ...btn(accent, !selected.length || busy), width: '100%' }}>
                      {busy ? 'Reservando…' : `Continuar${selected.length ? ` · ${selected.length} asiento(s)` : ''}`}
                    </button>
                  ) : (
                    <div style={{ background: '#0d0d12', border: '1px solid #2a2a35', borderRadius: 10, padding: 14 }}>
                      <div style={{ textAlign: 'center', fontSize: 13, marginBottom: 10 }}>
                        Asientos <strong>{selected.join(', ')}</strong> reservados · ⏳ <strong style={{ color: secs < 60 ? '#ff7676' : '#22d98a' }}>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</strong>
                      </div>
                      <input placeholder="Tu nombre" value={client.name} onChange={e => setClient(c => ({ ...c, name: e.target.value }))} style={{ width: '100%', padding: '10px 12px', background: '#16161d', border: '1px solid #2a2a35', borderRadius: 8, color: '#ebebf0', marginBottom: 8, boxSizing: 'border-box' }} />
                      <input placeholder="Tu teléfono" value={client.phone} onChange={e => setClient(c => ({ ...c, phone: e.target.value }))} style={{ width: '100%', padding: '10px 12px', background: '#16161d', border: '1px solid #2a2a35', borderRadius: 8, color: '#ebebf0', marginBottom: 12, boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => cancelHold()} style={{ ...btn('#26262f'), flex: '0 0 auto' }}>Cancelar</button>
                        <button onClick={confirm} disabled={busy} style={{ ...btn(accent, busy), flex: 1 }}>{busy ? 'Confirmando…' : 'Confirmar compra'}</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
        <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: '#5a5a66', borderTop: '1px solid #2a2a35' }}>Powered by AVI Platform</div>
      </div>
    </div>
  )
}
