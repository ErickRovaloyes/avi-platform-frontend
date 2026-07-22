/**
 * AI category — all nodes hit one of the providers configured on the account
 * (OpenAI / DeepSeek / Anthropic). They reuse the unified aiClient.chat()
 * so the model can be anything the account has access to.
 */

import { chat, detectProvider, getApiKey } from '../../aiClient'
import { interpolate, sendBotMsg, logDebug, setVarBoth } from '../common'
import { api } from '../../api'
import { readConvos, recordTokenUsage, assistantGate, getRagContext, wooSearchProducts, wooCreateOrder, wooOrderStatus, updateConversationMemory, schedulingToolCall, paymentsCreateLink, paymentsStatus, pmsToolCall, ordersToolCall, catalogSearchProducts } from '../../storage'

// Tras cada respuesta del asistente, pide al servidor actualizar la memoria
// persistente del cliente (resumen + estado) en segundo plano. Nunca bloquea.
function scheduleMemory(ctx) {
  if (ctx?._sandbox || !ctx?.accId || !ctx?.convId) return
  try { updateConversationMemory(ctx.accId, ctx.agId, ctx.convId).catch(() => {}) } catch {}
}

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
  const defs = []
  for (const tool of (toolList || [])) {
    if (tool.actionType === 'cms_resource') { const d = buildResourceToolDef(account); if (d) defs.push(d) }
    else if (tool.actionType === 'woocommerce') { if (account?.woocommerce?.connected) defs.push(...buildWooToolDefs(account)) }
    else if (tool.actionType === 'scheduling') { if (account?.scheduling?.connected) defs.push(...buildAgendaToolDefs(account)) }
    else if (tool.actionType === 'payment') { if (account?.payments?.connected) defs.push(...buildPaymentToolDefs()) }
    else if (tool.actionType === 'meta_catalog') { if (account?.metaCatalog?.connected) defs.push(...buildCatalogToolDefs()) }
    else if (tool.actionType === 'pms') { if (account?.pms?.connected) defs.push(...buildPmsToolDefs(account)) }
    else if (tool.actionType === 'orders') { if (account?.orders?.connected) defs.push(...buildOrdersToolDefs(account)) }
    else { const d = buildOneToolDef(tool); if (d) defs.push(d) }
  }
  return defs
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

// ── Tienda WooCommerce (paridad con el backend; las llamadas van por el proxy) ──
const WOO_FUNCS = new Set(['buscar_productos', 'enviar_producto', 'crear_pedido', 'ver_pedido'])
// Catálogo de datos del pedido (debe coincidir con backend services/store.js).
const ORDER_FIELD_LABELS = {
  nombre: 'Nombre completo', email: 'Email', telefono: 'Teléfono', direccion: 'Dirección de envío',
  direccion2: 'Apartamento / referencia', ciudad: 'Ciudad', departamento: 'Departamento / Estado',
  codigo_postal: 'Código postal', pais: 'País (ISO 2 letras)', notas: 'Notas del pedido',
}
function buildWooToolDefs(account) {
  const fields = (account?.woocommerce?.orderForm || []).filter(f => ORDER_FIELD_LABELS[f.key])
  const pedidoProps = {
    producto: { type: 'string', description: 'Producto que quiere comprar' },
    cantidad: { type: 'string', description: 'Cantidad (por defecto 1)' },
  }
  for (const f of fields) pedidoProps[f.key] = { type: 'string', description: `${ORDER_FIELD_LABELS[f.key]} del cliente${f.required ? ' (OBLIGATORIO: pídeselo si no lo tienes)' : ' (si lo tienes)'}` }
  const req = fields.filter(f => f.required).map(f => ORDER_FIELD_LABELS[f.key])
  return [
    { type: 'function', function: { name: 'buscar_productos',
      description: 'Busca productos en la tienda para responder preguntas sobre disponibilidad, precios o características. Devuelve nombre, precio y descripción de los productos que coincidan.',
      parameters: { type: 'object', properties: { consulta: { type: 'string', description: 'Nombre, categoría o palabras clave del producto' } }, required: ['consulta'] } } },
    { type: 'function', function: { name: 'enviar_producto',
      description: 'Envía al usuario un producto con sus FOTOS y una ficha (nombre, precio, link). Úsalo cuando el usuario quiera VER un producto o pida su foto/presentación/catálogo.',
      parameters: { type: 'object', properties: { producto: { type: 'string', description: 'Nombre o palabras clave del producto a enviar' } }, required: ['producto'] } } },
    { type: 'function', function: { name: 'crear_pedido',
      description: 'Crea un pedido en la tienda y envía al usuario el LINK DE PAGO. Úsalo SOLO cuando el usuario confirme la compra.' + (req.length ? ` ANTES pídele estos datos si faltan: ${req.join(', ')}.` : '') + ' Tras el pago, se confirma automáticamente.',
      parameters: { type: 'object', properties: pedidoProps, required: ['producto'] } } },
    { type: 'function', function: { name: 'ver_pedido',
      description: 'Consulta el ESTADO actual de un pedido en la tienda (seguimiento). Úsalo cuando el cliente pregunte por su pedido/envío. Si no da el número, se usa el último de la conversación.',
      parameters: { type: 'object', properties: { numero_pedido: { type: 'string', description: 'Número/ID del pedido (opcional)' } } } } },
  ]
}
async function wooExec(ctx, fnName, args) {
  const maxImgs = Math.max(1, Math.min(10, parseInt(ctx.account?.woocommerce?.maxImagesPerProduct) || 4))
  try {
    if (fnName === 'buscar_productos') {
      const { products } = await wooSearchProducts(ctx.accId, args?.consulta || args?.query || '')
      if (!products?.length) return 'No encontré productos para esa búsqueda en la tienda.'
      return 'Productos encontrados:\n' + products.slice(0, 8).map((p, i) => {
        const d = (p.shortDescription || p.description || '').slice(0, 200)
        return `${i + 1}. ${p.name} — ${p.price} ${p.currency}${p.stockStatus === 'outofstock' ? ' (agotado)' : ''}${d ? `\n   ${d}` : ''}`
      }).join('\n')
    }
    if (fnName === 'enviar_producto') {
      const { products } = await wooSearchProducts(ctx.accId, args?.producto || args?.consulta || '')
      const p = products?.[0]
      if (!p) return 'No encontré ese producto para enviarlo.'
      const desc = p.shortDescription || p.description || ''
      const caption = `*${p.name}* — ${p.price} ${p.currency}${desc ? `\n${desc}` : ''}${p.permalink ? `\n${p.permalink}` : ''}`
      const imgs = (p.images || []).slice(0, maxImgs)
      if (!imgs.length) { await sendBotMsg(ctx, caption) }
      else { for (let i = 0; i < imgs.length; i++) await sendBotMsg(ctx, i === 0 ? caption : '', { media: { kind: 'image', url: imgs[i] }, mediaUrl: imgs[i] }) }
      return `Envié el producto "${p.name}" con ${imgs.length} foto(s) al usuario.`
    }
    if (fnName === 'crear_pedido') {
      const { products } = await wooSearchProducts(ctx.accId, args?.producto || '')
      const p = products?.[0]
      if (!p) return `No encontré el producto "${args?.producto || ''}" en la tienda. Pídele al cliente que confirme el nombre exacto.`
      const qty = Math.max(1, parseInt(args?.cantidad) || 1)
      const fields = (ctx.account?.woocommerce?.orderForm || []).filter(f => ORDER_FIELD_LABELS[f.key])
      const customer = {}
      for (const f of fields) { const v = String(args?.[f.key] ?? '').trim(); if (v) customer[f.key] = v }
      if (!customer.nombre) customer.nombre = ctx.variables?.user_name || ctx.variables?.var_nombre || ctx.variables?.nombre || ''
      if (!customer.email) customer.email = ctx.variables?.user_email || ctx.variables?.var_email || ctx.variables?.email || ''
      if (!customer.telefono) customer.telefono = ctx.variables?.telefono || ctx.variables?.var_telefono || ''
      const missing = fields.filter(f => f.required && !String(customer[f.key] || '').trim()).map(f => ORDER_FIELD_LABELS[f.key])
      if (missing.length) return `Antes de crear el pedido necesito estos datos del cliente para el envío/facturación: ${missing.join(', ')}. Pídeselos y vuelve a llamar crear_pedido con esos datos.`
      const order = await wooCreateOrder(ctx.accId, { items: [{ productId: p.id, variantId: p.variantId, quantity: qty }], customer, convId: ctx.convId, agId: ctx.agId })
      await sendBotMsg(ctx, `🛒 Pedido creado: ${qty} × ${p.name}\nTotal: ${order.total} ${order.currency}\n\n💳 Paga aquí:\n${order.payUrl}\n\nApenas completes el pago te confirmo automáticamente.`)
      return `Pedido #${order.orderId} creado por ${order.total} ${order.currency}. Ya envié el link de pago al usuario.`
    }
    if (fnName === 'ver_pedido') {
      const r = await wooOrderStatus(ctx.accId, { numero_pedido: args?.numero_pedido || '', convId: ctx.convId })
      if (r?.needNumber) return 'Pídele al cliente el número de su pedido para consultarlo.'
      if (!r?.found) return `No encontré ese pedido en la tienda. Verifica el número con el cliente.`
      return `Pedido #${r.id}: estado "${r.statusEs || r.status}"${r.total ? ` · total ${r.total} ${r.currency}` : ''}. Infórmale al cliente en lenguaje natural.`
    }
  } catch (e) {
    if (fnName === 'crear_pedido') return `No se pudo crear el pedido. Motivo exacto de la tienda: "${e.message}". Dile al cliente ese motivo tal cual; si falta un dato (p. ej. su email), pídeselo y reintenta.`
    return `No se pudo completar la acción de la tienda: ${e.message}`
  }
  return 'Acción de tienda no reconocida.'
}

