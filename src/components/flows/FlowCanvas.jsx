import { useState, useRef, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getNode } from '../../lib/flowNodes'
import NodePicker from './NodePicker'
import NodeEditModal from './NodeEditModal'
import CanvasContextMenu from './CanvasContextMenu'
import s from './FlowsPanel.module.css'

// ─── Visual geometry (Make-style) ────────────────────────────────────────────
const NODE_W = 130
const ICON_BOX = 64
const ICON_TOP = 10
const ICON_CENTER_Y = ICON_TOP + ICON_BOX / 2  // 42
const ICON_LEFT = (NODE_W - ICON_BOX) / 2      // 33
const ICON_RIGHT = ICON_LEFT + ICON_BOX        // 97
const PORT_OFFSET = 14
const SUCCESS_PORT_Y = ICON_CENTER_Y + PORT_OFFSET
const ERROR_PORT_Y   = ICON_CENTER_Y - PORT_OFFSET
const INPUT_X = ICON_LEFT
const INPUT_Y = ICON_CENTER_Y
const DRAG_THRESHOLD = 5

const FALLBACK = { icon: '•', label: '?', color: '#888' }

// ─── Connections ─────────────────────────────────────────────────────────────
function Connections({ nodes, pendingPort, mousePos, onDeleteConn, runTrace }) {
  const lines = []
  nodes.forEach(node => {
    const conns = node.connections || {}
    ;[['success', '#22d98a'], ['error', '#ff5f5f']].forEach(([port, color]) => {
      const targetId = conns[port]
      if (!targetId) return
      const target = nodes.find(n => n.id === targetId)
      if (!target) return
      // En modo replay: realza la ruta que tomó la ejecución
      const wasFollowed = runTrace?.followedEdges?.[`${node.id}_${port}`]
      const sx = node.x + ICON_RIGHT + 6
      const sy = node.y + (port === 'success' ? SUCCESS_PORT_Y : ERROR_PORT_Y)
      const ex = target.x + INPUT_X - 6
      const ey = target.y + INPUT_Y
      const cx = (sx + ex) / 2
      const mid = { x: (sx + ex) / 2, y: (sy + ey) / 2 }
      const strokeWidth = wasFollowed ? 4 : (runTrace ? 1.5 : 2.5)
      const opacity = runTrace && !wasFollowed ? 0.25 : 0.85
      lines.push(
        <g key={`${node.id}-${port}`}>
          <path
            d={`M${sx},${sy} C${cx},${sy} ${cx},${ey} ${ex},${ey}`}
            stroke={color} strokeWidth={strokeWidth} fill="none" opacity={opacity}
            markerEnd={`url(#arrow-${port})`}
          />
          {!runTrace && (
            <>
              <path
                d={`M${sx},${sy} C${cx},${sy} ${cx},${ey} ${ex},${ey}`}
                stroke="transparent" strokeWidth="14" fill="none"
                style={{ cursor: 'pointer' }}
                onClick={() => onDeleteConn(node.id, port)}
              />
              <circle cx={mid.x} cy={mid.y} r="9" fill="var(--bg2)" stroke={color} strokeWidth="1.5"
                style={{ cursor: 'pointer' }} onClick={() => onDeleteConn(node.id, port)} />
              <text x={mid.x} y={mid.y + 4} textAnchor="middle" fontSize="10" fill={color}
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => onDeleteConn(node.id, port)}>✕</text>
            </>
          )}
        </g>
      )
    })
  })
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
      <defs>
        <marker id="arrow-success" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L0,8 L8,4 z" fill="#22d98a" />
        </marker>
        <marker id="arrow-error" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L0,8 L8,4 z" fill="#ff5f5f" />
        </marker>
      </defs>
      <g style={{ pointerEvents: 'all' }}>{lines}</g>
      {pendingPort && mousePos && (() => {
        const src = nodes.find(n => n.id === pendingPort.nodeId)
        if (!src) return null
        const sx = src.x + ICON_RIGHT + 6
        const sy = src.y + (pendingPort.port === 'success' ? SUCCESS_PORT_Y : ERROR_PORT_Y)
        const cx = (sx + mousePos.x) / 2
        const color = pendingPort.port === 'success' ? '#22d98a' : '#ff5f5f'
        return (
          <path
            d={`M${sx},${sy} C${cx},${sy} ${cx},${mousePos.y} ${mousePos.x},${mousePos.y}`}
            stroke={color} strokeWidth="2.5" fill="none" strokeDasharray="6 3" opacity="0.9"
          />
        )
      })()}
    </svg>
  )
}

