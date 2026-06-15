/**
 * Integrations — HTTP, webhook, and stubs for SMTP / SQL / Google Sheets / CRM / ERP.
 *
 * Notes:
 *   - "HTTP Request" is fully implemented (GET/POST/PUT/PATCH/DELETE)
 *   - "Webhook" is the alias for N8N integrations (dispatch through the server)
 *   - SMTP / SQL / Sheets are stubs that surface a clear "configurar integración" error
 */

import { interpolate, logDebug, safeJson, setVarBoth } from '../common'
import { dispatchN8N, googleSheetsOp } from '../../storage'

// Parse "valores" igual que el nodo server-side: JSON array o lista separada por comas.
function parseSheetValues(raw, vars) {
  const txt = interpolate(raw || '', vars)
  if (!txt.trim()) return []
  const trimmed = txt.trim()
  if (trimmed.startsWith('[')) { const a = safeJson(trimmed, null); if (Array.isArray(a)) return a.map(String) }
  return trimmed.split(',').map(s => s.trim())
}

// Path get supporting "a.b.c", "a[0].b" y "a.0.b"
function getJsonPath(obj, path) {
  if (obj == null || !path) return undefined
  // Normaliza brackets: a[0] → a.0
  const normalized = String(path).replace(/\[(\d+)\]/g, '.$1')
  return normalized.split('.').reduce((acc, key) => {
    if (acc == null) return undefined
    const k = key.trim()
    if (!k) return acc
    return acc[k]
  }, obj)
}

