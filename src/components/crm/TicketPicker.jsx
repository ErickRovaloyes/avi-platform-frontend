import { useState, useRef, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'

// Selector de un ticket/deal (tarjeta del pipeline) para asociarlo a una tarea.
// value: { cardId, pipelineId, title } | null   ·   onChange(next | null)
export default function TicketPicker({ value, onChange }) {
  const { account } = useAccount()
  const pipelines = account?.pipelines || []
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const allCards = pipelines.flatMap(p => (p.cards || []).map(c => ({
    cardId: c.id, pipelineId: p.id, pipelineName: p.name, title: c.title, contact: c.contact,
  })))
  const shown = q
    ? allCards.filter(c => `${c.title || ''} ${c.contact || ''} ${c.pipelineName || ''}`.toLowerCase().includes(q.toLowerCase()))
    : allCards

  const inp = { width: '100%', boxSizing: 'border-box', padding: '7px 9px', fontSize: 12.5, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 7 }
  const btn = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text1)', cursor: 'pointer', fontSize: 12.5, textAlign: 'left' }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button type="button" style={btn} onClick={() => setOpen(o => !o)}>
        <span style={{ flex: 1, color: value ? 'var(--text1)' : 'var(--text3)' }}>
          {value ? `🧲 ${value.title}` : 'Vincular a un ticket/deal (opcional)'}
        </span>
        {value
          ? <span onClick={e => { e.stopPropagation(); onChange(null) }} style={{ color: 'var(--text3)', fontSize: 13 }}>✕</span>
          : <span style={{ opacity: .6, fontSize: 10 }}>▾</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 60, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.35)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <input autoFocus placeholder="Buscar ticket..." value={q} onChange={e => setQ(e.target.value)} style={inp} />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {shown.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--text3)' }}>{allCards.length ? 'Sin resultados.' : 'No hay tarjetas en tus pipelines todavía.'}</div>}
            {shown.map(c => (
              <div key={c.cardId} onClick={() => { onChange({ cardId: c.cardId, pipelineId: c.pipelineId, title: c.title }); setOpen(false) }}
                style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 12.5, color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600 }}>🧲 {c.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.pipelineName}{c.contact ? ` · 👤 ${c.contact}` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Resuelve el título de una tarjeta por su id (para mostrar el ticket vinculado).
export function findCardTitle(pipelines, cardId) {
  for (const p of pipelines || []) for (const c of p.cards || []) if (c.id === cardId) return c.title
  return null
}
