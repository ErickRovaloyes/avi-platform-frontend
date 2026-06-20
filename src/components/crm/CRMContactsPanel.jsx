import { useState, useEffect, useMemo, useRef } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  listContacts, createContact, updateContact, deleteContact,
  crmListNotes, crmCreateNote, crmDeleteNote,
  crmListTasks, crmCreateTask, crmUpdateTask, crmDeleteTask,
  crmListActivity, listContactConversations, importContacts,
} from '../../lib/storage'
import s from './CRMPanel.module.css'

// Parser CSV mínimo pero correcto (comillas, comas y saltos de línea escapados).
function parseCsv(text) {
  const rows = []; let row = [], field = '', inQ = false
  const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (inQ) {
      if (ch === '"') { if (t[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += ch
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.length)
}

function fmtDate(ts) {
  if (!ts) return ''
  return new Date(Number(ts)).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtDay(ts) {
  if (!ts) return ''
  return new Date(Number(ts)).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}
function relativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - Number(ts)
  if (diff < 60000)    return 'hace un momento'
  if (diff < 3600000)  return `hace ${Math.floor(diff / 60000)} min`
  if (diff < 86400000) return `hace ${Math.floor(diff / 3600000)} h`
  if (diff < 7 * 86400000) return `hace ${Math.floor(diff / 86400000)} d`
  return fmtDay(ts)
}

export default function CRMContactsPanel() {
  const { account } = useAccount()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft]       = useState({ name: '', email: '', phone: '', companyName: '', position: '', tags: '' })
  const [importing, setImporting] = useState(false)
  const fileRef = useRef(null)

  async function reload() {
    if (!account?.id) return
    setLoading(true)
    try { setContacts(await listContacts(account.id)) } catch { setContacts([]) }
    setLoading(false)
  }
  useEffect(() => { reload() }, [account?.id])

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts
    const q = search.toLowerCase()
    return contacts.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.companyName || '').toLowerCase().includes(q) ||
      (Array.isArray(c.tags) ? c.tags.join(' ').toLowerCase() : '').includes(q)
    )
  }, [contacts, search])

  const selected = contacts.find(c => c.id === selectedId)

  async function saveNewContact() {
    if (!draft.name.trim()) return
    const tags = draft.tags.split(',').map(t => t.trim()).filter(Boolean)
    await createContact(account.id, { ...draft, tags })
    setCreating(false)
    setDraft({ name: '', email: '', phone: '', companyName: '', position: '', tags: '' })
    reload()
  }

  // ── Exportar a CSV (desde los contactos ya cargados) ──────────────────────────
  function exportCsv() {
    const base = ['name', 'email', 'phone', 'companyName', 'position', 'tags']
    const extra = []
    contacts.forEach(c => Object.keys(c).forEach(k => {
      if (k !== 'id' && k !== 'createdAt' && !base.includes(k) && !extra.includes(k)) extra.push(k)
    }))
    const cols = [...base, ...extra]
    const esc = v => {
      const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v)
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [cols.join(',')]
    contacts.forEach(c => lines.push(cols.map(k => esc(c[k])).join(',')))
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'contactos.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  // ── Importar desde CSV ────────────────────────────────────────────────────────
  async function importCsv(file) {
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (rows.length < 2) { alert('El CSV no tiene filas.'); setImporting(false); return }
      const header = rows[0].map(h => h.trim())
      const norm = h => h.toLowerCase()
      const idx = (names) => header.findIndex(h => names.includes(norm(h)))
      const iName = idx(['name', 'nombre'])
      const iEmail = idx(['email', 'correo', 'e-mail'])
      const iPhone = idx(['phone', 'telefono', 'teléfono', 'celular', 'whatsapp', 'movil', 'móvil'])
      const iCompany = idx(['companyname', 'empresa', 'company'])
      const iPos = idx(['position', 'cargo', 'puesto'])
      const iTags = idx(['tags', 'etiquetas'])
      const contactsArr = rows.slice(1).filter(r => r.some(v => (v || '').trim())).map(r => {
        const c = {
          name: iName >= 0 ? (r[iName] || '').trim() : '',
          email: iEmail >= 0 ? (r[iEmail] || '').trim() : '',
          phone: iPhone >= 0 ? (r[iPhone] || '').trim() : '',
        }
        if (iCompany >= 0 && r[iCompany]) c.companyName = r[iCompany].trim()
        if (iPos >= 0 && r[iPos]) c.position = r[iPos].trim()
        if (iTags >= 0 && r[iTags]) c.tags = r[iTags].split(/[;,]/).map(t => t.trim()).filter(Boolean)
        return c
      })
      if (!contactsArr.length) { alert('No se reconocieron contactos. Asegúrate de que el CSV tenga columnas name/email/phone.'); setImporting(false); return }
      const r = await importContacts(account.id, contactsArr, true)
      alert(`✓ Importados ${r.imported} contacto(s)${r.skipped ? ` · ${r.skipped} omitido(s) (duplicados o vacíos)` : ''}.`)
      reload()
    } catch (e) { alert('No se pudo importar: ' + (e?.message || 'error')) }
    setImporting(false)
  }

  return (
    <div className={s.contactsRoot}>
      {/* ── Left: list ─────────────────────────────────────────────── */}
      <aside className={s.contactsList}>
        <div className={s.contactsToolbar}>
          <input placeholder="🔍 Buscar nombre, email, empresa, tag..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className={s.smallBtn} onClick={() => setCreating(c => !c)}>{creating ? '✕' : '+'}</button>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
          <button className={s.smallBtn} style={{ flex: 1, fontSize: 11 }} disabled={importing} onClick={() => fileRef.current?.click()}>{importing ? 'Importando…' : '⬆ Importar CSV'}</button>
          <button className={s.smallBtn} style={{ flex: 1, fontSize: 11 }} disabled={!contacts.length} onClick={exportCsv}>⬇ Exportar CSV</button>
          <input ref={fileRef} type="file" hidden accept=".csv,text/csv" onChange={e => { importCsv(e.target.files?.[0]); if (fileRef.current) fileRef.current.value = '' }} />
        </div>
        {creating && (
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input placeholder="Nombre *" value={draft.name}        onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}        style={{ padding: 6, fontSize: 12, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }} />
            <input placeholder="Email"    value={draft.email}       onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}       style={{ padding: 6, fontSize: 12, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }} />
            <input placeholder="Teléfono" value={draft.phone}       onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}       style={{ padding: 6, fontSize: 12, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }} />
            <input placeholder="Empresa"  value={draft.companyName} onChange={e => setDraft(d => ({ ...d, companyName: e.target.value }))} style={{ padding: 6, fontSize: 12, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }} />
            <input placeholder="Cargo"    value={draft.position}    onChange={e => setDraft(d => ({ ...d, position: e.target.value }))}    style={{ padding: 6, fontSize: 12, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }} />
            <input placeholder="Tags (coma)" value={draft.tags}     onChange={e => setDraft(d => ({ ...d, tags: e.target.value }))}        style={{ padding: 6, fontSize: 12, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }} />
            <button className={s.primaryBtn} onClick={saveNewContact}>Guardar</button>
          </div>
        )}
        <div className={s.contactsScroll}>
          {loading && <div className={s.contactsEmpty}>Cargando...</div>}
          {!loading && filtered.length === 0 && (
            <div className={s.contactsEmpty}>
              {contacts.length === 0 ? 'Sin contactos todavía. Crea el primero con +.' : 'Sin resultados.'}
            </div>
          )}
          {filtered.map(c => (
            <button key={c.id}
              className={`${s.contactItem} ${selectedId === c.id ? s.contactItemActive : ''}`}
              onClick={() => setSelectedId(c.id)}
            >
              <span className={s.contactAvatar}>{(c.name || '?').slice(0, 2).toUpperCase()}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className={s.contactName}>{c.name || '(sin nombre)'}</div>
                <div className={s.contactSub}>{c.companyName ? `🏢 ${c.companyName} · ` : ''}{c.email || c.phone || ''}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* ── Right: detail ──────────────────────────────────────────── */}
      <main className={s.contactDetail}>
        {!selected ? (
          <div className={s.empty} style={{ marginTop: 60 }}>Selecciona un contacto para ver su detalle, notas, tareas y timeline.</div>
        ) : (
          <ContactDetail key={selected.id} contact={selected} onChange={reload} />
        )}
      </main>
    </div>
  )
}

