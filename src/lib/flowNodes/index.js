/**
 * Single entry point: importing this file auto-registers every node definition.
 *
 *   import { executeNode, getNode, listByCategory, listCategories } from './flowNodes'
 *
 * The legacy types ('message', 'image', 'file', 'wait', 'condition', 'openai')
 * are also registered as aliases for backwards compatibility with existing flows.
 */

import { registerMany, getNode } from './registry'
import { conversationNodes }  from './categories/conversation'
import { aiNodes }            from './categories/ai'
import { memoryNodes }        from './categories/memory'
import { controlNodes }       from './categories/control'
import { dataNodes }          from './categories/data'
import { knowledgeNodes }     from './categories/knowledge'
import { integrationNodes }   from './categories/integrations'
import { crmNodes }           from './categories/crm'
import { humanNodes }         from './categories/human'
import { analyticsNodes }     from './categories/analytics'
import { calendarNodes }      from './categories/calendar'
import { accumulateNodes }    from './categories/accumulate'

// Register the canonical catalog
registerMany([
  ...conversationNodes,
  ...aiNodes,
  ...memoryNodes,
  ...controlNodes,
  ...dataNodes,
  ...knowledgeNodes,
  ...integrationNodes,
  ...crmNodes,
  ...humanNodes,
  ...analyticsNodes,
  ...calendarNodes,
  ...accumulateNodes,
])

// ── Backwards-compat: legacy short type names used by existing flows ──────
// These delegate to the canonical node so old flows keep running.
function alias(legacyType, canonicalType, transform) {
  const def = getNode(canonicalType)
  if (!def) return
  registerMany([{
    ...def,
    type: legacyType,
    description: `Alias compatible de ${canonicalType}`,
    exec: async (node, ctx) => {
      const remapped = transform ? transform(node) : node
      return def.exec(remapped, ctx)
    },
  }])
}

// Legacy: `message` → `send_message` (old payload used `text` instead of `mensaje`)
alias('message', 'send_message', node => ({
  ...node, data: { ...node.data, mensaje: node.data?.mensaje ?? node.data?.text },
}))

// Legacy: `image` → `send_image`
alias('image', 'send_image', node => ({
  ...node, data: { ...node.data, url: node.data?.url, caption: node.data?.caption },
}))

// Legacy: `file` → `send_document`
alias('file', 'send_document', node => ({
  ...node, data: { ...node.data, url: node.data?.url, filename: node.data?.filename },
}))

// Legacy: `openai` → `ai_chat` (mapping prompt → prompt)
alias('openai', 'ai_chat', node => ({
  ...node, data: { ...node.data, prompt: node.data?.prompt, modelo: node.data?.model || 'gpt-4o-mini' },
}))

// Legacy: `condition` → `if` (variable+equals semantics)
alias('condition', 'if', node => ({
  ...node, data: {
    campo: `{{${node.data?.variableId || node.data?.variableName || ''}}}`,
    operador: '==',
    valor: node.data?.equals || '',
  },
}))

// Note: `wait` keeps its original type — it already matches the canonical
// name in this catalog.

// Re-export public API
export { executeNode, getNode, listNodes, listCategories, listByCategory, CATEGORY_META, registerNode } from './registry'
