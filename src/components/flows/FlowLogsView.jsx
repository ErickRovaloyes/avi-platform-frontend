import { useState, useEffect, useCallback } from 'react'
import { useAccount } from '../../context/AccountContext'
import { listFlowExecutions, listErrorLog } from '../../lib/storage'

const CHANNEL_ICON = { webchat: '💬', whatsapp: '📱', messenger: '📘', instagram: '📸', test: '🧪' }
const STATUS = {
  success: { label: 'Éxito',   color: '#22d98a', bg: 'rgba(34,217,138,.12)' },
  error:   { label: 'Error',   color: '#ff5f5f', bg: 'rgba(255,95,95,.12)' },
  paused:  { label: 'Pausado', color: '#f5a623', bg: 'rgba(245,166,35,.12)' },
}

function fmt(ts) {
  if (!ts) return ''
  return new Date(Number(ts)).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function FlowLogsView({ mode = 'logs' }) {
  const { account, openConversation } = useAccount()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!account?.id) return
    setLoading(true)
    try {
      const data = mode === 'errors'
        ? await listErrorLog(account.id, { limit: 300 })
        : await listFlowExecutions(account.id, { limit: 300 })
      setRows(data || [])
    } catch { setRows([]) }
    setLoading(false)
  }, [account?.id, mode])

  useEffect(() => { reload() }, [reload])

  const wrap = { padding: 16, maxWidth: 980 }
  const head = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }
  const item = { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }
  const chatBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 12, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }

  return (
    <div style={wrap}>
      <div style={head}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
            {mode === 'errors' ? '🛑 Registro de errores' : '📜 Logs globales de la cuenta'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            {mode === 'errors'
              ? 'Todos los errores ocurridos, con el chat y el momento donde sucedieron.'
              : 'Todas las ejecuciones de flujos (en chats y pruebas), con su chat y momento.'}
          </div>
        </div>
        <button onClick={reload} style={{ ...chatBtn, cursor: 'pointer' }}>↻ Actualizar</button>
      </div>

      {loading && <div style={{ color: 'var(--text2)' }}>Cargando…</div>}
      {!loading && rows.length === 0 && (
        <div style={{ color: 'var(--text3)', padding: 24, textAlign: 'center' }}>
          {mode === 'errors' ? 'Sin errores registrados. 🎉' : 'Aún no hay ejecuciones registradas.'}
        </div>
      )}

      {!loading && rows.map(r => {
        const goChat = () => r.convId && openConversation?.(r.agentId, r.convId)
        if (mode === 'errors') {
          return (
            <div key={r.id} style={item}>
              <span style={{ fontSize: 16 }}>❌</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text)', wordBreak: 'break-word' }}>{r.message || 'Error'}</div>
                {r.detail && <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace', wordBreak: 'break-word', marginTop: 2 }}>{r.detail.slice(0, 240)}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
                  {r.convId && (
                    <button style={chatBtn} onClick={goChat} title="Ir al chat">
                      {CHANNEL_ICON[r.channel] || '💬'} {r.guestName || r.convId} <span style={{ color: 'var(--accent,#4fa8ff)' }}>→ chat</span>
                    </button>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmt(r.ts)}</span>
                  <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>{r.source}</span>
                </div>
              </div>
            </div>
          )
        }
        const st = STATUS[r.status] || STATUS.success
        return (
          <div key={r.id} style={item}>
            <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, border: `1px solid ${st.color}55`, padding: '3px 8px', borderRadius: 8, whiteSpace: 'nowrap' }}>{st.label}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                ⚡ {r.flowName || r.flowId || 'Flujo'}
                {r.error && <span style={{ color: '#ff7676', fontWeight: 400 }}> — {r.error}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
                {r.convId && (
                  <button style={chatBtn} onClick={goChat} title="Ir al chat">
                    {CHANNEL_ICON[r.channel] || '💬'} {r.guestName || r.convId} <span style={{ color: 'var(--accent,#4fa8ff)' }}>→ chat</span>
                  </button>
                )}
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmt(r.startedAt)}</span>
                {r.durationMs != null && <span style={{ fontSize: 11, color: 'var(--text3)' }}>· {r.durationMs}ms</span>}
                {r.trigger && <span style={{ fontSize: 10, color: 'var(--text3)' }}>· {r.trigger}</span>}
                {r.source === 'test' && <span style={{ fontSize: 10, color: '#f5a623' }}>· prueba</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
