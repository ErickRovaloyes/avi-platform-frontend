import { useState, useRef } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getDraft, getExecutions } from '../../lib/flowLocalStorage'
import s from './FlowsListView.module.css'

// Descarga un flujo como archivo .json (export).
function exportFlow(flow) {
  const payload = {
    _type: 'avi.flow',
    _version: 1,
    name: flow.name,
    trigger: flow.trigger || 'manual',
    triggerKeyword: flow.triggerKeyword || '',
    startNodeId: flow.startNodeId || null,
    nodes: flow.nodes || [],
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safe = (flow.name || 'flujo').replace(/[^\w\-]+/g, '_').toLowerCase()
  a.href = url
  a.download = `flujo_${safe}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Vista de lista de flujos. Cada flujo se muestra como una card con datos clave
 * y un click la abre en el editor (vía onOpen).
 *
 * Props:
 *   onOpen(flowId) — handler para entrar al editor
 */
export default function FlowsListView({ onOpen }) {
  const { account, addFlow, deleteFlow, updateFlow, importFlow, copyFlowToAccount, accessibleAccounts } = useAccount()
  const flows = account?.flows || []
  const accId = account?.id

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [search, setSearch] = useState('')
  const [filterTrigger, setFilterTrigger] = useState('all')
  const [copyTarget, setCopyTarget] = useState(null)   // flow pendiente de copiar a otra cuenta
  const fileRef = useRef(null)

  // Otras cuentas a las que el usuario tiene acceso (excluye la actual).
  const otherAccounts = (accessibleAccounts || []).filter(a => a && a.id !== accId)

  function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    addFlow({ name: newName.trim(), trigger: 'manual', startNodeId: null })
    setNewName(''); setCreating(false)
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''  // permite re-importar el mismo archivo
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data || !Array.isArray(data.nodes)) throw new Error('Formato inválido')
      await importFlow(data)
    } catch (err) {
      alert('No se pudo importar el flujo: ' + (err.message || 'archivo inválido'))
    }
  }

  async function handleCopyToAccount(flow, targetAccId) {
    try {
      await copyFlowToAccount(flow, targetAccId)
      const acc = otherAccounts.find(a => a.id === targetAccId)
      setCopyTarget(null)
      alert(`Flujo "${flow.name}" copiado a "${acc?.name || targetAccId}".`)
    } catch (err) {
      alert('No se pudo copiar: ' + (err.message || 'error'))
    }
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
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <button className={s.importBtn} onClick={() => fileRef.current?.click()} title="Importar flujo desde un archivo .json">
            ⬆ Importar
          </button>
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
              onExport={() => exportFlow(f)}
              onCopyToAccount={otherAccounts.length ? () => setCopyTarget(f) : null}
            />
          ))}
          {filtered.length === 0 && (
            <div className={s.noResults}>Sin resultados para los filtros actuales.</div>
          )}
        </div>
      )}

      {/* Modal: copiar flujo a otra cuenta */}
      {copyTarget && (
        <div className={s.copyBackdrop} onClick={e => e.target === e.currentTarget && setCopyTarget(null)}>
          <div className={s.copyModal}>
            <div className={s.copyHeader}>
              <h3>📋 Copiar flujo a otra cuenta</h3>
              <button className={s.copyClose} onClick={() => setCopyTarget(null)}>✕</button>
            </div>
            <p className={s.copyDesc}>
              Se creará una copia de <strong>"{copyTarget.name}"</strong> en la cuenta que elijas.
              Solo se muestran cuentas a las que tienes acceso.
            </p>
            <div className={s.copyAccList}>
              {otherAccounts.map(acc => (
                <button
                  key={acc.id}
                  className={s.copyAccBtn}
                  onClick={() => handleCopyToAccount(copyTarget, acc.id)}
                >
                  <span className={s.copyAccName}>{acc.name || acc.id}</span>
                  <span className={s.copyAccGo}>Copiar →</span>
                </button>
              ))}
              {otherAccounts.length === 0 && (
                <div className={s.copyEmpty}>No tienes acceso a otras cuentas.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Card de un flujo ────────────────────────────────────────────────────────
function FlowCard({ flow, accId, onOpen, onDelete, onRename, onExport, onCopyToAccount }) {
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
          <button className={`${s.iconBtn} ${s.iconBtnNeutral}`} onClick={onExport} title="Exportar a archivo .json">⬇</button>
          {onCopyToAccount && (
            <button className={`${s.iconBtn} ${s.iconBtnNeutral}`} onClick={onCopyToAccount} title="Copiar a otra cuenta">📋</button>
          )}
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
