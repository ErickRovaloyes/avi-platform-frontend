// Reemplaza {{clave}} en un texto con las variables de la conversación (locales + de
// sistema ancladas del contacto). Deja el placeholder intacto si no hay valor, para no
// enviar "undefined". Se usa al enviar mensajes manuales y mensajes rápidos.
//
// Las variables base del usuario (nombre/email/teléfono) se resuelven por ALIAS: la
// canónica es user_name/user_email/user_phone, pero {{var_nombre}}, {{nombre}},
// {{cliente_nombre}}… siguen resolviendo. Debe reflejar backend/services/varAliases.js.
const ALIAS_GROUPS = {
  name: ['user_name', 'var_nombre', 'nombre', 'cliente_nombre', 'nombre_cliente', 'nombre_lead'],
  email: ['user_email', 'var_email', 'email', 'correo', 'cliente_email', 'correo_electronico', 'email_cliente'],
  phone: ['user_phone', 'var_telefono', 'telefono', 'teléfono', 'celular', 'whatsapp', 'cliente_telefono', 'telefono_cliente'],
}
const KEY_TO_GROUP = {}
for (const [g, keys] of Object.entries(ALIAS_GROUPS)) for (const k of keys) KEY_TO_GROUP[k.toLowerCase()] = g
const nonEmpty = v => v != null && String(v).trim() !== ''

export function interpolateConvVars(text, conv) {
  const lv = conv?.localVars || {}
  const resolve = key => {
    if (nonEmpty(lv[key])) return String(lv[key])
    const g = KEY_TO_GROUP[String(key).toLowerCase()]
    if (g) {
      for (const alias of ALIAS_GROUPS[g]) if (nonEmpty(lv[alias])) return String(lv[alias])
      if (g === 'name' && nonEmpty(conv?.guestName)) return String(conv.guestName) // último recurso para el nombre
    }
    return null
  }
  return String(text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => {
    const v = resolve(k)
    return v != null ? v : m
  })
}

// Resuelve el valor de un grupo de alias (name/email/phone) desde las variables locales
// de la conversación: primer alias no vacío en orden canónico (user_* primero). Útil para
// precargar campos editables de la Info del chat.
export function resolveConvField(conv, group) {
  const lv = conv?.localVars || {}
  for (const alias of (ALIAS_GROUPS[group] || [])) if (nonEmpty(lv[alias])) return String(lv[alias])
  return ''
}

// Nombre "placeholder" de invitado que asigna el sistema cuando aún no hay un nombre real
// ("Invitado #1001", "Visitante"). No debe ganar sobre un nombre real escrito en otro alias.
const GUEST_PLACEHOLDER_RE = /^(invitado|visitante|guest)\b/i

// Nombre a MOSTRAR de una conversación (una sola fuente de verdad = user_name y sus alias).
// Devuelve el primer valor real (no vacío, no placeholder) del grupo de nombre; si no hay,
// cae a guest_name (que incluye "Invitado #N" en webchat o el nombre de perfil en WhatsApp);
// si nada, "(sin nombre)". Funciona en todos los canales.
export function conversationName(conv) {
  const lv = conv?.localVars || {}
  for (const alias of ALIAS_GROUPS.name) {
    const v = lv[alias]
    if (nonEmpty(v) && !GUEST_PLACEHOLDER_RE.test(String(v).trim())) return String(v).trim()
  }
  if (nonEmpty(conv?.guestName)) return String(conv.guestName).trim()
  return '(sin nombre)'
}

// Iniciales (hasta 2 letras) del nombre a mostrar, para los avatares.
export function conversationInitials(conv) {
  const name = conversationName(conv)
  if (name === '(sin nombre)') return '?'
  const parts = name.split(/\s+/).filter(Boolean)
  const s = parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)
  return s.toUpperCase()
}
