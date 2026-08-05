import { useState, useEffect } from 'react'
import { api } from './api'

// Nombre por defecto de la marca. Es el de la empresa: la interfaz nunca debe decir
// "AVI Platform" (eso era el nombre del repositorio, no el del producto).
export const DEFAULT_BRAND_NAME = 'AVI Asistente'

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

/**
 * Nombre de marca a mostrar. Mismo patrón que BrandLogo: valor inmediato desde la caché
 * (para que no aparezca un hueco en el primer pintado) y actualización cuando llega la
 * respuesta. No dispara peticiones extra — `loadBranding` comparte una sola promesa.
 *
 * Nunca devuelve vacío: si el super admin no configuró nombre, cae al de la empresa.
 */
export function useBrandName() {
  const [name, setName] = useState(() => cachedBranding().brandName || DEFAULT_BRAND_NAME)
  useEffect(() => {
    let alive = true
    loadBranding().then(b => { if (alive) setName(b?.brandName || DEFAULT_BRAND_NAME) })
    return () => { alive = false }
  }, [])
  return name
}

/**
 * Parte el nombre para el wordmark: la primera palabra va con el peso fuerte y el resto
 * más tenue ("AVI Asistente" → "AVI" + "Asistente"). Con un nombre de una sola palabra,
 * `rest` queda vacío y no se pinta un span de más.
 */
export function splitBrandName(name) {
  const s = String(name || DEFAULT_BRAND_NAME).trim()
  const i = s.indexOf(' ')
  return i < 0 ? { lead: s, rest: '' } : { lead: s.slice(0, i), rest: s.slice(i + 1) }
}