// ── Agenda de citas (proxy al backend; paridad con el motor del servidor) ──────
const AGENDA_FUNCS = new Set(['ver_disponibilidad', 'recomendar_citas', 'agendar_cita', 'mover_cita', 'cancelar_cita', 'confirmar_cita', 'ver_mis_citas'])
function buildAgendaToolDefs(account) {
  const cals = account?.scheduling?.calendars || []
  if (!cals.length) return []
  const menu = cals.map(c => `• ${c.name}${c.description ? ` — ${c.description}` : ''}`).join('\n')
  const multi = cals.length > 1
  const servicioDesc = multi
    ? `Calendario/servicio a usar. ELIGE según la DESCRIPCIÓN del que mejor encaje con lo que pide el cliente (pasa el nombre del calendario). Calendarios disponibles:\n${menu}`
    : `(opcional; solo hay un calendario: ${cals[0].name})`
  return [
    { type: 'function', function: { name: 'ver_disponibilidad', description: 'Muestra los horarios LIBRES de un calendario para una fecha. Úsalo cuando el cliente pregunte por disponibilidad de un día concreto. No inventes horarios.', parameters: { type: 'object', properties: { fecha: { type: 'string', description: 'Fecha TAL CUAL la dijo el cliente ("lunes", "el 15", "15 de julio", "mañana") o YYYY-MM-DD. NO calcules tú la fecha: pásala literal, el sistema la resuelve.' }, servicio: { type: 'string', description: servicioDesc } }, required: ['fecha'] } } },
    { type: 'function', function: { name: 'recomendar_citas', description: 'Recomienda las PRÓXIMAS citas disponibles (siguientes días con cupo). Úsalo cuando el cliente quiere agendar pero no fijó un día.', parameters: { type: 'object', properties: { servicio: { type: 'string', description: servicioDesc } } } } },
    { type: 'function', function: { name: 'agendar_cita', description: 'Agenda una cita. Úsalo SOLO cuando el cliente confirme fecha y hora (de las que diste por disponibilidad) y tengas su nombre.', parameters: { type: 'object', properties: { fecha: { type: 'string', description: 'Fecha tal cual la dijo el cliente ("lunes", "15 de julio") o YYYY-MM-DD; NO la calcules tú.' }, hora: { type: 'string', description: 'HH:MM' }, servicio: { type: 'string', description: servicioDesc }, nombre: { type: 'string', description: 'Nombre del cliente' }, telefono: { type: 'string' }, email: { type: 'string' }, nota: { type: 'string' } }, required: ['fecha', 'hora'] } } },
    { type: 'function', function: { name: 'mover_cita', description: 'Reagenda la cita del cliente a otra fecha/hora.', parameters: { type: 'object', properties: { nueva_fecha: { type: 'string', description: 'Fecha tal cual la dijo el cliente ("lunes", "15 de julio") o YYYY-MM-DD; NO la calcules tú.' }, nueva_hora: { type: 'string', description: 'HH:MM' }, telefono: { type: 'string' }, bookingId: { type: 'string', description: 'id de la cita si el cliente tiene varias' } }, required: ['nueva_fecha', 'nueva_hora'] } } },
    { type: 'function', function: { name: 'cancelar_cita', description: 'Cancela la cita del cliente.', parameters: { type: 'object', properties: { telefono: { type: 'string' }, bookingId: { type: 'string', description: 'id de la cita si tiene varias' } } } } },
    { type: 'function', function: { name: 'confirmar_cita', description: 'Marca como CONFIRMADA la asistencia del cliente a su próxima cita. Úsalo cuando el cliente confirme que sí asistirá (responde "sí", "confirmo", "ahí estaré", "asistiré", etc.), típicamente tras un recordatorio.', parameters: { type: 'object', properties: { telefono: { type: 'string' }, bookingId: { type: 'string', description: 'id de la cita si el cliente tiene varias' } } } } },
    { type: 'function', function: { name: 'ver_mis_citas', description: 'Muestra las citas del cliente: las ACTIVAS/próximas y las ANTERIORES (historial). Úsalo cuando el cliente pregunte "¿qué citas tengo?" o por su historial.', parameters: { type: 'object', properties: { telefono: { type: 'string', description: 'Teléfono del cliente (si no, se toma el de la conversación)' } } } } },
  ]
}
async function agendaExec(ctx, fnName, args) {
  try { const r = await schedulingToolCall(ctx.accId, fnName, args || {}, ctx.convId, ctx.agId); return r?.text || 'Hecho.' }
  catch (e) { return `No se pudo completar la acción de agenda: ${e.message}` }
}

