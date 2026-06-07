import { useState } from 'react'
import FlowsListView from './FlowsListView'
import FlowEditorView from './FlowEditorView'

/**
 * Punto de entrada para la sección Flujos.
 *
 * Si no hay flujo seleccionado, muestra la lista (vista cards).
 * Al entrar a un flujo, se renderiza el editor con sus tabs
 * (Editor / Ejecuciones / Historial de cambios).
 */
export default function FlowsPanel() {
  const [openFlowId, setOpenFlowId] = useState(null)

  if (openFlowId) {
    return (
      <FlowEditorView
        flowId={openFlowId}
        onBack={() => setOpenFlowId(null)}
      />
    )
  }
  return <FlowsListView onOpen={setOpenFlowId} />
}
