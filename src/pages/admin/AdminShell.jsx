import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { useAccount } from '../../context/AccountContext'
import { AviMark } from '../../components/common/AviLogo'
import SelectionFx from '../../components/common/SelectionFx'
import MediaLightbox from '../../components/media/MediaLightbox'
import CursorFX from '../../components/common/CursorFX'
import SmoothFX from '../../components/common/SmoothFX'
import InboxPanel from '../../components/inbox/InboxPanel'
import ChannelsPanel from '../../components/channels/ChannelsPanel'
import KnowledgeBasePanel from '../../components/knowledge/KnowledgeBasePanel'
import BackupPanel from '../../components/backup/BackupPanel'
import TeamChatPanel from '../../components/teamchat/TeamChatPanel'
import SupportChatPanel from '../../components/support/SupportChatPanel'
import { ConfigPanel } from '../../components/inbox/ConfigPanel'
import MembersPanel from '../../components/inbox/MembersPanel'
import CRMPanel from '../../components/crm/CRMPanel'
import MassMessagesPanel from '../../components/campaigns/MassMessagesPanel'
import FlowsPanel from '../../components/flows/FlowsPanel'
import { VariablesPanel } from '../../components/inbox/VariablesPanel'
import { AIToolsPanel } from '../../components/inbox/VariablesPanel'
import TokenUsagePanel    from '../../components/analytics/TokenUsagePanel'
import MetricsPanel       from '../../components/analytics/MetricsPanel'
import PromptHistoryPanel from '../../components/analytics/PromptHistoryPanel'
import ZonaIAPanel from '../../components/inbox/ZonaIAPanel'
import OrdersBoard from '../../components/orders/OrdersBoard'
import MetricasPanel from '../../components/analytics/MetricasPanel'
import { NotificationProvider } from '../../context/NotificationContext'
import NotificationCenter from '../../components/notifications/NotificationCenter'
import NotificationToasts from '../../components/notifications/NotificationToasts'
import ProfilePage from '../../components/profile/ProfilePage'
import DocsPage from '../../components/help/DocsPage'
import DemoBanner from '../../components/account/DemoBanner'
import DemoAds from '../../components/account/DemoAds'
import { useI18n } from '../../context/I18nContext'
import { startWhatsAppListener, stopWhatsAppListener } from '../../lib/whatsappSSE'
import { checkAndAutoBackup } from '../../lib/storage'
import { getSocket, connectSocket, getToken } from '../../lib/api'
import s from './AdminShell.module.css'

const PROVIDER_NAME = { openai: 'OpenAI', deepseek: 'DeepSeek', anthropic: 'Claude' }
// Icono propio de cada pestaña del menú (Equipo/Soporte se definen en el JSX).
const RAIL_ICONS = { inbox: '📥', crm: '👥', masivos: '📣', flows: '🔀', 'zona-ia': '🧠', pedidos: '🛵', config: '⚙️', metricas: '📊' }
const PROVIDER_COLOR = { openai: '#22d98a', deepseek: '#4fa8ff', anthropic: '#c179ff' }

// `module` = módulo de cuenta que debe estar activo para ver la pestaña.
// Las pestañas sin `module` (config) son esenciales y siempre se muestran.
const TABS = [
  { id: 'inbox',    labelKey: 'nav.inbox',    perm: 'inbox',    module: 'inbox',     tip: 'Bandeja de conversaciones: lee y responde los chats de tus clientes de todos los canales.' },
  { id: 'crm',      labelKey: 'nav.crm',      perm: 'pipeline', module: 'crm',       tip: 'CRM y pipeline: gestiona contactos y mueve oportunidades por tus embudos de venta.' },
  { id: 'masivos',  label: '📣 Masivos',      perm: 'pipeline', module: 'campaigns', tip: 'Campañas: envía mensajes masivos a segmentos de tus contactos.' },
  { id: 'flows',    labelKey: 'nav.flows',    perm: 'flows',    module: 'flows',     tip: 'Flujos: automatizaciones que responden, llaman APIs y orquestan la IA con tu CRM.' },
  { id: 'zona-ia',  labelKey: 'nav.zonaIA',   perm: 'tools',    module: 'ai_agents', tip: 'Zona IA: configura el prompt del agente, sus herramientas y variables.' },
  { id: 'config',   labelKey: 'nav.config',   perm: 'config',                        tip: 'Configuración: APIs, canales, calendarios, catálogo de Meta, equipo y módulos.' },
  { id: 'metricas', labelKey: 'nav.metricas', perm: 'config',   module: 'metrics',   tip: 'Métricas: analítica de uso, conversaciones y desempeño del agente.' },
]

