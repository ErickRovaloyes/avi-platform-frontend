/**
 * AVI Platform — Unified AI Client
 * Supports OpenAI and DeepSeek (OpenAI-compatible).
 *
 * Anthropic (Claude) se retiró de la plataforma; los ids `claude-*` que sigan guardados
 * en prompts o backups se reconducen a GPT-5 mini en normalizeModel().
 *
 * Model flags:
 *   supportsTools  — function calling
 *   supportsStream — streaming responses
 *   isReasoning    — uses max_completion_tokens, no temperature, no system role
 *   contextWindow  — for reference (input + output tokens)
 *
 * All functions accept and forward advanced params from a prompt's `advanced` object:
 *   maxTokens, temperature, topP, topK, presencePenalty, frequencyPenalty,
 *   seed, stopSequences, reasoningEffort, extendedThinking, thinkingBudgetTokens
 *
 * They also support an `onUsage(usage)` callback that fires with
 * { promptTokens, completionTokens } after the full response.
 */

// ─── Provider config ──────────────────────────────────────────────────────────
export const PROVIDERS = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      // ── GPT-5 family (Aug 2025 — flagship) ───────────────────────────────
      { id: 'gpt-5',          name: 'GPT-5',           supportsTools: true,  supportsStream: true,  contextWindow: 400000 },
      { id: 'gpt-5-mini',     name: 'GPT-5 mini',      supportsTools: true,  supportsStream: true,  contextWindow: 400000 },
      { id: 'gpt-5-nano',     name: 'GPT-5 nano',      supportsTools: true,  supportsStream: true,  contextWindow: 400000 },
      // ── GPT-4.1 family (April 2025 — long context) ────────────────────────
      { id: 'gpt-4.1',        name: 'GPT-4.1',         supportsTools: true,  supportsStream: true,  contextWindow: 1047576 },
      { id: 'gpt-4.1-mini',   name: 'GPT-4.1 mini',    supportsTools: true,  supportsStream: true,  contextWindow: 1047576 },
      { id: 'gpt-4.1-nano',   name: 'GPT-4.1 nano',    supportsTools: true,  supportsStream: true,  contextWindow: 1047576 },
      // ── GPT-4o family (multimodal) ────────────────────────────────────────
      { id: 'gpt-4o',         name: 'GPT-4o',          supportsTools: true,  supportsStream: true,  contextWindow: 128000 },
      { id: 'gpt-4o-mini',    name: 'GPT-4o mini',     supportsTools: true,  supportsStream: true,  contextWindow: 128000 },
      // ── Reasoning models (o-series) ───────────────────────────────────────
      { id: 'o3',             name: 'o3 (reasoning)',       supportsTools: true,  supportsStream: false, isReasoning: true, contextWindow: 200000 },
      { id: 'o3-mini',        name: 'o3-mini (reasoning)',  supportsTools: true,  supportsStream: false, isReasoning: true, contextWindow: 200000 },
      { id: 'o4-mini',        name: 'o4-mini (reasoning)',  supportsTools: true,  supportsStream: false, isReasoning: true, contextWindow: 200000 },
      { id: 'o1',             name: 'o1 (reasoning)',       supportsTools: false, supportsStream: false, isReasoning: true, contextWindow: 200000 },
      { id: 'o1-mini',        name: 'o1-mini (reasoning)',  supportsTools: false, supportsStream: false, isReasoning: true, contextWindow: 128000 },
    ],
    keyField: 'openaiKey',
    keyPlaceholder: 'sk-...',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      // La API de DeepSeek ahora SOLO acepta 'deepseek-v4-pro'/'deepseek-v4-flash'
      // (deprecó 'deepseek-chat'/'deepseek-reasoner'). Las etiquetas v4 ya son los
      // nombres reales; los ids antiguos se redirigen vía apiModel por compatibilidad.
      { id: 'deepseek-v4-pro',   name: 'DeepSeek V4 Pro',           supportsTools: true,  supportsStream: true,  contextWindow: 128000 },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash',         supportsTools: true,  supportsStream: true,  contextWindow: 128000 },
      { id: 'deepseek-chat',     name: 'DeepSeek Chat (legado)',     apiModel: 'deepseek-v4-flash', supportsTools: true,  supportsStream: true,  contextWindow: 128000 },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (legado)', apiModel: 'deepseek-v4-pro',   supportsTools: true,  supportsStream: true,  contextWindow: 128000 },
    ],
    keyField: 'deepseekKey',
    keyPlaceholder: 'sk-...',
  },
}

