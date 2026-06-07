import { createPortal } from 'react-dom'
import { useNotifications } from '../../context/NotificationContext'
import s from './NotificationToasts.module.css'

const TYPE_COLORS = {
  message: '#7c6fff',
  flow:    '#22d98a',
  crm:     '#4fa8ff',
  error:   '#ff5f5f',
  mention: '#f5a623',
  system:  '#888',
}

export default function NotificationToasts() {
  const { toasts, dismissToast, read } = useNotifications()
  if (!toasts.length) return null

  return createPortal(
    <div className={s.stack}>
      {toasts.map(t => (
        <div
          key={t.toastId}
          className={s.toast}
          style={{ '--c': TYPE_COLORS[t.type] || '#7c6fff' }}
        >
          <div className={s.accent} />
          <div className={s.iconWrap}>{t.icon || '🔔'}</div>
          <div className={s.body}>
            <div className={s.title}>{t.title}</div>
            {t.body && <div className={s.text}>{t.body}</div>}
          </div>
          <button
            className={s.close}
            onClick={() => { read(t.id); dismissToast(t.toastId) }}
            title="Cerrar"
          >✕</button>
          {/* Barra de progreso */}
          <div className={s.progress} />
        </div>
      ))}
    </div>,
    document.body
  )
}