// ─── Single Node ─────────────────────────────────────────────────────────────
function FlowNode({ node, selected, isStart, readOnly, status, onOpen, onStartDrag, onPortClick, pendingPort }) {
  const def = getNode(node.type)
  const meta = def ? { icon: def.icon, label: def.label, color: def.color } : FALLBACK
  const customName = node.data?._customName
  const displayLabel = customName?.trim() || meta.label
  const hasIssue = !readOnly && !node.connections?.success && !node.connections?.error && !isStart

  return (
    <div
      className={`${s.node} ${selected ? s.nodeSelected : ''} ${isStart ? s.nodeStart : ''}`}
      style={{ left: node.x, top: node.y, '--node-color': meta.color }}
    >
      <div className={s.inputDock} style={{ top: INPUT_Y - 5, left: INPUT_X - 5 }} title="Entrada" />

      <button
        type="button"
        className={s.iconCircle}
        style={{
          background: `radial-gradient(circle at 30% 25%, ${meta.color}dd 0%, ${meta.color} 70%)`,
          color: '#fff',
          ...(status === 'error' ? { boxShadow: `0 0 0 3px var(--bg), 0 0 0 6px var(--red), 0 10px 22px rgba(255,95,95,.5)` } : {}),
          ...(status === 'success' ? { boxShadow: `0 0 0 3px var(--bg), 0 0 0 6px var(--green), 0 10px 22px rgba(34,217,138,.4)` } : {}),
          ...(status === 'paused' ? { boxShadow: `0 0 0 3px var(--bg), 0 0 0 6px #f5a623, 0 10px 22px rgba(245,166,35,.4)` } : {}),
        }}
        onMouseDown={readOnly ? undefined : e => { e.stopPropagation(); onStartDrag(e, node.id) }}
        onClick={readOnly ? () => onOpen(node.id) : undefined}
      >
        <span className={s.iconGlyph}>{meta.icon}</span>
        {def?.stub && <span className={s.stubDot} title="Próximamente" />}
        {hasIssue && <span className={s.warnDot} title="Sin conexiones" />}
        {isStart && <span className={s.startDot} title="Nodo de inicio">🚀</span>}
        {status === 'success' && <span className={s.runDotOk}>✓</span>}
        {status === 'error' && <span className={s.runDotErr}>✗</span>}
      </button>

      <div className={s.label} title={meta.label}>{displayLabel}</div>

      {!readOnly && (
        <>
          <button
            className={`${s.portBtn} ${s.portError} ${pendingPort?.nodeId === node.id && pendingPort?.port === 'error' ? s.portActive : ''}`}
            style={{ top: ERROR_PORT_Y - 8, left: ICON_RIGHT - 8 }}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onPortClick(node.id, 'error') }}
            title="Puerto error (rojo)"
          ><span>✗</span></button>
          <button
            className={`${s.portBtn} ${s.portSuccess} ${pendingPort?.nodeId === node.id && pendingPort?.port === 'success' ? s.portActive : ''}`}
            style={{ top: SUCCESS_PORT_Y - 8, left: ICON_RIGHT - 8 }}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onPortClick(node.id, 'success') }}
            title="Puerto éxito (verde)"
          ><span>✓</span></button>
        </>
      )}

      {!pendingPort && !readOnly && (
        <button
          className={s.editHint}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onOpen(node.id) }}
          title="Editar nodo"
        >✎</button>
      )}
    </div>
  )
}

/**
 * Canvas reusable. Modos:
 *   - editar (default): drag, conexiones, modal de edición, menú contextual
 *   - readOnly + runTrace: muestra la traza de una ejecución (sin editar)
 *
 * Props:
 *   nodes, startNodeId
 *   onChange({nodes, startNodeId}) — opcional, ausente en readOnly
 *   readOnly?:    boolean
 *   runTrace?:    { nodeStatuses: {[nodeId]: 'success'|'error'|'paused'}, followedEdges: {[edgeKey]: bool} }
 *   onSelectNode?: (nodeId) => void — solo en readOnly, dispara cuando se hace click en un nodo
 *   flowId — para guardar test executions desde el modal
 */