export const ALL_MODELS = Object.values(PROVIDERS).flatMap(p =>
  p.models.map(m => ({ ...m, provider: p.id, providerName: p.name }))
)

// ─── Modelo por defecto de cada proveedor ─────────────────────────────────────
// Solo quedan dos proveedores y la plataforma elige entre ellos sola: Sheets y Calendario no
// funcionan con DeepSeek, así que la conexión de Google decide cuál se usa — conectado →
// GPT-5 mini, desconectado → DeepSeek V4 Flash. El cambio lo escribe el backend
// (backend/services/aiModelPolicy.js); estos ids son los mismos para que la UI y el simulador
// de flujos digan exactamente lo que el backend va a hacer.
export const GOOGLE_MODEL  = { provider: 'openai',   model: 'gpt-5-mini',        label: 'GPT-5 mini' }
export const DEFAULT_MODEL = { provider: 'deepseek', model: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' }

// Alias por proveedor: mismo par de modelos, nombrados por lo que son fuera del contexto Google.
export const PROVIDER_DEFAULT = { openai: GOOGLE_MODEL.model, deepseek: DEFAULT_MODEL.model }

// Claude salió del catálogo. Un `claude-*` guardado en un prompt viejo, un flujo exportado o
// un backup restaurado se reconduce a GPT-5 mini en vez de romper la ejecución.
export function isLegacyClaude(modelId) {
  return String(modelId || '').toLowerCase().startsWith('claude')
}
export function normalizeModel(providerId, modelId) {
  if (providerId === 'anthropic' || isLegacyClaude(modelId)) return { ...GOOGLE_MODEL }
  return { provider: providerId, model: modelId }
}

// ¿El prompt apunta a DeepSeek? Mira proveedor y modelo: los prompts antiguos podían traer
// solo el id del modelo, sin `provider`.
export function isDeepSeek(prompt) {
  return prompt?.provider === 'deepseek' ||
    String(prompt?.model || '').toLowerCase().startsWith('deepseek')
}

export function getProvider(providerId) {
  return PROVIDERS[providerId] || PROVIDERS.openai
}

export function getModel(providerId, modelId) {
  const provider = getProvider(providerId)
  return provider.models.find(m => m.id === modelId) || provider.models[0]
}

export function getApiKey(account, providerId) {
  const provider = getProvider(providerId)
  return account?.[provider.keyField] || ''
}

// Provider derived from a model id when no explicit provider is given
export function detectProvider(modelId = '') {
  const m = modelId.toLowerCase()
  if (m.startsWith('deepseek')) return 'deepseek'
  return 'openai'   // incluye los `claude-*` legados, que normalizeModel() reconduce
}

// ─── Default advanced params per model ────────────────────────────────────────
export const DEFAULT_ADVANCED = {
  maxTokens: 4096,
  temperature: 0.7,
  topP: 1,
  topK: null,
  presencePenalty: 0,
  frequencyPenalty: 0,
  seed: null,
  stopSequences: [],
  reasoningEffort: 'medium', // minimal | low | medium | high
  extendedThinking: false,
  thinkingBudgetTokens: 5000,
}

// Build the body for an OpenAI/DeepSeek chat completion using advanced params
function buildOpenAIBody({ model, messages, tools, stream, modelConfig, advanced = {}, provider }) {
  const isReasoning = modelConfig.isReasoning
  const isOpenAI = provider === 'openai'
  // OpenAI (gpt-5 y serie o) EXIGE `max_completion_tokens` y ya no acepta `max_tokens`.
  // gpt-4o/4.1 también aceptan `max_completion_tokens`. DeepSeek (compat clásica) usa `max_tokens`.
  const tokenParam = isOpenAI ? 'max_completion_tokens' : 'max_tokens'
  // gpt-5 y serie o solo aceptan la temperatura por defecto (1) → no la enviamos.
  const onlyDefaultTemp = isReasoning || (isOpenAI && /^gpt-5/i.test(String(model)))

  const body = {
    model,
    messages: isReasoning && isOpenAI
      ? messages.map(m => m.role === 'system' ? { ...m, role: 'developer' } : m)
      : messages,
    [tokenParam]: advanced.maxTokens ?? DEFAULT_ADVANCED.maxTokens,
  }
  if (!isReasoning) {
    if (!onlyDefaultTemp) body.temperature = advanced.temperature ?? DEFAULT_ADVANCED.temperature
    if (advanced.topP != null)             body.top_p              = advanced.topP
    if (advanced.presencePenalty != null)  body.presence_penalty   = advanced.presencePenalty
    if (advanced.frequencyPenalty != null) body.frequency_penalty  = advanced.frequencyPenalty
    if (advanced.seed != null)             body.seed               = advanced.seed
    if (advanced.stopSequences?.length)    body.stop               = advanced.stopSequences
  } else {
    // Reasoning models support reasoning_effort on OpenAI
    if (provider === 'openai' && advanced.reasoningEffort) {
      body.reasoning_effort = advanced.reasoningEffort
    }
  }
  if (stream) body.stream = true
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto' }
  if (stream) body.stream_options = { include_usage: true }
  return body
}

// ─── Main chat function ───────────────────────────────────────────────────────
/**
 * Send a chat completion request. Supports OpenAI and DeepSeek.
 *
 * @param {object} opts
 * @param {string}   opts.provider      - 'openai' | 'deepseek'
 * @param {string}   opts.model         - model id
 * @param {string}   opts.apiKey        - API key
 * @param {array}    opts.messages      - chat messages (OpenAI-style)
 * @param {array}    opts.tools         - Optional tools array (function calling)
 * @param {object}   opts.advanced      - Advanced params: maxTokens, temperature, topP, topK, ...
 * @param {function} opts.onChunk       - Stream callback (full text so far). Triggers streaming if model supports it.
 * @param {function} opts.onUsage       - Called once at the end with { promptTokens, completionTokens }
 * @returns {Promise<string>}           - Full response text (or response object when tools are involved)
 */
export async function chat({
  provider = 'openai',
  model,
  apiKey,
  messages,
  tools = [],
  advanced = {},
  // Legacy params (still supported)
  maxTokens, temperature,
  onChunk,
  onUsage,
  signal,
}) {
  const adv = { ...DEFAULT_ADVANCED, ...advanced }
  if (maxTokens   != null) adv.maxTokens   = maxTokens
  if (temperature != null) adv.temperature = temperature

  // Reconduce cualquier resto de Claude antes de resolver proveedor y clave.
  ;({ provider, model } = normalizeModel(provider, model))

  const providerConfig = getProvider(provider)
  const modelConfig    = getModel(provider, model)
  const apiModel       = modelConfig.apiModel || model
  if (!apiKey) throw new Error(`NO_KEY:${provider}`)

  const useTools  = tools.length > 0 && modelConfig.supportsTools
  const useStream = !!onChunk && modelConfig.supportsStream && !useTools

  // ── OpenAI / DeepSeek branch ───────────────────────────────────────────
  const body = buildOpenAIBody({ model: apiModel, messages, tools: useTools ? tools : [], stream: useStream, modelConfig, advanced: adv, provider })

  const res = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(`[${providerConfig.name}] ${errData?.error?.message || `HTTP ${res.status}`}`)
  }

  if (useStream) {
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let full = ''
    let usage = { promptTokens: 0, completionTokens: 0 }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const lines = dec.decode(value).split('\n').filter(l => l.startsWith('data: '))
      for (const line of lines) {
        const data = line.slice(6)
        if (data === '[DONE]') break
        try {
          const chunk = JSON.parse(data)
          const text = chunk.choices?.[0]?.delta?.content || ''
          if (text) { full += text; onChunk(full) }
          if (chunk.usage) {
            usage.promptTokens = chunk.usage.prompt_tokens || usage.promptTokens
            usage.completionTokens = chunk.usage.completion_tokens || usage.completionTokens
          }
        } catch {}
      }
    }
    if (onUsage) onUsage(usage)
    return full
  }

  const data = await res.json()
  const choice = data.choices?.[0]
  if (onUsage && data.usage) {
    onUsage({
      promptTokens: data.usage.prompt_tokens || 0,
      completionTokens: data.usage.completion_tokens || 0,
    })
  }
  if (useTools) {
    return { message: choice?.message, finish_reason: choice?.finish_reason }
  }
  return choice?.message?.content || ''
}

