/**
 * AVI Platform — Meta OAuth Flow
 *
 * Uses Facebook JavaScript SDK to authenticate and authorize
 * WhatsApp Business API access in a single popup flow.
 *
 * Required scopes:
 *   whatsapp_business_management  — manage WA business accounts
 *   whatsapp_business_messaging   — send/receive messages
 *   business_management           — access Business Manager
 */

const GRAPH_VERSION = 'v19.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

// ─── Load Facebook SDK ────────────────────────────────────────────────────────
let sdkLoaded = false
let sdkLoading = false
const sdkCallbacks = []

export function loadFacebookSDK(appId) {
  return new Promise((resolve, reject) => {
    if (sdkLoaded && window.FB) { resolve(window.FB); return }
    sdkCallbacks.push({ resolve, reject })
    if (sdkLoading) return
    sdkLoading = true

    window.fbAsyncInit = () => {
      window.FB.init({
        appId,
        cookie: true,
        xfbml: false,
        version: GRAPH_VERSION,
      })
      sdkLoaded = true
      sdkLoading = false
      sdkCallbacks.forEach(cb => cb.resolve(window.FB))
      sdkCallbacks.length = 0
    }

    const script = document.createElement('script')
    script.src = 'https://connect.facebook.net/es_LA/sdk.js'
    script.async = true
    script.defer = true
    script.onerror = () => {
      sdkLoading = false
      sdkCallbacks.forEach(cb => cb.reject(new Error('No se pudo cargar el SDK de Facebook')))
      sdkCallbacks.length = 0
    }
    document.head.appendChild(script)
  })
}

// ─── OAuth Login popup ────────────────────────────────────────────────────────
export function loginWithMeta(FB) {
  return new Promise((resolve, reject) => {
    FB.login(
      (response) => {
        if (response.authResponse) {
          resolve(response.authResponse)
        } else {
          reject(new Error(response.status === 'unknown'
            ? 'El usuario canceló la autorización.'
            : `Estado: ${response.status}`
          ))
        }
      },
      {
        scope: [
          'whatsapp_business_management',
          'whatsapp_business_messaging',
          'business_management',
        ].join(','),
        return_scopes: true,
        auth_type: 'rerequest',
      }
    )
  })
}

// ─── WhatsApp Coexistence (Embedded Signup) ──────────────────────────────────
// Conecta un WhatsApp Business EXISTENTE con la app GLOBAL de la plataforma.
// El usuario no ingresa App ID: se usa el appId + configId global. Devuelve el
// `code` (para intercambiar en el backend) y phone_number_id + waba_id que llegan
// por el evento de sesión del Embedded Signup.
export async function connectWhatsAppCoexistence({ appId, configId, onStep }) {
  if (!appId)    throw new Error('Falta la App ID global de Meta (configúrala en el Super Panel).')
  if (!configId) throw new Error('Falta el Config ID de Embedded Signup (configúralo en el Super Panel).')

  onStep?.({ key: 'loading_sdk', label: 'Cargando SDK de Meta...', progress: 15 })
  const FB = await loadFacebookSDK(appId)

  return new Promise((resolve, reject) => {
    let sessionInfo = null

    function onMessage(event) {
      let host = ''
      try { host = new URL(event.origin).hostname } catch { return }
      if (!/(^|\.)facebook\.com$/.test(host)) return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          // FINISH / FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING traen phone_number_id + waba_id
          if (typeof data.event === 'string' && data.event.startsWith('FINISH')) {
            sessionInfo = data.data || null
          }
        }
      } catch { /* mensajes no-JSON: ignorar */ }
    }
    window.addEventListener('message', onMessage)

    onStep?.({ key: 'opening_popup', label: 'Abriendo ventana de Meta...', progress: 35 })
    FB.login((response) => {
      window.removeEventListener('message', onMessage)
      const code = response?.authResponse?.code
      if (!code) {
        reject(new Error(response?.status === 'unknown' ? 'Conexión cancelada.' : 'No se recibió la autorización de Meta.'))
        return
      }
      onStep?.({ key: 'authorized', label: 'Autorización recibida...', progress: 60 })
      resolve({
        code,
        phoneNumberId: sessionInfo?.phone_number_id || '',
        wabaId: sessionInfo?.waba_id || '',
      })
    }, {
      config_id: configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: 'whatsapp_business_app_onboarding', // coexistencia
        sessionInfoVersion: '3',
      },
    })
  })
}

// ─── Fetch WhatsApp Business accounts ────────────────────────────────────────
export async function fetchWABusinessAccounts(accessToken) {
  const res = await fetch(
    `${GRAPH_BASE}/me/businesses?fields=id,name,whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name,quality_rating,platform_type}}&access_token=${accessToken}`
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  return res.json()
}

// ─── Fetch phone numbers for a WABA ─────────────────────────────────────────
export async function fetchPhoneNumbers(wabaId, accessToken) {
  const res = await fetch(
    `${GRAPH_BASE}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,platform_type&access_token=${accessToken}`
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  return res.json()
}

// ─── Exchange short-lived token for long-lived ───────────────────────────────
// NOTE: For a permanent token, use a System User token from Business Manager.
// The user token from OAuth is valid ~60 days. For production use System User.
export async function getLongLivedToken(shortToken, appId, appSecret) {
  // This must be done server-side (appSecret can't be in frontend)
  // Returning the short token here; user should generate a System User token in production
  return shortToken
}

// ─── Full one-click connect flow ─────────────────────────────────────────────
export async function connectWithMetaOneClick(appId, onStep) {
  const steps = {
    loading_sdk:      { label: 'Cargando SDK de Meta...',                 progress: 10 },
    opening_popup:    { label: 'Abriendo ventana de autorización...',      progress: 25 },
    authorized:       { label: 'Autorización recibida...',                 progress: 40 },
    fetching_accounts:{ label: 'Obteniendo cuentas de WhatsApp Business...', progress: 60 },
    fetching_numbers: { label: 'Cargando números de teléfono...',          progress: 80 },
    done:             { label: '¡Conexión exitosa!',                       progress: 100 },
  }

  function step(key, extra = {}) {
    onStep?.({ ...steps[key], key, ...extra })
  }

  // 1. Load SDK
  step('loading_sdk')
  const FB = await loadFacebookSDK(appId)

  // 2. Login popup
  step('opening_popup')
  const authResponse = await loginWithMeta(FB)
  const { accessToken, userID } = authResponse

  // 3. Fetch WA Business accounts
  step('authorized')
  step('fetching_accounts')
  const bizData = await fetchWABusinessAccounts(accessToken)

  const businesses = bizData?.data || []
  const wabaList = []

  for (const biz of businesses) {
    const wabas = biz.whatsapp_business_accounts?.data || []
    for (const waba of wabas) {
      const phones = waba.phone_numbers?.data || []
      for (const phone of phones) {
        wabaList.push({
          businessId: biz.id,
          businessName: biz.name,
          wabaId: waba.id,
          wabaName: waba.name,
          phoneNumberId: phone.id,
          displayPhone: phone.display_phone_number,
          verifiedName: phone.verified_name,
          qualityRating: phone.quality_rating,
          platformType: phone.platform_type, // CLOUD_API or coexistence
        })
      }
    }
  }

  step('done')

  return {
    accessToken,
    userID,
    wabaList,
    // If only one phone, return it directly
    selected: wabaList.length === 1 ? wabaList[0] : null,
  }
}
