/**
 * Data & Variables — set, mapper, JSON parse/build, format, custom JS.
 */

import { interpolate, logDebug, safeJson, fmtDate, setVarBoth } from '../common'

// jq-like dotted path get/set: "a.b.0.c"
function getPath(obj, path) {
  if (!path) return obj
  return path.split('.').reduce((acc, k) => acc == null ? acc : acc[k], obj)
}
function setPath(obj, path, value) {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k]
  }
  cur[parts[parts.length - 1]] = value
}

export const dataNodes = [
  // ── 1) Variable (set/get) ───────────────────────────────────────────────
  {
    type: 'variable',
    category: 'data',
    label: 'Variable',
    icon: '🏷', color: '#4fa8ff',
    description: 'Define o copia una variable.',
    fields: [
      { key: 'modo',     label: 'Modo', type: 'select', options: [
          { value: 'set', label: 'Asignar valor' },
          { value: 'get', label: 'Leer (copia a otra)' },
        ], default: 'set' },
      { key: 'nombre',   label: 'Nombre', type: 'variableRef' },
      { key: 'valor',    label: 'Valor (interpolable)', type: 'textarea' },
      { key: 'destino',  label: 'Variable destino (modo Leer)', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const name = node.data?.nombre
      if (!name) throw new Error('Falta nombre de variable')
      if (node.data?.modo === 'get') {
        const v = ctx.variables[name]
        if (node.data?.destino) await setVarBoth(ctx, node.data.destino, v ?? '')
      } else {
        const v = interpolate(node.data?.valor || '', ctx.variables)
        await setVarBoth(ctx, name, v)
      }
    },
  },

  // ── 2) Mapper ───────────────────────────────────────────────────────────
  {
    type: 'mapper',
    category: 'data',
    label: 'Mapper',
    icon: '🔀', color: '#4fa8ff',
    description: 'Transforma una estructura. Acepta una serie de instrucciones origen→destino.',
    fields: [
      { key: 'entrada',  label: 'Entrada (JSON o {{var}})', type: 'text' },
      { key: 'mapeos',   label: 'Mapeos (uno por línea, formato origen.path → destino.path)',
        type: 'textarea', placeholder: 'user.name → contact.fullname\nuser.age → contact.years' },
      { key: 'salida',   label: 'Variable destino', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const raw = interpolate(node.data?.entrada || '{}', ctx.variables)
      const obj = safeJson(raw, {})
      const lines = String(node.data?.mapeos || '').split('\n').map(s => s.trim()).filter(Boolean)
      const out = {}
      for (const line of lines) {
        const [src, dst] = line.split('→').map(s => s.trim())
        if (!src || !dst) continue
        setPath(out, dst, getPath(obj, src))
      }
      if (node.data?.salida) await setVarBoth(ctx, node.data.salida, JSON.stringify(out))
      ctx.variables._last_mapper_output = out
    },
  },

  // ── 3) JSON Parse ───────────────────────────────────────────────────────
  {
    type: 'json_parse',
    category: 'data',
    label: 'JSON parse',
    icon: '{}', color: '#4fa8ff',
    description: 'Parsea un string JSON. Extrae campos.',
    fields: [
      { key: 'entrada', label: 'String JSON', type: 'text' },
      { key: 'path',    label: 'Path opcional (dot.path)', type: 'text' },
      { key: 'destino', label: 'Variable destino', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const raw = interpolate(node.data?.entrada || '', ctx.variables)
      const obj = safeJson(raw, null)
      if (obj == null) throw new Error('JSON inválido')
      const value = node.data?.path ? getPath(obj, node.data.path) : obj
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, typeof value === 'object' ? JSON.stringify(value) : value)
    },
  },

  // ── 4) JSON Builder ─────────────────────────────────────────────────────
  {
    type: 'json_builder',
    category: 'data',
    label: 'JSON builder',
    icon: '🧱', color: '#4fa8ff',
    description: 'Construye un JSON a partir de campos clave-valor.',
    fields: [
      { key: 'campos',  label: 'Campos (key=value, uno por línea, valores interpolables)',
        type: 'textarea', placeholder: 'nombre={{user_name}}\nemail={{user_email}}' },
      { key: 'destino', label: 'Variable destino', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const out = {}
      const lines = String(node.data?.campos || '').split('\n').map(s => s.trim()).filter(Boolean)
      for (const line of lines) {
        const [k, ...rest] = line.split('=')
        if (!k) continue
        out[k.trim()] = interpolate(rest.join('='), ctx.variables)
      }
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, JSON.stringify(out))
      ctx.variables._last_built_json = out
    },
  },

  // ── 5) Formateador ──────────────────────────────────────────────────────
  {
    type: 'formatter',
    category: 'data',
    label: 'Formateador',
    icon: '🎨', color: '#4fa8ff',
    description: 'Formatea fechas y números a un estilo legible.',
    fields: [
      { key: 'valor',   label: 'Valor', type: 'text', placeholder: '{{variable}}' },
      { key: 'tipo',    label: 'Tipo',  type: 'select', options: [
          { value: 'date_long',  label: 'Fecha larga' },
          { value: 'date_short', label: 'Fecha corta' },
          { value: 'time',       label: 'Hora' },
          { value: 'iso',        label: 'ISO 8601' },
          { value: 'relative',   label: 'Hace X tiempo' },
          { value: 'number_int', label: 'Número (entero)' },
          { value: 'number_pct', label: 'Porcentaje' },
          { value: 'currency',   label: 'Moneda (USD)' },
        ], default: 'date_long' },
      { key: 'destino', label: 'Variable destino', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const raw = interpolate(node.data?.valor || '', ctx.variables)
      const tipo = node.data?.tipo || 'date_long'
      let out = raw
      if (tipo.startsWith('date_') || tipo === 'time' || tipo === 'iso' || tipo === 'relative') {
        const preset = tipo === 'date_long' ? 'long' : tipo === 'date_short' ? 'date' : tipo === 'time' ? 'time' : tipo === 'iso' ? 'iso' : 'relative'
        out = fmtDate(raw, preset)
      } else if (tipo === 'number_int') {
        out = Math.round(Number(raw)).toLocaleString('es')
      } else if (tipo === 'number_pct') {
        out = (Number(raw) * 100).toFixed(1) + '%'
      } else if (tipo === 'currency') {
        out = new Intl.NumberFormat('es', { style: 'currency', currency: 'USD' }).format(Number(raw) || 0)
      }
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, out)
      ctx.variables._last_formatted = out
    },
  },

  // ── 6) Código Personalizado ─────────────────────────────────────────────
  // SECURITY: runs in the BROWSER, NOT on the server. We use Function() with
  // a strict shim that only exposes the conv vars. Still recommend to disable
  // this node in shared environments.
  //
  // API expuesta dentro del código:
  //   avi.get(name)               → lee variable
  //   avi.set(name, value)        → escribe variable (async, persiste)
  //   avi.has(name)               → boolean
  //   avi.del(name)               → elimina variable
  //   avi.log(msg, detail?)       → log en el debug
  //   avi.lastMessage             → último mensaje del usuario
  //   avi.conversationId, avi.accountId, avi.agentId
  //   avi.vars                    → snapshot de todas las variables (lectura)
  //   avi.fetch(url, opts?)       → alias a fetch
  //   avi.json(text, fallback?)   → safe JSON parse
  //   avi.getPath(obj, path)      → leer "a.b.c" / "a[0].b"
  //
  // Adicionalmente la función recibe el snapshot `vars` como segundo argumento,
  // por retrocompatibilidad con flujos viejos.
  {
    type: 'custom_code',
    category: 'data',
    label: 'Código JS',
    icon: '💻', color: '#facc15',
    description: 'JavaScript con un objeto avi.* para leer/escribir variables y llamar APIs.',
    fields: [
      { key: 'codigo', label: 'Código JavaScript', type: 'code', language: 'javascript',
        rows: 10,
        placeholder:
`// Acceso a variables y utilidades vía 'avi':
//   const nombre = avi.get('user_name')
//   await avi.set('saludo', 'Hola ' + nombre)
//   avi.log('Saludo creado')
//   return saludo  // valor opcional para 'Variable destino'

const email = (avi.get('email') || '').toLowerCase()
await avi.set('email_lower', email)
avi.log('Email normalizado', { email })
return email` },
      { key: 'destino', label: 'Guardar valor retornado en (opcional)', type: 'variableRef' },
    ],
    timeoutMs: 5000,
    async exec(node, ctx) {
      const code = String(node.data?.codigo || '')

      // jq-like path getter (idéntico al usado en HTTP request)
      function getPathLocal(obj, path) {
        if (obj == null || !path) return undefined
        const normalized = String(path).replace(/\[(\d+)\]/g, '.$1')
        return normalized.split('.').reduce((acc, k) => acc == null ? undefined : acc[k.trim()], obj)
      }

      // Construye la API expuesta como `avi`
      const avi = {
        get:  (name) => ctx.variables[name],
        set:  async (name, value) => { await setVarBoth(ctx, name, value); return value },
        has:  (name) => Object.prototype.hasOwnProperty.call(ctx.variables, name),
        del:  (name) => { delete ctx.variables[name] },
        log:  (msg, detail = {}) => logDebug(ctx, 'flow_run', `💻 ${msg}`, detail),
        // contexto inmediato
        get lastMessage() { return ctx.variables._lastUserMessage },
        conversationId: ctx.convId,
        accountId:      ctx.accId,
        agentId:        ctx.agId,
        // helpers
        get vars()  { return ctx.variables },
        fetch:      (url, opts) => fetch(url, opts),
        json:       (text, fallback = null) => safeJson(text, fallback),
        getPath:    getPathLocal,
      }

      try {
        // AsyncFunction permite usar await sin envoltorios
        // eslint-disable-next-line no-new-func
        const AsyncFn = Object.getPrototypeOf(async function () {}).constructor
        const fn = new AsyncFn('avi', 'vars', code)
        const out = await fn(avi, ctx.variables)
        if (node.data?.destino && out !== undefined) {
          await setVarBoth(ctx, node.data.destino, typeof out === 'object' && out !== null ? JSON.stringify(out) : out)
        }
        ctx.variables._last_code_output = out
        logDebug(ctx, 'flow_run', '💻 Código ejecutado', { resultType: typeof out })
      } catch (e) { throw new Error(`Custom code: ${e.message}`) }
    },
  },
]
