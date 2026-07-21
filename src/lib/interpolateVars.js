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
