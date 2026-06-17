import { useEffect, useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  listRooms, createRoom, updateRoom, deleteRoom, setRoomHk,
  hotelArrivals, hotelDepartures, hotelInHouse, hotelCheckIn, hotelCheckOut, hotelChangeRoom,
  listHkTasks, updateHkTask, listMaintenance, createMaintenance, resolveMaintenance,
  getFolio, addFolioCharge, addFolioPayment, hotelReport, listRoomTypes,
  listHotelChannels, createHotelChannel, updateHotelChannel, deleteHotelChannel, syncHotelChannel,
  getChannelProviders, testHotelChannel, importChannelRooms,
} from '../../lib/storage'
import s from './CalendarsPanel.module.css'

const today = () => new Date().toISOString().slice(0, 10)
const HK_COLORS = { clean: '#22d98a', dirty: '#f5a623', inspected: '#4fa8ff', oos: '#ff5f5f' }
const HK_LABEL = { clean: 'Limpia', dirty: 'Sucia', inspected: 'Inspeccionada', oos: 'Fuera de servicio' }

export default function HotelPmsTab({ calendar }) {
  const { account } = useAccount()
  const accId = account?.id
  const [sub, setSub] = useState('front') // front | rooms | maint | reports
  const [folioBk, setFolioBk] = useState(null)
  const SUBS = [
    { id: 'front', label: '🛎 Recepción' }, { id: 'rooms', label: '🧹 Habitaciones / HK' },
    { id: 'maint', label: '🔧 Mantenimiento' }, { id: 'reports', label: '📈 Reportes' },
    { id: 'channels', label: '🔗 Canales / OTAs' },
  ]
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {SUBS.map(t => <button key={t.id} className={s.ghostBtn} style={sub === t.id ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : undefined} onClick={() => setSub(t.id)}>{t.label}</button>)}
      </div>
      {sub === 'front' && <FrontDesk accId={accId} cal={calendar} onFolio={setFolioBk} />}
      {sub === 'rooms' && <RoomsHk accId={accId} cal={calendar} />}
      {sub === 'maint' && <Maintenance accId={accId} cal={calendar} />}
      {sub === 'reports' && <Reports accId={accId} cal={calendar} />}
      {sub === 'channels' && <Channels accId={accId} cal={calendar} />}
      {folioBk && <FolioModal accId={accId} bookingId={folioBk} onClose={() => setFolioBk(null)} />}
    </div>
  )
}

