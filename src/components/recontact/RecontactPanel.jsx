import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getRecontactConfig, saveRecontactConfig } from '../../lib/storage'

// Recontactos inteligentes: re-engancha conversaciones que el cliente abandonó.
// Config a nivel de cuenta: tiempo de inactividad, modo (IA o flujo) y tope.
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 }
const inp = { padding: '9px 11px', background: 'var(--bg1)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontSize: 13.5 }
const lbl = { fontSize: 11.5, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', marginBottom: 6 }

// Descompone delayMinutes en {value, unit} legible.
function splitDelay(min) {
  if (min % 1440 === 0) return { value: min / 1440, unit: 'd' }
  if (min % 60 === 0) return { value: min / 60, unit: 'h' }
  return { value: min, unit: 'm' }
}
const toMinutes = (v, u) => Math.max(5, Math.round(Number(v) || 0) * (u === 'd' ? 1440 : u === 'h' ? 60 : 1))

export default function RecontactPanel() {
  const { account } = useAccount()
  const accId = account?.id
  const flows = account?.flows || []
  const [cfg, setCfg] = useState(null)
  const [delayVal, setDelayVal] = useState(24)
  const [delayUnit, setDelayUnit] = useState('h')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!accId) return
    getRecontactConfig(accId).then(c => {
      setCfg(c)
      const d = splitDelay(c.delayMinutes || 1440); setDelayVal(d.value); setDelayUnit(d.unit)
    }).catch(() => setCfg({ enabled: false, mode: 'intelligent', flowId: null, maxRecontacts: 1 }))
      .finally(() => setLoading(false))
  }, [accId])

  const set = patch => setCfg(c => ({ ...c, ...patch }))

  async function save() {
    setSaving(true)
    try {
      const payload = { ...cfg, delayMinutes: toMinutes(delayVal, delayUnit) }
      const saved = await saveRecontactConfig(accId, payload)
      setCfg(saved); setToast('Configuración guardada ✓'); setTimeout(() => setToast(''), 2200)
    } catch (e) { setToast(e.message || 'Error') }
    setSaving(false)
  }

  if (loading || !cfg) return <div style={{ padding: 24, color: 'var(--text3)' }}>Cargando…</div>

  return (
    <div style={{ padding: 24, maxWidth: 720, overflowY: 'auto' }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>🔁 Recontactos inteligentes</h1>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 16px' }}>
        Re-engancha automáticamente las conversaciones que el cliente <strong>dejó de responder</strong>. Aplica a toda la cuenta
        (canales de WhatsApp, Messenger e Instagram).
      </p>
      {toast && <div style={{ ...card, padding: '10px 14px', color: 'var(--accent)', borderColor: 'var(--accent-glow)', background: 'var(--accent-dim)' }}>{toast}</div>}

      <div style={card}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14.5, fontWeight: 600 }}>
          <input type="checkbox" checked={!!cfg.enabled} onChange={e => set({ enabled: e.target.checked })} style={{ width: 16, height: 16 }} />
          Activar recontactos automáticos
        </label>
      </div>

      <div style={{ ...card, opacity: cfg.enabled ? 1 : 0.55, pointerEvents: cfg.enabled ? 'auto' : 'none' }}>
        <label style={lbl}>Recontactar tras esta inactividad</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <input type="number" min="1" style={{ ...inp, width: 90 }} value={delayVal} onChange={e => setDelayVal(e.target.value)} />
          <select style={inp} value={delayUnit} onChange={e => setDelayUnit(e.target.value)}>
            <option value="m">minutos</option><option value="h">horas</option><option value="d">días</option>
          </select>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>sin respuesta del cliente</span>
        </div>

        <label style={lbl}>Tipo de recontacto</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <Radio checked={cfg.mode === 'intelligent'} onChange={() => set({ mode: 'intelligent' })}
            title="Inteligente (IA)" desc="La IA redacta un mensaje retomando exactamente dónde quedó la conversación." />
          <Radio checked={cfg.mode === 'flow'} onChange={() => set({ mode: 'flow' })}
            title="Disparar un flujo" desc="Activa un flujo predeterminado (con tu mensaje/secuencia) en la conversación." />
        </div>

        {cfg.mode === 'flow' && (
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Flujo a disparar</label>
            <select style={{ ...inp, width: '100%', boxSizing: 'border-box' }} value={cfg.flowId || ''} onChange={e => set({ flowId: e.target.value || null })}>
              <option value="">— Elige un flujo —</option>
              {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {flows.length === 0 && <div style={{ fontSize: 12, color: 'var(--amber,#f5a623)', marginTop: 6 }}>No hay flujos creados. Crea uno en la pestaña Flujos.</div>}
          </div>
        )}

        <label style={lbl}>Máximo de recontactos por conversación</label>
        <input type="number" min="1" max="5" style={{ ...inp, width: 90 }} value={cfg.maxRecontacts || 1} onChange={e => set({ maxRecontacts: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })} />
      </div>

      <button onClick={save} disabled={saving || (cfg.mode === 'flow' && cfg.enabled && !cfg.flowId)}
        style={{ padding: '11px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,var(--accent),var(--accent2))', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Guardando…' : 'Guardar configuración'}
      </button>

      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 14, lineHeight: 1.5 }}>
        ℹ Solo se recontacta cuando el <strong>último mensaje fue del agente/IA</strong> (el cliente fue quien dejó de responder) y la IA del chat está activa. El sistema revisa periódicamente; no recontacta el webchat (el visitante ya no está conectado).
      </div>
    </div>
  )
}

function Radio({ checked, onChange, title, desc }) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: 11, borderRadius: 10, border: `1px solid ${checked ? 'var(--accent)' : 'var(--border2)'}`, background: checked ? 'var(--accent-dim)' : 'transparent' }}>
      <input type="radio" checked={checked} onChange={onChange} style={{ marginTop: 3 }} />
      <span>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{desc}</div>
      </span>
    </label>
  )
}
