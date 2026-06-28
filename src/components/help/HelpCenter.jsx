import { useState, useMemo } from 'react'

// Centro de Ayuda para usuarios de la cuenta: qué es cada funcionalidad, cómo
// funciona y cómo activarla/usarla paso a paso. Contenido estático (sin backend),
// pensado para que un cliente nuevo se guíe solo. Buscador + acordeón (móvil-friendly).

const TOPICS = [
  {
    id: 'inbox', icon: '💬', title: 'Bandeja de conversaciones',
    what: 'Es el centro donde llegan y se responden todos los chats de tus clientes, sin importar el canal (WhatsApp, Messenger, Instagram o Webchat).',
    how: 'Cada mensaje entrante crea o actualiza una conversación. La IA puede responder automáticamente, o un asesor puede tomar el control. Puedes filtrar por canal, etiquetas, estado y asignación.',
    steps: ['Abre la pestaña “Bandeja”.', 'Selecciona una conversación de la lista para leerla.', 'Activa/desactiva la IA con el interruptor del encabezado para responder tú mismo.', 'Escribe en “Respuesta manual” y envía; adjunta imágenes, audios o documentos con los botones del lado.', 'Usa el panel lateral (ℹ) para ver datos del cliente, etiquetas y agendar una cita.'],
  },
  {
    id: 'zonaia', icon: '🧠', title: 'Zona IA (el agente)',
    what: 'Donde defines el “cerebro” del agente: su prompt (personalidad e instrucciones), las herramientas que puede usar y las variables.',
    how: 'El prompt activo guía cómo responde la IA. Las herramientas le dan capacidades (agendar, cobrar, consultar tienda/catálogo). Las variables guardan datos de la conversación.',
    steps: ['Entra a “Zona IA”.', 'Edita el prompt o usa el Agente de Cambios para modificarlo en lenguaje natural.', 'Activa el prompt que quieras usar (puedes tener varias versiones).', 'Asigna herramientas al agente según lo que necesites que haga.'],
  },
  {
    id: 'channels', icon: '📡', title: 'Canales (WhatsApp, Messenger, Instagram, Webchat)',
    what: 'Son las vías por las que tus clientes te escriben. Aquí los conectas.',
    how: 'WhatsApp se conecta con 1 clic (Embedded Signup). Messenger e Instagram con “Conectar en 3 pasos” (inicias sesión con Facebook, marcas tu Página y autorizas). Webchat genera un enlace/widget público.',
    steps: ['Ve a Configuración → Canales.', 'Elige el canal y pulsa conectar (1 clic) o usa la configuración manual.', 'Para Messenger/Instagram: inicia sesión con Facebook y MARCA tu Página antes de continuar.', 'Verifica que el estado quede “Conectado”.'],
  },
  {
    id: 'flows', icon: '🔀', title: 'Flujos (automatizaciones)',
    what: 'Secuencias automáticas que responden, piden datos, llaman APIs, derivan a un humano o usan la IA: tu lógica conversacional sin programar.',
    how: 'Un flujo se compone de nodos conectados (mensaje, condición, IA, CRM, agenda, etc.) con un disparador (inicio de conversación, palabra clave, manual o herramienta IA).',
    steps: ['Entra a “Flujos” → “Nuevo flujo”.', 'Arrastra nodos y conéctalos (la salida de éxito lleva al siguiente).', 'O usa “✨ Diseñar con IA”: describe lo que quieres y la IA arma el flujo por ti.', 'Define el disparador y guarda.'],
  },
  {
    id: 'crm', icon: '🗂', title: 'CRM y Pipeline',
    what: 'Gestiona tus contactos y mueve oportunidades por etapas (embudos de venta).',
    how: 'Cada conversación puede vincularse a un contacto y a una tarjeta del pipeline. Mueves las tarjetas entre etapas para seguir el avance comercial.',
    steps: ['Abre “CRM”.', 'Crea o edita pipelines y sus etapas.', 'Arrastra las tarjetas entre etapas según avance la venta.', 'Filtra y etiqueta contactos para segmentarlos.'],
  },
  {
    id: 'campaigns', icon: '📣', title: 'Campañas (mensajes masivos)',
    what: 'Envía un mensaje a muchos contactos a la vez (promociones, avisos, recordatorios).',
    how: 'Eliges la audiencia (por etiqueta/segmento) y el contenido; el envío se hace por el canal correspondiente respetando sus reglas (p. ej. plantillas de WhatsApp).',
    steps: ['Ve a “Masivos”.', 'Define la audiencia y el mensaje (o plantilla de WhatsApp).', 'Revisa el conteo de destinatarios y envía o programa.'],
  },
  {
    id: 'calendars', icon: '🗓', title: 'Calendarios y agendamiento',
    what: 'Permite tomar reservas/citas: la IA o un asesor agenda según tu disponibilidad.',
    how: 'Defines horarios, duración y un formulario. Se genera un enlace público de reservas, y también puedes agendar manualmente desde el chat con el mismo calendario visual.',
    steps: ['Configuración → Calendarios → crea un calendario y define disponibilidad.', 'Comparte el enlace público o deja que la IA lo envíe en el flujo.', 'Para agendar tú: en el chat usa “📅 Agendar cita” y elige día/hora en la cuadrícula.'],
  },
  {
    id: 'catalog', icon: '🛍', title: 'Catálogo de Meta',
    what: 'Conecta el catálogo de productos de tu cuenta de Meta (Commerce) y lee su contenido en la plataforma.',
    how: 'Reutiliza el token de tu WhatsApp conectado para detectar catálogos; también puedes pegar el Catalog ID manualmente. Luego lista los productos (nombre, precio, stock, imagen).',
    steps: ['Configuración → Catálogo Meta.', 'Pulsa “Detectar catálogos” (necesitas WhatsApp conectado) o usa la conexión manual.', 'Conecta el catálogo y revisa sus productos.'],
  },
  {
    id: 'knowledge', icon: '📚', title: 'Conocimiento (RAG)',
    what: 'Base de conocimiento que el agente consulta para responder con información de tu negocio (precios, políticas, FAQs).',
    how: 'Subes documentos o notas; se trocean y se convierten en “fragmentos” que la IA recupera según la pregunta del cliente.',
    steps: ['Sube tus documentos/notas a la base de conocimiento.', 'Asígnala al prompt del agente.', 'Haz preguntas de prueba para verificar que responde con tus datos.'],
  },
  {
    id: 'metrics', icon: '📊', title: 'Métricas',
    what: 'Analítica de uso: conversaciones, consumo y desempeño del agente.',
    how: 'Agrega los datos de tus conversaciones y consumo para que veas tendencias y el estado de tu cuenta.',
    steps: ['Abre “Métricas”.', 'Revisa conversaciones por canal, consumo y evolución.'],
  },
  {
    id: 'team', icon: '👥', title: 'Equipo, roles y chat interno',
    what: 'Administra a los miembros de tu cuenta, sus permisos, y comunícate internamente.',
    how: 'Cada miembro tiene un rol con permisos (qué pestañas ve). El “Chat de equipo” permite canales y mensajes directos entre el equipo.',
    steps: ['Configuración → Equipo: crea asesores y asígnales un rol.', 'Crea roles con los permisos que quieras.', 'Usa la pestaña “Equipo” para chatear internamente.'],
  },
  {
    id: 'notifications', icon: '🔔', title: 'Notificaciones',
    what: 'Eliges qué avisos recibir (mensaje nuevo, chat nuevo, transferencia a asesor, soporte, equipo, interno) y por qué canal (Web ya activo; Correo/SMS/App próximamente).',
    how: 'Tus preferencias se guardan por usuario y filtran las notificaciones que ves en la plataforma.',
    steps: ['Abre tu Perfil (avatar arriba a la derecha).', 'En “🔔 Notificaciones” activa/desactiva cada tipo por canal.'],
  },
  {
    id: 'modules', icon: '🧩', title: 'Módulos y suscripción',
    what: 'Los módulos son las funcionalidades disponibles para tu cuenta; tu plan define el consumo y los límites.',
    how: 'Un módulo activo habilita su pestaña. Si uno está inactivo, puedes solicitarlo. La suscripción define tu límite mensual de conversaciones y el estado de la cuenta.',
    steps: ['Configuración → Módulos: revisa qué tienes activo; “Activar” te pone en contacto con el equipo.', 'Configuración → Cuenta / Suscripción: revisa tu plan, consumo y vencimiento.'],
  },
]

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 }
const box = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, width: 'min(760px,96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }
const head = { padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }

