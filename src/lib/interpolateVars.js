// Reemplaza {{clave}} en un texto con las variables de la conversación (locales + de
// sistema ancladas del contacto). Deja el placeholder intacto si no hay valor, para no
// enviar "undefined". Se usa al enviar mensajes manuales y mensajes rápidos.
export function interpolateConvVars(text, conv) {
  const lv = conv?.localVars || {}
  const alias = {
    nombre: lv.var_nombre ?? lv.user_name ?? lv.nombre ?? conv?.guestName,
    name: lv.var_nombre ?? lv.user_name ?? lv.nombre ?? conv?.guestName,
    telefono: lv.telefono ?? lv.var_telefono ?? lv.user_phone,
    email: lv.email ?? lv.correo ?? lv.var_email ?? lv.user_email,
    correo: lv.email ?? lv.correo ?? lv.var_email ?? lv.user_email,
  }
  return String(text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => {
    if (lv[k] != null && String(lv[k]) !== '') return String(lv[k])
    if (alias[k] != null && String(alias[k]) !== '') return String(alias[k])
    return m
  })
}
