/**
 * AI category — all nodes hit one of the providers configured on the account
 * (OpenAI / DeepSeek / Anthropic). They reuse the unified aiClient.chat()
 * so the model can be anything the account has access to.
 */

import { chat, detectProvider, getApiKey } from '../../aiClient'
import { interpolate, sendBotMsg, logDebug, setVarBoth } from '../common'
import { api } from '../../api'
import { readConvos, recordTokenUsage, dispatchN8N } from '../../storage'

// Sensible default model per provider when a prompt only specifies the provider.
const DEFAULT_MODEL = { openai: 'gpt-4o-mini', deepseek: 'deepseek-chat', anthropic: 'claude-sonnet-4-6' }

// Builds the OpenAI/Anthropic function schema from the account's AI tools.
function buildOneToolDef(tool) {
  return {
    type: 'function',
    function: {
      name: tool.name.replace(/\s+/g, '_').toLowerCase(),
      description: tool.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          (tool.collectFields || []).map(f => [
            f.paramName || f.label.replace(/\s+/g, '_').toLowerCase(),
            { type: 'string', description: f.label },
          ])
        ),
        required: (tool.collectFields || []).filter(f => f.required !== false).map(f => f.paramName || f.label.replace(/\s+/g, '_').toLowerCase()),
      },
    },
  }
}
// La herramienta especial "enviar_recurso" (actionType cms_resource) trae su propia
// definición con el catálogo del CMS. El resto usa la genérica.
function buildToolDefs(toolList, account) {
  return (toolList || [])
    .map(tool => (tool.actionType === 'cms_resource' ? buildResourceToolDef(account) : buildOneToolDef(tool)))
    .filter(Boolean)
}

