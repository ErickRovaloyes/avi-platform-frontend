import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNotifications } from '../../context/NotificationContext'
import { groupByDay } from '../../lib/notifications'
import s from './NotificationCenter.module.css'

const TYPE_COLORS = {
  message: '#7c6fff',
  flow:    '#22d98a',
  crm:     '#4fa8ff',
  error:   '#ff5f5f',
  mention: '#f5a623',
  system:  '#888',
}
const TYPE_LABELS = {
  message: 'Mensaje',
  flow:    'Flujo',
  crm:     'CRM',
  error:   'Error',
  mention: 'Mención',
  system:  'Sistema',
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

export default function NotificationCenter({ onNavigate, onRegister }) {
  const [open, setOpen] = useState(false)
  const [view, setView]   = useState('unread') // 'unread' | 'read'
  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const { notifs, unread, read, readAll, remove, clear, notify } = useNotifications()

  // Registra la función notify para que el componente padre pueda emitir notificaciones
  useLayoutEffect(() => { onRegister?.(notify) }, [notify, onRegister])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (!btnRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Split & group
  const unreadNotifs = notifs.filter(n => !n.read)
  const readNotifs   = notifs.filter(n => n.read)
  const current      = view === 'unread' ? unreadNotifs : readNotifs
  const groups       = groupByDay(current)

  // Panel position: anchored below the bell button
  const [pos, setPos] = useState(null)
  function openPanel() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
    }
    setOpen(v => !v)
  }

  function handleNotifClick(notif) {
    read(notif.id)
    if (notif.link && onNavigate) onNavigate(notif.link)
  }

  return (
    <>
      {/* ── Bell button ── */}
      <button
        ref={btnRef}
        className={`${s.bell} ${open ? s.bellActive : ''}`}
        onClick={openPanel}
        title="Notificaciones"
        aria-label={`Notificaciones${unread > 0 ? ` (${unread} sin leer)` : ''}`}
      >
        <svg className={s.bellIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span className={s.badge}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {/* ── Dropdown panel (portal) ── */}
      {open && pos && createPortal(
        <div
          ref={panelRef}
          className={s.panel}
          style={{ top: pos.top, right: pos.right }}
        >
          {/* Header */}
          <div className={s.header}>
            <h3 className={s.headerTitle}>Notificaciones</h3>
            <div className={s.headerActions}>
              {unread > 0 && (
                <button className={s.actionBtn} onClick={readAll} title="Marcar todas como leídas">
                  ✓ Todo leído
                </button>
              )}
              {notifs.length > 0 && (
                <button className={s.actionBtn} onClick={() => { if (confirm('¿Borrar todas las notificaciones?')) clear() }} title="Borrar todo">
                  🗑
                </button>
              )}
              <button className={s.closeBtn} onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>

          {/* Tabs: no leídas / leídas */}
          <div className={s.tabs}>
            <button
              className={`${s.tab} ${view === 'unread' ? s.tabActive : ''}`}
              onClick={() => setView('unread')}
            >
              Sin leer
              {unread > 0 && <span className={s.tabBadge}>{unread}</span>}
            </button>
            <button
              className={`${s.tab} ${view === 'read' ? s.tabActive : ''}`}
              onClick={() => setView('read')}
            >
              Leídas
              {readNotifs.length > 0 && <span className={s.tabBadgeGray}>{readNotifs.length}</span>}
            </button>
          </div>

          {/* List */}
          <div className={s.list}>
            {groups.length === 0 ? (
              <div className={s.empty}>
                <div className={s.emptyIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="36" height="36">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                </div>
                <p>{view === 'unread' ? '¡Todo al día! No hay notificaciones sin leer.' : 'No hay notificaciones leídas.'}</p>
              </div>
            ) : (
              groups.map(group => (
                <div key={group.label} className={s.group}>
                  <div className={s.dayLabel}>{group.label}</div>
                  {group.items.map(n => (
                    <div
                      key={n.id}
                      className={`${s.item} ${!n.read ? s.itemUnread : ''}`}
                      style={{ '--c': TYPE_COLORS[n.type] || '#888' }}
                      onClick={() => handleNotifClick(n)}
                    >
                      <div className={s.itemIcon}>{n.icon || '🔔'}</div>
                      <div className={s.itemBody}>
                        <div className={s.itemRow1}>
                          <span className={s.itemTitle}>{n.title}</span>
                          <span className={s.itemTime}>{fmtTime(n.ts)}</span>
                        </div>
                        {n.body && <div className={s.itemText}>{n.body}</div>}
                        <div className={s.itemMeta}>
                          <span className={s.typePill} style={{ color: TYPE_COLORS[n.type], background: (TYPE_COLORS[n.type] || '#888') + '18' }}>
                            {TYPE_LABELS[n.type] || n.type}
                          </span>
                        </div>
                      </div>
                      <div className={s.itemSide}>
                        {!n.read && <span className={s.unreadDot} />}
                        <button
                          className={s.itemDelete}
                          onClick={e => { e.stopPropagation(); remove(n.id) }}
                          title="Eliminar"
                        >✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
