import { createPortal } from 'react-dom'
import { useNotifications } from '../../context/NotificationContext'
import { useAccount } from '../../context/AccountContext'
import s from './NotificationToasts.module.css'

const TYPE_COLORS = {
  message:  '#7c6fff',
  new_chat: '#3b82f6',
  flow:     '#22d98a',
  crm:      '#4fa8ff',
  error:    '#ff5f5f',
  mention:  '#f5a623',
  system:   '#888',
}

export default function NotificationToasts() {
  const { toasts, dismissToast, read } = useNotifications()
  const { openConversation } = useAccount()
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
            {t.meta?.convId && (
              <button
                onClick={() => { read(t.id); openConversation(t.meta.agId, t.meta.convId); dismissToast(t.toastId) }}
                style={{ marginTop: 6, padding: '4px 11px', borderRadius: 999, border: '1px solid var(--accent, #7c6fff)', background: 'transparent', color: 'var(--accent, #7c6fff)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
              >💬 Ir al chat</button>
            )}
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