// ── CMS: herramienta especial enviar_recurso (paridad con el backend) ──────────
const cmsBaseUrl = () => (typeof window !== 'undefined' && window.location?.origin) || ''
const normName = s => String(s || '').trim().toLowerCase()
function tokenize(s) { return normName(s).split(/[^a-z0-9áéíóúñü]+/i).filter(w => w.length > 1) }
function scoreText(queryTokens, text) {
  const t = normName(text); let score = 0
  for (const qt of queryTokens) { if (qt && t.includes(qt)) score += qt.length >= 4 ? 2 : 1 }
  return score
}
const assetHaystack = a => `${a.name} ${a.description || ''} ${(a.tags || []).join(' ')} ${a.category || ''}`
function pickBest(list, queryTokens) {
  let best = { asset: null, score: -1 }
  for (const a of list) { const sc = scoreText(queryTokens, assetHaystack(a)); if (sc > best.score) best = { asset: a, score: sc } }
  return best
}
function buildResourceToolDef(account) {
  const assets = account?.cmsAssets || []
  const folders = account?.cmsFolders || []
  if (!assets.length) return null
  const unitFolders = folders.filter(f => f.type === 'unit' && assets.some(a => a.folderId === f.id))
  const lines = []
  if (unitFolders.length) {
    lines.push('PRODUCTOS / SERVICIOS (cada uno agrupa varias fotos — al pedirlo se envían todas, o una concreta si el usuario especifica):')
    unitFolders.forEach(f => lines.push(`• ${f.name}${f.description ? ` — ${f.description}` : ''}`))
  }
  const loose = assets.filter(a => { const fol = folders.find(x => x.id === a.folderId); return !fol || fol.type !== 'unit' })
  if (loose.length) {
    lines.push('RECURSOS SUELTOS:')
    loose.slice(0, 60).forEach(a => lines.push(`• ${a.name}${a.description ? `: ${a.description}` : ''}${(a.tags || []).length ? ` [${a.tags.join(', ')}]` : ''}${a.category ? ` (${a.category})` : ''}`))
  }
  return {
    type: 'function',
    function: {
      name: 'enviar_recurso',
      description: `Envía al usuario imágenes o documentos del CMS. Úsalo cuando el usuario los pida o cuando ayuden (catálogo, lista de precios, foto de un producto/servicio, folleto, manual…). En "recurso" indica el producto/servicio o recurso de esta lista. Si es un PRODUCTO/SERVICIO y el usuario solo quiere verlo, deja "detalle" vacío y se enviarán todas sus fotos; si pide algo concreto, ponlo en "detalle".\n${lines.join('\n')}`,
      parameters: {
        type: 'object',
        properties: {
          recurso: { type: 'string', description: 'Producto/servicio o recurso a enviar (lo más parecido de la lista).' },
          detalle: { type: 'string', description: 'Opcional: aspecto/foto concreta que pide el usuario dentro de ese producto.' },
          mensaje: { type: 'string', description: 'Texto opcional para acompañar el/los archivo(s).' },
        },
        required: ['recurso'],
      },
    },
  }
}
async function sendOneAsset(ctx, a, caption) {
  const url = `${cmsBaseUrl()}/api/media/${ctx.accId}/${a.mediaId}/raw`
  const kind = ['image', 'video', 'audio'].includes(a.kind) ? a.kind : 'file'
  // mediaId (+kind/mime/filename/sizeBytes) → la UI lo renderiza con <MediaMessage>;
  // media/mediaUrl → entrega al canal externo cuando aplica.
  await sendBotMsg(ctx, caption || '', {
    mediaId: a.mediaId, kind, mime: a.mime, filename: a.filename, sizeBytes: a.sizeBytes,
    media: { kind, url, filename: a.filename }, mediaUrl: url,
  })
}
async function sendCmsResource(ctx, args) {
  const assets = ctx.account?.cmsAssets || []
  const folders = ctx.account?.cmsFolders || []
  if (!assets.length) return 'No hay recursos en la biblioteca del CMS.'
  const recurso = args?.recurso || ''
  const detalle = args?.detalle || ''
  const caption = args?.mensaje || ''
  const recTokens = tokenize(recurso)
  const folderScored = folders
    .map(f => ({ f, score: scoreText(recTokens, f.name) + scoreText(recTokens, f.description || ''), items: assets.filter(a => a.folderId === f.id) }))
    .filter(x => x.items.length)
    .sort((a, b) => b.score - a.score)
  const topFolder = folderScored[0]
  if (topFolder && topFolder.score >= 2) {
    const { f, items } = topFolder
    if (f.type === 'unit' && !detalle.trim()) {
      for (let i = 0; i < items.length; i++) await sendOneAsset(ctx, items[i], i === 0 ? caption : '')
      return `Te envié ${items.length} archivo(s) de "${f.name}".`
    }
    const q2 = tokenize(`${detalle} ${detalle ? '' : recurso}`)
    const best = pickBest(items, q2.length ? q2 : recTokens)
    if (best.asset && best.score >= 1) { await sendOneAsset(ctx, best.asset, caption); return `Envié "${best.asset.name}" de "${f.name}".` }
    const approx = best.asset || items[0]
    await sendOneAsset(ctx, approx, '')
    return `No tengo exactamente lo que buscas dentro de "${f.name}". Te envío lo más aproximado: "${approx.name}".`
  }
  const queryTokens = [...recTokens, ...tokenize(detalle)]
  const best = pickBest(assets, queryTokens)
  if (best.asset && best.score >= 2) { await sendOneAsset(ctx, best.asset, caption); return `Recurso "${best.asset.name}" enviado al usuario.` }
  if (best.asset) { await sendOneAsset(ctx, best.asset, ''); return `No encontré exactamente lo que buscas. Te muestro lo más aproximado: "${best.asset.name}".` }
  return `No encontré ningún recurso parecido a "${recurso}".`
}