// ── PMS hotelero (HosRoom/Kunas): proxy al backend; paridad con el motor ───────
const PMS_FUNCS = new Set(['ver_propiedades', 'ver_habitaciones', 'ver_disponibilidad_hotel', 'reservar_habitacion', 'reagendar_reserva', 'cancelar_reserva', 'ver_reserva'])
function buildPmsToolDefs(account) {
  const hotel = account?.pms?.hotelName ? ` del hotel "${account.pms.hotelName}"` : ''
  const multi = !!account?.pms?.multiProperty
  const propNames = (account?.pms?.properties || []).map(p => p.name).join(', ')
  const propParam = multi ? { propiedad: { type: 'string', description: `Propiedad/hotel en el que operar (OBLIGATORIO, hay varias: ${propNames}). Usa ver_propiedades y pregunta al cliente si no la sabes.` } } : {}
  const defs = []
  if (multi) defs.push(
    { type: 'function', function: { name: 'ver_propiedades',
      description: `Lista las propiedades/hoteles disponibles (${propNames}). Úsalo cuando el cliente pregunte qué propiedades/hoteles hay o antes de mostrar habitaciones/disponibilidad, para saber en cuál operar.`,
      parameters: { type: 'object', properties: {} } } },
  )
  defs.push(
    { type: 'function', function: { name: 'ver_habitaciones',
      description: `Muestra las habitaciones${hotel} con sus FOTOS reales, capacidad y planes. Úsalo cuando el cliente pregunte por las habitaciones o pida fotos. Cada vez que lo llames envía fotos NUEVAS (distintas a las ya enviadas); si el cliente pide "más fotos", vuelve a llamarlo. Cuando ya no queden más, la herramienta lo indica y puedes reenviarlas desde el principio con desde_inicio=true.`,
      parameters: { type: 'object', properties: {
        habitacion: { type: 'string', description: 'Nombre de una habitación concreta para enviar sus fotos y ficha (vacío = panorama de la propiedad)' },
        desde_inicio: { type: 'boolean', description: 'true para reenviar las fotos desde el principio (cuando el cliente ya vio todas y quiere verlas otra vez)' },
        ...propParam,
      } } } },
    { type: 'function', function: { name: 'ver_disponibilidad_hotel',
      description: 'Consulta la disponibilidad REAL del hotel para un rango de fechas con precios y cotización total. Úsalo antes de reservar. NUNCA inventes precios ni disponibilidad. Cada alojamiento tiene su propio cupo: si el cliente pregunta por un alojamiento concreto, pásalo en "habitacion" para responder SOLO por ese; si está lleno, se informa que no está disponible (NO ofrezcas otro como si fuera ese).',
      parameters: { type: 'object', properties: {
        checkin: { type: 'string', description: 'Fecha de entrada YYYY-MM-DD' },
        checkout: { type: 'string', description: 'Fecha de salida YYYY-MM-DD' },
        adultos: { type: 'number', description: 'Número de adultos (mínimo 1)' },
        ninos: { type: 'number', description: 'Número de niños (opcional)' },
        infantes: { type: 'number', description: 'Número de infantes (opcional)' },
        habitaciones: { type: 'number', description: 'Número de habitaciones (opcional)' },
        habitacion: { type: 'string', description: 'Nombre del alojamiento/habitación concreto por el que pregunta el cliente. Si se indica, la disponibilidad se limita a ESE alojamiento (opcional).' },
        codigo_promocional: { type: 'string', description: 'Código promocional si el cliente tiene uno (opcional)' },
        ...propParam,
      }, required: ['checkin', 'checkout', 'adultos'] } } },
    { type: 'function', function: { name: 'reservar_habitacion',
      description: 'Crea la RESERVA en el PMS del hotel. Úsalo SOLO cuando el cliente confirme fechas y opción, y tengas su nombre, email y teléfono. ANTES de reservar, PREGÚNTALE cómo desea pagar: "online" (link de pago) o "efectivo" (al llegar al hotel), y pásalo en "metodo_pago". Devuelve el código y, si es en línea, el link de pago.',
      parameters: { type: 'object', properties: {
        checkin: { type: 'string', description: 'YYYY-MM-DD' },
        checkout: { type: 'string', description: 'YYYY-MM-DD' },
        adultos: { type: 'number' },
        ninos: { type: 'number' },
        opcion: { type: 'number', description: 'Número de opción de la última consulta de disponibilidad' },
        plan: { type: 'string', description: 'Nombre de la habitación/plan elegido (si no usas "opcion")' },
        nombre: { type: 'string', description: 'Nombre completo del huésped' },
        email: { type: 'string', description: 'Email del huésped (obligatorio para la reserva)' },
        telefono: { type: 'string', description: 'Teléfono del huésped (si no, se toma el de la conversación)' },
        metodo_pago: { type: 'string', description: 'Cómo paga el cliente: "online" (pago en línea con link) o "efectivo" (paga al llegar al hotel). Pregúntaselo antes de reservar.' },
        nota: { type: 'string', description: 'Petición especial del huésped (opcional)' },
        codigo_promocional: { type: 'string' },
        ...propParam,
      }, required: ['checkin', 'checkout', 'adultos'] } } },
    { type: 'function', function: { name: 'ver_reserva',
      description: 'Consulta el estado y detalle de una reserva por su código (ej. HR-123456789). Úsalo para seguimiento cuando el cliente pregunte por su reserva.',
      parameters: { type: 'object', properties: {
        codigo: { type: 'string', description: 'Código de la reserva' },
      }, required: ['codigo'] } } },
    { type: 'function', function: { name: 'reagendar_reserva',
      description: 'Registra una SOLICITUD de cambio de fechas de una reserva (el hotel la procesa MANUALMENTE; el PMS no reagenda por API). Pide el código y las nuevas fechas. NO le digas al cliente que ya quedó reagendada: es una solicitud pendiente de confirmación del hotel.',
      parameters: { type: 'object', properties: {
        codigo: { type: 'string', description: 'Código de la reserva (HR-…)' },
        nueva_checkin: { type: 'string', description: 'Nueva fecha de entrada YYYY-MM-DD' },
        nueva_checkout: { type: 'string', description: 'Nueva fecha de salida YYYY-MM-DD' },
        motivo: { type: 'string' },
      }, required: ['codigo', 'nueva_checkin', 'nueva_checkout'] } } },
    { type: 'function', function: { name: 'cancelar_reserva',
      description: 'Registra una SOLICITUD de cancelación de una reserva (el hotel la procesa MANUALMENTE; el PMS no cancela por API). Pide el código. NO le digas al cliente que ya quedó cancelada: es una solicitud pendiente de confirmación del hotel.',
      parameters: { type: 'object', properties: {
        codigo: { type: 'string', description: 'Código de la reserva (HR-…)' },
        motivo: { type: 'string' },
      }, required: ['codigo'] } } },
  )
  return defs
}
async function pmsExec(ctx, fnName, args) {
  try {
    const r = await pmsToolCall(ctx.accId, fnName, args || {}, ctx.convId, ctx.agId)
    for (const m of (r?.media || [])) {
      await sendBotMsg(ctx, m.caption || '', { media: { kind: 'image', url: m.url }, mediaUrl: m.url })
    }
    return r?.text || 'Hecho.'
  } catch (e) { return `No se pudo completar la acción del PMS: ${e.message}` }
}

