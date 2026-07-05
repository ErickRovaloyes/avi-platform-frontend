import { useState, useEffect, useRef } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getDraft, setDraft, clearDraft, pushHistory, getHistory, clearHistory } from '../../lib/flowLocalStorage'
import { api } from '../../lib/api'
import { createConvo, generateGuest } from '../../lib/storage'
import FlowCanvas from './FlowCanvas'
import NodePicker from './NodePicker'
import FlowAiAssistant from './FlowAiAssistant'
import { getNode } from '../../lib/flowNodes'
import FlowExecutionsView from './FlowExecutionsView'
import FlowHistoryView from './FlowHistoryView'
import s from './FlowEditorView.module.css'

// Máximo de pasos guardados para Deshacer/Rehacer.
const HIST_CAP = 60

/**
 * Vista de un flujo individual con dos modos:
 *   - "edit"      — canvas editable con botones de guardar/descartar/probar
 *   - "executions"— historial de ejecuciones + replay
 *
 * Sistema de borrador:
 *   Al entrar al editor, si hay un draft guardado se carga (con aviso visible).
 *   Cualquier cambio actualiza el draft en memoria. Si el usuario sale sin
 *   guardar, el draft se persiste en localStorage. "Guardar" empuja el draft
 *   a la versión live (servidor) y limpia el draft local + crea entrada en
 *   el historial de cambios.
 */
