import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { useAuth } from '../../context/AuthContext'
import ChannelsPanel from '../channels/ChannelsPanel'
import MembersPanel from './MembersPanel'
import BackupPanel from '../backup/BackupPanel'
import GoogleSheetsPanel from '../google/GoogleSheetsPanel'
import CalendarsPanel from '../calendars/CalendarsPanel'
import AccountTab from '../account/AccountTab'
import s from './PanelsShared.module.css'
import cs from './ConfigPanel.module.css'
import PromptsPanel from './PromptsPanel'
import { MODULES } from '../../lib/modules'
import MetaCatalogPanel from '../channels/MetaCatalogPanel'

// ─── Main ConfigPanel — tabs: APIs | Canales | Agente | Prompts | CRM ────────
export function ConfigPanel() {
  const { account, selectedAgent, setOpenAIKey, setDeepseekKey, setAnthropicKey, updateAgent, deleteAgent, addLabel, deleteLabel, hasModule } = useAccount()
  const { session } = useAuth()
  // La pestaña "Cuenta" es SOLO para el Owner (o superadmin/impersonando).
  // El rol owner puede ser 'role_owner' (semilla/impersonación) o 'role_owner_<uid>'
  // (cuentas creadas por el superadmin) → comparamos por prefijo.
  const isOwner = session?.type === 'superadmin' || String(session?.roleId || '').startsWith('role_owner')
  const [tab, setTab] = useState('apis')
  const [toast, setToast] = useState('')

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2400) }

  const tabs = [
    ...(isOwner ? [{ id: 'account', label: '💼 Cuenta', tip: 'Datos de la cuenta, claves efectivas y suscripción.' }] : []),
    { id: 'apis',     label: '🔑 APIs',     tip: 'API Keys de OpenAI, DeepSeek y Anthropic que usará el agente.' },
    ...(hasModule('channels')  ? [{ id: 'channels', label: '📡 Canales', tip: 'Conecta WhatsApp, Messenger, Instagram y Webchat.' }] : []),
    { id: 'google',   label: '📊 Google',   tip: 'Integración con Google Sheets para volcar datos.' },
    ...(hasModule('calendars') ? [{ id: 'calendars',label: '🗓 Calendarios', tip: 'Crea calendarios y gestiona reservas/citas.' }] : []),
    ...(hasModule('channels')  ? [{ id: 'catalog',  label: '🛍 Catálogo Meta', tip: 'Conecta tu catálogo de Meta (Commerce) y lee sus productos.' }] : []),
    { id: 'crm',      label: '🏷 CRM',      tip: 'Etiquetas y opciones del CRM.' },
    { id: 'members',  label: '👥 Equipo',   tip: 'Miembros del equipo, roles y permisos.' },
    { id: 'backup',   label: '💾 Backups',  tip: 'Copias de seguridad de la configuración del agente.' },
    ...(isOwner ? [{ id: 'modules', label: '🧩 Módulos', tip: 'Funcionalidades activas de tu cuenta; solicita activar las inactivas.' }] : []),
  ]

  return (
    <div className={cs.configRoot}>
      {toast && <div className={s.toast}>{toast}</div>}

      {/* Móvil: selector desplegable de secciones */}
      <select className="mobileSelect" value={tab} onChange={e => setTab(e.target.value)}>
        {tabs.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      {/* Sub-tabs (escritorio) */}
      <div className={`${cs.subTabs} onlyDesktop`}>
        {tabs.map(t => (
          <button key={t.id} className={`${cs.subTab} ${tab === t.id ? cs.subTabActive : ''}`} onClick={() => setTab(t.id)} title={t.tip}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={cs.configBody}>
        {/* Guardia: aunque se fuerce el estado, "Cuenta" solo renderiza para el Owner. */}
        {tab === 'account'  && isOwner && <AccountTab />}
        {tab === 'apis'     && <APIsTab account={account} setOpenAIKey={setOpenAIKey} setDeepseekKey={setDeepseekKey} setAnthropicKey={setAnthropicKey} flash={flash} />}
        {tab === 'channels' && <ChannelsPanel />}
        {tab === 'google'   && <GoogleSheetsPanel />}
        {tab === 'calendars'&& <CalendarsPanel />}
        {tab === 'catalog'  && <MetaCatalogPanel accId={account?.id} />}
        {tab === 'crm'      && <CRMTab account={account} addLabel={addLabel} deleteLabel={deleteLabel} flash={flash} />}
        {tab === 'members'  && <MembersPanel />}
        {tab === 'backup'   && <BackupPanel />}
        {tab === 'modules'  && isOwner && <ModulesTab account={account} />}
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
      status,
      fallbackFlowId: fallbackFlowId || null,
      testFlowId: testFlowId || null,
    })
    flash('Cambios guardados ✓')
  }

  return (
    <div className={cs.tabContent}>
      <div className={cs.formSection}>
        <div className={cs.sectionLabel}>Estado</div>
        <div className={cs.field}>
          <label>Disponibilidad</label>
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
          <span className={cs.fieldHint}>En modo borrador el webchat muestra un mensaje de "no disponible". El comportamiento de la IA se define en los <strong>Prompts</strong>.</span>
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

// ─── Módulos tab (solo Owner) ────────────────────────────────────────────────
// Muestra qué funcionalidades tiene activas la cuenta. El dueño NO puede
// auto-activar: los módulos los habilita un superadmin (o se pagan). Al pulsar
// "Activar" sobre uno inactivo se abre un aviso para contactar al equipo.
function ModulesTab({ account }) {
  const [contact, setContact] = useState(null) // módulo cuyo CTA se muestra
  const modules = account?.modules || null
  const isOn = (id) => !modules || modules[id] !== false

  return (
    <div style={{ padding: 28, maxWidth: 820, overflowY: 'auto' }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>🧩 Módulos</h1>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 18px' }}>
        Funcionalidades disponibles en tu cuenta. Para activar un módulo inactivo, contáctanos.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
        {MODULES.map(m => {
          const on = isOn(m.id)
          return (
            <div key={m.id} style={{
              background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14,
              opacity: on ? 1 : 0.72,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{m.icon}</span>
                <strong style={{ fontSize: 14, flex: 1 }}>{m.name}</strong>
                <span style={{
                  fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 9px',
                  color: on ? '#22d98a' : 'var(--text3)', background: on ? '#22d98a22' : 'var(--bg3)',
                  border: `1px solid ${on ? '#22d98a55' : 'var(--border2)'}`,
                }}>{on ? 'Activo' : 'Inactivo'}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5 }}>{m.description}</div>
              {!on && (
                <button
                  onClick={() => setContact(m)}
                  style={{ marginTop: 12, width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg,var(--accent),var(--accent2))', color: '#fff', fontSize: 13, fontWeight: 700 }}
                >Activar</button>
              )}
            </div>
          )
        })}
      </div>

      {contact && (
        <div onClick={() => setContact(null)} style={{ position: 'fixed', inset: 0, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 420, width: '90%' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{contact.icon}</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Activar “{contact.name}”</h2>
            <p style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.6, margin: '0 0 18px' }}>
              Este módulo no está incluido en tu plan actual. Para activarlo, escríbele al equipo de
              AVI Asistente y lo habilitamos para tu cuenta.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setContact(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cerrar</button>
              <a href={`mailto:soporte@aviasistente.com?subject=${encodeURIComponent('Activar módulo: ' + contact.name)}`}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,var(--accent),var(--accent2))', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                Contactar al equipo
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConfigPanel
