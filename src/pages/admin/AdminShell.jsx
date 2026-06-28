import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { useAccount } from '../../context/AccountContext'
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
import MetricasPanel from '../../components/analytics/MetricasPanel'
import { NotificationProvider } from '../../context/NotificationContext'
import NotificationCenter from '../../components/notifications/NotificationCenter'
import NotificationToasts from '../../components/notifications/NotificationToasts'
import ProfileModal from '../../components/profile/ProfileModal'
import HelpCenter from '../../components/help/HelpCenter'
import DemoBanner from '../../components/account/DemoBanner'
import { useI18n } from '../../context/I18nContext'
import { startWhatsAppListener, stopWhatsAppListener } from '../../lib/whatsappSSE'
import { checkAndAutoBackup } from '../../lib/storage'
import { getSocket, connectSocket, getToken } from '../../lib/api'
import s from './AdminShell.module.css'

const PROVIDER_NAME = { openai: 'OpenAI', deepseek: 'DeepSeek', anthropic: 'Claude' }
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
  const [tab, setTab] = useState('inbox')

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
  const showTeamChat = hasModule('teamchat')
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
      {/* Barra lateral retirada: la navegación vive ahora en la barra superior. */}
      <aside className={s.sidebar} style={{ display: 'none' }}>
        <div className={s.brand}>
          <div className={s.brandMark}>▲</div>
          <div>
            <div className={s.brandName}>PLATAFORMA</div>
            <div className={s.brandAcc}>{account?.name}</div>
          </div>
        </div>

        {session?.isImpersonating && (
          <div className={s.impBanner}>
            <span>👁 Vista como Owner</span>
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
        {true && (
          <div className={s.topBar}>
            {/* Breadcrumb PLATAFORMA / [cuenta] + estado + prompt activo */}
            <div className={s.agentHeader}>
              <div className={s.brandMark} title="AVI PLATFORM" style={{ width: 26, height: 26, fontSize: 12 }}>▲</div>
              {account && (
                <>
                  <span className={s.brandCrumb} style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '.5px', textTransform: 'uppercase' }}>AVI PLATFORM</span>
                  <span className={s.brandCrumb} style={{ color: 'var(--text3)', margin: '0 2px' }}>/</span>
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

              {/* Topbar account switcher — always shown so the user can re-pick
                  even when they only belong to one account (allows re-checking the active state). */}
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

            <div className={s.tabs}>
              {availableTabs.map(t => (
                <button
                  key={t.id}
                  className={`${s.tab} ${tab === t.id ? s.tabActive : ''}`}
                  onClick={() => setTab(t.id)}
                  title={t.tip}
                >
                  {t.labelKey ? tr(t.labelKey) : t.label}
                  {t.id === 'inbox' && totalUnread > 0 && (
                    <span className={s.tabBadge}>{totalUnread}</span>
                  )}
                </button>
              ))}
              {/* Comunicación (movida desde la barra lateral) */}
              {showTeamChat && (
                <button className={`${s.tab} ${tab === 'teamchat' ? s.tabActive : ''}`} onClick={() => setTab('teamchat')} title="Chat de equipo: mensajería interna entre los miembros de tu cuenta (canales y mensajes directos).">
                  💬 Equipo {teamChatUnread > 0 && <span className={s.tabBadge}>{teamChatUnread}</span>}
                </button>
              )}
              <button className={`${s.tab} ${tab === 'supportchat' ? s.tabActive : ''}`} onClick={() => setTab('supportchat')} title="Soporte AVI: chatea con el equipo de soporte de la plataforma.">
                🎧 Soporte {supportUnread > 0 && <span className={s.tabBadge}>{supportUnread}</span>}
              </button>
              {/* Centro de ayuda */}
              <button onClick={() => setShowHelp(true)} title="Centro de ayuda: guía de cada funcionalidad"
                style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 8, cursor: 'pointer', padding: '3px 9px', color: 'var(--text2)', fontSize: 14 }}>❓</button>
              {/* Perfil + cerrar sesión */}
              <button onClick={() => setShowProfile(true)} title={`${session?.name || ''} · Ver perfil`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 6px', display: 'flex', alignItems: 'center' }}>
                <span className={s.userAvatar} style={{ width: 28, height: 28 }}>{session?.name?.slice(0, 2).toUpperCase()}</span>
              </button>
              <button className={s.logoutBtn} onClick={logout} title="Cerrar sesión" style={{ marginRight: 4 }}>↩</button>
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
            <button className={s.mobileItem} onClick={logout}><span>↩ Cerrar sesión</span></button>
          </div>
        )}

        <div className={s.content}>
          {tab === 'inbox'    && <InboxPanel />}
          {tab === 'crm'      && <CRMPanel />}
          {tab === 'masivos'  && <MassMessagesPanel />}
          {tab === 'flows'    && <FlowsPanel />}
          {tab === 'zona-ia'  && <ZonaIAPanel />}
          {tab === 'config'   && <ConfigPanel />}
          {tab === 'metricas' && <MetricasPanel />}
          {tab === 'teamchat'    && <TeamChatPanel account={account} agents={visibleAgents} session={session} selectedAgent={selectedAgent} />}
          {tab === 'supportchat' && <SupportChatPanel account={account} session={session} />}
        </div>
      </main>
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showHelp && <HelpCenter onClose={() => setShowHelp(false)} />}
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
    setPos({ top: r.bottom + 6, left: r.left, minWidth: Math.max(r.width, 260) })
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
      setPos({ top: r.bottom + 6, left: r.left, minWidth: Math.max(r.width, 260) })
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
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.minWidth, zIndex: 9999 }}
        >
          <div className={s.switcherTitle}>Cuentas — A·Z</div>
          {accounts.map(aa => {
            const isActive = aa.agentId === currentAgentId && aa.accountId === currentAccountId
            return (
              <button
                key={`${aa.accountId}_${aa.agentId}`}
                className={`${s.switcherItem} ${isActive ? s.switcherItemActive : ''}`}
                onClick={() => onPick(aa.accountId, aa.agentId)}
              >
                <span className={`${s.dot} ${aa.agentStatus === 'active' ? s.dotGreen : s.dotAmber}`} />
                <div className={s.switcherItemInfo}>
                  <span className={s.switcherItemName}>{aa.accountName}</span>
                  <span className={s.switcherItemAcc}>Prompt activo: {aa.agent?.prompts?.find(p => p.isActive)?.name || aa.agentName}</span>
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
