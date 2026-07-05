import { useState, useMemo, useEffect } from 'react'

// Documentación como PÁGINA: índice con buscador + una página DETALLADA por
// cada tema. Contenido estático (sin backend), pensado para clientes nuevos.

const TOPICS = [
  {
    id: 'inbox', icon: '💬', title: 'Bandeja de conversaciones',
    short: 'Lee y responde todos los chats de tus clientes en un solo lugar.',
    what: 'Es el centro donde llegan y se responden todos los chats de tus clientes, sin importar el canal (WhatsApp, Messenger, Instagram o Webchat).',
    how: 'Cada mensaje entrante crea o actualiza una conversación. La IA puede responder automáticamente, o un asesor puede tomar el control. Puedes filtrar por canal, etiquetas, estado y asignación.',
    steps: ['Abre la pestaña “Inbox”.', 'Selecciona una conversación de la lista para leerla.', 'Activa/desactiva la IA con el interruptor del encabezado para responder tú mismo.', 'Escribe en “Respuesta manual” y envía; adjunta imágenes, audios o documentos con los botones del lado.', 'Usa el panel lateral (⊞) para ver datos del cliente, etiquetas y agendar una cita.'],
    tips: ['Puedes cambiar la apariencia de cada chat desde el menú ⋯ → Apariencia (incluye un tema personalizado con tu foto y colores).', 'Al pasar 24 h sin respuesta del cliente en WhatsApp, solo puedes re-enganchar con una plantilla o un flujo.'],
  },
  {
    id: 'zonaia', icon: '🧠', title: 'Zona IA (el agente)',
    short: 'Define el “cerebro” del agente: prompt, herramientas y variables.',
    what: 'Donde defines el “cerebro” del agente: su prompt (personalidad e instrucciones), las herramientas que puede usar y las variables.',
    how: 'El prompt activo guía cómo responde la IA. Las herramientas le dan capacidades (agendar, cobrar, consultar tienda/catálogo). Las variables guardan datos de la conversación.',
    steps: ['Entra a “Zona IA”.', 'Edita el prompt o usa el Agente de Cambios para modificarlo en lenguaje natural.', 'Activa el prompt que quieras usar (puedes tener varias versiones).', 'Asigna herramientas al agente según lo que necesites que haga.'],
    tips: ['El “🧠 Optimizador” analiza tus conversaciones reales y te sugiere mejoras al prompt con ejemplos.', 'El Agente de Cambios muestra el diff antes de aplicar y guarda versión en el historial.'],
  },
  {
    id: 'channels', icon: '📡', title: 'Canales',
    short: 'Conecta WhatsApp, Messenger, Instagram y Webchat.',
    what: 'Son las vías por las que tus clientes te escriben. Aquí los conectas.',
    how: 'WhatsApp se conecta con 1 clic (Embedded Signup). Messenger e Instagram con “Conectar en 3 pasos” (inicias sesión con Facebook, marcas tu Página y autorizas). Webchat genera un enlace/widget público.',
    steps: ['Ve a Configuración → Canales.', 'Elige el canal y pulsa conectar (1 clic) o usa la configuración manual.', 'Para Messenger/Instagram: inicia sesión con Facebook y MARCA tu Página antes de continuar.', 'Verifica que el estado quede “Conectado”.'],
    tips: ['El Webchat se puede incrustar en tu sitio o compartir como enlace directo.'],
  },
  {
    id: 'flows', icon: '🔀', title: 'Flujos (automatizaciones)',
    short: 'Secuencias automáticas que responden, piden datos y usan la IA.',
    what: 'Secuencias automáticas que responden, piden datos, llaman APIs, derivan a un humano o usan la IA: tu lógica conversacional sin programar.',
    how: 'Un flujo se compone de nodos conectados (mensaje, condición, IA, CRM, agenda, etc.) con un disparador (inicio de conversación, palabra clave, manual o herramienta IA).',
    steps: ['Entra a “Flujos” → “Nuevo flujo”.', 'Arrastra nodos y conéctalos (la salida de éxito lleva al siguiente).', 'O usa “✨ Diseñar con IA”: describe lo que quieres y la IA arma el flujo por ti.', 'Define el disparador y guarda.'],
    tips: ['El diseñador con IA también funciona dentro de un flujo abierto para modificarlo sin empezar de cero.'],
  },
  {
    id: 'crm', icon: '🗂', title: 'CRM y Pipeline',
    short: 'Gestiona contactos y mueve oportunidades por etapas.',
    what: 'Gestiona tus contactos y mueve oportunidades por etapas (embudos de venta).',
    how: 'Cada conversación puede vincularse a un contacto y a una tarjeta del pipeline. Mueves las tarjetas entre etapas para seguir el avance comercial.',
    steps: ['Abre “CRM”.', 'Crea o edita pipelines y sus etapas.', 'Arrastra las tarjetas entre etapas según avance la venta.', 'Filtra y etiqueta contactos para segmentarlos.'],
    tips: [],
  },
  {
    id: 'campaigns', icon: '📣', title: 'Campañas (masivos)',
    short: 'Envía un mensaje a muchos contactos a la vez.',
    what: 'Envía un mensaje a muchos contactos a la vez (promociones, avisos, recordatorios).',
    how: 'Eliges la audiencia (por etiqueta/segmento) y el contenido; el envío se hace por el canal correspondiente respetando sus reglas (p. ej. plantillas de WhatsApp).',
    steps: ['Ve a “Masivos”.', 'Define la audiencia y el mensaje (o plantilla de WhatsApp).', 'Revisa el conteo de destinatarios y envía o programa.'],
    tips: [],
  },
  {
    id: 'calendars', icon: '🗓', title: 'Calendarios y agendamiento',
    short: 'Toma reservas/citas según tu disponibilidad.',
    what: 'Permite tomar reservas/citas: la IA o un asesor agenda según tu disponibilidad.',
    how: 'Defines horarios, duración y un formulario. Se genera un enlace público de reservas, y también puedes agendar manualmente desde el chat con el mismo calendario visual.',
    steps: ['Configuración → Calendarios → crea un calendario y define disponibilidad.', 'Comparte el enlace público o deja que la IA lo envíe en el flujo.', 'Para agendar tú: en el chat usa “📅 Cita” y elige día/hora en la cuadrícula.'],
    tips: ['Con Google Calendar conectado, las cancelaciones externas se reflejan en tiempo real (webhook).'],
  },
  {
    id: 'catalog', icon: '🛍', title: 'Catálogo de Meta',
    short: 'Conecta tu catálogo de productos de Meta.',
    what: 'Conecta el catálogo de productos de tu cuenta de Meta (Commerce) y lee su contenido en la plataforma.',
    how: 'Reutiliza el token de tu WhatsApp conectado para detectar catálogos; también puedes pegar el Catalog ID manualmente. Luego lista los productos (nombre, precio, stock, imagen).',
    steps: ['Configuración → Catálogo Meta.', 'Pulsa “Detectar catálogos” (necesitas WhatsApp conectado) o usa la conexión manual.', 'Conecta el catálogo y revisa sus productos.'],
    tips: [],
  },
  {
    id: 'knowledge', icon: '📚', title: 'Conocimiento (RAG)',
    short: 'Base de conocimiento que el agente consulta para responder.',
    what: 'Base de conocimiento que el agente consulta para responder con información de tu negocio (precios, políticas, FAQs).',
    how: 'Subes documentos o notas; se trocean y se convierten en “fragmentos” que la IA recupera según la pregunta del cliente.',
    steps: ['Sube tus documentos/notas a la base de conocimiento.', 'Asígnala al prompt del agente.', 'Haz preguntas de prueba para verificar que responde con tus datos.'],
    tips: [],
  },
  {
    id: 'metrics', icon: '📊', title: 'Métricas',
    short: 'Analítica de uso, consumo y desempeño del agente.',
    what: 'Analítica de uso: conversaciones, consumo y desempeño del agente.',
    how: 'Agrega los datos de tus conversaciones y consumo para que veas tendencias y el estado de tu cuenta.',
    steps: ['Abre “Métricas”.', 'Revisa conversaciones por canal, consumo y evolución.'],
    tips: [],
  },
  {
    id: 'team', icon: '👥', title: 'Equipo, roles y chat interno',
    short: 'Administra miembros, permisos y comunícate internamente.',
    what: 'Administra a los miembros de tu cuenta, sus permisos, y comunícate internamente.',
    how: 'Cada miembro tiene un rol con permisos (qué pestañas ve). El “Chat de equipo” permite canales y mensajes directos entre el equipo.',
    steps: ['Configuración → Equipo: crea asesores y asígnales un rol.', 'Crea roles con los permisos que quieras.', 'Usa la pestaña “Equipo” para chatear internamente.'],
    tips: [],
  },
  {
    id: 'recontact', icon: '🔁', title: 'Recontactos inteligentes',
    short: 'Re-engancha conversaciones que el cliente dejó sin responder.',
    what: 'Una secuencia de recontactos para conversaciones abandonadas por el cliente, con tiempos y tope por conversación.',
    how: 'Cada paso espera su tiempo desde la última actividad y, por defecto, dispara tu Flujo de entrada principal (que puede enviar una plantilla). También hay modo IA. Aplica a todos los canales.',
    steps: ['Zona IA → 🔁 Recontactos.', 'Define la secuencia de pasos (tiempo + acción) y el máximo por conversación.', 'Usa “Probar ahora” para verificar el envío y “Diagnóstico” para ver por qué se recontacta o no.'],
    tips: ['En WhatsApp, tras 24 h solo entrega una plantilla: por eso el modo por defecto dispara un flujo.'],
  },
  {
    id: 'profile', icon: '👤', title: 'Tu perfil',
    short: 'Edita tu nombre, foto, correo, contraseña y preferencias.',
    what: 'Tu página personal para gestionar tu cuenta de usuario y preferencias.',
    how: 'Cambias tus datos y seguridad; eliges tema de la plataforma, idioma, el cursor AVI y tus notificaciones.',
    steps: ['Abre tu avatar (abajo a la izquierda) → Mi perfil.', 'Sube tu foto o pega una URL; edita nombre y correo.', 'Cambia tu contraseña (pide la actual).', 'Ajusta tema, idioma, cursor y notificaciones.'],
    tips: [],
  },
]