function FrontDesk({ accId, cal, onFolio }) {
  const [date, setDate] = useState(today())
  const [arr, setArr] = useState([]); const [dep, setDep] = useState([]); const [inh, setInh] = useState([])
  const [rooms, setRooms] = useState([])
  async function reload() {
    if (!accId) return
    const [a, d, i, r] = await Promise.all([hotelArrivals(accId, cal.id, date), hotelDepartures(accId, cal.id, date), hotelInHouse(accId, cal.id), listRooms(accId, cal.id)])
    setArr(a || []); setDep(d || []); setInh(i || []); setRooms(r || [])
  }
  useEffect(() => { reload() }, [accId, cal.id, date]) // eslint-disable-line
  const roomNum = id => rooms.find(r => r.id === id)?.number || '—'
  const freeRooms = rooms.filter(r => r.hkStatus === 'clean' || r.hkStatus === 'inspected')

  async function doCheckIn(bk) {
    const room = prompt(`Check-in de ${bk.clientName}. Nº de habitación a asignar (libres: ${freeRooms.map(r => r.number).join(', ') || 'ninguna'}):`)
    if (room === null) return
    const r = freeRooms.find(x => x.number === room.trim())
    try { await hotelCheckIn(accId, bk.id, r?.id || null); reload() } catch (e) { alert(e.message) }
  }
  async function doCheckOut(bk) { if (confirm(`¿Check-out de ${bk.clientName} (hab. ${roomNum(bk.roomId)})?`)) { try { await hotelCheckOut(accId, bk.id); reload() } catch (e) { alert(e.message) } } }

  const Card = ({ bk, action }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{bk.clientName || 'Huésped'} {bk.roomId && <span className={s.hint}>· Hab. {roomNum(bk.roomId)}</span>}</div>
        <div className={s.hint}>{bk.meta?.roomType || ''} · {bk.checkin} → {bk.checkout} · {bk.guests}p</div>
      </div>
      <button className={s.ghostBtn} onClick={() => onFolio(bk.id)}>💳 Folio</button>
      {action}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <label className={s.hint}>Fecha</label>
        <input type="date" className={s.input} style={{ width: 150 }} value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 6px', fontWeight: 700, fontSize: 13 }}>🛬 Llegadas ({arr.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {arr.length === 0 && <span className={s.hint}>Sin llegadas para esta fecha.</span>}
        {arr.map(bk => <Card key={bk.id} bk={bk} action={<button className={s.ghostBtn} style={{ background: 'var(--green-dim)', color: 'var(--green)' }} onClick={() => doCheckIn(bk)}>Check-in →</button>} />)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 6px', fontWeight: 700, fontSize: 13 }}>🛫 Salidas ({dep.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {dep.length === 0 && <span className={s.hint}>Sin salidas para esta fecha.</span>}
        {dep.map(bk => <Card key={bk.id} bk={bk} action={<button className={s.ghostBtn} style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }} onClick={() => doCheckOut(bk)}>Check-out →</button>} />)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 6px', fontWeight: 700, fontSize: 13 }}>🏨 En casa ({inh.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {inh.length === 0 && <span className={s.hint}>Sin huéspedes alojados.</span>}
        {inh.map(bk => <Card key={bk.id} bk={bk} action={<button className={s.ghostBtn} onClick={() => doCheckOut(bk)}>Check-out</button>} />)}
      </div>
    </div>
  )
}

