// Huella de dispositivo (heurística) para el antifraude de cuentas Demo.
// Combina señales estables del navegador/equipo y las reduce a un hash corto.
// No es infalible (incógnito/otro equipo la cambian), es una capa más junto a
// correo, IP y teléfono.

function hash32(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0
  return h.toString(36)
}

function canvasSignal() {
  try {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    if (!ctx) return ''
    ctx.textBaseline = 'top'
    ctx.font = "14px 'Arial'"
    ctx.fillStyle = '#069'
    ctx.fillText('avi-fp-✨', 2, 2)
    ctx.fillStyle = 'rgba(102,204,0,0.7)'
    ctx.fillText('avi-fp-✨', 4, 4)
    return c.toDataURL().slice(-80)
  } catch { return '' }
}

export function getFingerprint() {
  try {
    const n = navigator, s = window.screen
    const parts = [
      n.userAgent, n.language, (n.languages || []).join(','),
      n.platform || '', n.hardwareConcurrency || '', n.deviceMemory || '',
      `${s.width}x${s.height}x${s.colorDepth}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      new Date().getTimezoneOffset(),
      n.maxTouchPoints || 0,
      canvasSignal(),
    ]
    return 'fp_' + hash32(parts.join('|'))
  } catch { return '' }
}
