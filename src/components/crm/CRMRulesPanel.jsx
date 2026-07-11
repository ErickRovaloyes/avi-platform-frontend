import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { crmListRules, crmCreateRule, crmUpdateRule, crmDeleteRule, crmRunRule } from '../../lib/storage'

// Reglas / playbooks no-code: "si pasa X, crea una tarea".
const TRIGGERS = [
  { id: 'deal_stale', label: 'Deal estancado', hasDays: true, sub: 'un deal lleva N días sin moverse' },
  { id: 'contact_inactive', label: 'Cliente inactivo', hasDays: true, sub: 'un cliente lleva N días sin comprar' },
  { id: 'deal_won', label: 'Deal ganado', hasDays: false, sub: 'un deal se marca como ganado' },
  { id: 'deal_high_score', label: 'Deal caliente', hasDays: false, sub: 'un deal con alta intención de compra' },
]
const PRIORITIES = [['normal', 'Normal'], ['high', 'Alta'], ['urgent', 'Urgente']]
const emptyRule = { name: '', triggerType: 'deal_stale', triggerDays: 7, actionParams: { priority: 'normal', dueDays: '' }, enabled: true }

const inp = { padding: '8px 10px', fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 8, boxSizing: 'border-box' }
const btn = { padding: '8px 13px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text1)', cursor: 'pointer', fontSize: 12.5 }
const btnPri = { ...btn, background: 'var(--accent,#4fa8ff)', color: '#fff', border: 'none', fontWeight: 700 }

export default function CRMRulesPanel() {
  const { account } = useAccount()
  const [rules, setRules] = useState([])
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState('')

  async function load() { if (account?.id) { const r = await crmListRules(account.id).catch(() => ({ rules: [] })); setRules(r.rules || []) } }
  useEffect(() => { load() }, [account?.id])
  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  async function save() {
    const t = TRIGGERS.find(x => x.id === editing.triggerType)
    const payload = { ...editing, triggerDays: t?.hasDays ? (Number(editing.triggerDays) || 7) : 0 }
    if (editing.id) await crmUpdateRule(account.id, editing.id, payload)
    else await crmCreateRule(account.id, payload)
    setEditing(null); load(); flash('Regla guardada ✓')
  }
  async function toggle(r) { await crmUpdateRule(account.id, r.id, { enabled: !r.enabled }); load() }
  async function remove(id) { if (!confirm('¿Eliminar esta regla?')) return; await crmDeleteRule(account.id, id); load() }
  async function run(r) { const res = await crmRunRule(account.id, r.id); flash(res.created ? `✓ ${res.created} tarea(s) creada(s)` : 'Nada nuevo que hacer'); load() }

  function tLabel(id) { return TRIGGERS.find(x => x.id === id)?.label || id }

  return (
    <div style={{ padding: '14px 4px', maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>⚙️ Reglas y automatización</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text3)' }}>“Si pasa X, crea una tarea para tu equipo”. Se ejecutan solas cada pocos minutos.</p>
        </div>
        {!editing && <button style={btnPri} onClick={() => setEditing({ ...emptyRule, actionParams: { priority: 'normal', dueDays: '' } })}>+ Nueva regla</button>}
      </div>
      {msg && <div style={{ fontSize: 12, color: 'var(--accent)', margin: '6px 0' }}>{msg}</div>}

      {editing ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--text2)', fontWeight: 600 }}>Nombre de la regla</label>
            <input style={{ ...inp, width: '100%', marginTop: 4 }} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Ej: Seguir deals estancados" />
          </div>
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--text2)', fontWeight: 600 }}>Cuando… (disparador)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginTop: 4 }}>
              {TRIGGERS.map(t => (
                <button key={t.id} onClick={() => setEditing({ ...editing, triggerType: t.id })}
                  style={{ ...btn, textAlign: 'left', ...(editing.triggerType === t.id ? { borderColor: 'var(--accent)', background: 'var(--accent-dim, rgba(79,168,255,.12))' } : {}) }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{t.label}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{t.sub}</div>
                </button>
              ))}
            </div>
          </div>
          {TRIGGERS.find(x => x.id === editing.triggerType)?.hasDays && (
            <div><label style={{ fontSize: 11.5, color: 'var(--text2)', fontWeight: 600 }}>Días</label>
              <input style={{ ...inp, width: 120, marginTop: 4 }} type="number" min="1" value={editing.triggerDays} onChange={e => setEditing({ ...editing, triggerDays: e.target.value })} /></div>
          )}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text2)', fontWeight: 600, marginBottom: 6 }}>…haz: crear una tarea</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div><label style={{ fontSize: 11, color: 'var(--text3)' }}>Prioridad</label>
                <select style={{ ...inp, display: 'block', marginTop: 3 }} value={editing.actionParams?.priority || 'normal'} onChange={e => setEditing({ ...editing, actionParams: { ...editing.actionParams, priority: e.target.value } })}>
                  {PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></div>
              <div><label style={{ fontSize: 11, color: 'var(--text3)' }}>Vence en (días, opcional)</label>
                <input style={{ ...inp, display: 'block', marginTop: 3, width: 140 }} type="number" min="0" value={editing.actionParams?.dueDays || ''} onChange={e => setEditing({ ...editing, actionParams: { ...editing.actionParams, dueDays: e.target.value } })} placeholder="—" /></div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button style={btn} onClick={() => setEditing(null)}>Cancelar</button>
            <button style={btnPri} onClick={save} disabled={!editing.name.trim()}>Guardar regla</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {rules.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13 }}>Sin reglas. Crea una para automatizar tareas de seguimiento y retención.</div>}
          {rules.map(r => (
            <div key={r.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, opacity: r.enabled ? 1 : 0.55 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Cuando: <b>{tLabel(r.triggerType)}{r.triggerDays ? ` (${r.triggerDays}d)` : ''}</b> → crear tarea{r.actionParams?.priority && r.actionParams.priority !== 'normal' ? ` · ${r.actionParams.priority}` : ''}{r.lastRun ? ` · últ. ${new Date(r.lastRun).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</div>
              </div>
              <button style={{ ...btn, padding: '4px 10px' }} onClick={() => run(r)} title="Ejecutar ahora">▶</button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, cursor: 'pointer' }}><input type="checkbox" checked={r.enabled} onChange={() => toggle(r)} /> activa</label>
              <button style={{ ...btn, padding: '4px 9px' }} onClick={() => setEditing({ ...r })}>✎</button>
              <button style={{ ...btn, padding: '4px 9px', color: '#ff5f5f' }} onClick={() => remove(r.id)}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