// Executes a tool the model decided to call: persists collected fields into vars
// and, depending on actionType, runs a flow or dispatches an N8N webhook. The
// returned string is fed back to the model so it can keep the conversation going.
async function execToolCall(ctx, toolList, toolName, toolArgs) {
  const normalized = toolName.replace(/\s+/g, '_').toLowerCase()
  const tool = (toolList || []).find(t => t.name.replace(/\s+/g, '_').toLowerCase() === normalized)
  if (!tool) return `Error: herramienta "${toolName}" no encontrada o no asignada a este prompt.`

  // 1) Guardar los campos recolectados en variables
  const results = []
  for (const field of (tool.collectFields || [])) {
    const paramName = field.paramName || field.label.replace(/\s+/g, '_').toLowerCase()
    const value = toolArgs?.[paramName]
    if (value !== undefined && field.variableId) {
      await setVarBoth(ctx, field.variableId, value)
      results.push(`${field.label}: "${value}" guardado`)
    }
  }

  // En sandbox no disparamos efectos externos (flujos / N8N)
  if (ctx?._sandbox) return results.length ? results.join(', ') : 'OK (sandbox)'

  // 2) Acción según el tipo
  if (tool.actionType === 'cms_resource') {
    return sendCmsResource(ctx, toolArgs)
  }
  if (tool.actionType === 'n8n' && tool.n8nIntegrationId) {
    try {
      const r = await dispatchN8N(tool.n8nIntegrationId, {
        tool: tool.name, args: toolArgs,
        _meta: { accountId: ctx.accId, agentId: ctx.agId, conversationId: ctx.convId, ts: Date.now() },
      }, { forceSync: true })
      if (!r?.ok) return `Error N8N: ${r?.error || 'desconocido'}`
      return typeof r.data === 'string' ? r.data : JSON.stringify(r.data || { ok: true })
    } catch (e) { return `Error N8N: ${e.message}` }
  }
  if (tool.actionType === 'flow' && tool.flowId) {
    // import diferido para evitar dependencia circular con flowEngine
    const { executeFlow } = await import('../../flowEngine')
    await executeFlow({ flowId: tool.flowId, accId: ctx.accId, agId: ctx.agId, convId: ctx.convId, triggerContext: { tool: tool.name, args: toolArgs } })
    return results.length ? results.join(', ') : 'Flujo ejecutado'
  }
  return results.length ? results.join(', ') : 'Ejecutado'
}

// Loads the recent conversation turns so the agent has MEMORY of the chat.
// Maps every stored message to OpenAI-style {role, content}. The trailing user
// turn(s) are dropped because the AI Agent node supplies its own "current user
// message" explicitly — keeping them would duplicate the last message.
async function loadHistory(ctx, limit = 16) {
  if (ctx?._sandbox) return []
  try {
    const convos = await readConvos(ctx.accId, ctx.agId)
    const conv = (convos || []).find(c => c.id === ctx.convId)
    const msgs = (conv?.messages || [])
      .filter(m => typeof m.content === 'string' && m.content.trim())
      .map(m => ({
        role: (m.sender === 'user' || m.role === 'user') ? 'user' : 'assistant',
        content: String(m.content),
      }))
    while (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.pop()
    return msgs.slice(-limit)
  } catch { return [] }
}

// Resolves the chat() call with the account's preferred model/provider/key.
// Falls back to platform-default keys via the /effective-keys endpoint.
// `provider` can be passed explicitly (e.g. taken from a saved prompt); otherwise
// it's inferred from the model name.
// `history` (optional) is an array of prior {role, content} turns for memory.
// `tools` (optional) function-calling defs. SINGLE-ROUND behaviour: if the model
// decides to call a tool we run it via `onToolCall(name, args)` and return ''
// WITHOUT generating an assistant text reply (so the caller can stop the flow).
// If the model doesn't call a tool, its text answer is returned normally.
// `onTools({ invoked, names })` reports whether a tool was activated.
// `onResolved` (optional) reports the actual {provider, model, keySource} used,
// so callers can log the TRUTH to the debugger instead of the raw node config.
async function callAI(ctx, { systemPrompt, userPrompt, model, provider, maxTokens = 800, temperature = 0.5, jsonMode = false, history = [], tools = [], onToolCall, onTools, onResolved }) {
  const prov = provider || detectProvider(model || 'gpt-4o-mini')
  const finalModel = model || DEFAULT_MODEL[prov] || 'gpt-4o-mini'
  // Cache effective keys in ctx for the whole flow run
  if (!ctx._effectiveKeys) {
    try { ctx._effectiveKeys = await api.get(`/api/accounts/${ctx.accId}/effective-keys`) } catch { ctx._effectiveKeys = {} }
  }
  const keyInfo = ctx._effectiveKeys?.[prov]
  const apiKey = keyInfo?.key || getApiKey(ctx.account, prov)
  // Report what we actually resolved BEFORE the key check, so the debugger shows
  // the intended model even when the call fails for a missing key.
  if (typeof onResolved === 'function') {
    onResolved({ provider: prov, model: finalModel, keySource: keyInfo?.key ? (keyInfo.source || 'account') : 'none' })
  }
  if (!apiKey) throw new Error(`Sin API Key para ${prov}`)

  const onUsage = (u) => {
    if (ctx?._sandbox) return
    try {
      recordTokenUsage(ctx.accId, {
        agentId: ctx.agId, conversationId: ctx.convId,
        provider: prov, model: finalModel,
        promptTokens: u?.promptTokens, completionTokens: u?.completionTokens,
        source: 'flow',
      })
    } catch {}
  }

  const messages = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  for (const h of history) {
    if (h?.content) messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content) })
  }
  messages.push({ role: 'user', content: userPrompt })

  // ── Con herramientas → PROTOCOLO MULTI-RONDA (estándar) ───────────────────
  // El modelo llama herramienta(s) → ejecutamos → le devolvemos el resultado como
  // mensaje `tool` → vuelve a responder (texto final u otra herramienta). No
  // re-alimentar el resultado confunde a algunos modelos (DeepSeek) y hace que la
  // herramienta "se active solo una vez". Anthropic no soporta este hilo → 1 ronda.
  if (tools.length > 0) {
    const canThread = prov !== 'anthropic'
    const convo = messages.slice()
    const executed = []
    const MAX_ROUNDS = 4
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const result = await chat({ provider: prov, model: finalModel, apiKey, messages: convo, tools, maxTokens, temperature, onUsage })
      if (typeof result === 'string') {
        if (typeof onTools === 'function') onTools({ invoked: executed.length > 0, names: executed })
        return result
      }
      const message = result?.message
      const toolCalls = message?.tool_calls || []
      if (!toolCalls.length) {
        if (typeof onTools === 'function') onTools({ invoked: executed.length > 0, names: executed })
        return (typeof message?.content === 'string' ? message.content : '') || ''
      }
      if (canThread) convo.push({ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls })
      for (const tc of toolCalls) {
        let args = {}
        try { args = JSON.parse(tc.function?.arguments || '{}') } catch {}
        const name = tc.function?.name
        logDebug(ctx, 'tool_call', `🔧 Herramienta: ${name}`, args)
        const r = onToolCall ? await onToolCall(name, args) : 'OK'
        logDebug(ctx, 'tool_result', `✅ Resultado: ${name}`, r)
        executed.push(name)
        if (canThread) convo.push({ role: 'tool', tool_call_id: tc.id, content: typeof r === 'string' ? r : JSON.stringify(r ?? '') })
      }
      if (!canThread) {
        if (typeof onTools === 'function') onTools({ invoked: true, names: executed })
        return ''
      }
    }
    if (typeof onTools === 'function') onTools({ invoked: executed.length > 0, names: executed })
    return ''
  }

  // ── Sin herramientas → completion simple ─────────────────────────────────
  const response = await chat({
    provider: prov, model: finalModel, apiKey, messages,
    maxTokens, temperature,
    advanced: jsonMode ? { responseFormat: { type: 'json_object' } } : {},
    onUsage,
  })
  return response || ''
}

