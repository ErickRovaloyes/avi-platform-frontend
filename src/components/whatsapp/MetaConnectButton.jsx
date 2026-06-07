import { useState } from 'react'
import { connectWithMetaOneClick } from '../../lib/metaOAuth'
import s from './MetaConnectButton.module.css'

const IS_HTTPS = typeof window !== 'undefined' && window.location.protocol === 'https:'

/**
 * MetaConnectButton
 *
 * - En HTTPS: flujo OAuth real con popup de Meta (1 clic)
 * - En HTTP/localhost: guía paso a paso para obtener el token manualmente
 *   desde Meta for Developers sin necesidad de HTTPS
 */
export default function MetaConnectButton({ appId, mode = 'api', onConnected }) {
  const [state, setState] = useState('idle') // idle|connecting|selecting|manual_guide|error|done
  const [currentStep, setCurrentStep] = useState(null)
  const [error, setError] = useState('')
  const [wabaList, setWabaList] = useState([])
  const [accessToken, setAccessToken] = useState('')

  // Manual guide state (for HTTP/localhost)
  const [manualStep, setManualStep] = useState(1)
  const [manualToken, setManualToken] = useState('')
  const [manualPhoneId, setManualPhoneId] = useState('')
  const [manualBizId, setManualBizId] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchedNumbers, setFetchedNumbers] = useState([])

  async function handleOAuthConnect() {
    if (!appId?.trim()) {
      setError('Ingresa tu App ID de Meta primero.'); setState('error'); return
    }
    setState('connecting'); setError('')
    try {
      const result = await connectWithMetaOneClick(appId.trim(), step => setCurrentStep(step))
      setAccessToken(result.accessToken)
      if (result.wabaList.length === 0) {
        setError('No se encontraron números de WhatsApp Business en esta cuenta.')
        setState('error'); return
      }
      if (result.selected) { finalize(result.selected, result.accessToken) }
      else { setWabaList(result.wabaList); setState('selecting') }
    } catch (err) {
      setError(err.message || 'Error al conectar con Meta')
      setState('error')
    }
  }

  // Manual guide: fetch phone numbers with the token the user pasted
  async function fetchNumbersWithToken() {
    if (!manualToken.trim()) return
    setFetching(true)
    setFetchedNumbers([])
    try {
      const { fetchWABusinessAccounts } = await import('../../lib/metaOAuth')
      const data = await fetchWABusinessAccounts(manualToken.trim())
      const list = []
      for (const biz of (data?.data || [])) {
        for (const waba of (biz.whatsapp_business_accounts?.data || [])) {
          for (const phone of (waba.phone_numbers?.data || [])) {
            list.push({ businessId: biz.id, businessName: biz.name, wabaId: waba.id, wabaName: waba.name, phoneNumberId: phone.id, displayPhone: phone.display_phone_number, verifiedName: phone.verified_name, qualityRating: phone.quality_rating, platformType: phone.platform_type })
          }
        }
      }
      if (list.length === 0) {
        // Try with phoneNumberId directly if user fills it
        setFetchedNumbers([])
        setManualStep(3)
      } else {
        setFetchedNumbers(list)
        setManualStep(3)
      }
    } catch (err) {
      setError(`Error al obtener números: ${err.message}`)
    }
    setFetching(false)
  }

  function finalizeManual() {
    const phoneId = fetchedNumbers.length === 1 ? fetchedNumbers[0].phoneNumberId : manualPhoneId.trim()
    const bizId = fetchedNumbers.length === 1 ? fetchedNumbers[0].businessId : manualBizId.trim()
    if (!phoneId || !manualToken.trim()) {
      setError('Completa todos los campos.'); return
    }
    const phone = fetchedNumbers.find(p => p.phoneNumberId === phoneId) || {
      phoneNumberId: phoneId, displayPhone: phoneId, verifiedName: '', businessId: bizId
    }
    finalize(phone, manualToken.trim())
  }

  function finalize(phone, token) {
    setState('done')
    onConnected?.({
      phoneNumberId: phone.phoneNumberId, accessToken: token || accessToken,
      businessAccountId: phone.businessId, wabaId: phone.wabaId,
      displayPhone: phone.displayPhone, verifiedName: phone.verifiedName,
      platformType: phone.platformType, status: 'connected', mode,
    })
  }

  const STEP_ICONS = { loading_sdk:'⚙️', opening_popup:'🔐', authorized:'✓', fetching_accounts:'🔍', fetching_numbers:'📱', done:'✅' }

  // ── IDLE: show primary button ──────────────────────────────────────────────
  if (state === 'idle') {
    if (IS_HTTPS) {
      return (
        <button className={s.connectBtn} onClick={handleOAuthConnect}>
          <MetaLogo /> Conectar con Meta (1 clic)
        </button>
      )
    }
    // HTTP / localhost → show two options
    return (
      <div className={s.optionsRoot}>
        <div className={s.httpsWarning}>
          <span className={s.warningIcon}>⚠️</span>
          <div>
            <div className={s.warningTitle}>OAuth requiere HTTPS</div>
            <div className={s.warningText}>Estás en <code>localhost</code> (HTTP). Meta bloquea el popup OAuth en conexiones no seguras. Usa la <strong>guía paso a paso</strong> para conectar sin HTTPS, o configura HTTPS con ngrok.</div>
          </div>
        </div>

        <div className={s.optionBtns}>
          <button className={s.optionBtn} onClick={() => setState('manual_guide')}>
            <div className={s.optionBtnIcon}>📋</div>
            <div>
              <div className={s.optionBtnTitle}>Guía paso a paso</div>
              <div className={s.optionBtnDesc}>Obtén el token desde Meta for Developers y pégalo aquí. Funciona en localhost.</div>
            </div>
          </button>

          <button className={s.optionBtn} onClick={() => setState('ngrok_guide')}>
            <div className={s.optionBtnIcon}>🔒</div>
            <div>
              <div className={s.optionBtnTitle}>Usar ngrok (HTTPS)</div>
              <div className={s.optionBtnDesc}>Expón tu localhost con HTTPS usando ngrok para usar el flujo OAuth de 1 clic.</div>
            </div>
          </button>
        </div>
      </div>
    )
  }

  // ── MANUAL GUIDE ────────────────────────────────────────────────────────────
  if (state === 'manual_guide') {
    return (
      <div className={s.guideCard}>
        <div className={s.guideHeader}>
          <div className={s.guideTitle}>Conectar WhatsApp — Paso a paso</div>
          <button className={s.guideBack} onClick={() => { setState('idle'); setManualStep(1); setError('') }}>← Volver</button>
        </div>

        {/* Step indicator */}
        <div className={s.stepIndicator}>
          {[1,2,3].map(n => (
            <div key={n} className={`${s.stepNum} ${manualStep === n ? s.stepNumActive : ''} ${manualStep > n ? s.stepNumDone : ''}`}>
              {manualStep > n ? '✓' : n}
            </div>
          ))}
          <div className={`${s.stepLine} ${manualStep >= 2 ? s.stepLineDone : ''}`} />
          <div className={`${s.stepLine} ${manualStep >= 3 ? s.stepLineDone : ''}`} />
        </div>

        {/* Step 1: Go to Meta and copy token */}
        {manualStep === 1 && (
          <div className={s.guideStep}>
            <div className={s.guideStepTitle}>Paso 1 — Obtén tu Access Token en Meta</div>
            <ol className={s.guideList}>
              <li>Abre <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className={s.externalLink}>developers.facebook.com/apps ↗</a></li>
              <li>Entra a tu app <strong>(la que ya tienes verificada)</strong></li>
              <li>En el menú izquierdo: <strong>WhatsApp → API Setup</strong></li>
              <li>En la sección <strong>"Step 1"</strong>, verás el <strong>Temporary Access Token</strong></li>
              <li>Cópialo — es el token que pegarás aquí</li>
            </ol>
            <div className={s.guideNote}>
              💡 Para producción usa un <strong>System User Token</strong> permanente desde Business Manager en lugar del token temporal de 24h.
            </div>
            <button className={s.nextBtn} onClick={() => setManualStep(2)}>Ya tengo mi token → Siguiente</button>
          </div>
        )}

        {/* Step 2: Paste token, fetch numbers */}
        {manualStep === 2 && (
          <div className={s.guideStep}>
            <div className={s.guideStepTitle}>Paso 2 — Pega tu Access Token</div>
            <div className={s.guideField}>
              <label>Access Token</label>
              <textarea
                className={s.tokenArea}
                rows={3}
                placeholder="EAAxxxxxxxxx..."
                value={manualToken}
                onChange={e => setManualToken(e.target.value.trim())}
              />
            </div>
            {error && <div className={s.errorBox}>{error}</div>}
            <div className={s.stepActions}>
              <button className={s.backBtn} onClick={() => { setManualStep(1); setError('') }}>← Atrás</button>
              <button className={s.nextBtn} onClick={fetchNumbersWithToken} disabled={!manualToken.trim() || fetching}>
                {fetching ? <><span className={s.spinner} /> Obteniendo números...</> : 'Obtener mis números →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Select phone or fill manually */}
        {manualStep === 3 && (
          <div className={s.guideStep}>
            <div className={s.guideStepTitle}>Paso 3 — Selecciona el número a conectar</div>

            {fetchedNumbers.length > 0 ? (
              <>
                <div className={s.guideSubtitle}>Se encontraron {fetchedNumbers.length} número(s):</div>
                <div className={s.phoneList}>
                  {fetchedNumbers.map((phone, i) => (
                    <button key={i} className={s.phoneOption} onClick={() => finalize(phone, manualToken)}>
                      <div className={s.phoneNumber}>{phone.displayPhone}</div>
                      <div className={s.phoneMeta}>{phone.verifiedName} · {phone.businessName}</div>
                      {phone.platformType && (
                        <span className={`${s.platformTag} ${phone.platformType === 'CLOUD_API' ? s.tagCloud : s.tagCoex}`}>
                          {phone.platformType === 'CLOUD_API' ? 'Solo API' : 'Coexistencia disponible'}
                        </span>
                      )}
                      <span className={s.selectArrow}>Usar este →</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className={s.guideSubtitle}>No se detectaron números automáticamente. Ingrésalos manualmente:</div>
                <div className={s.guideField}>
                  <label>Phone Number ID</label>
                  <input className={s.monoInput} placeholder="123456789012345" value={manualPhoneId} onChange={e => setManualPhoneId(e.target.value.trim())} />
                  <span className={s.fieldNote}>Lo encuentras en WhatsApp → API Setup → Phone Number ID</span>
                </div>
                <div className={s.guideField}>
                  <label>Business Account ID <span className={s.optional}>(opcional)</span></label>
                  <input className={s.monoInput} placeholder="123456789012345" value={manualBizId} onChange={e => setManualBizId(e.target.value.trim())} />
                </div>
                {error && <div className={s.errorBox}>{error}</div>}
                <div className={s.stepActions}>
                  <button className={s.backBtn} onClick={() => { setManualStep(2); setError('') }}>← Atrás</button>
                  <button className={s.nextBtn} onClick={finalizeManual} disabled={!manualPhoneId.trim()}>Conectar →</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── NGROK GUIDE ─────────────────────────────────────────────────────────────
  if (state === 'ngrok_guide') {
    return (
      <div className={s.guideCard}>
        <div className={s.guideHeader}>
          <div className={s.guideTitle}>Configurar HTTPS con ngrok</div>
          <button className={s.guideBack} onClick={() => setState('idle')}>← Volver</button>
        </div>
        <ol className={s.guideList}>
          <li>Instala ngrok: <a href="https://ngrok.com/download" target="_blank" rel="noreferrer" className={s.externalLink}>ngrok.com/download ↗</a></li>
          <li>Ejecuta en tu terminal: <code className={s.inlineCode}>ngrok http 5173</code></li>
          <li>Copia la URL HTTPS que te da ngrok (ej: <code className={s.inlineCode}>https://abc123.ngrok.io</code>)</li>
          <li>En Meta for Developers → Tu App → <strong>Configuración básica</strong>, agrega esa URL como <strong>URI de redirección OAuth válido</strong></li>
          <li>Abre AVI Platform desde esa URL ngrok (en vez de localhost)</li>
          <li>El botón "Conectar con Meta" funcionará directamente con OAuth</li>
        </ol>
        <div className={s.guideNote}>
          Alternativamente puedes usar <strong>Cloudflare Tunnel</strong>:<br/>
          <code className={s.inlineCode}>cloudflared tunnel --url http://localhost:5173</code>
        </div>
        <button className={s.nextBtn} onClick={() => setState('idle')}>Entendido, volver</button>
      </div>
    )
  }

  // ── CONNECTING (OAuth progress) ─────────────────────────────────────────────
  if (state === 'connecting' && currentStep) {
    return (
      <div className={s.progressCard}>
        <div className={s.progressTitle}>Conectando con Meta...</div>
        <div className={s.progressBar}><div className={s.progressFill} style={{ width: `${currentStep.progress}%` }} /></div>
        <div className={s.currentStep}>
          <span>{STEP_ICONS[currentStep.key] || '⏳'}</span>
          <span>{currentStep.label}</span>
        </div>
      </div>
    )
  }

  // ── SELECTING (multiple phones) ─────────────────────────────────────────────
  if (state === 'selecting') {
    return (
      <div className={s.guideCard}>
        <div className={s.guideTitle}>Selecciona el número</div>
        <div className={s.phoneList}>
          {wabaList.map((phone, i) => (
            <button key={i} className={s.phoneOption} onClick={() => finalize(phone, accessToken)}>
              <div className={s.phoneNumber}>{phone.displayPhone}</div>
              <div className={s.phoneMeta}>{phone.verifiedName} · {phone.businessName}</div>
              <span className={s.selectArrow}>Usar este →</span>
            </button>
          ))}
        </div>
        <button className={s.backBtn} onClick={() => setState('idle')}>Cancelar</button>
      </div>
    )
  }

  // ── ERROR ────────────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className={s.errorCard}>
        <span>⚠️</span>
        <div className={s.errorMsg}>{error}</div>
        <button className={s.retryBtn} onClick={() => { setState('idle'); setError('') }}>Intentar de nuevo</button>
      </div>
    )
  }

  // ── DONE ─────────────────────────────────────────────────────────────────────
  if (state === 'done') {
    return (
      <div className={s.successCard}>
        <span>✅</span>
        <span className={s.successMsg}>¡Conectado exitosamente!</span>
        <button className={s.reconnectBtn} onClick={() => { setState('idle'); setManualStep(1) }}>Reconectar otro número</button>
      </div>
    )
  }

  return null
}

function MetaLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
    </svg>
  )
}
