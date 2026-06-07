import { useState, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAccount } from '../../context/AccountContext'
import { chat, detectProvider } from '../../lib/aiClient'
import { api } from '../../lib/api'
import { recordTokenUsage } from '../../lib/storage'
import { computeDiff } from '../../lib/diffUtils'
import s from './ChangeAgentPanel.module.css'

const CATEGORY_LABELS = {
  basic:   { name: 'Básico',   color: '#22d98a', icon: '🟢' },
  medium:  { name: 'Medio',    color: '#f5a623', icon: '🟡' },
  complex: { name: 'Complejo', color: '#ff5f5f', icon: '🔴' },
}

const CHANGE_AGENT_SYSTEM = (currentPrompt) => `Eres un experto en prompt engineering para agentes de IA conversacionales de servicio al cliente.

Tu tarea es ayudar al usuario a modificar el system prompt de su agente de IA. El usuario te describirá en lenguaje natural los cambios que quiere realizar.

El system prompt ACTUAL del agente es:
"""
${currentPrompt}
"""

Responde SIEMPRE con este formato exacto:
1. Una o dos líneas explicando brevemente qué cambios realizaste.
2. El prompt completo y modificado entre las etiquetas <prompt> y </prompt>.

Reglas importantes:
- Mantén el idioma y estilo del prompt original.
- Incluye TODO el prompt modificado (no solo las partes cambiadas).
- Si el cambio solicitado no es claro, interpreta la intención más probable.
- No añadas comentarios dentro del prompt (entre <prompt></prompt>).`

