import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'

// Supervisión (superadmin): ver los chats privados directos (DMs) del equipo de
// cada cuenta. Solo lectura. Usa los endpoints de teamchat que ya permiten al
// superadmin (dms-overview + mensajes por canal).
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 10 }
const fmt = ts => ts ? new Date(Number(ts)).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

export default function PrivateChatsPanel() {
  const [accounts, setAccounts] = useState([])
  const [accId, setAccId] = useState('')
  const [dms, setDms] = useState(null)
  const [sel, setSel] = useState(null)        // dm seleccionado
  const [messages, setMessages] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { api.get('/api/superadmin/accounts').then(a => setAccounts(a || [])).catch(() => setAccounts([])) }, [])

  const loadDms = useCallback(async (id) => {
    if (!id) { setDms(null); return }
    setLoading(true); setSel(null); setMessages(null)
    try { const r = await api.get(`/api/teamchat/${id}/dms-overview`); setDms(r.dms || []) }
    catch { setDms([]) }
    setLoading(false)
  }, [])

  function pickAccount(id) { setAccId(id); loadDms(id) }

  async function openDm(dm) {
    setSel(dm); setMessages(null)
    try { const r = await api.get(`/api/teamchat/${accId}?channel=${encodeURIComponent(dm.id)}`); setMessages(Array.isArray(r) ? r : []) }
    catch { setMessages([]) }
  }

  const title = dm => (dm.participants || []).map(p => p.name).join('  ↔  ')

  return (
    <div style={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>🔒 Chats privados</h1>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>Supervisión de los mensajes directos (DM) entre miembros del equipo de cada cuenta. Solo lectura.</p>
      </div>

      <div style={{ marginBottom: 12 }}>
        <select value={accId} onChange={e => pickAccount(e.target.value)}
          style={{ padding: '9px 12px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontSize: 13.5, minWidth: 280 }}>
          <option value="">— Elige una cuenta —</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {!accId ? (
        <div style={{ color: 'var(--text3)', fontSize: 14, padding: 30, textAlign: 'center' }}>Selecciona una cuenta para ver sus chats privados.</div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '340px 1fr', gap: 14, minHeight: 0 }}>
          {/* Lista de DMs */}
          <div style={{ overflowY: 'auto', paddingRight: 4 }}>
            {loading ? <div style={{ color: 'var(--text3)', padding: 16 }}>Cargando…</div>
              : (dms || []).length === 0 ? <div style={{ color: 'var(--text3)', padding: 16, fontSize: 13 }}>Esta cuenta no tiene chats privados.</div>
                : dms.map(dm => (
                  <button key={dm.id} onClick={() => openDm(dm)}
                    style={{ ...card, width: '100%', textAlign: 'left', cursor: 'pointer', borderColor: sel?.id === dm.id ? 'var(--accent)' : 'var(--border)', display: 'block' }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 3 }}>{title(dm)}</div>
                    {dm.lastMessage
                      ? <div style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ color: 'var(--text3)' }}>{dm.lastMessage.authorName}:</span> {dm.lastMessage.content || '(adjunto)'}
                        </div>
                      : <div style={{ fontSize: 12, color: 'var(--text3)' }}>Sin mensajes</div>}
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{dm.messageCount} mensajes{dm.lastMessage ? ` · ${fmt(dm.lastMessage.ts)}` : ''}</div>
                  </button>
                ))}
          </div>

          {/* Hilo */}
          <div style={{ ...card, marginBottom: 0, overflowY: 'auto', minHeight: 0 }}>
            {!sel ? (
              <div style={{ color: 'var(--text3)', fontSize: 13, padding: 16, textAlign: 'center' }}>Elige un chat para leer la conversación.</div>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>{title(sel)}</div>
                {messages === null ? <div style={{ color: 'var(--text3)' }}>Cargando…</div>
                  : messages.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>Sin mensajes.</div>
                    : messages.map(m => (
                      <div key={m.id} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 2 }}>{m.authorName} · {fmt(m.ts)}</div>
                        <div style={{ fontSize: 13.5, color: 'var(--text)', background: 'var(--bg3)', borderRadius: 8, padding: '7px 11px', display: 'inline-block', maxWidth: '85%' }}>
                          {m.content || (m.media ? '📎 Adjunto' : '')}
                        </div>
                      </div>
                    ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
