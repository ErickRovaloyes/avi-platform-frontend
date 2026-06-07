import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { readConvos } from '../../lib/storage'
import s from './ConvSidePanel.module.css'

export default function ConvSidePanel({ conv: initialConv, agentId, onClose }) {
  const { account, setLocalVar, setConvoLabels, reloadConvos } = useAccount()
  const [activeTab, setActiveTab] = useState('info')
  // Live conv — refreshed every second to show debug updates in real time
  const [liveConv, setLiveConv] = useState(initialConv)

  useEffect(() => {
    setLiveConv(initialConv)
  }, [initialConv?.messages?.length, initialConv?.labels?.join(), initialConv?.localVars])

  // Poll debugLog separately so it updates even when main conv polling hasn't triggered
  useEffect(() => {
    if (activeTab !== 'debug') return
    const interval = setInterval(() => {
      const convos = readConvos(account?.id, agentId)
      const fresh = convos.find(c => c.id === initialConv?.id)
      if (fresh && (fresh.debugLog?.length || 0) !== (liveConv.debugLog?.length || 0)) {
        setLiveConv(fresh)
      }
    }, 800)
    return () => clearInterval(interval)
  }, [activeTab, agentId, initialConv?.id, account?.id, liveConv.debugLog?.length])

  const conv = liveConv
  if (!conv) return null

  const variables = account?.variables || []
  const labels = account?.labels || []
  const pipelines = account?.pipelines || []
  const localVars = conv.localVars || {}
  const debugLog = conv.debugLog || []

  const localVariables = variables.filter(v => v.type === 'local')
  const globalVariables = variables.filter(v => v.type === 'global')

  function handleVarChange(varId, value) {
    setLocalVar(agentId, conv.id, varId, value)
  }

  function toggleLabel(labelId) {
    const cur = conv.labels || []
    setConvoLabels(agentId, conv.id, cur.includes(labelId)
      ? cur.filter(l => l !== labelId)
      : [...cur, labelId])
  }

  const convCards = (conv.pipelineCards || []).map(pc => {
    const pipe = pipelines.find(p => p.id === pc.pipelineId)
    const card = pipe?.cards?.find(c => c.id === pc.cardId)
    if (!card || !pipe) return null
    const stage = pipe.stages?.find(st => st.id === card.stageId)
    return { ...card, pipelineName: pipe.name, stageName: stage?.name, stageColor: stage?.color }
  }).filter(Boolean)

  const DEBUG_META = {
    tool_call:    { icon: '🔧', color: '#f5a623', label: 'Tool Call' },
    tool_result:  { icon: '✅', color: '#22d98a', label: 'Resultado' },
    ai_response:  { icon: '🤖', color: '#7c6fff', label: 'Respuesta IA' },
    error:        { icon: '❌', color: '#ff5f5f', label: 'Error' },
    system:       { icon: 'ℹ️', color: '#4fa8ff', label: 'Sistema' },
    variable_set: { icon: '📝', color: '#2dd4c8', label: 'Variable' },
    flow_run:     { icon: '⚡', color: '#ff6eb4', label: 'Flujo' },
  }

  const TABS = [
    { id: 'info', label: 'Info' },
    { id: 'variables', label: 'Variables' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'labels', label: 'Etiquetas' },
    { id: 'debug', label: `🐛 Debug${debugLog.length > 0 ? ` (${debugLog.length})` : ''}` },
  ]

  return (
    <div className={s.panel}>
      <div className={s.panelHeader}>
        <div className={s.userSection}>
          <div className={s.userAvatar}>{conv.initials}</div>
          <div>
            <div className={s.userName}>{conv.guestName}</div>
            <div className={s.userSub}>ID: #{conv.guestId}</div>
          </div>
        </div>
        <button className={s.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div className={s.tabs}>
        {TABS.map(t => (
          <button key={t.id} className={`${s.tab} ${activeTab === t.id ? s.tabActive : ''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={s.body}>

        {/* ── Info ── */}
        {activeTab === 'info' && (
          <div className={s.section}>
            <div className={s.sTitle}>Información del usuario</div>
            {[
              ['Nombre', conv.guestName],
              ['ID', `#${conv.guestId}`],
              ['Link', conv.linkId],
              ['Mensajes', conv.messages?.length || 0],
              ['Creado', new Date(conv.createdAt).toLocaleString('es')],
              ['IA activa', conv.aiEnabled !== false ? '● Activa' : '○ Desactivada'],
            ].map(([k, v]) => (
              <div key={k} className={s.infoRow}>
                <span className={s.infoKey}>{k}</span>
                <span className={s.infoVal} style={k === 'IA activa' ? { color: conv.aiEnabled !== false ? 'var(--green)' : 'var(--red)' } : {}}>{v}</span>
              </div>
            ))}
            {(conv.labels || []).length > 0 && (
              <div className={s.infoRow}>
                <span className={s.infoKey}>Etiquetas</span>
                <div className={s.labelChips}>
                  {(conv.labels || []).map(lId => {
                    const l = labels.find(x => x.id === lId)
                    return l ? <span key={lId} className={s.labelChip} style={{ background: l.color + '22', color: l.color, borderColor: l.color + '55' }}>{l.name}</span> : null
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Variables ── */}
        {activeTab === 'variables' && (
          <div>
            <div className={s.section}>
              <div className={s.sTitle}>Variables Locales</div>
              {localVariables.length === 0 && <div className={s.empty}>Sin variables locales</div>}
              {localVariables.map(v => (
                <div key={v.id} className={s.varRow}>
                  <div className={s.varMeta}>
                    <code className={s.varName}>{`{{${v.name}}}`}</code>
                    {v.isSystem && <span className={s.systemTag}>sistema</span>}
                    <span className={s.varDesc}>{v.description}</span>
                  </div>
                  <input
                    className={s.varInput}
                    value={localVars[v.id] ?? v.defaultValue ?? ''}
                    onChange={e => handleVarChange(v.id, e.target.value)}
                    placeholder={v.defaultValue || 'vacío'}
                  />
                </div>
              ))}
            </div>
            <div className={s.section}>
              <div className={s.sTitle}>Variables Globales</div>
              {globalVariables.length === 0 && <div className={s.empty}>Sin variables globales</div>}
              {globalVariables.map(v => (
                <div key={v.id} className={s.varRow}>
                  <div className={s.varMeta}>
                    <code className={s.varName}>{`{{${v.name}}}`}</code>
                    <span className={s.varDesc}>{v.description}</span>
                  </div>
                  <div className={s.globalRow}>
                    <span className={s.globalVal}>{v.defaultValue || <em style={{ color: 'var(--text3)' }}>vacío</em>}</span>
                    <span className={s.globalNote}>global</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Pipeline ── */}
        {activeTab === 'pipeline' && (
          <div className={s.section}>
            <div className={s.sTitle}>Pipelines</div>
            {convCards.length === 0 && <div className={s.empty}>No está en ningún pipeline.<br />Usa el botón 📊 en el chat.</div>}
            {convCards.map(card => (
              <div key={card.id} className={s.pipeCard}>
                <div className={s.pipeCardTop}>
                  <span className={s.pipeCardTitle}>{card.title}</span>
                  <span className={s.pipeCardPipe}>{card.pipelineName}</span>
                </div>
                {card.stageName && (
                  <span className={s.pipeCardStage} style={{ background: card.stageColor + '22', color: card.stageColor, borderColor: card.stageColor + '55' }}>
                    {card.stageName}
                  </span>
                )}
                {card.value && <span className={s.pipeCardValue}>${card.value}</span>}
              </div>
            ))}
          </div>
        )}

        {/* ── Labels ── */}
        {activeTab === 'labels' && (
          <div className={s.section}>
            <div className={s.sTitle}>Etiquetas CRM</div>
            {labels.length === 0 && <div className={s.empty}>Sin etiquetas configuradas</div>}
            {labels.map(l => {
              const active = (conv.labels || []).includes(l.id)
              return (
                <button key={l.id}
                  className={`${s.labelToggle} ${active ? s.labelToggleActive : ''}`}
                  style={active ? { background: l.color + '22', color: l.color, borderColor: l.color + '66' } : {}}
                  onClick={() => toggleLabel(l.id)}>
                  <span className={s.lDot} style={{ background: l.color }} />
                  {l.name}
                  {active && <span className={s.lCheck}>✓</span>}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Debug ── */}
        {activeTab === 'debug' && (
          <div className={s.debugSection}>
            <div className={s.sTitle}>
              Debug Log — {debugLog.length} entradas
              {debugLog.length > 0 && (
                <span className={s.liveIndicator}>● live</span>
              )}
            </div>
            {debugLog.length === 0 && (
              <div className={s.empty}>
                Sin entradas todavía.<br />
                Las acciones del agente IA, herramientas y flujos aparecerán aquí en tiempo real.
              </div>
            )}
            <div className={s.debugList}>
              {[...debugLog].reverse().map((entry, i) => {
                const meta = DEBUG_META[entry.type] || { icon: '•', color: 'var(--text2)', label: entry.type }
                return (
                  <div key={i} className={s.debugEntry} style={{ borderLeftColor: meta.color }}>
                    <div className={s.debugEntryHeader}>
                      <span className={s.debugIcon}>{meta.icon}</span>
                      <span className={s.debugType} style={{ color: meta.color }}>{meta.label}</span>
                      <span className={s.debugTime}>{new Date(entry.ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                    {entry.title && <div className={s.debugTitle}>{entry.title}</div>}
                    {entry.detail && (
                      <pre className={s.debugDetail}>
                        {typeof entry.detail === 'object'
                          ? JSON.stringify(entry.detail, null, 2)
                          : String(entry.detail)}
                      </pre>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
