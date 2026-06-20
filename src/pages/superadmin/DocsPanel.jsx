import { useState, useRef, useCallback, useEffect } from 'react'
import s from './DocsPanel.module.css'

const NODE_W = 166, NODE_H = 72
const CAT = {
  external:{ label:'Externo',       color:'#f5a623' },
  ai:      { label:'IA',            color:'#22d98a' },
  frontend:{ label:'Frontend',      color:'#4fa8ff' },
  core:    { label:'Motor',         color:'#c179ff' },
  backend: { label:'Backend',       color:'#ff6b6b' },
  database:{ label:'Base de datos', color:'#7c6fff' },
}

const NODES = [
  { id:'whatsapp',  x:50,  y:50,  label:'WhatsApp',         icon:'📱', cat:'external',
    tech:'WhatsApp Business API (Meta)',
    desc:'El usuario escribe por WhatsApp, el webhook POST llega al backend, este lo reenvía por SSE al browser del admin, y webhookHandler.js crea la conversación y ejecuta el flujo de entrada del agente.',
    files:['frontend/src/lib/whatsappService.js','frontend/src/lib/webhookHandler.js','backend/routes/webhooks.routes.js'] },
  { id:'messenger', x:240, y:50,  label:'Messenger',        icon:'💬', cat:'external',
    tech:'Meta Messenger Platform',
    desc:'Canal Facebook Messenger. Flujo idéntico al de WhatsApp. Responde con sendMessengerText().',
    files:['frontend/src/lib/messengerService.js'] },
  { id:'instagram', x:430, y:50,  label:'Instagram DM',     icon:'📸', cat:'external',
    tech:'Instagram Graph API (Meta)',
    desc:'Canal Instagram Direct. Requiere pageAccessToken e igAccountId en la config del canal.',
    files:['frontend/src/lib/instagramService.js'] },
  { id:'openai',    x:660, y:50,  label:'OpenAI',           icon:'🟢', cat:'ai',
    tech:'OpenAI API — fetch directo desde el browser (CORS habilitado)',
    desc:'Modelos GPT-4o, GPT-4.1, GPT-5, o3-mini, o4-mini. La key viene de la cuenta o del fallback de plataforma.',
    files:['frontend/src/lib/aiClient.js'] },
  { id:'deepseek',  x:850, y:50,  label:'DeepSeek',         icon:'🔵', cat:'ai',
    tech:'DeepSeek API — compatible con interfaz OpenAI',
    desc:'Alternativa económica. Misma rama de código que OpenAI. Se detecta por prefijo "deepseek-" en el nombre del modelo.',
    files:['frontend/src/lib/aiClient.js'] },
  { id:'anthropic', x:1040,y:50,  label:'Claude',           icon:'🟣', cat:'ai',
    tech:'Anthropic API — formato propio, NO compatible con OpenAI',
    desc:'Claude Sonnet/Haiku/Opus. Rama separada en aiClient.js. Requiere header anthropic-dangerous-direct-browser-access para CORS.',
    files:['frontend/src/lib/aiClient.js'] },
  { id:'webchat',   x:50,  y:248, label:'Webchat Widget',   icon:'🌐', cat:'frontend',
    tech:'React 18 + Vite — embebido via URL pública',
    desc:'Widget del usuario final. Si hay flujo de entrada ejecuta executeFlow, si no runTrigger("keyword"). La IA NUNCA se invoca directamente.',
    files:['frontend/src/pages/webchat/WebchatPage.jsx'] },
  { id:'admin',     x:310, y:248, label:'Admin Shell',      icon:'🖥', cat:'frontend',
    tech:'React 18 SPA por cuenta (JWT)',
    desc:'Panel del owner. Tabs: Inbox, Flujos, Prompts, Herramientas IA, Canales, Variables, Miembros, CRM, Soporte, Team Chat. Estado global via AccountContext con optimistic updates.',
    files:['frontend/src/pages/admin/AdminShell.jsx','frontend/src/context/AccountContext.jsx'] },
  { id:'superadmin',x:590, y:248, label:'Super Admin',      icon:'👑', cat:'frontend',
    tech:'React 18 SPA superadmin separada',
    desc:'Gestiona cuentas, usuarios, config global, keys IA de plataforma, pricing, generador de prompts, soporte, tutoriales y documentación.',
    files:['frontend/src/pages/superadmin/SuperAdminShell.jsx'] },
  { id:'floweditor',x:860, y:248, label:'Editor de Flujos', icon:'🔀', cat:'frontend',
    tech:'React + SVG custom (sin librería externa)',
    desc:'Editor drag-and-drop. DynamicNodeForm renderiza campos con showIf condicional. VarAutocomplete aparece al escribir {. Los flujos se guardan como JSON en la tabla flows.',
    files:['frontend/src/components/flows/FlowEditorView.jsx','frontend/src/components/flows/DynamicNodeForm.jsx'] },
  { id:'context',   x:1130,y:248, label:'AccountContext',   icon:'🔄', cat:'frontend',
    tech:'React Context API + optimistic updates',
    desc:'Estado global del admin. Carga la cuenta completa desde la API. Mutaciones optimistas: actualiza local ANTES de la API, revierte si falla.',
    files:['frontend/src/context/AccountContext.jsx'] },
  { id:'flowengine',x:50,  y:460, label:'Flow Engine',      icon:'⚙️', cat:'core',
    tech:'JavaScript puro — corre enteramente en el browser',
    desc:'Motor de flujos. executeFlow construye buildVarContext (localVars persistidas tienen prioridad sobre defaults) y corre runNode en cadena. ctx._suppressDefaultNext=true detiene el flujo (Agente IA con herramienta activada).',
    files:['frontend/src/lib/flowEngine.js','frontend/src/lib/flowNodes/index.js','frontend/src/lib/flowNodes/categories/ai.js'] },
  { id:'webhookh',  x:360, y:460, label:'Webhook Handler',  icon:'📡', cat:'core',
    tech:'JavaScript en browser — recibe SSE del backend',
    desc:'Procesa eventos de Meta llegados por SSE. Crea conversaciones, guarda _lastUserMessage en local_vars y ejecuta el flujo de entrada. NUNCA invoca IA directamente.',
    files:['frontend/src/lib/webhookHandler.js'] },
  { id:'socket',    x:660, y:460, label:'Socket.io',        icon:'⚡', cat:'core',
    tech:'Socket.io 4 — WebSocket con fallback long-polling',
    desc:'Tiempo real bidireccional. Rooms: acc:{accId} para admins, conv:{convId} para webchat del usuario, mem:{memberId} para DMs entre miembros.',
    files:['backend/services/socket.js','frontend/src/lib/api.js'] },
  { id:'auth',      x:980, y:460, label:'JWT Auth',         icon:'🔐', cat:'core',
    tech:'jsonwebtoken — HS256, expiración 7 días',
    desc:'sign() siempre elimina exp/iat/nbf del payload antes de firmar para evitar el error "already has exp". authMiddleware valida en cada request. Roles: superadmin, owner y member.',
    files:['backend/auth.js'] },
  { id:'aiclient',  x:1240,y:460, label:'AI Client',        icon:'🤖', cat:'core',
    tech:'fetch nativo del browser — CORS directo a cada proveedor',
    desc:'Cliente unificado para OpenAI, DeepSeek y Anthropic. Nodo Agente IA usa UNA sola ronda: si el modelo invoca una herramienta el flujo SE DETIENE sin generar texto de respuesta.',
    files:['frontend/src/lib/aiClient.js','frontend/src/lib/flowNodes/categories/ai.js'] },
  { id:'express',   x:360, y:668, label:'Express API',      icon:'🚀', cat:'backend',
    tech:'Node.js 18 + Express 4 + mysql2/promise pool',
    desc:'Servidor HTTP REST. routes define paths, authMiddleware valida, controllers tienen la lógica, pool.query accede a MySQL. Socket.io corre sobre el mismo http.Server.',
    files:['backend/index.js'] },
  { id:'sse',       x:740, y:668, label:'SSE/Webhooks',     icon:'📨', cat:'backend',
    tech:'Server-Sent Events + Express route',
    desc:'Meta envía POST a api/webhooks/. El backend valida la firma HMAC y reenvía por SSE al browser del admin conectado. Requiere URL pública (ngrok en dev, dominio en prod).',
    files:['backend/routes/webhooks.routes.js'] },
  { id:'mysql',     x:560, y:876, label:'MySQL 8',          icon:'🗄', cat:'database',
    tech:'MySQL 8 + mysql2/promise connection pool',
    desc:'Tablas: accounts, agents (prompts/channels/rag JSON), conversations (local_vars JSON), messages, flows (nodes JSON), variables, ai_tools, media (base64 LONGTEXT), api_keys, tutorials. Migraciones automáticas al arrancar.',
    files:['backend/db.js','backend/schema.sql','backend/index.js'] },
]

