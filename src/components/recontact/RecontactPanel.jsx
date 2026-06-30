import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getRecontactConfig, saveRecontactConfig } from '../../lib/storage'

// Recontactos inteligentes en SECUENCIA: una lista de pasos (cada uno con su
// tiempo de espera y tipo), con tope por conversación y opción de repetir la
// secuencia al terminar. Config a nivel de cuenta.
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 }
const inp = { padding: '8px 10px', background: 'var(--bg1)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontSize: 13.5 }
const lbl = { fontSize: 11.5, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', marginBottom: 6 }

function splitDelay(min) {
  if (min && min % 1440 === 0) return { value: min / 1440, unit: 'd' }
  if (min && min % 60 === 0) return { value: min / 60, unit: 'h' }
  return { value: min || 60, unit: 'm' }
}
const toMinutes = (v, u) => Math.max(1, Math.round(Number(v) || 0) * (u === 'd' ? 1440 : u === 'h' ? 60 : 1))
const parseRoundsList = str => Array.from(new Set(String(str || '').split(/[^\d]+/).map(x => parseInt(x, 10)).filter(n => n >= 1))).sort((a, b) => a - b)

export default function RecontactPanel() {
  const { account } = useAccount()
  const accId = account?.id
  const flows = account?.flows || []
  const [enabled, setEnabled] = useState(false)
  const [steps, setSteps] = useState([])          // [{ value, unit, mode, flowId }]
  const [repeat, setRepeat] = useState(false)
  const [maxPerConversation, setMax] = useState(3)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!accId) return
    getRecontactConfig(accId).then(c => {
      setEnabled(!!c.enabled); setRepeat(!!c.repeat); setMax(c.maxPerConversation || 3)
      setSteps((c.steps || []).map(s => ({ ...splitDelay(s.delayMinutes), mode: s.mode || 'flow', flowId: s.flowId || null, roundsMode: s.rounds?.mode || 'every', roundsN: s.rounds?.n || 1, roundsList: (s.rounds?.list || []).join(', '), instructions: s.instructions || '' })))
    }).catch(() => setSteps([{ value: 24, unit: 'h', mode: 'flow', flowId: null, roundsMode: 'every', roundsN: 1, roundsList: '', instructions: '' }]))
      .finally(() => setLoading(false))
  }, [accId])

  const setStep = (i, patch) => setSteps(s => s.map((st, j) => j === i ? { ...st, ...patch } : st))
  const addStep = () => setSteps(s => [...s, { value: 24, unit: 'h', mode: 'flow', flowId: null, roundsMode: 'every', roundsN: 1, roundsList: '', instructions: '' }])
  const removeStep = i => setSteps(s => s.filter((_, j) => j !== i))

  async function save() {
    setSaving(true)
    try {
      const payload = {
        enabled, repeat, maxPerConversation,
        steps: steps.map(s => ({
          delayMinutes: toMinutes(s.value, s.unit), mode: s.mode, flowId: s.mode === 'flow' ? s.flowId : null,
          instructions: s.instructions || '',  // IA: instrucciones extra · flujo: nota opcional ({{nota}})
          rounds: s.roundsMode === 'every' ? { mode: 'every' }
            : s.roundsMode === 'list' ? { mode: 'list', list: parseRoundsList(s.roundsList) }
            : { mode: s.roundsMode, n: Math.max(1, Number(s.roundsN) || 1) },
        })),
      }
      const saved = await saveRecontactConfig(accId, payload)
      setMax(saved.maxPerConversation)
      setToast('Configuración guardada ✓'); setTimeout(() => setToast(''), 2200)
    } catch (e) { setToast(e.message || 'Error') }
    setSaving(false)
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--text3)' }}>Cargando…</div>

  return (
    <div style={{ padding: 24, maxWidth: 760, overflowY: 'auto' }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>🔁 Recontactos inteligentes</h1>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 16px' }}>
        Define una <strong>secuencia</strong> de recontactos para las conversaciones que el cliente dejó de responder.
        Cada paso espera su tiempo desde la última actividad. Aplica a toda la cuenta (WhatsApp, Messenger e Instagram).
      </p>
      {toast && <div style={{ ...card, padding: '10px 14px', color: 'var(--accent)', borderColor: 'var(--accent-glow)', background: 'var(--accent-dim)' }}>{toast}</div>}

      <div style={card}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14.5, fontWeight: 600 }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ width: 16, height: 16 }} />
          Activar recontactos automáticos
        </label>
      </div>

      <div style={{ opacity: enabled ? 1 : 0.55, pointerEvents: enabled ? 'auto' : 'none' }}>
        <label style={lbl}>Secuencia de recontactos</label>
        {steps.map((st, i) => (
          <div key={i} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{i + 1}</span>
              <strong style={{ flex: 1, fontSize: 13.5 }}>Recontacto {i + 1}</strong>
              {steps.length > 1 && <button onClick={() => removeStep(i)} style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 7, color: '#ff5f5f', cursor: 'pointer', fontSize: 12, padding: '4px 9px' }}>Quitar</button>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{i === 0 ? 'Tras' : 'Luego, tras'}</span>
              <input type="number" min="1" style={{ ...inp, width: 80 }} value={st.value} onChange={e => setStep(i, { value: e.target.value })} />
              <select style={inp} value={st.unit} onChange={e => setStep(i, { unit: e.target.value })}>
                <option value="m">minutos</option><option value="h">horas</option><option value="d">días</option>
              </select>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>de inactividad</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select style={inp} value={st.mode} onChange={e => setStep(i, { mode: e.target.value })}>
                <option value="flow">🔀 Disparar un flujo</option>
                <option value="intelligent">🧠 Inteligente (IA retoma la conversación)</option>
              </select>
              {st.mode === 'flow' && (
                <select style={{ ...inp, minWidth: 220 }} value={st.flowId || ''} onChange={e => setStep(i, { flowId: e.target.value || null })}>
                  <option value="">Flujo de entrada principal (por defecto)</option>
                  {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              )}
            </div>

            {/* Nota opcional (flujo: {{nota}}) · Instrucciones extra (IA) */}
            <div style={{ marginTop: 12 }}>
              <label style={{ ...lbl, marginBottom: 5 }}>
                {st.mode === 'flow' ? 'Nota opcional para el flujo' : 'Instrucciones extra para la IA (opcional)'}
              </label>
              <textarea value={st.instructions} onChange={e => setStep(i, { instructions: e.target.value })} rows={2}
                placeholder={st.mode === 'flow'
                  ? 'Disponible dentro del flujo como {{nota}} (p. ej. motivo del recontacto, oferta del día…)'
                  : 'Ej: ofrécele un 10% de descuento por hoy; recuérdale el envío gratis; tono más directo…'}
                style={{ ...inp, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            {/* En qué vueltas se ejecuta este paso */}
            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>Se ejecuta:</span>
              <select style={inp} value={st.roundsMode} onChange={e => setStep(i, { roundsMode: e.target.value })}>
                <option value="every">en todas las vueltas</option>
                <option value="only">solo en la vuelta</option>
                <option value="from">desde la vuelta</option>
                <option value="list">en vueltas específicas</option>
              </select>
              {(st.roundsMode === 'only' || st.roundsMode === 'from') && <input type="number" min="1" style={{ ...inp, width: 70 }} value={st.roundsN} onChange={e => setStep(i, { roundsN: Math.max(1, Number(e.target.value) || 1) })} />}
              {st.roundsMode === 'list' && <input style={{ ...inp, width: 140 }} value={st.roundsList} onChange={e => setStep(i, { roundsList: e.target.value })} placeholder="ej. 1, 3, 5" />}
            </div>
          </div>
        ))}

        <button onClick={addStep} disabled={steps.length >= 10}
          style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px dashed var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>
          ＋ Agregar recontacto
        </button>

        <div style={card}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            <input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)} style={{ width: 15, height: 15 }} />
            Repetir la secuencia al terminar
          </label>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, marginLeft: 26 }}>
            Si se activa, al completar todos los pasos vuelve a empezar (respetando los tiempos) hasta llegar al máximo. Si no, la secuencia se ejecuta una sola vez. Cada paso puede limitarse a ciertas vueltas con el control “Se ejecuta”.
          </div>
          <label style={lbl}>Máximo de recontactos por conversación</label>
          <input type="number" min="1" max="50" style={{ ...inp, width: 90 }} value={maxPerConversation} onChange={e => setMax(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
        </div>
      </div>

      <button onClick={save} disabled={saving}
        style={{ padding: '11px 20px', borderRadius: 10, border: 'none', cursor: saving ? 'default' : 'pointer', fontSize: 14, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,var(--accent),var(--accent2))', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Guardando…' : 'Guardar configuración'}
      </button>

      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 14, lineHeight: 1.5 }}>
        ℹ Solo se recontacta cuando el <strong>último mensaje fue del agente/IA</strong> y la IA del chat está activa. Si el cliente responde, la secuencia se <strong>reinicia</strong>. No aplica al webchat.
        <br />⚠ En WhatsApp, tras 24 h de inactividad solo se puede re-enganchar con una <strong>plantilla</strong>: por eso el recontacto por defecto dispara el <strong>Flujo de entrada principal</strong> (que puede enviar una plantilla). El modo IA solo entrega dentro de la ventana de 24 h.
      </div>
    </div>
  )
}
