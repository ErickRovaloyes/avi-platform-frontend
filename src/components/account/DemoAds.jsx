import { useState, useEffect, useRef } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getAccountSubscription } from '../../lib/storage'

// Espacio de anuncios SOLO para cuentas Demo. El super admin pega el código de su
// red de anuncios (embed/HTML) en el Super Panel; aquí se inserta y se EJECUTAN
// sus <script> (que innerHTML no ejecuta por sí solo). No se muestra en cuentas
// de pago ni si está deshabilitado o sin código.
export default function DemoAds() {
  const { account, platformSettings } = useAccount()
  const accId = account?.id
  const [isDemo, setIsDemo] = useState(false)
  const ref = useRef(null)
  const enabled = !!platformSettings?.demoAdsEnabled && !!(platformSettings?.demoAdsHtml || '').trim()

  useEffect(() => {
    if (!accId) return
    getAccountSubscription(accId).then(r => setIsDemo(!!r?.subscription?.type?.isDemo)).catch(() => setIsDemo(false))
  }, [accId])

  useEffect(() => {
    if (!ref.current || !isDemo || !enabled) return
    const host = ref.current
    host.innerHTML = platformSettings.demoAdsHtml
    // Re-crear los <script> para que se ejecuten.
    host.querySelectorAll('script').forEach(old => {
      const s = document.createElement('script')
      for (const a of old.attributes) s.setAttribute(a.name, a.value)
      s.textContent = old.textContent
      old.replaceWith(s)
    })
    return () => { if (host) host.innerHTML = '' }
  }, [isDemo, enabled, platformSettings?.demoAdsHtml])

  if (!isDemo || !enabled) return null
  return (
    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 60, padding: '6px 12px', overflow: 'hidden' }}>
      <div ref={ref} style={{ maxWidth: '100%' }} />
    </div>
  )
}
