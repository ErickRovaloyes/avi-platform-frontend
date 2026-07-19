/**
 * Catálogo de variables de sistema que el motor de flujos produce automáticamente.
 * Se usan igual que las personalizadas: {{nombre}} en prompts y mensajes.
 *
 * Mantener sincronizado con los nodos que las asignan (ctx.variables._*).
 */

export const SYSTEM_VARIABLE_GROUPS = [
  {
    group: 'Mensaje del usuario',
    vars: [
      { name: '_lastUserMessage', desc: 'Último mensaje del usuario. Incluye la transcripción si fue un audio, o el texto concatenado del nodo "Acumular mensajes".' },
      { name: 'message', desc: 'Alias del mensaje entrante que disparó el flujo (equivale a _lastUserMessage en el disparador).' },
      { name: '_accumulated_count', desc: 'Cuántos mensajes juntó el nodo "Acumular mensajes" en el último lote.' },
    ],
  },
  {
    group: 'IA (clasificación y análisis)',
    vars: [
      { name: '_last_intent', desc: 'Intención detectada por el nodo "Clasificador de intención".' },
      { name: '_last_intent_confidence', desc: 'Confianza (0 a 1) de la intención detectada.' },
      { name: '_last_sentiment', desc: 'Sentimiento detectado: positive, neutral o negative.' },
      { name: '_last_sentiment_score', desc: 'Puntuación del sentimiento (-1 a 1).' },
      { name: '_last_route', desc: 'Ruta elegida por el nodo "Router IA".' },
      { name: 'entity_<nombre>', desc: 'Cada entidad extraída por el "Extractor de entidades" (ej. entity_email, entity_telefono).' },
    ],
  },
  {
    group: 'Base de conocimiento (RAG)',
    vars: [
      { name: '_last_kb_results', desc: 'Fragmentos encontrados en la base de conocimiento.' },
      { name: '_last_kb_summary', desc: 'Resumen generado a partir de la base de conocimiento.' },
    ],
  },
  {
    group: 'Integraciones (HTTP / Sheets)',
    vars: [
      { name: '_last_http_status', desc: 'Código de estado HTTP de la última petición (nodo "HTTP request").' },
      { name: '_last_http_response', desc: 'Cuerpo de la última respuesta HTTP (parseado a JSON cuando es posible).' },
      { name: '_last_sheet_records', desc: 'Filas encontradas en Google Sheets como objetos {columna: valor}.' },
      { name: '_last_sheet_rows', desc: 'Filas encontradas en Google Sheets como arrays (valores en crudo).' },
      { name: '_last_sheet_count', desc: 'Número de filas encontradas en la última lectura de Google Sheets.' },
    ],
  },
  {
    group: 'Datos y transformación',
    vars: [
      { name: '_last_mapper_output', desc: 'Salida del nodo "Mapeador".' },
      { name: '_last_built_json', desc: 'JSON construido por el nodo "Constructor JSON".' },
      { name: '_last_formatted', desc: 'Texto producido por el nodo "Formateador".' },
      { name: '_last_code_output', desc: 'Resultado del nodo de "Código".' },
    ],
  },
  {
    group: 'CRM',
    vars: [
      { name: '_last_contact_id', desc: 'ID del último contacto creado o encontrado.' },
      { name: '_last_contact_found', desc: 'Indica si se encontró el contacto (true/false).' },
      { name: '_last_lead_id', desc: 'ID del último lead.' },
      { name: '_last_lead_score', desc: 'Puntuación del último lead.' },
      { name: '_last_user_messages', desc: 'Mensajes del usuario recopilados por el CRM.' },
      { name: '_pipeline_move', desc: 'Resultado del último movimiento de tarjeta en un pipeline.' },
    ],
  },
  {
    group: 'Analítica',
    vars: [
      { name: '_last_conversion', desc: 'Última conversión registrada por el nodo de analítica.' },
    ],
  },
  {
    group: 'Cita agendada (agenda)',
    vars: [
      { name: '_cita_id', desc: 'ID de la última cita agendada en la conversación.' },
      { name: '_cita_cliente', desc: 'Nombre del cliente de la cita.' },
      { name: '_cita_servicio', desc: 'Servicio elegido (o nombre del calendario).' },
      { name: '_cita_calendario', desc: 'Nombre del calendario donde se agendó.' },
      { name: '_cita_fecha', desc: 'Fecha de la cita (YYYY-MM-DD).' },
      { name: '_cita_hora', desc: 'Hora de la cita (HH:MM).' },
      { name: '_cita_telefono', desc: 'Teléfono del cliente de la cita.' },
      { name: '_cita_email', desc: 'Email del cliente de la cita.' },
      { name: '_cita_duracion', desc: 'Duración de la cita en minutos.' },
      { name: '_cita_notas', desc: 'Notas/motivo de la cita.' },
    ],
  },
  {
    group: 'Perfil e historial',
    vars: [
      { name: 'user_id', desc: 'ID del contacto cargado por "Cargar perfil de usuario".' },
      { name: 'user_name', desc: 'Nombre del contacto cargado.' },
      { name: 'user_email', desc: 'Email del contacto cargado.' },
      { name: 'user_phone', desc: 'Teléfono del contacto cargado.' },
      { name: 'user_tags', desc: 'Etiquetas del contacto (separadas por coma).' },
      { name: 'user_<clave>', desc: 'Memoria con scope "Usuario" guardada por el nodo "Memoria".' },
      { name: 'account_<clave>', desc: 'Memoria con scope "Cuenta" guardada por el nodo "Memoria".' },
      { name: '_conv_history', desc: 'Últimos N mensajes de la conversación (nodo "Historial conversación").' },
    ],
  },
  {
    group: 'Datos del contacto (lead)',
    vars: [
      { name: 'nombre', desc: 'Nombre del lead/contacto (anclado al contacto del CRM).' },
      { name: 'telefono', desc: 'Teléfono del lead/contacto.' },
      { name: 'email', desc: 'Correo del lead/contacto.' },
      { name: 'var_nombre', desc: 'Nombre del contacto de la conversación.' },
      { name: 'var_telefono', desc: 'Teléfono del contacto de la conversación.' },
      { name: 'var_email', desc: 'Correo del contacto de la conversación.' },
    ],
  },
]

// Lista plana de variables de sistema (para autocompletado): { id, name, description }.
export const SYSTEM_VARIABLES_FLAT = SYSTEM_VARIABLE_GROUPS.flatMap(g =>
  g.vars.map(v => ({ id: v.name, name: v.name, description: v.desc }))
)
