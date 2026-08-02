import { useState, useEffect } from 'react'
import { AviMark } from './AviLogo'
import { loadBranding, cachedBranding } from '../../lib/branding'
import { isLightTheme } from '../../lib/theme'

// Muestra el logo de la empresa configurado por el super admin, con DOS variantes: una para
// fondos oscuros (brandLogo) y otra para fondos claros (brandLogoLight). Por defecto elige según
// el tema activo; `bg="dark"|"light"` fuerza una variante (para superficies de fondo fijo).
// Si falta la variante pedida usa la otra; si no hay ninguna, el logo AVI.
export default function BrandLogo({ size = 32, style, bg }) {
  const [brand, setBrand] = useState(() => cachedBranding())
  // Se re-renderiza cuando cambia el tema (data-theme en <html>) para alternar la variante.
  const [light, setLight] = useState(() => (bg ? bg === 'light' : isLightTheme()))

  useEffect(() => {
    let alive = true
    loadBranding().then(b => { if (alive) setBrand(b || {}) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (bg) { setLight(bg === 'light'); return }
    const update = () => setLight(isLightTheme())
    update()
    const obs = new MutationObserver(update)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [bg])

  const dark = brand?.brandLogo || null
  const lightLogo = brand?.brandLogoLight || null
  const logo = light ? (lightLogo || dark) : (dark || lightLogo)

  if (logo) return <img src={logo} alt="logo" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 6, ...style }} />
  return <AviMark size={size} style={style} />
}
