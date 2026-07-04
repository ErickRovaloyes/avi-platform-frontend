// Temas de plataforma. Se aplica con data-theme en <html>; persiste en localStorage.

export const THEMES = [
  { id: 'aviglass', label: 'AVI Glass', swatch: 'linear-gradient(135deg,#04090b 40%,#0d1f19 75%,#1bde71 130%)' },
  { id: 'actual',   label: 'Actual',    swatch: 'linear-gradient(135deg,#12161a,#14c86c)' },
  { id: 'claro',    label: 'Claro',     swatch: 'linear-gradient(135deg,#ffffff,#e0e3ec)' },
  { id: 'oscuro',   label: 'Oscuro',    swatch: 'linear-gradient(135deg,#000000,#202020)' },
  { id: 'gris',     label: 'Gris',      swatch: 'linear-gradient(135deg,#282c34,#3a3f4a)' },
]

const KEY = 'avi_theme'

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'actual' } catch { return 'actual' }
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
