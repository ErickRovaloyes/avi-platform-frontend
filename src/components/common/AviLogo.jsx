import { useId } from 'react'
import { useBrandName, splitBrandName } from '../../lib/branding'

/**
 * Marca AVI — recreación vectorial del logo oficial: pluma de dos lunas
 * (verde + morada) con el punto dorado, y el wordmark de la empresa.
 * Colores de marca: verde #1BDE71 · morado #8B2FD6 · dorado #F5B70A.
 */

// Solo el símbolo (la pluma). `useId` evita colisiones de <mask> cuando la
// marca aparece varias veces en la misma página.
export function AviMark({ size = 32, style }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const g = `avig${uid}`, p = `avip${uid}`
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ flexShrink: 0, ...style }} aria-hidden="true">
      <defs>
        <mask id={g}><rect width="64" height="64" fill="#fff" /><circle cx="28" cy="36" r="19" fill="#000" /></mask>
        <mask id={p}><rect width="64" height="64" fill="#fff" /><circle cx="30" cy="40" r="10" fill="#000" /></mask>
      </defs>
      <circle cx="37" cy="26" r="23" fill="#1BDE71" mask={`url(#${g})`} />
      <circle cx="25" cy="45" r="13" fill="#8B2FD6" mask={`url(#${p})`} />
      <circle cx="21" cy="50" r="4.4" fill="#F5B70A" />
    </svg>
  )
}

// Marca + wordmark. `sub` muestra una línea secundaria (p. ej. nombre de la cuenta).
// El nombre sale de la marca configurada en el Super Panel (por defecto, AVI Asistente),
// igual que ya hacía el logo: así una marca blanca cambia las dos cosas a la vez.
export default function AviLogo({ size = 30, sub, subStyle, nameStyle, style }) {
  const { lead, rest } = splitBrandName(useBrandName())
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, ...style }}>
      <AviMark size={size} />
      <div style={{ minWidth: 0, lineHeight: 1.15 }}>
        <div style={{
          fontFamily: 'var(--font-brand)', fontWeight: 800, letterSpacing: '-0.02em',
          fontSize: Math.round(size * 0.62), color: 'var(--text)', ...nameStyle,
        }}>
          {lead}{rest && <> <span style={{ fontWeight: 500, color: 'var(--text2)' }}>{rest}</span></>}
        </div>
        {sub && <div style={{ fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...subStyle }}>{sub}</div>}
      </div>
    </div>
  )
}
