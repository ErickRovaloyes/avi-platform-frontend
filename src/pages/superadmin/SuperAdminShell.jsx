import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { AviMark } from '../../components/common/AviLogo'
import CursorFX from '../../components/common/CursorFX'
import MediaLightbox from '../../components/media/MediaLightbox'
import SmoothFX from '../../components/common/SmoothFX'
import { DEFAULT_CHANNEL_LIMITS, uid, getModelPricing, updateModelPricing, deleteModelPricing } from '../../lib/storage'
import { detectProvider } from '../../lib/aiClient'
import { api, getSocket } from '../../lib/api'
import { uploadChatMedia } from '../../lib/storage'
import PromptGeneratorPanel from './PromptGeneratorPanel'
import { AccountTypesPanel, PlansPanel, AccountSubscriptionControl, AccountModulesControl, AccountIdentityControl } from './SubscriptionsPanels'
import PrivateChatsPanel from './PrivateChatsPanel'
import SupervisionDashboard from './SupervisionDashboard'
import AntifraudPanel from './AntifraudPanel'
import CommercialDashboard from './CommercialDashboard'
import DemoConfigPanel from './DemoConfigPanel'
import DemoDashboardPanel from './DemoDashboardPanel'
import DocsPanel      from './DocsPanel'
import TutorialsPanel from './TutorialsPanel'
import MediaInput from '../../components/media/MediaInput'
import MediaMessage from '../../components/media/MediaMessage'
import s from './SuperAdminShell.module.css'

// Modelos disponibles para el "Agente de Cambios" y el "Generador de Prompts".
// Cada entrada indica el provider para que el backend escoja la API key correcta.
const AI_MODELS = [
  // OpenAI
  { provider: 'openai',    id: 'gpt-4o-mini',                 label: '🟢 GPT-4o mini' },
  { provider: 'openai',    id: 'gpt-4o',                      label: '🟢 GPT-4o' },
  { provider: 'openai',    id: 'gpt-4.1',                     label: '🟢 GPT-4.1' },
  { provider: 'openai',    id: 'gpt-4.1-mini',                label: '🟢 GPT-4.1 mini' },
  { provider: 'openai',    id: 'gpt-5',                       label: '🟢 GPT-5' },
  { provider: 'openai',    id: 'gpt-5-mini',                  label: '🟢 GPT-5 mini' },
  { provider: 'openai',    id: 'o3-mini',                     label: '🟢 o3-mini (razonamiento)' },
  { provider: 'openai',    id: 'o4-mini',                     label: '🟢 o4-mini (razonamiento)' },
  // DeepSeek
  { provider: 'deepseek',  id: 'deepseek-v4-pro',             label: '🔵 DeepSeek V4 Pro' },
  { provider: 'deepseek',  id: 'deepseek-v4-flash',           label: '🔵 DeepSeek V4 Flash' },
  { provider: 'deepseek',  id: 'deepseek-chat',               label: '🔵 DeepSeek V3.2 (Chat)' },
  { provider: 'deepseek',  id: 'deepseek-reasoner',           label: '🔵 DeepSeek R1 (Reasoner)' },
  // Anthropic
  { provider: 'anthropic', id: 'claude-opus-4-7',             label: '🟣 Claude Opus 4.7' },
  { provider: 'anthropic', id: 'claude-sonnet-4-6',           label: '🟣 Claude Sonnet 4.6' },
  { provider: 'anthropic', id: 'claude-haiku-4-5-20251001',   label: '🟣 Claude Haiku 4.5' },
]
const GPT_MODELS = AI_MODELS.map(m => m.id) // backwards compat
const TOKEN_CATEGORIES = [
  { id: 'basic',   label: 'Básico',   color: '#22d98a', icon: '🟢', default: 50000, description: 'Cambios puntuales, ajustes menores de tono o frases.' },
  { id: 'medium',  label: 'Medio',    color: '#f5a623', icon: '🟡', default: 30000, description: 'Reescribir o reorganizar una o varias secciones.' },
  { id: 'complex', label: 'Complejo', color: '#ff5f5f', icon: '🔴', default: 15000, description: 'Replantear el prompt entero, cambios estructurales.' },
]

