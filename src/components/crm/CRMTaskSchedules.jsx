import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { crmListTaskSchedules, crmCreateTaskSchedule, crmUpdateTaskSchedule, crmDeleteTaskSchedule } from '../../lib/storage'
import { TASK_TYPES, taskTypeLabel } from '../../lib/taskTypes'
import s from './CRMPanel.module.css'

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const FREQS = [['daily', 'Diaria'], ['weekly', 'Semanal'], ['monthly', 'Mensual']]
const emptySched = { title: '', description: '', type: 'general', priority: 'normal', assigneeId: '', assigneeName: '', freq: 'weekly', intervalN: 1, weekday: 1, monthday: 1, enabled: true }

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(Number(ts)).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function freqSummary(sc) {
  const n = Math.max(1, Number(sc.intervalN) || 1)
  if (sc.freq === 'daily')  return `Cada ${n} día${n > 1 ? 's' : ''}`
  if (sc.freq === 'weekly')  return `Cada ${n} semana${n > 1 ? 's' : ''} · ${WEEKDAYS[sc.weekday ?? 1] || ''}`
  return `Cada ${n} mes${n > 1 ? 'es' : ''} · día ${sc.monthday || 1}`
}

export default function CRMTaskSchedules() {
  const { account } = useAccount()
  const members = account?.members || []
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  async function load() {
    if (!account?.id) return
    setLoading(true)
    try { const r = await crmListTaskSchedules(account.id); setList(r.schedules || []) } catch { setList([]) }
    setLoading(false)
  }
  useEffect(() => { load() }, [account?.id])

  async function save() {
    const m = members.find(x => x.id === editing.assigneeId)
    const payload = { ...editing, assigneeName: m ? (m.name || m.email) : '', intervalN: Math.max(1, Number(editing.intervalN) || 1) }
    if (editing.id) await crmUpdateTaskSchedule(account.id, editing.id, payload)
    else await crmCreateTaskSchedule(account.id, payload)
    setEditing(null); load()
  }
  async function toggle(sc) { await crmUpdateTaskSchedule(account.id, sc.id, { enabled: !sc.enabled }); load() }
  async function remove(id) { if (!confirm('¿Eliminar esta tarea periódica?')) return; await crmDeleteTaskSchedule(account.id, id); load() }

  const inp = { padding: '8px 10px', fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 8, boxSizing: 'border-box' }
  const btn = { padding: '8px 13px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text1)', cursor: 'pointer', fontSize: 12.5 }
  const btnPri = { ...btn, background: 'var(--accent,#4fa8ff)', color: '#fff', border: 'none', fontWeight: 700 }
  const lbl = { fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 3 }

  return (
    <div style={{ padding: '4px 2px', maxWidth: 780 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>Plantillas que crean una tarea automáticamente cada cierto tiempo.</div>
        {!editing && <button style={btnPri} onClick={() => setEditing({ ...emptySched })}>+ Nueva periódica</button>}
      </div>

      {editing && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><label style={lbl}>Título de la tarea</label>
            <input style={{ ...inp, width: '100%' }} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Ej: Revisar pipeline semanal" /></div>
          <div><label style={lbl}>Descripción (opcional)</label>
            <textarea style={{ ...inp, width: '100%', minHeight: 54, resize: 'vertical', fontFamily: 'inherit' }} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div><label style={lbl}>Tipo</label>
              <select style={{ ...inp, display: 'block' }} value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value })}>
                {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
              </select></div>
            <div><label style={lbl}>Prioridad</label>
              <select style={{ ...inp, display: 'block' }} value={editing.priority} onChange={e => setEditing({ ...editing, priority: e.target.value })}>
                <option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option>
              </select></div>
            <div><label style={lbl}>Encargado</label>
              <select style={{ ...inp, display: 'block' }} value={editing.assigneeId} onChange={e => setEditing({ ...editing, assigneeId: e.target.value })}>
                <option value="">— sin asignar —</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select></div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><label style={lbl}>Frecuencia</label>
              <select style={{ ...inp, display: 'block' }} value={editing.freq} onChange={e => setEditing({ ...editing, freq: e.target.value })}>
                {FREQS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            <div><label style={lbl}>Cada</label>
              <input style={{ ...inp, width: 80 }} type="number" min="1" value={editing.intervalN} onChange={e => setEditing({ ...editing, intervalN: e.target.value })} /></div>
            {editing.freq === 'weekly' && (
              <div><label style={lbl}>Día de la semana</label>
                <select style={{ ...inp, display: 'block' }} value={editing.weekday} onChange={e => setEditing({ ...editing, weekday: Number(e.target.value) })}>
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select></div>
            )}
            {editing.freq === 'monthly' && (
              <div><label style={lbl}>Día del mes (1‑28)</label>
                <input style={{ ...inp, width: 90 }} type="number" min="1" max="28" value={editing.monthday} onChange={e => setEditing({ ...editing, monthday: Number(e.target.value) })} /></div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button style={btn} onClick={() => setEditing(null)}>Cancelar</button>
            <button style={btnPri} onClick={save} disabled={!editing.title.trim()}>Guardar</button>
          </div>
        </div>
      )}

      {loading && <div style={{ color: 'var(--text3)', fontSize: 13 }}>Cargando…</div>}
      {!loading && list.length === 0 && !editing && <div style={{ color: 'var(--text3)', fontSize: 13 }}>Sin tareas periódicas. Crea una para automatizar recordatorios recurrentes.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map(sc => (
          <div key={sc.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, opacity: sc.enabled ? 1 : 0.55 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{taskTypeLabel(sc.type)} {sc.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
                {freqSummary(sc)} · próxima: {fmtDate(sc.nextAt)}{sc.assigneeName ? ` · 👤 ${sc.assigneeName}` : ''}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, cursor: 'pointer' }}><input type="checkbox" checked={sc.enabled} onChange={() => toggle(sc)} /> activa</label>
            <button style={{ ...btn, padding: '4px 9px' }} onClick={() => setEditing({ ...sc })}>✎</button>
            <button style={{ ...btn, padding: '4px 9px', color: '#ff5f5f' }} onClick={() => remove(sc.id)}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  )
}
