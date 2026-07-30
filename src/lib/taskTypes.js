// Catálogo compartido de TIPOS de tarea del CRM. Se usa en los formularios de
// tarea (Tareas, detalle de contacto, ticket del pipeline), en la visualización
// (icono + etiqueta) y en el filtro por tipo.
export const TASK_TYPES = [
  { value: 'general',     label: 'General',     icon: '📌' },
  { value: 'llamada',     label: 'Llamada',     icon: '📞' },
  { value: 'whatsapp',    label: 'WhatsApp',    icon: '💬' },
  { value: 'correo',      label: 'Correo',      icon: '✉️' },
  { value: 'reunion',     label: 'Reunión',     icon: '🤝' },
  { value: 'seguimiento', label: 'Seguimiento', icon: '🔁' },
]

const _byValue = Object.fromEntries(TASK_TYPES.map(t => [t.value, t]))

export function taskType(value) {
  return _byValue[value] || _byValue.general
}
export function taskTypeLabel(value) {
  const t = taskType(value)
  return `${t.icon} ${t.label}`
}