export default function ChangeAgentPanel({ agentId, onClose }) {
  const { session } = useAuth()
  const { account, updatePrompt, setActivePrompt, getChangeAgentInfo, useChangeAgentSlot, getEffectiveApiKey } = useAccount()
  const agent = account?.agents?.find(a => a.id === agentId)
  const activePrompt = agent?.prompts?.find(p => p.isActive)

  const [selectedPromptId, setSelectedPromptId] = useState(() => activePrompt?.id || null)
  const selectedPrompt = agent?.prompts?.find(p => p.id === selectedPromptId) || activePrompt

  function handlePromptChange(newId) {
    if (newId === selectedPromptId) return
    setSelectedPromptId(newId)
    setMessages([])
    setProposedPrompt(null)
    setApplied(false)
    setPendingAnalysis(null)
    setInput('')
    setAggUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, category: null, instruction: '' })
  }

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [messages, setMessages] = useState([])
  const [proposedPrompt, setProposedPrompt] = useState(null)
  const [applied, setApplied] = useState(false)
  const [pendingAnalysis, setPendingAnalysis] = useState(null) // { category, estimatedTokens, reason, instruction }
  // Bookkeeping for history: aggregated across all iterations of one proposal
  const [aggUsage, setAggUsage] = useState({ promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, category: null, instruction: '' })

  const caInfo = getChangeAgentInfo()
  // Provider is derived from the model the super admin configured.
  // Falls back to openai if the model name is unknown.
  const caProvider = detectProvider(caInfo.model || 'gpt-4o-mini')

  const prompts = agent?.prompts || []

  if (prompts.length === 0) {
    return (
      <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={s.panel}>
          <div className={s.header}>
            <div className={s.headerTitle}>🤖 Agente de Cambios</div>
            <button className={s.closeBtn} onClick={onClose}>✕</button>
          </div>
          <div className={s.noPrompt}>No hay prompts creados. Crea al menos un prompt en el panel de Prompts.</div>
        </div>
      </div>
    )
  }

  // ── Step 1: pre-flight analysis (classify + REAL token count) ─────────────
  async function analyze() {
    if (!input.trim() || analyzing || loading) return
    const userText = input.trim()
    setAnalyzing(true)
    try {
      const result = await api.post(`/api/accounts/${account.id}/change-agent/classify`, {
        instruction: userText,
        currentPromptText: selectedPrompt.content,
        currentPromptLength: selectedPrompt.content.length,
      })
      setPendingAnalysis({
        instruction: userText,
        category: result.category,
        estimatedTokens: result.estimatedTokens,
        estimatedCostUsd: result.estimatedCostUsd,
        inputTokens: result.inputTokens,
        estimatedOutputTokens: result.estimatedOutputTokens,
        tokenizer: result.tokenizer,
        model: result.model,
        provider: result.provider,
        reason: result.reason || '',
      })
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: `Error al analizar: ${err.message}` }])
    }
    setAnalyzing(false)
  }

  // ── Step 2: user confirms — execute the actual change ─────────────────────
  async function executeChange() {
    if (!pendingAnalysis) return
    const { instruction, category, estimatedTokens, estimatedCostUsd } = pendingAnalysis
    setPendingAnalysis(null)
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: instruction }])
    setLoading(true)
    setProposedPrompt(null)
    setApplied(false)
    // Reset bookkeeping for this proposal
    setAggUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, category, instruction })

    const apiKey = getEffectiveApiKey(caProvider)
    if (!apiKey) {
      setMessages(prev => [...prev, { role: 'ai', text: `Se requiere una API Key de ${caProvider} configurada (en la cuenta o por defecto en el super admin).` }])
      setLoading(false)
      return
    }

    try {
      await callChangeAgent(instruction, pendingAnalysis?.isRefinement || false)
      // Discount tokens from the chosen category pool
      useChangeAgentSlot(category, estimatedTokens)
      // Track cost for the upcoming history entry
      setAggUsage(prev => ({ ...prev, costUsd: (prev.costUsd || 0) + (estimatedCostUsd || 0) }))
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: `Error: ${err.message}` }])
    }
    setLoading(false)
  }

  // Shared call to the Change Agent — used both for the initial change AND for refinements
  async function callChangeAgent(userInstruction, isRefinement = false) {
    const apiKey = getEffectiveApiKey(caProvider)
    if (!apiKey) throw new Error(`Sin API Key de ${caProvider}`)
    const currentContent = isRefinement && proposedPrompt ? proposedPrompt : selectedPrompt.content
    const response = await chat({
      provider: caProvider,
      model: caInfo.model,
      apiKey,
      messages: [
        { role: 'system', content: CHANGE_AGENT_SYSTEM(currentContent) },
        ...messages.filter(m => m.role !== 'ai' || !m.isProposal).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
        { role: 'user', content: userInstruction },
      ],
      maxTokens: 4096,
      temperature: 0.4,
      onUsage: usage => {
        recordTokenUsage(account.id, {
          agentId, conversationId: null,
          provider: caProvider, model: caInfo.model,
          promptTokens: usage.promptTokens, completionTokens: usage.completionTokens,
          source: 'change-agent',
        })
        setAggUsage(prev => ({
          ...prev,
          promptTokens: prev.promptTokens + (usage.promptTokens || 0),
          completionTokens: prev.completionTokens + (usage.completionTokens || 0),
          totalTokens: prev.totalTokens + (usage.promptTokens || 0) + (usage.completionTokens || 0),
        }))
      },
    })
    const promptMatch = response.match(/<prompt>([\s\S]*?)<\/prompt>/)
    const explanation = response.replace(/<prompt>[\s\S]*?<\/prompt>/, '').trim()
    if (promptMatch) {
      const newPromptContent = promptMatch[1].trim()
      setProposedPrompt(newPromptContent)
      setMessages(prev => [...prev, { role: 'ai', text: explanation, isProposal: true, proposed: newPromptContent, category: aggUsage.category }])
    } else {
      setMessages(prev => [...prev, { role: 'ai', text: response, category: aggUsage.category }])
    }
  }

  function cancelAnalysis() {
    setPendingAnalysis(null)
  }

  // Called by DiffProposal when the user clicks "Pedir ajuste a la IA".
  // Requires another classify+confirm round so the token cost is shown again.
  async function requestRefinement(instruction) {
    if (!instruction.trim() || loading || analyzing) return
    setAnalyzing(true)
    try {
      const result = await api.post(`/api/accounts/${account.id}/change-agent/classify`, {
        instruction,
        currentPromptText: proposedPrompt, // refine on top of the proposal
        currentPromptLength: (proposedPrompt || '').length,
      })
      setPendingAnalysis({
        instruction,
        category: result.category,
        estimatedTokens: result.estimatedTokens,
        estimatedCostUsd: result.estimatedCostUsd,
        inputTokens: result.inputTokens,
        estimatedOutputTokens: result.estimatedOutputTokens,
        tokenizer: result.tokenizer,
        model: result.model,
        provider: result.provider,
        reason: result.reason || '',
        isRefinement: true,
      })
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: `Error al analizar refinamiento: ${err.message}` }])
    }
    setAnalyzing(false)
  }

  // Called by DiffProposal — receives the FINAL prompt text (may include manual edits).
  async function applyProposed(finalContent, wasEditedManually) {
    if (!finalContent || !selectedPrompt) return
    const oldContent = selectedPrompt.content
    updatePrompt(agentId, selectedPrompt.id, { content: finalContent })
    if (selectedPrompt.isActive) setActivePrompt(agentId, selectedPrompt.id)
    setApplied(true)
    setProposedPrompt(null)

    // Record history entry (which also creates a flash backup BEFORE applying)
    try {
      await api.post(`/api/accounts/${account.id}/prompt-history`, {
        agentId,
        promptId: selectedPrompt.id,
        promptName: selectedPrompt.name,
        instruction: aggUsage.instruction,
        category: aggUsage.category,
        wasEditedManually: !!wasEditedManually,
        oldContent,
        newContent: finalContent,
        inputTokens: aggUsage.promptTokens,
        outputTokens: aggUsage.completionTokens,
        totalTokens: aggUsage.totalTokens,
        costUsd: aggUsage.costUsd,
        model: caInfo.model,
        provider: caProvider,
      })
    } catch (e) { /* non-critical */ }

    setMessages(prev => [...prev, { role: 'system', text: `✓ Prompt aplicado${wasEditedManually ? ' con tu edición manual' : ''}. Backup automático creado.` }])
  }

  function rejectProposed() {
    setProposedPrompt(null)
    setMessages(prev => [...prev, { role: 'system', text: 'Cambios descartados.' }])
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function PoolChip({ category }) {
    const meta = CATEGORY_LABELS[category]
    const remaining = caInfo.remaining[category]
    const limit = caInfo.limits[category]
    const pct = limit > 0 ? Math.min(100, (remaining / limit) * 100) : 0
    const color = pct < 15 ? '#ff5f5f' : pct < 40 ? '#f5a623' : meta.color
    return (
      <div className={s.poolChip} style={{ borderColor: color + '40', background: color + '12' }}>
        <span style={{ fontSize: 11 }}>{meta.icon} {meta.name}</span>
        <span style={{ color, fontWeight: 700 }}>{remaining.toLocaleString()}<span style={{ opacity: .55, fontWeight: 500 }}> / {limit.toLocaleString()}</span></span>
      </div>
    )
  }

  const allExhausted = caInfo.remaining.basic <= 0 && caInfo.remaining.medium <= 0 && caInfo.remaining.complex <= 0

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.panel}>
        {/* Header */}
        <div className={s.header}>
          <div className={s.headerLeft}>
            <div className={s.headerTitle}>🤖 Agente de Cambios</div>
            <div className={s.headerSub}>
              <span>Modelo: <strong>{caInfo.model}</strong></span>
              {selectedPrompt && !selectedPrompt.isActive && (
                <span style={{ marginLeft: 8, color: '#f5a623', fontSize: 11 }}>· modificando prompt inactivo</span>
              )}
            </div>
          </div>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Prompt selector */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text2)', flexShrink: 0 }}>Prompt a modificar:</span>
          <select
            value={selectedPromptId || ''}
            onChange={e => handlePromptChange(e.target.value)}
            style={{ flex: 1, padding: '4px 8px', fontSize: 12, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6, cursor: 'pointer' }}
          >
            {prompts.map(p => (
              <option key={p.id} value={p.id}>
                {p.isActive ? '● ' : '○ '}{p.name}{p.isActive ? ' (activo)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Pool indicators */}
        <div className={s.poolsRow}>
          <PoolChip category="basic" />
          <PoolChip category="medium" />
          <PoolChip category="complex" />
        </div>

        {/* Current prompt preview */}
        <div className={s.currentPrompt}>
          <div className={s.currentPromptLabel}>Prompt: <strong>{selectedPrompt?.name}</strong> ({selectedPrompt?.content.length} chars)</div>
          <div className={s.currentPromptText}>{selectedPrompt?.content.slice(0, 300)}{(selectedPrompt?.content.length || 0) > 300 ? '…' : ''}</div>
        </div>

        {/* Messages */}
        <div className={s.messages}>
          {messages.length === 0 && !pendingAnalysis && (
            <div className={s.welcome}>
              <div className={s.welcomeIcon}>💡</div>
              <p>Describe en lenguaje natural los cambios que quieres en tu prompt.</p>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>Antes de ejecutar, analizaremos la complejidad y te diremos cuántos tokens consumirá.</p>
              <div className={s.examples}>
                <button className={s.exampleBtn} onClick={() => setInput('Quiero que el agente sea más formal y profesional')}>
                  "Hacerlo más formal y profesional"
                </button>
                <button className={s.exampleBtn} onClick={() => setInput('Que responda solo en inglés')}>
                  "Que responda solo en inglés"
                </button>
                <button className={s.exampleBtn} onClick={() => setInput('Replantea por completo al agente para que sea un experto en ventas')}>
                  "Replantear el agente como experto en ventas"
                </button>
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const cat = msg.category ? CATEGORY_LABELS[msg.category] : null
            return (
              <div key={i} className={`${s.msg} ${s['msg_' + msg.role]}`}>
                {msg.role === 'user' && <div className={s.msgUser}>{msg.text}</div>}
                {msg.role === 'ai' && (
                  <div className={s.msgAI}>
                    <div className={s.msgAILabel}>
                      🤖 Agente de Cambios
                      {cat && <span style={{ marginLeft: 8, color: cat.color, fontSize: 11 }}>{cat.icon} {cat.name}</span>}
                    </div>
                    <div className={s.msgAIText}>{msg.text}</div>
                    {msg.isProposal && !applied && proposedPrompt && (
                      <DiffProposal
                        oldText={selectedPrompt?.content || ''}
                        newText={proposedPrompt}
                        onApply={applyProposed}
                        onReject={rejectProposed}
                        onRequestRefinement={requestRefinement}
                        canRefine={!analyzing && !loading}
                        caInfo={caInfo}
                      />
                    )}
                  </div>
                )}
                {msg.role === 'system' && <div className={s.msgSystem}>{msg.text}</div>}
              </div>
            )
          })}

          {(loading || analyzing) && (
            <div className={`${s.msg} ${s.msg_ai}`}>
              <div className={s.msgAI}>
                <div className={s.msgAILabel}>🤖 Agente de Cambios</div>
                <div className={s.msgAIText} style={{ fontSize: 12, color: 'var(--text3)' }}>
                  {analyzing ? 'Analizando complejidad del cambio...' : 'Generando propuesta...'}
                </div>
                <div className={s.typing}><span /><span /><span /></div>
              </div>
            </div>
          )}
        </div>

        {/* Confirmation dialog when analysis is ready */}
        {pendingAnalysis && (() => {
          const cat = CATEGORY_LABELS[pendingAnalysis.category]
          const remaining = caInfo.remaining[pendingAnalysis.category]
          const limit = caInfo.limits[pendingAnalysis.category]
          const cost = pendingAnalysis.estimatedTokens
          const remainingAfter = remaining - cost
          const canAfford = remainingAfter >= 0
          const costUsd = pendingAnalysis.estimatedCostUsd
          const inputTok  = pendingAnalysis.inputTokens
          const outputTok = pendingAnalysis.estimatedOutputTokens
          return (
            <div className={s.analysisBox} style={{ borderColor: cat.color + '50', background: cat.color + '0c' }}>
              <div className={s.analysisHeader}>
                <span style={{ color: cat.color, fontWeight: 700 }}>
                  {cat.icon} Cambio {cat.name}
                  {pendingAnalysis.tokenizer && (
                    <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 8, fontWeight: 500 }}>
                      · conteo {pendingAnalysis.tokenizer === 'tiktoken' ? 'exacto (tiktoken)' : pendingAnalysis.tokenizer === 'anthropic' ? 'oficial (Anthropic)' : 'aproximado'}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{pendingAnalysis.reason}</span>
              </div>
              <div className={s.analysisGrid}>
                <div>
                  <div className={s.analysisLabel}>Input (real)</div>
                  <div className={s.analysisValue}>{(inputTok || 0).toLocaleString()}</div>
                  <div style={{ fontSize: 9, color: 'var(--text3)' }}>tokens del prompt actual</div>
                </div>
                <div>
                  <div className={s.analysisLabel}>Output (estimado)</div>
                  <div className={s.analysisValue}>{(outputTok || 0).toLocaleString()}</div>
                  <div style={{ fontSize: 9, color: 'var(--text3)' }}>tokens de respuesta esperada</div>
                </div>
                <div>
                  <div className={s.analysisLabel}>Total estimado</div>
                  <div className={s.analysisValue} style={{ color: cat.color }}>{cost.toLocaleString()}</div>
                  {costUsd != null && (
                    <div style={{ fontSize: 10, color: '#22d98a', fontFamily: 'monospace', fontWeight: 600 }}>≈ ${costUsd.toFixed(5)}</div>
                  )}
                </div>
                <div>
                  <div className={s.analysisLabel}>Cupo {cat.name}</div>
                  <div className={s.analysisValue} style={{ color: canAfford ? cat.color : '#ff5f5f' }}>
                    {canAfford ? remainingAfter.toLocaleString() : 'Insuficiente'}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text3)' }}>te quedarán de {limit.toLocaleString()}</div>
                </div>
              </div>
              <div className={s.analysisActions}>
                <button className={s.rejectBtn} onClick={cancelAnalysis}>Cancelar</button>
                <button
                  className={s.applyBtn}
                  style={{ background: canAfford ? cat.color : '#555', cursor: canAfford ? 'pointer' : 'not-allowed' }}
                  disabled={!canAfford}
                  onClick={executeChange}
                >
                  {canAfford ? `✓ Ejecutar (${cost.toLocaleString()} tk${costUsd != null ? ` · $${costUsd.toFixed(5)}` : ''})` : 'Sin créditos suficientes'}
                </button>
              </div>
            </div>
          )
        })()}

        {/* Input area */}
        {allExhausted ? (
          <div className={s.exhaustedBox}>
            Has agotado todos tus créditos de cambios este mes. Se reestablecerán el próximo mes.
          </div>
        ) : !pendingAnalysis && (
          <div className={s.inputArea}>
            <textarea
              className={s.textarea}
              placeholder="Describe el cambio que quieres hacer al prompt..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); analyze() } }}
              rows={2}
              disabled={loading || analyzing}
            />
            <button className={s.sendBtn} onClick={analyze} disabled={loading || analyzing || !input.trim()}>
              {analyzing ? <span className={s.spinner} /> : '🔍 Analizar'}
            </button>
          </div>
        )}

        <div className={s.footer}>
          Los créditos se reestablecen el día 1 de cada mes. Cada categoría tiene su propio cupo independiente.
        </div>
      </div>
    </div>
  )
}

