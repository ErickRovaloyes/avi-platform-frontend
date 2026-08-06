import { io } from 'socket.io-client'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'
export const API_BASE = BASE
const TOKEN_KEY = 'avi_jwt'

// Sesión PERSISTENTE: el token se guarda en localStorage para que el usuario siga
// logueado aunque cierre el navegador (hasta que pulse "cerrar sesión"). sessionStorage
// se borraba al cerrar el navegador → cerraba la sesión sola.
export function getToken() {
  let t = null
  try { t = localStorage.getItem(TOKEN_KEY) } catch {}
  if (!t) {
    // Migración desde la versión anterior (sessionStorage): no desloguear a quien ya estaba dentro.
    // También es donde acaba el token si localStorage estaba lleno al guardarlo (ver setToken).
    try {
      t = sessionStorage.getItem(TOKEN_KEY)
      if (t) { localStorage.setItem(TOKEN_KEY, t); sessionStorage.removeItem(TOKEN_KEY) }
    } catch {}
  }
  return t || ''
}

// Libera las cachés de DEPURACIÓN de flujos (trazas de ejecución e historial de cambios).
// Son prescindibles y son las que más ocupan; se sacrifican antes que la sesión.
function freeDebugSpace() {
  let freed = 0
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.startsWith('avi_flow_execs_') || k.startsWith('avi_flow_history_'))) keys.push(k)
    }
    for (const k of keys) { try { localStorage.removeItem(k); freed++ } catch {} }
  } catch {}
  return freed
}

// Guardar el token NUNCA debe poder fallar en silencio. Si localStorage está lleno,
// `setItem` lanza QuotaExceededError; ese error subía hasta un catch que lo descartaba y
// la sesión no llegaba a cambiar: la app se quedaba donde estaba sin decir nada (síntoma
// típico: pulsar "Entrar" en una cuenta, ver un 200 en la red y no pasar de la pantalla).
// Ahora se hace sitio tirando cachés prescindibles y, en último caso, se usa sessionStorage.
export function setToken(t) {
  try { localStorage.setItem(TOKEN_KEY, t); return true } catch {}
  const freed = freeDebugSpace()
  if (freed) {
    try {
      localStorage.setItem(TOKEN_KEY, t)
      console.warn(`[storage] localStorage lleno: se liberaron ${freed} cachés de depuración de flujos.`)
      return true
    } catch {}
  }
  // Último recurso: la sesión sobrevive a esta pestaña aunque no al cierre del navegador.
  try {
    sessionStorage.setItem(TOKEN_KEY, t)
    console.warn('[storage] localStorage lleno y no se pudo liberar: la sesión se guarda solo para esta pestaña.')
    return true
  } catch {}
  return false
}
export function clearToken()  {
  try { localStorage.removeItem(TOKEN_KEY) } catch {}
  try { sessionStorage.removeItem(TOKEN_KEY) } catch {}
}

function headers() {
  const h = { 'Content-Type': 'application/json' }
  const t = getToken()
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

async function request(method, path, body) {
  const opts = { method, headers: headers() }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(BASE + path, opts)
  if (res.status === 204) return null
  const data = await res.json()
  if (!res.ok) {
    // El cuerpo completo viaja con el error: algunos endpoints devuelven datos de diagnóstico
    // junto al mensaje (p. ej. los permisos que Meta concedió de verdad) y quedarse solo con
    // `error` los tiraba a la basura.
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.data = data; err.status = res.status
    throw err
  }
  return data
}

async function uploadForm(path, formData) {
  const t = getToken()
  const opts = { method: 'POST', body: formData, headers: {} }
  if (t) opts.headers['Authorization'] = `Bearer ${t}`
  const res = await fetch(BASE + path, opts)
  if (res.status === 204) return null
  const data = await res.json()
  if (!res.ok) {
    // El cuerpo completo viaja con el error: algunos endpoints devuelven datos de diagnóstico
    // junto al mensaje (p. ej. los permisos que Meta concedió de verdad) y quedarse solo con
    // `error` los tiraba a la basura.
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.data = data; err.status = res.status
    throw err
  }
  return data
}

export const api = {
  get:    (path)        => request('GET',    path),
  post:   (path, body)  => request('POST',   path, body),
  put:    (path, body)  => request('PUT',    path, body),
  patch:  (path, body)  => request('PATCH',  path, body),
  delete: (path)        => request('DELETE', path),
  postForm: (path, formData) => uploadForm(path, formData),
}

// ── Socket.io singleton ────────────────────────────────────────────────────────

let _socket = null

export function getSocket() {
  if (!_socket) {
    _socket = io(BASE, {
      auth: { token: getToken() },
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
    })
  }
  return _socket
}

export function connectSocket(token) {
  const s = getSocket()
  if (token) {
    s.auth = { token }
    s.disconnect().connect()
  } else if (!s.connected) {
    s.connect()
  }
  return s
}

export function disconnectSocket() {
  if (_socket) {
    _socket.disconnect()
    _socket = null
  }
}
