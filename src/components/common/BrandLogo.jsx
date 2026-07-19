import { useState, useEffect } from 'react'
import { AviMark } from './AviLogo'
import { loadBranding, cachedBranding } from '../../lib/branding'

// Muestra el logo de la empresa configurado por el super admin; si no hay, el logo AVI.
export default function BrandLogo({ size = 32, style }) {
  const [logo, setLogo] = useState(() => cachedBranding().brandLogo || null)
  useEffect(() => {
    let alive = true
    loadBranding().then(b => { if (alive) setLogo(b?.brandLogo || null) })
    return () => { alive = false }
  }, [])
  if (logo) return <img src={logo} alt="logo" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 6, ...style }} />
  return <AviMark size={size} style={style} />
}
