import { useState } from 'react'
import { connectWhatsAppCoexistence } from '../../lib/metaOAuth'
import { exchangeWhatsAppCoexistence } from '../../lib/storage'
import s from './MetaConnectButton.module.css'

const IS_HTTPS = typeof window !== 'undefined' && window.location.protocol === 'https:'

/**
 * Conexión por Coexistencia con un solo clic, usando la app GLOBAL de Meta
 * (App ID + Config ID de Embedded Signup configurados en el Super Panel).
 * El cliente NO ingresa App ID. El intercambio del code (con el App Secret) ocurre
 * en el backend; aquí solo recibimos la config final del canal.
 */
export default function WhatsAppCoexistenceButton({ appId, configId, onConnected }) {
  const [state, setState] = useState('idle') // idle | connecting | error | done
  const [step, setStep] = useState(null)
  const [error, setError] = useState('')

  const ready = !!(appId && configId)

  async function connect() {
    setState('connecting'); setError(''); setStep(null)
    try {
      const sig = await connectWhatsAppCoexistence({ appId, configId, onStep: setStep })
      setStep({ key: 'exchange', label: 'Finalizando conexión...', progress: 80 })
      const config = await exchangeWhatsAppCoexistence({
        code: sig.code, phoneNumberId: sig.phoneNumberId, wabaId: sig.wabaId,
      })
      if (!config?.phoneNumberId) throw new Error('No se pudo obtener el número conectado.')
      setState('done')
      onConnected?.({ ...config, status: 'connected' })
    } catch (e) {
      setError(e.message || 'No se pudo conectar por coexistencia')
      setState('error')
    }
  }

  if (state === 'connecting') {
    const pct = step?.progress || 20
    return (
      <div className={s.progressCard}>
        <div className={s.progressTitle}>Conectando tu WhatsApp Business...</div>
        <div className={s.progressBar}><div className={s.progressFill} style={{ width: `${pct}%` }} /></div>
        <div className={s.currentStep}><span>📱</span><span>{step?.label || 'Procesando...'}</span></div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className={s.errorCard}>
        <span>⚠️</span>
        <div className={s.errorMsg}>{error}</div>
        <button className={s.retryBtn} onClick={() => { setState('idle'); setError('') }}>Intentar de nuevo</button>
      </div>
    )
  }

  if (state === 'done') {
    return (
      <div className={s.successCard}>
        <span>✅</span>
        <span className={s.successMsg}>¡WhatsApp conectado por coexistencia!</span>
        <button className={s.reconnectBtn} onClick={() => setState('idle')}>Conectar otro número</button>
      </div>
    )
  }

  // idle
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button className={s.connectBtn} onClick={connect} disabled={!ready || !IS_HTTPS}
        title={!IS_HTTPS ? 'La conexión por coexistencia requiere HTTPS' : ''}>
        <MetaLogo /> Conectar por Coexistencia (1 clic)
      </button>
      {!ready && (
        <span style={{ fontSize: 11, color: 'var(--amber, #f5a623)' }}>
          ⚠ El super admin debe configurar la app global de Meta (App ID + Config ID) en el Super Panel.
        </span>
      )}
      {ready && !IS_HTTPS && (
        <span style={{ fontSize: 11, color: 'var(--amber, #f5a623)' }}>⚠ Requiere HTTPS. Usa la guía manual en localhost.</span>
      )}
      {ready && IS_HTTPS && (
        <span style={{ fontSize: 11, color: 'var(--text3, #888)' }}>
          Conecta tu WhatsApp Business existente sin perder el uso de la app en el teléfono.
        </span>
      )}
    </div>
  )
}

function MetaLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
    </svg>
  )
}