// ── Pedidos y domicilios (proxy al backend; paridad con el motor del servidor) ──
const ORDERS_FUNCS = new Set(['ver_menu', 'agregar_al_pedido', 'ver_carrito', 'ver_pedido', 'quitar_del_pedido', 'fijar_datos_entrega', 'aplicar_cupon', 'confirmar_pedido', 'estado_pedido'])
function buildOrdersToolDefs(account) {
  const o = account?.orders || {}
  const biz = o.businessName ? ` de "${o.businessName}"` : ''
  const typeLabel = { delivery: 'domicilio', pickup: 'para recoger', dinein: 'en el local', scheduled: 'programado' }
  const types = (Array.isArray(o.orderTypes) && o.orderTypes.length ? o.orderTypes : ['delivery', 'pickup']).map(t => typeLabel[t] || t).join(', ')
  const methods = (Array.isArray(o.paymentMethods) && o.paymentMethods.length ? o.paymentMethods : ['online', 'cash']).map(m => m === 'online' ? 'pago en línea' : 'contra entrega').join(' y ')
  return [
    { type: 'function', function: { name: 'ver_menu',
      description: `Muestra el menú/catálogo${biz} con precios (y fotos si el cliente pide una categoría). Úsalo cuando pregunten qué hay, el menú, la carta o los precios. NUNCA inventes productos ni precios.`,
      parameters: { type: 'object', properties: {
        categoria: { type: 'string', description: 'Categoría concreta para filtrar y enviar fotos (vacío = panorama de todo el menú)' },
      } } } },
    { type: 'function', function: { name: 'agregar_al_pedido',
      description: 'Agrega un producto al pedido (carrito) del cliente. Úsalo cada vez que el cliente pida algo. Puedes incluir adiciones/modificadores y una nota.',
      parameters: { type: 'object', properties: {
        producto: { type: 'string', description: 'Nombre del producto tal como aparece en el menú' },
        cantidad: { type: 'number', description: 'Cantidad (mínimo 1)' },
        adiciones: { type: 'string', description: 'Adiciones/modificadores separados por coma (ej. "extra queso, sin cebolla")' },
        nota: { type: 'string', description: 'Nota para la cocina sobre este producto (opcional)' },
      }, required: ['producto'] } } },
    { type: 'function', function: { name: 'ver_carrito',
      description: 'Muestra el resumen del pedido actual con los productos y el total. Úsalo cuando el cliente quiera revisar su pedido antes de confirmar.',
      parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'quitar_del_pedido',
      description: 'Quita un producto del pedido. Indica el número de línea (de ver_carrito) o el nombre del producto.',
      parameters: { type: 'object', properties: {
        indice: { type: 'number', description: 'Número de la línea a quitar (según ver_carrito)' },
        producto: { type: 'string', description: 'Nombre del producto a quitar (si no usas el número)' },
      } } } },
    { type: 'function', function: { name: 'fijar_datos_entrega',
      description: `Fija el tipo de entrega (disponibles: ${types}) y los datos. Para domicilio pide dirección y zona (calcula el envío). Úsalo antes de confirmar.`,
      parameters: { type: 'object', properties: {
        tipo: { type: 'string', description: 'domicilio | recoger | local | programado' },
        direccion: { type: 'string', description: 'Dirección de entrega (para domicilio)' },
        referencias: { type: 'string', description: 'Referencias o indicaciones para llegar (opcional)' },
        zona: { type: 'string', description: 'Zona/barrio de entrega para calcular el costo de envío' },
        mesa: { type: 'string', description: 'Número/identificador de mesa (para consumo en el local)' },
        para: { type: 'string', description: 'Fecha/hora para pedido programado' },
      } } } },
    { type: 'function', function: { name: 'aplicar_cupon',
      description: 'Aplica un cupón de descuento al pedido actual. Úsalo cuando el cliente dé un código de cupón. Valida el cupón y descuenta del subtotal.',
      parameters: { type: 'object', properties: {
        codigo: { type: 'string', description: 'Código del cupón que dio el cliente' },
      }, required: ['codigo'] } } },
    { type: 'function', function: { name: 'confirmar_pedido',
      description: `Cierra y CONFIRMA el pedido. Úsalo SOLO cuando el pedido tenga productos y, si es domicilio, dirección y zona. Métodos de pago: ${methods}. Devuelve el código del pedido y, si es en línea, el link de pago.`,
      parameters: { type: 'object', properties: {
        nombre: { type: 'string', description: 'Nombre del cliente (si no, se toma el de la conversación)' },
        telefono: { type: 'string', description: 'Teléfono del cliente (si no, se toma el de la conversación)' },
        metodo_pago: { type: 'string', description: 'en línea | contra entrega (efectivo)' },
        paga_con: { type: 'string', description: 'Con cuánto paga en efectivo, para calcular el vuelto (solo contra entrega)' },
        propina: { type: 'number', description: 'Propina en dinero (opcional)' },
        cupon: { type: 'string', description: 'Código de cupón a aplicar (opcional si ya se aplicó con aplicar_cupon)' },
        nota: { type: 'string', description: 'Nota general del pedido (opcional)' },
      } } } },
    { type: 'function', function: { name: 'estado_pedido',
      description: 'Consulta el estado de un pedido por su código (ej. P-AB12C). Úsalo para seguimiento cuando el cliente pregunte por su pedido.',
      parameters: { type: 'object', properties: {
        codigo: { type: 'string', description: 'Código del pedido' },
      }, required: ['codigo'] } } },
  ]
}
async function ordersExec(ctx, fnName, args) {
  try {
    const r = await ordersToolCall(ctx.accId, fnName, args || {}, ctx.convId, ctx.agId)
    for (const m of (r?.media || [])) {
      const url = m.needsHost ? `${cmsBaseUrl()}${m.url}` : m.url
      await sendBotMsg(ctx, m.caption || '', { media: { kind: 'image', url }, mediaUrl: url })
    }
    return r?.text || 'Hecho.'
  } catch (e) { return `No se pudo completar la acción de pedidos: ${e.message}` }
}