export const aiNodes = [
  // ── 1) Agente IA (main) ─────────────────────────────────────────────────
  {
    type: 'ai_agent',
    category: 'ai',
    label: 'Agente IA',
    icon: '🤖', color: '#22d98a',
    description: 'Agente con prompt configurable. Escribe el prompt aquí o usa uno de los prompts guardados del agente.',
    fields: [
      { key: 'promptMode',  label: 'Fuente del prompt', type: 'select', default: 'inline', options: [
          { value: 'inline',   label: '✏ Escribir prompt aquí' },
          { value: 'active',   label: '⭐ Prompt activo del agente' },
          { value: 'from_list', label: '📋 Elegir de la lista de prompts' },
        ]},
      // ── Solo en modo "inline": el agente se configura manualmente ──
      { key: 'nombre',      label: 'Nombre del agente', type: 'text', default: 'Asistente',
        showIf: d => (d.promptMode || 'inline') === 'inline' },
      { key: 'modelo',      label: 'Modelo',  type: 'text', default: 'gpt-4o-mini',
        showIf: d => (d.promptMode || 'inline') === 'inline' },
      { key: 'temperatura', label: 'Temperatura', type: 'number', min: 0, max: 2, step: 0.1, default: 0.5,
        showIf: d => (d.promptMode || 'inline') === 'inline' },
      { key: 'prompt',      label: 'System prompt', type: 'textarea',
        showIf: d => (d.promptMode || 'inline') === 'inline' },
      // ── Solo en modo "elegir de la lista" ──
      { key: 'promptId',    label: 'Prompt de la lista', type: 'promptRef',
        hint: 'Se usarán el modelo y la temperatura definidos en ese prompt.',
        showIf: d => d.promptMode === 'from_list' },
      // ── Mensaje de usuario: lo que el módulo interpreta como último mensaje ──
      { key: 'mensajeUsuario', label: 'Mensaje de usuario', type: 'textarea',
        default: '{{_lastUserMessage}}',
        hint: 'Lo que el modelo recibirá como mensaje del usuario. Por defecto usa la variable de sistema {{_lastUserMessage}}. Puedes escribir texto fijo o combinar variables.' },
      { key: 'objetivo',    label: 'Objetivo adicional (opcional)', type: 'text' },
      { key: 'sendToUser',  label: 'Enviar respuesta al usuario', type: 'toggle', default: true },
      { key: 'variable_destino', label: 'Guardar respuesta en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const mode = node.data?.promptMode || 'inline'
      let systemPrompt = ''
      let model = node.data?.modelo || 'gpt-4o-mini'
      let provider                                   // inline → derivado del modelo; prompt → del prompt
      let temperature = Number(node.data?.temperatura ?? 0.5)
      let promptLabel = 'inline'
      let assignedTools = []                          // herramientas IA asignadas al prompt elegido

      if (mode === 'active' || mode === 'from_list') {
        // Toma el prompt guardado del agente y hereda su proveedor/modelo/temperatura
        const allPrompts = ctx.account?.agents?.flatMap(a => a.prompts || []) || []
        const chosen = mode === 'active'
          ? allPrompts.find(p => p.isActive)
          : allPrompts.find(p => p.id === node.data?.promptId)
        // Si no se encuentra el prompt NO caemos en silencio al default gpt-4o-mini:
        // fallar de forma clara para que el modelo elegido (p.ej. DeepSeek) se use.
        if (!chosen) {
          const msg = mode === 'active'
            ? 'Agente IA: no hay ningún prompt marcado como activo en el agente.'
            : `Agente IA: el prompt seleccionado (${node.data?.promptId || '—'}) ya no existe.`
          logDebug(ctx, 'error', `⚠ ${msg}`, { mode, promptId: node.data?.promptId, promptsDisponibles: allPrompts.map(p => p.id) })
          throw new Error(msg)
        }
        systemPrompt = chosen.content || ''
        provider = chosen.provider || undefined       // p.ej. 'deepseek' / 'anthropic' / 'openai'
        model    = chosen.model || undefined           // si falta, callAI usa el default del provider
        const t = chosen.advanced?.temperature ?? chosen.temperature
        if (t != null) temperature = Number(t)
        promptLabel = chosen.name || '(sin nombre)'
        // Herramientas IA asignadas a ESTE prompt (no al agente)
        const toolIds = chosen.toolIds || []
        assignedTools = (ctx.account?.aiTools || []).filter(t => toolIds.includes(t.id))
      } else {
        systemPrompt = interpolate(node.data?.prompt || '', ctx.variables)
      }

      const objetivo = interpolate(node.data?.objetivo || '', ctx.variables)
      const sys = [systemPrompt, objetivo && `OBJETIVO: ${objetivo}`].filter(Boolean).join('\n\n')

      // Mensaje de usuario: campo explícito (interpolado) → cae al último mensaje real
      const fallbackMsg = ctx.variables?._lastUserMessage || ctx.variables?.message || ''
      let userMsg = fallbackMsg
      const rawField = node.data?.mensajeUsuario
      if (rawField !== undefined && rawField !== '') {
        const interpolated = interpolate(rawField, ctx.variables)
        // Si la interpolación quedó vacía o sin resolver ({{...}}), usa el fallback
        userMsg = (interpolated && !/^\{\{.*\}\}$/.test(interpolated.trim())) ? interpolated : fallbackMsg
      }
      // Mensaje citado (responder/reply) → contexto para el modelo.
      const quoted = ctx.variables?._quotedMessage
      if (quoted && String(quoted).trim()) {
        const u = (userMsg || '').trim()
        userMsg = `[El usuario está respondiendo a este mensaje anterior: "${String(quoted).trim()}"]\n\n` +
          (u ? `Mensaje del usuario: ${u}` : 'El usuario no escribió texto; responde basándote en el mensaje citado.')
      }

      // Historial real de la conversación → el agente tiene memoria de los turnos previos
      const history = await loadHistory(ctx)

      // Herramientas IA del prompt → function-calling
      const toolDefs = buildToolDefs(assignedTools, ctx.account)

      let resolved = null
      let toolsInvoked = false
      const reply = await callAI(ctx, {
        systemPrompt: sys,
        userPrompt: userMsg || '(sin contexto del usuario, responde con un saludo)',
        model,
        provider,
        history,
        tools: toolDefs,
        onToolCall: (name, args) => execToolCall(ctx, assignedTools, name, args),
        onTools: info => { toolsInvoked = info.invoked },
        maxTokens: 800,
        temperature,
        onResolved: r => { resolved = r },
      })

      // Log de la VERDAD: qué proveedor/modelo se usó realmente (no el node.data crudo)
      logDebug(ctx, 'flow_run',
        `🤖 Agente IA · ${resolved?.provider || provider || '?'} · ${resolved?.model || model || '?'}`,
        {
          promptMode: mode, prompt: promptLabel,
          provider: resolved?.provider, model: resolved?.model,
          temperature, keySource: resolved?.keySource,
          turnosDeHistorial: history.length,
          herramientas: assignedTools.map(t => t.name),
          herramientaActivada: toolsInvoked,
          mensajeUsuario: (userMsg || '').slice(0, 200),
        })

      // Si la IA activó una Herramienta IA: NO se genera respuesta del asistente
      // y el flujo de fallback se DETIENE aquí (la herramienta toma el control).
      if (toolsInvoked) {
        // Tras ejecutar la(s) herramienta(s), el modelo puede dar una respuesta
        // final (multi-ronda). Si la hay, se envía; luego el flujo se detiene.
        logDebug(ctx, 'flow_run', '🔧 Herramienta IA activada' + (reply ? ' (+ respuesta final)' : ''), {})
        if (node.data?.variable_destino) await setVarBoth(ctx, node.data.variable_destino, reply)
        if (node.data?.sendToUser !== false && reply) await sendBotMsg(ctx, reply)
        ctx._suppressDefaultNext = true
        return
      }

      if (node.data?.variable_destino) await setVarBoth(ctx, node.data.variable_destino, reply)
      if (node.data?.sendToUser !== false && reply) await sendBotMsg(ctx, reply)
    },
  },

  // ── 2) Chat IA (simple) ─────────────────────────────────────────────────
  {
    type: 'ai_chat',
    category: 'ai',
    label: 'Chat IA',
    icon: '💡', color: '#22d98a',
    description: 'Versión simple del agente, sin herramientas.',
    fields: [
      { key: 'modelo', label: 'Modelo', type: 'text', default: 'gpt-4o-mini' },
      { key: 'prompt', label: 'System prompt', type: 'textarea' },
      { key: 'variable_destino', label: 'Guardar respuesta en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const sys = interpolate(node.data?.prompt || '', ctx.variables)
      const history = await loadHistory(ctx)
      const reply = await callAI(ctx, {
        systemPrompt: sys,
        userPrompt: ctx.variables?._lastUserMessage || '',
        model: node.data?.modelo, maxTokens: 600, history,
      })
      if (node.data?.variable_destino) await setVarBoth(ctx, node.data.variable_destino, reply)
      else if (reply) await sendBotMsg(ctx, reply)
    },
  },

  // ── 3) Clasificador de Intención ────────────────────────────────────────
  {
    type: 'intent_classifier',
    category: 'ai',
    label: 'Clasificador de intención',
    icon: '🎯', color: '#7c6fff',
    description: 'Clasifica el mensaje del usuario en una de las intents definidas.',
    fields: [
      { key: 'texto',   label: 'Texto a clasificar', type: 'text', default: '{{_lastUserMessage}}' },
      { key: 'intents', label: 'Intents (coma)',     type: 'text', placeholder: 'ventas, soporte, queja, saludo' },
      { key: 'modelo',  label: 'Modelo',             type: 'text', default: 'gpt-4o-mini' },
      { key: 'variable_destino', label: 'Guardar en', type: 'variableRef' },
    ],
    outputs: { intent: { type: 'string' }, confidence: { type: 'number' } },
    async exec(node, ctx) {
      const txt = interpolate(node.data?.texto || '{{_lastUserMessage}}', ctx.variables)
      const intents = String(node.data?.intents || '').split(',').map(s => s.trim()).filter(Boolean)
      if (!txt || !intents.length) throw new Error('Falta texto o intents')
      const sys = `Eres un clasificador. Dado el texto, elige UNA intent de la lista: ${intents.join(', ')}.
Responde SOLO JSON: {"intent":"<una de la lista>","confidence":0.0-1.0}`
      const raw = await callAI(ctx, { systemPrompt: sys, userPrompt: txt, model: node.data?.modelo, maxTokens: 100, temperature: 0, jsonMode: true })
      let parsed = { intent: intents[0], confidence: 0 }
      try { parsed = JSON.parse(raw) } catch {}
      if (node.data?.variable_destino) await setVarBoth(ctx, node.data.variable_destino, parsed.intent)
      ctx.variables._last_intent = parsed.intent
      ctx.variables._last_intent_confidence = parsed.confidence
      logDebug(ctx, 'flow_run', `🎯 Intent: ${parsed.intent} (${(parsed.confidence * 100).toFixed(0)}%)`, parsed)
    },
  },

  // ── 4) Extractor de Entidades ───────────────────────────────────────────
  {
    type: 'entity_extractor',
    category: 'ai',
    label: 'Extractor de entidades',
    icon: '🧩', color: '#4fa8ff',
    description: 'Extrae nombres, emails, teléfonos, fechas, ciudades, productos.',
    fields: [
      { key: 'texto',     label: 'Texto', type: 'text', default: '{{_lastUserMessage}}' },
      { key: 'entidades', label: 'Entidades a extraer (coma)', type: 'text', default: 'nombre, email, telefono, fecha, ciudad, producto' },
      { key: 'modelo',    label: 'Modelo', type: 'text', default: 'gpt-4o-mini' },
      { key: 'variable_destino', label: 'Guardar JSON en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const txt = interpolate(node.data?.texto || '', ctx.variables)
      const entities = String(node.data?.entidades || '').split(',').map(s => s.trim()).filter(Boolean)
      const sys = `Extrae las siguientes entidades del texto. Devuelve SOLO JSON con esas claves; valor null si no aparece. Claves: ${entities.join(', ')}.`
      const raw = await callAI(ctx, { systemPrompt: sys, userPrompt: txt, model: node.data?.modelo, maxTokens: 300, temperature: 0, jsonMode: true })
      let parsed = {}
      try { parsed = JSON.parse(raw) } catch {}
      if (node.data?.variable_destino) await setVarBoth(ctx, node.data.variable_destino, JSON.stringify(parsed))
      for (const [k, v] of Object.entries(parsed)) {
        if (v != null) ctx.variables[`entity_${k}`] = v
      }
      logDebug(ctx, 'flow_run', '🧩 Entidades extraídas', parsed)
    },
  },

  // ── 5) Analizador de Sentimiento ────────────────────────────────────────
  {
    type: 'sentiment_analyzer',
    category: 'ai',
    label: 'Sentimiento',
    icon: '😊', color: '#f5a623',
    description: 'Analiza tono: positivo / neutral / negativo.',
    fields: [
      { key: 'texto',  label: 'Texto', type: 'text', default: '{{_lastUserMessage}}' },
      { key: 'modelo', label: 'Modelo', type: 'text', default: 'gpt-4o-mini' },
      { key: 'variable_destino', label: 'Guardar en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const txt = interpolate(node.data?.texto || '', ctx.variables)
      const sys = 'Clasifica el sentimiento del texto. Devuelve SOLO JSON: {"sentiment":"positive|neutral|negative","score":-1.0 a 1.0}'
      const raw = await callAI(ctx, { systemPrompt: sys, userPrompt: txt, model: node.data?.modelo, maxTokens: 80, temperature: 0, jsonMode: true })
      let parsed = { sentiment: 'neutral', score: 0 }
      try { parsed = JSON.parse(raw) } catch {}
      if (node.data?.variable_destino) await setVarBoth(ctx, node.data.variable_destino, parsed.sentiment)
      ctx.variables._last_sentiment = parsed.sentiment
      ctx.variables._last_sentiment_score = parsed.score
    },
  },

  // ── 6) Resumidor ────────────────────────────────────────────────────────
  {
    type: 'summarizer',
    category: 'ai',
    label: 'Resumidor',
    icon: '📝', color: '#c179ff',
    description: 'Resume un texto largo a un puñado de bullets.',
    fields: [
      { key: 'texto',    label: 'Texto a resumir', type: 'textarea' },
      { key: 'longitud', label: 'Tipo de resumen', type: 'select', options: [
          { value: 'breve',     label: 'Breve (1 párrafo)' },
          { value: 'mediano',   label: 'Mediano (3-5 bullets)' },
          { value: 'detallado', label: 'Detallado' },
        ], default: 'mediano' },
      { key: 'modelo',   label: 'Modelo', type: 'text', default: 'gpt-4o-mini' },
      { key: 'variable_destino', label: 'Guardar en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const txt = interpolate(node.data?.texto || '', ctx.variables)
      const longitud = node.data?.longitud || 'mediano'
      const sys = `Resume el texto en español. Formato: ${longitud}.`
      const summary = await callAI(ctx, { systemPrompt: sys, userPrompt: txt, model: node.data?.modelo, maxTokens: 400 })
      if (node.data?.variable_destino) await setVarBoth(ctx, node.data.variable_destino, summary)
      else await sendBotMsg(ctx, summary)
    },
  },

  // ── 7) Reescritor ───────────────────────────────────────────────────────
  {
    type: 'rewriter',
    category: 'ai',
    label: 'Reescritor',
    icon: '✏️', color: '#7c6fff',
    description: 'Reescribe un texto con un nuevo tono/estilo.',
    fields: [
      { key: 'texto', label: 'Texto', type: 'textarea' },
      { key: 'tono',  label: 'Tono',  type: 'select', options: [
          { value: 'formal',     label: 'Formal' },
          { value: 'informal',   label: 'Informal' },
          { value: 'persuasivo', label: 'Persuasivo' },
          { value: 'empatico',   label: 'Empático' },
          { value: 'breve',      label: 'Breve' },
        ], default: 'informal' },
      { key: 'modelo', label: 'Modelo', type: 'text', default: 'gpt-4o-mini' },
      { key: 'variable_destino', label: 'Guardar en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const txt = interpolate(node.data?.texto || '', ctx.variables)
      const tono = node.data?.tono || 'informal'
      const sys = `Reescribe el siguiente texto con tono ${tono}. Mantén el sentido. Devuelve SOLO el texto reescrito.`
      const out = await callAI(ctx, { systemPrompt: sys, userPrompt: txt, model: node.data?.modelo, maxTokens: 400 })
      if (node.data?.variable_destino) await setVarBoth(ctx, node.data.variable_destino, out)
      else await sendBotMsg(ctx, out)
    },
  },

  // ── 8) Router IA ────────────────────────────────────────────────────────
  // Escoge cuál de N agentes/flujos seguir. La elección queda en una var y el
  // engine la usa para decidir la ruta vía connections.routes[selection].
  {
    type: 'ai_router',
    category: 'ai',
    label: 'Router IA',
    icon: '🛤', color: '#2dd4c8',
    description: 'Elige automáticamente la mejor ruta según el mensaje.',
    fields: [
      { key: 'texto', label: 'Texto base', type: 'text', default: '{{_lastUserMessage}}' },
      { key: 'rutas', label: 'Rutas (coma)', type: 'text', placeholder: 'ventas, soporte, billing' },
      { key: 'modelo', label: 'Modelo', type: 'text', default: 'gpt-4o-mini' },
      { key: 'variable_destino', label: 'Guardar ruta en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const txt = interpolate(node.data?.texto || '', ctx.variables)
      const rutas = String(node.data?.rutas || '').split(',').map(s => s.trim()).filter(Boolean)
      if (!rutas.length) throw new Error('Define al menos una ruta')
      const sys = `Eres un router. Elige UNA de estas rutas: ${rutas.join(', ')}.\nResponde SOLO el nombre exacto.`
      const choice = (await callAI(ctx, { systemPrompt: sys, userPrompt: txt, model: node.data?.modelo, maxTokens: 16, temperature: 0 })).trim().toLowerCase()
      const winner = rutas.find(r => r.toLowerCase() === choice) || rutas[0]
      if (node.data?.variable_destino) await setVarBoth(ctx, node.data.variable_destino, winner)
      ctx.variables._last_route = winner
      logDebug(ctx, 'flow_run', `🛤 Router IA → ${winner}`, { rutas })
    },
  },
]
