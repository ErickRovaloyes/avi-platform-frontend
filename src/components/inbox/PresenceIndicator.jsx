import { useEffect, useState, useRef } from 'react'
import { startPresence, stopPresence } from '../../lib/presenceService'

export default function PresenceIndicator({ accId, agId, convId, userId, userName, assignedTo }) {
  const [others, setOthers] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!convId || !userId) return
    startPresence(accId, agId, convId, userId, userName, setOthers)
    return () => stopPresence()
  }, [accId, agId, convId, userId])

  useEffect(() => {
    if (!open) return
    function onDocClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Build the full live list — current user is implicit; render others + "you".
  const all = [{ userId, userName, isMe: true }, ...others]
  const isMultiUser = others.length >= 1

  // Always render at least the "tú estás aquí" chip + assignment chip.
  // When multi-user, color it amber so the asesor sees that someone else is also working on the chat.
  const baseChipStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 11, padding: '3px 9px', borderRadius: 20,
    border: '1px solid', whiteSpace: 'nowrap', cursor: isMultiUser ? 'pointer' : 'default',
  }
  const multiColor   = '#f5a623'   // amber when more than one
  const soloColor    = '#22d98a'   // green when alone

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', gap: 6 }}>
      {/* Assignment chip — visible whenever there's an assignee */}
      {assignedTo && (
        <span style={{
          ...baseChipStyle, cursor: 'default',
          color: assignedTo.id === userId ? '#22d98a' : '#7c6fff',
          background: assignedTo.id === userId ? 'rgba(34,217,138,.1)' : 'rgba(124,111,255,.1)',
          borderColor: assignedTo.id === userId ? 'rgba(34,217,138,.35)' : 'rgba(124,111,255,.35)',
        }}
        title={`Asignado a ${assignedTo.name}`}>
          🎯 {assignedTo.id === userId ? 'Tú' : assignedTo.name}
        </span>
      )}

      {/* Presence chip — shows count + opens list of who's looking */}
      <span
        onClick={() => isMultiUser && setOpen(o => !o)}
        style={{
          ...baseChipStyle,
          color: isMultiUser ? multiColor : soloColor,
          background: isMultiUser ? 'rgba(245,166,35,.12)' : 'rgba(34,217,138,.1)',
          borderColor: isMultiUser ? 'rgba(245,166,35,.4)' : 'rgba(34,217,138,.35)',
        }}
        title={isMultiUser ? 'Hay varios asesores en este chat — clic para ver' : 'Solo tú estás viendo este chat'}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: isMultiUser ? multiColor : soloColor, display: 'inline-block' }} />
        {isMultiUser
          ? <>👥 {all.length} asesores aquí {open ? '▲' : '▼'}</>
          : <>👁 solo tú</>}
      </span>

      {/* Popover with the full live list */}
      {open && isMultiUser && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
          minWidth: 240, background: 'var(--bg2, #15171f)',
          border: '1px solid var(--border, #2a2d3a)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,.5)', overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>
            👥 Asesores viendo este chat ahora
          </div>
          {all.map((u, i) => (
            <div key={(u.userId || 'me') + i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', fontSize: 12, color: 'var(--text1)',
              borderBottom: i < all.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--accent-dim, rgba(124,111,255,.15))', color: 'var(--accent, #7c6fff)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
              }}>{(u.userName || 'A').slice(0,2).toUpperCase()}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{u.userName || 'Asesor'}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{u.isMe ? '(tú)' : 'en línea'}</div>
              </div>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22d98a' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