const EDGES = [
  {from:'whatsapp',to:'webhookh'},{from:'messenger',to:'webhookh'},{from:'instagram',to:'webhookh'},
  {from:'openai',to:'aiclient'},{from:'deepseek',to:'aiclient'},{from:'anthropic',to:'aiclient'},
  {from:'webchat',to:'express'},{from:'webchat',to:'socket'},{from:'webchat',to:'flowengine'},
  {from:'admin',to:'express'},{from:'admin',to:'socket'},
  {from:'superadmin',to:'express'},{from:'superadmin',to:'socket'},
  {from:'floweditor',to:'express'},{from:'floweditor',to:'flowengine',dashed:true},
  {from:'context',to:'express'},
  {from:'flowengine',to:'aiclient'},{from:'flowengine',to:'express'},
  {from:'webhookh',to:'flowengine'},{from:'webhookh',to:'express'},
  {from:'socket',to:'express'},{from:'auth',to:'express'},
  {from:'express',to:'mysql'},{from:'express',to:'socket'},
  {from:'sse',to:'webhookh'},{from:'sse',to:'express'},
]

const DOCS = [
  { id:'vision', title:'Vision General', body:'## Que es AVI Platform\n\nPlataforma de chatbot y CRM conversacional multi-canal. Permite a empresas conectar WhatsApp, Messenger, Instagram y Webchat a agentes IA con flujos visuales, prompts personalizados y herramientas de automatizacion.\n\n## Actores principales\n\n- Superadmin: administra toda la plataforma (cuentas, config global, keys IA, generador de prompts, soporte, tutoriales)\n- Owner de cuenta: gestiona su agente IA, flujos, prompts, canales, equipo y CRM\n- Miembro: atiende conversaciones en el Inbox\n- Usuario final: el cliente que escribe por WhatsApp o webchat\n\n## Stack tecnologico\n\n- Frontend: React 18 + Vite + CSS Modules\n- Backend: Node.js 18 + Express 4\n- Base de datos: MySQL 8 + mysql2/promise\n- Tiempo real: Socket.io 4\n- IA: OpenAI, DeepSeek, Anthropic (fetch directo desde browser)\n- Auth: JWT HS256 (jsonwebtoken)' },
  { id:'arq', title:'Arquitectura', body:'## Capas del sistema\n\nCanales externos envian webhooks POST al backend. El backend los valida y reenvía por SSE al browser del admin. El browser procesa el evento con webhookHandler que invoca el Flow Engine. El mismo backend expone API REST que el frontend consume con JWT.\n\n## Comunicacion\n\n- REST API: frontend llama con JWT en Authorization Bearer\n- Socket.io: backend emite a rooms (acc:, conv:, mem:)\n- SSE: canal unidireccional backend hacia browser para reenviar webhooks de Meta en tiempo real\n- IA directa: los 3 proveedores se llaman DESDE EL BROWSER con fetch. Las keys API van en los headers de cada request.\n\n## Estructura de carpetas\n\nfrontend/src/lib: flowEngine, aiClient, storage, api, webhookHandler\nfrontend/src/components: componentes reutilizables\nfrontend/src/pages: admin, superadmin, webchat, invite\nfrontend/src/context: AccountContext, AuthContext\nbackend/controllers: logica de negocio\nbackend/routes: definicion de endpoints\nbackend/services: socket.js\nbackend/index.js: servidor + migraciones automaticas' },
  { id:'engine', title:'Flow Engine', body:'## executeFlow()\n\nRecibe flowId, accId, agId, convId, triggerContext, outbound.\n\n1. Carga cuenta via GET api/public/accounts/:accId\n2. Busca el flujo por flowId en account.flows\n3. buildVarContext: localVars persistidas tienen PRIORIDAD sobre defaults del account\n4. runNode(flow.startNodeId, ctx) en cadena\n5. Guarda traza en flowLocalStorage\n\n## runNode()\n\n- Error: sigue por connections.error\n- OK: sigue por connections.success\n- ctx._nextOverride: salta a ese nodo (lo usan nodos if/switch)\n- ctx._suppressDefaultNext = true: flujo SE DETIENE\n- ctx.awaitInput: flujo PAUSADO hasta proximo mensaje del usuario\n\n## setVarBoth()\n\nGuarda la variable bajo su ID Y su nombre para que {{nombre}} y {{id}} resuelvan igual. Llama setLocalVar() para persistir en DB bajo el canonicalId.\n\n## interpolate()\n\nReemplaza {{nombre_variable}} usando ctx.variables. Si no existe, deja el placeholder literal.' },
  { id:'nodos', title:'Modulos de Flujo', body:'## Mensajeria\n\n### Mensaje\nEnvia texto al usuario. Soporta {{variables}}. Primer nodo tipico del flujo.\n\n### Botones\nMensaje con opciones de boton. Cada boton es un output del nodo.\n\n### Lista\nIgual que botones pero en formato lista desplegable.\n\n## Logica\n\n### Condicion (if)\nEvalua expresion y va por output true o false.\n\n### Switch\nCompara variable contra N valores y va por el output del caso coincidente.\n\n### Loop\nRepite un bloque N veces o mientras condicion sea verdadera.\n\n### Delay\nPausa N segundos antes de continuar.\n\n## IA\n\n### Agente IA\nModos: Inline (prompt/modelo en el nodo), Prompt activo del agente, Elegir de la lista.\nMemoria: historial real de los ultimos 16 turnos.\nHerramientas IA: si el modelo invoca una el flujo SE DETIENE sin texto de respuesta.\nGuardar respuesta en: variable via setVarBoth.\n\n### Chat IA\nVersion simple sin herramientas ni historial expandido.\n\n### Clasificador de Intencion\nClasifica en intents definidas. Guarda en _last_intent y _last_intent_confidence.\n\n### Extractor de Entidades\nExtrae nombre, email, telefono, fecha, ciudad del texto del usuario.\n\n### Analizador de Sentimiento\nDevuelve positive/neutral/negative + score en _last_sentiment.\n\n### Resumidor\nResume texto en formato breve, mediano o detallado.\n\n### Reescritor\nReescribe con tono: formal, informal, persuasivo, empatico, breve.\n\n### Router IA\nElige una ruta de N opciones segun el mensaje. Guarda en _last_route.\n\n## Humano\n\n### Asignar Conversacion\nAsigna a un miembro. Emite notificacion conv:assigned via socket.\n\n### Esperar Input\nPausa el flujo hasta el proximo mensaje del usuario.\n\n## Integraciones\n\n### HTTP Request\nLlama cualquier API externa GET/POST/PUT/DELETE.\n\n### Guardar en CRM\nCrea o actualiza contacto, nota o tarea.' },
  { id:'auth', title:'Autenticacion', body:'## JWT\n\nHeader requerido: Authorization: Bearer token\n\nsign() usa HS256, expira en 7 dias. sign() SIEMPRE elimina exp/iat/nbf del payload antes de firmar para evitar el error "payload already has an exp property".\n\n## Roles\n\n- superadmin: Todo. Puede impersonar cualquier cuenta.\n- owner: Su cuenta completa.\n- member: Solo agentes en su agentAccess[].\n\n## authMiddleware\n\nValida el token JWT y popula req.user. Sin token o invalido responde 401.\n\n## Cambio de cuenta\n\nswitchAccount(accId) genera nuevo token via POST a auth/switch. El backend re-firma sin consultar DB.' },
  { id:'canales', title:'Canales', body:'## Tipos de canal\n\n- webchat: Widget embebido. URL publica. Soporta media.\n- test: Pruebas. Acepta ?mode=test para usar testFlowId en vez de fallbackFlowId.\n- whatsapp: Requiere phoneNumberId + accessToken de Meta.\n- messenger: Requiere pageId + pageAccessToken de Meta.\n- instagram: Requiere igAccountId + pageAccessToken de Meta.\n\n## Flujo de entrada\n\nSiempre se ejecuta el fallbackFlowId configurado en el agente. Si no hay flujo, se disparan flujos legacy por trigger:keyword. La IA NUNCA se invoca directamente desde el handler de mensajes.\n\n## Canal de pruebas\n\n- URL con ?mode=test usa agent.testFlowId (o fallbackFlowId si no hay testFlowId)\n- URL sin parametro o con ?mode=main usa agent.fallbackFlowId' },
  { id:'crm', title:'CRM', body:'## Pipeline (Kanban)\n\nStages configurables por el owner. Cards con titulo, valor, contacto asociado, assignee, etiquetas. Drag and drop entre stages.\nTabla: pipelines (JSON columns: stages, cards)\n\n## Contactos\n\nCRUD con nombre, email, telefono, campos extra (JSON).\nTabla: contacts\n\n## Tareas\n\nTitulo, descripcion, due_at, prioridad, assignee, estado.\nTabla: crm_tasks\n\n## Notas\n\nNotas libres sobre contactos o deals.\nTabla: crm_notes\n\n## Actividad\n\nLog automatico de acciones.\nTabla: crm_activity' },
  { id:'realtime', title:'Tiempo Real', body:'## Rooms de Socket.io\n\n- acc:{accId}: todos los admins de la cuenta. Reciben mensajes nuevos, soporte, asignaciones.\n- conv:{convId}: widget del usuario final. Recibe respuestas del bot o asesor.\n- mem:{memberId}: un miembro especifico. Recibe DMs y notificaciones de asignacion.\n\n## Eventos principales\n\n- message:new: emitido a acc:{accId} y conv:{convId}\n- conv:updated: emitido a acc:{accId}\n- conv:assigned: emitido a mem:{assigneeId}\n- support:updated: broadcast\n- account:updated: emitido a acc:{accId}\n- teamchat:message: emitido a acc:{accId}\n\n## API del socket (backend/services/socket.js)\n\n- socket.emit(accId, event, data): emite a acc:{accId}\n- socket.emitToMember(memberId, event, data): emite a mem:{memberId}\n- socket.emitRaw(room, event, data): cualquier room' },
  { id:'api', title:'API Publica y Herramientas IA', body:'## API publica (entrante)\n\nLas cuentas generan API keys para que sistemas externos (Zapier, Make, integraciones propias) llamen a la API REST de AVI.\nLas keys se envian en el header X-AVI-Key.\nCada key tiene scopes (messages:send, contacts:write, etc).\nTabla: api_keys (key_hash sha256, prefix visible)\n\n## Herramientas IA (function calling)\n\n1. Se crean en pestana "Herramientas IA"\n2. Se asignan POR PROMPT (seccion dentro de cada prompt en edicion)\n3. El nodo Agente IA las pasa al modelo como function definitions\n4. actionType: variable (guarda datos), flow (ejecuta un flujo) o cms_resource (envia recursos)\n5. Si el modelo invoca una: se ejecuta y el flujo continua con el resultado en contexto' },
  { id:'db', title:'Base de Datos', body:'## Tablas principales\n\n- accounts: una por empresa cliente\n- agents: JSON: prompts, channels, rag, ai_tool_ids\n- conversations: JSON: local_vars, labels, pipeline_cards, assigned_to, debug_log\n- messages: JSON: metadata\n- flows: JSON: nodes\n- ai_tools: JSON: collect_fields\n- pipelines: JSON: stages, cards\n- contacts: JSON: extra\n- api_keys: JSON: scopes\n- media: data_base64 LONGTEXT (base64)\n- tutorials, variables, members, roles, labels\n\n## Migraciones automaticas\n\nAl iniciar el backend (index.js), un array de SQLs se ejecuta en orden:\n- ALTER TABLE ... ADD COLUMN: ignora el error "duplicate column"\n- CREATE TABLE IF NOT EXISTS: idempotente\n\nPara agregar columna nueva: anadir al array migrations y reiniciar el backend.' },
  { id:'seguridad', title:'Seguridad', body:'## Hallazgos criticos (pendientes de remediar)\n\n- C1: JWT secret hardcodeado. Cambiar JWT_SECRET en .env de produccion.\n- C2: Contrasenas en texto plano. bcryptjs instalado pero sin usar.\n- C3: IDOR parcial. authMiddleware no siempre verifica account_id del recurso.\n\n## Hallazgos altos\n\n- A1: SSRF en nodo HTTP Request (url sin validar)\n- A2: CORS abierto (origin en asterisco en Express y Socket.io)\n- A3: Media sin auth, IDs debiles (Math.random), SVG inline XSS\n- A4: Sin rate limiting en login\n\n## Hallazgos medios\n\n- JWT sin revocacion (7 dias fijos, sin blacklist)\n- Secretos en texto plano en DB\n- Uploads base64 pueden causar DoS\n\n## Buenas practicas implementadas\n\n- sign() elimina exp/iat/nbf antes de re-firmar\n- authMiddleware en todas las rutas sensibles\n- Roles separados: superadmin, owner, member\n- dotenv con path absoluto' },
]