// ── Contact detail (notas + tareas + timeline + edición inline) ────────────
function ContactDetail({ contact, onChange }) {
  const { account, visibleAgents } = useAccount()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    name: contact.name || '', email: contact.email || '', phone: contact.phone || '',
    companyName: contact.companyName || '', position: contact.position || '',
    tags: (contact.tags || []).join(', '),
  })

  const [notes, setNotes]             = useState([])
  const [tasks, setTasks]             = useState([])
  const [activity, setActivity]       = useState([])
  const [convos, setConvos]           = useState([])
  const [newNote, setNewNote]         = useState('')
  const [newTask, setNewTask]         = useState({ title: '', dueAt: '', priority: 'normal' })
  const [creatingTask, setCreatingTask] = useState(false)

  const CHANNEL_ICON = { webchat: '💬', whatsapp: '📱', messenger: '📘', instagram: '📸', test: '🧪' }

  async function reload() {
    if (!account?.id) return
    const [n, t, a, cv] = await Promise.all([
      crmListNotes(account.id,            { targetType: 'contact', targetId: contact.id }).catch(() => []),
      crmListTasks(account.id,            { targetType: 'contact', targetId: contact.id }).catch(() => []),
      crmListActivity(account.id,         { targetType: 'contact', targetId: contact.id, limit: 50 }).catch(() => []),
      listContactConversations(account.id, contact.id).catch(() => []),
    ])
    setNotes(n); setTasks(t); setActivity(a); setConvos(cv || [])
  }
  useEffect(() => { reload() }, [contact.id])

  async function saveEdit() {
    const tags = draft.tags.split(',').map(t => t.trim()).filter(Boolean)
    await updateContact(account.id, contact.id, { ...draft, tags })
    setEditing(false); onChange()
  }
  async function removeContact() {
    if (!confirm(`¿Eliminar el contacto "${contact.name}"?`)) return
    await deleteContact(account.id, contact.id); onChange()
  }

  async function addNote() {
    if (!newNote.trim()) return
    await crmCreateNote(account.id, { targetType: 'contact', targetId: contact.id, content: newNote.trim() })
    setNewNote(''); reload()
  }
  async function removeNote(id) {
    if (!confirm('¿Eliminar esta nota?')) return
    await crmDeleteNote(account.id, id); reload()
  }
  async function addTask() {
    if (!newTask.title.trim()) return
    const dueAt = newTask.dueAt ? new Date(newTask.dueAt).getTime() : null
    await crmCreateTask(account.id, { targetType: 'contact', targetId: contact.id, ...newTask, dueAt })
    setNewTask({ title: '', dueAt: '', priority: 'normal' }); setCreatingTask(false); reload()
  }
  async function toggleTask(t) {
    await crmUpdateTask(account.id, t.id, { status: t.status === 'done' ? 'open' : 'done' }); reload()
  }
  async function removeTask(id) {
    if (!confirm('¿Eliminar esta tarea?')) return
    await crmDeleteTask(account.id, id); reload()
  }

  return (
    <div>
      {/* Header */}
      <div className={s.contactHeader}>
        <span className={s.contactBigAvatar}>{(contact.name || '?').slice(0, 2).toUpperCase()}</span>
        <div style={{ flex: 1 }}>
          <div className={s.contactTitle}>{contact.name || '(sin nombre)'}</div>
          <div className={s.contactMeta}>
            {contact.position && <>{contact.position}{contact.companyName && ' · '}</>}
            {contact.companyName && <span>🏢 {contact.companyName}</span>}
          </div>
        </div>
        <button className={s.smallBtn} onClick={() => setEditing(e => !e)}>{editing ? 'Cancelar' : '✏ Editar'}</button>
        <button className={`${s.smallBtn} ${s.smallBtnDanger}`} onClick={removeContact}>🗑</button>
      </div>

      {/* Info card / Edit form */}
      <div className={s.contactCard}>
        <div className={s.contactCardTitle}>Información de contacto</div>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input placeholder="Nombre" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={{ padding: 8, fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }} />
            <input placeholder="Email"  value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} style={{ padding: 8, fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }} />
            <input placeholder="Teléfono" value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} style={{ padding: 8, fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }} />
            <input placeholder="Empresa" value={draft.companyName} onChange={e => setDraft(d => ({ ...d, companyName: e.target.value }))} style={{ padding: 8, fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }} />
            <input placeholder="Cargo" value={draft.position} onChange={e => setDraft(d => ({ ...d, position: e.target.value }))} style={{ padding: 8, fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }} />
            <input placeholder="Tags (separadas por coma)" value={draft.tags} onChange={e => setDraft(d => ({ ...d, tags: e.target.value }))} style={{ padding: 8, fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }} />
            <button className={s.primaryBtn} onClick={saveEdit}>Guardar cambios</button>
          </div>
        ) : (
          <>
            {contact.email && <div className={s.field}><span className={s.fieldLabel}>✉️ Email</span><span className={s.fieldValue}>{contact.email}</span></div>}
            {contact.phone && <div className={s.field}><span className={s.fieldLabel}>📞 Tel</span><span className={s.fieldValue}>{contact.phone}</span></div>}
            {contact.companyName && <div className={s.field}><span className={s.fieldLabel}>🏢 Empresa</span><span className={s.fieldValue}>{contact.companyName}</span></div>}
            {contact.position && <div className={s.field}><span className={s.fieldLabel}>💼 Cargo</span><span className={s.fieldValue}>{contact.position}</span></div>}
            {contact.tags?.length > 0 && <div className={s.field}><span className={s.fieldLabel}>🏷 Tags</span><span className={s.fieldValue}>{contact.tags.map(t => <span key={t} className={s.taskTag}>{t}</span>)}</span></div>}
            <div className={s.field}><span className={s.fieldLabel}>📅 Creado</span><span className={s.fieldValue}>{fmtDate(contact.createdAt)}</span></div>
            {!contact.email && !contact.phone && !contact.companyName && <div className={s.empty}>Sin datos adicionales. Haz clic en ✏ para editar.</div>}
          </>
        )}
      </div>

      {/* Notes */}
      <div className={s.contactCard}>
        <div className={s.contactCardTitle}>📝 Notas <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({notes.length})</span></div>
        <div className={s.composeArea}>
          <textarea placeholder="Añade una nota..." rows={2} value={newNote} onChange={e => setNewNote(e.target.value)} />
          <div className={s.composeFooter}>
            <button className={s.primaryBtn} onClick={addNote} disabled={!newNote.trim()}>Guardar nota</button>
          </div>
        </div>
        {notes.length === 0 && <div className={s.empty}>Sin notas todavía.</div>}
        {notes.map(n => (
          <div key={n.id} className={s.item}>
            <div className={s.itemHead}>
              <span className={s.itemAuthor}>👤 {n.authorName || 'Anónimo'}</span>
              <span className={s.itemTime}>{relativeTime(n.ts)}</span>
            </div>
            <div className={s.itemBody}>{n.content}</div>
            <div className={s.itemActions}>
              <button className={`${s.smallBtn} ${s.smallBtnDanger}`} onClick={() => removeNote(n.id)}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>

      {/* Tasks */}
      <div className={s.contactCard}>
        <div className={s.contactCardTitle}>
          ✅ Tareas <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({tasks.filter(t => t.status === 'open').length} abiertas)</span>
          <button className={s.smallBtn} onClick={() => setCreatingTask(c => !c)}>{creatingTask ? 'Cancelar' : '+ Tarea'}</button>
        </div>
        {creatingTask && (
          <div className={s.composeArea}>
            <input placeholder="Título de la tarea" value={newTask.title} onChange={e => setNewTask(t => ({ ...t, title: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="datetime-local" value={newTask.dueAt} onChange={e => setNewTask(t => ({ ...t, dueAt: e.target.value }))} style={{ flex: 1 }} />
              <select value={newTask.priority} onChange={e => setNewTask(t => ({ ...t, priority: e.target.value }))} style={{ padding: 8, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }}>
                <option value="low">Baja</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
              </select>
            </div>
            <div className={s.composeFooter}>
              <button className={s.primaryBtn} onClick={addTask} disabled={!newTask.title.trim()}>Crear tarea</button>
            </div>
          </div>
        )}
        {tasks.length === 0 && <div className={s.empty}>Sin tareas todavía.</div>}
        {tasks.map(t => {
          const overdue = t.status === 'open' && t.dueAt && t.dueAt < Date.now()
          const soon    = t.status === 'open' && t.dueAt && !overdue && t.dueAt < Date.now() + 86400000
          return (
            <div key={t.id} className={`${s.item} ${t.status === 'done' ? s.taskDone : ''} ${overdue ? s.taskOverdue : ''}`}>
              <div className={s.itemHead}>
                <span className={s.itemAuthor}>
                  {t.status === 'done' ? '✅' : '⬜'} {t.title}
                  {t.priority === 'high' && <span className={s.taskTag} style={{ background: 'rgba(255,80,80,.1)', color: '#ff5050' }}>alta</span>}
                  {overdue && <span className={`${s.taskTag} ${s.taskTagOverdue}`}>vencida</span>}
                  {soon    && <span className={`${s.taskTag} ${s.taskTagSoon}`}>pronto</span>}
                </span>
                {t.dueAt && <span className={s.itemTime}>📅 {fmtDate(t.dueAt)}</span>}
              </div>
              {t.description && <div className={s.itemBody}>{t.description}</div>}
              <div className={s.itemActions}>
                <button className={`${s.smallBtn} ${t.status === 'done' ? '' : s.smallBtnDone}`} onClick={() => toggleTask(t)}>
                  {t.status === 'done' ? '↺ Reabrir' : '✓ Completar'}
                </button>
                <button className={`${s.smallBtn} ${s.smallBtnDanger}`} onClick={() => removeTask(t.id)}>Eliminar</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Conversations */}
      <div className={s.contactCard}>
        <div className={s.contactCardTitle}>💬 Conversaciones <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({convos.length})</span></div>
        {convos.length === 0 && <div className={s.empty}>Sin conversaciones registradas. Las nuevas conversaciones aparecen aquí automáticamente.</div>}
        {convos.map(c => {
          const agentName = visibleAgents?.find(a => a.id === c.agentId)?.name || c.agentId
          return (
            <div key={c.id} className={s.item} style={{ cursor: 'default' }}>
              <div className={s.itemHead}>
                <span className={s.itemAuthor}>
                  {CHANNEL_ICON[c.channel] || '💬'} {agentName}
                  <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--bg3)', color: 'var(--text2)', padding: '1px 6px', borderRadius: 10, border: '1px solid var(--border2)' }}>
                    {c.channel}
                  </span>
                </span>
                <span className={s.itemTime}>{relativeTime(c.updatedAt)}</span>
              </div>
              {c.preview && <div className={s.itemBody} style={{ color: 'var(--text2)', fontStyle: 'italic' }}>"{c.preview}"</div>}
            </div>
          )
        })}
      </div>

      {/* Activity timeline */}
      <div className={s.contactCard}>
        <div className={s.contactCardTitle}>⏱ Timeline <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({activity.length})</span></div>
        {activity.length === 0 && <div className={s.empty}>Sin actividad registrada.</div>}
        {activity.map(a => (
          <div key={a.id} className={s.item}>
            <div className={s.itemHead}>
              <span className={s.itemAuthor}>
                {a.kind === 'note' ? '📝' : a.kind === 'task' ? '✅' : a.kind === 'task_done' ? '✓' : '•'} {a.title}
              </span>
              <span className={s.itemTime}>{relativeTime(a.ts)} · {a.authorName || 'sistema'}</span>
            </div>
            {a.detail && <div className={s.itemBody} style={{ color: 'var(--text2)' }}>{a.detail}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
