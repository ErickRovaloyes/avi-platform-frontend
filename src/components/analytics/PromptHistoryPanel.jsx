import { useState, useEffect, useMemo } from 'react'
import { useAccount } from '../../context/AccountContext'
import { listPromptHistory, getPromptHistoryEntry, restoreBackup } from '../../lib/storage'
import { computeDiff } from '../../lib/diffUtils'
import s from './AnalyticsPanels.module.css'

const CATEGORY = {
  basic:   { name: 'Básico',   color: '#22d98a', icon: '🟢' },
  medium:  { name: 'Medio',    color: '#f5a623', icon: '🟡' },
  complex: { name: 'Complejo', color: '#ff5f5f', icon: '🔴' },
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(Number(ts)).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtNum(n) { return Number(n || 0).toLocaleString() }
function fmtUsd(n) { return '$' + Number(n || 0).toFixed(5) }

export default function PromptHistoryPanel() {
  const { account, visibleAgents } = useAccount()
  const [agentId, setAgentId] = useState('')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [openId, setOpenId]   = useState(null)
  const [detail, setDetail]   = useState(null) // full entry with content
  const [detailLoading, setDetailLoading] = useState(false)
  const [restoringId, setRestoringId] = useState(null)
  const [toast, setToast]     = useState('')

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2500) }

  useEffect(() => {
    if (!account?.id) return
    setLoading(true); setError('')
    listPromptHistory(account.id, { agentId: agentId || undefined, limit: 100 })
      .then(setEntries).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [account?.id, agentId])

  async function openDetail(entryId) {
    if (openId === entryId) { setOpenId(null); setDetail(null); return }
    setOpenId(entryId)
    setDetail(null)
    setDetailLoading(true)
    try {
      const data = await getPromptHistoryEntry(account.id, entryId)
      setDetail(data)
    } catch (e) { flash('Error al cargar detalle: ' + e.message) }
    setDetailLoading(false)
  }

  async function handleRestoreBackup(backupId, entryAgentId) {
    if (!backupId) return
    if (!confirm('¿Restaurar el estado del agente a este backup? Se perderán los cambios posteriores.')) return
    setRestoringId(backupId)
    try {
      await restoreBackup(account.id, entryAgentId, backupId)
      flash('✓ Backup restaurado — recarga la página para ver los cambios')
    } catch (e) { flash('Error al restaurar: ' + e.message) }
    setRestoringId(null)
  }

  return (
    <div className={s.panel}>
      {toast && <div style={{ position: 'fixed', top: 16, right: 16, background: 'var(--surface2)', border: '1px solid var(--border)', padding: '10px 14px', borderRadius: 8, fontSize: 13, zIndex: 1000, boxShadow: '0 4px 16px rgba(0,0,0,.4)' }}>{toast}</div>}

      <div className={s.header}>
        <div>
          <h1 className={s.title}>Historial de cambios</h1>
          <p className={s.sub}>Registro completo de cambios aplicados a los prompts. Cada cambio incluye un flash backup automático.</p>
        </div>
      </div>

      <div className={s.filters}>
        <div className={s.filterGroup}>
          <label>Agente</label>
          <select value={agentId} onChange={e => setAgentId(e.target.value)}>
            <option value="">Todos</option>
            {visibleAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <span style={{ marginLeft: 'auto', alignSelf: 'flex-end', fontSize: 11, color: 'var(--text3)' }}>
          {entries.length} cambio{entries.length === 1 ? '' : 's'} registrado{entries.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && <div className={s.error}>{error}</div>}
      {loading && <div className={s.empty}>Cargando historial...</div>}
      {!loading && entries.length === 0 && (
        <div className={s.card}>
          <div className={s.empty}>
            Sin cambios todavía. Cuando uses el <strong>Agente de Cambios</strong> sobre un prompt, los cambios aparecerán aquí.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(e => {
          const cat = CATEGORY[e.category] || CATEGORY.medium
          const isOpen = openId === e.id
          return (
            <div key={e.id} className={s.card} style={{ padding: 0 }}>
              {/* Row header (always visible) */}
              <button
                onClick={() => openDetail(e.id)}
                style={{
                  all: 'unset', cursor: 'pointer', width: '100%',
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto auto', gap: 12, alignItems: 'center',
                  padding: '12px 16px',
                }}
              >
                <span style={{ color: cat.color, fontSize: 18 }}>{cat.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.instruction || '(sin descripción)'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    {e.promptName ? <span>📝 {e.promptName} · </span> : null}
                    👤 <strong style={{ color: 'var(--text2)' }}>{e.userName || '—'}</strong>
                    {' · '}{fmtDate(e.ts)}
                    {e.wasEditedManually && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>· editado a mano</span>}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: cat.color, fontWeight: 600, padding: '2px 8px', background: cat.color + '15', borderRadius: 20 }}>{cat.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace' }}>{fmtNum(e.totalTokens)} tk</span>
                <span style={{ fontSize: 11, color: '#22d98a', fontFamily: 'monospace', fontWeight: 600 }}>{fmtUsd(e.costUsd)}</span>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border)', padding: 16, background: 'var(--surface1)' }}>
                  {detailLoading && <div className={s.empty}>Cargando detalle...</div>}
                  {detail && detail.id === e.id && (
                    <>
                      {/* Meta strip */}
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text3)', marginBottom: 14 }}>
                        <span>🤖 <strong style={{ color: 'var(--text2)' }}>{detail.model}</strong> · {detail.provider}</span>
                        <span>📥 input: {fmtNum(detail.inputTokens)} tk</span>
                        <span>📤 output: {fmtNum(detail.outputTokens)} tk</span>
                        <span>💸 {fmtUsd(detail.costUsd)}</span>
                        {detail.backupId && (
                          <span style={{ color: '#f5a623' }}>⚡ Flash backup: <code style={{ fontFamily: 'monospace', fontSize: 10 }}>{detail.backupId}</code></span>
                        )}
                      </div>

                      <HistoryDiff oldText={detail.oldContent} newText={detail.newContent} />

                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                        {detail.backupId && (
                          <button
                            onClick={() => handleRestoreBackup(detail.backupId, detail.agentId)}
                            disabled={restoringId === detail.backupId}
                            style={{
                              padding: '8px 14px', background: '#f5a623', color: '#fff', border: 'none',
                              borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600,
                            }}
                          >
                            {restoringId === detail.backupId ? 'Restaurando...' : '↺ Restaurar al estado previo (flash backup)'}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Side-by-side diff identical in spirit to the one inside ChangeAgentPanel
function HistoryDiff({ oldText, newText }) {
  const [mode, setMode] = useState('split')
  const ops  = useMemo(() => computeDiff(oldText || '', newText || ''), [oldText, newText])
  const stats = useMemo(() => {
    let removed = 0, added = 0
    for (const o of ops) {
      if (o.op === 'remove') removed += o.text.length
      else if (o.op === 'add') added += o.text.length
    }
    return { removed, added }
  }, [ops])

  const oldNodes = ops.flatMap((o, i) => {
    if (o.op === 'add') return []
    if (o.op === 'remove') return [<span key={'o' + i} style={diffRemoved}>{o.text}</span>]
    return [<span key={'o' + i}>{o.text}</span>]
  })
  const newNodes = ops.flatMap((o, i) => {
    if (o.op === 'remove') return []
    if (o.op === 'add') return [<span key={'n' + i} style={diffAdded}>{o.text}</span>]
    return [<span key={'n' + i}>{o.text}</span>]
  })
  const unifiedNodes = ops.map((o, i) => {
    if (o.op === 'remove') return <span key={i} style={diffRemoved}>{o.text}</span>
    if (o.op === 'add')    return <span key={i} style={diffAdded}>{o.text}</span>
    return <span key={i} style={{ color: 'var(--text2)', opacity: 0.85 }}>{o.text}</span>
  })

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '8px 12px', background: 'var(--surface3, #1c1f2b)', borderBottom: '1px solid var(--border)',
        fontSize: 12, fontWeight: 600,
      }}>
        <span>📝 Comparación</span>
        <div style={{ display: 'inline-flex', gap: 10, fontFamily: 'monospace', fontSize: 11 }}>
          <span style={{ color: '#ff6b6b' }}>− {stats.removed.toLocaleString()}</span>
          <span style={{ color: '#22d98a' }}>+ {stats.added.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 6, padding: 2 }}>
          {['split', 'unified', 'new-only', 'old-only'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{
                background: mode === m ? 'var(--accent)' : 'none', border: 'none',
                padding: '3px 9px', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                color: mode === m ? '#fff' : 'var(--text3)', borderRadius: 4,
              }}>
              {m === 'split' ? 'Lado a lado' : m === 'unified' ? 'Unificado' : m === 'new-only' ? 'Nuevo' : 'Anterior'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'split' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#ff6b6b', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
              − Versión anterior ({(oldText || '').length} chars)
            </div>
            <pre style={{ ...preStyle, borderRight: '1px solid var(--border)' }}>
              {oldNodes.length ? oldNodes : <span style={{ color: 'var(--text3)' }}>(vacío)</span>}
            </pre>
          </div>
          <div>
            <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#22d98a', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              + Versión aplicada ({(newText || '').length} chars)
            </div>
            <pre style={preStyle}>
              {newNodes.length ? newNodes : <span style={{ color: 'var(--text3)' }}>(vacío)</span>}
            </pre>
          </div>
        </div>
      )}

      {mode === 'unified'  && <pre style={preStyle}>{unifiedNodes}</pre>}
      {mode === 'new-only' && <pre style={preStyle}>{newText}</pre>}
      {mode === 'old-only' && <pre style={preStyle}>{oldText}</pre>}
    </div>
  )
}

const preStyle = {
  margin: 0, padding: '12px 14px', fontSize: 12,
  fontFamily: 'ui-monospace, monospace', lineHeight: 1.55,
  color: 'var(--text1)', background: 'var(--surface1)',
  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  maxHeight: 420, overflowY: 'auto', minHeight: 120,
}
const diffRemoved = {
  background: 'rgba(255, 95, 95, 0.22)', color: '#ffb3b3',
  textDecoration: 'line-through', textDecorationColor: 'rgba(255,95,95,.55)',
  borderRadius: 2, padding: '0 2px',
}
const diffAdded = {
  background: 'rgba(34, 217, 138, 0.22)', color: '#a8f0cb',
  borderRadius: 2, padding: '0 2px',
}
