import { useState, useRef, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { crmCopilotAsk } from '../../lib/storage'

// Copiloto de negocio: el dueño pregunta y la IA responde con base en los datos del CRM.
const SUGGESTIONS = [
  '¿Cómo van mis ventas?',
  '¿Qué clientes están en riesgo de irse?',
  '¿De qué se quejan mis clientes?',
  '¿Qué debería mejorar esta semana?',
  '¿Cómo está la atención al cliente?',
  '¿Cuánto me cuesta la IA y cuánto automatiza?',
]
const RANGES = [{ id: 7, label: '7 días' }, { id: 30, label: '30 días' }, { id: 90, label: '90 días' }]

export default function CRMCopilotPanel() {
  const { account } = useAccount()
  const [days, setDays] = useState(30)
  const [msgs, setMsgs] = useState([])   // { role:'user'|'ai', text }
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  async function ask(q) {
    const question = (q ?? input).trim()
    if (!question || busy || !account?.id) return
    setInput(''); setMsgs(m => [...m, { role: 'user', text: question }]); setBusy(true)
    try {
      const r = await crmCopilotAsk(account.id, question, days)
      setMsgs(m => [...m, { role: 'ai', text: r.answer || 'Sin respuesta.' }])
    } catch (e) {
      setMsgs(m => [...m, { role: 'ai', text: '⚠️ ' + (e.message || 'No se pudo responder. Revisa que haya una API key y el Modelo IA de Negocio configurado.'), error: true }])
    }
    setBusy(false)
  }

  const bubble = (role, error) => ({
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    maxWidth: '85%', padding: '10px 13px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
    background: role === 'user' ? 'var(--accent,#4fa8ff)' : (error ? 'rgba(255,95,95,.1)' : 'var(--bg3)'),
    color: role === 'user' ? '#fff' : 'var(--text1)',
    border: role === 'user' ? 'none' : '1px solid var(--border2)',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 190px)', minHeight: 420, maxWidth: 780, margin: '0 auto', padding: '10px 4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🤖 Copiloto de negocio</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text3)' }}>Pregúntale a tus datos. Responde con base en tu CRM (ventas, clientes, atención, pipeline…).</p>
        </div>
        <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ padding: '6px 10px', fontSize: 12, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }}>
          {RANGES.map(r => <option key={r.id} value={r.id}>Últimos {r.label}</option>)}
        </select>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 2px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12 }}>
        {msgs.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text3)', maxWidth: 460 }}>
            <div style={{ fontSize: 30 }}>💡</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Hazme una pregunta sobre tu negocio. Por ejemplo:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 }}>
              {SUGGESTIONS.map(q => (
                <button key={q} onClick={() => ask(q)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 16, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}>{q}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => <div key={i} style={bubble(m.role, m.error)}>{m.text}</div>)}
        {busy && <div style={bubble('ai')}><span style={{ color: 'var(--text3)' }}>Pensando…</span></div>}
        <div ref={endRef} />
      </div>

      {msgs.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {SUGGESTIONS.slice(0, 4).map(q => <button key={q} onClick={() => ask(q)} disabled={busy} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 14, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text3)', cursor: 'pointer' }}>{q}</button>)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()}
          placeholder="Pregunta sobre tus ventas, clientes, atención…" disabled={busy}
          style={{ flex: 1, padding: '11px 13px', fontSize: 14, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 10 }} />
        <button onClick={() => ask()} disabled={busy || !input.trim()}
          style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--accent,#4fa8ff)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Enviar</button>
      </div>
    </div>
  )
}