export default function FlowCanvas({
  nodes, startNodeId, flowId,
  onChange, readOnly = false,
  runTrace, onSelectNode,
}) {
  const { account, selectedAgent } = useAccount()
  const variables = account?.variables || []
  const flows     = account?.flows || []
  const members   = account?.members || []
  const prompts   = selectedAgent?.prompts || []

  const [editingNodeId, setEditingNodeId] = useState(null)
  const [showPicker,    setShowPicker]    = useState(false)
  const [pendingPort,   setPendingPort]   = useState(null)
  const [mousePos,      setMousePos]      = useState(null)
  const [ctxMenu,       setCtxMenu]       = useState(null)
  const canvasRef = useRef(null)
  const dragRef = useRef(null)

  const editingNode = nodes.find(n => n.id === editingNodeId)
  const editingDef  = editingNode ? getNode(editingNode.type) : null

  useEffect(() => {
    if (!pendingPort) return
    function onMove(e) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      setMousePos({
        x: e.clientX - rect.left + canvasRef.current.scrollLeft,
        y: e.clientY - rect.top  + canvasRef.current.scrollTop,
      })
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [pendingPort])

  function commit(updates) {
    if (!onChange || readOnly) return
    onChange({ nodes: updates.nodes ?? nodes, startNodeId: updates.startNodeId ?? startNodeId })
  }
  function commitNodes(newNodes) { commit({ nodes: newNodes }) }

  function addNode(type, canvasPos) {
    const id = 'n_' + Math.random().toString(36).slice(2, 8)
    const def = getNode(type)
    const seedData = {}
    def?.fields?.forEach(f => { if (f.default !== undefined) seedData[f.key] = f.default })
    let x, y
    if (canvasPos) {
      x = Math.max(0, canvasPos.x - NODE_W / 2)
      y = Math.max(0, canvasPos.y - ICON_CENTER_Y)
    } else {
      const col = nodes.length % 5
      const row = Math.floor(nodes.length / 5)
      x = 60 + col * 180; y = 60 + row * 180
    }
    const newNode = { id, type, x, y, data: seedData, connections: { success: null, error: null } }
    const newNodes = [...nodes, newNode]
    const newStart = startNodeId || (newNodes.length === 1 ? id : startNodeId)
    commit({ nodes: newNodes, startNodeId: newStart })
    setShowPicker(false)
  }

  function updateNode(nodeId, updates) {
    commitNodes(nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n))
  }
  function updateNodeData(nodeId, dataPatch) { updateNode(nodeId, { data: dataPatch }) }

  function deleteNode(nodeId) {
    const cleaned = nodes
      .filter(n => n.id !== nodeId)
      .map(n => ({
        ...n,
        connections: {
          success: n.connections?.success === nodeId ? null : n.connections?.success,
          error:   n.connections?.error   === nodeId ? null : n.connections?.error,
        }
      }))
    commit({ nodes: cleaned, startNodeId: startNodeId === nodeId ? (cleaned[0]?.id || null) : startNodeId })
    if (editingNodeId === nodeId) setEditingNodeId(null)
    if (pendingPort?.nodeId === nodeId) setPendingPort(null)
  }

  function duplicateNode(nodeId) {
    const src = nodes.find(n => n.id === nodeId)
    if (!src) return
    const id = 'n_' + Math.random().toString(36).slice(2, 8)
    const dup = { ...src, id, x: src.x + 40, y: src.y + 40, connections: { success: null, error: null } }
    commitNodes([...nodes, dup])
  }

  function deleteConnection(nodeId, port) {
    commitNodes(nodes.map(n => n.id === nodeId
      ? { ...n, connections: { ...n.connections, [port]: null } }
      : n
    ))
  }

  function handlePortClick(nodeId, port) {
    if (pendingPort) {
      if (pendingPort.nodeId === nodeId) { setPendingPort(null); setMousePos(null); return }
      commitNodes(nodes.map(n => n.id === pendingPort.nodeId
        ? { ...n, connections: { ...n.connections, [pendingPort.port]: nodeId } } : n))
      setPendingPort(null); setMousePos(null)
    } else {
      setPendingPort({ nodeId, port })
    }
  }

  function startDrag(e, nodeId) {
    if (pendingPort) {
      if (pendingPort.nodeId !== nodeId) {
        commitNodes(nodes.map(n => n.id === pendingPort.nodeId
          ? { ...n, connections: { ...n.connections, [pendingPort.port]: nodeId } } : n))
      }
      setPendingPort(null); setMousePos(null)
      return
    }
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    dragRef.current = { nodeId, sx: e.clientX, sy: e.clientY, ox: node.x, oy: node.y, moved: false }
    function onMove(ev) {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.sx
      const dy = ev.clientY - dragRef.current.sy
      if (!dragRef.current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      dragRef.current.moved = true
      updateNode(dragRef.current.nodeId, {
        x: Math.max(0, dragRef.current.ox + dx),
        y: Math.max(0, dragRef.current.oy + dy),
      })
    }
    function onUp() {
      const wasClick = dragRef.current && !dragRef.current.moved
      const id = dragRef.current?.nodeId
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (wasClick && id) setEditingNodeId(id)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function cancelPending() { setPendingPort(null); setMousePos(null) }

  function handleCanvasContext(e) {
    if (readOnly) return
    e.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      canvasPos: {
        x: e.clientX - rect.left + canvasRef.current.scrollLeft,
        y: e.clientY - rect.top  + canvasRef.current.scrollTop,
      },
    })
  }

  function handleNodeOpen(nodeId) {
    if (readOnly) { onSelectNode?.(nodeId); return }
    setEditingNodeId(nodeId)
  }

  return (
    <>
      {showPicker && !readOnly && (
        <NodePicker onPick={t => addNode(t)} onClose={() => setShowPicker(false)} />
      )}

      {ctxMenu && !readOnly && (
        <CanvasContextMenu
          x={ctxMenu.x} y={ctxMenu.y} canvasPos={ctxMenu.canvasPos}
          onPick={(t, pos) => addNode(t, pos)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {editingNode && editingDef && !readOnly && (
        <NodeEditModal
          node={editingNode}
          def={editingDef}
          isStart={startNodeId === editingNode.id}
          variables={variables}
          flows={flows}
          members={members}
          prompts={prompts}
          allNodes={nodes}
          flowId={flowId}
          onChange={patch => updateNodeData(editingNode.id, patch)}
          onDelete={() => deleteNode(editingNode.id)}
          onDuplicate={() => { duplicateNode(editingNode.id); setEditingNodeId(null) }}
          onSetStart={() => commit({ startNodeId: editingNode.id })}
          onClose={() => setEditingNodeId(null)}
        />
      )}

      <div
        className={`${s.canvas} ${pendingPort ? s.canvasConnecting : ''} ${readOnly ? s.canvasReadOnly : ''}`}
        ref={canvasRef}
        onClick={() => cancelPending()}
        onContextMenu={handleCanvasContext}
      >
        {startNodeId && (
          <div className={s.startHint}>
            🚀 Inicio: {(() => {
              const sn = nodes.find(n => n.id === startNodeId)
              return sn ? (sn.data?._customName?.trim() || getNode(sn.type)?.label || sn.type) : '?'
            })()}
          </div>
        )}

        <Connections
          nodes={nodes}
          pendingPort={pendingPort} mousePos={mousePos}
          onDeleteConn={deleteConnection}
          runTrace={runTrace}
        />

        {nodes.map(node => (
          <FlowNode
            key={node.id}
            node={node}
            selected={editingNodeId === node.id}
            isStart={startNodeId === node.id}
            readOnly={readOnly}
            status={runTrace?.nodeStatuses?.[node.id]}
            onOpen={handleNodeOpen}
            onStartDrag={startDrag}
            onPortClick={handlePortClick}
            pendingPort={pendingPort}
          />
        ))}

        {nodes.length === 0 && !readOnly && (
          <div className={s.canvasEmpty}>
            <div className={s.canvasEmptyInner}>
              <div className={s.canvasEmptyIcon}>⚡</div>
              <h4>Lienzo vacío</h4>
              <p>Clic derecho en cualquier punto, o el botón <strong>+ Nodo</strong>, para empezar.</p>
            </div>
          </div>
        )}
        {nodes.length === 0 && readOnly && (
          <div className={s.canvasEmpty}>
            <div className={s.canvasEmptyInner}>
              <div className={s.canvasEmptyIcon}>📊</div>
              <h4>Sin ejecución</h4>
              <p>Selecciona una ejecución para ver su recorrido.</p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export { NODE_W, ICON_CENTER_Y }
