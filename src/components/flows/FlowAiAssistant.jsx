import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAccount } from '../../context/AccountContext'
import { chat, detectProvider } from '../../lib/aiClient'
import { recordTokenUsage } from '../../lib/storage'
import { listNodes } from '../../lib/flowNodes'
import { uid } from '../../lib/storage'

// Catálogo compacto de nodos para la IA (sin alias legacy).
function buildNodeCatalog() {
  return listNodes()
    .filter(n => !String(n.description || '').startsWith('Alias compatible'))
    .map(n => ({
      type: n.type, label: n.label, category: n.category, description: n.description,
      fields: (n.fields || []).map(f => ({ key: f.key, label: f.label, type: f.type })),
    }))
}

// Normaliza la salida del modelo a nodos del canvas. Conserva la posición de los
// nodos existentes cuya id reutiliza la IA; los nuevos se colocan en rejilla debajo.
function normalizeEdited(parsed, validTypes, existingNodes) {
  const existById = {}; (existingNodes || []).forEach(n => { existById[n.id] = n })
  const raw = (Array.isArray(parsed.nodes) ? parsed.nodes : []).filter(n => n && validTypes.has(n.type)).slice(0, 32)
  const idMap = {}
  const maxY = (existingNodes || []).reduce((m, n) => Math.max(m, n.y || 0), 0)
  let newIdx = 0
  raw.forEach(n => {
    const reused = n.id != null && existById[String(n.id)]
    n.__id = reused ? String(n.id) : ('n_' + uid())
    idMap[String(n.id)] = n.__id
  })
  const ref = v => (v != null && idMap[String(v)]) || null
  const nodes = raw.map(n => {
    const prev = existById[n.__id]
    let x, y
    if (prev) { x = prev.x; y = prev.y }
    else { const col = newIdx % 3, row = Math.floor(newIdx / 3); x = 80 + col * 250; y = maxY + 200 + row * 200; newIdx++ }
    return {
      id: n.__id, type: n.type, x, y,
      data: (n.data && typeof n.data === 'object' && !Array.isArray(n.data)) ? n.data : (prev?.data || {}),
      connections: { success: ref(n.connections?.success), error: ref(n.connections?.error) },
    }
  })
  return { startNodeId: ref(parsed.startNodeId) || nodes[0]?.id || null, nodes }
}

function serializeFlow(nodes) {
  if (!nodes?.length) return '(el flujo está vacío)'
  return nodes.map(n => {
    const data = n.data && Object.keys(n.data).length ? ` data=${JSON.stringify(n.data)}` : ''
    const succ = n.connections?.success ? ` →ok:${n.connections.success}` : ''
    const err = n.connections?.error ? ` →err:${n.connections.error}` : ''
    return `- id:${n.id} type:${n.type}${data}${succ}${err}`
  }).join('\n')
}

/**
 * Asistente IA dentro del editor de un flujo. Describe en lenguaje natural un
 * cambio sobre el flujo ACTUAL; la IA devuelve el flujo actualizado, que se
 * aplica a la copia de trabajo (queda como borrador para revisar y guardar).
 * Consume el pool de tokens del Agente de Cambios.
 *
 * Props: currentNodes, currentStart, onApply(nodes, startNodeId), onClose
 */