export default function AdminShell() {
  const { session, logout, can, stopImpersonating } = useAuth()
  const { t: tr } = useI18n()
  const { account, allAgentAccounts, switchToAgent, visibleAgents, selectedAgent, selectedAgentId, setSelectedAgentId, getConvos, reloadConvos, pendingOpen, openConversation, hasModule } = useAccount()
  // Recuerda la última pestaña abierta entre recargas (por usuario).
  const tabKey = `avi.activeTab.${session?.id || 'anon'}`
  const [tab, setTab] = useState(() => { try { return localStorage.getItem(tabKey) || 'inbox' } catch { return 'inbox' } })
  useEffect(() => { try { localStorage.setItem(tabKey, tab) } catch {} }, [tab, tabKey])

  // Deep-link a una conversación (desde tickets o pipeline): cambia a Inbox y
  // selecciona el agente. InboxPanel se encarga de seleccionar la conversación.
  useEffect(() => {
    if (!pendingOpen) return
    if (pendingOpen.agentId) setSelectedAgentId(pendingOpen.agentId)
    setTab('inbox')
  }, [pendingOpen?.ts])

  // Handoff desde el super admin: si pidió abrir un chat de esta cuenta (tras
  // impersonar), lo abrimos cuando la cuenta ya está cargada.
  useEffect(() => {
    if (!account?.id) return
    let pend = null
    try { pend = JSON.parse(localStorage.getItem('avi_pending_open') || 'null') } catch {}
    if (pend && pend.accId === account.id && pend.agentId && pend.convId) {
      localStorage.removeItem('avi_pending_open')
      openConversation(pend.agentId, pend.convId)
    }
  }, [account?.id])
  const [sseStatus, setSseStatus] = useState('connecting')
  const [teamChatUnread, setTeamChatUnread] = useState(0)
  const [supportUnread, setSupportUnread] = useState(0)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const switcherRef = useRef(null)

  // Notificaciones — disponible sólo dentro de NotificationProvider
  // Se usa un ref lazy para no requerir el hook en el nivel superior
  const notifyRef = useRef(null)

  useEffect(() => {
    startWhatsAppListener(
      (msg) => {
        reloadConvos()
        setSseStatus('connected')
        // Emitir notificación si viene con datos de mensaje
        if (msg?.type === 'new_message' && notifyRef.current) {
          notifyRef.current({
            type: 'message',
            icon: '💬',
            title: msg.senderName || 'Nuevo mensaje',
            body:  msg.preview   || '',
            link:  'inbox',
          })
        }
      },
      (status) => setSseStatus(status)
    )
    return () => stopWhatsAppListener()
  }, [])

  // Auto-backup for current agent when it changes
  useEffect(() => {
    if (account?.id && selectedAgentId) checkAndAutoBackup(account.id, selectedAgentId)
  }, [account?.id, selectedAgentId])

  // Track unread counts for sidebar badges — driven by socket events so they
  // reflect real-time activity across devices (not just the same browser tab).
  const tabRef = useRef(tab)
  tabRef.current = tab
  useEffect(() => {
    if (!account?.id) return
    const sock = getSocket()
    if (!sock.connected && getToken()) connectSocket(getToken())

    const onTeamMsg = ({ accId, msg }) => {
      if (accId && accId !== account.id) return
      if (msg?.authorId === session?.id) return        // ignore my own messages
      if (tabRef.current !== 'teamchat') {
        setTeamChatUnread(n => n + 1)
        const isDM = String(msg?.channel || '').startsWith('dm_')
        notifyRef.current?.({
          type: isDM ? 'internal' : 'team',
          icon: isDM ? '🔒' : '👥',
          title: msg?.authorName || (isDM ? 'Mensaje directo' : 'Chat de equipo'),
          body: msg?.content || '', link: 'teamchat',
        })
      }
    }
    const onSupport = ({ accId, lastRole }) => {
      if (accId && accId !== account.id) return
      if (lastRole !== 'support') return               // only count replies from AVI support
      if (tabRef.current !== 'supportchat') {
        setSupportUnread(n => n + 1)
        notifyRef.current?.({ type: 'support', icon: '🎧', title: 'Soporte AVI', body: 'Nueva respuesta del equipo de soporte.', link: 'supportchat' })
      }
    }
    // Targeted notification when a conversation is assigned to me
    const onAssigned = ({ guestName, preview, assignedBy }) => {
      notifyRef.current?.({
        type: 'crm', icon: '👤',
        title: 'Conversación asignada a ti',
        body: `${assignedBy || 'Un compañero'} te asignó "${guestName || 'una conversación'}"${preview ? ` — ${preview}` : ''}`,
        link: 'inbox',
      })
    }
    sock.on('teamchat:message', onTeamMsg)
    sock.on('support:updated',  onSupport)
    sock.on('conv:assigned',    onAssigned)
    return () => {
      sock.off('teamchat:message', onTeamMsg)
      sock.off('support:updated', onSupport)
      sock.off('conv:assigned', onAssigned)
    }
  }, [account?.id, session?.id])

  useEffect(() => {
    if (tab === 'teamchat') setTeamChatUnread(0)
    if (tab === 'supportchat') setSupportUnread(0)
  }, [tab])

  // Nota: el cierre por click-afuera se maneja DENTRO de AccountSwitcher porque
  // el desplegable se renderiza con createPortal a document.body y no es
  // descendiente DOM del wrapper (switcherRef). Si se hiciera aquí, el mousedown
  // sobre una opción cerraría el menú antes de que se registre el click.

  const availableTabs = TABS.filter(t => can(t.perm) && (!t.module || hasModule(t.module)))
  // Pestaña operativa de Pedidos: visible cuando el módulo tiene menú (connected).
  if (account?.orders?.connected && can('inbox')) {
    const i = availableTabs.findIndex(t => t.id === 'inbox')
    availableTabs.splice(i >= 0 ? i + 1 : availableTabs.length, 0, { id: 'pedidos', label: '🛵 Pedidos', perm: 'inbox', tip: 'Tablero de pedidos: sigue y gestiona en tiempo real los pedidos que crea el asistente.' })
  }
  const showTeamChat = hasModule('teamchat')

  // Si la pestaña recordada ya no está disponible para esta cuenta, cae a la
  // primera válida (evita quedar en una pestaña vacía tras recargar).
  const tabIsValid = availableTabs.some(t => t.id === tab) || tab === 'supportchat' || (tab === 'teamchat' && showTeamChat)
  useEffect(() => {
    if (!account) return
    if (!tabIsValid) setTab(availableTabs[0]?.id || 'inbox')
  }, [account?.id, tabIsValid])

  const unread = (agId) => (getConvos(agId) || []).filter(c => c.unread).length
  const totalUnread = visibleAgents.reduce((sum, ag) => sum + unread(ag.id), 0)

  const activePrompt = selectedAgent?.prompts?.find(p => p.isActive)
  const providerColor = PROVIDER_COLOR[activePrompt?.provider] || '#22d98a'

  const hasAnyConnectedChannel = visibleAgents.some(ag =>
    (ag.channels || []).some(c => ['whatsapp', 'messenger', 'instagram'].includes(c.type) && c.status === 'connected')
  )

  // Alphabetical list for topbar switcher
  // Sort by account name (each account has 1 agent — show the account, not the agent)
  const alphabeticalAccounts = [...allAgentAccounts].sort((a, b) =>
    a.accountName.localeCompare(b.accountName)
  )
  const multiAccount = allAgentAccounts.length > 1

  return (
    <NotificationProvider>
    <div className={s.shell}>
      <NotificationToasts />
      <CursorFX />
      <SmoothFX />
      <MediaLightbox />

      {/* Orbes difuminados de marca: el fondo vivo que se percibe a través del cristal */}
      <div className={s.orbs} aria-hidden="true"><i className={s.orb1} /><i className={s.orb2} /><i className={s.orb3} /></div>

      {/* Riel de navegación (escritorio): iconos con etiqueta, logo arriba, usuario abajo */}
      <aside className={s.rail}>
        <div className={s.railLogo} title="AVI Platform"><AviMark size={30} /></div>
        <nav className={s.railNav}>
          {availableTabs.map(t => {
            const raw = (t.labelKey ? tr(t.labelKey) : t.label) || ''
            // Icono consistente por pestaña; se quita cualquier emoji del texto.
            const icon = RAIL_ICONS[t.id] || '📄'
            const label = raw.replace(/^\s*\p{Extended_Pictographic}️?\s*/u, '').trim() || raw
            return (
              <button key={t.id} className={`${s.railBtn} ${tab === t.id ? s.railActive : ''}`} onClick={() => setTab(t.id)} title={t.tip}>
                {tab === t.id && <SelectionFx />}
                <span className={s.railIcon}>{icon}</span>
                <span className={s.railLabel}>{label}</span>
                {t.id === 'inbox' && totalUnread > 0 && <span className={s.railBadge}>{totalUnread}</span>}
              </button>
            )
          })}
          {showTeamChat && (
            <button className={`${s.railBtn} ${tab === 'teamchat' ? s.railActive : ''}`} onClick={() => setTab('teamchat')} title="Chat de equipo: mensajería interna entre los miembros de tu cuenta.">
              {tab === 'teamchat' && <SelectionFx />}
              <span className={s.railIcon}>💬</span><span className={s.railLabel}>Equipo</span>
              {teamChatUnread > 0 && <span className={s.railBadge}>{teamChatUnread}</span>}
            </button>
          )}
          <button className={`${s.railBtn} ${tab === 'supportchat' ? s.railActive : ''}`} onClick={() => setTab('supportchat')} title="Soporte AVI: chatea con el equipo de soporte de la plataforma.">
            {tab === 'supportchat' && <SelectionFx />}
            <span className={s.railIcon}>🎧</span><span className={s.railLabel}>Soporte</span>
            {supportUnread > 0 && <span className={s.railBadge}>{supportUnread}</span>}
          </button>
        </nav>
        <div className={s.railBottom}>
          <button className={s.railBtn} onClick={() => setShowHelp(true)} title="Centro de ayuda: guía de cada funcionalidad">
            <span className={s.railIcon}>❓</span>
          </button>
          <button onClick={() => setShowProfile(true)} title={`${session?.name || ''} · Ver perfil`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            {session?.photo
              ? <img src={session.photo} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--accent-glow)' }} />
              : <span className={s.userAvatar} style={{ width: 30, height: 30 }}>{session?.name?.slice(0, 2).toUpperCase()}</span>}
          </button>
        </div>
      </aside>

      {/* Barra lateral retirada: la navegación vive ahora en el riel. */}
      <aside className={s.sidebar} style={{ display: 'none' }}>
        <div className={s.brand}>
          <AviMark size={32} />
          <div>
            <div className={s.brandName}>avi platform</div>
            <div className={s.brandAcc}>{account?.name}</div>
          </div>
        </div>

        {session?.isImpersonating && (
          <div className={s.impBanner}>
            <span>👁 Vista de super admin{session?.name ? ` — ${session.name}` : ''}</span>
            <button onClick={stopImpersonating} className={s.impBackBtn}>← Volver</button>
          </div>
        )}

        {/* Account list — each card = one client account (which has 1 agent + N prompts) */}
        <div className={s.sectionLabel}>Cuentas</div>
        <div className={s.agentList}>
          {allAgentAccounts.map(aa => {
            const isActive = aa.agentId === selectedAgentId && aa.accountId === account?.id
            const agActivePrompt = aa.agent?.prompts?.find(p => p.isActive)
            const channels = aa.agent?.channels || []
            return (
              <button
                key={`${aa.accountId}_${aa.agentId}`}
                className={`${s.agentBtn} ${isActive ? s.agentActive : ''}`}
                onClick={() => { switchToAgent(aa.accountId, aa.agentId); setTab('inbox') }}
                title={`Prompt activo: ${agActivePrompt?.name || '—'}`}
              >
                <span className={`${s.dot} ${aa.agentStatus === 'active' ? s.dotGreen : s.dotAmber}`} />
                <div className={s.agMeta}>
                  <span className={s.agName}>{aa.accountName}</span>
                  <span className={s.agSub}>
                    {agActivePrompt
                      ? <span style={{ color: agActivePrompt.provider === 'anthropic' ? '#c179ff' : agActivePrompt.provider === 'deepseek' ? '#4fa8ff' : '#22d98a' }}>{agActivePrompt.name}</span>
                      : <span style={{ color: 'var(--text3)' }}>sin prompt activo</span>}
                    {channels.length > 0 && <span style={{ color: 'var(--text3)' }}> · {channels.length} canales</span>}
                    {aa.agent?.rag?.enabled && aa.agent?.rag?.files?.length > 0 && (
                      <span style={{ color: '#7c6fff' }}> · RAG</span>
                    )}
                  </span>
                </div>
                {aa.unreadCount > 0 && <span className={s.badge}>{aa.unreadCount}</span>}
              </button>
            )
          })}
          {allAgentAccounts.length === 0 && <div className={s.noAgents}>Sin cuentas asignadas</div>}
        </div>

        {/* Communication section */}
        <div className={s.sectionLabel}>Comunicación</div>
        <div className={s.commNav}>
          <button
            className={`${s.commBtn} ${tab === 'teamchat' ? s.commActive : ''}`}
            onClick={() => setTab('teamchat')}
          >
            <span className={s.commIcon}>💬</span>
            <span className={s.commLabel}>Chat de Equipo</span>
            {teamChatUnread > 0 && <span className={s.badge}>{teamChatUnread}</span>}
          </button>
          <button
            className={`${s.commBtn} ${tab === 'supportchat' ? s.commActive : ''}`}
            onClick={() => setTab('supportchat')}
          >
            <span className={s.commIcon}>🎧</span>
            <span className={s.commLabel}>Soporte AVI</span>
            {supportUnread > 0 && <span className={s.badge}>{supportUnread}</span>}
          </button>
        </div>

        {hasAnyConnectedChannel && (
          <div className={s.sseStatus}>
            <span className={`${s.sseDot} ${sseStatus === 'connected' ? s.sseDotGreen : sseStatus === 'error' ? s.sseDotRed : s.sseDotAmber}`} />
            <span className={s.sseLabel}>
              Canales {sseStatus === 'connected' ? 'en línea' : sseStatus === 'error' ? 'error' : 'conectando...'}
            </span>
          </div>
        )}

        <div className={s.sidebarBottom}>
          <div className={s.userInfo} style={{ cursor: 'pointer' }} onClick={() => setShowProfile(true)} title="Ver mi perfil">
            <div className={s.userAvatar}>{session?.name?.slice(0, 2).toUpperCase()}</div>
            <div className={s.userMeta}>
              <div className={s.userName}>{session?.name}</div>
              <div className={s.userRole}>{account?.roles?.find(r => r.id === session?.roleId)?.name || 'Owner'}</div>
            </div>
          </div>
          <button className={s.logoutBtn} onClick={logout} title="Cerrar sesión">↩</button>
        </div>
      </aside>

      <main className={s.main}>
        <DemoBanner />
        <DemoAds />
        {true && (
          <div className={s.topBar}>
            {/* Breadcrumb PLATAFORMA / [cuenta] + estado + prompt activo */}
            <div className={s.agentHeader}>
              <span className="onlyMobile"><AviMark size={26} style={{ display: 'block' }} /></span>
              {account && (
                <>
                  <span className={s.agTitle}>{account.name}</span>
                  {selectedAgent && (
                    <span className={`${s.statusChip} ${selectedAgent.status === 'active' ? s.chipGreen : s.chipAmber}`}>
                      {selectedAgent.status === 'active' ? 'Activo' : 'Borrador'}
                    </span>
                  )}
                  {activePrompt && (
                    <span className={s.promptChip} style={{ color: providerColor, background: providerColor + '15', borderColor: providerColor + '40' }}
                      title={`Prompt activo del agente · ${PROVIDER_NAME[activePrompt.provider] || activePrompt.provider}`}
                    >
                      🤖 {activePrompt.name} · {PROVIDER_NAME[activePrompt.provider] || 'OpenAI'} / {activePrompt.model}
                    </span>
                  )}
                  {selectedAgent?.rag?.enabled && selectedAgent?.rag?.files?.length > 0 && (
                    <span className={s.ragChip}>📚 RAG · {selectedAgent.rag.files.length} arch.</span>
                  )}
                </>
              )}
            </div>

            {/* Lado derecho del header: cambiar cuenta + notificaciones (+ menú móvil) */}
            <div className={s.topRight}>
              <AccountSwitcher
                ref={switcherRef}
                open={switcherOpen}
                setOpen={setSwitcherOpen}
                accounts={alphabeticalAccounts}
                currentAgentId={selectedAgentId}
                currentAccountId={account?.id}
                onPick={(accId, agId) => { switchToAgent(accId, agId); setTab('inbox'); setSwitcherOpen(false) }}
              />
              <NotificationCenter onNavigate={t => setTab(t)} onRegister={fn => { notifyRef.current = fn }} />
              {/* Hamburguesa (solo móvil): abre el menú de secciones como desplegable */}
              <button className={s.hamburger} onClick={() => setMobileNav(v => !v)} aria-label="Menú" title="Menú">
                {mobileNav ? '✕' : '☰'}
                {!mobileNav && (totalUnread + teamChatUnread + supportUnread) > 0 && <span className={s.hamburgerDot} />}
              </button>
            </div>

          </div>
        )}

        {/* Menú móvil desplegable (reemplaza el scroll horizontal de pestañas) */}
        {mobileNav && (
          <div className={s.mobileMenu}>
            {availableTabs.map(t => (
              <button key={t.id} className={`${s.mobileItem} ${tab === t.id ? s.mobileItemActive : ''}`} onClick={() => { setTab(t.id); setMobileNav(false) }} title={t.tip}>
                <span>{t.labelKey ? tr(t.labelKey) : t.label}</span>
                {t.id === 'inbox' && totalUnread > 0 && <span className={s.tabBadge}>{totalUnread}</span>}
              </button>
            ))}
            {showTeamChat && (
              <button className={`${s.mobileItem} ${tab === 'teamchat' ? s.mobileItemActive : ''}`} onClick={() => { setTab('teamchat'); setMobileNav(false) }}>
                <span>💬 Equipo</span>{teamChatUnread > 0 && <span className={s.tabBadge}>{teamChatUnread}</span>}
              </button>
            )}
            <button className={`${s.mobileItem} ${tab === 'supportchat' ? s.mobileItemActive : ''}`} onClick={() => { setTab('supportchat'); setMobileNav(false) }}>
              <span>🎧 Soporte</span>{supportUnread > 0 && <span className={s.tabBadge}>{supportUnread}</span>}
            </button>
            <div className={s.mobileSep} />
            <button className={s.mobileItem} onClick={() => { setShowHelp(true); setMobileNav(false) }}><span>❓ Centro de ayuda</span></button>
            <button className={s.mobileItem} onClick={() => { setShowProfile(true); setMobileNav(false) }}><span>👤 Mi perfil</span></button>
          </div>
        )}

        <div className={s.content}>
          {tab === 'inbox'    && <InboxPanel />}
          {tab === 'crm'      && <CRMPanel />}
          {tab === 'masivos'  && <MassMessagesPanel />}
          {tab === 'flows'    && <FlowsPanel />}
          {tab === 'zona-ia'  && <ZonaIAPanel />}
          {tab === 'pedidos'  && <OrdersBoard />}
          {tab === 'config'   && <ConfigPanel />}
          {tab === 'metricas' && <MetricasPanel />}
          {tab === 'teamchat'    && <TeamChatPanel account={account} agents={visibleAgents} session={session} selectedAgent={selectedAgent} />}
          {tab === 'supportchat' && <SupportChatPanel account={account} session={session} />}
        </div>
      </main>
      {showProfile && <ProfilePage onClose={() => setShowProfile(false)} />}
      {showHelp && <DocsPage onClose={() => setShowHelp(false)} />}
    </div>
    </NotificationProvider>
  )
}

