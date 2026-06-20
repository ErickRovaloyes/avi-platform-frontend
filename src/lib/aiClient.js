/**
 * AVI Platform — Unified AI Client
 * Supports OpenAI, DeepSeek (OpenAI-compatible) and Anthropic (Claude).
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
      // V4 son etiquetas de la plataforma; apiModel resuelve al endpoint real
      // de DeepSeek ('deepseek-chat' soporta function-calling de forma fiable).
      { id: 'deepseek-v4-pro',   name: 'DeepSeek V4 Pro',         apiModel: 'deepseek-chat', supportsTools: true,  supportsStream: true,  contextWindow: 128000 },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash',       apiModel: 'deepseek-chat', supportsTools: true,  supportsStream: true,  contextWindow: 128000 },
      { id: 'deepseek-chat',     name: 'DeepSeek V3.2 (Chat)',     supportsTools: true,  supportsStream: true,  contextWindow: 128000 },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)',   supportsTools: true,  supportsStream: true,  isReasoning: true, contextWindow: 128000 },
    ],
    keyField: 'deepseekKey',
    keyPlaceholder: 'sk-...',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-opus-4-7',           name: 'Claude Opus 4.7',   supportsTools: true, supportsStream: true, contextWindow: 200000 },
      { id: 'claude-sonnet-4-6',         name: 'Claude Sonnet 4.6', supportsTools: true, supportsStream: true, contextWindow: 200000 },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5',  supportsTools: true, supportsStream: true, contextWindow: 200000 },
    ],
    keyField: 'anthropicKey',
    keyPlaceholder: 'sk-ant-...',
  },
}

export const ALL_MODELS = Object.values(PROVIDERS).flatMap(p =>
  p.models.map(m => ({ ...m, provider: p.id, providerName: p.name }))
)

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
  if (m.startsWith('claude'))   return 'anthropic'
  if (m.startsWith('deepseek')) return 'deepseek'
  return 'openai'
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
  const tokenParam = isReasoning ? 'max_completion_tokens' : 'max_tokens'

  const body = {
    model,
    messages: isReasoning && provider === 'openai'
      ? messages.map(m => m.role === 'system' ? { ...m, role: 'developer' } : m)
      : messages,
    [tokenParam]: advanced.maxTokens ?? DEFAULT_ADVANCED.maxTokens,
  }
  if (!isReasoning) {
    body.temperature = advanced.temperature ?? DEFAULT_ADVANCED.temperature
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

// Build the body for an Anthropic /v1/messages call
function buildAnthropicBody({ model, systemPrompt, history, tools, stream, advanced = {} }) {
  // Anthropic messages don't include the system role inline; collapse role=system into the top-level `system` field
  const inlineMessages = (history || []).filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }))

  const body = {
    model,
    max_tokens: advanced.maxTokens ?? DEFAULT_ADVANCED.maxTokens,
    temperature: advanced.temperature ?? DEFAULT_ADVANCED.temperature,
    system: systemPrompt || '',
    messages: inlineMessages.length ? inlineMessages : [{ role: 'user', content: '...' }],
  }
  if (advanced.topP != null) body.top_p = advanced.topP
  if (advanced.topK != null) body.top_k = advanced.topK
  if (advanced.stopSequences?.length) body.stop_sequences = advanced.stopSequences
  if (stream) body.stream = true
  if (advanced.extendedThinking) {
    body.thinking = { type: 'enabled', budget_tokens: advanced.thinkingBudgetTokens ?? 5000 }
  }
  if (tools && tools.length) {
    // Convert OpenAI tool format to Anthropic format
    body.tools = tools.map(t => ({
      name: t.function?.name,
      description: t.function?.description,
      input_schema: t.function?.parameters,
    }))
  }
  return body
}

// ─── Main chat function ───────────────────────────────────────────────────────
/**
 * Send a chat completion request. Supports OpenAI, DeepSeek, Anthropic.
 *
 * @param {object} opts
 * @param {string}   opts.provider      - 'openai' | 'deepseek' | 'anthropic'
 * @param {string}   opts.model         - model id
 * @param {string}   opts.apiKey        - API key
 * @param {array}    opts.messages      - chat messages (OpenAI-style; system role is also accepted by Anthropic adapter)
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
}) {
  const adv = { ...DEFAULT_ADVANCED, ...advanced }
  if (maxTokens   != null) adv.maxTokens   = maxTokens
  if (temperature != null) adv.temperature = temperature

  const providerConfig = getProvider(provider)
  const modelConfig    = getModel(provider, model)
  const apiModel       = modelConfig.apiModel || model
  if (!apiKey) throw new Error(`NO_KEY:${provider}`)

  const useTools  = tools.length > 0 && modelConfig.supportsTools
  const useStream = !!onChunk && modelConfig.supportsStream && !useTools

  // ── Anthropic branch ───────────────────────────────────────────────────
  if (provider === 'anthropic') {
    const systemPrompt = messages.find(m => m.role === 'system')?.content || ''
    const history = messages.filter(m => m.role !== 'system')
    const body = buildAnthropicBody({ model: apiModel, systemPrompt, history, tools: useTools ? tools : [], stream: useStream, advanced: adv })
    const res = await fetch(`${providerConfig.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Browser CORS: Anthropic requires the dangerous direct-from-browser opt-in
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(`[${providerConfig.name}] ${errData?.error?.message || `HTTP ${res.status}`}`)
    }

    if (useStream) {
      // Anthropic streams Server-Sent Events; we accumulate text from `content_block_delta` events
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buffer = ''
      let full = ''
      let usage = { promptTokens: 0, completionTokens: 0 }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += dec.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === 'content_block_delta' && evt.delta?.text) {
              full += evt.delta.text
              onChunk(full)
            } else if (evt.type === 'message_delta' && evt.usage) {
              usage.completionTokens = evt.usage.output_tokens || usage.completionTokens
            } else if (evt.type === 'message_start' && evt.message?.usage) {
              usage.promptTokens = evt.message.usage.input_tokens || 0
              usage.completionTokens = evt.message.usage.output_tokens || 0
            }
          } catch {}
        }
      }
      if (onUsage) onUsage(usage)
      return full
    }

    const data = await res.json()
    const text = (data.content || []).map(b => b.text || '').join('').trim()
    const usage = {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
    }
    if (onUsage) onUsage(usage)

    if (useTools) {
      // Build an OpenAI-shape return so callers stay compatible
      const tool_calls = (data.content || [])
        .filter(b => b.type === 'tool_use')
        .map(b => ({
          id: b.id,
          type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
        }))
      return {
        message: { role: 'assistant', content: text || null, tool_calls: tool_calls.length ? tool_calls : undefined },
        finish_reason: data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
      }
    }
    return text
  }

  // ── OpenAI / DeepSeek branch ───────────────────────────────────────────
  const body = buildOpenAIBody({ model: apiModel, messages, tools: useTools ? tools : [], stream: useStream, modelConfig, advanced: adv, provider })

  const res = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
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
}) {
  const adv = { ...DEFAULT_ADVANCED, ...advanced }
  if (maxTokens   != null) adv.maxTokens   = maxTokens
  if (temperature != null) adv.temperature = temperature

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

    // ── Anthropic ─────────────────────────────────────────────────────
    if (provider === 'anthropic') {
      const sys = loopMessages.find(m => m.role === 'system')?.content || systemPrompt
      const rest = loopMessages.filter(m => m.role !== 'system')
      const body = buildAnthropicBody({ model: apiModel, systemPrompt: sys, history: rest, tools: hasTools ? tools : [], stream: useStream, advanced: adv })
      const res = await fetch(`${providerConfig.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(`[${providerConfig.name}] ${errData?.error?.message || `HTTP ${res.status}`}`)
      }

      if (useStream) {
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buffer = ''
        let full = ''
        let usage = { promptTokens: 0, completionTokens: 0 }
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += dec.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop()
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const evt = JSON.parse(line.slice(6))
              if (evt.type === 'content_block_delta' && evt.delta?.text) { full += evt.delta.text; onChunk(full) }
              else if (evt.type === 'message_start' && evt.message?.usage) {
                usage.promptTokens = evt.message.usage.input_tokens || 0
                usage.completionTokens = evt.message.usage.output_tokens || 0
              } else if (evt.type === 'message_delta' && evt.usage) {
                usage.completionTokens = evt.usage.output_tokens || usage.completionTokens
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
      collectUsage({
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
      })

      const textBlocks = (data.content || []).filter(b => b.type === 'text')
      const toolBlocks = (data.content || []).filter(b => b.type === 'tool_use')
      const text = textBlocks.map(b => b.text).join('').trim()

      if (data.stop_reason === 'tool_use' && toolBlocks.length > 0) {
        loopMessages.push({ role: 'assistant', content: text || null, _anthropicToolBlocks: toolBlocks })
        for (const tb of toolBlocks) {
          onDebug('tool_call', `🔧 Ejecutando: ${tb.name}`, tb.input)
          const result = await onToolCall(tb.name, tb.input || {})
          onDebug('tool_result', `✅ Resultado: ${tb.name}`, result)
          // For Anthropic, the tool result must come back as a user message with content blocks
          loopMessages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: tb.id, content: String(result) }] })
        }
        continue
      }
      if (onChunk && text) onChunk(text)
      onDebug('ai_response', '✓ Respuesta final', text.slice(0, 200))
      if (onUsage) onUsage(aggUsage)
      return text
    }

    // ── OpenAI / DeepSeek ─────────────────────────────────────────────
    const body = buildOpenAIBody({ model: apiModel, messages: loopMessages, tools: hasTools ? tools : [], stream: useStream, modelConfig, advanced: adv, provider })

    const res = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
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