export default function SuperAdminShell() {
  const { logout, impersonate, session } = useAuth()
  const [tab, setTab]       = useState('accounts')
  const [accounts,  setAccounts]  = useState([])
  const [superAdmins, setSuperAdmins] = useState([])
  const [platformCfg, setPlatformCfg] = useState({
    changeAgentModel: 'gpt-4o-mini',
    changeAgentDefaultLimit: 20,
    changeAgentTokenLimit: 95000,
    changeAgentTokenLimits: { basic: 50000, medium: 30000, complex: 15000 },
    changeAgentCaps: { prompt: true, tools: true, flows: true, agendas: true },
    channelLimits: { ...DEFAULT_CHANNEL_LIMITS },
    promptGeneratorModel: 'gpt-4o',
    promptGeneratorStructure: '',
    promptGeneratorConditions: '',
    promptGeneratorMaxTokens: 8000,
    promptGeneratorTemperature: 0.55,
    promptGeneratorMaxDocChars: 200000,
    promptGeneratorMaxFileMb: 30,
    defaultPromptProvider: 'deepseek',
    defaultPromptModel: 'deepseek-v4-flash',
    optimizerModel: 'gpt-4o-mini',
    promptGeneratorAllowFlows: true,
    // Platform default API keys (super admin sees real value; others get masked indicator)
    platformOpenaiKey: '',
    platformDeepseekKey: '',
    platformAnthropicKey: '',
    hasPlatformOpenaiKey: false,
    hasPlatformDeepseekKey: false,
    hasPlatformAnthropicKey: false,
    mediaMaxSizeMb: 30,
    demoAdsEnabled: false,
    demoAdsHtml: '',
    emailProvider: 'none',
    emailApiKey: '',
    hasEmailApiKey: false,
    emailFrom: '',
    emailFromName: 'AVI Asistente',
    signupVerifyEnabled: false,
    login2faEnabled: false,
  })
  const [tickets,   setTickets]   = useState([])
  const [allUsers,  setAllUsers]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showNew,   setShowNew]   = useState(false)
  const [expandedAccId,  setExpandedAccId]  = useState(null)
  const [detailAccId,    setDetailAccId]    = useState(null)   // ficha de configuración de una cuenta (vista dedicada)
  const [showNewAgent,   setShowNewAgent]   = useState(null)
  const [showLimits,     setShowLimits]     = useState(null)
  const [search,         setSearch]         = useState('')
  const [newAcc,  setNewAcc]  = useState({ name: '', email: '', ownerName: '', ownerEmail: '', ownerPassword: '', agentName: '', observations: '' })
  const [newAccFile, setNewAccFile] = useState(null)
  const [creatingAcc, setCreatingAcc] = useState(false)
  const newAccFileRef = useRef(null)
  const [newAgent, setNewAgent] = useState({ name: '', systemPrompt: 'Eres un asistente útil y amigable. Responde en español.', model: 'gpt-4o-mini', welcomeMessage: '¡Hola! ¿En qué te puedo ayudar?' })
  const [toast, setToast] = useState('')
  const [integrations, setIntegrations] = useState({ metaAppId: '', metaConfigId: '', metaAppSecret: '', hasMetaAppSecret: false })
  const [activeTicketId, setActiveTicketId] = useState(null)
  const [ticketFilter,   setTicketFilter]   = useState('all')
  const [saReply, setSaReply] = useState('')
  const [showNewSA, setShowNewSA] = useState(false)
  const [newSA, setNewSA] = useState({ name: '', email: '', password: '' })
  const [userSearch, setUserSearch] = useState('')
  const [editUser, setEditUser] = useState(null)  // member being edited
  const [editSA, setEditSA]     = useState(null)  // super admin being edited

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const reload = useCallback(async () => {
    try {
      const [accs, cfg, tkts, sas, integs, users] = await Promise.all([
        api.get('/api/superadmin/accounts'),
        api.get('/api/platform/settings'),
        api.get('/api/support'),
        api.get('/api/superadmin/super-admins').catch(() => []),
        api.get('/api/platform/integrations').catch(() => ({})),
        api.get('/api/superadmin/users').catch(() => []),
      ])
      setAccounts(accs || [])
      if (cfg) setPlatformCfg(prev => ({ ...DEFAULT_CHANNEL_LIMITS, ...prev, ...cfg, channelLimits: { ...DEFAULT_CHANNEL_LIMITS, ...(cfg.channelLimits || {}) } }))
      setTickets(tkts || [])
      setSuperAdmins(sas || [])
      setAllUsers(users || [])
      setIntegrations({
        metaAppId: (cfg?.metaAppId ?? integs?.metaAppId) || '',
        metaConfigId: (cfg?.metaConfigId ?? integs?.metaConfigId) || '',
        metaAppSecret: cfg?.metaAppSecret || '',
        hasMetaAppSecret: !!cfg?.hasMetaAppSecret,
      })
    } catch (err) {
      console.error('[SuperAdmin] reload error', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  // Real-time: reload tickets when user sends a message
  useEffect(() => {
    const sock = getSocket()
    const onUpdate = () => reload()
    sock.on('support:updated', onUpdate)
    return () => sock.off('support:updated', onUpdate)
  }, [reload])

  // ── Account CRUD ─────────────────────────────────────────────────────────────
  async function createAccount(e) {
    e.preventDefault()
    if (creatingAcc) return
    setCreatingAcc(true)
    try {
      // Multipart: incluye los datos del formulario + el documento opcional para
      // generar el prompt del agente con el generador de prompts de la plataforma.
      const fd = new FormData()
      fd.append('name', newAcc.name)
      fd.append('email', newAcc.email)
      if (newAcc.agentName.trim())    fd.append('agentName', newAcc.agentName.trim())
      if (newAcc.observations.trim()) fd.append('observations', newAcc.observations.trim())
      if (newAccFile)                 fd.append('file', newAccFile)
      const { id: accId } = await api.postForm('/api/superadmin/accounts', fd)
      // Create owner member
      await api.post(`/api/accounts/${accId}/members`, {
        id: 'mem_' + uid(), name: newAcc.ownerName, email: newAcc.ownerEmail, password: newAcc.ownerPassword,
        roleId: 'role_owner_' + accId.split('_')[1], status: 'active',
        avatar: newAcc.ownerName.slice(0, 2).toUpperCase(), agentAccess: [],
      }).catch(() => {})
      setNewAcc({ name: '', email: '', ownerName: '', ownerEmail: '', ownerPassword: '', agentName: '', observations: '' })
      setNewAccFile(null); if (newAccFileRef.current) newAccFileRef.current.value = ''
      setShowNew(false); await reload(); flash('Cuenta creada ✓ (agente + prompt + flujo listos)')
    } catch (err) { flash('Error: ' + (err.message || 'no se pudo crear la cuenta')) }
    setCreatingAcc(false)
  }

  function pickNewAccFile(e) {
    const f = e.target.files?.[0]
    if (!f) { setNewAccFile(null); return }
    const ext = f.name.split('.').pop().toLowerCase()
    if (!['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) {
      flash(`Ese archivo (.${ext}) no se acepta. Usa PDF, DOCX, TXT o MD.`)
      e.target.value = ''; setNewAccFile(null); return
    }
    if (f.size > 100 * 1024 * 1024) {
      flash(`El archivo pesa ${(f.size / 1048576).toFixed(1)} MB y el máximo es 100 MB.`)
      e.target.value = ''; setNewAccFile(null); return
    }
    setNewAccFile(f)
  }

  async function createAgent(e, accId) {
    e.preventDefault()
    try {
      await api.post(`/api/accounts/${accId}/agents`, {
        id: 'ag_' + uid(), ...newAgent,
        prompts: [{ id: 'pr_' + uid(), name: 'Prompt principal', content: newAgent.systemPrompt, isActive: true, provider: 'openai', model: newAgent.model }],
        status: 'active', channels: [], links: [], aiToolIds: [], rag: { enabled: false, files: [] },
      })
      setNewAgent({ name: '', systemPrompt: 'Eres un asistente útil y amigable. Responde en español.', model: 'gpt-4o-mini', welcomeMessage: '¡Hola! ¿En qué te puedo ayudar?' })
      setShowNewAgent(null); await reload(); flash('Agente IA creado ✓')
    } catch (err) { flash('Error: ' + err.message) }
  }

  async function toggleStatus(accId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active'
    // Optimistic
    setAccounts(prev => prev.map(a => a.id === accId ? { ...a, status: newStatus } : a))
    try {
      await api.put(`/api/superadmin/accounts/${accId}`, { status: newStatus })
    } catch { await reload() }
  }

  async function deleteAccount(accId) {
    if (!confirm('¿Eliminar esta cuenta permanentemente?')) return
    try {
      await api.delete(`/api/superadmin/accounts/${accId}`)
      setAccounts(prev => prev.filter(a => a.id !== accId))
      flash('Cuenta eliminada')
    } catch (err) { flash('Error: ' + err.message) }
  }

  async function deleteAgent(accId, agId) {
    if (!confirm('¿Eliminar este agente?')) return
    try {
      await api.delete(`/api/accounts/${accId}/agents/${agId}`)
      setAccounts(prev => prev.map(a => a.id === accId ? { ...a, agents: a.agents.filter(ag => ag.id !== agId) } : a))
      flash('Agente eliminado')
    } catch (err) { flash('Error: ' + err.message) }
  }

  async function saveAccountLimits(accId, field, value) {
    const acc = accounts.find(a => a.id === accId)
    if (!acc) return
    const parsed = value === '' ? null : parseInt(value)
    let body = {}
    let optimisticUpdate = a => a

    if (field === 'changeAgent') {
      body = { changeAgentLimitOverride: parsed }
      optimisticUpdate = a => ({ ...a, changeAgentLimitOverride: parsed })
    } else if (field === 'caTokenQuota') {
      body = { changeAgentTokenQuota: parsed }
      optimisticUpdate = a => ({ ...a, changeAgentTokenQuota: parsed })
    } else {
      body = { channelLimitsOverride: { ...(acc.channelLimitsOverride || {}), [field]: parsed } }
      optimisticUpdate = a => ({ ...a, channelLimitsOverride: { ...(a.channelLimitsOverride || {}), [field]: parsed } })
    }

    setAccounts(prev => prev.map(a => a.id === accId ? optimisticUpdate(a) : a))
    try {
      await api.put(`/api/superadmin/accounts/${accId}`, body)
      flash('Límites guardados ✓')
    } catch { await reload() }
  }

  async function savePlatformSettings() {
    try {
      await api.put('/api/platform/settings', platformCfg)
      flash('Configuración guardada ✓')
    } catch (err) { flash('Error: ' + err.message) }
  }

  const [testEmailTo, setTestEmailTo] = useState('')
  const [testingEmail, setTestingEmail] = useState(false)
  async function sendTestEmail() {
    if (!testEmailTo.trim()) { flash('Escribe un correo destino'); return }
    setTestingEmail(true)
    try {
      // Guarda primero para probar con la config actual del formulario.
      await api.put('/api/platform/settings', platformCfg)
      await api.post('/api/platform/test-email', { to: testEmailTo.trim() })
      flash('Correo de prueba enviado ✓')
    } catch (err) { flash('Error: ' + (err.message || 'no se pudo enviar')) }
    setTestingEmail(false)
  }

  async function saveIntegrations() {
    try {
      const payload = {
        metaAppId: (integrations.metaAppId || '').trim(),
        metaConfigId: (integrations.metaConfigId || '').trim(),
      }
      // Solo enviar el secret si el super admin escribió uno nuevo (no enviar vacío).
      if (integrations.metaAppSecret && integrations.metaAppSecret.trim()) {
        payload.metaAppSecret = integrations.metaAppSecret.trim()
      }
      await api.put('/api/platform/settings', payload)
      flash('Integraciones guardadas ✓')
    } catch (err) { flash('Error: ' + err.message) }
  }

  // ── Super Admins CRUD ─────────────────────────────────────────────────────────
  async function createSuperAdmin(e) {
    e.preventDefault()
    try {
      await api.post('/api/superadmin/super-admins', newSA)
      setNewSA({ name: '', email: '', password: '' })
      setShowNewSA(false)
      await reload()
      flash('Super Admin creado ✓')
    } catch (err) { flash('Error: ' + err.message) }
  }

  async function deleteSuperAdmin(saId, saName) {
    if (!confirm(`¿Eliminar a "${saName}" de los Super Admins?`)) return
    try {
      await api.delete(`/api/superadmin/super-admins/${saId}`)
      setSuperAdmins(prev => prev.filter(sa => sa.id !== saId))
      flash('Super Admin eliminado')
    } catch (err) { flash('Error: ' + err.message) }
  }

  async function saveSuperAdmin(e) {
    e.preventDefault()
    if (!editSA) return
    const body = { name: editSA.name, email: editSA.email }
    if (editSA.password) body.password = editSA.password
    try {
      await api.put(`/api/superadmin/super-admins/${editSA.id}`, body)
      setEditSA(null)
      await reload()
      flash('Super Admin actualizado ✓')
    } catch (err) { flash('Error: ' + err.message) }
  }

  // ── Edit account user (member) ──────────────────────────────────────────────
  async function saveUser(e) {
    e.preventDefault()
    if (!editUser) return
    const body = { name: editUser.name, email: editUser.email, status: editUser.status }
    if (editUser.password) body.password = editUser.password
    try {
      await api.put(`/api/accounts/${editUser.accountId}/members/${editUser.id}`, body)
      setEditUser(null)
      await reload()
      flash('Usuario actualizado ✓')
    } catch (err) { flash('Error: ' + err.message) }
  }

  // ── Tickets ──────────────────────────────────────────────────────────────────
  async function handleSaReply(ticketId) {
    if (!saReply.trim()) return
    try {
      await api.post(`/api/support/${ticketId}/messages`, {
        role: 'support', authorId: session?.id || 'sa',
        authorName: session?.name || 'Soporte AVI', content: saReply.trim(),
      })
      setSaReply(''); await reload(); flash('Respuesta enviada ✓')
    } catch (err) { flash('Error: ' + err.message) }
  }

  async function handleSaSendMedia(ticketId, accId, meta) {
    if (!meta?.mediaId) return
    try {
      await api.post(`/api/support/${ticketId}/messages`, {
        role: 'support', authorId: session?.id || 'sa',
        authorName: session?.name || 'Soporte AVI', content: '', media: meta,
      })
      await reload()
    } catch (err) { flash('Error: ' + err.message) }
  }

  async function handleStatusChange(ticketId, status) {
    try {
      await api.put(`/api/support/${ticketId}`, { status })
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status } : t))
      flash('Estado actualizado ✓')
    } catch (err) { flash('Error: ' + err.message) }
  }

  async function handleAssign(ticketId, saId, saName) {
    try {
      await api.put(`/api/support/${ticketId}`, { assignedTo: { saId, saName } })
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, assignedTo: { saId, saName } } : t))
      flash('Ticket asignado ✓')
    } catch (err) { flash('Error: ' + err.message) }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const filteredAccounts = accounts.filter(acc =>
    acc.name.toLowerCase().includes(search.toLowerCase()) ||
    acc.email.toLowerCase().includes(search.toLowerCase())
  )

  // Ficha dedicada: cuenta seleccionada para configurar (reemplaza la lista, no despliega inline)
  const detailAcc = detailAccId ? accounts.find(a => a.id === detailAccId) : null

  const stats = {
    total:   accounts.length,
    active:  accounts.filter(a => a.status === 'active').length,
    agents:  accounts.reduce((s, a) => s + (a.agents?.length || 0), 0),
    members: accounts.reduce((s, a) => s + (a.members?.length || 0), 0),
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text2)' }}>Cargando...</div>

  const navItems = [
    { id: 'dashboard',     icon: '📊', label: 'Supervisión',   count: null, tip: 'Estado de todas las cuentas: suscripciones, consumo y alertas.' },
    { id: 'comercial',     icon: '💼', label: 'Comercial',     count: null, tip: 'MRR, conversiones Demo→Pago y métricas de negocio.' },
    { id: 'accounts',      icon: '🏢', label: 'Cuentas',       count: accounts.length, tip: 'Crea y administra cuentas cliente, sus agentes, suscripción y módulos.' },
    { id: 'users',         icon: '👥', label: 'Usuarios',      count: allUsers.length || null, tip: 'Todos los miembros de todas las cuentas.' },
    { id: 'privchats',     icon: '🔒', label: 'Chats privados', count: null, tip: 'Supervisa los mensajes directos (DM) del equipo de cada cuenta.' },
    { id: 'tipos',         icon: '🏷', label: 'Tipos de cuenta', count: null, tip: 'Límites de canales, reglas Demo y módulos incluidos por tipo.' },
    { id: 'planes',        icon: '💳', label: 'Mensualidades', count: null, tip: 'Planes con límite de conversaciones mensuales y precio.' },
    { id: 'demos',         icon: '📈', label: 'Demos',         count: null, tip: 'Panel de cuentas Demo activas y su estado.' },
    { id: 'democonfig',    icon: '🎁', label: 'Config Demo',   count: null, tip: 'Parámetros del onboarding Demo Inteligente.' },
    { id: 'antifraude',    icon: '🛡', label: 'Antifraude Demo', count: null, tip: 'Control de abuso/duplicados en cuentas Demo.' },
    { id: 'settings',      icon: '⚙️',  label: 'Plataforma',   count: null, tip: 'Ajustes globales: claves por defecto, modelos y límites.' },
    { id: 'generator',     icon: '📝', label: 'Generador',     count: null, tip: 'Configura el generador de prompts con IA (estructura y condiciones).' },
    { id: 'pricing',       icon: '💸', label: 'Pricing IA',    count: null, tip: 'Tarifas de tokens por modelo, para estimar costos.' },
    { id: 'integrations',  icon: '🔗', label: 'Integraciones', count: null, tip: 'App global de Meta (WhatsApp/Messenger/IG): App ID, Secret y Config ID.' },
    { id: 'soporte',       icon: '🎧', label: 'Soporte',       count: tickets.filter(t => t.status !== 'closed').length || null, tip: 'Tickets y chats de soporte de las cuentas.' },
    { id: 'sa',            icon: '👑', label: 'Super Admins',  count: superAdmins.length || null, tip: 'Gestiona los administradores de la plataforma.' },
    { id: 'docs',          icon: '🗺',  label: 'Documentación', count: null, tip: 'Documentación interna.' },
    { id: 'tutorials',     icon: '🎓', label: 'Tutoriales',     count: null, tip: 'Tutoriales para los usuarios.' },
  ]

  return (
    <div className={s.shell}>
      <CursorFX />
      <SmoothFX />
      <MediaLightbox />
      {toast && <div className={s.toast}>{toast}</div>}

      <aside className={s.sidebar}>
        <div className={s.brand}>
          <AviMark size={32} />
          <div>
            <div className={s.brandName} style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.02em' }}>avi <span style={{ fontWeight: 500, color: 'var(--text2)' }}>platform</span></div>
            <div className={s.brandRole}>Super Admin</div>
          </div>
          {/* Móvil: selector desplegable de secciones */}
          <select className="mobileSelect" style={{ flex: 1, marginLeft: 8 }} value={tab} onChange={e => setTab(e.target.value)}>
            {navItems.map(item => <option key={item.id} value={item.id}>{item.icon} {item.label}</option>)}
          </select>
        </div>
        <nav className={`${s.nav} onlyDesktop`}>
          {navItems.map(item => (
            <button key={item.id} className={`${s.navItem} ${tab === item.id ? s.navActive : ''}`} onClick={() => setTab(item.id)} title={item.tip}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.count != null && <span className={s.navCount}>{item.count}</span>}
            </button>
          ))}
        </nav>
        <button className={`${s.logoutBtn} onlyDesktop`} onClick={logout}>↩ Cerrar sesión</button>
      </aside>

      <main className={s.main}>

        {/* ── CUENTAS ── */}
        {tab === 'accounts' && !detailAcc && (
          <div className={s.content}>
            <div className={s.statsBar}>
              {[
                { label: 'Cuentas totales', value: stats.total },
                { label: 'Cuentas activas', value: stats.active },
                { label: 'Agentes IA',      value: stats.agents },
                { label: 'Miembros',        value: stats.members },
              ].map(stat => (
                <div key={stat.label} className={s.statCard}>
                  <div className={s.statValue}>{stat.value}</div>
                  <div className={s.statLabel}>{stat.label}</div>
                </div>
              ))}
            </div>

            <div className={s.pageHeader}>
              <div>
                <h1 className={s.pageTitle}>Cuentas</h1>
                <p className={s.pageSub}>{filteredAccounts.length} de {accounts.length} cuentas</p>
              </div>
              <div className={s.pageActions}>
                <input className={s.searchInput} placeholder="Buscar por nombre o email..." value={search} onChange={e => setSearch(e.target.value)} />
                <button className={s.primaryBtn} onClick={() => setShowNew(!showNew)}>
                  {showNew ? '✕ Cancelar' : '+ Nueva cuenta'}
                </button>
              </div>
            </div>

            {showNew && (
              <form className={s.formCard} onSubmit={createAccount}>
                <div className={s.formTitle}>Nueva cuenta</div>
                <div className={s.formSectionLabel}>Información de la empresa</div>
                <div className={s.formGrid3}>
                  <div className={s.field}><label>Nombre de empresa</label><input required placeholder="Acme Corp" value={newAcc.name} onChange={e => setNewAcc(p => ({ ...p, name: e.target.value }))} /></div>
                  <div className={s.field}><label>Email de empresa</label><input required type="email" placeholder="hola@acme.com" value={newAcc.email} onChange={e => setNewAcc(p => ({ ...p, email: e.target.value }))} /></div>
                </div>
                <div className={s.formSectionLabel}>Owner de la cuenta</div>
                <div className={s.formGrid3}>
                  <div className={s.field}><label>Nombre completo</label><input required placeholder="Juan Pérez" value={newAcc.ownerName} onChange={e => setNewAcc(p => ({ ...p, ownerName: e.target.value }))} /></div>
                  <div className={s.field}><label>Email de acceso</label><input required type="email" placeholder="juan@acme.com" value={newAcc.ownerEmail} onChange={e => setNewAcc(p => ({ ...p, ownerEmail: e.target.value }))} /></div>
                  <div className={s.field}><label>Contraseña</label><input required type="password" placeholder="••••••••" value={newAcc.ownerPassword} onChange={e => setNewAcc(p => ({ ...p, ownerPassword: e.target.value }))} /></div>
                </div>

                <div className={s.formSectionLabel}>Agente IA por defecto</div>
                <div className={s.formHint} style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                  Al crear la cuenta se genera automáticamente un agente con su <strong>prompt</strong> (usando la <strong>estructura y condiciones</strong> del Generador de prompts), su <strong>flujo de respuesta</strong> y la variable <code>{'{{respuesta_ia}}'}</code>. El prompt queda asignado a <strong>DeepSeek V4 Flash</strong>.
                </div>
                <div className={s.formGrid3}>
                  <div className={s.field}><label>Nombre del agente <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional)</span></label><input placeholder={newAcc.name || 'Asistente'} value={newAcc.agentName} onChange={e => setNewAcc(p => ({ ...p, agentName: e.target.value }))} /></div>
                  <div className={s.field}><label>Documento del negocio <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional · PDF/DOCX/TXT/MD)</span></label><input ref={newAccFileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md" onChange={pickNewAccFile} style={{ fontSize: 13 }} />{newAccFile && <span style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{newAccFile.name}</span>}</div>
                </div>
                <div className={s.field}>
                  <label>Observaciones para el prompt <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional)</span></label>
                  <textarea rows={3} value={newAcc.observations} onChange={e => setNewAcc(p => ({ ...p, observations: e.target.value }))} placeholder="Ej: clínica dental enfocada en odontología cosmética; tono cercano; no menciones implantes." style={{ resize: 'vertical', fontSize: 13 }} />
                </div>

                <div className={s.formHint} style={{ fontSize: 12, color: 'var(--text3)' }}>Tras crearla, asigna el <strong>tipo de cuenta</strong> y la <strong>mensualidad</strong> desde la ficha de la cuenta (▼ Agentes → Suscripción).</div>
                <div className={s.formActions}>
                  <button type="button" className={s.cancelBtn} onClick={() => setShowNew(false)} disabled={creatingAcc}>Cancelar</button>
                  <button type="submit" className={s.primaryBtn} disabled={creatingAcc}>{creatingAcc ? '⏳ Creando y generando prompt…' : 'Crear cuenta'}</button>
                </div>
              </form>
            )}

            <div className={s.accountsList}>
              {filteredAccounts.length === 0 && <div className={s.emptyList}>No se encontraron cuentas</div>}
              {filteredAccounts.map(acc => (
                <div key={acc.id} className={s.accountCard}>
                  <div className={s.accountCardMain}>
                    <div className={s.accountInfo}>
                      <div className={s.accountName}>{acc.name}{acc.nickname && acc.nickname !== acc.name && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)', marginLeft: 8 }} title="Apodo interno">· {acc.nickname}</span>}</div>
                      <div className={s.accountEmail}>{acc.email}</div>
                      <button
                        type="button"
                        title="Copiar ID de cuenta"
                        onClick={() => { navigator.clipboard?.writeText(acc.id); flash('ID copiado: ' + acc.id) }}
                        style={{ marginTop: 3, padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, color: 'var(--text3)' }}
                      >
                        🆔 {acc.id} ⧉
                      </button>
                    </div>
                    <div className={s.accountMeta}>
                      <span className={s.metaItem}>{acc.members?.length || 0} miembros</span>
                      <span className={s.metaItem}>{acc.agents?.length || 0} agentes</span>
                      <span className={`${s.statusBadge} ${acc.status === 'active' ? s.statusGreen : s.statusRed}`}>
                        {acc.status === 'active' ? '● Activa' : '○ Suspendida'}
                      </span>
                    </div>
                    <div className={s.accountActions}>
                      <button className={s.enterBtn} onClick={() => impersonate(acc.id)}>Entrar →</button>
                      <button className={s.expandBtn} onClick={() => { setDetailAccId(acc.id); setShowLimits(null); setExpandedAccId(null) }}>
                        ⚙ Configurar
                      </button>
                      <button className={s.actionBtn} onClick={() => toggleStatus(acc.id, acc.status)}>
                        {acc.status === 'active' ? 'Suspender' : 'Activar'}
                      </button>
                      <button className={`${s.actionBtn} ${s.dangerBtn}`} onClick={() => deleteAccount(acc.id)}>Eliminar</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── FICHA DE CUENTA (vista dedicada de configuración) ── */}
        {tab === 'accounts' && detailAcc && (
          <div className={s.content}>
            <div className={s.pageHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <button className={s.expandBtn} onClick={() => setDetailAccId(null)}>← Volver a cuentas</button>
                <div>
                  <h1 className={s.pageTitle} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {detailAcc.name}
                    {detailAcc.nickname && detailAcc.nickname !== detailAcc.name && (
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text3)' }} title="Apodo interno">· {detailAcc.nickname}</span>
                    )}
                    <span className={`${s.statusBadge} ${detailAcc.status === 'active' ? s.statusGreen : s.statusRed}`}>
                      {detailAcc.status === 'active' ? '● Activa' : '○ Suspendida'}
                    </span>
                  </h1>
                  <p className={s.pageSub}>{detailAcc.email} · {detailAcc.members?.length || 0} miembros · {detailAcc.agents?.length || 0} agentes</p>
                </div>
              </div>
              <div className={s.pageActions}>
                <button className={s.enterBtn} onClick={() => impersonate(detailAcc.id)}>Entrar →</button>
                <button className={s.actionBtn} onClick={() => toggleStatus(detailAcc.id, detailAcc.status)}>
                  {detailAcc.status === 'active' ? 'Suspender' : 'Activar'}
                </button>
              </div>
            </div>

            <AccountIdentityControl acc={detailAcc} onSaved={reload} />
            <AccountSubscriptionControl accId={detailAcc.id} />
            <AccountModulesControl acc={detailAcc} onSaved={reload} />

            <div className={s.settingsCard}>
              <div className={s.settingsCardTitle}>⚡ Cupo mensual de tokens del Agente de Cambios</div>
              <div className={s.limitsGrid}>
                {(() => {
                  const usage = detailAcc.changeAgentUsage?.find(e => e.month === new Date().toISOString().slice(0, 7))
                  const used = usage?.tokensUsed || 0
                  const platformDefault = platformCfg.changeAgentTokenLimit ?? 95000
                  const override = detailAcc.changeAgentTokenQuota
                  const effective = override ?? platformDefault
                  return (
                    <div className={s.limitField}>
                      <label style={{ color: 'var(--accent)' }}>⚡ Tokens totales / mes <span className={s.limitsHint}>(vacío = default global)</span></label>
                      <input type="number" min="0" step="5000"
                        placeholder={`Default: ${platformDefault.toLocaleString()}`}
                        value={override ?? ''}
                        onChange={e => saveAccountLimits(detailAcc.id, 'caTokenQuota', e.target.value)}
                        className={s.limitInput} />
                      <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                        Usado este mes: {used.toLocaleString()} / {effective.toLocaleString()}
                      </span>
                    </div>
                  )
                })()}
              </div>
            </div>

            <div className={s.settingsCard}>
              <div className={s.agentExpanderHeader}>
                <span className={s.settingsCardTitle} style={{ margin: 0 }}>Agentes IA de {detailAcc.name}</span>
                <button className={s.primaryBtn} style={{ fontSize: 11, padding: '5px 12px' }} onClick={() => setShowNewAgent(detailAcc.id)}>
                  + Crear agente
                </button>
              </div>
              {showNewAgent === detailAcc.id && (
                <form className={s.agentForm} onSubmit={e => createAgent(e, detailAcc.id)}>
                  <div className={s.formGrid3}>
                    <div className={s.field}><label>Nombre del agente</label><input required placeholder="Soporte, Ventas..." value={newAgent.name} onChange={e => setNewAgent(p => ({ ...p, name: e.target.value }))} /></div>
                    <div className={s.field}><label>Modelo base</label>
                      <select value={newAgent.model} onChange={e => setNewAgent(p => ({ ...p, model: e.target.value }))}>
                        <option value="gpt-4o-mini">GPT-4o mini</option>
                        <option value="gpt-4o">GPT-4o</option>
                        <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
                        <option value="deepseek-v4-flash">DeepSeek V4 Flash</option>
                        <option value="deepseek-chat">DeepSeek Chat</option>
                        <option value="deepseek-reasoner">DeepSeek Reasoner</option>
                      </select>
                    </div>
                    <div className={s.field}><label>Mensaje de bienvenida</label><input value={newAgent.welcomeMessage} onChange={e => setNewAgent(p => ({ ...p, welcomeMessage: e.target.value }))} /></div>
                  </div>
                  <div className={s.field}><label>System prompt inicial</label><textarea rows={3} value={newAgent.systemPrompt} onChange={e => setNewAgent(p => ({ ...p, systemPrompt: e.target.value }))} /></div>
                  <div className={s.formActions}>
                    <button type="button" className={s.cancelBtn} onClick={() => setShowNewAgent(null)}>Cancelar</button>
                    <button type="submit" className={s.primaryBtn}>Crear agente</button>
                  </div>
                </form>
              )}
              {(detailAcc.agents || []).length === 0 && <div className={s.noAgents}>Sin agentes. Crea el primero.</div>}
              {(detailAcc.agents || []).map(ag => (
                <div key={ag.id} className={s.agentRow}>
                  <span className={`${s.agDot} ${ag.status === 'active' ? s.dotGreen : s.dotAmber}`} />
                  <div className={s.agInfo}>
                    <span className={s.agName}>{ag.name}</span>
                    <span className={s.agModel}>{ag.prompts?.find(p => p.isActive)?.model || ag.model}</span>
                    <span className={s.agLinks}>{(ag.channels || []).length} canales</span>
                    {ag.rag?.enabled && <span className={s.ragBadge}>RAG</span>}
                  </div>
                  <span className={`${s.statusBadge} ${ag.status === 'active' ? s.statusGreen : s.statusAmber}`}>{ag.status}</span>
                  <button className={`${s.actionBtn} ${s.dangerBtn}`} onClick={() => deleteAgent(detailAcc.id, ag.id)}>Eliminar</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CONFIGURACIÓN DE PLATAFORMA ── */}
        {tab === 'settings' && (
          <div className={s.content}>
            <div className={s.pageHeader}>
              <div>
                <h1 className={s.pageTitle}>Configuración de Plataforma</h1>
                <p className={s.pageSub}>Controla el comportamiento global de AVI Platform.</p>
              </div>
            </div>
            <div className={s.settingsCard}>
              <div className={s.settingsCardTitle}>🔑 API Keys por defecto de la plataforma</div>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
                Estas claves se usan automáticamente para <strong>todas las cuentas</strong> que no tengan
                su propia clave configurada. El gasto se mantiene siempre separado por cuenta
                (ver pestaña "Tokens" de cada cuenta). Una cuenta puede sobrescribir cualquier proveedor
                con su propia clave desde su panel de Configuración.
              </p>
              <div className={s.settingsGrid}>
                <div className={s.field}>
                  <label>🟢 OpenAI (default)</label>
                  <input type="password" placeholder="sk-..." style={{ fontFamily: 'monospace', fontSize: 12 }}
                    value={platformCfg.platformOpenaiKey || ''}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, platformOpenaiKey: e.target.value }))} />
                  <span style={{ fontSize: 10, color: platformCfg.hasPlatformOpenaiKey ? '#22d98a' : 'var(--text3)', marginTop: 2 }}>
                    {platformCfg.hasPlatformOpenaiKey ? '● Configurada — usada como fallback global' : '○ Sin configurar — cuentas sin key propia no podrán usar OpenAI'}
                  </span>
                </div>
                <div className={s.field}>
                  <label>🔵 DeepSeek (default)</label>
                  <input type="password" placeholder="sk-..." style={{ fontFamily: 'monospace', fontSize: 12 }}
                    value={platformCfg.platformDeepseekKey || ''}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, platformDeepseekKey: e.target.value }))} />
                  <span style={{ fontSize: 10, color: platformCfg.hasPlatformDeepseekKey ? '#4fa8ff' : 'var(--text3)', marginTop: 2 }}>
                    {platformCfg.hasPlatformDeepseekKey ? '● Configurada — usada como fallback global' : '○ Sin configurar'}
                  </span>
                </div>
                <div className={s.field}>
                  <label>🟣 Claude / Anthropic (default)</label>
                  <input type="password" placeholder="sk-ant-..." style={{ fontFamily: 'monospace', fontSize: 12 }}
                    value={platformCfg.platformAnthropicKey || ''}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, platformAnthropicKey: e.target.value }))} />
                  <span style={{ fontSize: 10, color: platformCfg.hasPlatformAnthropicKey ? '#c179ff' : 'var(--text3)', marginTop: 2 }}>
                    {platformCfg.hasPlatformAnthropicKey ? '● Configurada — usada como fallback global' : '○ Sin configurar'}
                  </span>
                </div>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, fontStyle: 'italic' }}>
                💡 Estas claves también se usan por el <strong>Agente de Cambios</strong> y el <strong>Generador de Prompts</strong> cuando una cuenta no tiene la clave del proveedor configurado para ese modelo.
              </p>
            </div>

            <div className={s.settingsCard}>
              <div className={s.settingsCardTitle}>🤖 Agente de Cambios</div>
              <div className={s.settingsGrid}>
                <div className={s.field}>
                  <label>Modelo IA del Agente de Cambios</label>
                  <ModelSelect value={platformCfg.changeAgentModel || 'gpt-4o-mini'} onChange={v => setPlatformCfg(prev => ({ ...prev, changeAgentModel: v }))} />
                </div>
              </div>

              <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                Cupo mensual de <strong>tokens totales</strong> del Agente de Cambios (un solo pool, sin tipos):
              </div>
              <div className={s.settingsGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <div className={s.field}>
                  <label style={{ color: 'var(--accent)' }}>⚡ Tokens totales / mes</label>
                  <input type="number" min="0" step="5000"
                    value={platformCfg.changeAgentTokenLimit ?? 95000}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, changeAgentTokenLimit: parseInt(e.target.value) || 0 }))} />
                  <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Se descuenta de un único pool en cada cambio aplicado.</span>
                </div>
              </div>

              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Capacidades habilitadas</div>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                  Qué puede modificar el Agente de Cambios en TODAS las cuentas. Al desactivar una, ese ámbito desaparece del panel del Agente.
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
                  {[
                    { k: 'prompt',  label: '📝 Prompt del agente' },
                    { k: 'tools',   label: '🛠 Herramientas especiales' },
                    { k: 'flows',   label: '🔀 Flujos' },
                    { k: 'agendas', label: '📅 Agendas / Calendarios' },
                  ].map(cap => {
                    const caps = platformCfg.changeAgentCaps || { prompt: true, tools: true, flows: true, agendas: true }
                    return (
                      <label key={cap.k} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox"
                          checked={caps[cap.k] !== false}
                          onChange={e => setPlatformCfg(prev => ({ ...prev, changeAgentCaps: { ...(prev.changeAgentCaps || { prompt: true, tools: true, flows: true, agendas: true }), [cap.k]: e.target.checked } }))} />
                        {cap.label}
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className={s.settingsCard}>
              <div className={s.settingsCardTitle}>📎 Subida de archivos en chats</div>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
                Tamaño máximo por archivo (imagen, video, audio, documento) que los usuarios pueden enviar en cualquier chat.
                Aplica tanto al inbox interno como al webchat público.
              </p>
              <div className={s.settingsGrid}>
                <div className={s.field}>
                  <label>Tamaño máximo por archivo (MB)</label>
                  <input type="number" min="1" max="100" step="1"
                    value={platformCfg.mediaMaxSizeMb ?? 30}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, mediaMaxSizeMb: parseInt(e.target.value) || 30 }))} />
                  <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                    Por defecto 30 MB. Máximo absoluto del servidor: 100 MB. Recuerda que los archivos se guardan en base64 dentro de la base de datos.
                  </span>
                </div>
                <div className={s.field}>
                  <label>🎤 Modelo de transcripción de audios</label>
                  <select
                    value={platformCfg.transcriptionModel || 'whisper-1'}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, transcriptionModel: e.target.value }))}>
                    <option value="whisper-1">Whisper (whisper-1) — estándar, económico</option>
                    <option value="gpt-4o-mini-transcribe">GPT-4o mini (gpt-4o-mini-transcribe) — mejor calidad, bajo costo</option>
                    <option value="gpt-4o-transcribe">GPT-4o (gpt-4o-transcribe) — máxima calidad</option>
                  </select>
                  <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                    Usa la API de OpenAI (Whisper / GPT-4o transcribe). <strong>DeepSeek no transcribe audio</strong> (no tiene API de voz a texto), por eso solo hay modelos de OpenAI. Requiere una API key de OpenAI configurada.
                  </span>
                </div>
              </div>
            </div>

            <div className={s.settingsCard}>
              <div className={s.settingsCardTitle}>📝 Generador de Prompts desde Documentos</div>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
                Parámetros que usará la IA al generar prompts a partir de archivos Word/PDF subidos en la pestaña <strong>Generador</strong>.
              </p>

              {/* Model + flows + advanced params */}
              <div className={s.settingsGrid}>
                <div className={s.field}>
                  <label>Modelo IA generador</label>
                  <ModelSelect value={platformCfg.promptGeneratorModel || 'gpt-4o'} onChange={v => setPlatformCfg(prev => ({ ...prev, promptGeneratorModel: v }))} />
                  <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                    La cuenta debe tener la API key del proveedor configurada.
                  </span>
                </div>
                <div className={s.field}>
                  <label>Modelo por defecto de los PROMPTS</label>
                  <ModelSelect value={platformCfg.defaultPromptModel || 'deepseek-v4-flash'} onChange={v => setPlatformCfg(prev => ({ ...prev, defaultPromptModel: v, defaultPromptProvider: detectProvider(v) }))} />
                  <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                    Modelo que usan los prompts nuevos. Solo el super admin lo cambia; los usuarios de las cuentas (ni el owner) ven ni eligen el modelo.
                  </span>
                </div>
                <div className={s.field}>
                  <label>Modelo del OPTIMIZADOR de Prompt</label>
                  <ModelSelect value={platformCfg.optimizerModel || 'gpt-4o-mini'} onChange={v => setPlatformCfg(prev => ({ ...prev, optimizerModel: v }))} />
                  <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                    Modelo que analiza las conversaciones y genera las sugerencias de mejora del prompt (Zona IA → Optimizador).
                  </span>
                </div>
                <div className={s.field}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox"
                      checked={!!platformCfg.promptGeneratorAllowFlows}
                      onChange={e => setPlatformCfg(prev => ({ ...prev, promptGeneratorAllowFlows: e.target.checked }))} />
                    Permitir sugerir flujos automáticamente
                  </label>
                  <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Si está activo, la IA propondrá flujos conversacionales que el super admin puede aceptar.</span>
                </div>
              </div>

              <div className={s.settingsGrid} style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 12 }}>
                <div className={s.field}>
                  <label>max_tokens de la respuesta</label>
                  <input type="number" min="500" max="32000" step="500"
                    value={platformCfg.promptGeneratorMaxTokens ?? 8000}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, promptGeneratorMaxTokens: parseInt(e.target.value) || 8000 }))} />
                  <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Tokens máximos de salida. Mayor = prompts más largos.</span>
                </div>
                <div className={s.field}>
                  <label>temperature</label>
                  <input type="number" min="0" max="2" step="0.05"
                    value={platformCfg.promptGeneratorTemperature ?? 0.55}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, promptGeneratorTemperature: parseFloat(e.target.value) }))} />
                  <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>0 = determinista · 1 = creativo · 2 = caótico.</span>
                </div>
                <div className={s.field}>
                  <label>max chars del documento</label>
                  <input type="number" min="5000" max="1000000" step="10000"
                    value={platformCfg.promptGeneratorMaxDocChars ?? 200000}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, promptGeneratorMaxDocChars: parseInt(e.target.value) || 200000 }))} />
                  <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Caracteres del documento que se enviarán al modelo (~4 chars = 1 token).</span>
                </div>
                <div className={s.field}>
                  <label>Tamaño máximo del archivo (MB)</label>
                  <input type="number" min="1" max="100" step="1"
                    value={platformCfg.promptGeneratorMaxFileMb ?? 30}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, promptGeneratorMaxFileMb: parseInt(e.target.value) || 30 }))} />
                  <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Tamaño máximo del archivo (.pdf/.docx) que se puede subir. Máx absoluto: 100 MB.</span>
                </div>
              </div>

              <div className={s.field} style={{ marginTop: 14 }}>
                <label>Estructura base del prompt generado</label>
                <textarea rows={8}
                  style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical', minHeight: 140 }}
                  value={platformCfg.promptGeneratorStructure || ''}
                  onChange={e => setPlatformCfg(prev => ({ ...prev, promptGeneratorStructure: e.target.value }))} />
                <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  Plantilla que seguirá la IA. Usa secciones con ## y placeholders entre corchetes.
                </span>
              </div>

              <div className={s.field} style={{ marginTop: 14 }}>
                <label>Condiciones y estándares de calidad</label>
                <textarea rows={14}
                  style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical', minHeight: 240 }}
                  value={platformCfg.promptGeneratorConditions || ''}
                  onChange={e => setPlatformCfg(prev => ({ ...prev, promptGeneratorConditions: e.target.value }))} />
                <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  Reglas que el generador SIEMPRE debe cumplir (extensión mínima, dimensiones a cubrir, reglas de formato, etc).
                  Estas condiciones se inyectan en el system prompt del generador.
                </span>
              </div>

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>📢 Publicidad en cuentas Demo</h4>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                  Muestra un espacio de anuncios (que te paga tu red de anuncios) SOLO en las cuentas Demo, encima del panel.
                  Las cuentas de pago nunca lo ven. Pega abajo el código embed/HTML de tu red (AdSense, Ezoic, Media.net, etc.).
                </span>
                <div className={s.field} style={{ marginTop: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox"
                      checked={!!platformCfg.demoAdsEnabled}
                      onChange={e => setPlatformCfg(prev => ({ ...prev, demoAdsEnabled: e.target.checked }))} />
                    Activar anuncios en cuentas Demo
                  </label>
                </div>
                <div className={s.field} style={{ marginTop: 8 }}>
                  <label>Código del anuncio (HTML / embed / script)</label>
                  <textarea rows={7}
                    style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical', minHeight: 120 }}
                    placeholder={'<ins class="adsbygoogle" ...></ins>\n<script>...</script>'}
                    value={platformCfg.demoAdsHtml || ''}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, demoAdsHtml: e.target.value }))} />
                  <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                    Los &lt;script&gt; se ejecutan automáticamente. Nota: algunas redes (p. ej. Google AdSense) prohíben anuncios dentro de paneles con inicio de sesión —
                    verifica las políticas de tu red antes de usar su código aquí.
                  </span>
                </div>
              </div>
            </div>

            <div className={s.settingsCard}>
              <div className={s.settingsCardTitle}>📧 Correo, verificación de registro y 2FA</div>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
                Configura un proveedor de correo transaccional para activar la <strong>verificación de correo en el registro Demo</strong> y el
                <strong> 2FA en el inicio de sesión</strong>. Sin proveedor configurado, ambas funciones quedan inactivas y el login funciona igual que hoy.
              </p>
              <div className={s.settingsGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <div className={s.field}>
                  <label>Proveedor de correo</label>
                  <select value={platformCfg.emailProvider || 'none'} onChange={e => setPlatformCfg(prev => ({ ...prev, emailProvider: e.target.value }))}>
                    <option value="none">Ninguno (desactivado)</option>
                    <option value="resend">Resend</option>
                    <option value="sendgrid">SendGrid</option>
                  </select>
                  <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Ambos ofrecen plan gratuito. Solo necesitas una API Key.</span>
                </div>
                <div className={s.field}>
                  <label>API Key del proveedor</label>
                  <input type="password" placeholder={platformCfg.hasEmailApiKey ? '•••••••• (guardada)' : 're_... / SG....'} style={{ fontFamily: 'monospace', fontSize: 12 }}
                    value={platformCfg.emailApiKey || ''}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, emailApiKey: e.target.value }))} />
                  <span style={{ fontSize: 10, color: platformCfg.hasEmailApiKey ? '#22d98a' : 'var(--text3)', marginTop: 2 }}>
                    {platformCfg.hasEmailApiKey ? '● Guardada — deja vacío para conservarla' : '○ Sin configurar'}
                  </span>
                </div>
                <div className={s.field}>
                  <label>Correo remitente (from)</label>
                  <input type="email" placeholder="no-reply@tudominio.com"
                    value={platformCfg.emailFrom || ''}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, emailFrom: e.target.value }))} />
                  <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Debe ser un dominio verificado en tu proveedor.</span>
                </div>
                <div className={s.field}>
                  <label>Nombre del remitente</label>
                  <input type="text" placeholder="AVI Asistente"
                    value={platformCfg.emailFromName || ''}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, emailFromName: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 10, flexWrap: 'wrap' }}>
                <div className={s.field} style={{ flex: 1, minWidth: 200 }}>
                  <label>Enviar correo de prueba a</label>
                  <input type="email" placeholder="tucorreo@ejemplo.com" value={testEmailTo} onChange={e => setTestEmailTo(e.target.value)} />
                </div>
                <button className={s.actionBtn} onClick={sendTestEmail} disabled={testingEmail} style={{ height: 38 }}>
                  {testingEmail ? '⏳ Enviando…' : '✉ Enviar prueba'}
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!platformCfg.signupVerifyEnabled}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, signupVerifyEnabled: e.target.checked }))} />
                  ✅ Verificación de correo en el registro Demo
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!platformCfg.login2faEnabled}
                    onChange={e => setPlatformCfg(prev => ({ ...prev, login2faEnabled: e.target.checked }))} />
                  🔐 2FA por correo en el inicio de sesión
                </label>
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 8, display: 'block' }}>
                Si el envío del código falla durante el login, se permite el acceso igualmente (fail-open) para no bloquear a los usuarios por un problema de correo.
              </span>
            </div>

            <div className={s.settingsActions}>
              <button className={s.primaryBtn} onClick={savePlatformSettings}>Guardar configuración</button>
            </div>
          </div>
        )}

        {/* ── GENERADOR DE PROMPTS ── */}
        {tab === 'generator' && (
          <PromptGeneratorPanel
            accounts={accounts}
            settings={platformCfg}
            onAccountReload={reload}
            flash={flash}
          />
        )}

        {/* ── PRICING DE MODELOS ── */}
        {tab === 'pricing' && (
          <PricingPanel flash={flash} />
        )}

        {/* ── DASHBOARD DE SUPERVISIÓN ── */}
        {tab === 'dashboard' && <SupervisionDashboard />}

        {/* ── DASHBOARD COMERCIAL ── */}
        {tab === 'comercial' && <CommercialDashboard />}

        {/* ── TIPOS DE CUENTA ── */}
        {tab === 'tipos' && <AccountTypesPanel />}

        {/* ── MENSUALIDADES (PLANES) ── */}
        {tab === 'planes' && <PlansPanel />}

        {/* ── DASHBOARD DE DEMOS ── */}
        {tab === 'demos' && <DemoDashboardPanel />}

        {/* ── CONFIGURACIÓN DE DEMO ── */}
        {tab === 'democonfig' && <DemoConfigPanel />}

        {/* ── ANTIFRAUDE DEMO ── */}
        {tab === 'antifraude' && <AntifraudPanel />}

        {/* ── INTEGRACIONES ── */}
        {tab === 'integrations' && (
          <div className={s.content}>
            <div className={s.pageHeader}>
              <div>
                <h1 className={s.pageTitle}>Integraciones</h1>
                <p className={s.pageSub}>Configura las credenciales globales de plataforma para los canales de Meta.</p>
              </div>
            </div>

            <div className={s.settingsCard}>
              <div className={s.settingsCardTitle}>📘 Meta (WhatsApp · Messenger · Instagram)</div>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
                Configura tu <strong>Meta App ID</strong> aquí para que todos los usuarios de la plataforma puedan conectar sus canales de WhatsApp, Messenger e Instagram con un solo clic, sin necesidad de ingresar el App ID manualmente.
              </p>
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text2)' }}>
                <strong>Cómo obtener tu App ID:</strong>
                <ol style={{ margin: '8px 0 0 16px', lineHeight: 2 }}>
                  <li>Ve a <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>developers.facebook.com/apps ↗</a></li>
                  <li>Crea o selecciona tu app de tipo <strong>Business</strong></li>
                  <li>Habilita: <strong>WhatsApp Business API</strong>, <strong>Messenger Platform</strong>, <strong>Instagram Graph API</strong></li>
                  <li>En <strong>Configuración básica</strong> copia el <strong>App ID</strong></li>
                  <li>Agrega tu dominio a los <strong>URIs de redirección OAuth válidos</strong></li>
                </ol>
              </div>
              <div className={s.settingsGrid}>
                <div className={s.field}>
                  <label>Meta App ID</label>
                  <input
                    placeholder="123456789012345"
                    value={integrations.metaAppId}
                    onChange={e => setIntegrations(p => ({ ...p, metaAppId: e.target.value.trim() }))}
                    style={{ fontFamily: 'monospace', fontSize: 14 }}
                  />
                  {integrations.metaAppId && (
                    <span style={{ fontSize: 11, color: 'var(--green, #22d98a)', marginTop: 4 }}>✓ App ID configurado — los usuarios verán el botón "Conectar con Meta" automáticamente</span>
                  )}
                  {!integrations.metaAppId && (
                    <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Sin configurar — los usuarios deberán ingresar su App ID manualmente</span>
                  )}
                </div>
                <div className={s.field}>
                  <label>Config ID (Embedded Signup / Coexistencia)</label>
                  <input
                    placeholder="1234567890123456"
                    value={integrations.metaConfigId}
                    onChange={e => setIntegrations(p => ({ ...p, metaConfigId: e.target.value.trim() }))}
                    style={{ fontFamily: 'monospace', fontSize: 14 }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                    ID de la configuración de <strong>Embedded Signup</strong> de tu app de Meta (WhatsApp → Configuración → Embedded Signup). Habilita el botón "Conectar por Coexistencia (1 clic)".
                  </span>
                </div>
                <div className={s.field}>
                  <label>Meta App Secret</label>
                  <input
                    type="password"
                    placeholder={integrations.hasMetaAppSecret ? '•••••••••• (guardado — escribe para reemplazar)' : 'App Secret de la app de Meta'}
                    value={integrations.metaAppSecret}
                    onChange={e => setIntegrations(p => ({ ...p, metaAppSecret: e.target.value.trim() }))}
                    style={{ fontFamily: 'monospace', fontSize: 14 }}
                  />
                  <span style={{ fontSize: 11, color: integrations.hasMetaAppSecret ? 'var(--green, #22d98a)' : 'var(--text3)', marginTop: 4 }}>
                    {integrations.hasMetaAppSecret ? '✓ App Secret guardado (nunca se expone a los clientes)' : 'Necesario para intercambiar el código de Coexistencia en el servidor. Solo lo ve el super admin.'}
                  </span>
                </div>
              </div>
              <div className={s.settingsActions}>
                <button className={s.primaryBtn} onClick={saveIntegrations}>Guardar integraciones</button>
              </div>
            </div>
          </div>
        )}

        {/* ── SOPORTE ── */}
        {tab === 'soporte' && (
          <SupportPanel
            tickets={tickets} activeTicketId={activeTicketId} setActiveTicketId={setActiveTicketId}
            ticketFilter={ticketFilter} setTicketFilter={setTicketFilter}
            saReply={saReply} setSaReply={setSaReply}
            onReply={handleSaReply} onStatusChange={handleStatusChange}
            onAssign={handleAssign} superAdmins={superAdmins}
            onSendMedia={handleSaSendMedia}
            onOpenChat={(ref) => {
              // Handoff: impersona la cuenta y abre el chat al cargar AdminShell
              try { localStorage.setItem('avi_pending_open', JSON.stringify({ accId: ref.accId, agentId: ref.agentId, convId: ref.convId })) } catch {}
              impersonate(ref.accId)
            }}
          />
        )}

        {/* ── USUARIOS ── */}
        {tab === 'users' && (
          <div className={s.content}>
            <div className={s.pageHeader}>
              <div>
                <h1 className={s.pageTitle}>Usuarios registrados</h1>
                <p className={s.pageSub}>{allUsers.filter(u => !userSearch || u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase())).length} de {allUsers.length} usuarios</p>
              </div>
              <div className={s.pageActions}>
                <input className={s.searchInput} placeholder="Buscar por nombre o email..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              </div>
            </div>
            <div className={s.settingsCard} style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text3)', background: 'var(--bg3)' }}>
                    <th style={{ padding: '10px 14px' }}>Usuario</th>
                    <th style={{ padding: '10px 14px' }}>Email</th>
                    <th style={{ padding: '10px 14px' }}>Cuenta</th>
                    <th style={{ padding: '10px 14px' }}>Rol</th>
                    <th style={{ padding: '10px 14px' }}>Estado</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers
                    .filter(u => !userSearch || u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
                    .map(u => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                              {u.name.slice(0, 2).toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{u.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text2)', fontFamily: 'monospace', fontSize: 11 }}>{u.email}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>{u.accountName}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--text2)', fontWeight: 600 }}>{u.roleName || u.roleId}</span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 700, color: u.status === 'active' ? '#22d98a' : 'var(--text3)', background: u.status === 'active' ? 'rgba(34,217,138,.12)' : 'var(--bg3)' }}>
                            {u.status === 'active' ? '● Activo' : '○ Inactivo'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <button className={s.actionBtn} onClick={() => setEditUser({ ...u, password: '' })}>Editar</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {allUsers.length === 0 && <div className={s.emptyList}>Sin usuarios registrados</div>}
            </div>
          </div>
        )}

        {/* ── CHATS PRIVADOS (supervisión de DMs del equipo) ── */}
        {tab === 'privchats' && <PrivateChatsPanel />}

        {/* ── DOCUMENTACIÓN ── */}
        {tab === 'docs' && <DocsPanel />}

        {/* ── TUTORIALES ── */}
        {tab === 'tutorials' && <TutorialsPanel />}

        {/* ── SUPER ADMINS ── */}
        {tab === 'sa' && (
          <div className={s.content}>
            <div className={s.pageHeader}>
              <div>
                <h1 className={s.pageTitle}>Super Admins</h1>
                <p className={s.pageSub}>{superAdmins.length} administradores de plataforma</p>
              </div>
              <div className={s.pageActions}>
                <button className={s.primaryBtn} onClick={() => setShowNewSA(!showNewSA)}>
                  {showNewSA ? '✕ Cancelar' : '+ Nuevo Super Admin'}
                </button>
              </div>
            </div>

            {showNewSA && (
              <form className={s.formCard} onSubmit={createSuperAdmin}>
                <div className={s.formTitle}>Nuevo Super Admin</div>
                <div className={s.formGrid3}>
                  <div className={s.field}><label>Nombre completo</label><input required placeholder="Ana García" value={newSA.name} onChange={e => setNewSA(p => ({ ...p, name: e.target.value }))} /></div>
                  <div className={s.field}><label>Email de acceso</label><input required type="email" placeholder="ana@empresa.com" value={newSA.email} onChange={e => setNewSA(p => ({ ...p, email: e.target.value }))} /></div>
                  <div className={s.field}><label>Contraseña</label><input required type="password" placeholder="••••••••" value={newSA.password} onChange={e => setNewSA(p => ({ ...p, password: e.target.value }))} /></div>
                </div>
                <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(245,166,35,.08)', border: '1px solid rgba(245,166,35,.25)', borderRadius: 6, fontSize: 11, color: 'var(--amber)' }}>
                  ⚠️ Los Super Admins tienen acceso completo a toda la plataforma. Crea estas cuentas solo para administradores de confianza.
                </div>
                <div className={s.formActions}>
                  <button type="button" className={s.cancelBtn} onClick={() => setShowNewSA(false)}>Cancelar</button>
                  <button type="submit" className={s.primaryBtn}>Crear Super Admin</button>
                </div>
              </form>
            )}

            <div className={s.saList}>
              {superAdmins.map(sa => (
                <div key={sa.id} className={s.saCard}>
                  <div className={s.saAvatar}>{sa.name.slice(0, 2).toUpperCase()}</div>
                  <div className={s.saInfo}>
                    <div className={s.saName}>{sa.name}</div>
                    <div className={s.saEmail}>{sa.email}</div>
                  </div>
                  <span className={s.planBadge} style={{ color: 'var(--amber)', background: 'var(--amber-dim)', borderColor: 'rgba(245,166,35,.3)' }}>Super Admin</span>
                  <button className={s.actionBtn} onClick={() => setEditSA({ ...sa, password: '' })} style={{ marginLeft: 8 }}>Editar</button>
                  {sa.id !== session?.id && (
                    <button className={`${s.actionBtn} ${s.dangerBtn}`} onClick={() => deleteSuperAdmin(sa.id, sa.name)} style={{ marginLeft: 6 }}>Eliminar</button>
                  )}
                  {sa.id === session?.id && (
                    <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>← Tú</span>
                  )}
                </div>
              ))}
              {superAdmins.length === 0 && <div className={s.emptyList}>Sin super admins. Algo está muy mal.</div>}
            </div>
          </div>
        )}
      </main>

      {/* ── Modal: editar usuario ── */}
      {editUser && (
        <div className={s.modalOverlay} onClick={() => setEditUser(null)}>
          <form className={s.modalCard} onClick={e => e.stopPropagation()} onSubmit={saveUser}>
            <div className={s.formTitle}>Editar usuario</div>
            <div className={s.modalSub}>{editUser.accountName}</div>
            <div className={s.field}><label>Nombre completo</label>
              <input required value={editUser.name} onChange={e => setEditUser(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className={s.field}><label>Email</label>
              <input required type="email" value={editUser.email} onChange={e => setEditUser(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className={s.field}><label>Nueva contraseña <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(dejar vacío para no cambiar)</span></label>
              <input type="password" placeholder="••••••••" value={editUser.password} onChange={e => setEditUser(p => ({ ...p, password: e.target.value }))} />
            </div>
            <div className={s.field}><label>Estado</label>
              <select value={editUser.status} onChange={e => setEditUser(p => ({ ...p, status: e.target.value }))}>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </div>
            <div className={s.formActions}>
              <button type="button" className={s.cancelBtn} onClick={() => setEditUser(null)}>Cancelar</button>
              <button type="submit" className={s.primaryBtn}>Guardar cambios</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Modal: editar super admin ── */}
      {editSA && (
        <div className={s.modalOverlay} onClick={() => setEditSA(null)}>
          <form className={s.modalCard} onClick={e => e.stopPropagation()} onSubmit={saveSuperAdmin}>
            <div className={s.formTitle}>Editar Super Admin</div>
            <div className={s.field}><label>Nombre completo</label>
              <input required value={editSA.name} onChange={e => setEditSA(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className={s.field}><label>Email</label>
              <input required type="email" value={editSA.email} onChange={e => setEditSA(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className={s.field}><label>Nueva contraseña <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(dejar vacío para no cambiar)</span></label>
              <input type="password" placeholder="••••••••" value={editSA.password} onChange={e => setEditSA(p => ({ ...p, password: e.target.value }))} />
            </div>
            <div className={s.formActions}>
              <button type="button" className={s.cancelBtn} onClick={() => setEditSA(null)}>Cancelar</button>
              <button type="submit" className={s.primaryBtn}>Guardar cambios</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

// ── Support Panel ─────────────────────────────────────────────────────────────
const STATUS_LABELS_SP = { open: 'Abierto', in_progress: 'En progreso', closed: 'Cerrado' }
const STATUS_COLORS_SP = { open: 'var(--amber)', in_progress: 'var(--accent)', closed: 'var(--text3)' }

const SUPPORT_CHANNEL_ICON = { webchat: '💬', whatsapp: '📱', messenger: '📘', instagram: '📸', test: '🧪' }

function SupportPanel({ tickets, activeTicketId, setActiveTicketId, ticketFilter, setTicketFilter, saReply, setSaReply, onReply, onStatusChange, onAssign, superAdmins, onSendMedia, onOpenChat }) {
  const activeTicket = tickets.find(t => t.id === activeTicketId)
  const filtered = tickets.filter(t => ticketFilter === 'all' || t.status === ticketFilter)
  const fmt = ts => new Date(ts).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  // Auto-scroll de la lista de mensajes al final cuando llegan mensajes nuevos
  // o se cambia de ticket (supervisión en tiempo real).
  const msgsEndRef = useRef(null)
  const msgCount = activeTicket?.messages?.length || 0
  useEffect(() => { msgsEndRef.current?.scrollIntoView({ block: 'end' }) }, [msgCount, activeTicketId])

  // Short preview of the last message in a ticket (handles media-only messages)
  function lastMsgPreview(t) {
    const m = t.messages?.[t.messages.length - 1]
    if (!m) return ''
    const who = m.role === 'support' ? 'Soporte: ' : ''
    if (m.content && m.content.trim()) return who + m.content
    if (m.media) {
      const icon = m.media.kind === 'image' ? '🖼 Imagen' : m.media.kind === 'video' ? '🎬 Video' : m.media.kind === 'audio' ? '🎤 Audio' : '📎 Archivo'
      return who + icon
    }
    return ''
  }

  return (
    <div className={s.supportContent}>
      <div className={s.supportList}>
        <div className={s.supportListHeader}>
          <h2 className={s.pageTitle} style={{ fontSize: 18 }}>Tickets de soporte</h2>
          <div className={s.filterRow}>
            {['all', 'open', 'in_progress', 'closed'].map(f => (
              <button key={f} className={`${s.filterBtn} ${ticketFilter === f ? s.filterBtnActive : ''}`} onClick={() => setTicketFilter(f)}>
                {f === 'all' ? 'Todos' : STATUS_LABELS_SP[f]}
              </button>
            ))}
          </div>
        </div>
        <div className={s.supportTicketsList}>
          {filtered.length === 0 && <div className={s.emptyList}>Sin tickets</div>}
          {filtered.map(t => (
            <button key={t.id} className={`${s.supportTicketRow} ${activeTicketId === t.id ? s.supportTicketActive : ''}`} onClick={() => setActiveTicketId(t.id)}>
              <div className={s.stInfo}>
                <div className={s.stSubject}>{t.subject}</div>
                <div className={s.stMeta}>{t.accountName} · {fmt(t.updatedAt)}</div>
                {lastMsgPreview(t) && <div className={s.stLastMsg}>{lastMsgPreview(t)}</div>}
              </div>
              <div className={s.stRight}>
                <span className={s.stStatus} style={{ color: STATUS_COLORS_SP[t.status], background: STATUS_COLORS_SP[t.status] + '18' }}>{STATUS_LABELS_SP[t.status]}</span>
                {t.messages?.[t.messages.length - 1]?.role === 'user' && <span className={s.stUnread} />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {activeTicket ? (
        <div className={s.supportDetail}>
          <div className={s.sdHeader}>
            <div>
              <div className={s.sdSubject}>{activeTicket.subject}</div>
              <div className={s.sdMeta}>{activeTicket.accountName} · #{activeTicket.id.slice(-6)}</div>
            </div>
            <div className={s.sdActions}>
              <select className={s.statusSelect} value={activeTicket.status} onChange={e => onStatusChange(activeTicket.id, e.target.value)}>
                <option value="open">Abierto</option>
                <option value="in_progress">En progreso</option>
                <option value="closed">Cerrado</option>
              </select>
              <select className={s.statusSelect} value={activeTicket.assignedTo?.saId || ''}
                onChange={e => { const sa = superAdmins.find(sa => sa.id === e.target.value); if (sa) onAssign(activeTicket.id, sa.id, sa.name) }}>
                <option value="">Sin asignar</option>
                {superAdmins.map(sa => <option key={sa.id} value={sa.id}>{sa.name}</option>)}
              </select>
            </div>
          </div>
          {Array.isArray(activeTicket.refs) && activeTicket.refs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text3)', alignSelf: 'center' }}>Chats referenciados:</span>
              {activeTicket.refs.map(r => (
                <button key={r.convId} onClick={() => onOpenChat?.({ ...r, accId: r.accId || activeTicket.accId })}
                  title="Entrar a la cuenta y abrir el chat"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 14, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                  {SUPPORT_CHANNEL_ICON[r.channel] || '💬'} {r.guestName} <span style={{ color: 'var(--accent,#4fa8ff)' }}>→ ir al chat</span>
                </button>
              ))}
            </div>
          )}
          <div className={s.sdMessages} data-i18n-skip>
            {(activeTicket.messages || []).map(msg => (
              <div key={msg.id} className={`${s.sdMsg} ${msg.role === 'support' ? s.sdMsgSupport : s.sdMsgUser}`}>
                <div className={s.sdMsgAuthor}>{msg.role === 'support' ? '🎧 ' + msg.authorName : '👤 ' + msg.authorName}</div>
                {msg.media && (
                  <div style={{ margin: '4px 0', maxWidth: 300 }}>
                    <MediaMessage accId={activeTicket.accId} mediaId={msg.media.mediaId} kind={msg.media.kind}
                      mime={msg.media.mime} filename={msg.media.filename} sizeBytes={msg.media.sizeBytes} />
                  </div>
                )}
                {msg.content && <div className={s.sdMsgContent}>{msg.content}</div>}
                <div className={s.sdMsgTime}>{fmt(msg.ts)}</div>
              </div>
            ))}
            <div ref={msgsEndRef} />
          </div>
          {activeTicket.status !== 'closed' && (
            <div className={s.sdReplyArea}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <MediaInput
                  uploadFn={(file, fn) => uploadChatMedia(activeTicket.accId, file, `support_${activeTicket.id}`, fn)}
                  onUploaded={meta => onSendMedia(activeTicket.id, activeTicket.accId, meta)}
                />
              </div>
              <textarea className={s.sdReplyInput} rows={3} placeholder="Responder como Soporte AVI..." value={saReply} onChange={e => setSaReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), onReply(activeTicket.id))} />
              <button className={s.sdReplyBtn} onClick={() => onReply(activeTicket.id)} disabled={!saReply.trim()}>Enviar respuesta</button>
            </div>
          )}
          {activeTicket.status === 'closed' && (
            <div className={s.sdClosed}>Ticket cerrado · <button className={s.reopenBtn} onClick={() => onStatusChange(activeTicket.id, 'open')}>Reabrir</button></div>
          )}
        </div>
      ) : (
        <div className={s.supportEmpty}>Selecciona un ticket</div>
      )}
    </div>
  )
}

// ── Pricing editor for AI models ────────────────────────────────────────────
function PricingPanel({ flash }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState({}) // { [model]: { inputPer1k, outputPer1k, displayName } }
  const [newRow, setNewRow] = useState(null)

  async function reload() {
    setLoading(true)
    try { setRows(await getModelPricing()) } catch { setRows([]) }
    setLoading(false)
  }
  useEffect(() => { reload() }, [])

  async function save(model) {
    const e = editing[model]; if (!e) return
    try {
      await updateModelPricing(model, {
        inputPer1k:  parseFloat(e.inputPer1k)  || 0,
        outputPer1k: parseFloat(e.outputPer1k) || 0,
        displayName: e.displayName,
      })
      setEditing(prev => { const n = { ...prev }; delete n[model]; return n })
      flash('Tarifa actualizada ✓')
      reload()
    } catch (err) { flash('Error: ' + err.message) }
  }

  async function removeRow(model) {
    if (!confirm(`¿Eliminar tarifa de "${model}"?`)) return
    try { await deleteModelPricing(model); flash('Tarifa eliminada'); reload() }
    catch (err) { flash('Error: ' + err.message) }
  }

  async function createRow() {
    if (!newRow?.model) { flash('El identificador del modelo es obligatorio'); return }
    try {
      await updateModelPricing(newRow.model, {
        provider: newRow.provider || null,
        inputPer1k:  parseFloat(newRow.inputPer1k)  || 0,
        outputPer1k: parseFloat(newRow.outputPer1k) || 0,
        displayName: newRow.displayName || newRow.model,
      })
      setNewRow(null); flash('Modelo añadido ✓'); reload()
    } catch (err) { flash('Error: ' + err.message) }
  }

  function startEdit(r) { setEditing(prev => ({ ...prev, [r.model]: { ...r } })) }
  function patchEdit(model, patch) { setEditing(prev => ({ ...prev, [model]: { ...prev[model], ...patch } })) }
  function cancelEdit(model) { setEditing(prev => { const n = { ...prev }; delete n[model]; return n }) }

  const grouped = rows.reduce((acc, r) => { (acc[r.provider || 'otros'] = acc[r.provider || 'otros'] || []).push(r); return acc }, {})

  return (
    <div className={s.content}>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Tarifas de modelos IA</h1>
          <p className={s.pageSub}>Edita el costo por 1.000 tokens (input/output). Se usa para calcular el costo USD en el panel de cada cuenta.</p>
        </div>
        <div className={s.pageActions}>
          <button className={s.primaryBtn} onClick={() => setNewRow({ model: '', provider: 'openai', inputPer1k: 0, outputPer1k: 0, displayName: '' })}>
            + Añadir modelo
          </button>
        </div>
      </div>

      {newRow && (
        <div className={s.formCard}>
          <div className={s.formTitle}>Nuevo modelo</div>
          <div className={s.formGrid3}>
            <div className={s.field}><label>Modelo (id)</label><input value={newRow.model} onChange={e => setNewRow({ ...newRow, model: e.target.value })} placeholder="gpt-5" /></div>
            <div className={s.field}><label>Provider</label>
              <select value={newRow.provider} onChange={e => setNewRow({ ...newRow, provider: e.target.value })}>
                <option value="openai">openai</option>
                <option value="deepseek">deepseek</option>
                <option value="anthropic">anthropic</option>
                <option value="otros">otros</option>
              </select>
            </div>
            <div className={s.field}><label>Nombre visible</label><input value={newRow.displayName} onChange={e => setNewRow({ ...newRow, displayName: e.target.value })} placeholder="GPT-5" /></div>
            <div className={s.field}><label>USD por 1.000 tokens input</label><input type="number" step="0.000001" value={newRow.inputPer1k} onChange={e => setNewRow({ ...newRow, inputPer1k: e.target.value })} /></div>
            <div className={s.field}><label>USD por 1.000 tokens output</label><input type="number" step="0.000001" value={newRow.outputPer1k} onChange={e => setNewRow({ ...newRow, outputPer1k: e.target.value })} /></div>
          </div>
          <div className={s.formActions}>
            <button className={s.cancelBtn} onClick={() => setNewRow(null)}>Cancelar</button>
            <button className={s.primaryBtn} onClick={createRow}>Crear</button>
          </div>
        </div>
      )}

      {loading && <div className={s.emptyList}>Cargando...</div>}
      {!loading && Object.entries(grouped).map(([provider, list]) => (
        <div key={provider} className={s.settingsCard}>
          <div className={s.settingsCardTitle}>{provider.toUpperCase()} ({list.length} modelos)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text3)' }}>
                <th style={{ padding: '8px 8px' }}>Modelo</th>
                <th style={{ padding: '8px 8px' }}>Nombre</th>
                <th style={{ padding: '8px 8px', textAlign: 'right' }}>USD/1k input</th>
                <th style={{ padding: '8px 8px', textAlign: 'right' }}>USD/1k output</th>
                <th style={{ padding: '8px 8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {list.map(r => {
                const e = editing[r.model]
                return (
                  <tr key={r.model} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 8px', fontFamily: 'monospace', color: 'var(--text1)' }}>{r.model}</td>
                    <td style={{ padding: '8px 8px' }}>
                      {e ? <input value={e.displayName} onChange={ev => patchEdit(r.model, { displayName: ev.target.value })} style={{ width: '100%', background: 'var(--surface1)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', color: 'var(--text1)', fontSize: 12 }} />
                         : r.displayName}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {e ? <input type="number" step="0.000001" value={e.inputPer1k} onChange={ev => patchEdit(r.model, { inputPer1k: ev.target.value })} style={{ width: 110, background: 'var(--surface1)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', color: 'var(--text1)', fontSize: 12, textAlign: 'right' }} />
                         : '$' + Number(r.inputPer1k).toFixed(6)}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {e ? <input type="number" step="0.000001" value={e.outputPer1k} onChange={ev => patchEdit(r.model, { outputPer1k: ev.target.value })} style={{ width: 110, background: 'var(--surface1)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', color: 'var(--text1)', fontSize: 12, textAlign: 'right' }} />
                         : '$' + Number(r.outputPer1k).toFixed(6)}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {e ? <>
                        <button className={s.actionBtn} onClick={() => save(r.model)}>Guardar</button>
                        <button className={s.actionBtn} onClick={() => cancelEdit(r.model)}>Cancelar</button>
                      </> : <>
                        <button className={s.actionBtn} onClick={() => startEdit(r)}>Editar</button>
                        <button className={`${s.actionBtn} ${s.dangerBtn}`} onClick={() => removeRow(r.model)}>✕</button>
                      </>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ── Model selector grouped by provider ──────────────────────────────────────
function ModelSelect({ value, onChange }) {
  const grouped = AI_MODELS.reduce((acc, m) => {
    (acc[m.provider] = acc[m.provider] || []).push(m); return acc
  }, {})
  const labels = { openai: 'OpenAI', deepseek: 'DeepSeek', anthropic: 'Claude (Anthropic)' }
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      {Object.entries(grouped).map(([prov, models]) => (
        <optgroup key={prov} label={labels[prov] || prov}>
          {models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </optgroup>
      ))}
    </select>
  )
}
