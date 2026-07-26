import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import {
  getNotifications, pushNotification, markRead,
  markAllRead, deleteNotification, clearAll, unreadCount,
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
  const [notifs, setNotifs]   = useState(() => accId ? getNotifications(accId) : [])
  const [toasts, setToasts]   = useState([])       // notificaciones flotantes temporales
  const toastTimers = useRef({})

  // Recarga desde localStorage (se llama tras cada mutación)
  const reload = useCallback(() => {
    setNotifs(accId ? getNotifications(accId) : [])
  }, [accId])

  // Agrega una notificación y emite un toast temporal
  const notify = useCallback((notif, { silent = false } = {}) => {
    if (!accId) return
    // Respeta las preferencias del usuario para el canal Web (in-app).
    if (notif?.type && !isNotifEnabled(accId, userId, notif.prefKey || notif.type, 'web')) return
    const entry = pushNotification(accId, notif)
    reload()
    if (!silent && entry) {
      const toastId = entry.id
      setToasts(prev => [...prev, { ...entry, toastId }])
      toastTimers.current[toastId] = setTimeout(() => dismissToast(toastId), 5000)
      // Sonido opcional por tipo (preferencia del usuario en su perfil).
      if (isSoundEnabled(accId, userId, notif.prefKey || notif.type)) playNotifSound()
    }
    return entry
  }, [accId, userId, reload])

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
      })
    }
    socket.on('flow:error', onFlowError)
    return () => { socket.off('flow:error', onFlowError) }
  }, [accId, notify])

  function read(id) { markRead(accId, id); reload() }
  function readAll() { markAllRead(accId); reload() }
  function remove(id) { deleteNotification(accId, id); reload() }
  function clear() { clearAll(accId); reload() }

  const unread = notifs.filter(n => !n.read).length

  return (
    <Ctx.Provider value={{ notifs, toasts, unread, notify, read, readAll, remove, clear, dismissToast }}>
      {children}
    </Ctx.Provider>
  )
}

export function useNotifications() {
  return useContext(Ctx)
}