// ── Pasarela de pago (proxy al backend; paridad con el motor del servidor) ─────
const PAYMENT_FUNCS = new Set(['generar_link_pago', 'verificar_pago'])
function buildPaymentToolDefs() {
  return [
    { type: 'function', function: { name: 'generar_link_pago',
      description: 'Genera un LINK DE PAGO y se lo envía al usuario. Úsalo cuando el usuario quiera pagar y tengas claro el monto. Cuando complete el pago se detecta automáticamente.',
      parameters: { type: 'object', properties: {
        monto: { type: 'string', description: 'Monto a cobrar en la unidad mayor de la moneda (p. ej. 50000 para 50.000 COP)' },
        concepto: { type: 'string', description: 'Concepto/descripción breve del pago' },
      }, required: ['monto'] } } },
    { type: 'function', function: { name: 'verificar_pago',
      description: 'Verifica si el último pago de esta conversación ya se realizó. Úsalo cuando el usuario diga que ya pagó o preguntes por el estado.',
      parameters: { type: 'object', properties: {} } } },
  ]
}
async function paymentExec(ctx, fnName, args) {
  try {
    if (fnName === 'generar_link_pago') {
      const amount = parseFloat(String(args?.monto || '').replace(/[^\d.]/g, ''))
      if (!amount || amount <= 0) return 'Indica un monto válido para generar el link de pago.'
      const r = await paymentsCreateLink(ctx.accId, { amount, description: args?.concepto || 'Pago', convId: ctx.convId, agId: ctx.agId })
      await sendBotMsg(ctx, `💳 Aquí está tu link de pago por ${r.amount} ${r.currency}:\n${r.url}\n\nApenas completes el pago te confirmo automáticamente.`)
      return `Link de pago generado por ${r.amount} ${r.currency} y enviado al usuario.`
    }
    if (fnName === 'verificar_pago') {
      const st = await paymentsStatus(ctx.accId, ctx.convId)
      if (!st?.found) return 'No hay ningún pago pendiente en esta conversación.'
      if (st.status === 'approved') return `El pago de ${st.amount} ${st.currency} está CONFIRMADO.`
      if (st.status === 'declined') return `El pago de ${st.amount} ${st.currency} fue RECHAZADO o no se completó.`
      return `El pago de ${st.amount} ${st.currency} aún está PENDIENTE (sin confirmar todavía).`
    }
  } catch (e) { return `No se pudo completar la acción de pago: ${e.message}` }
  return 'Acción de pago no reconocida.'
}

// ── Catálogo de Meta (proxy al backend; paridad con el motor del servidor) ─────
const CATALOG_FUNCS = new Set(['buscar_en_catalogo', 'enviar_producto_catalogo', 'enviar_catalogo', 'crear_pedido_catalogo'])
function buildCatalogToolDefs() {
  return [
    { type: 'function', function: { name: 'buscar_en_catalogo',
      description: 'Busca productos en el catálogo conectado para responder sobre disponibilidad, precios o características. Devuelve nombre, precio y descripción.',
      parameters: { type: 'object', properties: { consulta: { type: 'string', description: 'Nombre, categoría o palabras clave del producto' } }, required: ['consulta'] } } },
    { type: 'function', function: { name: 'enviar_producto_catalogo',
      description: 'Envía al usuario un producto del catálogo con su FOTO y ficha. Úsalo cuando quiera VER un producto o pida su foto.',
      parameters: { type: 'object', properties: { producto: { type: 'string', description: 'Nombre o palabras clave del producto a enviar' } }, required: ['producto'] } } },
    { type: 'function', function: { name: 'enviar_catalogo',
      description: 'Envía el catálogo completo (lista de productos con precios). Úsalo cuando pida ver todo el catálogo.',
      parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'crear_pedido_catalogo',
      description: 'Genera un pedido de un producto del catálogo. Si hay pasarela de pago conectada envía el link; si no, registra el pedido. Úsalo SOLO cuando confirme la compra.',
      parameters: { type: 'object', properties: { producto: { type: 'string', description: 'Producto que quiere comprar' }, cantidad: { type: 'string', description: 'Cantidad (por defecto 1)' } }, required: ['producto'] } } },
  ]
}
async function catalogExec(ctx, fnName, args) {
  try {
    if (fnName === 'buscar_en_catalogo') {
      const { products } = await catalogSearchProducts(ctx.accId, args?.consulta || args?.query || '')
      if (!products?.length) return 'No encontré productos para esa búsqueda en el catálogo.'
      return 'Productos encontrados:\n' + products.slice(0, 8).map((p, i) => {
        const d = (p.description || '').slice(0, 160)
        const out = p.availability && !/in stock|available/i.test(p.availability) ? ' (no disponible)' : ''
        return `${i + 1}. ${p.name} — ${p.price || ''}${out}${d ? `\n   ${d}` : ''}`
      }).join('\n')
    }
    if (fnName === 'enviar_producto_catalogo') {
      const { products } = await catalogSearchProducts(ctx.accId, args?.producto || args?.consulta || '')
      const p = products?.[0]
      if (!p) return 'No encontré ese producto en el catálogo para enviarlo.'
      const desc = (p.description || '').slice(0, 300)
      const caption = `*${p.name}* — ${p.price || ''}${desc ? `\n${desc}` : ''}${p.url ? `\n${p.url}` : ''}`
      if (p.image_url) await sendBotMsg(ctx, caption, { media: { kind: 'image', url: p.image_url }, mediaUrl: p.image_url })
      else await sendBotMsg(ctx, caption)
      return `Envié el producto "${p.name}" al usuario.`
    }
    if (fnName === 'enviar_catalogo') {
      const { products } = await catalogSearchProducts(ctx.accId, '')
      if (!products?.length) return 'El catálogo no tiene productos.'
      const shown = products.slice(0, 40)
      const lines = shown.map(p => `• ${p.name} — ${p.price || ''}`).join('\n')
      await sendBotMsg(ctx, `🛍 *Catálogo* (${products.length} producto/s):\n${lines}${products.length > shown.length ? '\n… y más. Pídeme uno para verlo en detalle.' : ''}`)
      return `Envié el catálogo (${shown.length} de ${products.length} productos) al usuario.`
    }
    if (fnName === 'crear_pedido_catalogo') {
      const { products } = await catalogSearchProducts(ctx.accId, args?.producto || '')
      const p = products?.[0]
      if (!p) return 'No encontré ese producto en el catálogo para crear el pedido.'
      const qty = Math.max(1, parseInt(args?.cantidad) || 1)
      const unit = parseFloat(String(p.price || '').replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) || 0
      const total = unit * qty
      if (ctx.account?.payments?.connected && total > 0) {
        const r = await paymentsCreateLink(ctx.accId, { amount: total, description: `${qty} × ${p.name}`, convId: ctx.convId, agId: ctx.agId })
        await sendBotMsg(ctx, `🛒 Pedido: ${qty} × ${p.name}\nTotal: ${r.amount} ${r.currency}\n\n💳 Paga aquí:\n${r.url}\n\nApenas completes el pago te confirmo automáticamente.`)
        return `Pedido creado por ${r.amount} ${r.currency} y envié el link de pago al usuario.`
      }
      await sendBotMsg(ctx, `🛒 Pedido registrado:\n${qty} × ${p.name}${total ? `\nTotal estimado: ${total} ${p.currency || ''}` : ''}\n\nUn asesor confirmará tu pedido en breve.`)
      return `Pedido de ${qty} × ${p.name} registrado (sin pasarela; lo confirmará un asesor).`
    }
  } catch (e) { return `No se pudo completar la acción del catálogo: ${e.message}` }
  return 'Acción de catálogo no reconocida.'
}

