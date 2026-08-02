// Temas de plataforma. Se aplica con data-theme en <html>; persiste en localStorage.

export const THEMES = [
  { id: 'aviglass', label: 'AVI Glass', swatch: 'linear-gradient(135deg,#04090b 40%,#0d1f19 75%,#1bde71 130%)' },
  { id: 'actual',   label: 'Actual',    swatch: 'linear-gradient(135deg,#12161a,#14c86c)' },
  { id: 'claro',    label: 'Claro',     swatch: 'linear-gradient(135deg,#ffffff,#e0e3ec)' },
  { id: 'oscuro',   label: 'Oscuro',    swatch: 'linear-gradient(135deg,#000000,#202020)' },
  { id: 'gris',     label: 'Gris',      swatch: 'linear-gradient(135deg,#282c34,#3a3f4a)' },
]

const KEY = 'avi_theme'

// Temas con FONDO CLARO (el resto se tratan como oscuros). Se usa para elegir la variante
// del logo de marca (claro vs. oscuro) según el tema activo.
const LIGHT_THEMES = new Set(['claro'])
export function isLightTheme(id) { return LIGHT_THEMES.has(id || getTheme()) }

export function getTheme() {
  // Tema por defecto para usuarios nuevos (sin preferencia guardada): Claro. Quien ya haya
  // elegido un tema conserva el suyo (persistido en localStorage).
  try { return localStorage.getItem(KEY) || 'claro' } catch { return 'claro' }
}

export function applyTheme(id) {
  const theme = id || getTheme()
  const root = document.documentElement
  if (theme === 'actual') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function setTheme(id) {
  try { localStorage.setItem(KEY, id) } catch {}
  applyTheme(id)
}
