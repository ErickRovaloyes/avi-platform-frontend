import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { useAuth } from '../../context/AuthContext'
import { crmListTasks, crmCreateTask, crmUpdateTask, crmDeleteTask } from '../../lib/storage'
import ChatRefPicker from './ChatRefPicker'
import TicketPicker, { findCardTitle } from './TicketPicker'
import CRMTaskSchedules from './CRMTaskSchedules'
import { TASK_TYPES, taskTypeLabel } from '../../lib/taskTypes'
import s from './CRMPanel.module.css'

const CHANNEL_ICON = { webchat: '💬', whatsapp: '📱', messenger: '📘', instagram: '📸', test: '🧪' }
const PRIO_ORDER = { urgent: 0, urgente: 0, high: 1, alta: 1, normal: 2, media: 2, low: 3, baja: 3 }

function fmtDate(ts) {
  if (!ts) return ''
  return new Date(Number(ts)).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function CRMTasksPanel() {
  const { account, openConversation } = useAccount()
  const { session } = useAuth()
  const members = account?.members || []
  const pipelines = account?.pipelines || []
  const myId = session?.id
  const myName = (members.find(m => m.id === myId)?.name) || (members.find(m => m.id === myId)?.email) || session?.name || 'Yo'

  const [view, setView] = useState('list')            // 'list' | 'queue' | 'schedules'
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open')        // 'open' | 'done' | 'all'
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [queueScope, setQueueScope] = useState('all') // 'all' | 'mine' | 'unassigned'
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ title: '', description: '', dueAt: '', priority: 'normal', assigneeId: '', type: 'general' })
  const [refs, setRefs] = useState([])
  const [ticket, setTicket] = useState(null)

  async function reload() {
    if (!account?.id) return
    setLoading(true)
    try {
      const params = view === 'queue' ? { status: 'open' } : (filter === 'all' ? {} : { status: filter })
      setTasks(await crmListTasks(account.id, params))
    } catch { setTasks([]) }
    setLoading(false)
  }
  useEffect(() => { if (view !== 'schedules') reload() }, [account?.id, filter, view]) // eslint-disable-line

  async function addTask() {
    if (!draft.title.trim()) return
    const dueAt = draft.dueAt ? new Date(draft.dueAt).getTime() : null
    const member = members.find(m => m.id === draft.assigneeId)
    const primary = refs[0]
    const target = ticket
      ? { targetType: 'card', targetId: ticket.cardId }
      : (primary ? { targetType: 'conversation', targetId: primary.convId } : {})
    await crmCreateTask(account.id, {
      ...draft, dueAt, refs, ...target,
      assigneeId: draft.assigneeId || null,
      assigneeName: member ? (member.name || member.email) : '',
    })
    setDraft({ title: '', description: '', dueAt: '', priority: 'normal', assigneeId: '', type: 'general' })
    setRefs([]); setTicket(null)
    setCreating(false); reload()
  }
  async function toggleTask(t) { await crmUpdateTask(account.id, t.id, { status: t.status === 'done' ? 'open' : 'done' }); reload() }
  async function removeTask(id) { if (!confirm('¿Eliminar esta tarea?')) return; await crmDeleteTask(account.id, id); reload() }
  async function claim(t) { await crmUpdateTask(account.id, t.id, { assigneeId: myId, assigneeName: myName }); reload() }

  const stats = {
    open:    tasks.filter(t => t.status === 'open').length,
    overdue: tasks.filter(t => t.status === 'open' && t.dueAt && t.dueAt < Date.now()).length,
  }
  const shown = tasks.filter(t =>
    (!assigneeFilter || t.assigneeId === assigneeFilter) &&
    (!typeFilter || (t.type || 'general') === typeFilter)
  )

  const VIEWS = [['list', '📋 Lista'], ['queue', '🎯 Cola'], ['schedules', '🔁 Periódicas']]

  return (
    <div className={s.tasksRoot}>
      <div className={s.tasksHeader}>
        <div>
          <div className={s.tasksTitle}>✅ Tareas</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {stats.open} abiertas {stats.overdue > 0 && <span style={{ color: '#ff5050' }}> · {stats.overdue} vencidas</span>}
          </div>
        </div>
        <div className={s.tasksFilters} style={{ flexWrap: 'wrap' }}>
          {VIEWS.map(([v, l]) => (
            <button key={v} className={`${s.filterChip} ${view === v ? s.filterChipActive : ''}`} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
      </div>

      {view === 'schedules' && <CRMTaskSchedules />}

      {view === 'queue' && (
        <QueueView
          loading={loading}
          tasks={tasks.filter(t => t.status === 'open')}
          scope={queueScope} setScope={setQueueScope}
          myId={myId} members={members}
          onClaim={claim} onComplete={toggleTask}
        />
      )}

      {view === 'list' && (
        <>
          <div className={s.tasksFilters} style={{ flexWrap: 'wrap', marginBottom: 12 }}>
            {['open', 'done', 'all'].map(f => (
              <button key={f} className={`${s.filterChip} ${filter === f ? s.filterChipActive : ''}`} onClick={() => setFilter(f)}>
                {f === 'open' ? 'Abiertas' : f === 'done' ? 'Hechas' : 'Todas'}
              </button>
            ))}
            {members.length > 0 && (
              <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}
                style={{ padding: '5px 10px', background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border2)', borderRadius: 20, fontSize: 11.5 }}>
                <option value="">👤 Todos</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>
            )}
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              style={{ padding: '5px 10px', background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border2)', borderRadius: 20, fontSize: 11.5 }}>
              <option value="">🏷 Tipo: todos</option>
              {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select>
            <button className={s.primaryBtn} onClick={() => setCreating(c => !c)}>{creating ? '✕ Cancelar' : '+ Nueva tarea'}</button>
          </div>

          {creating && (
            <div className={s.contactCard}>
              <div className={s.composeArea}>
                <input placeholder="Título de la tarea" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
                <textarea placeholder="Descripción (opcional)" rows={2} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="datetime-local" value={draft.dueAt} onChange={e => setDraft(d => ({ ...d, dueAt: e.target.value }))} style={{ flex: 1 }} />
                  <select value={draft.priority} onChange={e => setDraft(d => ({ ...d, priority: e.target.value }))} style={{ padding: 8, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }}>
                    <option value="low">Prioridad baja</option>
                    <option value="normal">Prioridad normal</option>
                    <option value="high">Prioridad alta</option>
                  </select>
                  <select value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value }))} style={{ padding: 8, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }}>
                    {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
                <select value={draft.assigneeId} onChange={e => setDraft(d => ({ ...d, assigneeId: e.target.value }))} style={{ padding: 8, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }}>
                  <option value="">👤 Encargado (sin asignar)</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                </select>
                <TicketPicker value={ticket} onChange={setTicket} />
                <ChatRefPicker value={refs} onChange={setRefs} />
                <div className={s.composeFooter}>
                  <button className={s.primaryBtn} onClick={addTask} disabled={!draft.title.trim()}>Crear tarea</button>
                </div>
              </div>
            </div>
          )}

          <div className={s.contactCard}>
            {loading && <div className={s.empty}>Cargando...</div>}
            {!loading && shown.length === 0 && <div className={s.empty}>Sin tareas en este filtro.</div>}
            {shown.map(t => {
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
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
                    <span className={s.taskTag}>{taskTypeLabel(t.type)}</span>
                    {t.assigneeName && <span className={s.taskTag} style={{ background: 'var(--accent-dim, rgba(124,111,255,.15))', color: 'var(--accent, #7c6fff)' }}>👤 {t.assigneeName}</span>}
                    {t.targetType === 'card' && <span className={s.taskTag}>🧲 {findCardTitle(pipelines, t.targetId) || 'Ticket'}</span>}
                  </div>
                  {Array.isArray(t.refs) && t.refs.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
                      {t.refs.map(r => (
                        <button key={r.convId} onClick={() => openConversation(r.agentId, r.convId)} title="Ir al chat"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 14, fontSize: 12, color: 'var(--text1)', cursor: 'pointer' }}>
                          {CHANNEL_ICON[r.channel] || '💬'} {r.guestName} <span style={{ color: 'var(--accent, #4fa8ff)' }}>→ chat</span>
                        </button>
                      ))}
                    </div>
                  )}
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
        </>
      )}
    </div>
  )
}

// ── Vista Cola: tareas abiertas por vencimiento (Vencidas / Hoy / Próximas / Sin fecha) ──
function QueueView({ loading, tasks, scope, setScope, myId, members, onClaim, onComplete }) {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
  const st = startToday.getTime(), endToday = st + 86400000
  const scoped = tasks.filter(t =>
    scope === 'mine' ? t.assigneeId === myId
      : scope === 'unassigned' ? !t.assigneeId
        : true
  )
  const bucketOf = t => !t.dueAt ? 'nofecha' : (t.dueAt < st ? 'vencidas' : (t.dueAt < endToday ? 'hoy' : 'proximas'))
  const groups = { vencidas: [], hoy: [], proximas: [], nofecha: [] }
  for (const t of scoped) groups[bucketOf(t)].push(t)
  const sortFn = (a, b) => (PRIO_ORDER[a.priority] ?? 2) - (PRIO_ORDER[b.priority] ?? 2) || (a.dueAt || Infinity) - (b.dueAt || Infinity)
  for (const k of Object.keys(groups)) groups[k].sort(sortFn)

  const SECTIONS = [['vencidas', '🔴 Vencidas'], ['hoy', '🟠 Hoy'], ['proximas', '🟢 Próximas'], ['nofecha', '⚪ Sin fecha']]
  const chip = { padding: '5px 12px', background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border2)', borderRadius: 20, fontSize: 11.5, cursor: 'pointer' }
  const chipOn = { ...chip, background: 'var(--accent-dim, rgba(124,111,255,.15))', color: 'var(--accent,#7c6fff)', borderColor: 'var(--accent,#7c6fff)' }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['all', 'Todas'], ['mine', 'Mías'], ['unassigned', 'Sin asignar']].map(([v, l]) => (
          <button key={v} style={scope === v ? chipOn : chip} onClick={() => setScope(v)}>{l}</button>
        ))}
      </div>
      {loading && <div className={s.empty}>Cargando…</div>}
      {!loading && scoped.length === 0 && <div className={s.empty}>No hay tareas en la cola con este filtro.</div>}
      {SECTIONS.map(([key, label]) => groups[key].length > 0 && (
        <div key={key} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 6px' }}>{label} ({groups[key].length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groups[key].map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: 'var(--text1)', fontWeight: 600 }}>{taskTypeLabel(t.type)} {t.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    {(t.priority === 'high' || t.priority === 'urgent') && <span style={{ color: '#ff5f5f', fontWeight: 700 }}>● {t.priority} · </span>}
                    {t.dueAt ? `📅 ${fmtDate(t.dueAt)}` : 'sin fecha'}{t.assigneeName ? ` · 👤 ${t.assigneeName}` : ' · sin asignar'}
                  </div>
                </div>
                {!t.assigneeId && <button className={s.smallBtn} onClick={() => onClaim(t)} title="Asignármela">✋ Tomar</button>}
                <button className={`${s.smallBtn} ${s.smallBtnDone}`} onClick={() => onComplete(t)}>✓ Completar</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
