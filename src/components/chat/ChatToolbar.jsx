import { useState, useEffect, useRef } from 'react'
import { listQuickReplies, createQuickReply, updateQuickReply, deleteQuickReply } from '../../lib/storage'
import { exportChatAsJson, exportChatAsMarkdown } from '../../lib/chatExport'
import { useAccount } from '../../context/AccountContext'
import VarAutocomplete from '../common/VarAutocomplete'
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
// `sections` elige qué botones renderizar (el toolbar ya no vive entero en el
// header: asignar queda arriba; respuestas rápidas y emojis van junto a la caja
// de texto). `up` abre los popovers hacia ARRIBA (cuando está junto al input).
export default function ChatToolbar({ accountId, conv, members = [], session, onInsertText, onSendAudio, onAssign, currentAssignee, sections = ['qr', 'emoji', 'assign', 'export'], up = false }) {
  const [openPanel, setOpenPanel] = useState(null) // 'qr' | 'emoji' | 'assign' | 'export' | null
  const ref = useRef(null)

  useEffect(() => {
    if (!openPanel) return
    function onDocClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpenPanel(null) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [openPanel])

  function toggle(p) { setOpenPanel(prev => prev === p ? null : p) }
  const upCls = up ? ` ${s.panelUp}` : ''

  return (
    <div className={s.wrap} ref={ref}>
      {sections.includes('qr') && <button className={s.btn} onClick={() => toggle('qr')} title="Respuestas rápidas">⚡</button>}
      {sections.includes('emoji') && <button className={s.btn} onClick={() => toggle('emoji')} title="Emojis">😀</button>}
      {sections.includes('assign') && (
        <button className={`${s.btn} ${currentAssignee ? s.btnAssigned : ''}`} onClick={() => toggle('assign')} title={currentAssignee ? `Asignado a ${currentAssignee.name}` : 'Asignar a un asesor'}>
          {currentAssignee ? '🎯' : '👤'} Asignar
        </button>
      )}
      {sections.includes('export') && <button className={s.btn} onClick={() => toggle('export')} title="Exportar chat">⤓</button>}

      {openPanel === 'qr' && (
        <div className={`${s.panelHost}${upCls} skinPop`}><QuickRepliesPanel accountId={accountId} onPick={txt => { onInsertText?.(txt); setOpenPanel(null) }} onSendAudio={qr => { onSendAudio?.(qr); setOpenPanel(null) }} /></div>
      )}
      {openPanel === 'emoji' && (
        <div className={`${s.panelHost}${upCls} skinPop`}><EmojiPanel onPick={e => onInsertText?.(e)} /></div>
      )}
      {openPanel === 'assign' && (
        <div className={`${s.panelHost}${upCls} skinPop`}>
          <AssignPanel
            members={members} currentAssignee={currentAssignee} session={session}
            onAssign={a => { onAssign?.(a); setOpenPanel(null) }}
          />
        </div>
      )}
      {openPanel === 'export' && (
        <div className={`${s.panelHost}${upCls} skinPop`}><ExportPanel conv={conv} onClose={() => setOpenPanel(null)} /></div>
      )}
    </div>
  )
}

// ── Quick replies ───────────────────────────────────────────────────────────
function QuickRepliesPanel({ accountId, onPick, onSendAudio }) {
  const { account } = useAccount()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ shortcut: '', title: '', content: '', media: '', mediaKind: '' })
  const [filter, setFilter] = useState('')

  async function reload() {
    setLoading(true)
    try { setList(await listQuickReplies(accountId)) } catch { setList([]) }
    setLoading(false)
  }
  useEffect(() => { if (accountId) reload() }, [accountId])

  async function save() {
    if (!form.title.trim() || (!form.content.trim() && !form.media)) return
    await createQuickReply(accountId, { shortcut: form.shortcut, title: form.title, content: form.content, mediaData: form.media || '', mediaKind: form.media ? (form.mediaKind || 'audio') : '' })
    setForm({ shortcut: '', title: '', content: '', media: '', mediaKind: '' })
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
          <VarAutocomplete multiline rows={3} placeholder="Contenido del mensaje (opcional si adjuntas audio) · usa {{nombre}}…"
            value={form.content} onChange={v => setForm(f => ({ ...f, content: v }))} variables={account?.variables || []} />
          <QRAudioRecorder value={form.media} onChange={(data, kind) => setForm(f => ({ ...f, media: data, mediaKind: kind || 'audio' }))} />
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
        {filtered.map(r => {
          const isAudio = !!r.mediaData
          return (
          <div key={r.id} className={s.qrItem}>
            <button className={s.qrPick} onClick={() => isAudio ? onSendAudio?.(r) : onPick(r.content)} title={isAudio ? 'Enviar audio al chat' : 'Insertar en el mensaje'}>
              <div className={s.qrTitle}>
                {r.shortcut && <code className={s.qrShortcut}>{r.shortcut}</code>}
                {isAudio && <span title="Audio pre-guardado">🎤</span>} {r.title}
              </div>
              <div className={s.qrPreview}>{isAudio ? '🔊 Audio · toca para enviarlo' : `${r.content.slice(0, 80)}${r.content.length > 80 ? '…' : ''}`}</div>
            </button>
            <button className={s.qrDelete} onClick={() => remove(r.id)} title="Eliminar">✕</button>
          </div>
          )
        })}
      </div>
    </div>
  )
}

// Grabadora/adjuntador de audio para una respuesta rápida (produce un data URL).
function QRAudioRecorder({ value, onChange }) {
  const [rec, setRec] = useState(null)
  const [secs, setSecs] = useState(0)
  const chunks = useRef([])
  const ivRef = useRef(null)
  const fileRef = useRef(null)
  const readToData = (blob, kind) => { if (blob.size > 3 * 1024 * 1024) { alert('El audio debe pesar menos de 3 MB.'); return } const r = new FileReader(); r.onload = () => onChange(String(r.result), kind); r.readAsDataURL(blob) }
  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunks.current = []
      mr.ondataavailable = e => { if (e.data?.size) chunks.current.push(e.data) }
      mr.onstop = () => { const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' }); readToData(blob, 'audio'); stream.getTracks().forEach(t => t.stop()) }
      mr.start(); setRec(mr); setSecs(0)
      ivRef.current = setInterval(() => setSecs(s => s + 1), 1000)
    } catch { alert('No se pudo acceder al micrófono.') }
  }
  function stop() { if (rec) { clearInterval(ivRef.current); rec.stop(); setRec(null) } }
  const btn = { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: 12 }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {!rec
        ? <button type="button" style={btn} onClick={start}>🎤 Grabar audio</button>
        : <button type="button" style={{ ...btn, color: '#ff5f5f', borderColor: '#ff5f5f' }} onClick={stop}>⏹ Detener ({secs}s)</button>}
      <button type="button" style={btn} onClick={() => fileRef.current?.click()}>Subir audio</button>
      <input ref={fileRef} type="file" accept="audio/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) readToData(f, 'audio'); if (fileRef.current) fileRef.current.value = '' }} />
      {value && !rec && (
        <>
          <audio src={value} controls style={{ height: 30, maxWidth: 160 }} />
          <button type="button" style={{ ...btn, color: '#ff5f5f' }} onClick={() => onChange('', '')}>Quitar</button>
        </>
      )}
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
