import { useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getDraft, getExecutions } from '../../lib/flowLocalStorage'
import s from './FlowsListView.module.css'

/**
 * Vista de lista de flujos. Cada flujo se muestra como una card con datos clave
 * y un click la abre en el editor (vía onOpen).
 *
 * Props:
 *   onOpen(flowId) — handler para entrar al editor
 */
export default function FlowsListView({ onOpen }) {
  const { account, addFlow, deleteFlow, updateFlow } = useAccount()
  const flows = account?.flows || []
  const accId = account?.id

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [search, setSearch] = useState('')
  const [filterTrigger, setFilterTrigger] = useState('all')

  function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    addFlow({ name: newName.trim(), trigger: 'manual', startNodeId: null })
    setNewName(''); setCreating(false)
  }

  const filtered = flows.filter(f => {
    if (filterTrigger !== 'all' && f.trigger !== filterTrigger) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (f.name || '').toLowerCase().includes(q) ||
             (f.triggerKeyword || '').toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className={s.panel}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.titleRow}>
          <h2 className={s.title}>⚡ Flujos</h2>
          <span className={s.count}>{flows.length} {flows.length === 1 ? 'flujo' : 'flujos'}</span>
        </div>
        <div className={s.actions}>
          <input
            className={s.search}
            placeholder="🔍 Buscar flujo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className={s.filter}
            value={filterTrigger}
            onChange={e => setFilterTrigger(e.target.value)}
          >
            <option value="all">Todos los triggers</option>
            <option value="manual">Manual</option>
            <option value="conversation_start">Inicio conversación</option>
            <option value="keyword">Palabra clave</option>
            <option value="ai_tool">Herramienta IA</option>
          </select>
          {creating ? (
            <form onSubmit={handleCreate} className={s.createForm}>
              <input
                autoFocus
                placeholder="Nombre del flujo…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className={s.createInput}
              />
              <button type="submit" className={s.createBtn}>Crear</button>
              <button type="button" className={s.cancelBtn} onClick={() => setCreating(false)}>✕</button>
            </form>
          ) : (
            <button className={s.newBtn} onClick={() => setCreating(true)}>+ Nuevo flujo</button>
          )}
        </div>
      </div>

      {/* Body */}
      {flows.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>⚡</div>
          <h3>Aún no tienes flujos</h3>
          <p>Los flujos automatizan respuestas, llaman APIs y orquestan la IA con tu CRM.</p>
          <button className={s.newBtn} onClick={() => setCreating(true)}>+ Crear primer flujo</button>
        </div>
      ) : (
        <div className={s.grid}>
          {filtered.map(f => (
            <FlowCard
              key={f.id}
              flow={f}
              accId={accId}
              onOpen={() => onOpen(f.id)}
              onDelete={() => { if (confirm(`¿Eliminar "${f.name}"?`)) deleteFlow(f.id) }}
              onRename={name => updateFlow(f.id, { name })}
            />
          ))}
          {filtered.length === 0 && (
            <div className={s.noResults}>Sin resultados para los filtros actuales.</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Card de un flujo ────────────────────────────────────────────────────────
function FlowCard({ flow, accId, onOpen, onDelete, onRename }) {
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(flow.name)

  const draft = accId ? getDraft(accId, flow.id) : null
  const executions = accId ? getExecutions(accId, flow.id) : []
  const lastRun = executions[0]
  const nodeCount = flow.nodes?.length || 0
  const isActive = nodeCount > 0 && flow.startNodeId

  function saveName() {
    if (name.trim() && name !== flow.name) onRename(name.trim())
    setEditingName(false)
  }

  return (
    <div className={s.card} onClick={onOpen}>
      <div className={s.cardHeader}>
        <div className={s.cardIcon}>
          <span>{flow.trigger === 'keyword' ? '🔑' :
                 flow.trigger === 'conversation_start' ? '🎬' :
                 flow.trigger === 'ai_tool' ? '🤖' : '👆'}</span>
        </div>
        <div className={s.cardTitleBlock}>
          {editingName ? (
            <input
              autoFocus
              className={s.cardNameEdit}
              value={name}
              onClick={e => e.stopPropagation()}
              onChange={e => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setName(flow.name); setEditingName(false) } }}
            />
          ) : (
            <button
              className={s.cardName}
              onClick={e => { e.stopPropagation(); setEditingName(true) }}
              title="Click para renombrar"
            >{flow.name}</button>
          )}
          <div className={s.cardSub}>
            <span className={s.cardTrigger}>{triggerLabel(flow.trigger)}</span>
            {flow.triggerKeyword && (
              <span className={s.cardKeyword}>"{flow.triggerKeyword}"</span>
            )}
          </div>
        </div>
        <div className={s.cardActions} onClick={e => e.stopPropagation()}>
          <button className={s.iconBtn} onClick={onDelete} title="Eliminar">🗑</button>
        </div>
      </div>

      <div className={s.cardStats}>
        <Stat icon="🔧" label="Nodos" value={nodeCount} />
        <Stat icon="▶" label="Ejecuciones" value={executions.length} />
        <Stat icon="🚦" label="Estado"
          value={isActive
            ? <span className={s.statOk}>Activo</span>
            : <span className={s.statOff}>Sin inicio</span>} />
      </div>

      <div className={s.cardFooter}>
        {draft && (
          <span className={s.draftBadge} title="Hay cambios sin guardar">
            📝 borrador {fmtRelative(draft.savedAt)}
          </span>
        )}
        {lastRun && (
          <span className={`${s.runBadge} ${s['run_' + lastRun.status]}`} title={`Última ejecución`}>
            {lastRun.status === 'success' ? '✓' : lastRun.status === 'error' ? '✗' : '⏸'} {fmtRelative(lastRun.ts)}
          </span>
        )}
        <span className={s.openHint}>Abrir →</span>
      </div>
    </div>
  )
}

function Stat({ icon, label, value }) {
  return (
    <div className={s.stat}>
      <span className={s.statIcon}>{icon}</span>
      <span className={s.statValue}>{value}</span>
      <span className={s.statLabel}>{label}</span>
    </div>
  )
}

function triggerLabel(t) {
  switch (t) {
    case 'manual':              return 'Manual'
    case 'conversation_start':  return 'Inicio de conversación'
    case 'keyword':             return 'Palabra clave'
    case 'ai_tool':             return 'Herramienta IA'
    default:                    return t || 'sin trigger'
  }
}

function fmtRelative(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60_000) return 'ahora'
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)}h`
  return `hace ${Math.floor(diff / 86_400_000)}d`
}
