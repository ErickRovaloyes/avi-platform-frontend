import { useState, useEffect } from 'react'
import { getNode } from '../../lib/flowNodes'
import FlowCanvas from './FlowCanvas'
import s from './FlowHistoryView.module.css'

/**
 * Vista de historial de cambios con preview.
 *
 * Layout:
 *   - Sidebar izq: lista de versiones guardadas (más recientes primero)
 *   - Centro:       canvas read-only renderizando el snapshot seleccionado
 *   - Botón inferior: restaurar la versión seleccionada
 *
 * Props:
 *   history:     [{ id, ts, label, snapshot:{nodes,startNodeId} }, …]
 *   currentFlow: el flujo actual ({nodes, startNodeId}) — para mostrar diff
 *   onRestore(historyEntry)
 *   onClear()
 */
export default function FlowHistoryView({ history, currentFlow, onRestore, onClear }) {
  const [selectedId, setSelectedId] = useState(history[0]?.id || null)

  // Auto-seleccionar la entrada más reciente cuando cambia el historial
  useEffect(() => {
    if (!selectedId && history[0]) setSelectedId(history[0].id)
    if (selectedId && !history.find(h => h.id === selectedId)) setSelectedId(history[0]?.id || null)
  }, [history, selectedId])

  if (history.length === 0) {
    return (
      <div className={s.empty}>
        <div className={s.emptyIcon}>🕘</div>
        <h3>Sin cambios guardados aún</h3>
        <p>Cada vez que guardes el flujo, se creará un snapshot aquí para restaurarlo en cualquier momento.</p>
      </div>
    )
  }

  const selected = history.find(h => h.id === selectedId) || history[0]
  const diff = currentFlow ? computeDiff(currentFlow, selected.snapshot) : null

  return (
    <div className={s.view}>
      {/* ─── Sidebar de versiones ─── */}
      <div className={s.sidebar}>
        <div className={s.sidebarHeader}>
          <span className={s.sidebarTitle}>Versiones ({history.length})</span>
          <button className={s.clearBtn} onClick={onClear} title="Limpiar historial">🗑</button>
        </div>
        <div className={s.list}>
          {history.map((h, idx) => {
            const isActive = selectedId === h.id
            const nodeCount = h.snapshot.nodes?.length || 0
            return (
              <button
                key={h.id}
                className={`${s.item} ${isActive ? s.itemActive : ''}`}
                onClick={() => setSelectedId(h.id)}
              >
                <div className={s.itemRow1}>
                  <span className={s.itemBadge}>v{history.length - idx}</span>
                  <span className={s.itemTs}>{fmtDateTime(h.ts)}</span>
                </div>
                <div className={s.itemRow2}>
                  <span className={s.itemLabel}>{h.label || 'Cambio guardado'}</span>
                </div>
                <div className={s.itemRow3}>
                  <span className={s.itemMeta}>🔧 {nodeCount} nodos</span>
                  <span className={s.itemAgo}>{fmtRelative(h.ts)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── Centro: preview canvas ─── */}
      <div className={s.center}>
        <div className={s.previewHeader}>
          <div className={s.previewTitle}>
            <span className={s.previewIcon}>🕘</span>
            <div>
              <div className={s.previewH1}>{fmtDateTime(selected.ts)}</div>
              <div className={s.previewSub}>
                {selected.label || 'Cambio'} · {selected.snapshot.nodes?.length || 0} nodos
                · inicio: {selected.snapshot.startNodeId
                  ? (getNode(selected.snapshot.nodes?.find(n => n.id === selected.snapshot.startNodeId)?.type)?.label || selected.snapshot.startNodeId)
                  : <em>sin definir</em>}
              </div>
            </div>
          </div>

          <div className={s.previewActions}>
            {diff && (
              <div className={s.diffPills}>
                {diff.added.length > 0 && (
                  <span className={s.diffAdded} title={`Se añadirían ${diff.added.length} nodos`}>+{diff.added.length}</span>
                )}
                {diff.removed.length > 0 && (
                  <span className={s.diffRemoved} title={`Se eliminarían ${diff.removed.length} nodos`}>−{diff.removed.length}</span>
                )}
                {diff.changed.length > 0 && (
                  <span className={s.diffChanged} title={`${diff.changed.length} nodos modificados`}>~{diff.changed.length}</span>
                )}
                {diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0 && (
                  <span className={s.diffSame}>Idéntico al actual</span>
                )}
              </div>
            )}
            <button
              className={s.restoreBtn}
              onClick={() => {
                if (confirm(`¿Restaurar al estado del ${fmtDateTime(selected.ts)}? Los cambios actuales se perderán (puedes deshacer descartando el draft).`)) {
                  onRestore(selected)
                }
              }}
            >↺ Restaurar este estado</button>
          </div>
        </div>

        <div className={s.canvasBanner}>
          👁 Estás viendo una vista previa de cómo era el flujo en este momento. No se aplicarán cambios hasta que pulses <strong>Restaurar</strong>.
        </div>

        <div className={s.canvasWrap}>
          <FlowCanvas
            key={selected.id}  // forzar re-render con nuevo snapshot
            nodes={selected.snapshot.nodes || []}
            startNodeId={selected.snapshot.startNodeId}
            readOnly
          />
        </div>

        {/* Detalle de diff debajo del canvas */}
        {diff && (diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0) && (
          <div className={s.diffDetail}>
            {diff.added.length > 0 && (
              <DiffSection title="➕ Nodos que se restaurarían" color="#22d98a" items={diff.added} />
            )}
            {diff.removed.length > 0 && (
              <DiffSection title="➖ Nodos que se eliminarían" color="#ff5f5f" items={diff.removed} />
            )}
            {diff.changed.length > 0 && (
              <DiffSection title="✎ Nodos con cambios" color="#f5a623" items={diff.changed} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function DiffSection({ title, color, items }) {
  return (
    <div className={s.diffSection} style={{ '--c': color }}>
      <div className={s.diffSectionTitle}>{title} ({items.length})</div>
      <div className={s.diffItems}>
        {items.map(n => {
          const def = getNode(n.type)
          const label = n.data?._customName?.trim() || def?.label || n.type
          return (
            <span key={n.id} className={s.diffChip}>
              <span style={{ color: def?.color }}>{def?.icon || '•'}</span>
              {label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function computeDiff(currentFlow, snapshot) {
  const currentNodes = currentFlow.nodes || []
  const snapNodes    = snapshot.nodes || []
  const currentById  = new Map(currentNodes.map(n => [n.id, n]))
  const snapById     = new Map(snapNodes.map(n => [n.id, n]))

  // Lo que tiene el snapshot pero NO el flujo actual: se "añadirían" al restaurar
  const added   = snapNodes.filter(n => !currentById.has(n.id))
  // Lo que tiene el flujo actual pero NO el snapshot: se "eliminarían" al restaurar
  const removed = currentNodes.filter(n => !snapById.has(n.id))
  // Nodos en ambos pero con datos distintos
  const changed = snapNodes.filter(n => {
    const c = currentById.get(n.id)
    if (!c) return false
    return JSON.stringify(c.data) !== JSON.stringify(n.data) ||
           JSON.stringify(c.connections) !== JSON.stringify(n.connections)
  })
  return { added, removed, changed }
}

function fmtDateTime(ts) {
  return new Date(ts).toLocaleString('es', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtRelative(ts) {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'ahora'
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)}h`
  return `hace ${Math.floor(diff / 86_400_000)}d`
}