export const integrationNodes = [
  // ── 1) HTTP Request ─────────────────────────────────────────────────────
  {
    type: 'http_request',
    category: 'integrations',
    label: 'HTTP request',
    icon: '🌐', color: '#ff8c42',
    description: 'Llamada HTTP con cualquier método. Guarda la respuesta y extrae campos del JSON a variables.',
    timeoutMs: 30000,
    retry: { enabled: false, maxAttempts: 2 },
    fields: [
      { key: 'metodo',   label: 'Método', type: 'select', options: [
          { value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' }, { value: 'PATCH', label: 'PATCH' },
          { value: 'DELETE', label: 'DELETE' },
        ], default: 'GET' },
      { key: 'url',     label: 'URL', type: 'text', placeholder: 'https://api.ejemplo.com/items/{{id}}' },
      { key: 'headers', label: 'Headers (uno por línea)', type: 'textarea',
        placeholder: 'Authorization: Bearer xxx\nContent-Type: application/json' },
      { key: 'body',    label: 'Body JSON',  type: 'textarea', placeholder: '{"foo":"{{var}}"}' },
      { key: 'destino', label: 'Guardar respuesta completa en', type: 'variableRef' },
      { key: 'extract', label: 'Extraer del JSON a variables',
        type: 'jsonMappings',
        placeholder: 'Mapea rutas del JSON (ej. data.user.name) a tus variables.',
        hint: 'Soporta notación con puntos y corchetes: results[0].id, data.items.2.price' },
    ],
    async exec(node, ctx) {
      const method  = node.data?.metodo || 'GET'
      const url     = interpolate(node.data?.url || '', ctx.variables)
      if (!url) throw new Error('URL requerida')
      // Build headers
      const headers = { 'Content-Type': 'application/json' }
      for (const line of String(node.data?.headers || '').split('\n')) {
        const [k, ...rest] = line.split(':')
        if (k && rest.length) headers[k.trim()] = interpolate(rest.join(':').trim(), ctx.variables)
      }
      const opts = { method, headers }
      if (['POST', 'PUT', 'PATCH'].includes(method) && node.data?.body) {
        const raw = interpolate(node.data.body, ctx.variables)
        opts.body = raw
      }
      const res = await fetch(url, opts)
      const text = await res.text()
      const data = safeJson(text, text)
      if (!res.ok) {
        ctx.variables.error = `HTTP ${res.status}: ${text.slice(0, 200)}`
        throw new Error(ctx.variables.error)
      }
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, typeof data === 'object' ? JSON.stringify(data) : data)
      ctx.variables._last_http_status = res.status
      ctx.variables._last_http_response = data

      // Apply JSON → variable extractions
      const extract = Array.isArray(node.data?.extract) ? node.data.extract : []
      for (const m of extract) {
        if (!m?.var || !m?.path) continue
        const value = getJsonPath(data, m.path)
        const writable = typeof value === 'object' && value !== null ? JSON.stringify(value) : (value ?? '')
        await setVarBoth(ctx, m.var, writable)
        logDebug(ctx, 'flow_run', `📦 ${m.path} → ${m.var} = ${String(writable).slice(0, 80)}`, {})
      }
      logDebug(ctx, 'flow_run', `🌐 ${method} ${url} → ${res.status}`, { extracted: extract.length })
    },
  },

  // ── 2) Webhook (alias del N8N node) ─────────────────────────────────────
  {
    type: 'webhook',
    category: 'integrations',
    label: 'Webhook (N8N)',
    icon: '🔗', color: '#ff8c42',
    description: 'Llama a un webhook N8N configurado.',
    fields: [
      { key: 'integrationId', label: 'ID de la integración N8N', type: 'text' },
      { key: 'payload',       label: 'Payload JSON', type: 'textarea', placeholder: '{"hola":"{{nombre}}"}' },
      { key: 'destino',       label: 'Guardar respuesta en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      if (!node.data?.integrationId) throw new Error('Falta integrationId')
      const raw = interpolate(node.data?.payload || '{}', ctx.variables)
      const payload = safeJson(raw, {})
      const r = await dispatchN8N(node.data.integrationId, payload, { forceSync: !!node.data?.destino })
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, typeof r?.data === 'object' ? JSON.stringify(r.data) : (r?.data || ''))
      if (!r?.ok) throw new Error(r?.error || 'Webhook falló')
    },
  },

  // ── 3) SQL (stub) ───────────────────────────────────────────────────────
  {
    type: 'sql',
    category: 'integrations',
    label: 'SQL',
    icon: '🗄', color: '#888',
    description: 'CRUD genérico contra una base de datos. (Próximamente)',
    stub: true,
    fields: [
      { key: 'query', label: 'Query', type: 'textarea', placeholder: 'SELECT * FROM table WHERE id = {{id}}' },
    ],
    async exec() {
      throw new Error('SQL aún no implementado — configura un workflow N8N con SQL Node por ahora.')
    },
  },

  // ── 4) Google Sheets ────────────────────────────────────────────────────
  // Se ejecuta EN EL SERVIDOR (flujos de WhatsApp/Messenger/IG) usando la cuenta
  // de Google conectada en Configuración → Google. Conecta tu Google y vincula
  // la hoja por su link.
  {
    type: 'google_sheets',
    category: 'integrations',
    label: 'Google Sheets',
    icon: '📊', color: '#0f9d58',
    description: 'Lee/filtra filas por columna, agrega, edita o elimina filas de una hoja de Google vinculada. Requiere Google conectado en Configuración → Google.',
    fields: [
      { key: 'operacion', label: 'Operación', type: 'select', options: [
          { value: 'read',   label: 'Consumir / filtrar filas (leer)' },
          { value: 'append', label: 'Agregar fila' },
          { value: 'update', label: 'Editar fila (rango)' },
          { value: 'delete', label: 'Eliminar contenido (rango)' },
        ], default: 'read' },
      // Hoja vinculada en Configuración → Google (dropdown). Guarda el spreadsheetId.
      { key: 'sheetId', label: 'Hoja vinculada', type: 'sheetRef',
        hint: 'Elige una hoja conectada en Configuración → Google. Para usar otra, pega su link abajo.' },
      // Alternativa manual cuando no se elige una hoja vinculada.
      { key: 'spreadsheet', label: '…o link/ID de la hoja', type: 'text',
        placeholder: 'https://docs.google.com/spreadsheets/d/...',
        showIf: d => !d.sheetId },
      { key: 'range', label: 'Rango / pestaña', type: 'text',
        placeholder: 'Hoja1!A1:Z1000  (vacío = toda la primera hoja)',
        hint: 'La PRIMERA fila del rango se usa como nombres de columna (encabezados).' },
      // ── Filtro por columna (solo lectura) ──
      { key: 'matchColumn', label: 'Filtrar por columna', type: 'sheetColumnRef',
        showIf: d => (d.operacion || 'read') === 'read',
        hint: 'Toma la primera fila como encabezados. Elige la columna a comparar (ej. NOMBRE).' },
      { key: 'matchValue', label: 'Valor que debe coincidir', type: 'text',
        placeholder: '{{nombre}}',
        showIf: d => (d.operacion || 'read') === 'read' && !!d.matchColumn,
        hint: 'Devuelve solo las filas cuya columna elegida coincida con este valor.' },
      { key: 'extract', label: 'Extraer columnas de la 1ª fila encontrada → variables',
        type: 'jsonMappings',
        showIf: d => (d.operacion || 'read') === 'read',
        placeholder: 'Mapea el nombre EXACTO de una columna (ej. EMAIL) a una variable.',
        hint: 'Usa el encabezado tal cual aparece en la primera fila.' },
      { key: 'destino', label: 'Guardar filas encontradas en (JSON)', type: 'variableRef',
        showIf: d => (d.operacion || 'read') === 'read' },
      // ── Escritura ──
      { key: 'valores', label: 'Valores (coma o JSON, para agregar/editar)', type: 'textarea',
        placeholder: '{{nombre}}, {{email}}, nuevo',
        showIf: d => ['append', 'update'].includes(d.operacion) },
    ],
    async exec(node, ctx) {
      const op = node.data?.operacion || 'read'
      // La hoja vinculada (sheetId) guarda el spreadsheetId; si no, link/ID manual.
      const spreadsheet = (node.data?.sheetId && String(node.data.sheetId).trim())
        || interpolate(node.data?.spreadsheet || '', ctx.variables)
      const range = interpolate(node.data?.range || '', ctx.variables) || 'A1:Z1000'
      if (!spreadsheet) throw new Error('Elige una hoja vinculada o pega el link/ID de la hoja')

      // El navegador no tiene la cuenta de Google: delegamos al servidor, que usa
      // el OAuth de la cuenta conectada en Configuración → Google. El mismo
      // endpoint sirve para flujos de prueba/webchat y de canales.
      const accId = ctx.accId || ctx.variables?.__accId
      if (!accId || accId === 'sandbox-acc') {
        throw new Error('Falta el contexto de cuenta para Google Sheets. Ejecuta la prueba con una cuenta real (chat de prueba).')
      }
      const values = parseSheetValues(node.data?.valores, ctx.variables)
      const matchColumn = node.data?.matchColumn || ''
      const matchValue  = interpolate(node.data?.matchValue || '', ctx.variables)

      const r = await googleSheetsOp(accId, { operation: op, spreadsheet, range, values, matchColumn, matchValue })

      if (op === 'read') {
        if (r?.error) throw new Error(r.error)
        const rows = r?.rows || []
        const records = r?.records || []
        if (node.data?.destino) await setVarBoth(ctx, node.data.destino, JSON.stringify(records))
        ctx.variables._last_sheet_rows = rows
        ctx.variables._last_sheet_records = records
        ctx.variables._last_sheet_count = records.length
        // Extrae columnas de la PRIMERA fila encontrada → variables
        const extract = Array.isArray(node.data?.extract) ? node.data.extract : []
        const first = records[0] || {}
        for (const m of extract) {
          if (!m?.var || !m?.path) continue
          const col = String(m.path).trim()
          const val = first[col] ?? (first[Object.keys(first).find(k => k.toLowerCase() === col.toLowerCase()) || ''] ?? '')
          await setVarBoth(ctx, m.var, val)
          logDebug(ctx, 'flow_run', `📊 columna "${col}" → ${m.var} = ${String(val).slice(0, 80)}`, {})
        }
        logDebug(ctx, 'flow_run',
          matchColumn
            ? `📊 Sheets: ${records.length} fila(s) donde ${matchColumn} = "${matchValue}"`
            : `📊 Sheets leído: ${records.length} fila(s)`,
          { range, matchColumn, matchValue })
      } else if (op === 'append') {
        logDebug(ctx, 'flow_run', `📊 Fila agregada (${values.length} col)`, { range })
      } else if (op === 'update') {
        logDebug(ctx, 'flow_run', `📊 Rango actualizado`, { range })
      } else if (op === 'delete') {
        logDebug(ctx, 'flow_run', `📊 Rango limpiado`, { range })
      }
    },
  },

  // ── 5) Email (stub) ─────────────────────────────────────────────────────
  {
    type: 'email_send',
    category: 'integrations',
    label: 'Email',
    icon: '✉️', color: '#888',
    description: 'Envío de email transaccional. (Próximamente)',
    stub: true,
    fields: [
      { key: 'to',      label: 'To',      type: 'text' },
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'body',    label: 'Body',    type: 'textarea' },
    ],
    async exec() {
      throw new Error('Email aún no implementado — usa un workflow N8N con SMTP/SendGrid Node.')
    },
  },

  // ── 6) CRM (alias agrupador) ────────────────────────────────────────────
  {
    type: 'crm_action',
    category: 'integrations',
    label: 'CRM (acción)',
    icon: '👥', color: '#22d98a',
    description: 'Atajo a acciones del CRM interno (ver categoría CRM).',
    fields: [
      { key: 'accion', label: 'Acción', type: 'select', options: [
          { value: 'create_note', label: 'Crear nota' },
          { value: 'create_task', label: 'Crear tarea' },
        ], default: 'create_note' },
      { key: 'target_id', label: 'Target ID', type: 'text' },
      { key: 'contenido', label: 'Contenido', type: 'textarea' },
    ],
    async exec(node, ctx) {
      const { api } = await import('../../api')
      const content = interpolate(node.data?.contenido || '', ctx.variables)
      const targetId = interpolate(node.data?.target_id || '', ctx.variables)
      if (node.data?.accion === 'create_task') {
        await api.post(`/api/accounts/${ctx.accId}/crm/tasks`, { targetType: 'contact', targetId, title: content })
      } else {
        await api.post(`/api/accounts/${ctx.accId}/crm/notes`, { targetType: 'contact', targetId, content })
      }
    },
  },

  // ── 7) ERP (stub) ───────────────────────────────────────────────────────
  {
    type: 'erp',
    category: 'integrations',
    label: 'ERP',
    icon: '🏭', color: '#888',
    description: 'Integración con ERP. (Próximamente)',
    stub: true,
    fields: [
      { key: 'sistema', label: 'Sistema',  type: 'select', options: [
          { value: 'sap',         label: 'SAP' },
          { value: 'odoo',        label: 'Odoo' },
          { value: 'businesscentral', label: 'Business Central' },
        ] },
      { key: 'accion',  label: 'Acción', type: 'text' },
    ],
    async exec() {
      throw new Error('ERP aún no implementado — la mejor ruta hoy es N8N o un HTTP Request directo.')
    },
  },

  // ── 8) API Personalizada (otro alias del HTTP Request, con secret manager) ─
  {
    type: 'custom_api',
    category: 'integrations',
    label: 'API personalizada',
    icon: '🔑', color: '#ff8c42',
    description: 'HTTP request con header de auth pre-rellenado.',
    fields: [
      { key: 'metodo', label: 'Método', type: 'select', options: [
          { value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' }, { value: 'PATCH', label: 'PATCH' },
          { value: 'DELETE', label: 'DELETE' },
        ], default: 'POST' },
      { key: 'url',      label: 'URL', type: 'text' },
      { key: 'token',    label: 'Bearer token', type: 'text', secret: true },
      { key: 'body',     label: 'Body JSON', type: 'textarea' },
      { key: 'destino',  label: 'Guardar en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const url = interpolate(node.data?.url || '', ctx.variables)
      const method = node.data?.metodo || 'POST'
      const headers = { 'Content-Type': 'application/json' }
      if (node.data?.token) headers['Authorization'] = `Bearer ${node.data.token}`
      const opts = { method, headers }
      if (['POST', 'PUT', 'PATCH'].includes(method) && node.data?.body) opts.body = interpolate(node.data.body, ctx.variables)
      const res = await fetch(url, opts)
      const text = await res.text()
      const data = safeJson(text, text)
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, typeof data === 'object' ? JSON.stringify(data) : data)
    },
  },
]
