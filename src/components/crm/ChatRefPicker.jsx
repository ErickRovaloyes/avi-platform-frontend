import { useState, useMemo } from 'react'
import { useAccount } from '../../context/AccountContext'

const CHANNEL_ICON = { webchat: '💬', whatsapp: '📱', messenger: '📘', instagram: '📸', test: '🧪' }

// Selector de chats para referenciar en un ticket. `value` es un array de refs
// { convId, agentId, guestName, channel }. Llama onChange con el nuevo array.
export default function ChatRefPicker({ value = [], onChange }) {
  const { visibleAgents, getConvos } = useAccount()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  // Todas las conversaciones de los agentes visibles
  const allChats = useMemo(() => {
    const out = []
    for (const ag of visibleAgents || []) {
      for (const c of getConvos(ag.id) || []) {
        out.push({ convId: c.id, agentId: ag.id, agentName: ag.name, guestName: c.guestName || c.guestId || c.id, channel: c.channel || 'webchat' })
      }
    }
    return out
  }, [visibleAgents, getConvos])

  const chosenIds = new Set(value.map(r => r.convId))
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return allChats.filter(c => !chosenIds.has(c.convId) && (!q || (c.guestName || '').toLowerCase().includes(q) || (c.agentName || '').toLowerCase().includes(q)))
                   .slice(0, 30)
  }, [allChats, search, value])

  function add(c) { onChange([...(value || []), c]); setSearch('') }
  function remove(convId) { onChange((value || []).filter(r => r.convId !== convId)) }

  const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 14, fontSize: 12, color: 'var(--text1)' }
  const inp = { padding: 8, fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6, width: '100%', boxSizing: 'border-box' }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Chats referenciados</div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {value.map(r => (
            <span key={r.convId} style={chip}>
              {CHANNEL_ICON[r.channel] || '💬'} {r.guestName}
              <button onClick={() => remove(r.convId)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13, padding: 0 }}>✕</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <input style={inp} placeholder="🔍 Buscar chat por nombre o agente…"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)} />
        {open && filtered.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, marginTop: 4, maxHeight: 200, overflowY: 'auto', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8 }}>
            {filtered.map(c => (
              <button key={c.convId} onMouseDown={() => add(c)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text1)', cursor: 'pointer', fontSize: 13 }}>
                {CHANNEL_ICON[c.channel] || '💬'} {c.guestName} <span style={{ color: 'var(--text3)', fontSize: 11 }}>· {c.agentName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
