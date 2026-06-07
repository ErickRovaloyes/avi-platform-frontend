/**
 * Conversation category — sending messages and asking the user for input.
 * Many of these existed already as plain types (message/image/file). The new
 * registry-based versions add extra metadata (typing_delay, format, buttons, ...).
 */

import { interpolate, sendBotMsg, logDebug, setVarBoth } from '../common'

export const conversationNodes = [
  // ── 1) Enviar Mensaje ───────────────────────────────────────────────────
  {
    type: 'send_message',
    category: 'conversation',
    label: 'Enviar mensaje',
    icon: '💬', color: '#7c6fff',
    description: 'Envía un texto al usuario. Soporta {{variables}} y formato markdown.',
    fields: [
      { key: 'mensaje',      label: 'Mensaje',       type: 'textarea', placeholder: 'Hola {{nombre}}, ¿cómo estás?' },
      { key: 'formato',      label: 'Formato',       type: 'select', options: [
          { value: 'markdown', label: 'Markdown' },
          { value: 'plain',    label: 'Texto plano' },
          { value: 'html',     label: 'HTML' },
        ], default: 'markdown' },
      { key: 'typing_delay', label: 'Typing delay (s)', type: 'number', min: 0, max: 10, default: 0 },
      { key: 'guardar_historial', label: 'Guardar en historial', type: 'toggle', default: true },
    ],
    outputs: { message_id: { type: 'string' }, status: { type: 'string' } },
    async exec(node, ctx) {
      const text = interpolate(node.data?.mensaje || node.data?.text || '', ctx.variables)
      if (!text.trim()) throw new Error('Mensaje vacío')
      const delay = Math.min(Number(node.data?.typing_delay || 0) * 1000, 10000)
      if (delay > 0) await new Promise(r => setTimeout(r, delay))
      sendBotMsg(ctx, text, { format: node.data?.formato || 'markdown' })
    },
  },

  // ── 2) Solicitar Respuesta ──────────────────────────────────────────────
  // The actual "wait for response" is enforced by the flowRunning flag on
  // the conversation: the engine pauses, and the next user message resumes.
  // Here we only push the question + remember which var should store the answer.
  {
    type: 'request_answer',
    category: 'conversation',
    label: 'Solicitar respuesta',
    icon: '❓', color: '#f5a623',
    description: 'Pausa el flujo y espera la respuesta del usuario.',
    fields: [
      { key: 'pregunta',       label: 'Pregunta',       type: 'textarea', placeholder: '¿Cuál es tu correo?' },
      { key: 'tipo_respuesta', label: 'Tipo de respuesta', type: 'select', options: [
          { value: 'texto',    label: 'Texto' },
          { value: 'email',    label: 'Email' },
          { value: 'telefono', label: 'Teléfono' },
          { value: 'fecha',    label: 'Fecha' },
          { value: 'numero',   label: 'Número' },
        ], default: 'texto' },
      { key: 'variable_destino', label: 'Guardar respuesta en variable', type: 'variableRef' },
      { key: 'timeout',        label: 'Timeout', type: 'text', default: '24h', placeholder: '24h, 30m, 5d…' },
      { key: 'requerido',      label: 'Requerido', type: 'toggle', default: true },
    ],
    async exec(node, ctx) {
      const q = interpolate(node.data?.pregunta || '', ctx.variables)
      if (q.trim()) sendBotMsg(ctx, q, { awaitsResponse: true, expectedType: node.data?.tipo_respuesta })
      // Mark the conversation as awaiting input — actual pause is the engine's job
      ctx.awaitInput = {
        type: node.data?.tipo_respuesta || 'texto',
        variableId: node.data?.variable_destino,
        required: node.data?.requerido !== false,
        timeout: node.data?.timeout || '24h',
      }
      logDebug(ctx, 'flow_run', '⏸ Esperando respuesta del usuario', ctx.awaitInput)
    },
  },

  // ── 3) Botones ──────────────────────────────────────────────────────────
  {
    type: 'buttons',
    category: 'conversation',
    label: 'Botones',
    icon: '🔘', color: '#4fa8ff',
    description: 'Envía botones interactivos. Máximo recomendado: 3.',
    fields: [
      { key: 'titulo',   label: 'Mensaje con los botones', type: 'textarea', placeholder: '¿Qué prefieres?' },
      { key: 'opciones', label: 'Opciones (una por línea)', type: 'list', placeholder: 'Sí\nNo\nMás info' },
      { key: 'variable_destino', label: 'Guardar selección en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const text = interpolate(node.data?.titulo || '', ctx.variables)
      const raw = node.data?.opciones || ''
      const opts = Array.isArray(raw) ? raw : String(raw).split('\n').map(s => s.trim()).filter(Boolean)
      if (text.trim()) sendBotMsg(ctx, text, { buttons: opts })
      ctx.awaitInput = { type: 'button', variableId: node.data?.variable_destino, options: opts }
      logDebug(ctx, 'flow_run', `🔘 ${opts.length} opciones enviadas`, { opts })
    },
  },

  // ── 4) Lista Interactiva ────────────────────────────────────────────────
  {
    type: 'list',
    category: 'conversation',
    label: 'Lista interactiva',
    icon: '📋', color: '#2dd4c8',
    description: 'Lista desplegable con categorías y elementos. Ideal para menús y catálogos.',
    fields: [
      { key: 'titulo',  label: 'Título',  type: 'text' },
      { key: 'cuerpo',  label: 'Cuerpo',  type: 'textarea' },
      { key: 'items',   label: 'Items JSON', type: 'code', language: 'json',
        placeholder: '[{"title":"Producto A","description":"…"},{"title":"Producto B"}]' },
      { key: 'variable_destino', label: 'Guardar selección en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const title = interpolate(node.data?.titulo || '', ctx.variables)
      const body  = interpolate(node.data?.cuerpo || '', ctx.variables)
      let items = []
      try { items = JSON.parse(node.data?.items || '[]') } catch {}
      sendBotMsg(ctx, body || title, { list: { title, items } })
      ctx.awaitInput = { type: 'list_pick', variableId: node.data?.variable_destino, items }
    },
  },

  // ── 5) Carrusel ─────────────────────────────────────────────────────────
  {
    type: 'carousel',
    category: 'conversation',
    label: 'Carrusel',
    icon: '🎠', color: '#c179ff',
    description: 'Tarjetas visuales deslizables.',
    fields: [
      { key: 'cards', label: 'Cards JSON', type: 'code', language: 'json',
        placeholder: '[{"title":"…","image":"…","button":"Ver"}]' },
    ],
    async exec(node, ctx) {
      let cards = []
      try { cards = JSON.parse(node.data?.cards || '[]') } catch {}
      sendBotMsg(ctx, '', { carousel: cards })
    },
  },

  // ── 6) Imagen ───────────────────────────────────────────────────────────
  {
    type: 'send_image',
    category: 'conversation',
    label: 'Enviar imagen',
    icon: '🖼', color: '#4fa8ff',
    description: 'Envía una imagen con caption opcional.',
    fields: [
      { key: 'url',     label: 'URL de la imagen', type: 'text' },
      { key: 'caption', label: 'Pie / caption',    type: 'text' },
    ],
    async exec(node, ctx) {
      const url     = interpolate(node.data?.url || '', ctx.variables)
      const caption = interpolate(node.data?.caption || '', ctx.variables)
      if (!url) throw new Error('URL de imagen vacía')
      sendBotMsg(ctx, caption, { media: { kind: 'image', url }, mediaUrl: url, kind: 'image' })
    },
  },

  // ── 7) Audio ────────────────────────────────────────────────────────────
  {
    type: 'send_audio',
    category: 'conversation',
    label: 'Enviar audio',
    icon: '🎤', color: '#f5a623',
    description: 'Envía un audio por URL.',
    fields: [{ key: 'url', label: 'URL', type: 'text' }],
    async exec(node, ctx) {
      const url = interpolate(node.data?.url || '', ctx.variables)
      if (!url) throw new Error('URL de audio vacía')
      sendBotMsg(ctx, '', { media: { kind: 'audio', url }, mediaUrl: url, kind: 'audio' })
    },
  },

  // ── 8) Video ────────────────────────────────────────────────────────────
  {
    type: 'send_video',
    category: 'conversation',
    label: 'Enviar video',
    icon: '🎬', color: '#7c6fff',
    description: 'Envía un video por URL.',
    fields: [
      { key: 'url',     label: 'URL', type: 'text' },
      { key: 'caption', label: 'Caption', type: 'text' },
    ],
    async exec(node, ctx) {
      const url     = interpolate(node.data?.url || '', ctx.variables)
      const caption = interpolate(node.data?.caption || '', ctx.variables)
      if (!url) throw new Error('URL de video vacía')
      sendBotMsg(ctx, caption, { media: { kind: 'video', url }, mediaUrl: url, kind: 'video' })
    },
  },

  // ── 9) Documento ────────────────────────────────────────────────────────
  {
    type: 'send_document',
    category: 'conversation',
    label: 'Enviar documento',
    icon: '📎', color: '#f5a623',
    description: 'Envía un archivo / documento por URL.',
    fields: [
      { key: 'url',      label: 'URL',     type: 'text' },
      { key: 'filename', label: 'Nombre del archivo', type: 'text' },
    ],
    async exec(node, ctx) {
      const url = interpolate(node.data?.url || '', ctx.variables)
      const fn  = interpolate(node.data?.filename || '', ctx.variables)
      if (!url) throw new Error('URL de documento vacía')
      sendBotMsg(ctx, fn || '', { media: { kind: 'file', url, filename: fn }, mediaUrl: url, kind: 'file', filename: fn })
    },
  },

  // ── 10) Confirmación ────────────────────────────────────────────────────
  {
    type: 'confirmation',
    category: 'conversation',
    label: 'Confirmación',
    icon: '✅', color: '#22d98a',
    description: 'Pregunta Sí / No. Sigue la rama de éxito si Sí, error si No.',
    fields: [
      { key: 'pregunta',  label: 'Pregunta', type: 'textarea', default: '¿Confirmas?' },
      { key: 'yes_label', label: 'Texto botón sí', type: 'text', default: 'Sí' },
      { key: 'no_label',  label: 'Texto botón no', type: 'text', default: 'No' },
      { key: 'variable_destino', label: 'Guardar respuesta en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const text = interpolate(node.data?.pregunta || '¿Confirmas?', ctx.variables)
      const yes  = node.data?.yes_label || 'Sí'
      const no   = node.data?.no_label  || 'No'
      sendBotMsg(ctx, text, { buttons: [yes, no] })
      ctx.awaitInput = {
        type: 'confirmation',
        variableId: node.data?.variable_destino,
        options: [yes, no],
        // Used by the engine to pick which branch to follow after the user replies
        yesValue: yes, noValue: no,
      }
    },
  },
]
