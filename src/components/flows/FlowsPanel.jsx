import { useState } from 'react'
import FlowsListView from './FlowsListView'
import FlowEditorView from './FlowEditorView'
import FlowLogsView from './FlowLogsView'

/**
 * Punto de entrada para la sección Flujos.
 *
 * Pestañas: Flujos (lista/editor), Logs globales, Registro de errores.
 */
export default function FlowsPanel() {
  const [openFlowId, setOpenFlowId] = useState(null)
  const [tab, setTab] = useState('flows')

  // Dentro del editor de un flujo, ocupamos toda la vista.
  if (openFlowId) {
    return <FlowEditorView flowId={openFlowId} onBack={() => setOpenFlowId(null)} />
  }

  const TABS = [
    { id: 'flows',  label: '⚡ Flujos' },
    { id: 'logs',   label: '📜 Logs globales' },
    { id: 'errors', label: '🛑 Errores' },
  ]
  const tabBtn = (active) => ({
    padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border2)',
    background: active ? 'var(--accent-dim)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text2)',
    fontWeight: active ? 700 : 500, cursor: 'pointer', fontSize: 13,
  })

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.id} style={tabBtn(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'flows'  && <FlowsListView onOpen={setOpenFlowId} />}
        {tab === 'logs'   && <FlowLogsView mode="logs" />}
        {tab === 'errors' && <FlowLogsView mode="errors" />}
      </div>
    </div>
  )
}