// ── Diff proposal — shows old (with removed in red) vs new (with added in green) ──
// Supports manual editing of the proposal AND asking the AI for further refinement
// (which costs additional tokens, hence requires the classify+confirm flow).
function DiffProposal({ oldText, newText, onApply, onReject, onRequestRefinement, canRefine, caInfo }) {
  const [mode, setMode] = useState('split') // 'split' | 'unified' | 'new-only' | 'edit'
  const [editedText, setEditedText] = useState(newText)
  const [refineInstruction, setRefineInstruction] = useState('')
  const [showRefine, setShowRefine] = useState(false)

  // Reset edited text when a new proposal arrives
  useMemo(() => { setEditedText(newText) }, [newText])

  const finalText = editedText
  const wasEdited = (finalText || '') !== (newText || '')

  // Diff is always computed against the (possibly edited) final text so the user
  // sees the truth of what will be applied vs the original.
  const ops = useMemo(() => computeDiff(oldText || '', finalText || ''), [oldText, finalText])
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
    if (o.op === 'remove') return [<span key={'o' + i} className={s.diffRemoved}>{o.text}</span>]
    return [<span key={'o' + i}>{o.text}</span>]
  })
  const newNodes = ops.flatMap((o, i) => {
    if (o.op === 'remove') return []
    if (o.op === 'add') return [<span key={'n' + i} className={s.diffAdded}>{o.text}</span>]
    return [<span key={'n' + i}>{o.text}</span>]
  })
  const unifiedNodes = ops.map((o, i) => {
    if (o.op === 'remove') return <span key={i} className={s.diffRemoved}>{o.text}</span>
    if (o.op === 'add')    return <span key={i} className={s.diffAdded}>{o.text}</span>
    return <span key={i} className={s.diffMuted}>{o.text}</span>
  })

  function sendRefine() {
    if (!refineInstruction.trim()) return
    onRequestRefinement?.(refineInstruction.trim())
    setRefineInstruction('')
    setShowRefine(false)
  }

  return (
    <div className={s.proposalBox}>
      <div className={s.proposalLabel}>
        <span>📝 Cambios propuestos {wasEdited && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>· editado manualmente</span>}</span>
        <div className={s.diffStats}>
          <span className={s.diffStatRemoved}>− {stats.removed.toLocaleString()}</span>
          <span className={s.diffStatAdded}>+ {stats.added.toLocaleString()}</span>
        </div>
        <div className={s.diffToggle}>
          <button className={`${s.diffToggleBtn} ${mode === 'split' ? s.diffToggleBtnActive : ''}`} onClick={() => setMode('split')}>Lado a lado</button>
          <button className={`${s.diffToggleBtn} ${mode === 'unified' ? s.diffToggleBtnActive : ''}`} onClick={() => setMode('unified')}>Unificado</button>
          <button className={`${s.diffToggleBtn} ${mode === 'new-only' ? s.diffToggleBtnActive : ''}`} onClick={() => setMode('new-only')}>Nuevo</button>
          <button className={`${s.diffToggleBtn} ${mode === 'edit' ? s.diffToggleBtnActive : ''}`} onClick={() => setMode('edit')}>✏ Editar</button>
        </div>
      </div>

      {mode === 'split' && (
        <div className={s.diffGrid}>
          <div className={s.diffCol}>
            <div className={`${s.diffColHeader} ${s.diffColHeaderOld}`}>− Versión actual ({(oldText || '').length} chars)</div>
            <pre className={`${s.diffCode} ${s.diffCodeOld}`}>
              {oldNodes.length ? oldNodes : <span className={s.diffEmpty}>(vacío)</span>}
            </pre>
          </div>
          <div className={s.diffCol}>
            <div className={`${s.diffColHeader} ${s.diffColHeaderNew}`}>+ Versión propuesta ({(finalText || '').length} chars)</div>
            <pre className={s.diffCode}>
              {newNodes.length ? newNodes : <span className={s.diffEmpty}>(vacío)</span>}
            </pre>
          </div>
        </div>
      )}

      {mode === 'unified' && (
        <pre className={s.diffCode} style={{ maxHeight: 420 }}>{unifiedNodes}</pre>
      )}

      {mode === 'new-only' && (
        <pre className={s.diffCode} style={{ maxHeight: 420 }}>{finalText}</pre>
      )}

      {mode === 'edit' && (
        <div>
          <textarea
            value={editedText}
            onChange={e => setEditedText(e.target.value)}
            style={{
              width: '100%', minHeight: 320, maxHeight: 480,
              padding: 12, fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.55,
              background: 'var(--surface1)', color: 'var(--text1)',
              border: '1px solid var(--border)', borderRadius: 0,
              resize: 'vertical', outline: 'none',
            }}
          />
          <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', borderTop: '1px solid var(--border)' }}>
            ✏ Edita libremente. Estos cambios <strong>NO consumen tokens</strong> (no llamas a la IA).
            {wasEdited && <button className={s.diffToggleBtn} style={{ marginLeft: 12 }} onClick={() => setEditedText(newText)}>↺ Revertir a propuesta original</button>}
          </div>
        </div>
      )}

      {/* Refinement (asks AI for an additional pass — costs tokens) */}
      {showRefine ? (
        <div style={{ padding: 12, background: 'var(--surface2)', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: '#f5a623', marginBottom: 6, fontWeight: 500 }}>
            ⚠ Esto consumirá tokens adicionales del cupo correspondiente. Verás el cálculo exacto antes de ejecutar.
          </div>
          <textarea
            value={refineInstruction}
            onChange={e => setRefineInstruction(e.target.value)}
            placeholder="Describe el ajuste extra que quieres sobre esta propuesta..."
            rows={3}
            style={{
              width: '100%', padding: 8, fontSize: 12, fontFamily: 'inherit',
              background: 'var(--surface1)', color: 'var(--text1)',
              border: '1px solid var(--border)', borderRadius: 6,
              resize: 'vertical', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
            <button className={s.rejectBtn} onClick={() => setShowRefine(false)}>Cancelar</button>
            <button className={s.applyBtn} style={{ background: '#f5a623' }} disabled={!refineInstruction.trim() || !canRefine} onClick={sendRefine}>
              🔍 Analizar refinamiento
            </button>
          </div>
        </div>
      ) : null}

      <div className={s.proposalActions}>
        {!showRefine && (
          <button className={s.rejectBtn} style={{ marginRight: 'auto' }} onClick={() => setShowRefine(true)}>
            🔄 Pedir ajuste a la IA
          </button>
        )}
        <button className={s.rejectBtn} onClick={onReject}>✕ Descartar</button>
        <button className={s.applyBtn} onClick={() => onApply(finalText, wasEdited)}>
          ✓ Aplicar {wasEdited ? '(con tu edición)' : 'cambios'}
        </button>
      </div>
    </div>
  )
}
