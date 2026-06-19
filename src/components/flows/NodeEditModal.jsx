import { useEffect, useState } from 'react'
import { CATEGORY_META } from '../../lib/flowNodes'
import DynamicNodeForm from './DynamicNodeForm'
import TestRunPanel from './TestRunPanel'
import { pushExecution } from '../../lib/flowLocalStorage'
import { useAccount } from '../../context/AccountContext'
import s from './NodeEditModal.module.css'

/**
 * Popup para editar un nodo. Muestra cabecera con icono grande + descripción,
 * el form dinámico (todas las opciones), conexiones actuales y acciones
 * (duplicar, definir inicio, eliminar).
 *
 * Props:
 *   node, def, isStart
 *   variables, flows, members, allNodes  (allNodes para resolver labels de conexiones)
 *   onChange(dataPatch), onDelete, onDuplicate, onSetStart, onClose
 */
export default function NodeEditModal({
  node, def, isStart,
  variables, flows, members, prompts = [], allNodes, flowId,
  onChange, onDelete, onDuplicate, onSetStart, onClose,
}) {
  const [activeTab, setActiveTab] = useState('settings') // settings | test | advanced
  const { account, selectedAgent } = useAccount() || {}
  const accId = account?.id

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!node || !def) return null

  const cat = CATEGORY_META[def.category] || { label: def.category, icon: '•', color: '#888' }
  const successTarget = allNodes.find(n => n.id === node.connections?.success)
  const errorTarget   = allNodes.find(n => n.id === node.connections?.error)

  return (
    <div className={s.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        {/* ─── Header ─── */}
        <div className={s.header} style={{ background: `linear-gradient(135deg, ${def.color}22 0%, ${def.color}08 100%)` }}>
          <div className={s.iconBig} style={{ background: def.color, color: '#fff' }}>
            <span>{def.icon}</span>
          </div>
          <div className={s.titleBlock}>
            <div className={s.titleRow}>
              <h3 className={s.title} style={{ color: def.color }}>{def.label}</h3>
              {def.stub && <span className={s.stubBadge}>próximamente</span>}
              {isStart && <span className={s.startBadge}>🚀 INICIO</span>}
            </div>
            <p className={s.desc}>{def.description}</p>
            <div className={s.metaRow}>
              <span className={s.metaPill}>{cat.icon} {cat.label}</span>
              <span className={s.metaPill}><code>{def.type}</code></span>
              <span className={s.metaPill}>v{def.version}</span>
            </div>
          </div>
          <button className={s.closeBtn} onClick={onClose} title="Cerrar (Esc)">✕</button>
        </div>

        {/* ─── Tabs ─── */}
        <div className={s.tabs}>
          <button
            className={`${s.tab} ${activeTab === 'settings' ? s.tabActive : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            ⚙ Configuración
          </button>
          <button
            className={`${s.tab} ${activeTab === 'test' ? s.tabActive : ''}`}
            onClick={() => setActiveTab('test')}
          >
            ▶ Probar
          </button>
          <button
            className={`${s.tab} ${activeTab === 'advanced' ? s.tabActive : ''}`}
            onClick={() => setActiveTab('advanced')}
          >
            🔧 Avanzado
          </button>
        </div>

        {/* ─── Body ─── */}
        <div className={s.body}>
          {activeTab === 'settings' && (
            <DynamicNodeForm
              node={node}
              def={def}
              onChange={onChange}
              variables={variables}
              flows={flows}
              members={members}
              prompts={prompts}
              calendars={account?.calendars || []}
              cmsAssets={account?.cmsAssets || []}
              accId={accId}
            />
          )}

          {activeTab === 'test' && (
            <TestRunPanel
              mode="node"
              node={node}
              variables={variables}
              account={account}
              agId={selectedAgent?.id}
              embedded
              onSaved={entry => {
                if (accId && flowId) {
                  pushExecution(accId, flowId, {
                    triggeredBy: { type: 'test-node', userId: 'admin' },
                    nodeTested: node.id,
                    ...entry,
                  })
                }
              }}
            />
          )}

          {activeTab === 'advanced' && (
            <div className={s.advancedTab}>
              {/* Connection summary */}
              <div className={s.section}>
                <div className={s.sectionTitle}>Conexiones</div>
                <div className={s.connRow}>
                  <span className={s.connLabel} style={{ color: '#22d98a' }}>✓ Éxito →</span>
                  <span className={s.connTarget}>
                    {successTarget ? `${successTarget.type}` : <em>sin conectar</em>}
                  </span>
                </div>
                <div className={s.connRow}>
                  <span className={s.connLabel} style={{ color: '#ff5f5f' }}>✗ Error →</span>
                  <span className={s.connTarget}>
                    {errorTarget ? `${errorTarget.type}` : <em>sin conectar</em>}
                  </span>
                </div>
                <p className={s.hint}>
                  Para crear o eliminar conexiones, usa los puertos del nodo en el canvas.
                </p>
              </div>

              {/* Behavior options stored in node.data._opts */}
              <div className={s.section}>
                <div className={s.sectionTitle}>Comportamiento</div>
                <label className={s.toggle}>
                  <input
                    type="checkbox"
                    checked={!!node.data?._continueOnError}
                    onChange={e => onChange({ ...node.data, _continueOnError: e.target.checked })}
                  />
                  <span>Continuar el flujo aunque este nodo falle</span>
                </label>
                <label className={s.toggle}>
                  <input
                    type="checkbox"
                    checked={!!node.data?._verbose}
                    onChange={e => onChange({ ...node.data, _verbose: e.target.checked })}
                  />
                  <span>Logs detallados de este nodo</span>
                </label>
              </div>

              {/* Identity */}
              <div className={s.section}>
                <div className={s.sectionTitle}>Identidad</div>
                <div className={s.field}>
                  <label>Nombre personalizado (opcional)</label>
                  <input
                    className={s.input}
                    value={node.data?._customName || ''}
                    placeholder={def.label}
                    onChange={e => onChange({ ...node.data, _customName: e.target.value })}
                  />
                </div>
                <div className={s.field}>
                  <label>Nota / comentario</label>
                  <textarea
                    className={s.textarea}
                    rows={2}
                    value={node.data?._note || ''}
                    placeholder="Notas internas para tu equipo"
                    onChange={e => onChange({ ...node.data, _note: e.target.value })}
                  />
                </div>
                <div className={s.idRow}>
                  <span>ID:</span>
                  <code>{node.id}</code>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className={s.footer}>
          <div className={s.footerLeft}>
            {!isStart && (
              <button className={s.startActionBtn} onClick={() => { onSetStart(); }}>
                🚀 Definir como inicio
              </button>
            )}
          </div>
          <div className={s.footerRight}>
            <button className={s.ghostBtn} onClick={onDuplicate}>⧉ Duplicar</button>
            <button
              className={s.dangerBtn}
              onClick={() => {
                if (confirm(`¿Eliminar el nodo "${def.label}"? Sus conexiones se perderán.`)) {
                  onDelete()
                }
              }}
            >🗑 Eliminar</button>
            <button className={s.primaryBtn} onClick={onClose}>Listo</button>
          </div>
        </div>
      </div>
    </div>
  )
}
