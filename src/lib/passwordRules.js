// Requisitos de una contraseña NUEVA. Debe coincidir con backend/services/passwords.js:
// aquí es solo ayuda visual — quien decide y rechaza es el servidor.
//
// Se usan clases Unicode y no [A-Z]/[^A-Za-z0-9]: con rangos ASCII una "Ñ" no contaría como
// mayúscula y una "á" sí contaría como carácter especial.
export const PASSWORD_MIN = 8
export const PASSWORD_RULES_TEXT = 'Mínimo 8 caracteres, una mayúscula y un carácter especial.'

const UPPER_RE = /\p{Lu}/u
const SPECIAL_RE = /[^\p{L}\p{N}]/u

/** `{ ok, error }` — mismo criterio que el backend. */
export function validatePassword(value) {
  const s = String(value ?? '')
  if (s.length < PASSWORD_MIN || !UPPER_RE.test(s) || !SPECIAL_RE.test(s)) {
    return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres, una mayúscula y un carácter especial.' }
  }
  return { ok: true }
}

/** Estado de cada requisito, para pintar la lista de comprobación mientras se escribe. */
export function passwordChecks(value) {
  const s = String(value ?? '')
  return [
    { label: 'Al menos 8 caracteres', ok: s.length >= PASSWORD_MIN },
    { label: 'Una mayúscula', ok: UPPER_RE.test(s) },
    { label: 'Un carácter especial', ok: SPECIAL_RE.test(s) },
  ]
}
