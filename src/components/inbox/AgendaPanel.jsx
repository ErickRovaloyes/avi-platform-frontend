import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getSchedulingConfig, saveSchedulingConfig } from '../../lib/storage'

// Configuración de la Herramienta IA Especial "agenda": el cliente elige QUÉ
// calendarios puede usar el asistente. Cada calendario tiene una DESCRIPCIÓN que
// el agente IA usa para elegir entre uno u otro.
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, maxWidth: 760 }

export default function AgendaPanel() {
  const { account } = useAccount()
  const accId = account?.id
  const calendars = account?.calendars || []
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!accId) return
    getSchedulingConfig(accId).then(c => { setSelected(c?.calendarIds || []); setLoaded(true) }).catch(() => setLoaded(true))
  }, [accId])

  function toggle(id) { setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]) }

  async function save() {
    setBusy(true); setMsg(null)
    try { const r = await saveSchedulingConfig(accId, { calendarIds: selected }); setMsg({ ok: true, text: `Guardado · ${r?.config?.calendarIds?.length || 0} calendario(s) habilitado(s) para el asistente.` }) }
    catch (e) { setMsg({ ok: false, text: e.message }) }
    setBusy(false)
  }

  const missingDesc = calendars.filter(c => selected.includes(c.id) && !String(c.description || '').trim())

  return (
    <div style={{ padding: 22, overflowY: 'auto' }}>
      <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>🗓 Agenda (citas)</h2>
      <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 16px', maxWidth: 760 }}>
        Elige los calendarios que el asistente puede usar para <strong>ver disponibilidad, recomendar, agendar, mover y cancelar citas</strong>.
        La herramienta especial <code style={{ margin: '0 4px' }}>agenda</code> está en <strong>Herramientas IA</strong>; <strong>se activa
        asignándola a un prompt</strong>. El agente elige el calendario correcto según su <strong>descripción</strong>, así que ponle a cada
        uno una descripción clara (en la pestaña <strong>Calendarios</strong>).
      </p>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Calendarios habilitados para el asistente</div>
        {calendars.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Aún no tienes calendarios. Créalos en la pestaña <strong>Calendarios</strong> del panel.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {calendars.map(c => {
              const on = selected.includes(c.id)
              return (
                <label key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border2)'}`, background: on ? 'var(--accent-dim, rgba(124,111,255,.10))' : 'transparent' }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(c.id)} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color || '#7c6fff', display: 'inline-block' }} />
                      {c.name} <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>· {c.timezone}</span>
                    </div>
                    {String(c.description || '').trim()
                      ? <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{c.description}</div>
                      : <div style={{ fontSize: 11.5, color: 'var(--amber, #f5a623)', marginTop: 2 }}>⚠ Sin descripción — el agente no sabrá cuándo elegir este calendario. Añádela en Calendarios.</div>}
                  </div>
                </label>
              )
            })}
          </div>
        )}

        {missingDesc.length > 0 && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#f5a623', background: 'rgba(245,166,35,.12)', border: '1px solid rgba(245,166,35,.3)' }}>
            Tienes {missingDesc.length} calendario(s) seleccionado(s) sin descripción. Ponles una en la pestaña Calendarios para que el agente elija bien entre ellos.
          </div>
        )}

        {msg && (
          <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            background: msg.ok ? 'rgba(34,217,138,.12)' : 'rgba(255,95,95,.12)', color: msg.ok ? '#22d98a' : '#ff5f5f',
            border: `1px solid ${msg.ok ? 'rgba(34,217,138,.35)' : 'rgba(255,95,95,.35)'}` }}>{msg.text}</div>
        )}

        <div style={{ marginTop: 16 }}>
          <button onClick={save} disabled={busy || !loaded} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {busy ? '⏳ Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
