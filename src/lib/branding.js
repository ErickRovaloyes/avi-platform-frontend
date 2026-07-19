import { api } from './api'

// Marca de la plataforma (logo, favicon, nombre) configurada por el super admin.
// Se cachea en memoria; se aplica el favicon y el título del navegador al cargar.
let _cache
let _pending

export async function loadBranding() {
  if (_cache !== undefined) return _cache
  if (!_pending) _pending = api.get('/api/platform/integrations').then(r => { _cache = r || {}; return _cache }).catch(() => { _cache = {}; return _cache })
  return _pending
}
export function cachedBranding() { return _cache || {} }

export function applyBranding(b) {
  if (!b) return
  if (b.brandFavicon) {
    let link = document.querySelector('link[rel~="icon"]')
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
    link.href = b.brandFavicon
  }
  if (b.brandName) document.title = b.brandName
}
