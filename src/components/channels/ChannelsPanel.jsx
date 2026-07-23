import { useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import { validateWhatsAppConfig, sendWhatsAppText } from '../../lib/whatsappService'
import { validateMessengerConfig } from '../../lib/messengerService'
import { validateInstagramConfig } from '../../lib/instagramService'
import MetaConnectButton from '../whatsapp/MetaConnectButton'
import WhatsAppCoexistenceButton from '../whatsapp/WhatsAppCoexistenceButton'
import WhatsAppTemplatesSection from './WhatsAppTemplatesSection'
import { loadFacebookSDK } from '../../lib/metaOAuth'
import { metaPagesConnect, metaPagesSubscribe, syncWhatsAppHistory } from '../../lib/storage'
import s from './ChannelsPanel.module.css'

const CHANNEL_TYPES = [
  { id: 'webchat',   label: 'Webchat',   icon: '🌐', color: '#7c6fff', desc: 'Embeber en sitios web' },
  { id: 'test',      label: 'Pruebas',   icon: '🧪', color: '#f5a623', desc: 'Pruebas internas, no visible en producción' },
  { id: 'whatsapp',  label: 'WhatsApp',  icon: '📱', color: '#22d98a', desc: 'WhatsApp Business Cloud API' },
  { id: 'messenger', label: 'Messenger', icon: '💬', color: '#4fa8ff', desc: 'Facebook Messenger' },
  { id: 'instagram', label: 'Instagram', icon: '📸', color: '#e1306c', desc: 'Instagram Direct Messages' },
]

function typeInfo(type) { return CHANNEL_TYPES.find(t => t.id === type) || CHANNEL_TYPES[0] }

function MetaLogoInline() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
    </svg>
  )
}