function nodeCenter(n) { return { x: n.x + NODE_W/2, y: n.y + NODE_H/2 } }
function bezier(x1,y1,x2,y2) {
  const dy=Math.abs(y2-y1)*0.45, dx=Math.abs(x2-x1)*0.25
  return 'M'+x1+' '+y1+' C'+(x1+dx)+' '+(y1+dy)+' '+(x2-dx)+' '+(y2-dy)+' '+x2+' '+y2
}

function VisualMap() {
  const ref = useRef(null)
  const [pan,setPan] = useState({x:20,y:20})
  const [scale,setScale] = useState(0.66)
  const [drag,setDrag] = useState(false)
  const [ds,setDs] = useState({x:0,y:0})
  const [sel,setSel] = useState(null)
  const onDown = useCallback(e=>{ if(e.button!==0)return; setDrag(true); setDs({x:e.clientX-pan.x,y:e.clientY-pan.y}) },[pan])
  const onMove = useCallback(e=>{ if(!drag)return; setPan({x:e.clientX-ds.x,y:e.clientY-ds.y}) },[drag,ds])
  const onUp   = useCallback(()=>setDrag(false),[])
  const onWheel= useCallback(e=>{ e.preventDefault(); setScale(v=>Math.min(1.5,Math.max(0.3,v-e.deltaY*0.001))) },[])
  useEffect(()=>{
    const el=ref.current; if(!el) return
    el.addEventListener('wheel',onWheel,{passive:false})
    return ()=>el.removeEventListener('wheel',onWheel)
  },[onWheel])
  const nm = Object.fromEntries(NODES.map(n=>[n.id,n]))
  const getArrow = e => {
    const f=nm[e.from], t=nm[e.to]; if(!f||!t) return null
    const fc=nodeCenter(f), tc=nodeCenter(t)
    return { d:bezier(fc.x,fc.y,tc.x,tc.y), col:CAT[f.cat]?.color||'#666', cat:f.cat, dashed:e.dashed }
  }
  return (
    <div className={s.mapWrap}>
      <div className={s.mapControls}>
        <button className={s.mapBtn} onClick={()=>{setPan({x:20,y:20});setScale(0.66)}}>⟳ Reset</button>
        <button className={s.mapBtn} onClick={()=>setScale(v=>Math.min(1.5,v+0.1))}>+</button>
        <button className={s.mapBtn} onClick={()=>setScale(v=>Math.max(0.3,v-0.1))}>−</button>
        <span className={s.mapZoom}>{Math.round(scale*100)}%</span>
      </div>
      <div ref={ref} className={s.mapContainer} style={{cursor:drag?'grabbing':'grab'}}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
        <div className={s.mapCanvas} style={{width:1460,height:1010,
          transform:'translate('+pan.x+'px,'+pan.y+'px) scale('+scale+')',transformOrigin:'0 0'}}>
          <svg style={{position:'absolute',top:0,left:0,width:1460,height:1010,pointerEvents:'none'}}>
            <defs>
              {Object.entries(CAT).map(([k,v])=>(
                <marker key={k} id={'ah-'+k} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill={v.color}/>
                </marker>
              ))}
            </defs>
            {EDGES.map((e,i)=>{ const p=getArrow(e); if(!p) return null
              return <path key={i} d={p.d} fill="none" stroke={p.col} strokeWidth={1.4} strokeOpacity={0.45}
                strokeDasharray={p.dashed?'5 3':undefined} markerEnd={'url(#ah-'+p.cat+')'}/>
            })}
          </svg>
          {NODES.map(n=>{ const cfg=CAT[n.cat]; const isSel=sel?.id===n.id
            return (
              <div key={n.id} className={s.mapNode+(isSel?' '+s.mapNodeSelected:'')}
                style={{left:n.x,top:n.y,width:NODE_W,height:NODE_H,
                  borderColor:isSel?cfg.color:cfg.color+'55',
                  boxShadow:isSel?'0 0 0 2px '+cfg.color:undefined}}
                onMouseDown={e=>e.stopPropagation()} onClick={()=>setSel(isSel?null:n)}>
                <div className={s.mapNodeIcon}>{n.icon}</div>
                <div className={s.mapNodeLabel}>{n.label}</div>
                <div className={s.mapNodeCat} style={{background:cfg.color+'22',color:cfg.color}}>{cfg.label}</div>
              </div>)
          })}
        </div>
      </div>
      {sel && (
        <div className={s.mapDetail}>
          <div className={s.mapDetailHeader}>
            <span className={s.mapDetailIcon}>{sel.icon}</span>
            <div style={{flex:1}}>
              <div className={s.mapDetailTitle}>{sel.label}</div>
              <div className={s.mapDetailCat} style={{color:CAT[sel.cat]?.color}}>{CAT[sel.cat]?.label}</div>
            </div>
            <button className={s.mapDetailClose} onClick={()=>setSel(null)}>✕</button>
          </div>
          <div className={s.mapDetailTech}>
            <div className={s.mapDetailTechLabel}>Tecnologia</div>
            <code>{sel.tech}</code>
          </div>
          <p className={s.mapDetailDesc}>{sel.desc}</p>
          {sel.files?.length>0 && (
            <div className={s.mapDetailFiles}>
              <div className={s.mapDetailTechLabel}>Archivos relevantes</div>
              {sel.files.map((f,i)=><div key={i} className={s.mapDetailFile}>{f}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function inlineFmt(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map((p,i)=>{
    if(p.startsWith('**')&&p.endsWith('**')) return <strong key={i}>{p.slice(2,-2)}</strong>
    return p
  })
}

function renderBody(text) {
  const lines=text.split('\n'); const els=[]
  let inTbl=false, tblBuf=[]
  const flushTable = key => {
    if(!tblBuf.length) return
    const parsed=tblBuf.map(r=>r.split('|').filter(c=>c.trim()).map(c=>c.trim()))
    const hdr=parsed[0]; const body=parsed.slice(2)
    els.push(<table key={key} className={s.docTable}><thead><tr>{hdr.map((h,j)=><th key={j}>{h}</th>)}</tr></thead><tbody>{body.map((row,j)=><tr key={j}>{row.map((c,k)=><td key={k}>{inlineFmt(c)}</td>)}</tr>)}</tbody></table>)
    inTbl=false; tblBuf=[]
  }
  for(let i=0;i<lines.length;i++) {
    const l=lines[i]
    if(l.startsWith('| ')){ if(!inTbl) inTbl=true; tblBuf.push(l); continue }
    if(inTbl&&!l.startsWith('| ')) flushTable('t'+i)
    if(l.startsWith('## ')){els.push(<h2 key={i} className={s.docH2}>{l.slice(3)}</h2>);continue}
    if(l.startsWith('### ')){els.push(<h3 key={i} className={s.docH3}>{l.slice(4)}</h3>);continue}
    if(l.startsWith('- ')){els.push(<li key={i} className={s.docLi}>{inlineFmt(l.slice(2))}</li>);continue}
    if(l.trim()===''){els.push(<div key={i} className={s.docSpacer}/>);continue}
    els.push(<p key={i} className={s.docP}>{inlineFmt(l)}</p>)
  }
  if(inTbl) flushTable('te')
  return els
}

function ClassicDocs() {
  const [active,setActive]=useState(DOCS[0].id)
  const sec=DOCS.find(d=>d.id===active)
  return (
    <div className={s.docsWrap}>
      <aside className={s.docsSidebar}>
        {DOCS.map(d=>(
          <button key={d.id} className={s.docsSideItem+(active===d.id?' '+s.docsSideItemActive:'')}
            onClick={()=>setActive(d.id)}>{d.title}</button>
        ))}
      </aside>
      <div className={s.docsContent}>
        <h1 className={s.docH1}>{sec.title}</h1>
        <div className={s.docBody}>{renderBody(sec.body)}</div>
      </div>
    </div>
  )
}

export default function DocsPanel() {
  const [view,setView]=useState('map')
  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>Documentacion AVI Platform</h2>
          <p className={s.sub}>Arquitectura, modulos, tecnologias y guia de codigo para ingenieros de sistemas.</p>
        </div>
        <div className={s.viewToggle}>
          <button className={s.viewBtn+(view==='map'?' '+s.viewBtnActive:'')} onClick={()=>setView('map')}>🗺 Mapa Visual</button>
          <button className={s.viewBtn+(view==='docs'?' '+s.viewBtnActive:'')} onClick={()=>setView('docs')}>📄 Documentacion</button>
        </div>
      </div>
      {view==='map'  && <VisualMap/>}
      {view==='docs' && <ClassicDocs/>}
    </div>
  )
}