// Executes a tool the model decided to call: persists collected fields into vars
// and, depending on actionType, runs a flow. The returned string is fed back to
// the model so it can keep the conversation going.
async function execToolCall(ctx, toolList, toolName, toolArgs) {
  const normalized = toolName.replace(/\s+/g, '_').toLowerCase()
  // Tienda WooCommerce: funciones de la herramienta especial (proxy al backend).
  if (WOO_FUNCS.has(normalized) && (toolList || []).some(t => t.actionType === 'woocommerce')) {
    if (ctx?._sandbox) return 'OK (sandbox: tienda no ejecutada)'
    return wooExec(ctx, normalized, toolArgs)
  }
  // Agenda de citas.
  if (AGENDA_FUNCS.has(normalized) && (toolList || []).some(t => t.actionType === 'scheduling')) {
    if (ctx?._sandbox) return 'OK (sandbox: agenda no ejecutada)'
    return agendaExec(ctx, normalized, toolArgs)
  }
  // Pasarela de pago.
  if (PAYMENT_FUNCS.has(normalized) && (toolList || []).some(t => t.actionType === 'payment')) {
    if (ctx?._sandbox) return 'OK (sandbox: pago no ejecutado)'
    return paymentExec(ctx, normalized, toolArgs)
  }
  // Catálogo de Meta.
  if (CATALOG_FUNCS.has(normalized) && (toolList || []).some(t => t.actionType === 'meta_catalog')) {
    if (ctx?._sandbox) return 'OK (sandbox: catálogo no ejecutado)'
    return catalogExec(ctx, normalized, toolArgs)
  }
  // PMS hotelero (HosRoom/Kunas).
  if (PMS_FUNCS.has(normalized) && (toolList || []).some(t => t.actionType === 'pms')) {
    if (ctx?._sandbox) return 'OK (sandbox: PMS no ejecutado)'
    return pmsExec(ctx, normalized, toolArgs)
  }
  // Pedidos y domicilios.
  if (ORDERS_FUNCS.has(normalized) && (toolList || []).some(t => t.actionType === 'orders')) {
    if (ctx?._sandbox) return 'OK (sandbox: pedido no ejecutado)'
    return ordersExec(ctx, normalized, toolArgs)
  }
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

  // En sandbox no disparamos efectos externos (flujos)
  if (ctx?._sandbox) return results.length ? results.join(', ') : 'OK (sandbox)'

  // 2) Acción según el tipo
  if (tool.actionType === 'cms_resource') {
    return sendCmsResource(ctx, toolArgs)
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
// Red de seguridad: ejecuta "tool calls" que el modelo escriba como TEXTO
// (p. ej. "...quedó claro. transferiraasesor()") aunque no use function-calling.
const normToolName = s => String(s || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
function parseTextArgs(raw) {
  const s = String(raw || '').trim()
  if (!s) return {}
  try { if (s.startsWith('{')) return JSON.parse(s) } catch {}
  const obj = {}
  for (const part of s.split(',')) {
    const mm = part.match(/^\s*([\wÁÉÍÓÚÑáéíóúñ]+)\s*[:=]\s*([\s\S]*?)\s*$/)
    if (mm) obj[mm[1]] = mm[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return obj
}
function parseTextToolCalls(text, toolDefs) {
  const out = []
  if (!text || !Array.isArray(toolDefs) || !toolDefs.length) return out
  const byNorm = new Map()
  for (const t of toolDefs) { const n = t?.function?.name; if (n) byNorm.set(normToolName(n), n) }
  const re = /([A-Za-zÁÉÍÓÚÑÜ_][\wÁÉÍÓÚÑÜáéíóúñü]*)\s*\(([^)]*)\)/g
  let m
  while ((m = re.exec(text))) {
    const real = byNorm.get(normToolName(m[1]))
    if (real) out.push({ name: real, args: parseTextArgs(m[2]), match: m[0] })
  }
  return out
}

async function callAI(ctx, { systemPrompt, userPrompt, model, provider, maxTokens = 800, temperature = 0.5, jsonMode = false, history = [], tools = [], onToolCall, onTools, onResolved }) {
  // Fallback CENTRAL al modelo/proveedor por defecto de la PLATAFORMA (lo gobierna el
  // super admin) cuando el nodo no fija uno — así ningún nodo IA usa 'gpt-4o-mini' por sorpresa.
  const platModel = ctx?.account?.defaultPromptModel || ''
  const platProvider = ctx?.account?.defaultPromptProvider || ''
  const effModel = model || platModel
  const prov = provider || platProvider || detectProvider(effModel || 'gpt-4o-mini')
  const finalModel = effModel || DEFAULT_MODEL[prov] || 'gpt-4o-mini'
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

  let effSystem = systemPrompt

  // ── Conciencia temporal (mismo criterio que el motor backend): la fecha y hora
  // ACTUALES se anteponen a TODA respuesta conversacional (no en jsonMode). Sin esto,
  // el asistente del webchat no sabía qué día es hoy y proponía fechas pasadas.
  if (!jsonMode && ctx.account?.aiDatetimeEnabled !== false) {
    const tz = ctx.account?.aiTimezone || ctx.account?.scheduling?.timezone || 'America/Lima'
    const now = new Date()
    let localStr = '', utcStr = ''
    try { localStr = now.toLocaleString('es', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { localStr = now.toISOString() }
    try { utcStr = now.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' } catch { utcStr = '' }
    const temporalBlock = `🕐 FECHA Y HORA ACTUALES (dato en tiempo real que SÍ conoces):\n` +
      `• Ahora mismo es: ${localStr} (zona horaria ${tz}).\n` +
      `• Referencia UTC: ${utcStr}.\n` +
      `INSTRUCCIÓN OBLIGATORIA: SÍ tienes acceso a la fecha y la hora actuales (son las de arriba). ` +
      `Si te preguntan qué día es, la fecha o la hora —aquí o en cualquier ciudad/país del mundo— respóndela usando estos datos ` +
      `(calcula la diferencia horaria cuando pregunten por otra zona). ` +
      `NUNCA digas que no tienes acceso a la fecha o la hora, ni que no puedes saber la hora actual: SÍ la sabes.`
    effSystem = `${temporalBlock}\n\n---\n\n${effSystem || ''}`
    try { logDebug(ctx, 'flow_run', '🕐 Contexto temporal inyectado en el prompt', { timezone: tz, now: localStr }) } catch {}
  }

  // Refuerzo: con herramientas, obligar al modelo a invocarlas de verdad y no
  // fingir en texto que ejecutó la acción (mismo criterio que el motor backend).
  // IMPORTANTE: parte de `effSystem` (que ya lleva la fecha/hora), no de systemPrompt.
  if (tools.length > 0) {
    const toolNames = tools.map(t => t.function?.name).filter(Boolean).join(', ')
    effSystem = `${effSystem || ''}\n\n` +
      `── USO OBLIGATORIO DE HERRAMIENTAS ──\n` +
      `Tienes funciones/herramientas disponibles${toolNames ? ` (${toolNames})` : ''}. ` +
      `Cuando el usuario pida (o haga falta) una acción que una de estas herramientas realiza ` +
      `—enviar un archivo o recurso, guardar/registrar datos, crear/agendar/cancelar algo, disparar un flujo o proceso— ` +
      `DEBES ejecutarla llamando a la función mediante el mecanismo de tool-calling, NO escribiendo la acción en texto.\n` +
      `NUNCA escribas el nombre de la función dentro de tu respuesta (por ejemplo "transferir_a_asesor()" o "enviar_recurso(...)"): ` +
      `eso NO ejecuta nada y se ve como un error. Para ejecutar una herramienta, invócala por el canal de funciones, no como texto.\n` +
      `PROHIBIDO afirmar que ya hiciste algo ("ya lo envié", "lo guardé", "creé el ticket", "ejecuté el proceso", "listo, agendado") ` +
      `si en ESTE turno no invocaste realmente la función correspondiente. ` +
      `Si te falta algún dato para invocarla, pídeselo al usuario; nunca simules que la ejecutaste.`
  }

  const messages = []
  if (effSystem) messages.push({ role: 'system', content: effSystem })
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
    const MAX_ROUNDS = 6

    // Ejecuta herramientas escritas como texto y devuelve el texto ya limpio.
    const runTextCalls = async (text) => {
      const found = parseTextToolCalls(text, tools)
      if (!found.length) return text
      let cleaned = text
      for (const c of found) {
        logDebug(ctx, 'tool_call', `🔧 Herramienta (texto): ${c.name}`, c.args)
        const r = onToolCall ? await onToolCall(c.name, c.args) : 'OK'
        logDebug(ctx, 'tool_result', `✅ Resultado: ${c.name}`, r)
        executed.push(c.name)
        cleaned = cleaned.split(c.match).join('')
      }
      return cleaned.replace(/\n{3,}/g, '\n\n').trim()
    }
    const finishText = async (text) => {
      let clean = await runTextCalls(text || '')
      // Si se ejecutaron herramientas pero el modelo NO redactó respuesta (caso
      // típico de DeepSeek: llama la función y devuelve vacío), forzamos una
      // redacción final SIN herramientas usando los resultados ya añadidos a la
      // conversación, para que SIEMPRE responda en base a la info obtenida.
      if (!clean && executed.length && canThread) {
        try {
          const synth = await chat({ provider: prov, model: finalModel, apiKey, messages: convo, maxTokens, temperature, onUsage })
          if (typeof synth === 'string' && synth.trim()) clean = synth.trim()
        } catch (e) { logDebug(ctx, 'error', `Síntesis post-herramienta falló: ${e.message}`, {}) }
      }
      if (typeof onTools === 'function') onTools({ invoked: executed.length > 0, names: executed })
      return clean
    }

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const result = await chat({ provider: prov, model: finalModel, apiKey, messages: convo, tools, maxTokens, temperature, onUsage })
      if (typeof result === 'string') {
        return await finishText(result)
      }
      const message = result?.message
      const toolCalls = message?.tool_calls || []
      if (!toolCalls.length) {
        return await finishText(typeof message?.content === 'string' ? message.content : '')
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
    // Se agotaron las rondas: redacta una respuesta final con los resultados.
    return await finishText('')
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
      { key: 'modelo',      label: 'Modelo',  type: 'text', default: '',
        hint: 'Vacío = usa el modelo por defecto de la plataforma (lo fija el super admin).',
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
      // Enforcement de suscripción (límites Demo/mensuales/suspensión). El motor
      // del navegador (webchat/test) consulta el gate al backend, igual que el
      // motor del servidor para WhatsApp. En sandbox no se aplica.
      if (!ctx?._sandbox && ctx?.accId && ctx?.convId) {
        try {
          const g = await assistantGate(ctx.accId, ctx.convId)
          if (g && g.allowed === false) {
            if (!ctx.variables?._limitNotified) {
              if (g.message) await sendBotMsg(ctx, g.message)
              await setVarBoth(ctx, '_limitNotified', '1')
            }
            logDebug(ctx, 'flow_run', '🚫 Límite de suscripción alcanzado', { message: g.message })
            ctx._suppressDefaultNext = true
            return
          }
        } catch { /* si el gate falla, no bloqueamos el flujo */ }
      }

      const mode = node.data?.promptMode || 'inline'
      // El modelo/proveedor lo gobierna el super admin (default de plataforma): fallback
      // cuando el nodo (inline) o el prompt no fijan uno, y reemplazo del legacy 'gpt-4o-mini'.
      const platModel = ctx.account?.defaultPromptModel || ''
      const platProvider = ctx.account?.defaultPromptProvider || ''
      let systemPrompt = ''
      let model = node.data?.modelo || platModel || 'gpt-4o-mini'
      if (model === 'gpt-4o-mini' && platModel && platModel !== 'gpt-4o-mini') model = platModel
      let provider = (model === platModel && platProvider) ? platProvider : undefined  // inline → derivado; prompt → del prompt
      let temperature = Number(node.data?.temperatura ?? 0.5)
      let promptLabel = 'inline'
      let assignedTools = []                          // herramientas IA asignadas al prompt elegido
      let ragFileIds = null                           // archivos de conocimiento asignados al prompt

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
        provider = chosen.provider || platProvider || undefined   // p.ej. 'deepseek' / 'anthropic' / 'openai'
        model    = chosen.model || platModel || undefined          // si falta, usa el default de plataforma
        const t = chosen.advanced?.temperature ?? chosen.temperature
        if (t != null) temperature = Number(t)
        promptLabel = chosen.name || '(sin nombre)'
        // Herramientas IA asignadas a ESTE prompt (no al agente)
        const toolIds = chosen.toolIds || []
        assignedTools = (ctx.account?.aiTools || []).filter(t => toolIds.includes(t.id))
        if (Array.isArray(chosen.ragFileIds)) ragFileIds = chosen.ragFileIds
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

      // Auto-RAG: si el agente tiene base de conocimiento activa, inyecta el contexto
      // relevante. La RECUPERACIÓN ocurre EN EL SERVIDOR (devuelve solo el top-K), así
      // el navegador NO descarga todos los chunks/embeddings en cada mensaje (eso
      // saturaba la plataforma). Funciona con cualquier proveedor de chat.
      // Conocimiento (RAG): usa SOLO los archivos asignados al prompt (como las
      // Herramientas IA). Compat: prompts sin asignación + RAG global activo → todos.
      let sysWithRag = sys
      try {
        const ag = ctx.account?.agents?.find(a => a.id === ctx.agId)
        const allFiles = (ag?.rag?.files || []).map(f => f.id)
        let useFileIds = null
        if (Array.isArray(ragFileIds)) useFileIds = ragFileIds.filter(id => allFiles.includes(id))
        else if (ag?.rag?.enabled && allFiles.length) useFileIds = allFiles
        if (!ctx?._sandbox && useFileIds && useFileIds.length) {
          const ragQuery = String(ctx.variables?._lastUserMessage || ctx.variables?.message || userMsg || '').slice(0, 1000)
          const ragBlock = await getRagContext(ctx.accId, ctx.agId, ragQuery, useFileIds)
          if (ragBlock) { sysWithRag = `${sys}\n${ragBlock}`; logDebug(ctx, 'flow_run', '📚 Conocimiento (RAG) inyectado en el prompt', { files: useFileIds.length }) }
        }
      } catch (e) { logDebug(ctx, 'error', `RAG no disponible: ${e.message}`, {}) }

      // Memoria PERMANENTE del cliente (resumen + estado, también de conversaciones
      // pasadas). Se inyecta además de los últimos 16 mensajes.
      const _mem = ctx.variables?._summary
      if (_mem && String(_mem).trim()) {
        sysWithRag = `${sysWithRag}\n\n---\n[MEMORIA DEL CLIENTE — resumen permanente de lo hablado y datos importantes; úsala para personalizar y no volver a preguntar lo que ya sabes]\n${String(_mem).trim()}\n---`
      }

      // Conciencia temporal para la agenda.
      const _sch = ctx.account?.scheduling
      if (_sch?.connected) {
        let hoy = ''
        try { hoy = new Date().toLocaleDateString('es-CO', { timeZone: _sch.timezone || 'America/Lima', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) } catch { hoy = new Date().toISOString().slice(0, 10) }
        sysWithRag = `${sysWithRag}\n\n📅 HOY es ${hoy} (zona horaria ${_sch.timezone || 'America/Lima'}). Para citas usa SIEMPRE la herramienta de agenda (ver_disponibilidad / recomendar_citas / agendar_cita / mover_cita / cancelar_cita / confirmar_cita); NO inventes horarios ni confirmes citas sin la herramienta. Si el cliente confirma su asistencia (p. ej. tras un recordatorio: "sí", "confirmo", "ahí estaré"), llama a confirmar_cita.`
      }

      // Historial real de la conversación → el agente tiene memoria de los turnos previos
      const history = await loadHistory(ctx)

      // Herramientas IA del prompt → function-calling
      const toolDefs = buildToolDefs(assignedTools, ctx.account)

      let resolved = null
      let toolsInvoked = false
      const sentBefore = ctx._sentCount || 0   // para detectar si una herramienta ya envió su mensaje
      const reply = await callAI(ctx, {
        systemPrompt: sysWithRag,
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
        // Tras usar una herramienta, el flujo de entrada SIEMPRE se detiene aquí.
        // Si la herramienta ya envió su propio mensaje (recurso, catálogo, link de
        // pago, pedido…), NO se envía además la respuesta del modelo para no
        // duplicar. Solo se entrega la respuesta cuando la herramienta no comunicó
        // nada (p. ej. la agenda, que devuelve texto para que el modelo redacte).
        const toolSentMsg = (ctx._sentCount || 0) > sentBefore
        logDebug(ctx, 'flow_run', '🔧 Herramienta IA activada' + (toolSentMsg ? ' (mensaje enviado por la herramienta)' : reply ? ' (+ respuesta final)' : ''), {})
        if (node.data?.variable_destino) await setVarBoth(ctx, node.data.variable_destino, reply || '')
        if (reply && !toolSentMsg) await sendBotMsg(ctx, reply)
        scheduleMemory(ctx)
        ctx._suppressDefaultNext = true
        return
      }

      if (node.data?.variable_destino) await setVarBoth(ctx, node.data.variable_destino, reply)
      if (node.data?.sendToUser !== false && reply) await sendBotMsg(ctx, reply)
      scheduleMemory(ctx)
      // El nodo Agente IA es TERMINAL para el flujo de entrada: tras responder, el
      // flujo se corta aquí. Excepción: sendToUser:false (alimenta a un nodo
      // posterior con su variable_destino), en cuyo caso el flujo continúa.
      if (node.data?.sendToUser !== false) ctx._suppressDefaultNext = true
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
