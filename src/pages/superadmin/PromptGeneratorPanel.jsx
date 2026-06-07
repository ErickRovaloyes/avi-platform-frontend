import { useState, useRef } from 'react'
import { api } from '../../lib/api'
import { uid } from '../../lib/storage'
import s from './SuperAdminShell.module.css'

const TRIGGER_LABELS = {
  conversation_start: 'Inicio de conversación',
  keyword:            'Palabra clave',
  manual:             'Manual',
}

export default function PromptGeneratorPanel({ accounts, settings, onAccountReload, flash }) {
  const [accId, setAccId]       = useState('')
  const [agentId, setAgentId]   = useState('')
  const [agentName, setAgentName] = useState('')
  const [observations, setObservations] = useState('')
  const [file, setFile]         = useState(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError]       = useState('')
  const [result, setResult]     = useState(null) // { prompt, summary, flows, docCharCount, charsProcessed, truncated }
  const [selectedFlows, setSelectedFlows] = useState({})
  const [applying, setApplying] = useState(false)
  const fileRef = useRef()

  const account = accounts.find(a => a.id === accId)
  const agent   = account?.agents?.find(a => a.id === agentId)

  // Max upload size in MB — comes from platform settings, defaults to 30
  const maxFileMb = settings?.promptGeneratorMaxFileMb || 30

  function pickFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const ext = f.name.split('.').pop().toLowerCase()
    if (!['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) {
      setError(`Formato no soportado: .${ext}. Usa .pdf, .docx, .txt o .md`)
      return
    }
    if (f.size > maxFileMb * 1024 * 1024) {
      setError(`El archivo excede los ${maxFileMb} MB.`)
      return
    }
    setFile(f)
    setError('')
  }

  async function generate() {
    if (!file) { setError('Selecciona un archivo'); return }
    if (!accId) { setError('Selecciona una cuenta'); return }
    setError('')
    setResult(null)
    setSelectedFlows({})
    setGenerating(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('accountId', accId)
      fd.append('agentName', agentName || agent?.name || 'Agente sin nombre')
      if (observations.trim()) fd.append('observations', observations.trim())
      const r = await api.postForm('/api/superadmin/generate-prompt-from-doc', fd)
      setResult(r)
      // Pre-select all flows by default
      const sel = {}
      ;(r.flows || []).forEach((_, i) => { sel[i] = true })
      setSelectedFlows(sel)
    } catch (err) {
      setError(err.message)
    }
    setGenerating(false)
  }

  function updateResultPrompt(newPrompt) {
    setResult(r => r ? { ...r, prompt: newPrompt } : r)
  }

  function updateFlowField(idx, field, value) {
    setResult(r => {
      if (!r) return r
      const flows = [...(r.flows || [])]
      flows[idx] = { ...flows[idx], [field]: value }
      return { ...r, flows }
    })
  }

  async function applyResult() {
    if (!result || !accId) return
    setApplying(true)
    try {
      // 1) Add a new prompt to the chosen agent (or create the agent if needed)
      let targetAgentId = agentId
      let targetAgentName = agentName || agent?.name

      if (!targetAgentId) {
        // Create a new agent with the generated prompt
        const newAgPayload = {
          id: 'ag_' + uid(),
          name: targetAgentName || 'Agente generado',
          systemPrompt: result.prompt,
          model: 'gpt-4o-mini',
          welcomeMessage: '¡Hola! ¿En qué te puedo ayudar?',
          prompts: [{
            id: 'pr_' + uid(),
            name: 'Prompt generado por IA',
            content: result.prompt,
            isActive: true,
            provider: 'openai',
            model: 'gpt-4o-mini',
          }],
          status: 'active',
          channels: [],
          links: [],
          aiToolIds: [],
          rag: { enabled: false, files: [] },
        }
        const created = await api.post(`/api/accounts/${accId}/agents`, newAgPayload)
        targetAgentId = created.id || newAgPayload.id
      } else {
        // Add a new prompt to existing agent, leaving current prompts intact
        const newPromptId = 'pr_' + uid()
        const newPrompt = {
          id: newPromptId,
          name: `Generado por IA · ${new Date().toLocaleDateString('es')}`,
          content: result.prompt,
          isActive: false,
          provider: 'openai',
          model: agent?.prompts?.[0]?.model || 'gpt-4o-mini',
        }
        const updatedPrompts = [...(agent?.prompts || []), newPrompt]
        await api.put(`/api/agents/${accId}/${targetAgentId}`, { prompts: updatedPrompts })
      }

      // 2) Create selected flows
      const selectedFlowsList = (result.flows || []).filter((_, i) => selectedFlows[i])
      for (const f of selectedFlowsList) {
        const startId = 'n_' + uid()
        // Convert "steps" into a chain of message nodes
        const nodes = []
        let prevId = null
        let y = 60
        const steps = Array.isArray(f.steps) ? f.steps : []
        steps.forEach((step, idx) => {
          const id = idx === 0 ? startId : 'n_' + uid()
          const node = {
            id,
            type: 'message',
            x: 120,
            y,
            data: { text: String(step) },
            connections: { success: null, error: null },
          }
          if (prevId) {
            const prev = nodes.find(n => n.id === prevId)
            if (prev) prev.connections.success = id
          }
          nodes.push(node)
          prevId = id
          y += 140
        })
        if (nodes.length === 0) {
          nodes.push({ id: startId, type: 'message', x: 120, y: 60, data: { text: f.description || f.name }, connections: { success: null, error: null } })
        }
        await api.post(`/api/accounts/${accId}/flows`, {
          id: 'flow_' + uid(),
          name: f.name || 'Flujo generado',
          trigger: f.trigger && TRIGGER_LABELS[f.trigger] ? f.trigger : 'manual',
          startNodeId: startId,
          nodes,
        })
      }

      flash(`Prompt aplicado a "${targetAgentName}" ✓ ${selectedFlowsList.length > 0 ? `(+ ${selectedFlowsList.length} flujo(s))` : ''}`)
      setResult(null)
      setFile(null)
      setObservations('')
      if (fileRef.current) fileRef.current.value = ''
      onAccountReload && onAccountReload()
    } catch (err) {
      setError('Error al aplicar: ' + err.message)
    }
    setApplying(false)
  }

  return (
    <div className={s.content}>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Generador de Prompts desde Documentos</h1>
          <p className={s.pageSub}>
            Sube un archivo Word o PDF y la IA generará automáticamente un system prompt para un agente.
            Modelo configurado: <strong>{settings?.promptGeneratorModel || 'gpt-4o'}</strong>{' '}
            <span style={{ color: 'var(--text3)' }}>({detectProviderLabel(settings?.promptGeneratorModel)})</span>
            {settings?.promptGeneratorAllowFlows && <> · <span style={{ color: 'var(--accent)' }}>Sugerencia de flujos activada</span></>}
          </p>
        </div>
      </div>

      <div className={s.settingsCard}>
        <div className={s.settingsCardTitle}>1. Selecciona destino y archivo</div>
        <div className={s.settingsGrid}>
          <div className={s.field}>
            <label>Cuenta destino</label>
            <select value={accId} onChange={e => { setAccId(e.target.value); setAgentId('') }}>
              <option value="">— Selecciona una cuenta —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className={s.field}>
            <label>Agente destino (opcional)</label>
            <select value={agentId} onChange={e => setAgentId(e.target.value)} disabled={!accId}>
              <option value="">— Crear nuevo agente —</option>
              {(account?.agents || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {agentId ? 'Se añadirá un nuevo prompt al agente existente (no se sobrescribe).' : 'Se creará un nuevo agente con el prompt generado.'}
            </span>
          </div>
          {!agentId && (
            <div className={s.field}>
              <label>Nombre del nuevo agente</label>
              <input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Soporte, Ventas..." />
            </div>
          )}
        </div>

        <div className={s.field} style={{ marginTop: 12 }}>
          <label>Archivo (.pdf, .docx, .txt o .md, máx. {maxFileMb} MB)</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md"
              onChange={pickFile}
              style={{ fontSize: 13 }}
            />
            {file && (
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                {file.name} <span style={{ color: 'var(--text3)' }}>({formatBytes(file.size)})</span>
              </span>
            )}
          </div>
        </div>

        <div className={s.field} style={{ marginTop: 12 }}>
          <label>Observaciones específicas para este prompt <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional)</span></label>
          <textarea
            rows={4}
            value={observations}
            onChange={e => setObservations(e.target.value)}
            placeholder={`Ej: Este agente es para una clínica dental — enfócalo en odontología cosmética. No hables de implantes (servicio no disponible). El tono debe ser cercano y tranquilizador.`}
            style={{ resize: 'vertical', minHeight: 80, fontSize: 13, lineHeight: 1.5 }}
          />
          <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            Instrucciones puntuales que la IA tendrá en cuenta con MÁXIMA PRIORIDAD al generar este prompt. Útil para ajustes específicos del caso (público objetivo, restricciones, tono, exclusiones, etc).
            {observations.length > 0 && <strong style={{ color: 'var(--accent)' }}> · {observations.length} caracteres</strong>}
          </span>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,95,95,.1)', border: '1px solid rgba(255,95,95,.3)', borderRadius: 6, color: '#ff5f5f', fontSize: 12 }}>
            {error}
          </div>
        )}

        <div className={s.settingsActions}>
          <button className={s.primaryBtn} onClick={generate} disabled={generating || !file || !accId}>
            {generating ? '⏳ Analizando documento y generando prompt...' : '✨ Generar prompt'}
          </button>
        </div>
      </div>

      {result && (
        <div className={s.settingsCard}>
          <div className={s.settingsCardTitle}>2. Revisa y aplica el resultado</div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, padding: '3px 10px', background: 'var(--accent-dim, rgba(124,111,255,.18))', color: 'var(--accent)', borderRadius: 20 }}>
              📄 {result.charsProcessed?.toLocaleString() || result.docCharCount?.toLocaleString()} / {result.docCharCount?.toLocaleString()} chars procesados
              {result.truncated && <span style={{ color: '#f5a623' }}> · truncado</span>}
            </span>
            <span style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(34,217,138,.15)', color: '#22d98a', borderRadius: 20 }}>
              ✓ {result.model}
            </span>
            {result.hadObservations && (
              <span style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(124,111,255,.15)', color: '#7c6fff', borderRadius: 20 }}>
                📝 con observaciones específicas
              </span>
            )}
          </div>

          {result.summary && (
            <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 14, fontSize: 13, color: 'var(--text2)', borderLeft: '3px solid var(--accent)' }}>
              <strong style={{ color: 'var(--text1)' }}>Resumen:</strong> {result.summary}
            </div>
          )}

          <div className={s.field}>
            <label>System prompt generado <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(editable antes de aplicar)</span></label>
            <textarea rows={14}
              style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical', minHeight: 280, lineHeight: 1.5 }}
              value={result.prompt}
              onChange={e => updateResultPrompt(e.target.value)} />
            <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{result.prompt.length} caracteres</span>
          </div>

          {settings?.promptGeneratorAllowFlows && result.flows && result.flows.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)', marginBottom: 8 }}>
                💡 Flujos sugeridos por la IA ({result.flows.length})
              </div>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>
                Marca los que quieras crear. Puedes editar nombre, trigger y descripción antes de aplicar.
              </p>
              {result.flows.map((f, i) => (
                <div key={i} style={{
                  padding: 12,
                  background: 'var(--surface2)',
                  border: '1px solid ' + (selectedFlows[i] ? 'var(--accent)' : 'var(--border)'),
                  borderRadius: 8,
                  marginBottom: 8,
                  opacity: selectedFlows[i] ? 1 : 0.55,
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!selectedFlows[i]}
                      onChange={e => setSelectedFlows(prev => ({ ...prev, [i]: e.target.checked }))}
                    />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{f.name || `Flujo ${i + 1}`}</span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 6 }}>
                    <input
                      value={f.name || ''}
                      onChange={e => updateFlowField(i, 'name', e.target.value)}
                      placeholder="Nombre del flujo"
                      disabled={!selectedFlows[i]}
                      style={{ background: 'var(--surface1)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text1)' }}
                    />
                    <select
                      value={f.trigger || 'manual'}
                      onChange={e => updateFlowField(i, 'trigger', e.target.value)}
                      disabled={!selectedFlows[i]}
                      style={{ background: 'var(--surface1)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text1)' }}
                    >
                      {Object.entries(TRIGGER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{f.description}</div>
                  {Array.isArray(f.steps) && f.steps.length > 0 && (
                    <ol style={{ margin: '4px 0 0 18px', fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
                      {f.steps.slice(0, 5).map((step, j) => <li key={j}>{step}</li>)}
                      {f.steps.length > 5 && <li>... y {f.steps.length - 5} pasos más</li>}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className={s.settingsActions} style={{ justifyContent: 'flex-end' }}>
            <button className={s.cancelBtn} onClick={() => { setResult(null); setSelectedFlows({}) }}>Descartar</button>
            <button className={s.primaryBtn} onClick={applyResult} disabled={applying || !result.prompt?.trim()}>
              {applying
                ? 'Aplicando...'
                : agentId
                  ? `✓ Añadir prompt al agente "${agent?.name}"`
                  : `✓ Crear nuevo agente "${agentName || 'sin nombre'}"`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

function detectProviderLabel(model = '') {
  const m = model.toLowerCase()
  if (m.startsWith('claude'))   return 'Anthropic / Claude'
  if (m.startsWith('deepseek')) return 'DeepSeek'
  return 'OpenAI'
}
