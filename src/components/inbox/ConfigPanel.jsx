import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import ChannelsPanel from '../channels/ChannelsPanel'
import MembersPanel from './MembersPanel'
import BackupPanel from '../backup/BackupPanel'
import GoogleSheetsPanel from '../google/GoogleSheetsPanel'
import s from './PanelsShared.module.css'
import cs from './ConfigPanel.module.css'
import PromptsPanel from './PromptsPanel'

// ─── Main ConfigPanel — tabs: APIs | Canales | Agente | Prompts | CRM ────────
export function ConfigPanel() {
  const { account, selectedAgent, setOpenAIKey, setDeepseekKey, setAnthropicKey, updateAgent, deleteAgent, addLabel, deleteLabel } = useAccount()
  const [tab, setTab] = useState('apis')
  const [toast, setToast] = useState('')

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2400) }

  return (
    <div className={cs.configRoot}>
      {toast && <div className={s.toast}>{toast}</div>}

      {/* Sub-tabs */}
      <div className={cs.subTabs}>
        {[
          { id: 'apis',     label: '🔑 APIs' },
          { id: 'channels', label: '📡 Canales' },
          { id: 'google',   label: '📊 Google' },
          { id: 'crm',      label: '🏷 CRM' },
          { id: 'members',  label: '👥 Equipo' },
          { id: 'backup',   label: '💾 Backups' },
        ].map(t => (
          <button key={t.id} className={`${cs.subTab} ${tab === t.id ? cs.subTabActive : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={cs.configBody}>
        {tab === 'apis'     && <APIsTab account={account} setOpenAIKey={setOpenAIKey} setDeepseekKey={setDeepseekKey} setAnthropicKey={setAnthropicKey} flash={flash} />}
        {tab === 'channels' && <ChannelsPanel />}
        {tab === 'google'   && <GoogleSheetsPanel />}
        {tab === 'crm'      && <CRMTab account={account} addLabel={addLabel} deleteLabel={deleteLabel} flash={flash} />}
        {tab === 'members'  && <MembersPanel />}
        {tab === 'backup'   && <BackupPanel />}
      </div>
    </div>
  )
}

// ─── APIs tab ─────────────────────────────────────────────────────────────────
function APIsTab({ account, setOpenAIKey, setDeepseekKey, setAnthropicKey, flash }) {
  const [oKey, setOKey] = useState(account?.openaiKey || '')
  const [dsKey, setDsKey] = useState(account?.deepseekKey || '')
  const [aKey, setAKey] = useState(account?.anthropicKey || '')

  function saveOpenAI(e)    { e.preventDefault(); setOpenAIKey(oKey);     flash('OpenAI API Key guardada ✓') }
  function saveDeepSeek(e)  { e.preventDefault(); setDeepseekKey(dsKey);  flash('DeepSeek API Key guardada ✓') }
  function saveAnthropic(e) { e.preventDefault(); setAnthropicKey(aKey);  flash('Anthropic API Key guardada ✓') }

  return (
    <div className={cs.tabContent}>
      {/* OpenAI */}
      <div className={cs.apiCard}>
        <div className={cs.apiCardHeader}>
          <div className={cs.apiLogo} style={{ background: '#22d98a20', border: '1px solid #22d98a44' }}>
            <span style={{ color: '#22d98a', fontSize: 18 }}>⬡</span>
          </div>
          <div>
            <div className={cs.apiName}>OpenAI</div>
            <div className={cs.apiDesc}>GPT-4o, GPT-4o mini, GPT-3.5 Turbo · Soporta function calling y streaming</div>
          </div>
          {account?.openaiKey && <span className={cs.connectedBadge}>● Conectado</span>}
        </div>
        <form className={cs.apiForm} onSubmit={saveOpenAI}>
          <input
            type="password"
            placeholder="sk-..."
            value={oKey}
            onChange={e => setOKey(e.target.value)}
            className={cs.monoInput}
            autoComplete="off"
          />
          <button type="submit" className={cs.saveKeyBtn}>Guardar</button>
        </form>
        <div className={cs.apiHint}>
          Obtén tu clave en <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className={cs.apiLink}>platform.openai.com/api-keys</a>
        </div>
      </div>

      {/* DeepSeek */}
      <div className={cs.apiCard}>
        <div className={cs.apiCardHeader}>
          <div className={cs.apiLogo} style={{ background: '#4fa8ff20', border: '1px solid #4fa8ff44' }}>
            <span style={{ color: '#4fa8ff', fontSize: 18 }}>◈</span>
          </div>
          <div>
            <div className={cs.apiName}>DeepSeek</div>
            <div className={cs.apiDesc}>DeepSeek Chat (V3), DeepSeek Reasoner (R1) · API compatible con OpenAI</div>
          </div>
          {account?.deepseekKey && <span className={cs.connectedBadge} style={{ color: '#4fa8ff', borderColor: '#4fa8ff44', background: '#4fa8ff15' }}>● Conectado</span>}
        </div>
        <form className={cs.apiForm} onSubmit={saveDeepSeek}>
          <input
            type="password"
            placeholder="sk-..."
            value={dsKey}
            onChange={e => setDsKey(e.target.value)}
            className={cs.monoInput}
            autoComplete="off"
          />
          <button type="submit" className={cs.saveKeyBtn}>Guardar</button>
        </form>
        <div className={cs.apiHint}>
          Obtén tu clave en <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer" className={cs.apiLink}>platform.deepseek.com/api_keys</a>
        </div>
      </div>

      {/* Anthropic / Claude */}
      <div className={cs.apiCard}>
        <div className={cs.apiCardHeader}>
          <div className={cs.apiLogo} style={{ background: '#c179ff20', border: '1px solid #c179ff44' }}>
            <span style={{ color: '#c179ff', fontSize: 18 }}>✦</span>
          </div>
          <div>
            <div className={cs.apiName}>Claude (Anthropic)</div>
            <div className={cs.apiDesc}>Claude Opus 4.7, Sonnet 4.6, Haiku 4.5 · Excelente razonamiento y prompts largos</div>
          </div>
          {account?.anthropicKey && <span className={cs.connectedBadge} style={{ color: '#c179ff', borderColor: '#c179ff44', background: '#c179ff15' }}>● Conectado</span>}
        </div>
        <form className={cs.apiForm} onSubmit={saveAnthropic}>
          <input
            type="password"
            placeholder="sk-ant-..."
            value={aKey}
            onChange={e => setAKey(e.target.value)}
            className={cs.monoInput}
            autoComplete="off"
          />
          <button type="submit" className={cs.saveKeyBtn}>Guardar</button>
        </form>
        <div className={cs.apiHint}>
          Obtén tu clave en <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className={cs.apiLink}>console.anthropic.com/settings/keys</a>
        </div>
      </div>

      {/* Status summary */}
      <div className={cs.statusBox}>
        <div className={cs.statusTitle}>Estado de conexiones</div>
        <div className={cs.statusRow}>
          <span>OpenAI</span>
          <span style={{ color: account?.openaiKey ? '#22d98a' : 'var(--text3)' }}>
            {account?.openaiKey ? '● Configurada' : '○ Sin configurar'}
          </span>
        </div>
        <div className={cs.statusRow}>
          <span>DeepSeek</span>
          <span style={{ color: account?.deepseekKey ? '#4fa8ff' : 'var(--text3)' }}>
            {account?.deepseekKey ? '● Configurada' : '○ Sin configurar'}
          </span>
        </div>
        <div className={cs.statusRow}>
          <span>Claude (Anthropic)</span>
          <span style={{ color: account?.anthropicKey ? '#c179ff' : 'var(--text3)' }}>
            {account?.anthropicKey ? '● Configurada' : '○ Sin configurar'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Agent identity tab ───────────────────────────────────────────────────────
export function AgentTab({ agent, account, updateAgent, deleteAgent, flash }) {
  const [name, setName] = useState(agent?.name || '')
  const [welcome, setWelcome] = useState(agent?.welcomeMessage || '')
  const [status, setStatus] = useState(agent?.status || 'draft')
  const [fallbackFlowId, setFallbackFlowId] = useState(agent?.fallbackFlowId || '')
  const [testFlowId, setTestFlowId] = useState(agent?.testFlowId || '')
  const [confirmDel, setConfirmDel] = useState(false)

  const flows = account?.flows || []

  useEffect(() => {
    setName(agent?.name || '')
    setWelcome(agent?.welcomeMessage || '')
    setStatus(agent?.status || 'draft')
    setFallbackFlowId(agent?.fallbackFlowId || '')
    setTestFlowId(agent?.testFlowId || '')
  }, [agent?.id])

  function save() {
    updateAgent(agent.id, {
      name, welcomeMessage: welcome, status,
      fallbackFlowId: fallbackFlowId || null,
      testFlowId: testFlowId || null,
    })
    flash('Cambios guardados ✓')
  }

  return (
    <div className={cs.tabContent}>
      <div className={cs.formSection}>
        <div className={cs.sectionLabel}>Identidad del agente</div>

        <div className={cs.field}>
          <label>Nombre del agente</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Soporte, Ventas..." />
        </div>

        <div className={cs.field}>
          <label>Mensaje de bienvenida</label>
          <input value={welcome} onChange={e => setWelcome(e.target.value)} placeholder="¡Hola! ¿En qué te puedo ayudar?" />
          <span className={cs.fieldHint}>Este mensaje se muestra al iniciar un nuevo chat en el webchat.</span>
        </div>

        <div className={cs.field}>
          <label>Estado del agente</label>
          <div className={cs.statusRow2}>
            <button type="button"
              className={`${cs.statusBtn} ${status === 'active' ? cs.statusBtnGreen : ''}`}
              onClick={() => setStatus('active')}>
              ● Activo
            </button>
            <button type="button"
              className={`${cs.statusBtn} ${status === 'draft' ? cs.statusBtnAmber : ''}`}
              onClick={() => setStatus('draft')}>
              ○ Borrador
            </button>
          </div>
          <span className={cs.fieldHint}>En modo borrador el webchat muestra un mensaje de "no disponible".</span>
        </div>
      </div>

      {/* ── Flujos de entrada ── */}
      <div className={cs.formSection}>
        <div className={cs.sectionLabel}>Flujos de entrada</div>

        {/* Flujo principal */}
        <div className={cs.field}>
          <label>⚡ Flujo de entrada principal</label>
          <select
            value={fallbackFlowId}
            onChange={e => setFallbackFlowId(e.target.value)}
            className={cs.select}
          >
            <option value="">— Sin flujo (usa el prompt activo directamente) —</option>
            {flows.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <span className={cs.fieldHint}>
            Se ejecuta con cada mensaje en todos los canales. El usuario puede usar{' '}
            <code>{'{{_lastUserMessage}}'}</code> dentro del flujo.
          </span>
        </div>
        {fallbackFlowId && (
          <div className={cs.flowPreview}>
            <span className={cs.flowPreviewIcon}>⚡</span>
            <div>
              <div className={cs.flowPreviewName}>
                {flows.find(f => f.id === fallbackFlowId)?.name || 'Flujo seleccionado'}
              </div>
              <div className={cs.flowPreviewSub}>
                {flows.find(f => f.id === fallbackFlowId)?.nodes?.length || 0} nodos ·{' '}
                trigger: {flows.find(f => f.id === fallbackFlowId)?.trigger || 'manual'}
              </div>
            </div>
            <button className={cs.flowPreviewClear} onClick={() => setFallbackFlowId('')} title="Quitar flujo">✕</button>
          </div>
        )}

        {/* Flujo de pruebas */}
        <div className={cs.field} style={{ marginTop: 14 }}>
          <label>🧪 Flujo de pruebas</label>
          <select
            value={testFlowId}
            onChange={e => setTestFlowId(e.target.value)}
            className={cs.select}
          >
            <option value="">— Sin flujo de pruebas —</option>
            {flows.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <span className={cs.fieldHint}>
            Solo se activa en el <strong>canal de pruebas</strong> cuando el link se genera en modo
            prueba. Ideal para probar flujos nuevos sin afectar el canal principal.
          </span>
        </div>
        {testFlowId && (
          <div className={cs.flowPreview} style={{ borderColor: 'rgba(245,166,35,.3)', background: 'rgba(245,166,35,.06)' }}>
            <span className={cs.flowPreviewIcon}>🧪</span>
            <div>
              <div className={cs.flowPreviewName}>
                {flows.find(f => f.id === testFlowId)?.name || 'Flujo de pruebas'}
              </div>
              <div className={cs.flowPreviewSub}>
                {flows.find(f => f.id === testFlowId)?.nodes?.length || 0} nodos ·{' '}
                trigger: {flows.find(f => f.id === testFlowId)?.trigger || 'manual'}
              </div>
            </div>
            <button className={cs.flowPreviewClear} onClick={() => setTestFlowId('')} title="Quitar flujo">✕</button>
          </div>
        )}
      </div>

      <div className={cs.actionRow}>
        <button
          className={`${cs.delBtn} ${confirmDel ? cs.delBtnConfirm : ''}`}
          onClick={() => {
            if (confirmDel) { deleteAgent(agent.id) }
            else { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000) }
          }}
        >
          {confirmDel ? '¿Confirmar eliminación?' : 'Eliminar agente'}
        </button>
        <button className={cs.saveBtn} onClick={save}>Guardar cambios</button>
      </div>
    </div>
  )
}

// ─── CRM labels tab ───────────────────────────────────────────────────────────
const LABEL_COLORS = ['#ff5f5f', '#22d98a', '#f5a623', '#7c6fff', '#4fa8ff', '#ff6eb4', '#2dd4c8']

function CRMTab({ account, addLabel, deleteLabel, flash }) {
  const [nLabel, setNLabel] = useState({ name: '', color: LABEL_COLORS[0] })

  function handleAdd(e) {
    e.preventDefault()
    if (!nLabel.name.trim()) return
    addLabel(nLabel)
    setNLabel({ name: '', color: LABEL_COLORS[0] })
    flash('Etiqueta creada ✓')
  }

  return (
    <div className={cs.tabContent}>
      <div className={cs.formSection}>
        <div className={cs.sectionLabel}>Etiquetas CRM</div>
        <div className={cs.labelList}>
          {(account?.labels || []).map(l => (
            <div key={l.id} className={cs.labelItem}>
              <span className={cs.labelDot} style={{ background: l.color }} />
              <span className={cs.labelName}>{l.name}</span>
              <button className={cs.labelDel} onClick={() => deleteLabel(l.id)}>✕</button>
            </div>
          ))}
          {(account?.labels || []).length === 0 && <div className={cs.emptyMsg}>Sin etiquetas. Crea la primera.</div>}
        </div>
        <form className={cs.newLabelForm} onSubmit={handleAdd}>
          <input
            placeholder="Nombre de la etiqueta..."
            value={nLabel.name}
            onChange={e => setNLabel(p => ({ ...p, name: e.target.value }))}
            style={{ flex: 1 }}
          />
          <div className={cs.colorPicker}>
            {LABEL_COLORS.map(c => (
              <button key={c} type="button"
                className={`${cs.colorDot} ${nLabel.color === c ? cs.colorDotActive : ''}`}
                style={{ background: c }}
                onClick={() => setNLabel(p => ({ ...p, color: c }))}
              />
            ))}
          </div>
          <button type="submit" className={cs.addLabelBtn}>+ Agregar</button>
        </form>
      </div>
    </div>
  )
}

export default ConfigPanel
