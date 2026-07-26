import { useState, useRef, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { useAuth } from '../../context/AuthContext'
import { crmCopilotAsk } from '../../lib/storage'

// Copiloto de negocio: el dueño pregunta y la IA responde con base en los datos del CRM.
// Historial tipo ChatGPT: cada conversación se guarda en localStorage (por cuenta y
// usuario). A la izquierda se listan los chats y se puede abrir uno nuevo.
const SUGGESTIONS = [
  '¿Cómo van mis ventas?',
  '¿Qué clientes están en riesgo de irse?',
  '¿De qué se quejan mis clientes?',
  '¿Qué debería mejorar esta semana?',
  '¿Cómo está la atención al cliente?',
  '¿Cuánto me cuesta la IA y cuánto automatiza?',
]
const RANGES = [{ id: 7, label: '7 días' }, { id: 30, label: '30 días' }, { id: 90, label: '90 días' }]

// ── Persistencia local del historial ────────────────────────────────────────
const HKEY = (accId, userId) => `avi_copilot_chats_${accId || 'x'}_${userId || 'x'}`
function loadChats(accId, userId) {
  try { const a = JSON.parse(localStorage.getItem(HKEY(accId, userId)) || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}
function saveChats(accId, userId, chats) {
  try { localStorage.setItem(HKEY(accId, userId), JSON.stringify(chats.slice(0, 60))) } catch {}
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
function relTime(ts) {
  if (!ts) return ''
  const d = (Date.now() - ts) / 1000
  if (d < 60) return 'ahora'
  if (d < 3600) return `hace ${Math.floor(d / 60)} min`
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`
  if (d < 604800) return `hace ${Math.floor(d / 86400)} d`
  return new Date(ts).toLocaleDateString('es')
}

export default function CRMCopilotPanel() {
  const { account } = useAccount()
  const { session } = useAuth()
  const userId = session?.id || session?.email || 'x'

  const [chats, setChats] = useState([])          // [{ id, title, days, msgs, createdAt, updatedAt }]
  const [activeId, setActiveId] = useState(null)  // null = chat nuevo sin guardar
  const [msgs, setMsgs] = useState([])            // { role:'user'|'ai', text, error }
  const [days, setDays] = useState(30)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(typeof window !== 'undefined' ? window.innerWidth >= 760 : true)
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  // Cargar historial al entrar / cambiar de cuenta o usuario.
  useEffect(() => {
    const loaded = loadChats(account?.id, userId)
    setChats(loaded)
    setActiveId(null); setMsgs([])
  }, [account?.id, userId])

  // Actualiza el historial partiendo SIEMPRE del estado más reciente (evita
  // lecturas obsoletas dentro del flujo async de ask) y lo persiste.
  function writeChats(updater) {
    setChats(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveChats(account?.id, userId, next)
      return next
    })
  }

  function newChat() { setActiveId(null); setMsgs([]); setInput('') }

  function openChat(id) {
    const c = chats.find(x => x.id === id)
    if (!c) return
    setActiveId(id); setMsgs(c.msgs || []); setDays(c.days || 30); setInput('')
    if (window.innerWidth < 760) setSidebarOpen(false)
  }

  function deleteChat(id, e) {
    e?.stopPropagation()
    if (!confirm('¿Eliminar esta conversación del copiloto?')) return
    writeChats(prev => prev.filter(x => x.id !== id))
    if (activeId === id) newChat()
  }

  // Inserta o actualiza el chat con `chatId`; si no existe lo crea al frente.
  function upsertChat(chatId, patch, createBase) {
    writeChats(prev => prev.some(c => c.id === chatId)
      ? prev.map(c => c.id === chatId ? { ...c, ...patch, updatedAt: Date.now() } : c)
      : [{ id: chatId, createdAt: Date.now(), updatedAt: Date.now(), ...createBase, ...patch }, ...prev])
  }

  async function ask(q) {
    const question = (q ?? input).trim()
    if (!question || busy || !account?.id) return
    const userMsg = { role: 'user', text: question }
    const baseMsgs = [...msgs, userMsg]
    setInput(''); setMsgs(baseMsgs); setBusy(true)

    // Asegura un chat guardado (crea uno si es nuevo).
    const chatId = activeId || uid()
    if (!activeId) setActiveId(chatId)
    const title = question.length > 48 ? question.slice(0, 48) + '…' : question
    upsertChat(chatId, { msgs: baseMsgs, days }, { title })

    try {
      const r = await crmCopilotAsk(account.id, question, days)
      const finalMsgs = [...baseMsgs, { role: 'ai', text: r.answer || 'Sin respuesta.' }]
      setMsgs(finalMsgs)
      upsertChat(chatId, { msgs: finalMsgs, days }, { title })
    } catch (e) {
      const finalMsgs = [...baseMsgs, { role: 'ai', text: '⚠️ ' + (e.message || 'No se pudo responder. Revisa que haya una API key y el Modelo IA de Negocio configurado.'), error: true }]
      setMsgs(finalMsgs)
      upsertChat(chatId, { msgs: finalMsgs, days }, { title })
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

  // ── Barra lateral (historial) ──────────────────────────────────────────────
  const sidebar = (
    <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
        <button onClick={newChat} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px dashed var(--border2)', background: 'var(--bg3)', color: 'var(--text1)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          ✚ Nuevo chat
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {chats.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 12, textAlign: 'center', padding: '20px 8px' }}>Sin conversaciones aún.</div>}
        {chats.map(c => (
          <div key={c.id} onClick={() => openChat(c.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 9px', borderRadius: 9, cursor: 'pointer',
              background: c.id === activeId ? 'var(--accent-dim,rgba(79,168,255,.15))' : 'transparent',
              border: c.id === activeId ? '1px solid var(--accent,#4fa8ff)' : '1px solid transparent',
            }}>
            <span style={{ fontSize: 13 }}>💬</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text1)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title || 'Conversación'}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{relTime(c.updatedAt || c.createdAt)}</div>
            </div>
            <button onClick={e => deleteChat(c.id, e)} title="Eliminar" style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13, padding: 2, flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 10, height: 'calc(100vh - 190px)', minHeight: 420, maxWidth: 1040, margin: '0 auto', padding: '10px 4px' }}>
      {sidebarOpen && sidebar}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <button onClick={() => setSidebarOpen(o => !o)} title={sidebarOpen ? 'Ocultar historial' : 'Mostrar historial'}
              style={{ padding: '7px 10px', fontSize: 14, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}>☰</button>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🤖 Copiloto de negocio</h1>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Pregúntale a tus datos: ventas, clientes, atención, pipeline y citas.</p>
            </div>
          </div>
          <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ padding: '6px 10px', fontSize: 12, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6, flexShrink: 0 }}>
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
    </div>
  )
}