// ─── Function calling loop ────────────────────────────────────────────────────
/**
 * Run a full function-calling conversation loop.
 * Handles multiple tool call rounds until finish_reason is 'stop'.
 * Aggregates token usage across all iterations and fires onUsage at the end.
 */
export async function chatWithTools({
  provider = 'openai',
  model,
  apiKey,
  systemPrompt,
  history = [],
  tools = [],
  advanced = {},
  maxTokens, temperature,
  onToolCall,
  onChunk,
  onDebug = () => {},
  onUsage,
  signal,
}) {
  const adv = { ...DEFAULT_ADVANCED, ...advanced }
  if (maxTokens   != null) adv.maxTokens   = maxTokens
  if (temperature != null) adv.temperature = temperature

  // Reconduce cualquier resto de Claude antes de resolver proveedor y clave.
  ;({ provider, model } = normalizeModel(provider, model))

  const providerConfig = getProvider(provider)
  const modelConfig    = getModel(provider, model)
  const apiModel       = modelConfig.apiModel || model
  if (!apiKey) throw new Error(`NO_KEY:${provider}`)

  onDebug('system', `🤖 ${providerConfig.name} · ${model}`, {
    provider, model,
    toolsAvailable: tools.map(t => t.function?.name),
    systemPromptPreview: systemPrompt?.slice(0, 100) + '...',
    advanced: adv,
  })

  // Aggregate usage across iterations
  let aggUsage = { promptTokens: 0, completionTokens: 0 }
  const collectUsage = (u) => {
    aggUsage.promptTokens     += u?.promptTokens     || 0
    aggUsage.completionTokens += u?.completionTokens || 0
  }

  // Reasoning models on OpenAI use 'developer' role for the system prompt
  const systemRole = (modelConfig.isReasoning && provider === 'openai') ? 'developer' : 'system'
  const loopMessages = [
    { role: systemRole, content: systemPrompt },
    ...history,
  ]

  const MAX_ITERATIONS = 6

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const hasTools  = tools.length > 0 && modelConfig.supportsTools
    const useStream = !hasTools && !!onChunk && modelConfig.supportsStream

    onDebug('system', `→ Iteración ${i + 1}${hasTools ? ' (con tools)' : ''}${useStream ? ' (stream)' : ''}`, {})

    // ── OpenAI / DeepSeek ─────────────────────────────────────────────
    const body = buildOpenAIBody({ model: apiModel, messages: loopMessages, tools: hasTools ? tools : [], stream: useStream, modelConfig, advanced: adv, provider })

    const res = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(`[${providerConfig.name}] ${errData?.error?.message || `HTTP ${res.status}`}`)
    }

    if (useStream) {
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let full = ''
      let usage = { promptTokens: 0, completionTokens: 0 }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = dec.decode(value).split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const chunk = JSON.parse(data)
            const text = chunk.choices?.[0]?.delta?.content || ''
            if (text) { full += text; onChunk(full) }
            if (chunk.usage) {
              usage.promptTokens     = chunk.usage.prompt_tokens     || usage.promptTokens
              usage.completionTokens = chunk.usage.completion_tokens || usage.completionTokens
            }
          } catch {}
        }
      }
      collectUsage(usage)
      onDebug('ai_response', '✓ Respuesta generada (stream)', full.slice(0, 200))
      if (onUsage) onUsage(aggUsage)
      return full
    }

    const data = await res.json()
    if (data.usage) collectUsage({ promptTokens: data.usage.prompt_tokens || 0, completionTokens: data.usage.completion_tokens || 0 })
    const choice = data.choices?.[0]
    const message = choice?.message

    onDebug('ai_response', `finish_reason: ${choice?.finish_reason}`, {
      has_tool_calls: !!message?.tool_calls?.length,
      content_preview: message?.content?.slice(0, 100),
    })

    if (choice?.finish_reason === 'tool_calls' && message?.tool_calls?.length > 0) {
      loopMessages.push({ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls })
      for (const tc of message.tool_calls) {
        const toolName = tc.function.name
        let toolArgs = {}
        try { toolArgs = JSON.parse(tc.function.arguments) } catch {}
        onDebug('tool_call', `🔧 Ejecutando: ${toolName}`, toolArgs)
        const result = await onToolCall(toolName, toolArgs)
        onDebug('tool_result', `✅ Resultado: ${toolName}`, result)
        loopMessages.push({ role: 'tool', tool_call_id: tc.id, content: String(result) })
      }
    } else {
      const finalText = message?.content || ''
      if (onChunk && finalText) onChunk(finalText)
      onDebug('ai_response', '✓ Respuesta final', finalText.slice(0, 200))
      if (onUsage) onUsage(aggUsage)
      return finalText
    }
  }

  if (onUsage) onUsage(aggUsage)
  return ''
}
