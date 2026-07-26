import { useState, useRef, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { useAuth } from '../../context/AuthContext'
import { crmCopilotAsk, platformAssistantAsk } from '../../lib/storage'
import { getCopilotWidgetEnabled, onCopilotWidgetPrefChange } from '../../lib/copilotWidgetPref'

// Copiloto: una MUESCA en el lateral de la pantalla (arrastrable a izquierda/derecha y
// en vertical). Al hacer clic se despliega el chat con 2 pestañas:
//  · Negocio → copiloto del CRM con los datos de la cuenta (crmCopilotAsk).
//  · Ayuda   → asistente de la plataforma: cómo usar AVI (platformAssistantAsk).
const RANGES = [{ id: 7, label: '7 días' }, { id: 30, label: '30 días' }, { id: 90, label: '90 días' }]
const NEG_SUGG = ['¿Cómo van mis ventas?', '¿Qué clientes están en riesgo?', '¿Qué debería mejorar esta semana?']
const AYU_SUGG = ['¿Cómo conecto WhatsApp?', '¿Cómo creo un flujo?', '¿Cómo agendo una cita?']

const POS_KEY = 'avi_copilot_notch'
function loadPos() {
  try { const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); if (p && (p.side === 'left' || p.side === 'right')) return p } catch {}
  return { side: 'right', top: (typeof window !== 'undefined' ? window.innerHeight * 0.5 : 300) }
}

export default function CopilotWidget() {
  const { account } = useAccount()
  const { session } = useAuth()
  const userId = session?.id || session?.email || 'x'
  const [enabled, setEnabled] = useState(() => getCopilotWidgetEnabled(userId))
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('negocio')
  const [days, setDays] = useState(30)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msgsNeg, setMsgsNeg] = useState([])
  const [msgsAyu, setMsgsAyu] = useState([])
  const [pos, setPos] = useState(loadPos)
  const posRef = useRef(pos)
  const dragRef = useRef({ dragging: false, moved: false, startY: 0, startTop: 0 })
  const endRef = useRef(null)

  useEffect(() => setEnabled(getCopilotWidgetEnabled(userId)), [userId])
  useEffect(() => onCopilotWidgetPrefChange(() => setEnabled(getCopilotWidgetEnabled(userId))), [userId])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgsNeg, msgsAyu, busy, tab, open])

  const isNeg = tab === 'negocio'
  const msgs = isNeg ? msgsNeg : msgsAyu
  const setMsgs = isNeg ? setMsgsNeg : setMsgsAyu
  const suggestions = isNeg ? NEG_SUGG : AYU_SUGG

  async function ask(q) {
    const question = (q ?? input).trim()
    if (!question || busy || !account?.id) return
    setInput(''); setMsgs(m => [...m, { role: 'user', text: question }]); setBusy(true)
    try {
      const r = isNeg ? await crmCopilotAsk(account.id, question, days) : await platformAssistantAsk(account.id, question)
      setMsgs(m => [...m, { role: 'ai', text: r.answer || 'Sin respuesta.' }])
    } catch (e) {
      setMsgs(m => [...m, { role: 'ai', text: '⚠️ ' + (e?.message || 'No se pudo responder.'), error: true }])
    }
    setBusy(false)
  }

  // ── Arrastre de la muesca (pointer capture: fiable dentro y fuera del elemento) ──
  function onDown(e) {
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
    dragRef.current = { dragging: true, moved: false, startY: e.clientY, startTop: pos.top }
  }
  function onMove(e) {
    const d = dragRef.current; if (!d.dragging) return
    if (Math.abs(e.clientY - d.startY) > 5) d.moved = true
    const top = Math.max(8, Math.min(window.innerHeight - 70, d.startTop + (e.clientY - d.startY)))
    const side = e.clientX < window.innerWidth / 2 ? 'left' : 'right'
    const next = { side, top }
    posRef.current = next; setPos(next)
  }
  function onUp(e) {
    const d = dragRef.current; d.dragging = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    if (!d.moved) setOpen(true)
    else { try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)) } catch {} }
  }

  if (!enabled || !account?.id) return null

  const bubble = (role, error) => ({
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: '9px 12px', borderRadius: 12,
    fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
    background: role === 'user' ? 'var(--accent,#4fa8ff)' : (error ? 'rgba(255,95,95,.12)' : 'var(--bg3)'),
    color: role === 'user' ? '#fff' : 'var(--text1)', border: role === 'user' ? 'none' : '1px solid var(--border2)',
  })
  const tabBtn = active => ({
    flex: 1, padding: '9px 0', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: 'none',
    background: active ? 'var(--bg3)' : 'transparent', color: active ? 'var(--text1)' : 'var(--text3)',
    borderBottom: active ? '2px solid var(--accent,#4fa8ff)' : '2px solid transparent',
  })

  // ── Panel del chat (abierto), anclado al lado elegido ──
  if (open) {
    return (
      <div style={{ position: 'fixed', [pos.side]: 12, bottom: 12, zIndex: 900, width: 'min(370px, calc(100vw - 24px))', height: 'min(540px, calc(100vh - 90px))', display: 'flex', flexDirection: 'column', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <strong style={{ fontSize: 13.5 }}>🤖 Copiloto</strong>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isNeg && (
              <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: 'auto', padding: '4px 6px', fontSize: 11, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }}>
                {RANGES.map(r => <option key={r.id} value={r.id}>Últ. {r.label}</option>)}
              </select>
            )}
            <button onClick={() => setOpen(false)} title="Minimizar" style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          <button style={tabBtn(isNeg)} onClick={() => setTab('negocio')}>🤖 Negocio</button>
          <button style={tabBtn(!isNeg)} onClick={() => setTab('ayuda')}>❓ Ayuda</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 10 }}>
          {msgs.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text3)' }}>
              <div style={{ fontSize: 26 }}>{isNeg ? '💡' : '❓'}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{isNeg ? 'Pregúntale a tus datos del negocio.' : 'Pregúntame cómo usar la plataforma.'}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 10 }}>
                {suggestions.map(q => <button key={q} onClick={() => ask(q)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 14, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}>{q}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => <div key={i} style={bubble(m.role, m.error)}>{m.text}</div>)}
          {busy && <div style={bubble('ai')}><span style={{ color: 'var(--text3)' }}>Pensando…</span></div>}
          <div ref={endRef} />
        </div>
        <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--border)' }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()}
            placeholder={isNeg ? 'Pregunta sobre tu negocio…' : 'Pregunta sobre la plataforma…'} disabled={busy}
            style={{ flex: 1, padding: '9px 11px', fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 10 }} />
          <button onClick={() => ask()} disabled={busy || !input.trim()} style={{ padding: '0 14px', borderRadius: 10, border: 'none', background: 'var(--accent,#4fa8ff)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>↑</button>
        </div>
      </div>
    )
  }

  // ── Muesca (cerrado): pestaña arrastrable en el borde ──
  const notchStyle = {
    position: 'fixed', top: pos.top, [pos.side]: 0, zIndex: 900,
    width: 30, height: 58, cursor: 'grab', touchAction: 'none', userSelect: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff',
    background: 'linear-gradient(135deg, var(--accent,#4fa8ff), var(--accent2,#7c6fff))',
    boxShadow: '0 4px 16px rgba(0,0,0,.35)',
    borderRadius: pos.side === 'right' ? '12px 0 0 12px' : '0 12px 12px 0',
  }
  return (
    <div style={notchStyle} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
      title="Copiloto — clic para abrir, arrastra para mover">
      🤖
    </div>
  )
}