// ── Account switcher (portal-rendered to escape topbar overflow clipping) ──
import { forwardRef } from 'react'
const AccountSwitcher = forwardRef(function AccountSwitcher(
  { open, setOpen, accounts, currentAgentId, currentAccountId, onPick },
  ref
) {
  const btnRef = useRef(null)
  const dropdownRef = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 260) - 8)), minWidth: Math.max(r.width, 260), maxHeight: Math.max(160, window.innerHeight - r.bottom - 16) })
  }, [open])

  // Close on outside click. Both the toggle button and the portaled dropdown
  // must be excluded — the dropdown lives in document.body, not inside the wrapper.
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (btnRef.current?.contains(e.target)) return
      if (dropdownRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, setOpen])

  // Re-position on window resize while open
  useEffect(() => {
    if (!open) return
    function reposition() {
      if (!btnRef.current) return
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 260) - 8)), minWidth: Math.max(r.width, 260), maxHeight: Math.max(160, window.innerHeight - r.bottom - 16) })
    }
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  return (
    <div className={s.switcherWrap} ref={ref}>
      <button ref={btnRef} className={s.switcherBtn} onClick={() => setOpen(o => !o)}>
        Cambiar cuenta ▾
      </button>
      {open && pos && createPortal(
        <div
          ref={dropdownRef}
          className={s.switcherDropdown}
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.minWidth, maxWidth: 'calc(100vw - 16px)', maxHeight: pos.maxHeight, overflowY: 'auto', overflowX: 'hidden', zIndex: 9999 }}
        >
          <div className={s.switcherTitle}>Cuentas — A·Z</div>
          {accounts.map(aa => {
            const isActive = aa.agentId === currentAgentId && aa.accountId === currentAccountId
            return (
              <button
                key={`${aa.accountId}_${aa.agentId || 'noagent'}`}
                className={`${s.switcherItem} ${isActive ? s.switcherItemActive : ''}`}
                onClick={() => onPick(aa.accountId, aa.agentId)}
              >
                <span className={`${s.dot} ${aa.agentStatus === 'active' ? s.dotGreen : s.dotAmber}`} />
                <div className={s.switcherItemInfo}>
                  <span className={s.switcherItemName}>{aa.accountName}</span>
                  <span className={s.switcherItemAcc}>{aa.noAgents ? 'Sin agentes IA todavía' : `Prompt activo: ${aa.agent?.prompts?.find(p => p.isActive)?.name || aa.agentName}`}</span>
                </div>
                {aa.unreadCount > 0 && <span className={s.badge}>{aa.unreadCount}</span>}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
})
