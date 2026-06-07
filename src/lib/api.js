import { io } from 'socket.io-client'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'
export const API_BASE = BASE
const TOKEN_KEY = 'avi_jwt'

export function getToken()    { return sessionStorage.getItem(TOKEN_KEY) || '' }
export function setToken(t)   { sessionStorage.setItem(TOKEN_KEY, t) }
export function clearToken()  { sessionStorage.removeItem(TOKEN_KEY) }

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
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

async function uploadForm(path, formData) {
  const t = getToken()
  const opts = { method: 'POST', body: formData, headers: {} }
  if (t) opts.headers['Authorization'] = `Bearer ${t}`
  const res = await fetch(BASE + path, opts)
  if (res.status === 204) return null
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
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