export default function FlowEditorView({ flowId, onBack }) {
  const { account, selectedAgent, updateFlow, deleteFlow, addChannel, updateAgent, reloadDB, getChangeAgentInfo } = useAccount()
  const accId = account?.id
  const flow = (account?.flows || []).find(f => f.id === flowId)

  const [tab, setTab] = useState('edit') // 'edit' | 'executions' | 'history'
  const [launching, setLaunching] = useState(false)
  const [showNodePicker, setShowNodePicker] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [history, setHistory] = useState([])

  // ─── Working copy + isDirty como flag explícito ─────────────────────────
  // Usamos flag en lugar de JSON.stringify() para evitar falsas divergencias
  // por diferencias de orden de claves tras la serialización del contexto.
  const [workingNodes, setWorkingNodesRaw] = useState(flow?.nodes || [])
  const [workingStart, setWorkingStartRaw] = useState(flow?.startNodeId || null)
  const [isDirty, setIsDirty] = useState(false)
  const [hadDraftOnLoad, setHadDraftOnLoad] = useState(false)

  // Pilas de Deshacer/Rehacer (snapshots de la copia de trabajo)
  const [past, setPast] = useState([])
  const [future, setFuture] = useState([])
  // Snapshot "estable" actual: referencia para detectar cambios reales y evitar
  // apilar de nuevo cuando el cambio proviene de un undo/redo.
  const lastSnapRef = useRef({ nodes: flow?.nodes || [], startNodeId: flow?.startNodeId || null })

  // Wrappers que marcan dirty al editar
  function setWorkingNodes(v) { setWorkingNodesRaw(v); setIsDirty(true) }
  function setWorkingStart(v) { setWorkingStartRaw(v); setIsDirty(true) }

  // Ref con el estado más reciente para flushes síncronos (back/unmount/beforeunload)
  const latestRef = useRef({ workingNodes, workingStart, isDirty: false, accId: null, flowId: null })
  latestRef.current = { workingNodes, workingStart, isDirty, accId, flowId: flow?.id }

  // Ref para cancelar setDraft pendiente al guardar/descartar
  const pendingDraftRef = useRef(null)
  const draftTokenRef = useRef(0)

  // Carga draft al abrir el flujo (sólo cuando cambia el flowId)
  useEffect(() => {
    if (!flow || !accId) return
    const draft = getDraft(accId, flow.id)
    const hasDraft = !!(draft && (
      JSON.stringify(draft.nodes) !== JSON.stringify(flow.nodes) ||
      draft.startNodeId !== flow.startNodeId
    ))
    const n0 = (hasDraft ? draft.nodes : flow.nodes) || []
    const s0 = (hasDraft ? draft.startNodeId : flow.startNodeId) || null
    setWorkingNodesRaw(n0)
    setWorkingStartRaw(s0)
    setIsDirty(hasDraft)
    setHadDraftOnLoad(hasDraft)
    // Reinicia las pilas de Deshacer/Rehacer al abrir/cambiar de flujo
    lastSnapRef.current = { nodes: n0, startNodeId: s0 }
    setPast([])
    setFuture([])
    setHistory(getHistory(accId, flow.id))
  }, [flow?.id, accId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-persist a localStorage mientras el usuario edita (debounced 400ms)
  useEffect(() => {
    if (!flow || !accId) return
    // Cancelar escritura previa pendiente
    if (pendingDraftRef.current) {
      clearTimeout(pendingDraftRef.current)
      pendingDraftRef.current = null
    }
    if (!isDirty) {
      clearDraft(accId, flow.id)
      return
    }
    const myToken = ++draftTokenRef.current
    pendingDraftRef.current = setTimeout(() => {
      pendingDraftRef.current = null
      if (myToken !== draftTokenRef.current) return  // invalidado por save/discard
      if (!latestRef.current.isDirty) return          // ya guardado
      setDraft(accId, flow.id, { nodes: latestRef.current.workingNodes, startNodeId: latestRef.current.workingStart })
    }, 400)
    return () => {
      if (pendingDraftRef.current) { clearTimeout(pendingDraftRef.current); pendingDraftRef.current = null }
    }
  }, [isDirty, workingNodes, workingStart, flow?.id, accId])

  // Flush síncrono al desmontar
  useEffect(() => {
    return () => {
      const { workingNodes: wn, workingStart: ws, isDirty: dirty, accId: a, flowId: f } = latestRef.current
      if (dirty && a && f) setDraft(a, f, { nodes: wn, startNodeId: ws })
    }
  }, [])

  // beforeunload: guarda borrador y avisa
  useEffect(() => {
    function onBeforeUnload(e) {
      const { workingNodes: wn, workingStart: ws, isDirty: dirty, accId: a, flowId: f } = latestRef.current
      if (dirty && a && f) {
        setDraft(a, f, { nodes: wn, startNodeId: ws })
        e.preventDefault()
        e.returnValue = 'Tienes cambios sin guardar en el flujo.'
        return e.returnValue
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // ─── Captura de snapshots para Deshacer/Rehacer (coalescido) ──────────────
  // Cada cambio en la copia de trabajo agenda (debounced) un snapshot. Un
  // arrastre genera muchos cambios seguidos → se apila uno solo al terminar.
  // Si la copia de trabajo coincide con el snapshot estable (sin cambios reales
  // o justo tras un undo/redo) no se apila nada.
  useEffect(() => {
    if (!flow) return
    if (workingNodes === lastSnapRef.current.nodes && workingStart === lastSnapRef.current.startNodeId) return
    const t = setTimeout(() => {
      const prev = lastSnapRef.current
      lastSnapRef.current = { nodes: workingNodes, startNodeId: workingStart }
      setPast(p => [...p, prev].slice(-HIST_CAP))
      setFuture([])
    }, 350)
    return () => clearTimeout(t)
  }, [workingNodes, workingStart, flow?.id])

  // Atajos de teclado: Ctrl/Cmd+Z = deshacer · Ctrl+Y / Ctrl+Shift+Z = rehacer.
  // No interfiere con la edición de texto en inputs/areas.
  useEffect(() => {
    if (tab !== 'edit') return
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k !== 'z' && k !== 'y') return
      const el = e.target
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      e.preventDefault()
      if (k === 'y' || (k === 'z' && e.shiftKey)) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, past, future]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!flow) {
    return (
      <div className={s.empty}>
        <div className={s.emptyIcon}>❓</div>
        <h3>Flujo no encontrado</h3>
        <button className={s.backBtn} onClick={onBack}>← Volver a la lista</button>
      </div>
    )
  }

  // ─── Save / Discard ─────────────────────────────────────────────────────
  function cancelPendingDraft() {
    draftTokenRef.current++
    if (pendingDraftRef.current) { clearTimeout(pendingDraftRef.current); pendingDraftRef.current = null }
  }

  function commitSave() {
    cancelPendingDraft()
    // Snapshot del estado anterior para el historial
    pushHistory(accId, flow.id, { nodes: flow.nodes, startNodeId: flow.startNodeId }, 'Versión previa')
    // Persistir en el servidor
    updateFlow(flow.id, { nodes: workingNodes, startNodeId: workingStart })
    // Limpiar borrador — síncrono, antes de cualquier re-render
    clearDraft(accId, flow.id)
    // Marcar como limpio explícitamente (no esperar al re-render)
    setIsDirty(false)
    setHadDraftOnLoad(false)
    setHistory(getHistory(accId, flow.id))
  }

  function discardChanges() {
    if (!confirm('¿Descartar todos los cambios sin guardar?')) return
    cancelPendingDraft()
    // Restaurar al estado guardado usando los setters crudos (no marcan dirty)
    setWorkingNodesRaw(flow.nodes || [])
    setWorkingStartRaw(flow.startNodeId || null)
    clearDraft(accId, flow.id)
    setIsDirty(false)
    setHadDraftOnLoad(false)
    // Reinicia el historial de Deshacer/Rehacer
    lastSnapRef.current = { nodes: flow.nodes || [], startNodeId: flow.startNodeId || null }
    setPast([]); setFuture([])
  }

  // ─── Deshacer / Rehacer ──────────────────────────────────────────────────
  function undo() {
    if (past.length === 0) return
    const prev = past[past.length - 1]
    setPast(p => p.slice(0, -1))
    setFuture(f => [lastSnapRef.current, ...f].slice(0, HIST_CAP))
    lastSnapRef.current = prev
    setWorkingNodes(prev.nodes)
    setWorkingStart(prev.startNodeId)
  }
  function redo() {
    if (future.length === 0) return
    const next = future[0]
    setFuture(f => f.slice(1))
    setPast(p => [...p, lastSnapRef.current].slice(-HIST_CAP))
    lastSnapRef.current = next
    setWorkingNodes(next.nodes)
    setWorkingStart(next.startNodeId)
  }

  function addNodeFromPicker(type) {
    const def = getNode(type)
    const id = 'n_' + Math.random().toString(36).slice(2, 8)
    const seedData = {}
    def?.fields?.forEach(f => { if (f.default !== undefined) seedData[f.key] = f.default })
    const col = workingNodes.length % 5
    const row = Math.floor(workingNodes.length / 5)
    const newNode = { id, type, x: 60 + col * 180, y: 60 + row * 180, data: seedData, connections: { success: null, error: null } }
    const newNodes = [...workingNodes, newNode]
    setWorkingNodes(newNodes)
    if (!workingStart) setWorkingStart(id)
    setShowNodePicker(false)
  }

  function restoreFromHistoryNoConfirm(hist) {
    setWorkingNodes(hist.snapshot.nodes || [])
    setWorkingStart(hist.snapshot.startNodeId || null)
    setTab('edit')
  }

  function handleBack() {
    if (isDirty) {
      if (!confirm('Tienes cambios sin guardar. Quedarán como BORRADOR. ¿Continuar?')) return
      setDraft(accId, flow.id, { nodes: workingNodes, startNodeId: workingStart })
    }
    onBack()
  }

  // ─── Probar flujo en un chat de prueba NUEVO ────────────────────────────
  // Cada ejecución crea una conversación de prueba nueva en el agente activo y
  // la abre en una ventana aparte, ejecutando este flujo en ella.
  async function launchTestChat() {
    if (launching) return
    if (!selectedAgent) {
      alert('Selecciona un agente (en Inbox/Configuración) para probar el flujo en un chat.')
      return
    }
    // El chat carga la versión GUARDADA del flujo: persistimos primero si hace falta.
    if (isDirty) {
      if (!confirm('Hay cambios sin guardar. Se guardarán antes de abrir el chat de prueba. ¿Continuar?')) return
    }
    setLaunching(true)
    try {
      if (isDirty) {
        cancelPendingDraft()
        pushHistory(accId, flow.id, { nodes: flow.nodes, startNodeId: flow.startNodeId }, 'Versión previa')
        await api.put(`/api/flows/${accId}/${flow.id}`, { nodes: workingNodes, startNodeId: workingStart })
        clearDraft(accId, flow.id)
        setIsDirty(false)
        setHadDraftOnLoad(false)
        await reloadDB()
        setHistory(getHistory(accId, flow.id))
      }
      // 1) Asegura un canal de pruebas en el agente activo
      let testCh = (selectedAgent.channels || []).find(c => c.type === 'test')
      if (!testCh) {
        testCh = await addChannel(selectedAgent.id, { type: 'test', name: 'Canal de pruebas', status: 'active', config: {} })
      }
      // 2) Marca este flujo como flujo de pruebas del agente (para los mensajes siguientes)
      if (selectedAgent.testFlowId !== flow.id) updateAgent(selectedAgent.id, { testFlowId: flow.id })
      // 3) Crea una conversación de prueba NUEVA
      const { name, id } = await generateGuest()
      const convId = await createConvo(accId, selectedAgent.id, testCh.id, name, id, 'test')
      // 4) Ábrela en una ventana nueva (modo prueba) ejecutando este flujo
      const url = `${window.location.origin}/chat/${accId}/${selectedAgent.id}/${testCh.id}?mode=test&convId=${convId}&runFlow=${flow.id}`
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      alert('No se pudo crear el chat de prueba: ' + (err?.message || 'error'))
    } finally {
      setLaunching(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={s.view}>
      {/* ─── Top bar ─── */}
      <div className={s.topBar}>
        <div className={s.left}>
          <button className={s.backBtn} onClick={handleBack}>← Volver</button>
          <div className={s.flowName}>
            <input
              className={s.nameInput}
              value={flow.name}
              onChange={e => updateFlow(flow.id, { name: e.target.value })}
            />
            <div className={s.flowMeta}>
              <span className={s.metaItem}>
                <select
                  className={s.triggerSelect}
                  value={flow.trigger || 'manual'}
                  onChange={e => updateFlow(flow.id, { trigger: e.target.value })}
                >
                  <option value="manual">👆 Manual</option>
                  <option value="conversation_start">🎬 Inicio conversación</option>
                  <option value="keyword">🔑 Palabra clave</option>
                  <option value="ai_tool">🤖 Herramienta IA</option>
                </select>
              </span>
              {flow.trigger === 'keyword' && (
                <input
                  className={s.keywordInput}
                  placeholder="palabra clave…"
                  value={flow.triggerKeyword || ''}
                  onChange={e => updateFlow(flow.id, { triggerKeyword: e.target.value })}
                />
              )}
            </div>
          </div>
        </div>

        <div className={s.right}>
          {tab === 'edit' && (
            <>
              <div className={s.histGroup}>
                <button className={s.histBtn} onClick={undo} disabled={past.length === 0}
                  title="Deshacer (Ctrl+Z)">↶</button>
                <button className={s.histBtn} onClick={redo} disabled={future.length === 0}
                  title="Rehacer (Ctrl+Y)">↷</button>
              </div>
              <button className={s.addNodeBtn} onClick={() => setShowNodePicker(true)}>+ Nodo</button>
              {getChangeAgentInfo().caps?.flows !== false && (
                <button className={s.addNodeBtn} onClick={() => setShowAi(true)} title="Diseñar o modificar este flujo con IA (consume tokens del Agente de Cambios)">✨ IA</button>
              )}
              {isDirty ? (
                <span className={s.draftIndicator}>
                  📝 <strong>Borrador</strong> sin guardar
                  {hadDraftOnLoad && <span className={s.draftHint}>(restaurado)</span>}
                </span>
              ) : (
                <span className={s.savedIndicator}>✓ Guardado</span>
              )}
              <button className={s.testBtn} onClick={launchTestChat} disabled={launching}
                title="Crea un chat de prueba nuevo y lo abre en otra ventana ejecutando este flujo">
                {launching ? '⏳ Abriendo…' : '▶ Probar en chat nuevo'}
              </button>
              {isDirty && (
                <button className={s.discardBtn} onClick={discardChanges}>Descartar</button>
              )}
              <button
                className={`${s.saveBtn} ${!isDirty ? s.saveBtnDisabled : ''}`}
                onClick={commitSave}
                disabled={!isDirty}
              >💾 Guardar</button>
            </>
          )}
          <button className={s.delBtn} onClick={() => {
            if (confirm(`¿Eliminar el flujo "${flow.name}"?`)) { deleteFlow(flow.id); onBack() }
          }} title="Eliminar flujo">🗑</button>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div className={s.tabs}>
        <button
          className={`${s.tab} ${tab === 'edit' ? s.tabActive : ''}`}
          onClick={() => setTab('edit')}
        >
          ✏ Editor {isDirty && <span className={s.tabBadge}>•</span>}
        </button>
        <button
          className={`${s.tab} ${tab === 'executions' ? s.tabActive : ''}`}
          onClick={() => setTab('executions')}
        >
          📊 Ejecuciones
        </button>
        <button
          className={`${s.tab} ${tab === 'history' ? s.tabActive : ''}`}
          onClick={() => setTab('history')}
        >
          🕘 Historial de cambios
        </button>
      </div>

      {/* ─── Node picker from topbar button ─── */}
      {showNodePicker && (
        <NodePicker onPick={addNodeFromPicker} onClose={() => setShowNodePicker(false)} />
      )}

      {/* ─── Diseñador IA dentro del flujo (consume tokens del Agente de Cambios) ─── */}
      {showAi && (
        <FlowAiAssistant
          currentNodes={workingNodes}
          currentStart={workingStart}
          onApply={(nodes, startNodeId) => { setWorkingNodes(nodes); setWorkingStart(startNodeId) }}
          onClose={() => setShowAi(false)}
        />
      )}

      {/* ─── Body ─── */}
      <div className={s.body}>
        {tab === 'edit' && (
          <FlowCanvas
            nodes={workingNodes}
            startNodeId={workingStart}
            flowId={flow.id}
            onChange={({ nodes: n, startNodeId: sn }) => {
              if (n) setWorkingNodes(n)
              if (sn !== undefined) setWorkingStart(sn)
            }}
          />
        )}
        {tab === 'executions' && (
          <FlowExecutionsView flow={flow} accId={accId} />
        )}
        {tab === 'history' && (
          <FlowHistoryView
            history={history}
            currentFlow={{ nodes: workingNodes, startNodeId: workingStart }}
            onRestore={restoreFromHistoryNoConfirm}
            onClear={() => {
              if (confirm('¿Limpiar el historial de cambios?')) {
                clearHistory(accId, flow.id)
                setHistory([])
              }
            }}
          />
        )}
      </div>

    </div>
  )
}

function fmtDateTime(ts) {
  return new Date(ts).toLocaleString('es', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
