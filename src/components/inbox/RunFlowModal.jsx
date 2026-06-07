import { useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import { executeFlow } from '../../lib/flowEngine'
import s from './RunFlowModal.module.css'

export default function RunFlowModal({ conv, agentId, onClose }) {
  const { account } = useAccount()
  const [running, setRunning] = useState(false)
  const [lastRun, setLastRun] = useState(null)
  const [selectedFlowId, setSelectedFlowId] = useState('')

  const flows = (account?.flows || []).filter(f => (f.nodes || []).length > 0)

  async function runFlow() {
    if (!selectedFlowId || running) return
    setRunning(true)
    setLastRun(null)
    try {
      await executeFlow({
        flowId: selectedFlowId,
        accId: account.id,
        agId: agentId,
        convId: conv.id,
        triggerContext: { manual: true, triggeredBy: 'inbox' }
      })
      setLastRun({ success: true, flowId: selectedFlowId })
    } catch (err) {
      setLastRun({ success: false, error: err.message })
    }
    setRunning(false)
  }

  const selectedFlow = flows.find(f => f.id === selectedFlowId)

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.header}>
          <div className={s.title}>⚡ Ejecutar flujo manualmente</div>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={s.body}>
          <div className={s.convInfo}>
            <span className={s.convAvatar}>{conv.initials}</span>
            <div>
              <div className={s.convName}>{conv.guestName}</div>
              <div className={s.convSub}>El flujo se ejecutará en esta conversación</div>
            </div>
          </div>

          <div className={s.field}>
            <label className={s.label}>Selecciona un flujo</label>
            <select className={s.select} value={selectedFlowId} onChange={e => setSelectedFlowId(e.target.value)}>
              <option value="">Elegir flujo...</option>
              {flows.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.nodes?.length || 0} nodos · trigger: {f.trigger})
                </option>
              ))}
            </select>
          </div>

          {selectedFlow && (
            <div className={s.flowPreview}>
              <div className={s.flowPreviewTitle}>Vista previa del flujo</div>
              <div className={s.nodeList}>
                {selectedFlow.nodes?.map((node, i) => (
                  <div key={node.id} className={s.nodeItem}>
                    <span className={s.nodeNum}>{i + 1}</span>
                    <span className={s.nodeType}>{node.type}</span>
                    {node.data?.text && <span className={s.nodePreview}>{node.data.text.slice(0, 50)}{node.data.text.length > 50 ? '...' : ''}</span>}
                    {node.data?.seconds && <span className={s.nodePreview}>{node.data.seconds}s</span>}
                    {node.id === selectedFlow.startNodeId && <span className={s.startTag}>INICIO</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {lastRun && (
            <div className={`${s.result} ${lastRun.success ? s.resultOk : s.resultErr}`}>
              {lastRun.success ? '✓ Flujo ejecutado correctamente' : `✗ Error: ${lastRun.error}`}
            </div>
          )}
        </div>

        <div className={s.footer}>
          <button className={s.cancelBtn} onClick={onClose}>Cerrar</button>
          <button
            className={s.runBtn}
            onClick={runFlow}
            disabled={!selectedFlowId || running}
          >
            {running ? (
              <><span className={s.spinner} />Ejecutando...</>
            ) : (
              '▶ Ejecutar flujo'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