function RoomsHk({ accId, cal }) {
  const [rooms, setRooms] = useState([]); const [types, setTypes] = useState([]); const [hk, setHk] = useState([])
  async function reload() {
    const [r, t, h] = await Promise.all([listRooms(accId, cal.id), listRoomTypes(accId, cal.id), listHkTasks(accId, cal.id, {})])
    setRooms(r || []); setTypes(t || []); setHk(h || [])
  }
  useEffect(() => { reload() }, [accId, cal.id]) // eslint-disable-line
  const typeName = id => types.find(t => t.id === id)?.name || '—'
  const roomNum = id => rooms.find(r => r.id === id)?.number || '—'
  async function add() { await createRoom(accId, cal.id, { number: String(rooms.length + 101), floor: 1, roomTypeId: types[0]?.id }); reload() }
  async function cycle(room) { const order = ['clean', 'dirty', 'inspected', 'oos']; const next = order[(order.indexOf(room.hkStatus) + 1) % order.length]; await setRoomHk(accId, room.id, next); reload() }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px', fontWeight: 700, fontSize: 14 }}>
        <span>🚪 Habitaciones ({rooms.length})</span><button className={s.ghostBtn} disabled={!types.length} onClick={add}>+ Habitación</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {!types.length && <span className={s.hint} style={{ color: '#f5a623' }}>Primero crea tipos de habitación en "Habitaciones y tarifas".</span>}
        {rooms.map(r => (
          <div key={r.id} style={{ width: 130, background: 'var(--bg3)', border: `1px solid ${HK_COLORS[r.hkStatus] || 'var(--border2)'}`, borderRadius: 8, padding: 8 }}>
            <input className={s.input} style={{ width: '100%', marginBottom: 4 }} value={r.number || ''} onChange={e => { setRooms(rs => rs.map(x => x.id === r.id ? { ...x, number: e.target.value } : x)); updateRoom(accId, r.id, { number: e.target.value }) }} />
            <select className={s.select} style={{ width: '100%', marginBottom: 4, fontSize: 11 }} value={r.roomTypeId || ''} onChange={e => { setRooms(rs => rs.map(x => x.id === r.id ? { ...x, roomTypeId: e.target.value } : x)); updateRoom(accId, r.id, { roomTypeId: e.target.value }) }}>
              {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={() => cycle(r)} style={{ width: '100%', fontSize: 11, padding: '4px', borderRadius: 6, cursor: 'pointer', border: 'none', background: (HK_COLORS[r.hkStatus] || '#888') + '33', color: HK_COLORS[r.hkStatus] || '#888', fontWeight: 700 }}>{HK_LABEL[r.hkStatus] || r.hkStatus}</button>
            <button className={s.ghostBtn} style={{ width: '100%', marginTop: 4, fontSize: 10 }} onClick={async () => { await deleteRoom(accId, r.id); reload() }}>Eliminar</button>
          </div>
        ))}
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, margin: '4px 0 8px' }}>🧹 Tareas de limpieza pendientes</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {hk.filter(t => t.status !== 'done').length === 0 && <span className={s.hint}>Sin tareas pendientes.</span>}
        {hk.filter(t => t.status !== 'done').map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}>
            <span>🧹 Hab. {roomNum(t.roomId)} · {t.type} · {t.date}</span>
            <button className={s.ghostBtn} style={{ marginLeft: 'auto', background: 'var(--green-dim)', color: 'var(--green)' }} onClick={async () => { await updateHkTask(accId, t.id, { status: 'done' }); reload() }}>✓ Hecho</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Maintenance({ accId, cal }) {
  const [list, setList] = useState([]); const [rooms, setRooms] = useState([])
  const [form, setForm] = useState({ roomId: '', issue: '', severity: 'low', oosFrom: '', oosTo: '' })
  async function reload() { const [m, r] = await Promise.all([listMaintenance(accId, cal.id, {}), listRooms(accId, cal.id)]); setList(m || []); setRooms(r || []) }
  useEffect(() => { reload() }, [accId, cal.id]) // eslint-disable-line
  const roomNum = id => rooms.find(r => r.id === id)?.number || '—'
  async function create() { if (!form.issue.trim()) return; await createMaintenance(accId, cal.id, form); setForm({ roomId: '', issue: '', severity: 'low', oosFrom: '', oosTo: '' }); reload() }
  return (
    <div>
      <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: 10, marginBottom: 14, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <select className={s.select} style={{ width: 120 }} value={form.roomId} onChange={e => setForm(f => ({ ...f, roomId: e.target.value }))}><option value="">Habitación</option>{rooms.map(r => <option key={r.id} value={r.id}>Hab. {r.number}</option>)}</select>
        <input className={s.input} style={{ flex: 1, minWidth: 140 }} placeholder="Problema" value={form.issue} onChange={e => setForm(f => ({ ...f, issue: e.target.value }))} />
        <select className={s.select} style={{ width: 90 }} value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select>
        <label className={s.hint} style={{ display: 'flex', flexDirection: 'column' }}>OOS desde<input type="date" className={s.input} value={form.oosFrom} onChange={e => setForm(f => ({ ...f, oosFrom: e.target.value }))} /></label>
        <label className={s.hint} style={{ display: 'flex', flexDirection: 'column' }}>OOS hasta<input type="date" className={s.input} value={form.oosTo} onChange={e => setForm(f => ({ ...f, oosTo: e.target.value }))} /></label>
        <button className={s.ghostBtn} onClick={create}>+ Ticket</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {list.length === 0 && <span className={s.hint}>Sin tickets de mantenimiento.</span>}
        {list.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '6px 10px', fontSize: 13, opacity: m.status === 'resolved' ? .55 : 1 }}>
            <span style={{ color: m.severity === 'high' ? '#ff5f5f' : m.severity === 'medium' ? '#f5a623' : 'var(--text2)' }}>🔧 Hab. {roomNum(m.roomId)} · {m.issue} {m.oosFrom ? `· OOS ${m.oosFrom}→${m.oosTo || ''}` : ''}</span>
            {m.status === 'open'
              ? <button className={s.ghostBtn} style={{ marginLeft: 'auto' }} onClick={async () => { await resolveMaintenance(accId, m.id); reload() }}>Resolver</button>
              : <span className={s.hint} style={{ marginLeft: 'auto' }}>Resuelto</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Reports({ accId, cal }) {
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
  const [kpi, setKpi] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  async function run() { setBusy(true); setErr(''); try { setKpi(await hotelReport(accId, cal.id, { from, to })) } catch (e) { setErr(e.message) } setBusy(false) }
  useEffect(() => { run() }, []) // eslint-disable-line
  const Box = ({ label, value, sub }) => (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: 14, minWidth: 130, flex: 1 }}>
      <div className={s.hint}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2 }}>{value}</div>
      {sub && <div className={s.hint}>{sub}</div>}
    </div>
  )
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
        <label className={s.hint} style={{ display: 'flex', flexDirection: 'column' }}>Desde<input type="date" className={s.input} value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className={s.hint} style={{ display: 'flex', flexDirection: 'column' }}>Hasta<input type="date" className={s.input} value={to} onChange={e => setTo(e.target.value)} /></label>
        <button className={s.ghostBtn} onClick={run} disabled={busy}>{busy ? '…' : 'Calcular'}</button>
      </div>
      {err && <div className={s.hint} style={{ color: '#f5a623' }}>{err}</div>}
      {kpi && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <Box label="Ocupación" value={`${kpi.occupancy}%`} sub={`${kpi.roomNightsSold}/${kpi.roomNightsAvailable} noches`} />
            <Box label="ADR" value={kpi.adr} sub="tarifa media diaria" />
            <Box label="RevPAR" value={kpi.revpar} sub="ingreso por hab. disponible" />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Box label="Ingresos" value={kpi.revenue} sub={`${kpi.nights} noches`} />
            <Box label="Cancelaciones" value={kpi.cancellations} />
            <Box label="No-shows" value={kpi.noShows} />
          </div>
        </>
      )}
    </div>
  )
}

