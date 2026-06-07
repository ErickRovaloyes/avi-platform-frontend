import { useState, useEffect, useRef } from 'react'
import { listQuickReplies, createQuickReply, updateQuickReply, deleteQuickReply } from '../../lib/storage'
import { exportChatAsJson, exportChatAsMarkdown } from '../../lib/chatExport'
import s from './ChatToolbar.module.css'

// Small curated emoji list — keeps bundle slim, covers 95% of chat usage
const EMOJI_GROUPS = [
  { name: 'Recientes', emojis: ['👍','❤️','😂','🙏','🔥','👏','😍','🎉','✅','🤔'] },
  { name: 'Caras',     emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤐','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜','😝','🤤'] },
  { name: 'Gestos',    emojis: ['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐','🖖','👋','🤝','💪','🙏','✍️','💅','🤲','🫶','🫰','🫵','🫳','🫴'] },
  { name: 'Símbolos',  emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','💯','💢','💥','💫','💦','💨','🕳','💣','💬','💭','💤'] },
  { name: 'Objetos',   emojis: ['📎','📌','📍','🔗','📁','📂','📄','📃','📑','📊','📈','📉','📋','✏️','📝','💼','💰','💳','💎','📱','💻','⌨️','🖥','🖨','🖱','🎙','🎤','🎧','🔋','🔌'] },
  { name: 'Comida',    emojis: ['🍕','🍔','🍟','🌭','🥪','🌮','🌯','🥙','🥗','🍝','🍣','🍱','🍤','🍩','🍪','🎂','🍰','🍫','🍬','🍭','🍿','🍦','🍨','🍧','☕','🍵','🧋','🥤','🍷','🍺','🍻','🥂','🥃'] },
]

/**
 * Toolbar that sits in the chat header. Renders 4 popovers:
 *   ⚡ quick replies  — insert + manage saved messages
 *   😀 emoji picker   — append to text
 *   👤 assign        — assign the conversation to a team member
 *   ⤓ export         — download chat as JSON or Markdown
 *
 * Props:
 *   accountId, conv, members (team list), session
 *   onInsertText(str)         — called when a quick reply or emoji is picked (appends to input)
 *   onAssign(member|null)     — called when assignee changes
 *   currentAssignee (object | null)
 */
export default function ChatToolbar({ accountId, conv, members = [], session, onInsertText, onAssign, currentAssignee }) {
  const [openPanel, setOpenPanel] = useState(null) // 'qr' | 'emoji' | 'assign' | 'export' | null
  const ref = useRef(null)

  useEffect(() => {
    if (!openPanel) return
    function onDocClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpenPanel(null) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [openPanel])

  function toggle(p) { setOpenPanel(prev => prev === p ? null : p) }

  return (
    <div className={s.wrap} ref={ref}>
      <button className={s.btn} onClick={() => toggle('qr')}     title="Respuestas rápidas">⚡</button>
      <button className={s.btn} onClick={() => toggle('emoji')}  title="Emojis">😀</button>
      <button className={`${s.btn} ${currentAssignee ? s.btnAssigned : ''}`} onClick={() => toggle('assign')} title={currentAssignee ? `Asignado a ${currentAssignee.name}` : 'Asignar a un asesor'}>
        {currentAssignee ? '🎯' : '👤'}
      </button>
      <button className={s.btn} onClick={() => toggle('export')} title="Exportar chat">⤓</button>

      {openPanel === 'qr' && (
        <QuickRepliesPanel accountId={accountId} onPick={txt => { onInsertText?.(txt); setOpenPanel(null) }} />
      )}
      {openPanel === 'emoji' && (
        <EmojiPanel onPick={e => onInsertText?.(e)} />
      )}
      {openPanel === 'assign' && (
        <AssignPanel
          members={members} currentAssignee={currentAssignee} session={session}
          onAssign={a => { onAssign?.(a); setOpenPanel(null) }}
        />
      )}
      {openPanel === 'export' && (
        <ExportPanel conv={conv} onClose={() => setOpenPanel(null)} />
      )}
    </div>
  )
}

// ── Quick replies ───────────────────────────────────────────────────────────
function QuickRepliesPanel({ accountId, onPick }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ shortcut: '', title: '', content: '' })
  const [filter, setFilter] = useState('')

  async function reload() {
    setLoading(true)
    try { setList(await listQuickReplies(accountId)) } catch { setList([]) }
    setLoading(false)
  }
  useEffect(() => { if (accountId) reload() }, [accountId])

  async function save() {
    if (!form.title.trim() || !form.content.trim()) return
    await createQuickReply(accountId, form)
    setForm({ shortcut: '', title: '', content: '' })
    setCreating(false); reload()
  }
  async function remove(id) {
    if (!confirm('¿Eliminar esta respuesta rápida?')) return
    await deleteQuickReply(accountId, id); reload()
  }

  const filtered = list.filter(r =>
    !filter || r.title.toLowerCase().includes(filter.toLowerCase()) ||
    r.shortcut?.toLowerCase().includes(filter.toLowerCase()) ||
    r.content.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className={s.panel} style={{ width: 360 }}>
      <div className={s.panelHdr}>
        <span>⚡ Respuestas rápidas</span>
        <button className={s.smallBtn} onClick={() => setCreating(c => !c)}>{creating ? '✕' : '+ Nueva'}</button>
      </div>
      {creating && (
        <div className={s.qrForm}>
          <input placeholder="Atajo (ej: /saludo)" value={form.shortcut} onChange={e => setForm(f => ({ ...f, shortcut: e.target.value }))} />
          <input placeholder="Título" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <textarea placeholder="Contenido del mensaje" rows={3} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className={s.smallBtn} onClick={() => { setCreating(false); setForm({ shortcut: '', title: '', content: '' }) }}>Cancelar</button>
            <button className={`${s.smallBtn} ${s.primary}`} onClick={save}>Guardar</button>
          </div>
        </div>
      )}
      {!creating && (
        <input className={s.searchInput} placeholder="Buscar..." value={filter} onChange={e => setFilter(e.target.value)} />
      )}
      <div className={s.qrList}>
        {loading && <div className={s.empty}>Cargando...</div>}
        {!loading && filtered.length === 0 && <div className={s.empty}>{list.length === 0 ? 'Sin respuestas rápidas todavía. Crea una arriba.' : 'Sin resultados.'}</div>}
        {filtered.map(r => (
          <div key={r.id} className={s.qrItem}>
            <button className={s.qrPick} onClick={() => onPick(r.content)} title="Insertar en el mensaje">
              <div className={s.qrTitle}>
                {r.shortcut && <code className={s.qrShortcut}>{r.shortcut}</code>}
                {r.title}
              </div>
              <div className={s.qrPreview}>{r.content.slice(0, 80)}{r.content.length > 80 ? '…' : ''}</div>
            </button>
            <button className={s.qrDelete} onClick={() => remove(r.id)} title="Eliminar">✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Emoji panel ─────────────────────────────────────────────────────────────
function EmojiPanel({ onPick }) {
  const [group, setGroup] = useState(EMOJI_GROUPS[0].name)
  const current = EMOJI_GROUPS.find(g => g.name === group) || EMOJI_GROUPS[0]
  return (
    <div className={s.panel} style={{ width: 320 }}>
      <div className={s.panelHdr}>
        <span>😀 Emojis</span>
      </div>
      <div className={s.emojiGroups}>
        {EMOJI_GROUPS.map(g => (
          <button key={g.name} className={`${s.emojiGroupBtn} ${g.name === group ? s.emojiGroupActive : ''}`} onClick={() => setGroup(g.name)}>
            {g.emojis[0]}
          </button>
        ))}
      </div>
      <div className={s.emojiGrid}>
        {current.emojis.map((e, i) => (
          <button key={i} className={s.emojiBtn} onClick={() => onPick(e)}>{e}</button>
        ))}
      </div>
    </div>
  )
}

// ── Assign panel ────────────────────────────────────────────────────────────
function AssignPanel({ members, currentAssignee, session, onAssign }) {
  return (
    <div className={s.panel} style={{ width: 280 }}>
      <div className={s.panelHdr}>
        <span>👤 Asignar conversación</span>
      </div>
      <div className={s.qrList}>
        <button className={`${s.assignItem} ${!currentAssignee ? s.assignActive : ''}`} onClick={() => onAssign(null)}>
          <span className={s.assignAvatar}>—</span>
          <div>
            <div className={s.assignName}>Sin asignar</div>
            <div className={s.assignSub}>Cualquier miembro puede responder</div>
          </div>
        </button>
        <button className={`${s.assignItem} ${currentAssignee?.id === session?.id ? s.assignActive : ''}`} onClick={() => onAssign({ id: session?.id, name: session?.name })}>
          <span className={s.assignAvatar} style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>{session?.name?.slice(0,2).toUpperCase() || 'YO'}</span>
          <div>
            <div className={s.assignName}>Asignar a mí ({session?.name})</div>
            <div className={s.assignSub}>Tomar esta conversación</div>
          </div>
        </button>
        <div className={s.divider}>— Otros miembros —</div>
        {members.filter(m => m.id !== session?.id).map(m => (
          <button key={m.id} className={`${s.assignItem} ${currentAssignee?.id === m.id ? s.assignActive : ''}`} onClick={() => onAssign({ id: m.id, name: m.name })}>
            <span className={s.assignAvatar}>{(m.avatar || m.name?.slice(0,2) || 'M').toUpperCase()}</span>
            <div>
              <div className={s.assignName}>{m.name}</div>
              <div className={s.assignSub}>{m.email}</div>
            </div>
          </button>
        ))}
        {members.length <= 1 && <div className={s.empty}>Sin más miembros en el equipo.</div>}
      </div>
    </div>
  )
}

// ── Export panel ────────────────────────────────────────────────────────────
function ExportPanel({ conv, onClose }) {
  return (
    <div className={s.panel} style={{ width: 240 }}>
      <div className={s.panelHdr}><span>⤓ Exportar conversación</span></div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className={`${s.smallBtn} ${s.primary}`} onClick={() => { exportChatAsJson(conv); onClose() }}>📋 JSON (estructurado)</button>
        <button className={`${s.smallBtn} ${s.primary}`} onClick={() => { exportChatAsMarkdown(conv); onClose() }}>📝 Markdown (legible)</button>
        <div className={s.empty} style={{ fontSize: 10 }}>Incluye {conv?.messages?.length || 0} mensaje{conv?.messages?.length === 1 ? '' : 's'}.</div>
      </div>
    </div>
  )
}
