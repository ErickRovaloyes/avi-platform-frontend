import WADebugPanel from './WADebugPanel'
import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { setAgentWhatsApp, readDB } from '../../lib/storage'
import { validateWhatsAppConfig } from '../../lib/whatsappService'
import MetaConnectButton from './MetaConnectButton'
import s from './WhatsAppPanel.module.css'

const BLANK = { mode: 'api', phoneNumberId: '', accessToken: '', verifyToken: '', businessAccountId: '', appId: '', status: 'disconnected', displayPhone: '', verifiedName: '' }

export default function WhatsAppPanel() {
  const { account, selectedAgent, reloadDB } = useAccount()
  const [config, setConfig] = useState(() => selectedAgent?.whatsapp || { ...BLANK })
  const [appId, setAppId] = useState(selectedAgent?.whatsapp?.appId || '')
  const [toast, setToast] = useState('')
  const [tab, setTab] = useState('connect') // connect | manual | webhook | coexistence
  const [showManualTokens, setShowManualTokens] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    const wa = selectedAgent?.whatsapp || { ...BLANK }
    setConfig(wa)
    setAppId(wa.appId || '')
    setTestResult(null)
  }, [selectedAgent?.id])

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2500) }

  function save(newConfig) {
    const merged = { ...newConfig, appId }
    setConfig(merged)
    setAgentWhatsApp(account.id, selectedAgent.id, merged)
    reloadDB()
  }

  function handleConnected(data) {
    const newConfig = {
      ...config,
      ...data,
      appId,
      verifyToken: config.verifyToken || ('avi_' + Math.random().toString(36).slice(2, 14)),
    }
    save(newConfig)
    flash('¡WhatsApp conectado exitosamente!')
    setTab('webhook')
  }

  function disconnect() {
    if (!confirm('¿Desconectar WhatsApp de este agente?')) return
    save({ ...BLANK, appId })
    setTestResult(null)
    flash('WhatsApp desconectado')
  }

  async function testConnection() {
    if (!config.phoneNumberId || !config.accessToken) {
      setTestResult({ ok: false, error: 'Faltan Phone Number ID o Access Token.' }); return
    }
    setTesting(true)
    const result = await validateWhatsAppConfig({ phoneNumberId: config.phoneNumberId, accessToken: config.accessToken })
    setTestResult(result)
    if (result.ok) {
      save({ ...config, status: 'connected', displayPhone: result.displayPhone, verifiedName: result.verifiedName })
      flash('Conexión verificada ✓')
    }
    setTesting(false)
  }

  function genVerifyToken() {
    const t = 'avi_' + Math.random().toString(36).slice(2, 14)
    save({ ...config, verifyToken: t })
    flash('Token generado ✓')
  }

  const isConnected = config.status === 'connected'
  const webhookUrl = `${window.location.origin}/api/webhook/whatsapp/${account?.id}/${selectedAgent?.id}`

  const TABS = [
    { id: 'connect',     label: '⚡ Conectar' },
    { id: 'manual',      label: '🔑 Manual' },
    { id: 'webhook',     label: '🔗 Webhook' },
    { id: 'coexistence', label: '📱 Coexistencia' },
    { id: 'debug',       label: '🔍 Diagnóstico' },
  ]

  return (
    <div className={s.panel}>
      {toast && <div className={s.toast}>{toast}</div>}

      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.waLogo}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#22d98a">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <div>
            <h2 className={s.title}>WhatsApp Business API</h2>
            <p className={s.sub}>Conecta tu número para recibir y responder mensajes desde el inbox de AVI.</p>
          </div>
        </div>
        <div className={s.statusPill}>
          <span className={`${s.statusDot} ${isConnected ? s.dotGreen : s.dotGray}`} />
          <span>{isConnected ? `${config.displayPhone || config.verifiedName || 'Conectado'}` : 'Sin conectar'}</span>
          {isConnected && <button className={s.disconnectBtn} onClick={disconnect}>Desconectar</button>}
        </div>
      </div>

      {/* Mode selector */}
      <div className={s.modeRow}>
        <span className={s.modeLabel}>Modo:</span>
        <button className={`${s.modeChip} ${config.mode === 'api' ? s.modeChipActive : ''}`} onClick={() => save({ ...config, mode: 'api' })}>
          ☁️ Solo API
        </button>
        <button className={`${s.modeChip} ${config.mode === 'coexistence' ? s.modeChipActiveGreen : ''}`} onClick={() => save({ ...config, mode: 'coexistence' })}>
          📱 Coexistencia
        </button>
        {config.mode === 'coexistence' && (
          <span className={s.coexNote}>El teléfono seguirá funcionando normalmente</span>
        )}
      </div>

      {/* Tabs */}
      <div className={s.tabs}>
        {TABS.map(t => (
          <button key={t.id} className={`${s.tab} ${tab === t.id ? s.tabActive : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CONNECT TAB (primary) ── */}
      {tab === 'connect' && (
        <div className={s.section}>
          <div className={s.connectIntro}>
            <div className={s.connectIntroTitle}>Conexión en un paso</div>
            <p className={s.connectIntroText}>
              Haz clic en el botón, autoriza en la ventana de Meta y AVI Platform configurará todo automáticamente.
              Necesitas tu <strong>App ID</strong> de Meta (la app que ya tienes verificada).
            </p>
          </div>

          <div className={s.appIdField}>
            <label className={s.fieldLabel}>
              App ID de Meta
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className={s.externalLink}>
                ↗ developers.facebook.com
              </a>
            </label>
            <input
              className={s.monoInput}
              placeholder="1234567890"
              value={appId}
              onChange={e => setAppId(e.target.value.trim())}
            />
            <span className={s.fieldHint}>Encuéntralo en Meta for Developers → Tu App → Configuración básica → ID de la aplicación</span>
          </div>

          <MetaConnectButton
            appId={appId}
            mode={config.mode}
            onConnected={handleConnected}
          />

          {isConnected && (
            <div className={s.connectedSummary}>
              <div className={s.connectedRow}><span>📱 Número:</span><strong>{config.displayPhone}</strong></div>
              <div className={s.connectedRow}><span>✅ Nombre:</span><strong>{config.verifiedName}</strong></div>
              <div className={s.connectedRow}><span>🔑 Token:</span><span className={s.tokenMasked}>{config.accessToken?.slice(0, 12)}•••</span></div>
              <div className={s.connectedRow}><span>📋 Modo:</span><strong>{config.mode === 'coexistence' ? '📱 Coexistencia' : '☁️ Solo API'}</strong></div>
              <div className={s.connectedHint}>
                ⚠️ Siguiente paso: configura el <button className={s.inlineTabBtn} onClick={() => setTab('webhook')}>Webhook →</button>
              </div>
            </div>
          )}

          <div className={s.orDivider}><span>o configura manualmente</span></div>
          <button className={s.manualLink} onClick={() => setTab('manual')}>Ingresar credenciales manualmente →</button>
        </div>
      )}

      {/* ── MANUAL TAB ── */}
      {tab === 'manual' && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Credenciales manuales</div>
          <div className={s.fieldsGrid}>
            <div className={s.field}>
              <label>Phone Number ID <span className={s.req}>*</span></label>
              <input className={s.mono} placeholder="123456789012345" value={config.phoneNumberId}
                onChange={e => save({ ...config, phoneNumberId: e.target.value.trim() })} />
            </div>
            <div className={s.field}>
              <label>Business Account ID</label>
              <input className={s.mono} placeholder="123456789012345" value={config.businessAccountId}
                onChange={e => save({ ...config, businessAccountId: e.target.value.trim() })} />
            </div>
            <div className={s.field} style={{ gridColumn: 'span 2' }}>
              <label>
                Access Token <span className={s.req}>*</span>
                <button className={s.showBtn} onClick={() => setShowManualTokens(!showManualTokens)}>
                  {showManualTokens ? '🙈 Ocultar' : '👁 Mostrar'}
                </button>
              </label>
              <input className={s.mono} type={showManualTokens ? 'text' : 'password'} placeholder="EAAxxxxx..."
                value={config.accessToken} onChange={e => save({ ...config, accessToken: e.target.value.trim() })} />
            </div>
            <div className={s.field}>
              <label>Verify Token <span className={s.req}>*</span></label>
              <div className={s.tokenRow}>
                <input className={s.mono} placeholder="mi_token_secreto" value={config.verifyToken}
                  onChange={e => save({ ...config, verifyToken: e.target.value })} />
                <button className={s.genBtn} onClick={genVerifyToken}>Generar</button>
              </div>
            </div>
          </div>

          {testResult && (
            <div className={`${s.testResult} ${testResult.ok ? s.testOk : s.testErr}`}>
              {testResult.ok
                ? <><strong>✓ Conectado:</strong> {testResult.displayPhone} · {testResult.verifiedName}</>
                : <><strong>✗ Error:</strong> {testResult.error}</>
              }
            </div>
          )}

          <div className={s.actions}>
            <button className={s.testBtn} onClick={testConnection} disabled={testing}>
              {testing ? <><span className={s.spinner} /> Probando...</> : '🧪 Probar conexión'}
            </button>
          </div>
        </div>
      )}

      {/* ── WEBHOOK TAB ── */}
      {tab === 'webhook' && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Configurar Webhook en Meta</div>
          {!config.verifyToken && (
            <div className={s.warnBox}>⚠️ Genera primero un Verify Token en la pestaña "Conectar" o "Manual".</div>
          )}
          <div className={s.webhookBlock}>
            <div className={s.webhookItem}>
              <div className={s.webhookItemLabel}>URL del Webhook</div>
              <div className={s.webhookItemValue}>
                <code className={s.webhookCode}>{webhookUrl}</code>
                <button className={s.copyBtn} onClick={() => { navigator.clipboard.writeText(webhookUrl); flash('URL copiada ✓') }}>Copiar</button>
              </div>
              <div className={s.webhookItemNote}>⚠️ Necesita ser HTTPS público. Usa ngrok o Cloudflare Tunnel para desarrollo local.</div>
            </div>
            <div className={s.webhookItem}>
              <div className={s.webhookItemLabel}>Verify Token</div>
              <div className={s.webhookItemValue}>
                <code className={s.webhookCode}>{config.verifyToken || '(sin configurar)'}</code>
                {config.verifyToken && <button className={s.copyBtn} onClick={() => { navigator.clipboard.writeText(config.verifyToken); flash('Token copiado ✓') }}>Copiar</button>}
              </div>
            </div>
            <div className={s.webhookItem}>
              <div className={s.webhookItemLabel}>Campo a suscribir</div>
              <span className={s.fieldTag}>messages</span>
            </div>
          </div>

          <div className={s.stepsBox}>
            <div className={s.stepsTitle}>Pasos en Meta for Developers</div>
            <ol className={s.steps}>
              <li>Abre <strong>developers.facebook.com</strong> → Tu App → <strong>WhatsApp → Configuration</strong></li>
              <li>En <strong>"Webhook"</strong>, haz clic en <strong>"Edit"</strong></li>
              <li>Pega la URL del Webhook y el Verify Token de arriba</li>
              <li>Clic en <strong>"Verify and Save"</strong></li>
              <li>En <strong>"Webhook Fields"</strong>, activa <strong>messages</strong> y haz clic en <strong>"Subscribe"</strong></li>
            </ol>
          </div>

          <div className={s.ngrokBox}>
            <div className={s.ngrokTitle}>🛠 Para desarrollo local (localhost)</div>
            <div className={s.ngrokOptions}>
              <div className={s.ngrokOpt}>
                <div className={s.ngrokOptName}>ngrok</div>
                <code className={s.codeBlock}>ngrok http 3001</code>
              </div>
              <div className={s.ngrokOpt}>
                <div className={s.ngrokOptName}>Cloudflare Tunnel</div>
                <code className={s.codeBlock}>cloudflared tunnel --url http://localhost:3001</code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── COEXISTENCE TAB ── */}
      {tab === 'debug' && (
        <div className={s.section}>
          <WADebugPanel account={account} selectedAgent={selectedAgent} />
        </div>
      )}

      {tab === 'coexistence' && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Modo Coexistencia — App del teléfono + API simultáneamente</div>
          <div className={s.coexGrid}>
            <div className={s.coexCard}>
              <div className={s.coexCardTitle}>☁️ Solo API</div>
              <ul className={s.coexList}>
                <li>✓ Disponible para todos</li>
                <li>✓ Configuración más simple</li>
                <li>✗ App del teléfono desactivada</li>
              </ul>
            </div>
            <div className={s.coexCard} style={{ borderColor: 'rgba(34,217,138,.35)', background: 'rgba(34,217,138,.03)' }}>
              <div className={s.coexCardTitle} style={{ color: 'var(--green)' }}>📱 Coexistencia</div>
              <ul className={s.coexList}>
                <li>✓ App del teléfono funciona normal</li>
                <li>✓ Plataforma recibe mensajes en paralelo</li>
                <li>⚠ Requiere habilitación de Meta/BSP</li>
              </ul>
            </div>
          </div>
          <div className={s.stepsBox}>
            <div className={s.stepsTitle}>Cómo activar la Coexistencia</div>
            <ol className={s.steps}>
              <li>Ve a <strong>business.facebook.com → WhatsApp Manager → tu número → Configuración avanzada</strong></li>
              <li>Solicita habilitar <strong>"API Coexistence"</strong>, o contacta a tu BSP si usas uno</li>
              <li>Una vez habilitado por Meta, tu número aparece como "linked device" adicional</li>
              <li>Selecciona el modo <strong>Coexistencia</strong> en AVI Platform (el código es idéntico al modo Solo API)</li>
            </ol>
          </div>
          <div className={s.coexNote2}>
            <strong>Nota técnica:</strong> Cuando hay coexistencia, Meta entrega cada mensaje entrante tanto a la app del teléfono como al webhook de AVI simultáneamente. Los mensajes que envía el agente IA desde la plataforma quedan registrados en el historial de la app del teléfono.
          </div>
        </div>
      )}
    </div>
  )
}