export default function FlowAiAssistant({ currentNodes, currentStart, onApply, onClose }) {
  const { account, getChangeAgentInfo, useChangeAgentSlot, getEffectiveApiKey } = useAccount()
  const caInfo = getChangeAgentInfo()
  const caProvider = detectProvider(caInfo.model || 'gpt-4o-mini')

  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const exhausted = caInfo.remaining <= 0

  async function generate() {
    if (!input.trim() || busy) return
    const apiKey = getEffectiveApiKey(caProvider)
    if (!apiKey) { setError(`Se requiere una API Key de ${caProvider} configurada (cuenta o super admin).`); return }
    setBusy(true); setError('')
    const catalog = buildNodeCatalog()
    const validTypes = new Set(catalog.map(n => n.type))
    const catalogText = catalog.map(n => {
      const fields = (n.fields || []).map(f => `${f.key}${f.type ? `:${f.type}` : ''}`).join(', ')
      return `- ${n.type} (${n.category || '—'}) — ${n.label || ''}: ${n.description || ''}${fields ? ` | data: { ${fields} }` : ''}`
    }).join('\n')

    const system = `Eres un DISEÑADOR EXPERTO de flujos conversacionales de la plataforma AVI Asistente. El usuario ya tiene un flujo y quiere MODIFICARLO con una instrucción en lenguaje natural. Devuelves el flujo COMPLETO actualizado.

CATÁLOGO DE NODOS (usa solo estos "type" y exactamente estas claves de "data"):
${catalogText}

FLUJO ACTUAL (respeta y reutiliza las ids de los nodos que se conservan; crea ids nuevas SOLO para nodos nuevos):
${serializeFlow(currentNodes)}

FORMATO DE RESPUESTA — JSON ESTRICTO (sin texto antes ni después, sin markdown):
{
  "startNodeId": "<id del primer nodo>",
  "nodes": [ { "id": "<id>", "type": "<type>", "data": { ... }, "connections": { "success": "<id o null>", "error": "<id o null>" } } ]
}

REGLAS:
- Devuelve TODOS los nodos del flujo resultante (los que se mantienen + los nuevos/modificados), no solo los cambios.
- CONSERVA las ids existentes de los nodos que no cambian de identidad; usa ids nuevas y cortas solo para nodos nuevos.
- Usa SOLO "type" del catálogo y en "data" solo las claves indicadas para ese nodo.
- Encadena con connections.success. En nodos "if": success=rama verdadera, error=rama falsa. El último nodo termina con success=null.
- Máximo 32 nodos. Mensajes en español. Usa variables {{nombre}} cuando convenga.
- NO inventes tipos ni claves que no estén en el catálogo.`

    try {
      let usageTotal = 0
      const response = await chat({
        provider: caProvider, model: caInfo.model, apiKey,
        messages: [{ role: 'system', content: system }, { role: 'user', content: `Modifica el flujo así:\n\n${input.trim()}` }],
        maxTokens: 3500, temperature: 0.4,
        onUsage: usage => {
          usageTotal = (usage.promptTokens || 0) + (usage.completionTokens || 0)
          recordTokenUsage(account.id, { agentId: null, conversationId: null, provider: caProvider, model: caInfo.model, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, source: 'change-agent' })
        },
      })
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
      if (!parsed || !Array.isArray(parsed.nodes) || !parsed.nodes.length) throw new Error('La IA no devolvió un flujo válido.')
      const result = normalizeEdited(parsed, validTypes, currentNodes)
      if (!result.nodes.length) throw new Error('La IA no usó nodos válidos del catálogo.')
      if (usageTotal > 0) useChangeAgentSlot(usageTotal)
      onApply(result.nodes, result.startNodeId)
      onClose()
    } catch (err) {
      setError('No se pudo generar: ' + err.message)
    }
    setBusy(false)
  }

  return createPortal((
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
      <div onMouseDown={e => e.stopPropagation()}
        style={{ width: 'min(520px, calc(100vw - 28px))', maxHeight: 'min(88vh, 640px)', overflowY: 'auto', background: 'var(--bg2, #14181d)', border: '1px solid var(--border2)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,.55)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>✨ Diseñar con IA</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>
            Describe qué quieres agregar o cambiar en este flujo. La IA reescribe el flujo (queda como borrador para revisar y guardar).
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
            <span style={{ color: 'var(--text3)' }}>Modelo: <strong>{caInfo.model}</strong></span>
            <span style={{ color: caInfo.remaining <= 0 ? '#ff5f5f' : 'var(--accent, #22d98a)', fontWeight: 700 }}>
              ⚡ {caInfo.remaining.toLocaleString()} / {caInfo.limit.toLocaleString()} tokens
            </span>
          </div>
          {error && <div style={{ padding: 10, background: 'rgba(255,95,95,.12)', border: '1px solid rgba(255,95,95,.35)', borderRadius: 8, fontSize: 12, color: '#ff5f5f' }}>{error}</div>}
          {exhausted ? (
            <div style={{ padding: 12, background: 'rgba(245,166,35,.12)', border: '1px solid rgba(245,166,35,.35)', borderRadius: 8, fontSize: 12.5, color: '#f5a623' }}>
              Has agotado tus tokens del Agente de Cambios este mes. Se reestablecerán el próximo mes.
            </div>
          ) : (<>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ej: agrega un paso que pregunte el correo y lo guarde en una variable antes de despedirse"
              rows={4}
              disabled={busy}
              style={{ width: '100%', padding: 10, fontSize: 13, borderRadius: 8, background: 'var(--field-bg, var(--bg3))', color: 'var(--field-fg, var(--text))', border: '1px solid var(--field-border, var(--border2))', resize: 'vertical' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              ⚠ Reescribe el flujo completo. Podrás revisarlo en el canvas y <strong>Descartar</strong> si no te convence (aún no se guarda). Consume tu cupo de tokens.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={onClose} disabled={busy}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={generate} disabled={busy || !input.trim()}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent, #22d98a)', color: '#04120b', cursor: busy ? 'default' : 'pointer', fontWeight: 700, fontSize: 13, opacity: busy || !input.trim() ? .6 : 1 }}>
                {busy ? 'Diseñando…' : '✨ Generar cambios'}
              </button>
            </div>
          </>)}
        </div>
      </div>
    </div>
  ), document.body)
}