export default function DocsPage({ onClose, initialTopic }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(initialTopic || null)

  useEffect(() => { if (sel) window.scrollTo?.(0, 0) }, [sel])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return TOPICS
    return TOPICS.filter(t => (t.title + ' ' + t.short + ' ' + t.what + ' ' + t.how).toLowerCase().includes(s))
  }, [q])

  const topic = sel ? TOPICS.find(t => t.id === sel) : null
  const idx = topic ? TOPICS.findIndex(t => t.id === topic.id) : -1
  const prev = idx > 0 ? TOPICS[idx - 1] : null
  const next = idx >= 0 && idx < TOPICS.length - 1 ? TOPICS[idx + 1] : null

  const page = { position: 'fixed', inset: 0, zIndex: 900, background: 'var(--ambience,transparent), var(--bg)', backgroundAttachment: 'fixed', overflowY: 'auto' }
  const bar = { position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'var(--glass-chrome,var(--bg2))', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)' }
  const wrap = { maxWidth: 820, margin: '0 auto', padding: '22px 20px 60px' }
  const ghost = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: 12.5 }
  const card = { background: 'var(--glass-card,var(--bg2))', border: '1px solid var(--border2)', borderRadius: 14, padding: 18 }

  return (
    <div style={page}>
      <div style={bar}>
        {topic
          ? <button style={ghost} onClick={() => setSel(null)}>← Documentación</button>
          : <button style={ghost} onClick={onClose}>← Volver</button>}
        <strong style={{ fontSize: 16, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{topic ? topic.title : '📖 Documentación'}</strong>
        <button style={{ ...ghost, marginLeft: 'auto' }} onClick={onClose}>✕</button>
      </div>

      {/* ── Índice ── */}
      {!topic && (
        <div style={wrap}>
          <p style={{ fontSize: 13.5, color: 'var(--text2)', margin: '0 0 16px' }}>
            Guía de cada funcionalidad de la plataforma. Toca un tema para abrir su página detallada.
          </p>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Buscar en la documentación…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, marginBottom: 16, fontSize: 14 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 12 }}>
            {list.map(t => (
              <button key={t.id} onClick={() => setSel(t.id)}
                style={{ ...card, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 24 }}>{t.icon}</span>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{t.title}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>{t.short}</span>
                <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>Ver más →</span>
              </button>
            ))}
            {list.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13, padding: 16 }}>Sin resultados para “{q}”.</div>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 20 }}>
            ¿Necesitas más ayuda? Escríbenos desde la pestaña <strong>🎧 Soporte</strong>.
          </div>
        </div>
      )}

      {/* ── Página detallada del tema ── */}
      {topic && (
        <div style={wrap}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
            <span style={{ fontSize: 44 }}>{topic.icon}</span>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, color: 'var(--text)' }}>{topic.title}</h1>
              <div style={{ fontSize: 14, color: 'var(--text2)' }}>{topic.short}</div>
            </div>
          </div>

          <Section title="¿Para qué sirve?" body={topic.what} />
          <Section title="¿Cómo funciona?" body={topic.how} />

          <div style={{ ...card, marginTop: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--accent)', marginBottom: 10 }}>Cómo activarlo y usarlo</div>
            <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topic.steps.map((st, i) => <li key={i} style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.55 }}>{st}</li>)}
            </ol>
          </div>

          {topic.tips?.length > 0 && (
            <div style={{ ...card, marginTop: 14, background: 'var(--accent-dim)', borderColor: 'var(--accent-glow)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--accent)', marginBottom: 8 }}>💡 Consejos</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {topic.tips.map((tp, i) => <li key={i} style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.5 }}>{tp}</li>)}
              </ul>
            </div>
          )}

          {/* Navegación anterior / siguiente */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 20 }}>
            {prev ? <button style={{ ...ghost, textAlign: 'left' }} onClick={() => setSel(prev.id)}>← {prev.icon} {prev.title}</button> : <span />}
            {next ? <button style={{ ...ghost, textAlign: 'right' }} onClick={() => setSel(next.id)}>{next.icon} {next.title} →</button> : <span />}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, body }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 14.5, color: 'var(--text)', lineHeight: 1.6 }}>{body}</div>
    </div>
  )
}
