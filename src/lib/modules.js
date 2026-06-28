// Espejo del registro de módulos del backend (backend/services/modules.js).
// Un módulo es una "funcionalidad" que la cuenta tiene derecho a usar; lo activa
// un superadmin (o se paga). Es un eje independiente de los permisos de rol.

export const MODULES = [
  { id: 'inbox',     name: 'Bandeja',            icon: '💬', description: 'Conversaciones entrantes: ver y responder chats.' },
  { id: 'crm',       name: 'CRM y Pipeline',     icon: '🗂', description: 'Contactos, embudos y gestión comercial.' },
  { id: 'channels',  name: 'Canales',            icon: '📡', description: 'Conexión de WhatsApp, Messenger, Instagram y Webchat.' },
  { id: 'campaigns', name: 'Campañas / Masivos', icon: '📣', description: 'Envío de mensajes masivos a contactos.' },
  { id: 'flows',     name: 'Flujos',             icon: '🔀', description: 'Automatizaciones y flujos conversacionales.' },
  { id: 'ai_agents', name: 'Agentes IA',         icon: '🧠', description: 'Zona IA: prompts, herramientas y variables del agente.' },
  { id: 'knowledge', name: 'Conocimiento (RAG)', icon: '📚', description: 'Base de conocimiento para respuestas del agente.' },
  { id: 'calendars', name: 'Agendamiento',       icon: '🗓', description: 'Calendarios y reservas.' },
  { id: 'metrics',   name: 'Métricas',           icon: '📊', description: 'Analítica y reportes de uso.' },
  { id: 'teamchat',  name: 'Chat de equipo',     icon: '👥', description: 'Mensajería interna entre el equipo.' },
]
export const MODULE_IDS = MODULES.map(m => m.id)

// ¿La cuenta tiene habilitado el módulo? El backend ya resuelve el mapa efectivo
// (override de cuenta → preset del tipo → todos) y lo entrega en account.modules.
// Si el mapa no existe (retro-compat / aún cargando), se asume habilitado.
export function hasModule(modulesMap, id) {
  if (!modulesMap) return true
  return modulesMap[id] !== false
}
