/**
 * Acumular mensajes — junta los mensajes consecutivos del usuario en uno solo
 * para responderlos como conjunto. Mismo mecanismo que el backend (líder +
 * debounce por sondeo). Audios usan su transcripción; imágenes y archivos se
 * interpretan con el modelo IA + miniprompt configurados (vía el servidor).
 */

import { readConvos, setLocalVar, transcribeMedia, analyzeMedia } from '../../storage'
import { logDebug, setVarBoth } from '../common'

const VISION_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini (visión)' },
  { value: 'gpt-4o',      label: 'GPT-4o (visión)' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini (visión)' },
  { value: 'gpt-4.1',     label: 'GPT-4.1 (visión)' },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))
const isUserMsg = m => m.sender === 'user' || m.role === 'user'
const isBotMsg  = m => !isUserMsg(m)

async function loadConv(ctx) {
  const list = await readConvos(ctx.accId, ctx.agId)
  return (list || []).find(c => c.id === ctx.convId) || null
}

async function interpretMsg(ctx, node, m) {
  const accId = ctx.accId || ctx.variables?.__accId
  const kind = m.kind
  if (m.mediaId && kind === 'image') {
    try { const r = await analyzeMedia(accId, { mediaId: m.mediaId, model: node.data?.imageModel || 'gpt-4o-mini', prompt: node.data?.imagePrompt || '' }); return r?.text || '[imagen]' }
    catch (e) { logDebug(ctx, 'error', 'No se pudo analizar imagen', e.message); return '[imagen]' }
  }
  if (m.mediaId && kind === 'file') {
    try { const r = await analyzeMedia(accId, { mediaId: m.mediaId, model: node.data?.fileModel || 'gpt-4o-mini', prompt: node.data?.filePrompt || '' }); return r?.text || `[archivo: ${m.filename || ''}]` }
    catch (e) { logDebug(ctx, 'error', 'No se pudo analizar archivo', e.message); return `[archivo: ${m.filename || ''}]` }
  }
  if (m.mediaId && kind === 'audio') {
    if (m.content && m.content.trim()) return m.content
    try { const r = await transcribeMedia(accId, { mediaId: m.mediaId }); return r?.text || '[audio]' } catch { return '[audio]' }
  }
  return m.content || ''
}

export const accumulateNodes = [
  {
    type: 'accumulate_messages',
    category: 'conversation',
    label: 'Acumular mensajes',
    icon: '🧩', color: '#7c6fff',
    description: 'Espera y junta los mensajes consecutivos del usuario en uno solo (texto, audio→transcripción, imagen/archivo→análisis IA) antes de continuar el flujo.',
    fields: [
      { key: 'waitSeconds', label: 'Tiempo de espera entre mensajes (s)', type: 'number', min: 0, max: 120, default: 8,
        hint: 'Tras cada mensaje espera este tiempo; si llega otro, reinicia la cuenta. Al expirar, concatena todo.' },
      { key: 'separator', label: 'Separador', type: 'select', options: [
          { value: '\n', label: 'Salto de línea' },
          { value: ' ',  label: 'Espacio' },
          { value: '. ', label: 'Punto y espacio' },
        ], default: '\n' },
      { key: 'destino', label: 'Guardar mensaje concatenado en', type: 'variableRef',
        hint: 'También se asigna a {{_lastUserMessage}} para el resto del flujo.' },
      { key: 'imageModel', label: 'Modelo IA para imágenes', type: 'select', options: VISION_MODELS, default: 'gpt-4o-mini' },
      { key: 'imagePrompt', label: 'Miniprompt para imágenes', type: 'textarea',
        placeholder: 'Ej: Describe brevemente la imagen y extrae cualquier texto visible.' },
      { key: 'fileModel', label: 'Modelo IA para archivos', type: 'select', options: VISION_MODELS, default: 'gpt-4o-mini' },
      { key: 'filePrompt', label: 'Miniprompt para archivos', type: 'textarea',
        placeholder: 'Ej: Resume el contenido del archivo en puntos clave.' },
    ],
    async exec(node, ctx) {
      const waitMs = Math.max(0, Math.round((Number(node.data?.waitSeconds) || 0) * 1000))
      const sep = node.data?.separator != null ? node.data.separator : '\n'

      // En sandbox (prueba de un nodo) no hay conversación real: usa el último mensaje.
      if (ctx?._sandbox) {
        const v = ctx.variables?._lastUserMessage || ''
        if (node.data?.destino) await setVarBoth(ctx, node.data.destino, v)
        logDebug(ctx, 'flow_run', '🧩 Acumular (sandbox): usa _lastUserMessage', {})
        return
      }

      const conv1 = await loadConv(ctx)
      if (!conv1) { logDebug(ctx, 'flow_run', 'Acumular: sin conversación', {}); return }
      const lv = conv1.localVars || {}
      const now = Date.now()
      const leaderTs = Number(lv._accumLeaderTs || 0)
      const LEADER_TTL = waitMs + 60000

      if (leaderTs && (now - leaderTs) < LEADER_TTL) {
        logDebug(ctx, 'flow_run', '📥 Acumular: mensaje añadido al lote en curso', {})
        ctx._suppressDefaultNext = true
        return
      }

      const myId = 'ldr_' + Math.random().toString(36).slice(2)
      await setLocalVar(ctx.accId, ctx.agId, ctx.convId, '_accumLeaderTs', now)
      await setLocalVar(ctx.accId, ctx.agId, ctx.convId, '_accumLeaderId', myId)
      const convChk = await loadConv(ctx)
      if (convChk?.localVars?._accumLeaderId !== myId) { ctx._suppressDefaultNext = true; return }

      const lastBotTs = Math.max(0, ...(convChk.messages || []).filter(isBotMsg).map(m => Number(m.ts) || 0))
      const sinceTs = Math.max(Number(lv._accumWatermark || 0), lastBotTs)
      const collectNew = (conv, since) => (conv.messages || []).filter(m => isUserMsg(m) && (Number(m.ts) || 0) > since)

      let collected = collectNew(convChk, sinceTs)
      let lastSeen = collected.length ? Math.max(...collected.map(m => Number(m.ts) || 0)) : sinceTs

      while (waitMs > 0) {
        await sleep(waitMs)
        const convN = await loadConv(ctx)
        const more = collectNew(convN, lastSeen)
        if (!more.length) break
        collected = collected.concat(more)
        lastSeen = Math.max(lastSeen, ...more.map(m => Number(m.ts) || 0))
      }

      const parts = []
      for (const m of collected) {
        const t = await interpretMsg(ctx, node, m)
        if (t && String(t).trim()) parts.push(String(t).trim())
      }
      const result = parts.join(sep)

      await setLocalVar(ctx.accId, ctx.agId, ctx.convId, '_accumWatermark', lastSeen)
      await setLocalVar(ctx.accId, ctx.agId, ctx.convId, '_accumLeaderTs', 0)
      await setLocalVar(ctx.accId, ctx.agId, ctx.convId, '_accumLeaderId', '')

      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, result)
      ctx.variables._lastUserMessage = result
      ctx.variables._accumulated_count = parts.length
      logDebug(ctx, 'flow_run', `🧩 Acumulados ${parts.length} mensaje(s)`, { result: result.slice(0, 200) })
    },
  },
]