export default function HelpCenter({ onClose }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState('inbox')

  const topics = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return TOPICS
    return TOPICS.filter(t => (t.title + ' ' + t.what + ' ' + t.how).toLowerCase().includes(s))
  }, [q])

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={head}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>❓ Centro de Ayuda</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Guía rápida de cada funcionalidad: para qué sirve, cómo funciona y cómo usarla.</div>
          </div>
          <button onClick={onClose} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '12px 18px 0' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Buscar ayuda…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }} />
        </div>

        <div style={{ overflowY: 'auto', padding: '12px 18px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {topics.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13, padding: 16, textAlign: 'center' }}>Sin resultados para “{q}”.</div>}
          {topics.map(t => {
            const isOpen = open === t.id
            return (
              <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 11, overflow: 'hidden', background: 'var(--bg3)' }}>
                <button onClick={() => setOpen(isOpen ? '' : t.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)', textAlign: 'left' }}>
                  <span style={{ fontSize: 18 }}>{t.icon}</span>
                  <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700 }}>{t.title}</span>
                  <span style={{ color: 'var(--text3)', fontSize: 13 }}>{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '4px 16px 16px', borderTop: '1px solid var(--border)' }}>
                    <Block label="¿Para qué sirve?" body={t.what} />
                    <Block label="¿Cómo funciona?" body={t.how} />
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--accent)', marginBottom: 6 }}>Cómo activarlo y usarlo</div>
                      <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {t.steps.map((st, i) => <li key={i} style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{st}</li>)}
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 6 }}>¿Necesitas más ayuda? Escríbenos desde la pestaña <strong>🎧 Soporte</strong>.</div>
        </div>
      </div>
    </div>
  )
}

function Block({ label, body }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>{body}</div>
    </div>
  )
}
