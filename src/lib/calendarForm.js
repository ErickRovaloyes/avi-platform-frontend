/**
 * Modelo del formulario de un calendario tipo "formulario" (asistente por pasos).
 * Compartido por el constructor (CalendarsPanel) y la página pública (BookingPage).
 *
 * formConfig = {
 *   intro, successMessage, whatsappConsent,
 *   steps: [
 *     { id, title, type:'fields', fields:[ Field ] },
 *     { id, title, type:'schedule' },               // selección de fecha/hora
 *   ]
 * }
 * Field = { id, label, type, required, help, placeholder, options:[],
 *           map: null|'clientName'|'clientPhone'|'clientEmail',
 *           showIf: null | { field:<fieldId>, value } }
 */

export function uid8() { return Math.random().toString(36).slice(2, 8) }

export function defaultFormSteps() {
  return [
    {
      id: 'st_' + uid8(), title: 'Tus datos', type: 'fields', fields: [
        { id: 'f_name', label: 'Nombre completo', type: 'text', required: true, map: 'clientName' },
        { id: 'f_phone', label: 'Teléfono', type: 'tel', required: true, map: 'clientPhone' },
        { id: 'f_email', label: 'Email', type: 'email', required: false, map: 'clientEmail' },
      ],
    },
    { id: 'st_' + uid8(), title: 'Elige tu horario', type: 'schedule' },
  ]
}

// Devuelve los pasos normalizados (migra el formato antiguo `fields` si hace falta).
export function normalizeForm(fc) {
  if (fc?.steps?.length) return fc.steps
  const legacy = (fc?.fields || []).map(f => ({ id: 'f_' + uid8(), label: f.label, type: f.type || 'text', required: !!f.required }))
  const base = defaultFormSteps()
  if (legacy.length) base[0].fields = [...base[0].fields, ...legacy]
  return base
}

export function isFieldVisible(field, answers) {
  if (!field?.showIf?.field) return true
  return String(answers[field.showIf.field] ?? '') === String(field.showIf.value ?? '')
}
