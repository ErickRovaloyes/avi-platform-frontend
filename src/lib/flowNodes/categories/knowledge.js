/**
 * Knowledge base — reuses the existing RAG service (ragService.js) for vector
 * search; adds simple-search and citation helpers on top.
 */

import { interpolate, logDebug, setVarBoth, sendBotMsg } from '../common'
import { searchRelevantChunks, buildRagContext } from '../../ragService'

async function effectiveOpenaiKey(ctx) {
  if (ctx._openaiKey !== undefined) return ctx._openaiKey
  // Try effective keys endpoint first, fall back to account.openaiKey
  try {
    if (!ctx._effectiveKeys) {
      const { api } = await import('../../api')
      ctx._effectiveKeys = await api.get(`/api/accounts/${ctx.accId}/effective-keys`)
    }
    ctx._openaiKey = ctx._effectiveKeys?.openai?.key || ctx.account?.openaiKey || ''
  } catch { ctx._openaiKey = ctx.account?.openaiKey || '' }
  return ctx._openaiKey
}

export const knowledgeNodes = [
  // ── 1) Buscar Conocimiento (text-based) ─────────────────────────────────
  {
    type: 'kb_search',
    category: 'knowledge',
    label: 'Buscar en KB',
    icon: '🔎', color: '#c179ff',
    description: 'Búsqueda textual simple en los chunks del agente.',
    fields: [
      { key: 'query',  label: 'Consulta', type: 'text', placeholder: '{{_lastUserMessage}}' },
      { key: 'top_k',  label: 'Top K', type: 'number', min: 1, max: 20, default: 5 },
      { key: 'destino', label: 'Guardar resultados (JSON) en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const apiKey = await effectiveOpenaiKey(ctx)
      if (!apiKey) throw new Error('Sin API Key de OpenAI (necesaria para embeddings)')
      const q = interpolate(node.data?.query || '', ctx.variables)
      const results = await searchRelevantChunks(q, ctx.accId, ctx.agId, apiKey)
      const top = (results || []).slice(0, Number(node.data?.top_k) || 5)
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, JSON.stringify(top))
      ctx.variables._last_kb_results = top
      logDebug(ctx, 'flow_run', `🔎 ${top.length} chunks encontrados`, { q })
    },
  },

  // ── 2) Búsqueda Vectorial (alias de KB search) ──────────────────────────
  {
    type: 'kb_vector_search',
    category: 'knowledge',
    label: 'Búsqueda vectorial',
    icon: '🎯', color: '#c179ff',
    description: 'Búsqueda por similitud semántica (embeddings).',
    fields: [
      { key: 'query',   label: 'Consulta', type: 'text' },
      { key: 'top_k',   label: 'Top K', type: 'number', default: 5 },
      { key: 'min_score', label: 'Score mínimo', type: 'number', min: 0, max: 1, step: 0.05, default: 0.25 },
      { key: 'destino', label: 'Guardar en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const apiKey = await effectiveOpenaiKey(ctx)
      if (!apiKey) throw new Error('Sin API Key de OpenAI')
      const q = interpolate(node.data?.query || '', ctx.variables)
      const min = Number(node.data?.min_score) || 0.25
      const results = (await searchRelevantChunks(q, ctx.accId, ctx.agId, apiKey)) || []
      const filtered = results.filter(r => r.score >= min).slice(0, Number(node.data?.top_k) || 5)
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, JSON.stringify(filtered))
      ctx.variables._last_kb_results = filtered
    },
  },

  // ── 3) RAG (retrieval + generation) ─────────────────────────────────────
  // Builds a context block from KB chunks and stores it in a variable so a
  // downstream AI node can use it as part of its system prompt.
  {
    type: 'rag',
    category: 'knowledge',
    label: 'RAG',
    icon: '📚', color: '#c179ff',
    description: 'Construye el bloque de contexto KB para inyectarlo al prompt de IA.',
    fields: [
      { key: 'query',   label: 'Consulta', type: 'text', default: '{{_lastUserMessage}}' },
      { key: 'destino', label: 'Guardar contexto en', type: 'variableRef', default: 'rag_context' },
    ],
    async exec(node, ctx) {
      const apiKey = await effectiveOpenaiKey(ctx)
      if (!apiKey) throw new Error('Sin API Key de OpenAI')
      const q = interpolate(node.data?.query || '', ctx.variables)
      const ctxBlock = await buildRagContext(q, ctx.accId, ctx.agId, apiKey)
      const destino = node.data?.destino || 'rag_context'
      await setVarBoth(ctx, destino, ctxBlock || '')
    },
  },

  // ── 4) Resumen Documental ───────────────────────────────────────────────
  // Toma los top-K resultados y los pasa al resumidor en un solo step.
  {
    type: 'kb_doc_summary',
    category: 'knowledge',
    label: 'Resumen documental',
    icon: '📑', color: '#c179ff',
    description: 'Resume el documento más relevante encontrado para la consulta.',
    fields: [
      { key: 'query', label: 'Consulta', type: 'text', default: '{{_lastUserMessage}}' },
      { key: 'destino', label: 'Guardar resumen en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      // Stub light: returns the first chunk as the "summary" — enough for
      // most quick-look use cases; a deeper version would call an LLM here.
      const apiKey = await effectiveOpenaiKey(ctx)
      if (!apiKey) throw new Error('Sin API Key de OpenAI')
      const q = interpolate(node.data?.query || '', ctx.variables)
      const r = (await searchRelevantChunks(q, ctx.accId, ctx.agId, apiKey)) || []
      const text = r[0]?.text || r[0]?.content || ''
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, text)
      ctx.variables._last_kb_summary = text
    },
  },

  // ── 5) Citación de Fuentes ──────────────────────────────────────────────
  // Formatea las fuentes encontradas como bullets para enviarlas al usuario.
  {
    type: 'kb_citations',
    category: 'knowledge',
    label: 'Citar fuentes',
    icon: '📎', color: '#c179ff',
    description: 'Envía al usuario las fuentes usadas como bullets.',
    fields: [
      { key: 'prefix', label: 'Texto antes de las citas', type: 'text', default: 'Fuentes utilizadas:' },
      { key: 'sendToUser', label: 'Enviar al usuario', type: 'toggle', default: true },
      { key: 'destino', label: 'Guardar texto en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const results = ctx.variables._last_kb_results || []
      const list = Array.isArray(results) ? results : []
      const lines = list.map((r, i) => `• ${r.fileName || r.filename || 'fuente ' + (i + 1)} (relevancia ${(r.score * 100).toFixed(0)}%)`).join('\n')
      const text = `${node.data?.prefix || 'Fuentes:'}\n${lines}`
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, text)
      if (node.data?.sendToUser !== false && lines) sendBotMsg(ctx, text)
    },
  },
]
