import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { crmListTasks, crmCreateTask, crmUpdateTask, crmDeleteTask } from '../../lib/storage'
import s from './CRMPanel.module.css'

function fmtDate(ts) {
  if (!ts) return ''
  return new Date(Number(ts)).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function CRMTasksPanel() {
  const { account } = useAccount()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open') // 'open' | 'done' | 'all'
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ title: '', description: '', dueAt: '', priority: 'normal' })

  async function reload() {
    if (!account?.id) return
    setLoading(true)
    try {
      const params = filter === 'all' ? {} : { status: filter }
      setTasks(await crmListTasks(account.id, params))
    } catch { setTasks([]) }
    setLoading(false)
  }
  useEffect(() => { reload() }, [account?.id, filter])

  async function addTask() {
    if (!draft.title.trim()) return
    const dueAt = draft.dueAt ? new Date(draft.dueAt).getTime() : null
    await crmCreateTask(account.id, { ...draft, dueAt })
    setDraft({ title: '', description: '', dueAt: '', priority: 'normal' })
    setCreating(false); reload()
  }
  async function toggleTask(t) {
    await crmUpdateTask(account.id, t.id, { status: t.status === 'done' ? 'open' : 'done' }); reload()
  }
  async function removeTask(id) {
    if (!confirm('¿Eliminar esta tarea?')) return
    await crmDeleteTask(account.id, id); reload()
  }

  const stats = {
    open:    tasks.filter(t => t.status === 'open').length,
    overdue: tasks.filter(t => t.status === 'open' && t.dueAt && t.dueAt < Date.now()).length,
    done:    tasks.filter(t => t.status === 'done').length,
  }

  return (
    <div className={s.tasksRoot}>
      <div className={s.tasksHeader}>
        <div>
          <div className={s.tasksTitle}>✅ Tareas</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {stats.open} abiertas {stats.overdue > 0 && <span style={{ color: '#ff5050' }}> · {stats.overdue} vencidas</span>}
          </div>
        </div>
        <div className={s.tasksFilters}>
          {['open', 'done', 'all'].map(f => (
            <button key={f} className={`${s.filterChip} ${filter === f ? s.filterChipActive : ''}`} onClick={() => setFilter(f)}>
              {f === 'open' ? 'Abiertas' : f === 'done' ? 'Hechas' : 'Todas'}
            </button>
          ))}
          <button className={s.primaryBtn} onClick={() => setCreating(c => !c)}>{creating ? '✕ Cancelar' : '+ Nueva tarea'}</button>
        </div>
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
            </div>
            <div className={s.composeFooter}>
              <button className={s.primaryBtn} onClick={addTask} disabled={!draft.title.trim()}>Crear tarea</button>
            </div>
          </div>
        </div>
      )}

      <div className={s.contactCard}>
        {loading && <div className={s.empty}>Cargando...</div>}
        {!loading && tasks.length === 0 && <div className={s.empty}>Sin tareas en este filtro.</div>}
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
                  {t.targetType && <span className={s.taskTag}>{t.targetType}</span>}
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
    </div>
  )
}