export default function ChannelsPanel() {
  const { account, selectedAgent, addChannel, updateChannel, removeChannel, getChannelLimit, canAdd, getConvos, reloadDB, platformSettings } = useAccount()
  const [filterType, setFilterType] = useState('all')
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [toast, setToast] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const [testing, setTesting] = useState(null)
  const [testResult, setTestResult] = useState({})
  const [copied, setCopied] = useState(null)

  if (!selectedAgent) return <div className={s.empty}>Selecciona un agente</div>

  const channels = selectedAgent.channels || []
  const convos = getConvos(selectedAgent.id) || []
  const filtered = filterType === 'all' ? channels : channels.filter(c => c.type === filterType)

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2500) }

  async function handleAdd(type) {
    if (!canAdd(selectedAgent.id, type)) {
      flash(`Límite de canales ${type} alcanzado para tu plan.`)
      setShowAddMenu(false)
      return
    }
    const t = typeInfo(type)
    const count = channels.filter(c => c.type === type).length
    const ch = await addChannel(selectedAgent.id, {
      type,
      name: `${t.label} ${count + 1}`,
      status: ['webchat', 'test'].includes(type) ? 'active' : 'disconnected',
      config: {},
    })
    setExpandedId(ch?.id)
    setShowAddMenu(false)
    flash(`Canal ${t.label} creado`)
  }

  function handleDel(chId) {
    if (confirmDel === chId) {
      removeChannel(selectedAgent.id, chId)
      setConfirmDel(null)
      if (expandedId === chId) setExpandedId(null)
      flash('Canal eliminado')
    } else {
      setConfirmDel(chId)
      setTimeout(() => setConfirmDel(null), 3000)
    }
  }

  function copyUrl(url, id) {
    navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const convosForChannel = (chId) => convos.filter(c => c.channelId === chId || c.linkId === chId).length

  return (
    <div className={s.panel}>
      {toast && <div className={s.toast}>{toast}</div>}

      <div className={s.header}>
        <div>
          <h2 className={s.title}>Canales</h2>
          <p className={s.sub}>Gestiona todos los canales de comunicación de este agente.</p>
        </div>
        <div className={s.headerActions}>
          <div className={s.addMenuWrap}>
            <button className={s.addBtn} onClick={() => setShowAddMenu(!showAddMenu)}>
              + Añadir canal
            </button>
            {showAddMenu && (
              <div className={s.addMenu}>
                {CHANNEL_TYPES.map(t => {
                  const limit = getChannelLimit(t.id)
                  const used = channels.filter(c => c.type === t.id).length
                  const disabled = limit !== -1 && used >= limit
                  return (
                    <button key={t.id} className={`${s.addMenuItem} ${disabled ? s.addMenuItemDisabled : ''}`}
                      onClick={() => !disabled && handleAdd(t.id)} disabled={disabled}>
                      <span className={s.addMenuIcon}>{t.icon}</span>
                      <div className={s.addMenuInfo}>
                        <span className={s.addMenuLabel}>{t.label}</span>
                        <span className={s.addMenuDesc}>{disabled ? `Límite: ${used}/${limit === -1 ? '∞' : limit}` : t.desc}</span>
                      </div>
                      {!disabled && <span className={s.addMenuArrow}>+</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className={s.filterTabs}>
        <button className={`${s.filterTab} ${filterType === 'all' ? s.filterTabActive : ''}`} onClick={() => setFilterType('all')}>
          Todos <span className={s.tabCount}>{channels.length}</span>
        </button>
        {CHANNEL_TYPES.map(t => {
          const count = channels.filter(c => c.type === t.id).length
          if (count === 0) return null
          return (
            <button key={t.id} className={`${s.filterTab} ${filterType === t.id ? s.filterTabActive : ''}`}
              onClick={() => setFilterType(t.id)}
              style={filterType === t.id ? { borderColor: t.color, color: t.color } : {}}>
              {t.icon} {t.label} <span className={s.tabCount}>{count}</span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className={s.emptyState}>
          <span className={s.emptyIcon}>📡</span>
          <p>No hay canales de este tipo</p>
          <small>Usa "+ Añadir canal" para crear uno</small>
        </div>
      )}

      <div className={s.channelList}>
        {filtered.map(ch => (
          <ChannelCard
            key={ch.id}
            ch={ch}
            account={account}
            agent={selectedAgent}
            platformMetaAppId={platformSettings?.metaAppId || ''}
            platformMetaConfigId={platformSettings?.metaConfigId || ''}
            platformMetaPagesConfigId={platformSettings?.metaPagesConfigId || ''}
            platformReturningDefault={platformSettings?.returningNoticeDefault || ''}
            convos={convosForChannel(ch.id)}
            expanded={expandedId === ch.id}
            onToggle={() => setExpandedId(expandedId === ch.id ? null : ch.id)}
            onUpdate={(updates) => { updateChannel(selectedAgent.id, ch.id, updates); flash('Guardado ✓') }}
            onDelete={() => handleDel(ch.id)}
            confirmDel={confirmDel === ch.id}
            copied={copied}
            onCopy={copyUrl}
            testing={testing === ch.id}
            testResult={testResult[ch.id]}
            onTest={async () => {
              setTesting(ch.id)
              let result
              if (ch.type === 'whatsapp') {
                result = await validateWhatsAppConfig({ phoneNumberId: ch.config?.phoneNumberId, accessToken: ch.config?.accessToken })
                if (result.ok) updateChannel(selectedAgent.id, ch.id, { status: 'connected', config: { ...ch.config, status: 'connected', displayPhone: result.displayPhone, verifiedName: result.verifiedName } })
              } else if (ch.type === 'messenger') {
                result = await validateMessengerConfig({ pageId: ch.config?.pageId, pageAccessToken: ch.config?.pageAccessToken })
                if (result.ok) {
                  // Suscribe la PÁGINA al webhook de la app (imprescindible para recibir mensajes).
                  const sub = await metaPagesSubscribe({ pageId: ch.config?.pageId, pageAccessToken: ch.config?.pageAccessToken }).catch(e => ({ ok: false, error: e.message }))
                  result = { ...result, subscribed: sub.ok, subscribeError: sub.error }
                  updateChannel(selectedAgent.id, ch.id, { status: 'connected', config: { ...ch.config, subscribed: sub.ok } })
                }
              } else if (ch.type === 'instagram') {
                result = await validateInstagramConfig({ igAccountId: ch.config?.igAccountId, pageAccessToken: ch.config?.pageAccessToken })
                if (result.ok) {
                  const sub = await metaPagesSubscribe({ pageId: ch.config?.pageId, pageAccessToken: ch.config?.pageAccessToken }).catch(e => ({ ok: false, error: e.message }))
                  result = { ...result, subscribed: sub.ok, subscribeError: sub.error }
                  updateChannel(selectedAgent.id, ch.id, { status: 'connected', config: { ...ch.config, subscribed: sub.ok } })
                }
              }
              setTestResult(prev => ({ ...prev, [ch.id]: result }))
              setTesting(null)
              if (result?.ok) {
                if (result.subscribed) flash('Conexión verificada y página suscrita a los mensajes ✓')
                else if (result.subscribeError) flash(`Verificado, pero la suscripción de la página falló: ${result.subscribeError}`)
                else flash('Conexión verificada ✓')
              }
            }}
            flash={flash}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Channel Card ─────────────────────────────────────────────────────────────
function ChannelCard({ ch, account, agent, convos, expanded, onToggle, onUpdate, onDelete, confirmDel, copied, onCopy, testing, testResult, onTest, flash, platformMetaAppId, platformMetaConfigId, platformMetaPagesConfigId, platformReturningDefault }) {
  const t = typeInfo(ch.type)
  const isWeblike = ch.type === 'webchat' || ch.type === 'test'
  const webchatUrl = isWeblike ? `${window.location.origin}/chat/${account.id}/${agent.id}/${ch.id}` : null
  const webhookBase = `${window.location.origin.replace('5173', '3001').replace('5174', '3001')}`
  const [localConfig, setLocalConfig] = useState(ch.config || {})
  const [localName, setLocalName] = useState(ch.name)
  const [showTokens, setShowTokens] = useState(false)
  const [showManual, setShowManual] = useState(ch.status !== 'connected')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [metaConnecting, setMetaConnecting] = useState(false)
  const [metaPages, setMetaPages] = useState([])
  const [metaUserToken, setMetaUserToken] = useState('')
  const [metaError, setMetaError] = useState('')
  // Test channel: which flow to use when opening the link
  const [testLinkMode, setTestLinkMode] = useState('main') // 'main' | 'test'
  // Sub-secciones de la página del canal: Conexión / Otras configuraciones.
  const [cfgTab, setCfgTab] = useState('connection') // 'connection' | 'other'
  const [syncingHist, setSyncingHist] = useState(false) // coexistencia: traer historial

  const statusColor = ch.status === 'connected' || ch.status === 'active' ? '#22d98a' : ch.status === 'error' ? '#ff5f5f' : '#888'
  const statusLabel = ch.status === 'connected' ? 'Conectado' : ch.status === 'active' ? 'Activo' : ch.status === 'error' ? 'Error' : 'Desconectado'

  function save() {
    onUpdate({ name: localName, config: { ...ch.config, ...localConfig } })
  }

  // 1-clic: FB.login en el navegador → el backend cambia el token por uno de larga
  // duración, lista las páginas y SUSCRIBE la página a los webhooks (mensajes llegan
  // sin configuración manual). El App Secret nunca sale al frontend.
  async function handleMetaPageConnect() {
    const appId = (platformMetaAppId || localConfig.metaAppId || '').trim()
    if (!appId) { setMetaError('Meta App ID no configurado. El superadmin debe configurarlo en Integraciones.'); return }
    setMetaConnecting(true); setMetaError(''); setMetaPages([])
    try {
      const FB = await loadFacebookSDK(appId)
      const authResponse = await new Promise((resolve, reject) => {
        const scopes = ch.type === 'instagram'
          ? 'pages_show_list,pages_messaging,pages_read_engagement,instagram_basic,instagram_manage_messages'
          : 'pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata'
        // Si el super admin configuró un Config ID de páginas (Facebook Login for Business),
        // se usa ese flujo (obligatorio en apps de tipo "for Business", que es lo que exige
        // el Embedded Signup de WhatsApp); si no, login clásico por permisos.
        const opts = platformMetaPagesConfigId
          ? { config_id: platformMetaPagesConfigId, response_type: 'token', override_default_response_type: true }
          : { scope: scopes, auth_type: 'rerequest' }
        FB.login(r => {
          if (r.authResponse) return resolve(r.authResponse)
          // "Esta app no está disponible" aparece dentro del popup de Meta: la app está en
          // modo Desarrollo (ponla en Live) o tu cuenta no tiene rol en la app.
          reject(new Error('No se completó el inicio de sesión con Meta. Si viste "Esta app no está disponible": la app de Meta está en modo Desarrollo (ponla en Live) o tu cuenta no tiene rol de administrador/desarrollador/probador en esa app. Verifica también que el App ID sea el correcto.'))
        }, opts)
      })
      setMetaUserToken(authResponse.accessToken)
      const r = await metaPagesConnect(account.id, { userAccessToken: authResponse.accessToken, type: ch.type })
      if (r.pages) { setMetaPages(r.pages) }                 // varias páginas → elegir
      else if (r.config) { await applyPageConnection(r.config) }
    } catch (err) {
      const msg = err.message || 'Error de conexión con Meta'
      setMetaError(/ninguna página/i.test(msg) ? msg + ' Si solo tienes perfil personal, usa la configuración manual abajo.' : msg)
      if (/ninguna página/i.test(msg)) setShowManual(true)
    }
    setMetaConnecting(false)
  }

  // Elegir una página de la lista (segunda llamada al backend con pageId).
  async function pickPage(pg) {
    const pageId = pg?.id || pg
    setMetaConnecting(true); setMetaError('')
    try {
      const r = await metaPagesConnect(account.id, { userAccessToken: metaUserToken, type: ch.type, pageId })
      if (r.config) await applyPageConnection(r.config)
      else setMetaError('No se pudo conectar la página seleccionada.')
    } catch (e) { setMetaError(e.message || 'Error al conectar la página') }
    setMetaConnecting(false)
  }

  // Guarda la config devuelta por el backend (page token de larga duración + IG +
  // estado de suscripción de webhooks).
  async function applyPageConnection(config) {
    const newCfg = {
      ...localConfig, pageId: config.pageId, pageAccessToken: config.pageAccessToken,
      ...(config.igAccountId ? { igAccountId: config.igAccountId } : {}),
    }
    setLocalConfig(newCfg)
    setMetaPages([])
    setMetaError('')
    onUpdate({ status: 'connected', config: { ...ch.config, ...newCfg } })
    flash(`${ch.type === 'instagram' ? 'Instagram' : 'Messenger'} conectado: ${config.pageName || config.pageId}${config.subscribed ? ' · webhooks activos' : ''} ✓`)
  }

  function genVerifyToken() {
    const t = 'avi_' + Math.random().toString(36).slice(2, 14)
    setLocalConfig(prev => ({ ...prev, verifyToken: t }))
    onUpdate({ config: { ...ch.config, verifyToken: t } })
    flash('Verify Token generado ✓')
  }

  return (
    <div className={`${s.card} ${expanded ? s.cardExpanded : ''}`}>
      {/* Card header */}
      <div className={s.cardHeader} onClick={onToggle}>
        <div className={s.cardLeft}>
          <span className={s.channelIcon} style={{ background: t.color + '20', color: t.color }}>{t.icon}</span>
          <div className={s.cardInfo}>
            <span className={s.cardName}>{ch.name}</span>
            <div className={s.cardMeta}>
              <span className={s.typeBadge} style={{ color: t.color }}>{t.label}</span>
              <span className={s.convCount}>{convos} conv.</span>
            </div>
          </div>
        </div>
        <div className={s.cardRight}>
          <span className={s.statusDot} style={{ background: statusColor }} />
          <span className={s.statusLabel} style={{ color: statusColor }}>{statusLabel}</span>
          <span className={s.expandArrow}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded config */}
      {expanded && (
        <div className={s.cardBody}>
          {/* Name */}
          <div className={s.fieldRow}>
            <label>Nombre del canal</label>
            <input value={localName} onChange={e => setLocalName(e.target.value)} onBlur={save} className={s.input} />
          </div>

          {/* Sub-secciones del canal: Conexión / Otras configuraciones */}
          <div style={{ display: 'flex', gap: 8, margin: '4px 0 14px' }}>
            {[['connection', '🔌 Conexión'], ['other', '⚙️ Otras configuraciones']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setCfgTab(id)}
                style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${cfgTab === id ? 'var(--accent)' : 'var(--border2)'}`,
                  background: cfgTab === id ? 'var(--accent-dim)' : 'transparent',
                  color: cfgTab === id ? 'var(--accent)' : 'var(--text2)' }}>{label}</button>
            ))}
          </div>

          {cfgTab === 'other' && (
            <OtherChannelSettings localConfig={localConfig} setLocalConfig={setLocalConfig} platformReturningDefault={platformReturningDefault} onSave={save} />
          )}

          {cfgTab === 'connection' && (<>
          {/* Webchat / Test */}
          {isWeblike && webchatUrl && (
            <div className={s.urlSection}>
              {/* Test channel: flow mode picker */}
              {ch.type === 'test' && (
                <div className={s.testFlowPicker}>
                  <span className={s.testFlowLabel}>🧪 Probar con:</span>
                  <div className={s.testFlowOptions}>
                    <button
                      className={`${s.testFlowBtn} ${testLinkMode === 'main' ? s.testFlowBtnActive : ''}`}
                      onClick={() => setTestLinkMode('main')}
                      title={agent.fallbackFlowId ? 'Usa el flujo de entrada principal' : 'Sin flujo — usa el prompt activo'}
                    >
                      ⚡ Flujo principal
                      {!agent.fallbackFlowId && <span className={s.testFlowNone}> (sin flujo)</span>}
                    </button>
                    <button
                      className={`${s.testFlowBtn} ${testLinkMode === 'test' ? s.testFlowBtnActiveAmber : ''}`}
                      onClick={() => setTestLinkMode('test')}
                      title={agent.testFlowId ? 'Usa el flujo de pruebas' : 'No hay flujo de pruebas configurado'}
                    >
                      🧪 Flujo de pruebas
                      {!agent.testFlowId && <span className={s.testFlowNone}> (sin configurar)</span>}
                    </button>
                  </div>
                </div>
              )}

              <div className={s.urlLabel}>URL {ch.type === 'test' ? 'de prueba' : 'del canal'}</div>
              {(() => {
                const activeUrl = ch.type === 'test' && testLinkMode === 'test'
                  ? webchatUrl + '?mode=test'
                  : webchatUrl
                return (
                  <div className={s.urlBox}>
                    <code className={s.urlCode}>{activeUrl}</code>
                    <button className={s.copyBtn} onClick={() => onCopy(activeUrl, ch.id + '_url')}>
                      {copied === ch.id + '_url' ? '✓ Copiado' : '⧉ Copiar'}
                    </button>
                    <a href={activeUrl} target="_blank" rel="noreferrer" className={s.openBtn}>↗ Abrir</a>
                  </div>
                )
              })()}
              {ch.type === 'test' && (
                <div className={s.testNote}>
                  🧪 Canal de pruebas · usando {testLinkMode === 'test'
                    ? (agent.testFlowId ? 'flujo de pruebas' : 'prompt directo (sin flujo de pruebas)')
                    : (agent.fallbackFlowId ? 'flujo principal' : 'prompt directo (sin flujo principal)')
                  }
                </div>
              )}
            </div>
          )}

          {/* WhatsApp config */}
          {ch.type === 'whatsapp' && (
            <div className={s.configSection}>
              {/* Coexistencia (1 clic, app global) — opción principal */}
              <div className={s.metaConnectArea}>
                <WhatsAppCoexistenceButton
                  appId={platformMetaAppId}
                  configId={platformMetaConfigId}
                  onConnected={data => {
                    const next = { ...localConfig, ...data }
                    setLocalConfig(next)
                    onUpdate({ status: 'connected', config: { ...ch.config, ...next } })
                    flash('WhatsApp conectado por coexistencia ✓')
                  }}
                />
              </div>

              {/* Conexión avanzada (App ID propio + OAuth/manual) */}
              <button className={s.manualToggle} onClick={() => setShowAdvanced(!showAdvanced)}>
                🔧 Conexión avanzada (App ID propio / OAuth) {showAdvanced ? '▲' : '▼'}
              </button>
              {showAdvanced && (
                <div className={s.metaConnectArea} style={{ marginTop: 8 }}>
                  {!platformMetaAppId && (
                    <div className={s.field} style={{ maxWidth: 280, marginBottom: 10 }}>
                      <label>Meta App ID <span className={s.req}>*</span></label>
                      <input className={s.mono} placeholder="123456789012345"
                        value={localConfig.metaAppId || ''}
                        onChange={e => setLocalConfig(p => ({ ...p, metaAppId: e.target.value.trim() }))} />
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>El superadmin puede configurar esto globalmente en Integraciones</span>
                    </div>
                  )}
                  <MetaConnectButton
                    appId={platformMetaAppId || localConfig.metaAppId || ''}
                    mode={localConfig.mode || 'api'}
                    onConnected={data => {
                      const next = { ...localConfig, ...data }
                      setLocalConfig(next)
                      onUpdate({ status: 'connected', config: { ...ch.config, ...next } })
                      flash('WhatsApp conectado ✓')
                    }}
                  />
                </div>
              )}

              {/* Manual toggle */}
              <button className={s.manualToggle} onClick={() => setShowManual(!showManual)}>
                ⚙️ Configuración manual {showManual ? '▲' : '▼'}
              </button>

              {showManual && (
                <>
                  <div className={s.configGrid}>
                    <div className={s.field}>
                      <label>Phone Number ID <span className={s.req}>*</span></label>
                      <input className={s.mono} placeholder="123456789012345"
                        value={localConfig.phoneNumberId || ''}
                        onChange={e => setLocalConfig(p => ({ ...p, phoneNumberId: e.target.value.trim() }))} />
                    </div>
                    <div className={s.field}>
                      <label>Business Account ID</label>
                      <input className={s.mono} placeholder="123456789012345"
                        value={localConfig.businessAccountId || ''}
                        onChange={e => setLocalConfig(p => ({ ...p, businessAccountId: e.target.value.trim() }))} />
                    </div>
                    <div className={s.fieldFull}>
                      <label>
                        Access Token <span className={s.req}>*</span>
                        <button className={s.showBtn} onClick={() => setShowTokens(!showTokens)}>
                          {showTokens ? '🙈 Ocultar' : '👁 Mostrar'}
                        </button>
                      </label>
                      <input className={s.mono} type={showTokens ? 'text' : 'password'} placeholder="EAAxxxxx..."
                        value={localConfig.accessToken || ''}
                        onChange={e => setLocalConfig(p => ({ ...p, accessToken: e.target.value.trim() }))} />
                    </div>
                    <div className={s.field}>
                      <label>Verify Token</label>
                      <div className={s.tokenRow}>
                        <input className={s.mono} placeholder="mi_token_secreto"
                          value={localConfig.verifyToken || ''}
                          onChange={e => setLocalConfig(p => ({ ...p, verifyToken: e.target.value }))} />
                        <button className={s.genBtn} onClick={genVerifyToken}>Generar</button>
                      </div>
                    </div>
                    <div className={s.field}>
                      <label>Modo</label>
                      <div className={s.modeBtns}>
                        {['api', 'coexistence'].map(m => (
                          <button key={m} className={`${s.modeBtn} ${(localConfig.mode || 'api') === m ? s.modeBtnActive : ''}`}
                            onClick={() => setLocalConfig(p => ({ ...p, mode: m }))}>
                            {m === 'api' ? '☁️ Solo API' : '📱 Coexistencia'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Webhook URL */}
              <div className={s.webhookSection}>
                <div className={s.webhookLabel}>URL Webhook (pegar en Meta)</div>
                <div className={s.urlBox}>
                  <code className={s.urlCode}>{`${webhookBase}/api/webhook/whatsapp/${account.id}/${agent.id}`}</code>
                  <button className={s.copyBtn} onClick={() => onCopy(`${webhookBase}/api/webhook/whatsapp/${account.id}/${agent.id}`, ch.id + '_wh')}>
                    {copied === ch.id + '_wh' ? '✓ Copiado' : '⧉ Copiar'}
                  </button>
                </div>
              </div>
              {ch.status === 'connected' && ch.config?.displayPhone && (
                <div className={s.connectedSummary}>
                  <span>📱 {ch.config.displayPhone}</span>
                  {ch.config.verifiedName && <span> · {ch.config.verifiedName}</span>}
                </div>
              )}

              {/* Coexistencia: traer historial de 6 meses (sin reconectar, si la
                  ventana de 24h del onboarding sigue abierta). */}
              {ch.status === 'connected' && (ch.config?.coexistence || ch.config?.mode === 'coexistence') && (
                <div style={{ marginTop: 8 }}>
                  <button className={s.testBtn} disabled={syncingHist} onClick={async () => {
                    setSyncingHist(true)
                    try { const r = await syncWhatsAppHistory(account.id, agent.id, ch.id); flash(r?.message || 'Sincronización solicitada ✓') }
                    catch (e) { flash(e?.message || 'No se pudo iniciar la sincronización') }
                    setSyncingHist(false)
                  }}>
                    {syncingHist ? 'Solicitando…' : '🕘 Traer historial (6 meses)'}
                  </button>
                  <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 4, lineHeight: 1.4 }}>
                    Pide a Meta el historial y los contactos. Solo funciona dentro de las 24 h de haber conectado el número; si venció, desconecta y reconéctalo. Llega en fases durante las horas siguientes.
                  </div>
                </div>
              )}

              {/* Plantillas de WhatsApp (estado: aprobada/pendiente/rechazada) */}
              <WhatsAppTemplatesSection
                accId={account.id}
                agentId={agent.id}
                channelId={ch.id}
                canLoad={!!(ch.config?.businessAccountId && ch.config?.accessToken)}
              />
            </div>
          )}

          {/* Messenger config */}
          {ch.type === 'messenger' && (
            <div className={s.configSection}>
              <MetaConnectWizard
                channelType="messenger"
                ch={ch}
                platformMetaAppId={platformMetaAppId}
                localConfig={localConfig}
                setLocalConfig={setLocalConfig}
                metaConnecting={metaConnecting}
                metaPages={metaPages}
                setMetaPages={setMetaPages}
                metaError={metaError}
                onConnect={handleMetaPageConnect}
                onSelectPage={pickPage}
                onDisconnect={() => onUpdate({ status: 'disconnected', config: { ...ch.config, pageId: '', pageAccessToken: '' } })}
                showManual={showManual}
                setShowManual={setShowManual}
                manualForm={(
                  <div className={s.configGrid}>
                    <div className={s.field}>
                      <label>Page ID <span className={s.req}>*</span></label>
                      <input className={s.mono} placeholder="123456789012345"
                        value={localConfig.pageId || ''}
                        onChange={e => setLocalConfig(p => ({ ...p, pageId: e.target.value.trim() }))} />
                    </div>
                    <div className={s.field}>
                      <label>Verify Token</label>
                      <div className={s.tokenRow}>
                        <input className={s.mono} placeholder="avi_xxxx"
                          value={localConfig.verifyToken || ''}
                          onChange={e => setLocalConfig(p => ({ ...p, verifyToken: e.target.value }))} />
                        <button className={s.genBtn} onClick={genVerifyToken}>Generar</button>
                      </div>
                    </div>
                    <div className={s.fieldFull}>
                      <label>
                        Page Access Token <span className={s.req}>*</span>
                        <button className={s.showBtn} onClick={() => setShowTokens(!showTokens)}>
                          {showTokens ? '🙈 Ocultar' : '👁 Mostrar'}
                        </button>
                      </label>
                      <input className={s.mono} type={showTokens ? 'text' : 'password'} placeholder="EAAxxxxx..."
                        value={localConfig.pageAccessToken || ''}
                        onChange={e => setLocalConfig(p => ({ ...p, pageAccessToken: e.target.value.trim() }))} />
                    </div>
                  </div>
                )}
              />

              <div className={s.webhookSection}>
                <div className={s.webhookLabel}>URL Webhook Messenger</div>
                <div className={s.urlBox}>
                  <code className={s.urlCode}>{`${webhookBase}/api/webhook/messenger/${account.id}/${agent.id}`}</code>
                  <button className={s.copyBtn} onClick={() => onCopy(`${webhookBase}/api/webhook/messenger/${account.id}/${agent.id}`, ch.id + '_wh')}>
                    {copied === ch.id + '_wh' ? '✓ Copiado' : '⧉ Copiar'}
                  </button>
                </div>
                <div className={s.webhookNote}>Suscribir al campo <code>messages</code> en Meta for Developers → Tu App → Messenger → Webhooks</div>
              </div>
            </div>
          )}

          {/* Instagram config */}
          {ch.type === 'instagram' && (
            <div className={s.configSection}>
              <MetaConnectWizard
                channelType="instagram"
                ch={ch}
                platformMetaAppId={platformMetaAppId}
                localConfig={localConfig}
                setLocalConfig={setLocalConfig}
                metaConnecting={metaConnecting}
                metaPages={metaPages}
                setMetaPages={setMetaPages}
                metaError={metaError}
                onConnect={handleMetaPageConnect}
                onSelectPage={pickPage}
                onDisconnect={() => onUpdate({ status: 'disconnected', config: { ...ch.config, pageId: '', pageAccessToken: '', igAccountId: '' } })}
                showManual={showManual}
                setShowManual={setShowManual}
                manualForm={(
                  <div className={s.configGrid}>
                    <div className={s.field}>
                      <label>Instagram Account ID <span className={s.req}>*</span></label>
                      <input className={s.mono} placeholder="123456789012345"
                        value={localConfig.igAccountId || ''}
                        onChange={e => setLocalConfig(p => ({ ...p, igAccountId: e.target.value.trim() }))} />
                    </div>
                    <div className={s.field}>
                      <label>Verify Token</label>
                      <div className={s.tokenRow}>
                        <input className={s.mono} placeholder="avi_xxxx"
                          value={localConfig.verifyToken || ''}
                          onChange={e => setLocalConfig(p => ({ ...p, verifyToken: e.target.value }))} />
                        <button className={s.genBtn} onClick={genVerifyToken}>Generar</button>
                      </div>
                    </div>
                    <div className={s.fieldFull}>
                      <label>
                        Page Access Token <span className={s.req}>*</span>
                        <button className={s.showBtn} onClick={() => setShowTokens(!showTokens)}>
                          {showTokens ? '🙈 Ocultar' : '👁 Mostrar'}
                        </button>
                      </label>
                      <input className={s.mono} type={showTokens ? 'text' : 'password'} placeholder="EAAxxxxx..."
                        value={localConfig.pageAccessToken || ''}
                        onChange={e => setLocalConfig(p => ({ ...p, pageAccessToken: e.target.value.trim() }))} />
                    </div>
                  </div>
                )}
              />

              <div className={s.webhookSection}>
                <div className={s.webhookLabel}>URL Webhook Instagram</div>
                <div className={s.urlBox}>
                  <code className={s.urlCode}>{`${webhookBase}/api/webhook/instagram/${account.id}/${agent.id}`}</code>
                  <button className={s.copyBtn} onClick={() => onCopy(`${webhookBase}/api/webhook/instagram/${account.id}/${agent.id}`, ch.id + '_wh')}>
                    {copied === ch.id + '_wh' ? '✓ Copiado' : '⧉ Copiar'}
                  </button>
                </div>
                <div className={s.webhookNote}>Activar <code>messages</code> en Instagram → Configuración → Webhooks</div>
              </div>
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className={`${s.testResult} ${testResult.ok ? s.testOk : s.testErr}`}>
              {testResult.ok
                ? <>✓ Conectado: {testResult.displayPhone || testResult.pageName || testResult.name || testResult.username}</>
                : <>✗ Error: {testResult.error}</>
              }
            </div>
          )}
          </>)}

          {/* Actions (comunes a ambas secciones; probar/desconectar solo en Conexión) */}
          <div className={s.cardActions}>
            <button className={s.saveBtn} onClick={save}>Guardar</button>
            {cfgTab === 'connection' && ['whatsapp', 'messenger', 'instagram'].includes(ch.type) && (
              <button className={s.testBtn} onClick={onTest} disabled={testing}>
                {testing ? <><span className={s.spinner} /> Probando...</> : '🧪 Probar conexión'}
              </button>
            )}
            {cfgTab === 'connection' && ch.status === 'connected' && (
              <button className={s.disconnectBtn} onClick={() => onUpdate({ status: 'disconnected' })}>
                Desconectar
              </button>
            )}
            <button className={`${s.delBtn} ${confirmDel ? s.delConfirm : ''}`} onClick={onDelete}>
              {confirmDel ? '¿Confirmar?' : 'Eliminar canal'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Otras configuraciones del canal ──────────────────────────────────────────
// Ajustes que no son de conexión. Hoy: el aviso que recibe la IA cuando escribe un
// cliente recurrente (vacío = usa el texto por defecto de la plataforma).
function OtherChannelSettings({ localConfig, setLocalConfig, platformReturningDefault, onSave }) {
  const val = localConfig.returningNotice || ''
  const usingDefault = !val.trim()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className={s.fieldRow}>
        <label>💬 Aviso a la IA para clientes recurrentes</label>
        <textarea className={s.input} rows={4} style={{ resize: 'vertical', fontFamily: 'inherit' }}
          value={val}
          placeholder={platformReturningDefault || 'Instrucción que recibe la IA cuando escribe un cliente que ya había conversado antes…'}
          onChange={e => setLocalConfig(prev => ({ ...prev, returningNotice: e.target.value }))}
          onBlur={onSave} />
        <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, display: 'block' }}>
          {usingDefault
            ? '● Usando el texto por defecto de la plataforma. Escribe aquí para personalizarlo solo en este canal.'
            : '✏️ Personalizado para este canal. Vacíalo para volver al texto por defecto de la plataforma.'}
        </span>
        {usingDefault && platformReturningDefault && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
            <strong style={{ fontSize: 11, color: 'var(--text3)' }}>Texto por defecto actual:</strong><br />{platformReturningDefault}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Meta Connect Wizard (Messenger / Instagram) ──────────────────────────────
function MetaConnectWizard({
  channelType, ch, platformMetaAppId, localConfig, setLocalConfig,
  metaConnecting, metaPages, setMetaPages, metaError,
  onConnect, onSelectPage, onDisconnect,
  showManual, setShowManual, manualForm,
}) {
  const isConnected = ch.status === 'connected' && (localConfig.pageId || ch.config?.pageId)
  const labelType   = channelType === 'instagram' ? 'Instagram' : 'Messenger'
  const labelIcon   = channelType === 'instagram' ? '📸' : '💬'

  // ── State A: Already connected ──────────────────────────────────────────────
  if (isConnected) {
    return (
      <div className={s.metaWizard}>
        <div className={s.metaConnectedCard}>
          <div className={s.metaConnectedHeader}>
            <span className={s.metaConnectedIcon}>✅</span>
            <div className={s.metaConnectedInfo}>
              <div className={s.metaConnectedTitle}>{labelType} conectado</div>
              <div className={s.metaConnectedSub}>
                Página ID: <code>{localConfig.pageId || ch.config?.pageId}</code>
                {channelType === 'instagram' && (localConfig.igAccountId || ch.config?.igAccountId) && (
                  <> · IG: <code>{localConfig.igAccountId || ch.config?.igAccountId}</code></>
                )}
              </div>
            </div>
          </div>
          <div className={s.metaConnectedActions}>
            <button className={s.metaSecondaryBtn} onClick={onConnect} disabled={metaConnecting}>
              {metaConnecting ? <><span className={s.spinner} /> Cambiando...</> : '🔄 Cambiar página'}
            </button>
            <button className={s.metaDangerBtn} onClick={onDisconnect}>
              Desconectar
            </button>
          </div>
        </div>

        <button className={s.manualToggle} onClick={() => setShowManual(!showManual)}>
          ⚙️ Editar configuración manualmente {showManual ? '▲' : '▼'}
        </button>
        {showManual && manualForm}
      </div>
    )
  }

  // ── State B: Page selection (multiple pages from Meta) ──────────────────────
  if (metaPages.length > 0) {
    return (
      <div className={s.metaWizard}>
        <div className={s.metaWizardHeader}>
          <span className={s.metaStepBadge}>Paso final</span>
          <h4 className={s.metaWizardTitle}>Selecciona tu página</h4>
        </div>
        <div className={s.metaPageList}>
          {metaPages.map(pg => (
            <button key={pg.id} className={s.metaPageOption} onClick={() => onSelectPage(pg)}>
              <span className={s.metaPageIcon}>{labelIcon}</span>
              <div className={s.metaPageInfo}>
                <div className={s.metaPageName}>{pg.name}</div>
                <div className={s.metaPageId}>ID: {pg.id}</div>
              </div>
              <span className={s.metaPageArrow}>→</span>
            </button>
          ))}
          <button className={s.metaCancelBtn} onClick={() => setMetaPages([])}>← Cancelar</button>
        </div>
      </div>
    )
  }

  // ── State C: Idle / Initial connect (with step-by-step guide) ───────────────
  return (
    <div className={s.metaWizard}>
      {!platformMetaAppId && (
        <div className={s.metaAppIdField}>
          <label>Meta App ID <span className={s.req}>*</span></label>
          <input className={s.mono} placeholder="123456789012345"
            value={localConfig.metaAppId || ''}
            onChange={e => setLocalConfig(p => ({ ...p, metaAppId: e.target.value.trim() }))} />
          <span className={s.metaHint}>El superadmin puede configurar esto globalmente en Integraciones</span>
        </div>
      )}

      <div className={s.metaStepsCard}>
        <div className={s.metaStepsTitle}>
          {labelIcon} Conecta tu cuenta de {labelType} en 3 pasos
        </div>
        <ol className={s.metaSteps}>
          <li><strong>1.</strong> Inicia sesión con Facebook</li>
          <li><strong>2.</strong> <span className={s.metaStepHighlight}>✓ Marca tu Página</span> y haz clic en "Siguiente"</li>
          <li><strong>3.</strong> Autoriza los permisos · ¡Listo!</li>
        </ol>

        <button className={s.metaOAuthBtn} onClick={onConnect} disabled={metaConnecting}>
          {metaConnecting
            ? <><span className={s.spinner} /> Esperando autorización...</>
            : <><MetaLogoInline /> Conectar con Facebook</>
          }
        </button>

        {metaError && (
          <div className={s.metaError}>
            <strong>⚠️ </strong>{metaError}
            <button className={s.metaRetryBtn} onClick={onConnect} disabled={metaConnecting}>
              🔄 Intentar de nuevo
            </button>
          </div>
        )}
      </div>

      <button className={s.manualToggle} onClick={() => setShowManual(!showManual)}>
        ¿Sin Página de Facebook? Configurar manualmente {showManual ? '▲' : '▼'}
      </button>
      {showManual && manualForm}
    </div>
  )
}