const PROVIDERS = [
  { id: 'airbnb', label: 'Airbnb', mode: 'iCal (importar/exportar fechas)' },
  { id: 'booking', label: 'Booking.com', mode: 'iCal o API de conectividad' },
  { id: 'hosroom', label: 'HosRoom', mode: 'API / webhook' },
  { id: 'kunas', label: 'Kunas', mode: 'API / webhook' },
]
function Channels({ accId, cal }) {
  const [chans, setChans] = useState([]); const [types, setTypes] = useState([]); const [provider, setProvider] = useState('airbnb')
  const [schemas, setSchemas] = useState({}); const [busy, setBusy] = useState('')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  async function reload() {
    const [c, t] = await Promise.all([listHotelChannels(accId, cal.id), listRoomTypes(accId, cal.id)])
    setChans(c || []); setTypes(t || [])
  }
  useEffect(() => {
    reload()
    getChannelProviders(accId).then(r => setSchemas(Object.fromEntries((r || []).map(s => [s.provider, s.fields])))).catch(() => {})
  }, [accId, cal.id]) // eslint-disable-line
  async function add() { await createHotelChannel(accId, cal.id, { provider, name: PROVIDERS.find(p => p.id === provider)?.label }); reload() }
  async function patch(id, config) { await updateHotelChannel(accId, id, { config }); reload() }
  async function toggle(id, enabled) { await updateHotelChannel(accId, id, { enabled }); reload() }
  async function test(id) { setBusy('test' + id); try { const r = await testHotelChannel(accId, id); alert(r?.ok ? `✓ ${r.message || 'Conexión OK'}` : `✗ ${r?.message || 'Sin conexión'}`) } catch (e) { alert('✗ ' + e.message) } setBusy('') }
  async function impRooms(id) { setBusy('rooms' + id); try { const r = await importChannelRooms(accId, id); alert(r?.ok ? `✓ ${r.rooms || 0} habitación(es) importada(s) con su ficha.` : `✗ ${r?.error || 'no se pudo'}`); reload() } catch (e) { alert('✗ ' + e.message) } setBusy('') }
  async function sync(id) { setBusy('sync' + id); try { const r = await syncHotelChannel(accId, id); const res = r?.reservations || {}; alert(r?.ok ? `✓ Sincronizado. Habitaciones: ${r?.rooms?.rooms ?? 0} · reservas: ${res.imported ?? 0} · iCal: ${r?.ical?.imported ?? 0}` : `Parcial/Error: ${JSON.stringify(r).slice(0,200)}`); reload() } catch (e) { alert('✗ ' + e.message) } setBusy('') }
  const copy = t => navigator.clipboard?.writeText(t).then(() => {}).catch(() => {})

  return (
    <div>
      <p className={s.hint} style={{ marginBottom: 10 }}>Conecta con OTAs / PMS reales. Rellena las <strong>credenciales</strong> del proveedor y se sincroniza todo: habitaciones (con fotos y descripción), disponibilidad, tarifas y reservas. <strong>iCal</strong> (Airbnb/Booking) funciona sin convenio para bloquear fechas; las <strong>APIs</strong> requieren las credenciales del proveedor.</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <select className={s.select} style={{ width: 160 }} value={provider} onChange={e => setProvider(e.target.value)}>{PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <button className={s.ghostBtn} onClick={add}>+ Conectar canal</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {chans.length === 0 && <span className={s.hint}>Sin canales conectados.</span>}
        {chans.map(c => {
          const inboundUrl = `${origin}/api/public/hotel/${accId}/${cal.id}/channels/${c.provider}/reservation?secret=${c.config?.webhookSecret || ''}`
          const fields = (schemas[c.provider] || []).filter(f => f.key !== 'icalImportUrl')
          return (
            <div key={c.id} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <strong>{c.name || c.provider}</strong>
                <span className={s.hint}>{PROVIDERS.find(p => p.id === c.provider)?.mode}</span>
                <label className={s.hint} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={c.enabled} onChange={e => toggle(c.id, e.target.checked)} /> Activo</label>
                <button className={s.ghostBtn} disabled={busy} onClick={() => test(c.id)}>{busy === 'test' + c.id ? '…' : '🔌 Probar'}</button>
                <button className={s.ghostBtn} disabled={busy} onClick={() => impRooms(c.id)}>{busy === 'rooms' + c.id ? '…' : '🛏 Importar habitaciones'}</button>
                <button className={s.ghostBtn} disabled={busy} onClick={() => sync(c.id)}>{busy === 'sync' + c.id ? '…' : '🔄 Sincronizar todo'}</button>
                <button className={s.ghostBtn} onClick={async () => { await deleteHotelChannel(accId, c.id); reload() }}>🗑</button>
              </div>

              {/* Credenciales (campos dinámicos según el proveedor) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                {fields.map(f => (
                  <div key={f.key} className={s.field} style={f.type === 'password' || f.key === 'endpoint' ? { gridColumn: '1 / -1' } : undefined}>
                    <label>{f.label}{f.required ? ' *' : ''}</label>
                    {f.type === 'select'
                      ? <select className={s.select} defaultValue={c.config?.[f.key] || (f.options || [])[0] || ''} onBlur={e => patch(c.id, { [f.key]: e.target.value })} onChange={e => patch(c.id, { [f.key]: e.target.value })}>{(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}</select>
                      : <input className={s.input} type={f.type === 'password' ? 'password' : 'text'} placeholder={f.help || ''} defaultValue={c.config?.[f.key] || ''} onBlur={e => patch(c.id, { [f.key]: e.target.value.trim() })} />}
                    {f.help && <span className={s.hint} style={{ fontSize: 10 }}>{f.help}</span>}
                  </div>
                ))}
              </div>

              <div className={s.field} style={{ marginBottom: 6 }}>
                <label>Tipo de habitación por defecto (si no se importa el mapeo)</label>
                <select className={s.select} value={c.config?.roomTypeId || ''} onChange={e => patch(c.id, { roomTypeId: e.target.value })}>
                  <option value="">— elegir —</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}{t.externalRef ? ` (importada)` : ''}</option>)}
                </select>
              </div>
              <div className={s.field} style={{ marginBottom: 6 }}>
                <label>URL iCal de la OTA (alternativa para sincronizar fechas)</label>
                <input className={s.input} placeholder="https://www.airbnb.com/calendar/ical/....ics" defaultValue={c.config?.icalImportUrl || ''} onBlur={e => patch(c.id, { icalImportUrl: e.target.value.trim() })} />
              </div>
              {c.config?.roomTypeId && (
                <div className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                  Tu iCal (dáselo a la OTA): <code style={{ fontSize: 11 }}>{`${origin}/api/public/hotel/${accId}/${cal.id}/ical/${c.config.roomTypeId}.ics`}</code>
                  <button className={s.ghostBtn} style={{ fontSize: 10 }} onClick={() => copy(`${origin}/api/public/hotel/${accId}/${cal.id}/ical/${c.config.roomTypeId}.ics`)}>copiar</button>
                </div>
              )}
              <div className={s.hint} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                Webhook de reservas (PMS): <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{inboundUrl}</code>
                <button className={s.ghostBtn} style={{ fontSize: 10 }} onClick={() => copy(inboundUrl)}>copiar</button>
              </div>
              {c.lastSync && <div className={s.hint} style={{ marginTop: 4 }}>Última sync: {new Date(c.lastSync).toLocaleString('es')}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FolioModal({ accId, bookingId, onClose }) {
  const [folio, setFolio] = useState(null)
  const [charge, setCharge] = useState({ description: '', amount: '', kind: 'fnb' })
  const [pay, setPay] = useState({ amount: '', method: 'card' })
  async function reload() { try { setFolio(await getFolio(accId, bookingId)) } catch {} }
  useEffect(() => { reload() }, []) // eslint-disable-line
  async function addC() { if (!charge.amount) return; await addFolioCharge(accId, bookingId, { ...charge, amount: Number(charge.amount) }); setCharge({ description: '', amount: '', kind: 'fnb' }); reload() }
  async function addP() { if (!pay.amount) return; await addFolioPayment(accId, bookingId, { ...pay, amount: Number(pay.amount), currency: folio?.currency }); setPay({ amount: '', method: 'card' }); reload() }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 14, padding: 18 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}><strong>💳 Folio</strong><button className={s.ghostBtn} onClick={onClose}>✕</button></div>
        {!folio ? <div className={s.hint}>Cargando…</div> : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
              {folio.lines.map(l => <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{l.description || l.kind}</span><span>{l.amount + l.tax} {folio.currency}</span></div>)}
              {folio.payments.map(p => <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--green)' }}><span>Pago ({p.method}){p.isDeposit ? ' · anticipo' : ''}</span><span>-{p.amount} {folio.currency}</span></div>)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16, borderTop: '1px solid var(--border)', paddingTop: 8, marginBottom: 12 }}>
              <span>Saldo</span><span style={{ color: folio.balance > 0 ? '#f5a623' : 'var(--green)' }}>{folio.balance} {folio.currency}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <select className={s.select} style={{ width: 90 }} value={charge.kind} onChange={e => setCharge(c => ({ ...c, kind: e.target.value }))}><option value="fnb">F&B</option><option value="spa">Spa</option><option value="tax">Impuesto</option><option value="other">Otro</option></select>
              <input className={s.input} style={{ flex: 1, minWidth: 100 }} placeholder="Concepto" value={charge.description} onChange={e => setCharge(c => ({ ...c, description: e.target.value }))} />
              <input className={s.input} style={{ width: 80 }} type="number" placeholder="Monto" value={charge.amount} onChange={e => setCharge(c => ({ ...c, amount: e.target.value }))} />
              <button className={s.ghostBtn} onClick={addC}>+ Cargo</button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <select className={s.select} style={{ width: 90 }} value={pay.method} onChange={e => setPay(p => ({ ...p, method: e.target.value }))}><option value="card">Tarjeta</option><option value="cash">Efectivo</option><option value="transfer">Transf.</option></select>
              <input className={s.input} style={{ width: 80 }} type="number" placeholder="Monto" value={pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} />
              <button className={s.ghostBtn} style={{ background: 'var(--green-dim)', color: 'var(--green)' }} onClick={addP}>+ Pago</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
