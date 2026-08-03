import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import {
  fetchNotifications, pushNotification, markRead,
  markAllRead, deleteNotification, clearAll,
} from '../lib/notifications'
import { useAccount } from './AccountContext'
import { useAuth } from './AuthContext'
import { getSocket } from '../lib/api'
import { isNotifEnabled, isSoundEnabled } from '../lib/notifPrefs'
import { playNotifSound } from '../lib/notifSound'

const Ctx = createContext(null)

export function NotificationProvider({ children }) {
  const { account } = useAccount()
  const { session } = useAuth()
  const accId = account?.id
  const userId = session?.id

  // Lista completa y toasts activos
  const [notifs, setNotifs]   = useState([])
  const [toasts, setToasts]   = useState([])       // notificaciones flotantes temporales
  const toastTimers = useRef({})
  // Eventos que llegan ANTES de que la cuenta esté cargada: antes se descartaban y la
  // notificación se perdía para siempre. Ahora se encolan y se registran al montar.
  const pending = useRef([])

  // Recarga desde el backend (se llama al montar, al cambiar de cuenta y tras cada mutación)
  const reload = useCallback(async () => {
    if (!accId) { setNotifs([]); return }
    setNotifs(await fetchNotifications(accId))
  }, [accId])

  // Al llegar (o cambiar) la cuenta se traen las notificaciones guardadas. Sin esto la
  // campanita aparecía vacía en cada recarga aunque hubiera notificaciones sin leer.
  useEffect(() => { reload() }, [reload])

  // Agrega una notificación y emite un toast temporal
  const notify = useCallback(async (notif, { silent = false } = {}) => {
    if (!accId) { pending.current.push({ notif, silent }); return null }
    // Respeta las preferencias del usuario para el canal Web (in-app).
    if (notif?.type && !isNotifEnabled(accId, userId, notif.prefKey || notif.type, 'web')) return null
    const entry = await pushNotification(accId, notif)
    if (!entry) return null              // descartada por duplicada (otra pestaña la registró)
    setNotifs(prev => [entry, ...prev])
    if (!silent) {
      const toastId = entry.id
      setToasts(prev => [...prev, { ...entry, toastId }])
      toastTimers.current[toastId] = setTimeout(() => dismissToast(toastId), 5000)
      // Sonido opcional por tipo (preferencia del usuario en su perfil).
      if (isSoundEnabled(accId, userId, notif.prefKey || notif.type)) playNotifSound()
    }
    return entry
  }, [accId, userId])

  // Vacía la cola en cuanto hay cuenta.
  useEffect(() => {
    if (!accId || !pending.current.length) return
    const queued = pending.current
    pending.current = []
    queued.forEach(({ notif, silent }) => { notify(notif, { silent }) })
  }, [accId, notify])

  function dismissToast(toastId) {
    clearTimeout(toastTimers.current[toastId])
    delete toastTimers.current[toastId]
    setToasts(prev => prev.filter(t => t.toastId !== toastId))
  }

  // Puente socket → campanita: errores de EJECUCIÓN de flujos emitidos por el backend
  // (flow/engine.js). Dedup por texto+flujo en una ventana de 60s para no saturar.
  const lastFlowErr = useRef({})
  useEffect(() => {
    if (!accId) return
    const socket = getSocket()
    if (!socket) return
    const onFlowError = (p) => {
      if (!p || (p.accId && p.accId !== accId)) return
      const key = `${p.error || ''}|${p.flowId || ''}`
      const now = Date.now()
      if (lastFlowErr.current[key] && now - lastFlowErr.current[key] < 60000) return
      lastFlowErr.current[key] = now
      notify({
        type: 'error', prefKey: 'flow_error', icon: '⚠️',
        title: 'Error en un flujo',
        body: `${p.flowName ? p.flowName + (p.node ? ` · ${p.node}` : '') + ': ' : ''}${p.error || 'Fallo de ejecución'}`.slice(0, 240),
        link: 'flows',
        meta: { flowId: p.flowId, convId: p.convId, agId: p.agId },
        dedupeKey: `flowerr:${p.flowId || ''}:${Math.floor(now / 60000)}`,
      })
    }
    socket.on('flow:error', onFlowError)
    return () => { socket.off('flow:error', onFlowError) }
  }, [accId, notify])

  // Mutaciones optimistas: se refleja ya en la UI y se persiste en segundo plano.
  function read(id) { setNotifs(ns => ns.map(n => n.id === id ? { ...n, read: true } : n)); markRead(accId, id) }
  function readAll() { setNotifs(ns => ns.map(n => ({ ...n, read: true }))); markAllRead(accId) }
  function remove(id) { setNotifs(ns => ns.filter(n => n.id !== id)); deleteNotification(accId, id) }
  function clear() { setNotifs([]); clearAll(accId) }

  const unread = notifs.filter(n => !n.read).length

  return (
    <Ctx.Provider value={{ notifs, toasts, unread, notify, read, readAll, remove, clear, dismissToast, reload }}>
      {children}
    </Ctx.Provider>
  )
}

export function useNotifications() {
  return useContext(Ctx)
}
