import { createContext, useContext, useState, useCallback, useRef } from 'react'
import {
  getNotifications, pushNotification, markRead,
  markAllRead, deleteNotification, clearAll, unreadCount,
} from '../lib/notifications'
import { useAccount } from './AccountContext'

const Ctx = createContext(null)

export function NotificationProvider({ children }) {
  const { account } = useAccount()
  const accId = account?.id

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
    const entry = pushNotification(accId, notif)
    reload()
    if (!silent && entry) {
      const toastId = entry.id
      setToasts(prev => [...prev, { ...entry, toastId }])
      toastTimers.current[toastId] = setTimeout(() => dismissToast(toastId), 5000)
    }
    return entry
  }, [accId, reload])

  function dismissToast(toastId) {
    clearTimeout(toastTimers.current[toastId])
    delete toastTimers.current[toastId]
    setToasts(prev => prev.filter(t => t.toastId !== toastId))
  }

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
