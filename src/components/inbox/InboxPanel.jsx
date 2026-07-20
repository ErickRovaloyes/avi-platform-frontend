import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { useAccount } from '../../context/AccountContext'
import { appendMsg, appendDebugEntry, sendManualMessage, uploadMedia, mediaUrl, listSavedFilters, createSavedFilter, deleteSavedFilter } from '../../lib/storage'
import GalleryModal from './GalleryModal'
import PipelineConvoModal from '../pipeline/PipelineConvoModal'
import ConvSidePanel from './ConvSidePanel'
import SelectionFx from '../common/SelectionFx'
import RunFlowModal from './RunFlowModal'
import BookAppointmentModal from './BookAppointmentModal'
import WhatsAppTemplateModal from './WhatsAppTemplateModal'
import PresenceIndicator from './PresenceIndicator'
import MediaInput   from '../media/MediaInput'
import StickerPicker from './StickerPicker'
import MediaMessage from '../media/MediaMessage'
import FormattedMessage from '../common/FormattedMessage'
import CalendarMessage from '../common/CalendarMessage'
import ChatToolbar  from '../chat/ChatToolbar'
import VarAutocomplete from '../common/VarAutocomplete'
import { interpolateConvVars } from '../../lib/interpolateVars'
import { exportChatAsJson, exportChatAsMarkdown } from '../../lib/chatExport'
import s from './InboxPanel.module.css'
import t from './ChatThemes.module.css'

// ── Chat skin definitions ────────────────────────────────────────────────────
// Each skin maps to a CSS class in ChatThemes.module.css. The default skin for
// a conversation is the one matching its source channel; the asesor can pick a
// different one from the dropdown in the chat header — the preference is saved
// locally per (user, conversation) so it never affects other team members.
const SKINS = [
  { id: 'auto',      label: 'Auto (canal)', icon: '🎨', swatch: 'linear-gradient(135deg, #22d98a, #4fa8ff, #e1306c)' },
  { id: 'webchat',   label: 'Webchat',      icon: '🌐', swatch: '#1f2030',                                            cls: 'themeWebchat' },
  { id: 'whatsapp',  label: 'WhatsApp',     icon: '📱', swatch: '#efeae2 linear-gradient(0deg,#008069 30%,#efeae2 30%)', cls: 'themeWhatsapp' },
  { id: 'whatsapp-dark',  label: 'WhatsApp oscuro',  icon: '🌙', swatch: 'linear-gradient(0deg,#1f2c33 30%,#0b141a 30%)', cls: 'themeWhatsappDark' },
  { id: 'messenger', label: 'Messenger',    icon: '💬', swatch: 'linear-gradient(135deg,#fff 50%,#0084ff 50%)',         cls: 'themeMessenger' },
  { id: 'messenger-dark', label: 'Messenger oscuro', icon: '🌙', swatch: 'linear-gradient(135deg,#242526 50%,#0084ff 50%)', cls: 'themeMessengerDark' },
  { id: 'instagram', label: 'Instagram',    icon: '📸', swatch: 'linear-gradient(135deg,#833ab4,#c13584,#e1306c,#fd1d1d)', cls: 'themeInstagram' },
  { id: 'instagram-dark', label: 'Instagram oscuro', icon: '🌙', swatch: 'linear-gradient(135deg,#000 55%,#c13584,#fd1d1d)', cls: 'themeInstagramDark' },
  { id: 'custom',    label: 'Personalizado', icon: '🎨', swatch: 'linear-gradient(135deg,#3b82f6,#111)', custom: true },
]

function channelToSkinId(channel) {
  if (channel === 'whatsapp')  return 'whatsapp'
  if (channel === 'messenger') return 'messenger'
  if (channel === 'instagram') return 'instagram'
  return 'webchat'
}

const WA_WINDOW_MS = 24 * 60 * 60 * 1000
// Estado de la ventana de servicio de 24h de WhatsApp. Se reinicia con cada
// mensaje ENTRANTE del cliente; fuera de ella solo se permiten plantillas/flujo.
function waWindowState(conv) {
  if (!conv || conv.channel !== 'whatsapp') return null
  let lastTs = 0
  for (const m of conv.messages || []) { if (m.sender === 'user' && (m.ts || 0) > lastTs) lastTs = m.ts || 0 }
  const expiresAt = lastTs ? lastTs + WA_WINDOW_MS : 0
  return { lastTs, expiresAt, open: !!lastTs && Date.now() < expiresAt }
}
function fmtRemaining(ms) {
  if (ms <= 0) return ''
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

const EMPTY_FILTERS = {
  q: '', aiState: 'all', labelIds: [], labelMatch: 'any', assignee: 'all',
  unread: false, flowRunning: false, followup: false, unreplied: false,
  activity: 'any', created: 'any', waWindow: 'any', minMsgs: '',
}
// Normaliza un filtro (rellena claves nuevas + migra el antiguo labelId → labelIds).
function normalizeFilters(f) {
  const n = { ...EMPTY_FILTERS, ...(f || {}) }
  if (!Array.isArray(n.labelIds)) n.labelIds = []
  if (f?.labelId && !n.labelIds.length) n.labelIds = [f.labelId]
  return n
}
function countActiveFilters(f) {
  let n = 0
  if ((f.q || '').trim()) n++
  if (f.aiState !== 'all') n++
  n += (f.labelIds || []).length
  if (f.assignee !== 'all') n++
  if (f.unread) n++
  if (f.flowRunning) n++
  if (f.followup) n++
  if (f.unreplied) n++
  if (f.activity && f.activity !== 'any') n++
  if (f.created && f.created !== 'any') n++
  if (f.waWindow && f.waWindow !== 'any') n++
  if (f.minMsgs) n++
  return n
}
// Timestamp del último mensaje de una conversación (fallback a updatedAt).
function lastMsgTs(c) { const m = c.messages || []; return m.length ? (m[m.length - 1].ts || 0) : (c.updatedAt || 0) }
function lastMsgFromClient(c) { const m = c.messages || []; const last = m[m.length - 1]; return !!last && (last.sender === 'user' || last.role === 'user') }
// Aplica los filtros avanzados (combinables) sobre la lista de chats.
function applyConvFilters(list, f0) {
  const f = normalizeFilters(f0)
  let out = list
  const q = (f.q || '').trim().toLowerCase()
  if (q) out = out.filter(c =>
    (c.guestName || '').toLowerCase().includes(q) ||
    (c.preview || '').toLowerCase().includes(q) ||
    (c.messages || []).some(m => (m.content || '').toLowerCase().includes(q))
  )
  if (f.aiState === 'on')  out = out.filter(c => c.aiEnabled !== false)
  if (f.aiState === 'off') out = out.filter(c => c.aiEnabled === false)
  if (f.labelIds.length) {
    out = out.filter(c => {
      const ls = c.labels || []
      return f.labelMatch === 'all' ? f.labelIds.every(id => ls.includes(id)) : f.labelIds.some(id => ls.includes(id))
    })
  }
  if (f.assignee === 'unassigned') out = out.filter(c => !c.assignedTo)
  else if (f.assignee !== 'all')   out = out.filter(c => (c.assignedTo?.id || c.assignedTo) === f.assignee)
  if (f.unread)      out = out.filter(c => c.unread)                 // sin leer
  if (f.flowRunning) out = out.filter(c => c.flowRunning)
  if (f.followup)    out = out.filter(c => c.followup)
  if (f.unreplied)   out = out.filter(c => lastMsgFromClient(c))     // sin responder (último msg del cliente)
  // Actividad: recencia del último mensaje (o sin actividad hace X).
  if (f.activity && f.activity !== 'any') {
    const now = Date.now(), day = 86400000
    out = out.filter(c => {
      const age = now - lastMsgTs(c)
      if (f.activity === 'today')  return age <= day
      if (f.activity === '7d')     return age <= 7 * day
      if (f.activity === '30d')    return age <= 30 * day
      if (f.activity === 'stale7')  return age > 7 * day
      if (f.activity === 'stale30') return age > 30 * day
      return true
    })
  }
  // Antigüedad: cuándo se creó la conversación.
  if (f.created && f.created !== 'any') {
    const now = Date.now(), day = 86400000
    out = out.filter(c => {
      const age = now - (c.createdAt || 0)
      if (f.created === 'today') return age <= day
      if (f.created === '7d')    return age <= 7 * day
      if (f.created === '30d')   return age <= 30 * day
      return true
    })
  }
  // Ventana de servicio de WhatsApp (24h): abierta / cerrada.
  if (f.waWindow && f.waWindow !== 'any') {
    out = out.filter(c => {
      if (c.channel !== 'whatsapp') return false
      const st = waWindowState(c)
      return f.waWindow === 'open' ? !!st?.open : !st?.open
    })
  }
  if (f.minMsgs) { const min = parseInt(f.minMsgs) || 0; out = out.filter(c => (c.messages || []).length >= min) }
  return out
}
// Filtros rápidos del riel izquierdo del inbox.
function applyQuickFilter(list, qf, myId) {
  // Filtros de estado: muestran SOLO archivadas o bloqueadas.
  if (qf === 'archived') return list.filter(c => c.archived)
  if (qf === 'blocked')  return list.filter(c => c.blocked)
  // El resto de filtros OCULTAN archivadas y bloqueadas.
  const base = list.filter(c => !c.archived && !c.blocked)
  if (qf === 'followup') return base.filter(c => c.followup)
  if (qf === 'mine')   return base.filter(c => (c.assignedTo?.id || c.assignedTo) === myId)
  if (qf === 'human')  return base.filter(c => c.aiEnabled === false)
  if (qf === 'bot')    return base.filter(c => c.aiEnabled !== false)
  // Sin leer: el asesor no ha visto el último mensaje (sea respuesta de la IA o del cliente).
  if (qf === 'unread') return base.filter(c => c.unread)
  // Sin responder: el último mensaje es del cliente → nadie (ni IA ni humano) ha respondido.
  if (qf === 'unreplied') return base.filter(c => lastMsgFromClient(c))
  return base
}
const QUICK_FILTERS = [
  { id: 'all',       icon: '💬', label: 'Todas las conversaciones' },
  { id: 'mine',      icon: '🙋', label: 'Asignadas a mí' },
  { id: 'followup',  icon: '⭐', label: 'En seguimiento' },
  { id: 'unread',    icon: '📩', label: 'Sin leer' },
  { id: 'unreplied', icon: '⏳', label: 'Sin responder' },
  { id: 'human',     icon: '👤', label: 'Transferidas a humano' },
  { id: 'bot',       icon: '🤖', label: 'Atendidas por bot' },
  { id: 'archived',  icon: '🗄', label: 'Archivadas' },
  { id: 'blocked',   icon: '🚫', label: 'Bloqueadas' },
]
// Identidad del remitente, para agrupar mensajes consecutivos del mismo emisor.
function senderKeyOf(m) {
  if (m.sender === 'user') return 'user'
  if (m.sender === 'human') return 'human:' + (m.senderName || '')
  return 'ai'
}
function skinKey(userId, convId) { return `avi_chat_skin_${userId || 'anon'}_${convId}` }
function defaultSkinKey(userId) { return `avi_chat_skin_default_${userId || 'anon'}` }
function customCfgKey(userId) { return `avi_chat_custom_${userId || 'anon'}` }
// Skin efectivo de una conversación: override por-chat → predeterminado del
// usuario → 'auto' (por canal).
function loadSkin(userId, convId) {
  try {
    const per = localStorage.getItem(skinKey(userId, convId))
    if (per) return per
    return localStorage.getItem(defaultSkinKey(userId)) || 'auto'
  } catch { return 'auto' }
}
function saveSkin(userId, convId, skinId) {
  try {
    if (skinId === 'auto') localStorage.removeItem(skinKey(userId, convId))
    else localStorage.setItem(skinKey(userId, convId), skinId)
  } catch {}
}
function loadDefaultSkin(userId) { try { return localStorage.getItem(defaultSkinKey(userId)) || 'auto' } catch { return 'auto' } }
function saveDefaultSkin(userId, skinId) {
  try { if (skinId === 'auto') localStorage.removeItem(defaultSkinKey(userId)); else localStorage.setItem(defaultSkinKey(userId), skinId) } catch {}
}
function loadCustomCfg(userId) {
  try { return JSON.parse(localStorage.getItem(customCfgKey(userId)) || '{}') || {} } catch { return {} }
}
function saveCustomCfg(userId, cfg) { try { localStorage.setItem(customCfgKey(userId), JSON.stringify(cfg || {})) } catch {} }

// Convierte la config del tema personalizado en variables CSS del chat.
function hexA(hex, a) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return `rgba(59,130,246,${a})`
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}
function readableOn(hex) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return '#fff'
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return L > 0.62 ? '#0b141a' : '#ffffff'
}
// Ajuste de la imagen de fondo → background-size / background-repeat.
function bgFit(cfg) {
  const fit = cfg?.fit || 'cover'
  if (fit === 'auto')    return { size: 'auto', repeat: 'repeat' }
  if (fit === 'contain') return { size: 'contain', repeat: 'no-repeat' }
  if (fit === 'mosaic')  { const px = Math.max(20, Number(cfg?.mosaicSize) || 200); return { size: `${px}px auto`, repeat: 'repeat' } }
  if (fit === 'custom')  { const x = Math.max(10, Number(cfg?.customX) || 300); const y = Math.max(10, Number(cfg?.customY) || 300); return { size: `${x}px ${y}px`, repeat: cfg?.customRepeat ? 'repeat' : 'no-repeat' } }
  return { size: 'cover', repeat: 'no-repeat' }
}
function buildCustomVars(cfg) {
  // 3 colores separados: fondo, burbuja del cliente (entrante) y burbuja propia
  // (agente/tú, saliente). `bubbleColor` es compat con la versión anterior.
  const own = cfg?.ownBubbleColor || cfg?.bubbleColor || '#3b82f6'
  const cust = cfg?.custBubbleColor || '#26323b'
  const bg = cfg?.bgColor || '#0b141a'
  const img = cfg?.bgImage
  const headerFg = readableOn(bg)
  const onImg = !!img
  const fit = bgFit(cfg)
  return {
    '--chat-bg': bg,
    '--chat-bg-image': img ? `linear-gradient(${hexA(bg, .42)}, ${hexA(bg, .60)}), url("${img}")` : 'none',
    '--chat-bg-size': fit.size,
    '--chat-bg-repeat': fit.repeat,
    '--chat-msg-out': own, '--chat-msg-out-fg': readableOn(own),
    '--chat-msg-human': own, '--chat-msg-human-fg': readableOn(own),
    '--chat-msg-in': cust, '--chat-msg-in-fg': readableOn(cust),
    '--chat-msg-border-in': 'transparent', '--chat-msg-border-out': 'transparent',
    '--chat-accent': own,
    '--chat-header-bg': onImg ? hexA(bg, .7) : hexA(bg, .92), '--chat-header-fg': onImg ? '#f2f5f7' : headerFg,
    '--chat-header-btn-bg': 'rgba(255,255,255,.10)', '--chat-header-btn-border': 'rgba(255,255,255,.16)',
    '--chat-input-bg': hexA(bg, .9), '--chat-input-field': cust, '--chat-input-field-fg': readableOn(cust),
    '--chat-input-fg': readableOn(cust), '--chat-input-border': 'rgba(255,255,255,.14)',
    '--chat-time-fg': onImg ? 'rgba(255,255,255,.72)' : hexA(headerFg === '#ffffff' ? '#ffffff' : '#0b141a', .6),
    '--chat-tag-bg': hexA(own, .18), '--chat-tag-fg': own, '--chat-tag-border': hexA(own, .4),
    '--chat-bubble-radius': '16px',
  }
}

export default function InboxPanel() {
  const { session } = useAuth()
  const { account, selectedAgent, getConvos, markRead, markUnread, setConvoLabels, assignConvo, toggleAI, reloadConvos, archiveConvo, blockConvo, followupConvo, deleteConvo, pendingOpen, consumePendingOpen } = useAccount()
  const replyRef = useRef(null)
  const [selectedConvId, setSelectedConvId] = useState(null)
  const [reply, setReply] = useState('')
  const [replyingTo, setReplyingTo] = useState(null) // mensaje citado al responder (cita)
  const [showLabels, setShowLabels] = useState(false)
  const [showPipelineModal, setShowPipelineModal] = useState(false)
  const [showBookModal, setShowBookModal] = useState(false)
  const [bookToast, setBookToast] = useState('')
  const [showSidePanel, setShowSidePanel] = useState(false)
  const [showRunFlow, setShowRunFlow] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [debugMode, setDebugMode] = useState(false)
  const [channelFilter, setChannelFilter] = useState(null)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [quickFilter, setQuickFilter] = useState('all')
  const [savedFilters, setSavedFilters] = useState([])
  const [canGlobal, setCanGlobal] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)

  function loadSavedFilters() {
    if (!account?.id) return
    listSavedFilters(account.id).then(r => { setSavedFilters(r?.filters || []); setCanGlobal(!!r?.canCreateGlobal) }).catch(() => {})
  }
  useEffect(() => { loadSavedFilters() }, [account?.id]) // eslint-disable-line

  async function handleSaveFilter(name, scope, payload) {
    try { await createSavedFilter(account.id, { name, scope, payload }); loadSavedFilters(); setShowSaveModal(false) }
    catch (e) { alert(e?.message || 'No se pudo guardar') }
  }
  function applySavedFilter(f) {
    const p = f.payload || {}
    setQuickFilter(p.quickFilter || 'all')
    setFilters(normalizeFilters(p.filters))
    setChannelFilter(p.channelFilter ?? null)
  }
  async function removeSavedFilter(f) {
    if (!confirm(`¿Eliminar el filtro "${f.name}"?`)) return
    try { await deleteSavedFilter(account.id, f.id); loadSavedFilters() } catch (e) { alert(e?.message || 'No se pudo eliminar') }
  }
  const [showFilters, setShowFilters] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false) // drawer de filtros en móvil
  const [headerMenu, setHeaderMenu] = useState(false)   // opciones del chat (⋮) en móvil
  const [, setNowTick] = useState(0) // refresca el estado de la ventana de 24h
  const [skinId, setSkinId] = useState('auto')
  // La apariencia/tema personalizado del chat es POR CUENTA IA (no por usuario):
  // se guarda bajo el id de la cuenta activa, así cada cuenta tiene su propio tema.
  const themeScope = account?.id || session?.id
  const [defaultSkin, setDefaultSkin] = useState(() => loadDefaultSkin(themeScope))
  const [customCfg, setCustomCfg] = useState(() => loadCustomCfg(themeScope))
  // Al cambiar de cuenta, recargar su tema guardado.
  useEffect(() => {
    setDefaultSkin(loadDefaultSkin(themeScope))
    setCustomCfg(loadCustomCfg(themeScope))
  }, [themeScope]) // eslint-disable-line react-hooks/exhaustive-deps
  const [showSkinMenu, setShowSkinMenu] = useState(false)
  const [showSkins, setShowSkins] = useState(false)  // sub-sección Apariencia dentro del menú ⋯
  const bottomRef = useRef(null)
  const skinMenuRef = useRef(null)
  const msgRefs = useRef({})   // id de mensaje → nodo DOM (para el buscador)

  // Buscador dentro del chat + reenvío/copia de mensajes.
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchDate, setSearchDate] = useState('')
  const [searchIdx, setSearchIdx] = useState(0)
  const [highlightId, setHighlightId] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [forwardMsg, setForwardMsg] = useState(null)
  const [showGallery, setShowGallery] = useState(false)

  const allConvos = getConvos(selectedAgent?.id) || []
  const byChannel = channelFilter ? allConvos.filter(c => c.channel === channelFilter) : allConvos
  const activeFilterCount = countActiveFilters(filters)
  const convosBase = activeFilterCount ? applyConvFilters(byChannel, filters) : byChannel
  const convos = applyQuickFilter(convosBase, quickFilter, session?.id)
  // Contador por filtro rápido: se calcula sobre convosBase (canal + búsqueda +
  // filtros avanzados YA aplicados) con la MISMA función que arma la lista mostrada
  // (`applyQuickFilter`), de modo que el número coincida SIEMPRE con lo que se ve,
  // incluso con búsqueda o filtros avanzados activos.
  const quickCounts = Object.fromEntries(
    QUICK_FILTERS.map(q => [q.id, applyQuickFilter(convosBase, q.id, session?.id).length])
  )
  // Contador de un filtro guardado: aplica su canal + filtros avanzados + filtro rápido.
  function savedFilterCount(f) {
    const p = f?.payload || {}
    let list = p.channelFilter ? allConvos.filter(c => c.channel === p.channelFilter) : allConvos
    if (p.filters && countActiveFilters(p.filters)) list = applyConvFilters(list, p.filters)
    return applyQuickFilter(list, p.quickFilter || 'all', session?.id).length
  }
  const selectedConv = convos.find(c => c.id === selectedConvId)

  // ── Buscador del chat ─────────────────────────────────────────────────────────
  const dayKey = ts => { const d = new Date(ts || 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  function dayLabel(ts) {
    const now = Date.now()
    if (dayKey(ts) === dayKey(now)) return 'Hoy'
    if (dayKey(ts) === dayKey(now - 86400000)) return 'Ayer'
    return new Date(ts || 0).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  function scrollToMsg(id) {
    const el = msgRefs.current[id]; if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightId(id); setTimeout(() => setHighlightId(h => (h === id ? null : h)), 2200)
  }
  const searchHits = useMemo(() => {
    if (!selectedConv || (!searchQ.trim() && !searchDate)) return []
    const q = searchQ.trim().toLowerCase()
    return (selectedConv.messages || []).filter(m => {
      if (searchDate && dayKey(m.ts) !== searchDate) return false
      if (q && !String(m.content || m.transcription || '').toLowerCase().includes(q)) return false
      return true
    }).map(m => m.id)
  }, [selectedConv?.id, selectedConv?.messages?.length, searchQ, searchDate])
  useEffect(() => {
    if (searchHits.length) { setSearchIdx(0); setTimeout(() => scrollToMsg(searchHits[0]), 60) }
  }, [searchHits.join('|')])
  function goHit(delta) {
    if (!searchHits.length) return
    const n = (searchIdx + delta + searchHits.length) % searchHits.length
    setSearchIdx(n); scrollToMsg(searchHits[n])
  }
  function copyMsg(m) {
    const text = m.content || m.transcription || m.mediaUrl || m.media?.url || ''
    try { navigator.clipboard?.writeText(text) } catch {}
    setCopiedId(m.id); setTimeout(() => setCopiedId(c => (c === m.id ? null : c)), 1400)
  }
  useEffect(() => { setSearchOpen(false); setSearchQ(''); setSearchDate('') }, [selectedConvId])

  // Channels that have at least one conversation
  const activeChannelTypes = [...new Set(allConvos.map(c => c.channel || 'webchat').filter(Boolean))]
  const CHANNEL_LABELS = { webchat: '🌐 Web', whatsapp: '📱 WhatsApp', messenger: '💬 Messenger', instagram: '📸 Instagram', test: '🧪 Test' }

  // Al entrar al Inbox NO se selecciona ninguna conversación por defecto: el usuario
  // aterriza en la LISTA (estilo WhatsApp) y elige. La apertura por deep-link
  // (tickets/pipeline/optimizador) sí selecciona vía pendingOpen, más abajo.

  // Tick cada minuto: mantiene actualizado el estado de la ventana de 24h de WA
  // (cuenta regresiva y transición abierta→cerrada sin esperar un nuevo evento).
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // Deep-link: abrir la conversación solicitada desde otra vista (tickets/pipeline)
  useEffect(() => {
    if (!pendingOpen?.convId) return
    if (pendingOpen.agentId && selectedAgent?.id !== pendingOpen.agentId) return // esperar al cambio de agente
    setSelectedConvId(pendingOpen.convId)
    setChannelFilter(null)
    consumePendingOpen?.()
  }, [pendingOpen?.ts, selectedAgent?.id])

  useEffect(() => {
    if (selectedConvId && !convos.find(c => c.id === selectedConvId)) {
      setSelectedConvId(convos[0]?.id || null)
    }
  }, [channelFilter])

  useEffect(() => {
    if (selectedConvId && selectedAgent) markRead(selectedAgent.id, selectedConvId)
  }, [selectedConvId])

  // En modo debug refrescamos la conversación para traer el debugLog actualizado
  // (los pasos de flujo se registran en BD; así aparecen casi en vivo).
  useEffect(() => {
    if (!debugMode || !selectedConvId) return
    reloadConvos()
    const iv = setInterval(() => reloadConvos(), 3000)
    return () => clearInterval(iv)
  }, [debugMode, selectedConvId])

  // Reload the chat skin preference whenever the user switches between conversations
  useEffect(() => {
    if (!selectedConvId) { setSkinId('auto'); return }
    setSkinId(loadSkin(themeScope, selectedConvId))
  }, [selectedConvId, themeScope])

  // Close the skin menu when clicking outside
  useEffect(() => {
    if (!showSkinMenu && !showSkins) return
    function onDocClick(e) { if (skinMenuRef.current && !skinMenuRef.current.contains(e.target)) { setShowSkinMenu(false); setShowSkins(false) } }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showSkinMenu, showSkins])

  function applySkin(newId) {
    setSkinId(newId)
    saveSkin(themeScope, selectedConvId, newId)
    // El editor personalizado se queda abierto; el resto cierra el menú.
    if (newId !== 'custom') setShowSkinMenu(false)
  }
  // Edita el tema personalizado en vivo (se guarda por CUENTA IA, afecta a todos
  // los chats de esa cuenta que usen el skin "Personalizado").
  function updateCustom(patch) {
    setCustomCfg(prev => { const next = { ...prev, ...patch }; saveCustomCfg(themeScope, next); return next })
  }
  // Sube una imagen propia: se reescala en el navegador (máx 1600px, JPEG) para
  // que quepa como data URL sin saturar el almacenamiento local.
  function handleCustomUpload(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const im = new Image()
      im.onload = () => {
        const max = 1600
        let { width, height } = im
        if (width > max || height > max) { const r = Math.min(max / width, max / height); width = Math.round(width * r); height = Math.round(height * r) }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(im, 0, 0, width, height)
        try { updateCustom({ bgImage: canvas.toDataURL('image/jpeg', 0.82) }) }
        catch { updateCustom({ bgImage: reader.result }) }
      }
      im.src = reader.result
    }
    reader.readAsDataURL(file)
  }
  // Establece un tema como predeterminado para TODOS los chats sin override propio.
  function setDefaultForAll(id) {
    saveDefaultSkin(themeScope, id)
    setDefaultSkin(id)
    // Limpia el override de esta conversación y muestra el predeterminado ya.
    saveSkin(themeScope, selectedConvId, 'auto')
    setSkinId(id)
    setShowSkinMenu(false)
  }

  // Al ABRIR un chat saltamos al final al instante (sin animar el recorrido de
  // todos los mensajes); estando dentro del mismo chat, los mensajes nuevos sí
  // hacen scroll suave.
  const prevConvIdRef = useRef(null)
  useEffect(() => {
    const changedConv = prevConvIdRef.current !== selectedConvId
    prevConvIdRef.current = selectedConvId
    bottomRef.current?.scrollIntoView({ behavior: changedConv ? 'auto' : 'smooth', block: 'end' })
  }, [selectedConvId, selectedConv?.messages?.length])

  useEffect(() => { setReplyingTo(null) }, [selectedConvId])

  async function sendReply() {
    if (!reply.trim() || !selectedConvId || !selectedAgent || !account) return
    const w = waWindowState(selectedConv)
    if (w && !w.open) { alert('La ventana de 24 h de WhatsApp está cerrada. Solo puedes enviar una plantilla aprobada o ejecutar un flujo.'); return }
    // Interpola las variables ({{nombre}}, {{email}}, locales…) con los datos de la
    // conversación antes de enviar. Deja intacto lo que no tenga valor.
    const text = interpolateConvVars(reply.trim(), selectedConv)
    const quoted = replyingTo
    setReply(''); setReplyingTo(null)
    try {
      // El backend entrega al canal real (WhatsApp/Messenger/IG) y persiste el
      // mensaje; la UI se actualiza por socket (message:new).
      await sendManualMessage(account.id, selectedAgent.id, selectedConvId, text, session?.name || 'Asesor', quoted?.id)
    } catch (e) {
      setReply(text); setReplyingTo(quoted) // restaurar para reintentar
      alert(e?.message || 'No se pudo enviar el mensaje al canal.')
    }
  }

  // Respuesta rápida de AUDIO: envía el audio pre-guardado (data URL → blob) al chat.
  async function sendQuickAudio(qr) {
    if (!qr?.mediaData || !selectedConvId || !selectedAgent || !account) return
    const w = waWindowState(selectedConv)
    if (w && !w.open) { alert('La ventana de 24 h de WhatsApp está cerrada. Solo puedes enviar una plantilla aprobada o ejecutar un flujo.'); return }
    try {
      const blob = await (await fetch(qr.mediaData)).blob()
      await uploadMedia(account.id, selectedAgent.id, selectedConvId, blob, {
        sender: 'human', senderName: session?.name || 'Asesor', kind: qr.mediaKind || 'audio',
        filename: `nota-${Date.now()}.webm`, caption: qr.content || '',
      })
    } catch (e) { alert(e?.message || 'No se pudo enviar el audio.') }
  }

  // Envía un archivo de la galería (o del CMS) al chat actual (medio → blob → canal).
  async function sendGalleryItem(item) {
    if (!item?.mediaId || !selectedConvId || !selectedAgent || !account) return
    const w = waWindowState(selectedConv)
    if (w && !w.open) { alert('La ventana de 24 h de WhatsApp está cerrada. Solo puedes enviar una plantilla aprobada o ejecutar un flujo.'); return }
    try {
      const blob = await (await fetch(mediaUrl(account.id, item.mediaId))).blob()
      await uploadMedia(account.id, selectedAgent.id, selectedConvId, blob, {
        sender: 'human', senderName: session?.name || 'Asesor', kind: item.kind || 'file',
        filename: item.filename || item.name || 'archivo',
      })
    } catch (e) { alert(e?.message || 'No se pudo enviar el archivo.') }
  }

  function toggleLabel(labelId) {
    if (!selectedConv) return
    const cur = selectedConv.labels || []
    setConvoLabels(selectedAgent.id, selectedConvId,
      cur.includes(labelId) ? cur.filter(l => l !== labelId) : [...cur, labelId])
  }

  const labels = account?.labels || []
  const getLabel = id => labels.find(l => l.id === id)
  const fmt = ts => ts ? new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : ''
  const fmtDate = ts => ts ? new Date(ts).toLocaleDateString('es', { day: '2-digit', month: 'short' }) : ''

  if (!selectedAgent) return <div className={s.empty}><span>Selecciona un agente</span></div>
  if (allConvos.length === 0) return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>💬</span>
      <p>Sin conversaciones</p>
      <small>Comparte un link de webchat para recibir mensajes</small>
    </div>
  )

  return (
    <div className={`${s.inbox} ${selectedConvId ? s.hasActive : ''}`}>
      {/* Backdrop del drawer de filtros (solo móvil) */}
      {filtersOpen && <div className={s.filterBackdrop} onClick={() => setFiltersOpen(false)} />}
      {/* ── Riel de filtros (drawer deslizable en móvil) ── */}
      <div className={`${s.filterRail} ${filtersOpen ? s.filterRailOpen : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 6px' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Filtros</span>
          <button className="onlyMobile" onClick={() => setFiltersOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        {QUICK_FILTERS.map(q => {
          const on = quickFilter === q.id
          return (
            <button key={q.id} onClick={() => { setQuickFilter(q.id); setFiltersOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                background: on ? 'var(--sel-bg)' : 'transparent', border: '1px solid ' + (on ? 'var(--sel-border)' : 'transparent'),
                boxShadow: on ? 'inset 0 1px 0 rgba(255,255,255,.09), 0 4px 12px rgba(0,0,0,.24)' : 'none',
                backdropFilter: on ? 'blur(10px)' : 'none', WebkitBackdropFilter: on ? 'blur(10px)' : 'none',
                color: on ? 'var(--text)' : 'var(--text2)', fontSize: 12.5, transition: 'background .18s cubic-bezier(0,0,.2,1), border-color .18s cubic-bezier(0,0,.2,1)' }}>
              <span>{q.icon}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.label}</span>
              <span style={{ fontSize: 10, color: on ? 'var(--text2)' : 'var(--text3)', fontWeight: 600 }}>{quickCounts[q.id] ?? 0}</span>
            </button>
          )
        })}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 8px 4px' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Filtros guardados</span>
          <button onClick={() => setShowSaveModal(true)} title="Guardar un filtro" style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11 }}>＋ Guardar</button>
        </div>
        {savedFilters.length === 0 && <div style={{ fontSize: 11, color: 'var(--text3)', padding: '2px 8px' }}>Aún no hay filtros guardados.</div>}
        {savedFilters.map(f => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 8 }}>
            <button onClick={() => applySavedFilter(f)} title={f.scope === 'global' ? 'Filtro global' : 'Filtro personal'}
              style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 12, textAlign: 'left' }}>
              <span>{f.scope === 'global' ? '🌐' : '👤'}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>{savedFilterCount(f)}</span>
            </button>
            {((f.scope === 'global' && canGlobal) || (f.scope !== 'global' && f.mine)) && (
              <button onClick={() => removeSavedFilter(f)} title="Eliminar" style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13 }}>×</button>
            )}
          </div>
        ))}
      </div>
      {showSaveModal && (
        <SaveFilterModal
          initial={{ quickFilter, channelFilter, filters }}
          canGlobal={canGlobal}
          channels={activeChannelTypes}
          labels={account?.labels || []}
          onSave={handleSaveFilter}
          onClose={() => setShowSaveModal(false)}
        />
      )}
      {/* ── Conversation list ── */}
      <div className={s.convList}>
        <div className={s.listHdr} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <button className="onlyMobile" onClick={() => setFiltersOpen(true)} title="Filtros"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)', borderRadius: 8, padding: '5px 9px', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
            🔍 Filtros{quickFilter !== 'all' ? ' ·1' : ''}
          </button>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{convos.length} chat{convos.length !== 1 ? 's' : ''}{channelFilter && ` · ${CHANNEL_LABELS[channelFilter] || channelFilter}`}</span>
          <button className={s.advFilterBtn} onClick={() => setShowFilters(v => !v)} title="Filtros avanzados"
            style={activeFilterCount ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : undefined}>
            ⛃ Filtros{activeFilterCount ? ` · ${activeFilterCount}` : ''}
          </button>
        </div>
        {showFilters && (
          <FilterModal
            filters={normalizeFilters(filters)} setFilters={setFilters}
            labels={labels} members={account?.members || []}
            activeCount={activeFilterCount}
            onClear={() => setFilters(EMPTY_FILTERS)}
            onSave={() => setShowSaveModal(true)}
            onClose={() => setShowFilters(false)}
          />
        )}
        <div className={s.channelFilters}>
          <button className={`${s.filterChip} ${!channelFilter ? s.filterActive : ''}`} onClick={() => setChannelFilter(null)}>Todos</button>
          {activeChannelTypes.map(ch => (
            <button key={ch} className={`${s.filterChip} ${channelFilter === ch ? s.filterActive : ''}`} onClick={() => setChannelFilter(ch)}>
              {CHANNEL_LABELS[ch] || ch}
            </button>
          ))}
        </div>
        {convos.length === 0 && activeFilterCount > 0 && (
          <div className={s.noFilterResults}>
            Ningún chat coincide con los filtros.
            <button className={s.clearFilterBtn} onClick={() => setFilters(EMPTY_FILTERS)}>Limpiar filtros</button>
          </div>
        )}
        {convos.length === 0 && channelFilter && (
          <div className={s.noFilterResults}>
            Sin chats en este canal.
            <button className={s.clearFilterBtn} onClick={() => setChannelFilter(null)}>Ver todos</button>
          </div>
        )}
        {convos.map(conv => {
          const convLabels = (conv.labels || []).map(getLabel).filter(Boolean)
          const lastMsg = conv.messages?.[conv.messages.length - 1]
          const lastOutbound = lastMsg && (lastMsg.sender === 'human' || lastMsg.sender === 'ai')
          return (
            <button key={conv.id}
              className={`${s.convItem} ${conv.id === selectedConvId ? s.convActive : ''}`}
              onClick={() => setSelectedConvId(conv.id)}>
              {conv.id === selectedConvId && <SelectionFx />}
              <div className={`${s.avatar} ${conv.followup ? s.avatarFollow : ''}`}>{conv.initials}</div>
              <div className={s.cMeta}>
                <div className={s.cTop}>
                  {conv.followup && <span className={s.followStar} title="En seguimiento">⭐</span>}
                  <span className={s.cName}>{conv.guestName}</span>
                  {conv.unread && <span className={s.unreadDot} />}
                  {conv.flowRunning && <span className={s.flowBadge}>⚡</span>}
                  {conv.channel === 'whatsapp' && <span className={s.waBadge}>WA</span>}
                  {conv.channel === 'messenger' && <span className={s.waBadge} style={{background:'rgba(79,168,255,.15)',color:'#4fa8ff'}}>FB</span>}
                  {conv.channel === 'instagram' && <span className={s.waBadge} style={{background:'rgba(225,48,108,.15)',color:'#e1306c'}}>IG</span>}
                  {conv.channel === 'test' && <span className={s.waBadge} style={{background:'rgba(245,166,35,.15)',color:'#f5a623'}}>TEST</span>}
                  {conv.returning && <span className={s.waBadge} style={{background:'rgba(124,111,255,.15)',color:'#7c6fff'}} title="Cliente recurrente — ya había conversado antes">🔄</span>}
                  <span className={s.cTime}>{fmtDate(conv.updatedAt)}</span>
                  {/* Marcar leído / no leído manualmente */}
                  <span
                    role="button"
                    title={conv.unread ? 'Marcar como leído' : 'Marcar como no leído'}
                    onClick={(e) => { e.stopPropagation(); conv.unread ? markRead(selectedAgent.id, conv.id) : markUnread(selectedAgent.id, conv.id) }}
                    style={{ marginLeft: 4, cursor: 'pointer', fontSize: 12, opacity: .65 }}>
                    {conv.unread ? '✓' : '◌'}
                  </span>
                </div>
                {convLabels.length > 0 && (
                  <div className={s.cLabels}>
                    {convLabels.slice(0, 2).map(l => (
                      <span key={l.id} className={s.miniLabel}
                        style={{ background: l.color + '22', color: l.color, borderColor: l.color + '44' }}>
                        {l.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className={s.cPreview}>
                  {lastOutbound && lastMsg.status && <MsgStatus status={lastMsg.status} />}
                  {' '}{conv.preview || 'Sin mensajes'}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Chat area ── */}
      {selectedConv ? (() => {
        // Resolve the actual skin class to apply: explicit user pick > channel-default
        // Resolución del skin: override por-usuario (skinId) → tema de la CUENTA
        // (aplica a todos sus usuarios) → auto por canal.
        const acctTheme = account?.chatTheme
        let resolvedSkinId = skinId
        let resolvedCustom = customCfg
        if (skinId === 'auto') {
          if (acctTheme?.skin && acctTheme.skin !== 'auto') { resolvedSkinId = acctTheme.skin; resolvedCustom = acctTheme.custom || customCfg }
          else resolvedSkinId = channelToSkinId(selectedConv.channel)
        }
        const effectiveSkinId = resolvedSkinId
        const skinDef         = SKINS.find(x => x.id === effectiveSkinId) || SKINS[1]
        const isCustomSkin    = !!skinDef.custom
        const themeClass      = isCustomSkin ? t.themed : (skinDef.cls ? `${t.themed} ${t[skinDef.cls]}` : '')
        const chatAreaStyle   = isCustomSkin ? buildCustomVars(resolvedCustom) : undefined
        // Línea de tiempo: mensajes + (en modo debug) entradas del debugLog,
        // ordenadas por ts para que los pasos del flujo aparezcan ENTRE mensajes.
        const timeline = debugMode
          ? [
              ...(selectedConv.messages || []).map((m, i) => ({ kind: 'msg', ts: m.ts || 0, m, i })),
              ...(selectedConv.debugLog || []).map((d, i) => ({ kind: 'debug', ts: d.ts || 0, d, i })),
            ].sort((a, b) => (a.ts - b.ts) || (a.kind === 'debug' ? -1 : 1))
          : (selectedConv.messages || []).map((m, i) => ({ kind: 'msg', ts: m.ts || 0, m, i }))
        return (
        <div className={`${s.chatArea} ${themeClass}`} style={chatAreaStyle}>
          {/* Header */}
          <div className={`${s.chatHdr} skinHeader`}>
            <button className={s.backToList} onClick={() => setSelectedConvId(null)} title="Volver a la lista" aria-label="Volver a la lista">←</button>
            <div className={`${s.chatAvatar} ${selectedConv.followup ? s.avatarFollow : ''}`}>{selectedConv.initials}</div>
            <div className={s.chatInfo}>
              <div className={s.chatName}>{selectedConv.followup && <span className={s.followStar} title="En seguimiento">⭐</span>}{selectedConv.guestName}</div>
              <div className={s.chatSub}>
                {selectedConv.channel === 'whatsapp' ? '📱 WhatsApp' : selectedConv.channel === 'messenger' ? '💬 Messenger' : selectedConv.channel === 'instagram' ? '📸 Instagram' : selectedConv.channel === 'test' ? '🧪 Prueba' : '🌐 Webchat'} · {fmtDate(selectedConv.createdAt)}
                {selectedConv.flowRunning && <span className={s.flowRunningBadge}>⚡ Flujo activo</span>}
                {/* El origen del lead vive ahora en el panel de usuario → Info */}
              </div>
            </div>

            {/* Presence indicator (with multi-asesor list + assignment chip) */}
            <PresenceIndicator
              accId={account?.id}
              agId={selectedAgent?.id}
              convId={selectedConvId}
              userId={session?.id}
              userName={session?.name || 'Asesor'}
              assignedTo={selectedConv.assignedTo}
            />

            {/* Active labels */}
            <div className={s.activeLabels}>
              {(selectedConv.labels || []).map(getLabel).filter(Boolean).map(l => (
                <span key={l.id} className={s.activeLabel}
                  style={{ background: l.color + '22', color: l.color, borderColor: l.color + '55' }}>
                  {l.name}
                </span>
              ))}
            </div>

            {/* Buscar dentro del chat */}
            <button className={s.iconBtn} onClick={() => setSearchOpen(v => !v)} title="Buscar en el chat" aria-label="Buscar">🔍</button>
            {/* Opciones del chat: en móvil se colapsan tras el botón ⋮ */}
            <button className={s.headerMenuBtn} onClick={() => setHeaderMenu(v => !v)} title="Opciones" aria-label="Opciones">⋮</button>
            <div className={`${s.headerActions} ${headerMenu ? s.headerActionsOpen : ''}`} onClick={() => setHeaderMenu(false)}>
            {/* Header limpio: asignar asesor · agendar cita · toggle IA · etiquetas.
                Lo demás vive en el menú ⋯ de opciones avanzadas. */}
            <ChatToolbar
              accountId={account?.id}
              conv={selectedConv}
              members={account?.members || []}
              session={session}
              currentAssignee={selectedConv.assignedTo}
              sections={['assign']}
              onAssign={(member) => assignConvo(selectedAgent.id, selectedConvId, member)}
            />
            <button className={s.iconBtn} onClick={() => setShowBookModal(true)} title="Agendar cita manualmente">📅 Cita</button>
            <button
              className={`${s.iconBtn} iconButtonReset`}
              onClick={() => followupConvo(selectedAgent.id, selectedConvId, !selectedConv.followup)}
              title={selectedConv.followup ? 'Quitar de seguimiento' : 'Marcar en seguimiento'}
              aria-pressed={!!selectedConv.followup}
              style={selectedConv.followup ? { color: '#f5b301', filter: 'drop-shadow(0 0 4px rgba(245,179,1,.55))' } : undefined}
            >{selectedConv.followup ? '⭐' : '☆'}</button>
            <button
              className={`${s.aiToggle} skinKeep ${selectedConv.aiEnabled !== false ? `${s.aiOn} skinKeepOn` : `${s.aiOff} skinKeepOff`}`}
              onClick={() => {
                if (selectedConv.aiDisabledReason === 'ai_per_conv_limit') return // bloqueado hasta plan de pago
                toggleAI(selectedAgent.id, selectedConvId, selectedConv.aiEnabled === false)
              }}
              title={selectedConv.aiDisabledReason === 'ai_per_conv_limit'
                ? 'La IA quedó desactivada por el límite de la Demo. Adquiere una mensualidad y un tipo de cuenta de pago para reactivarla.'
                : 'Toggle IA'}
              style={selectedConv.aiDisabledReason === 'ai_per_conv_limit' ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
            >
              🤖 {selectedConv.aiEnabled !== false ? 'ON' : 'OFF'}{selectedConv.aiDisabledReason === 'ai_per_conv_limit' ? ' 🔒' : ''}
            </button>

            {/* Labels picker */}
            <div className={s.labelPicker}>
              <button className={s.iconBtn} onClick={() => setShowLabels(!showLabels)}>🏷</button>
              {showLabels && (
                <div className={`${s.labelDrop} skinPop`}>
                  <div className={s.labelDropTitle}>Etiquetas CRM</div>
                  {labels.map(l => {
                    const active = (selectedConv.labels || []).includes(l.id)
                    return (
                      <button key={l.id} className={`${s.labelOpt} ${active ? s.labelOptActive : ''}`}
                        onClick={() => toggleLabel(l.id)}>
                        <span className={s.lDot} style={{ background: l.color }} />
                        {l.name}
                        {active && <span className={s.lCheck}>✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Panel de usuario */}
            <button
              className={`${s.iconBtn} iconButtonReset ${showSidePanel ? s.iconBtnActive : ''}`}
              onClick={() => setShowSidePanel(!showSidePanel)}
              title="Panel de usuario"
            >⊞</button>

            {/* ⋯ Opciones avanzadas del chat: debug, flujos, pipeline, export, apariencia */}
            <div className={t.themeMenuWrap} ref={skinMenuRef}>
              <button
                className={`${s.iconBtn} iconButtonReset`}
                onClick={() => setShowSkinMenu(o => !o)}
                title="Opciones avanzadas del chat"
              >⋯</button>
              {showSkinMenu && (
                <div className={`${t.themeMenu} skinPop`} style={{ minWidth: 240 }}>
                  <div className={t.themeMenuTitle}>Opciones avanzadas</div>
                  <button className={t.themeMenuItem} onClick={() => setDebugMode(d => !d)}>
                    <span>🐛 Modo debug</span>
                    {debugMode && <span className={t.themeMenuItemDefault} style={{ color: 'var(--amber,#f5a623)' }}>ON</span>}
                  </button>
                  <button className={t.themeMenuItem} onClick={() => { setShowRunFlow(true); setShowSkinMenu(false) }}><span>⚡ Ejecutar flujo</span></button>
                  <button className={t.themeMenuItem} onClick={() => { setShowPipelineModal(true); setShowSkinMenu(false) }}><span>📊 Pipeline</span></button>
                  <button className={t.themeMenuItem} onClick={() => { exportChatAsJson(selectedConv, { accountName: account?.name, agentName: selectedAgent?.name }); setShowSkinMenu(false) }}><span>⤓ Exportar JSON</span></button>
                  <button className={t.themeMenuItem} onClick={() => { exportChatAsMarkdown(selectedConv, { accountName: account?.name, agentName: selectedAgent?.name }); setShowSkinMenu(false) }}><span>📄 Exportar Markdown</span></button>

                  <div className={t.themeMenuTitle}>Chat</div>
                  <button className={t.themeMenuItem} onClick={() => { followupConvo(selectedAgent.id, selectedConvId, !selectedConv.followup); setShowSkinMenu(false) }}><span>{selectedConv.followup ? '⭐ Quitar de seguimiento' : '☆ Marcar en seguimiento'}</span></button>
                  <button className={t.themeMenuItem} onClick={() => { markUnread(selectedAgent.id, selectedConvId); setShowSkinMenu(false) }}><span>📩 Marcar como no leído</span></button>
                  <button className={t.themeMenuItem} onClick={() => { archiveConvo(selectedAgent.id, selectedConvId, !selectedConv.archived); setShowSkinMenu(false); if (!selectedConv.archived) setSelectedConvId(null) }}><span>🗄 {selectedConv.archived ? 'Desarchivar' : 'Archivar'}</span></button>
                  <button className={t.themeMenuItem} onClick={() => { blockConvo(selectedAgent.id, selectedConvId, !selectedConv.blocked); setShowSkinMenu(false); if (!selectedConv.blocked) setSelectedConvId(null) }}><span>🚫 {selectedConv.blocked ? 'Desbloquear' : 'Bloquear'}</span></button>
                  <button className={t.themeMenuItem} onClick={() => { if (confirm('¿Eliminar esta conversación y todos sus mensajes? No se puede deshacer.')) { deleteConvo(selectedAgent.id, selectedConvId); setShowSkinMenu(false); setSelectedConvId(null) } }}><span style={{ color: '#ff5f5f' }}>🗑 Eliminar conversación</span></button>

                  {/* Apariencia: abre un POPUP aparte (evita que el menú crezca en móvil) */}
                  <button className={t.themeMenuItem} onClick={() => { setShowSkins(true); setShowSkinMenu(false) }}>
                    <span>🎨 Apariencia del chat</span>
                    <span className={t.themeMenuItemDefault}>▸</span>
                  </button>
                </div>
              )}

              {/* Popup de apariencia: modal FIJO vía portal a <body> para que no lo
                  atrape el colapso responsive de headerActions ni el backdrop-filter
                  de ancestros (que convertiría fixed→absolute). */}
              {showSkins && createPortal((
                <div
                  onMouseDown={e => { if (e.target === e.currentTarget) setShowSkins(false) }}
                  style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
                >
                <div className={`${t.themeMenu} skinPop`} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
                  style={{ position: 'static', minWidth: 240, width: 'min(340px, calc(100vw - 24px))', maxHeight: 'min(84vh, 620px)', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
                  <div className={t.themeMenuTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--bg3)', zIndex: 1 }}>
                    <span>Apariencia del chat</span>
                    <button onClick={() => setShowSkins(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 15 }}>✕</button>
                  </div>
                  {SKINS.map(sk => {
                    const isActive = skinId === sk.id
                    const isChannelDefault = sk.id !== 'auto' && sk.id === channelToSkinId(selectedConv.channel)
                    return (
                      <button key={sk.id}
                        className={`${t.themeMenuItem} ${isActive ? t.themeMenuItemActive : ''}`}
                        onClick={() => applySkin(sk.id)}
                      >
                        <span className={t.themeSwatch} style={{ background: sk.swatch }} />
                        <span>{sk.icon} {sk.label}</span>
                        {isChannelDefault && skinId === 'auto' && <span className={t.themeMenuItemDefault}>activo</span>}
                      </button>
                    )
                  })}

                  {/* Editor del tema personalizado (fondo: enlace/subida + ajuste + 3 colores) */}
                  {effectiveSkinId === 'custom' && (() => {
                    const cInput = { display: 'block', width: '100%', height: 30, marginTop: 4, background: 'none', border: '1px solid var(--border2)', borderRadius: 7, cursor: 'pointer', padding: 0 }
                    const lbl = { flex: 1, fontSize: 11, color: 'var(--text2)', fontWeight: 600 }
                    const fit = customCfg.fit || 'cover'
                    return (
                    <div style={{ padding: '8px 12px 10px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)' }}>
                      <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Fondo del chat</label>
                      <input type="url" value={(customCfg.bgImage || '').startsWith('data:') ? '' : (customCfg.bgImage || '')} placeholder="Pega un enlace web (https://…)"
                        onChange={e => updateCustom({ bgImage: e.target.value })}
                        style={{ padding: '6px 9px', fontSize: 12, borderRadius: 7, background: 'var(--field-bg,var(--bg3))', color: 'var(--field-fg,var(--text))', border: '1px solid var(--field-border,var(--border2))' }} />
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', padding: '5px 10px', border: '1px solid var(--accent-glow)', borderRadius: 7, background: 'var(--accent-dim)' }}>
                          ⤒ Subir imagen
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { handleCustomUpload(e.target.files?.[0]); e.target.value = '' }} />
                        </label>
                        {customCfg.bgImage && (<>
                          <img src={customCfg.bgImage} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border2)' }} />
                          <button onClick={() => updateCustom({ bgImage: '' })} style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Quitar</button>
                        </>)}
                      </div>
                      {/* Ajuste de la imagen */}
                      {customCfg.bgImage && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Ajuste de la imagen</label>
                          <select value={fit} onChange={e => updateCustom({ fit: e.target.value })} style={{ padding: '5px 8px', fontSize: 12 }}>
                            <option value="auto">Automático (tamaño original, se repite)</option>
                            <option value="cover">Cubrir (llena el chat)</option>
                            <option value="contain">Ajustar (imagen completa)</option>
                            <option value="mosaic">Mosaico (repetir)</option>
                            <option value="custom">Tamaño personalizado</option>
                          </select>
                          {fit === 'mosaic' && (
                            <label style={{ fontSize: 11, color: 'var(--text2)' }}>Tamaño del mosaico (px)
                              <input type="number" min="20" value={customCfg.mosaicSize || 200} onChange={e => updateCustom({ mosaicSize: Number(e.target.value) })} style={{ marginTop: 3 }} />
                            </label>
                          )}
                          {fit === 'custom' && (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <label style={lbl}>Ancho (px)<input type="number" min="10" value={customCfg.customX || 300} onChange={e => updateCustom({ customX: Number(e.target.value) })} style={{ marginTop: 3 }} /></label>
                              <label style={lbl}>Alto (px)<input type="number" min="10" value={customCfg.customY || 300} onChange={e => updateCustom({ customY: Number(e.target.value) })} style={{ marginTop: 3 }} /></label>
                              <label style={{ ...lbl, flex: '0 0 auto', display: 'flex', alignItems: 'flex-end', gap: 4 }}><input type="checkbox" checked={!!customCfg.customRepeat} onChange={e => updateCustom({ customRepeat: e.target.checked })} /> repetir</label>
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 10 }}>
                        <label style={lbl}>Fondo<input type="color" value={customCfg.bgColor || '#0b141a'} onChange={e => updateCustom({ bgColor: e.target.value })} style={cInput} /></label>
                        <label style={lbl}>Burbuja cliente<input type="color" value={customCfg.custBubbleColor || '#26323b'} onChange={e => updateCustom({ custBubbleColor: e.target.value })} style={cInput} /></label>
                        <label style={lbl}>Burbuja propia<input type="color" value={customCfg.ownBubbleColor || customCfg.bubbleColor || '#3b82f6'} onChange={e => updateCustom({ ownBubbleColor: e.target.value })} style={cInput} /></label>
                      </div>
                    </div>
                    )
                  })()}
                  <div style={{ fontSize: 10.5, color: 'var(--text3)', padding: '4px 12px 8px' }}>
                    El tema para <strong>toda la cuenta</strong> se configura en Configuración → 💼 Cuenta.
                  </div>
                </div>
                </div>
              ), document.body)}
            </div>
            </div>{/* /headerActions */}
          </div>

          {/* Franja SOLO para el equipo (no se envía al contacto): la IA se desactivó
              automáticamente en este chat por alcanzar el límite de respuestas IA. */}
          {selectedConv.aiDisabledReason === 'ai_per_conv_limit' && selectedConv.aiEnabled === false && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '8px 14px', background: 'rgba(245,166,35,.14)', borderBottom: '1px solid rgba(245,166,35,.4)',
              color: '#f5a623', fontSize: 12.5, fontWeight: 600 }}>
              <span>⚠ IA desactivada en este chat: alcanzó el límite de respuestas generadas por IA. El contacto no recibió ningún aviso; puedes continuar manualmente. La IA <strong>no puede reactivarse</strong> en este chat hasta adquirir una mensualidad y un tipo de cuenta de pago.</span>
              <a
                href="mailto:comercial@aviasistente.com?subject=Actualizar%20mi%20cuenta%20de%20pago"
                style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 6, border: '1px solid #f5a62366',
                  background: 'transparent', color: '#f5a623', cursor: 'pointer', fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
              >Ver planes</a>
            </div>
          )}

          {/* Chat body + side panel */}
          {searchOpen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexWrap: 'wrap' }}>
              <input autoFocus placeholder="Buscar mensaje o palabra…" value={searchQ} onChange={e => setSearchQ(e.target.value)}
                style={{ flex: 1, minWidth: 140, padding: '7px 10px', fontSize: 13, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 8 }} />
              <input type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)} title="Ir a una fecha / buscar dentro de esa fecha"
                style={{ padding: '6px 8px', fontSize: 12, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 8 }} />
              <span style={{ fontSize: 12, color: 'var(--text3)', minWidth: 40, textAlign: 'center' }}>{searchHits.length ? `${searchIdx + 1}/${searchHits.length}` : '0'}</span>
              <button className={s.iconBtn} disabled={!searchHits.length} onClick={() => goHit(-1)} title="Anterior">↑</button>
              <button className={s.iconBtn} disabled={!searchHits.length} onClick={() => goHit(1)} title="Siguiente">↓</button>
              <button className={s.iconBtn} onClick={() => { setSearchOpen(false); setSearchQ(''); setSearchDate('') }} title="Cerrar">✕</button>
            </div>
          )}
          <div className={s.chatBody}>
            <div className={s.messagesWrap}>
              <div className={`${s.messages} skinMessages`} data-i18n-skip onClick={() => setShowLabels(false)}>
                {selectedConv.messages.length === 0 && (
                  <div className={s.noMsgs}>Esperando mensajes...</div>
                )}
                {timeline.map((item, idx) => {
                  // Separador por día/fecha (chats divididos por fechas).
                  const _dk = dayKey(item.ts)
                  const daySep = _dk !== (idx > 0 ? dayKey(timeline[idx - 1].ts) : null)
                    ? <div style={{ textAlign: 'center', margin: '12px 0 6px' }}><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '3px 12px' }}>{dayLabel(item.ts)}</span></div>
                    : null
                  if (item.kind === 'debug') {
                    return <Fragment key={`dbg_${item.i}_${item.ts}`}>{daySep}<DebugStep entry={item.d} /></Fragment>
                  }
                  const msg = item.m
                  const i = item.i
                  const isUser = msg.sender === 'user'
                  const isAI = msg.sender === 'ai' || (msg.role === 'assistant' && msg.sender !== 'human')
                  const isHuman = msg.sender === 'human'
                  const isRight = isAI || isHuman
                  const fromFlow = msg.fromFlow
                  // Mostrar la etiqueta del remitente sólo en el primer mensaje de una
                  // racha consecutiva del mismo emisor.
                  let showTag = true
                  for (let j = idx - 1; j >= 0; j--) {
                    if (timeline[j].kind === 'msg') { showTag = senderKeyOf(timeline[j].m) !== senderKeyOf(msg); break }
                  }
                  return (
                    <Fragment key={`msg_${i}`}>
                    {daySep}
                    <div ref={el => { if (el) msgRefs.current[msg.id] = el }}
                      className={`${s.msgGroup} ${isRight ? s.msgRight : s.msgLeft}`}
                      style={highlightId === msg.id ? { background: 'rgba(245,166,35,.14)', borderRadius: 10, transition: 'background .3s' } : { transition: 'background .3s' }}>
                      {(showTag || msg.fromTemplate) && (
                      <div className={s.senderTag}>
                        {showTag && isUser && <span className={`${s.tagUser} skinTag`}>👤 {msg.senderName || selectedConv.guestName}</span>}
                        {showTag && isAI && <span className={`${s.tagAI} skinTag`}>🤖 Agente IA{fromFlow ? ' · flujo' : ''}</span>}
                        {showTag && isHuman && <span className={`${s.tagHuman} skinTag`}>💬 {msg.senderName || 'Asesor'}</span>}
                        {msg.fromTemplate && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,217,138,.14)', color: '#22d98a', border: '1px solid rgba(34,217,138,.4)' }}>
                            📋 Plantilla{msg.templateName ? `: ${msg.templateName}` : ''}
                          </span>
                        )}
                      </div>
                      )}
                      <div
                        className={`${s.msg} ${isUser ? `${s.msgUser} skinMsgUser` : isAI ? `${s.msgAI} skinMsgAI` : `${s.msgHuman} skinMsgHuman`} ${fromFlow ? s.msgFlow : ''}`}
                        style={msg.status === 'failed' ? { background: 'rgba(255,95,95,.14)', border: '1px solid rgba(255,95,95,.55)' } : undefined}
                        title={msg.status === 'failed' ? `No se entregó: ${msg.sendError || 'error desconocido'}` : undefined}
                      >
                        {msg.replyTo && (
                          <div style={{ borderLeft: '3px solid var(--accent)', background: 'rgba(0,0,0,.08)', borderRadius: 6, padding: '4px 8px', marginBottom: 5, fontSize: 12, color: 'var(--text2)' }}>
                            <div style={{ fontWeight: 600, fontSize: 10, opacity: .85 }}>↩ {msg.replyTo.sender === 'user' ? 'Cliente' : 'Asistente'}</div>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{msg.replyTo.content || (msg.replyTo.kind ? `[${msg.replyTo.kind}]` : '…')}</div>
                          </div>
                        )}
                        {msg.status === 'failed' && (
                          <div style={{ fontSize: 11, color: '#ff7676', fontWeight: 600, marginBottom: 3 }}>
                            ⚠ No entregado{msg.sendError ? ` — ${msg.sendError}` : ''}
                          </div>
                        )}
                        {(msg.mediaId || msg.media?.url || msg.mediaUrl) && (
                          <MediaMessage
                            accId={account?.id}
                            mediaId={msg.mediaId}
                            url={msg.media?.url || msg.mediaUrl}
                            kind={msg.kind || msg.media?.kind}
                            mime={msg.mime}
                            filename={msg.filename}
                            sizeBytes={msg.sizeBytes}
                          />
                        )}
                        {msg.kind === 'audio' && !msg.content && msg.transcription && (
                          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6, fontStyle: 'italic', opacity: .85 }}>
                            📝 {msg.transcription}
                          </div>
                        )}
                        {msg.kind === 'audio' && !msg.content && !msg.transcription && msg.transcriptionError && (
                          <div style={{ fontSize: 11, color: '#f5a623', marginTop: 6 }}>
                            ⚠ No se pudo transcribir el audio — {msg.transcriptionError}
                          </div>
                        )}
                        {msg.calendar
                          ? <div style={{ marginTop: msg.mediaId ? 6 : 0 }}><CalendarMessage calendar={msg.calendar} text={msg.content} /></div>
                          : (msg.content && <div style={{ marginTop: msg.mediaId ? 6 : 0 }}><FormattedMessage text={msg.content} /></div>)}
                      </div>
                      <div className={`${s.msgTime} skinChatTime`}>
                        {fmt(msg.ts)}
                        {isRight && msg.status && <MsgStatus status={msg.status} />}
                        <button onClick={() => { setReplyingTo(msg); replyRef.current?.focus() }} title="Responder citando este mensaje"
                          style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 11, padding: '0 2px', opacity: .6 }}>↩</button>
                        <button onClick={() => copyMsg(msg)} title="Copiar mensaje"
                          style={{ background: 'none', border: 'none', color: copiedId === msg.id ? 'var(--green, #22d98a)' : 'var(--text3)', cursor: 'pointer', fontSize: 11, padding: '0 2px', opacity: .6 }}>{copiedId === msg.id ? '✓' : '📋'}</button>
                        <button onClick={() => setForwardMsg(msg)} title="Reenviar a otro chat"
                          style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 11, padding: '0 2px', opacity: .6 }}>➡</button>
                      </div>
                    </div>
                    </Fragment>
                  )
                })}
                {selectedConv.flowRunning && (
                  <div className={`${s.msgGroup} ${s.msgRight}`}>
                    <div className={s.senderTag}><span className={`${s.tagAI} skinTag`}>🤖 Agente IA</span></div>
                    <div className={`${s.msg} ${s.msgAI} skinMsgAI ${s.typingBubble}`}>
                      <span className={s.typingDots}><span></span><span></span><span></span></span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            {showSidePanel && (
              <ConvSidePanel
                conv={selectedConv}
                agentId={selectedAgent?.id}
                onClose={() => setShowSidePanel(false)}
              />
            )}
          </div>

          {/* Reply input */}
          {(() => {
            const waWindow = waWindowState(selectedConv)
            const windowClosed = waWindow && !waWindow.open
            return (
              <div className={`${s.inputArea} skinInputArea`}>
                <div className={s.inputLabel}>
                  Respondiendo como <strong>{session?.name}</strong>
                  {selectedConv.aiEnabled === false && <span className={s.aiOffBadge}> · IA desactivada</span>}
                  {selectedConv.flowRunning && <span className={s.flowRunningLabel}> · Flujo ejecutándose...</span>}
                  {waWindow?.open && <span className={s.waOk}> · 🟢 Ventana 24 h: {fmtRemaining(waWindow.expiresAt - Date.now())} restantes</span>}
                </div>
                {windowClosed ? (
                  <div className={s.waClosed}>
                    <div className={s.waClosedMsg}>
                      🔒 La ventana de 24 h de WhatsApp está cerrada{waWindow.lastTs ? ` (último mensaje del cliente ${fmtDate(waWindow.lastTs)})` : ''}. No puedes enviar mensajes libres a este contacto. Solo puedes enviar una <strong>plantilla aprobada</strong> o ejecutar un <strong>flujo</strong>.
                    </div>
                    <div className={s.waClosedActions}>
                      <button className={s.waClosedBtn} onClick={() => setShowTemplates(true)}>📋 Enviar plantilla</button>
                      <button className={s.waClosedBtn} onClick={() => setShowRunFlow(true)}>⚡ Enviar flujo</button>
                    </div>
                  </div>
                ) : (
                  <div>
                  {replyingTo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', margin: '0 0 6px', background: 'var(--bg3)', borderLeft: '3px solid var(--accent)', borderRadius: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)' }}>↩ Respondiendo a {replyingTo.sender === 'user' ? (selectedConv.guestName || 'Cliente') : 'ti'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyingTo.content || (replyingTo.kind ? `[${replyingTo.kind}]` : '…')}</div>
                      </div>
                      <button onClick={() => setReplyingTo(null)} title="Cancelar" style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                  )}
                  <div className={s.inputRow}>
                    <MediaInput
                      accId={account?.id}
                      agId={selectedAgent?.id}
                      convId={selectedConvId}
                      sender="human"
                      senderName={session?.name || 'Asesor'}
                    />
                    <StickerPicker
                      accId={account?.id}
                      agId={selectedAgent?.id}
                      convId={selectedConvId}
                      senderName={session?.name || 'Asesor'}
                    />
                    {/* Respuestas rápidas + emojis: junto a la caja de texto (abren hacia arriba) */}
                    <ChatToolbar
                      accountId={account?.id}
                      conv={selectedConv}
                      sections={['qr', 'emoji']}
                      up
                      onInsertText={txt => {
                        setReply(prev => prev + (prev && !prev.endsWith(' ') && !txt.startsWith(' ') ? ' ' : '') + txt)
                        setTimeout(() => replyRef.current?.focus(), 50)
                      }}
                      onSendAudio={sendQuickAudio}
                    />
                    <button className={`${s.sendBtn} skinSendBtn`} title="Galería de medios"
                      style={{ background: 'transparent', border: '1px solid var(--border2)' }}
                      onClick={() => setShowGallery(true)}>🖼</button>
                    {selectedConv.channel === 'whatsapp' && (
                      <button
                        className={`${s.sendBtn} skinSendBtn`}
                        title="Enviar plantilla de WhatsApp"
                        style={{ background: 'transparent', border: '1px solid var(--border2)' }}
                        onClick={() => setShowTemplates(true)}>📋</button>
                    )}
                    <VarAutocomplete
                      inputRef={replyRef}
                      value={reply}
                      onChange={setReply}
                      variables={account?.variables || []}
                      placeholder="Respuesta manual…  (usa {{nombre}}, {{email}}…)"
                      style={{ width: '100%' }}
                      wrapperStyle={{ flex: 1, minWidth: 0 }}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }} />
                    <button className={`${s.sendBtn} skinSendBtn`} onClick={sendReply}>↑</button>
                  </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
        )
      })() : (
        <div className={s.noConv}>Selecciona una conversación</div>
      )}

      {/* Modals */}
      {showPipelineModal && selectedConv && (
        <PipelineConvoModal conv={selectedConv} agentId={selectedAgent?.id} onClose={() => setShowPipelineModal(false)} />
      )}
      {showTemplates && selectedConv && (
        <WhatsAppTemplateModal
          accId={account?.id}
          agentId={selectedAgent?.id}
          conv={selectedConv}
          onClose={() => setShowTemplates(false)}
          onSent={() => reloadConvos()}
        />
      )}
      {showRunFlow && selectedConv && (
        <RunFlowModal conv={selectedConv} agentId={selectedAgent?.id} onClose={() => setShowRunFlow(false)} />
      )}
      {showBookModal && selectedConv && (
        <BookAppointmentModal
          accId={account?.id}
          conv={selectedConv}
          onClose={() => setShowBookModal(false)}
          onBooked={(bk, cal) => { setBookToast(`✅ Cita agendada: ${bk?.date || ''} ${bk?.time || ''}${cal ? ` · ${cal.name}` : ''}`); setTimeout(() => setBookToast(''), 4000) }}
        />
      )}
      {bookToast && (
        <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 10000,
          background: '#1c8f5a', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, boxShadow: '0 6px 24px rgba(0,0,0,.3)' }}>
          {bookToast}
        </div>
      )}
      {forwardMsg && (
        <ForwardModal msg={forwardMsg} account={account} session={session} agents={account?.agents || []} getConvos={getConvos} onClose={() => setForwardMsg(null)} />
      )}
      {showGallery && account?.id && (
        <GalleryModal accId={account.id} onClose={() => setShowGallery(false)} onSend={selectedConvId ? sendGalleryItem : null} />
      )}
    </div>
  )
}

// Reenviar un mensaje a otro chat: lista las conversaciones de los agentes visibles.
function ForwardModal({ msg, account, session, agents, getConvos, onClose }) {
  const [q, setQ] = useState('')
  const [sending, setSending] = useState('')
  const [done, setDone] = useState([])
  const text = msg.content || msg.transcription || msg.mediaUrl || msg.media?.url || ''
  const convs = []
  for (const ag of (agents || [])) for (const c of (getConvos(ag.id) || [])) convs.push({ ...c, _agentId: ag.id, _agentName: ag.name })
  const k = q.trim().toLowerCase()
  const filtered = (k ? convs.filter(c => (c.guestName || '').toLowerCase().includes(k)) : convs).slice(0, 50)
  async function forwardTo(c) {
    setSending(c.id)
    try {
      // Si el mensaje es un medio guardado (mediaId), se reenvía como medio; si no, como texto.
      if (msg.mediaId) {
        const blob = await (await fetch(mediaUrl(account.id, msg.mediaId))).blob()
        await uploadMedia(account.id, c._agentId, c.id, blob, { sender: 'human', senderName: session?.name || 'Asesor', kind: msg.kind || msg.media?.kind || 'file', filename: msg.filename || 'archivo', caption: msg.content || '' })
      } else {
        await sendManualMessage(account.id, c._agentId, c.id, text, session?.name || 'Asesor')
      }
      setDone(d => [...d, c.id])
    } catch (e) { alert(e.message || 'No se pudo reenviar') }
    finally { setSending('') }
  }
  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001, padding: 16 }
  const box = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, width: 'min(440px,96vw)', maxHeight: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.4)' }
  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700 }}>
          <span>➡ Reenviar mensaje</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)' }}>“{(text || '[multimedia]').slice(0, 140)}”</div>
        <div style={{ padding: '10px 16px 0' }}><input autoFocus placeholder="🔍 Buscar chat…" value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%', padding: '8px 10px', fontSize: 13, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, boxSizing: 'border-box' }} /></div>
        <div style={{ padding: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)', padding: 8 }}>Sin chats.</div>}
          {filtered.map(c => (
            <button key={c._agentId + c.id} disabled={sending === c.id || done.includes(c.id)} onClick={() => forwardTo(c)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', color: 'var(--text)' }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-dim, rgba(124,111,255,.18))', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{(c.guestName || '?').slice(0, 2).toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.guestName || '(sin nombre)'}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c._agentName}</div>
              </div>
              {done.includes(c.id) ? <span style={{ color: 'var(--green, #22d98a)', fontSize: 12 }}>✓ Enviado</span> : sending === c.id ? <span style={{ fontSize: 11, color: 'var(--text3)' }}>…</span> : <span style={{ fontSize: 11, color: 'var(--accent)' }}>Enviar</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Paso del modo debug: chip centrado entre mensajes con categoría + valor.
// Cada tipo de acción tiene su propio color (flujo / paso / variable / etc).
const DEBUG_STYLE = {
  flow_start:   { cat: 'Flujo ejecutado',            icon: '⚡', color: '#7c6fff', bg: 'rgba(124,111,255,.12)', border: 'rgba(124,111,255,.4)' },
  flow_step:    { cat: 'Paso ejecutado',             icon: '▸', color: '#4fa8ff', bg: 'rgba(79,168,255,.12)',  border: 'rgba(79,168,255,.4)' },
  variable_set: { cat: 'Valor de variable cambiado', icon: '📝', color: '#22d98a', bg: 'rgba(34,217,138,.12)', border: 'rgba(34,217,138,.4)' },
  message_sent: { cat: 'Mensaje enviado',            icon: '💬', color: '#2dd4c8', bg: 'rgba(45,212,200,.12)', border: 'rgba(45,212,200,.4)' },
  tool_call:    { cat: 'Herramienta ejecutada',      icon: '🔧', color: '#f5a623', bg: 'rgba(245,166,35,.12)', border: 'rgba(245,166,35,.4)' },
  tool_result:  { cat: 'Resultado de herramienta',   icon: '✅', color: '#f5a623', bg: 'rgba(245,166,35,.12)', border: 'rgba(245,166,35,.4)' },
  ai_response:  { cat: 'Respuesta IA',               icon: '🤖', color: '#c179ff', bg: 'rgba(193,121,255,.12)', border: 'rgba(193,121,255,.4)' },
  error:        { cat: 'Error',                      icon: '❌', color: '#ff5f5f', bg: 'rgba(255,95,95,.12)',  border: 'rgba(255,95,95,.45)' },
  system:       { cat: 'Sistema',                    icon: 'ℹ️', color: '#4fa8ff', bg: 'rgba(79,168,255,.1)',  border: 'rgba(79,168,255,.3)' },
  flow_run:     { cat: 'Flujo',                      icon: '•', color: 'var(--text2)', bg: 'var(--bg3)', border: 'var(--border2)' },
}
function fmtDebugVal(v) {
  if (v === undefined || v === null || v === '') return '(vacío)'
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s.length > 300 ? s.slice(0, 300) + '…' : s
}
function DebugStep({ entry }) {
  const st = DEBUG_STYLE[entry.type] || { cat: entry.type || 'Acción', icon: '•', color: 'var(--text2)', bg: 'var(--bg3)', border: 'var(--border2)' }
  const d = entry.detail && typeof entry.detail === 'object' ? entry.detail : null
  const tooltip = entry.detail
    ? (typeof entry.detail === 'object' ? JSON.stringify(entry.detail, null, 2) : String(entry.detail))
    : ''

  const wrap = { alignSelf: 'center', margin: '4px auto', maxWidth: '86%', width: 'fit-content' }
  const box  = { background: st.bg, border: `1px solid ${st.border}`, borderRadius: 12, padding: '6px 12px', textAlign: 'center', minWidth: 180 }
  const catLine = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', color: st.color, fontWeight: 700, opacity: .9 }
  const subBox = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', fontSize: 12, color: 'var(--text1)', wordBreak: 'break-word', textAlign: 'left' }
  const subLabel = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', fontWeight: 700, marginBottom: 2 }

  // ── Flujo ejecutado: nombre + ID ───────────────────────────────────────────
  if (entry.type === 'flow_start') {
    return (
      <div style={wrap}><div style={box} title={tooltip}>
        <div style={catLine}>{st.icon} {st.cat}</div>
        <div style={{ fontSize: 13, color: 'var(--text1)', marginTop: 2, fontWeight: 600 }}>{entry.title || '(sin nombre)'}</div>
        {d?.flowId && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>ID: {d.flowId}</div>}
      </div></div>
    )
  }

  // ── Variable cambiada: cuadrito anterior + cuadrito nuevo ──────────────────
  if (entry.type === 'variable_set' && d) {
    return (
      <div style={wrap}><div style={box} title={tooltip}>
        <div style={catLine}>{st.icon} {st.cat}</div>
        <div style={{ fontSize: 13, color: 'var(--text1)', margin: '2px 0 6px', fontWeight: 600 }}>{d.name || entry.title}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
          <div style={{ ...subBox, flex: 1 }}>
            <div style={subLabel}>Anterior</div>
            <div>{fmtDebugVal(d.from)}</div>
          </div>
          <div style={{ alignSelf: 'center', color: st.color, fontWeight: 700 }}>→</div>
          <div style={{ ...subBox, flex: 1, borderColor: st.border }}>
            <div style={{ ...subLabel, color: st.color }}>Nuevo</div>
            <div>{fmtDebugVal(d.to)}</div>
          </div>
        </div>
      </div></div>
    )
  }

  // ── Mensaje enviado: muestra el texto en su cuadro ─────────────────────────
  if (entry.type === 'message_sent') {
    return (
      <div style={wrap}><div style={{ ...box, maxWidth: 420 }} title={tooltip}>
        <div style={catLine}>{st.icon} {st.cat}</div>
        <div style={{ ...subBox, marginTop: 4 }}>{fmtDebugVal(entry.title)}</div>
      </div></div>
    )
  }

  // ── Genérico (paso, herramienta, IA, error, sistema) ───────────────────────
  return (
    <div style={wrap}><div style={box} title={tooltip}>
      <div style={catLine}>{st.icon} {st.cat}</div>
      <div style={{ fontSize: 12, color: 'var(--text1)', marginTop: 2, wordBreak: 'break-word', lineHeight: 1.4 }}>
        {entry.title}
      </div>
    </div></div>
  )
}

// Indicador de estado de un mensaje saliente (estilo WhatsApp).
function MsgStatus({ status }) {
  if (status === 'failed') return <span title="No entregado" style={{ marginLeft: 6, color: '#ff5f5f' }}>⚠</span>
  const read = status === 'read'
  const double = status === 'delivered' || status === 'read'
  const color = read ? '#53bdeb' : 'var(--text3)'
  const label = status === 'read' ? 'Visto' : status === 'delivered' ? 'Entregado' : 'Enviado'
  return (
    <span title={label} style={{ marginLeft: 6, color, fontSize: 11, letterSpacing: '-2px' }}>
      {double ? '✓✓' : '✓'}
    </span>
  )
}

// ── Popup de filtros avanzados (combinables) ────────────────────────────────────
function FilterModal({ filters, setFilters, labels, members, activeCount, onClear, onSave, onClose }) {
  const f = filters
  const set = (k, v) => setFilters(prev => ({ ...normalizeFilters(prev), [k]: v }))
  const toggleLabel = id => setFilters(prev => {
    const n = normalizeFilters(prev)
    return { ...n, labelIds: n.labelIds.includes(id) ? n.labelIds.filter(x => x !== id) : [...n.labelIds, id] }
  })

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
  const box = { width: '100%', maxWidth: 520, maxHeight: '90vh', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
  const head = { padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }
  const body = { padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }
  const foot = { padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }
  const inp = { padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontSize: 13, width: '100%', boxSizing: 'border-box' }
  const lbl = { fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '.04em' }
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }
  const btn = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text1)', cursor: 'pointer', fontSize: 13 }
  const chk = { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--text2)', cursor: 'pointer', padding: '6px 10px', border: '1px solid var(--border2)', borderRadius: 8, background: 'var(--bg3)' }
  const Sel = ({ label, value, onChange, opts }) => (
    <div><label style={lbl}>{label}</label>
      <select style={inp} value={value} onChange={e => onChange(e.target.value)}>
        {opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select></div>
  )

  const modal = (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <div style={head}>
          <strong style={{ fontSize: 15 }}>⛃ Filtros avanzados {activeCount ? <span style={{ fontSize: 12, color: 'var(--accent)' }}>· {activeCount} activo{activeCount !== 1 ? 's' : ''}</span> : ''}</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <div style={body}>
          <div>
            <label style={lbl}>Buscar en nombre y mensajes</label>
            <input style={inp} placeholder="🔎 Escribe para buscar…" value={f.q} onChange={e => set('q', e.target.value)} />
          </div>

          <div style={grid}>
            <Sel label="Inteligencia artificial" value={f.aiState} onChange={v => set('aiState', v)}
              opts={[['all', 'Todas'], ['on', '🤖 IA activa'], ['off', '👤 Atendido por humano']]} />
            <Sel label="Asignado a" value={f.assignee} onChange={v => set('assignee', v)}
              opts={[['all', 'Cualquiera'], ['unassigned', 'Sin asignar'], ...members.map(m => [m.id, m.name || m.email])]} />
            <Sel label="Actividad reciente" value={f.activity} onChange={v => set('activity', v)}
              opts={[['any', 'Cualquiera'], ['today', 'Activas hoy'], ['7d', 'Últimos 7 días'], ['30d', 'Últimos 30 días'], ['stale7', 'Sin actividad +7 días'], ['stale30', 'Sin actividad +30 días']]} />
            <Sel label="Creada" value={f.created} onChange={v => set('created', v)}
              opts={[['any', 'Cualquiera'], ['today', 'Hoy'], ['7d', 'Últimos 7 días'], ['30d', 'Últimos 30 días']]} />
            <Sel label="Ventana de WhatsApp (24h)" value={f.waWindow} onChange={v => set('waWindow', v)}
              opts={[['any', 'Cualquiera'], ['open', '🟢 Abierta'], ['closed', '🔴 Cerrada']]} />
            <div><label style={lbl}>Mínimo de mensajes</label>
              <input style={inp} type="number" min="0" value={f.minMsgs} onChange={e => set('minMsgs', e.target.value)} placeholder="cualquiera" /></div>
          </div>

          {(labels || []).length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ ...lbl, marginBottom: 0 }}>Etiquetas</label>
                {f.labelIds.length > 1 && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[['any', 'Cualquiera'], ['all', 'Todas']].map(([v, t]) => (
                      <button key={v} onClick={() => set('labelMatch', v)} style={{ ...btn, padding: '3px 9px', fontSize: 11, ...(f.labelMatch === v ? { background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700 } : {}) }}>{t}</button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {labels.map(l => {
                  const on = f.labelIds.includes(l.id)
                  return (
                    <button key={l.id} onClick={() => toggleLabel(l.id)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '4px 11px', borderRadius: 20, cursor: 'pointer',
                        border: `1px solid ${on ? (l.color || 'var(--accent)') : 'var(--border2)'}`,
                        background: on ? (l.color || 'var(--accent)') + '26' : 'var(--bg3)', color: on ? (l.color || 'var(--accent)') : 'var(--text2)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color || 'var(--accent)' }} />{l.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label style={lbl}>Estado</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[['unread', '📩 Sin leer'], ['unreplied', '⏳ Sin responder'], ['followup', '⭐ En seguimiento'], ['flowRunning', '⚡ Flujo activo']].map(([k, t]) => (
                <label key={k} style={{ ...chk, ...(f[k] ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}) }}>
                  <input type="checkbox" checked={!!f[k]} onChange={e => set(k, e.target.checked)} /> {t}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div style={foot}>
          <button style={{ ...btn, color: activeCount ? 'var(--text1)' : 'var(--text3)' }} onClick={onClear} disabled={!activeCount}>Limpiar todo</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btn} onClick={onSave} title="Guardar esta combinación de filtros">💾 Guardar filtro</button>
            <button style={{ ...btn, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700, padding: '8px 20px' }} onClick={onClose}>Listo</button>
          </div>
        </div>
      </div>
    </div>
  )
  return createPortal(modal, document.body)
}

// ── Modal para crear un filtro guardado ─────────────────────────────────────────
const CH_LABELS = { webchat: '🌐 Web', whatsapp: '📱 WhatsApp', messenger: '💬 Messenger', instagram: '📸 Instagram', test: '🧪 Test' }
// Guarda la combinación ACTUAL de filtros (rápido + canal + avanzados) con un nombre.
function SaveFilterModal({ initial, canGlobal, channels, labels, onSave, onClose }) {
  const [name, setName] = useState('')
  const [scope, setScope] = useState('personal')

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }
  const box = { width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 14, padding: 18 }
  const field = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }
  const lbl = { fontSize: 12, color: 'var(--text2)', fontWeight: 500 }
  const inp = { padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontSize: 13, width: '100%', boxSizing: 'border-box' }
  const subTitle = { fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '6px 0' }

  // Resumen legible de la combinación que se va a guardar.
  const f = normalizeFilters(initial.filters)
  const chips = []
  const qfLabel = QUICK_FILTERS.find(q => q.id === initial.quickFilter)?.label
  if (initial.quickFilter && initial.quickFilter !== 'all' && qfLabel) chips.push(qfLabel)
  if (initial.channelFilter) chips.push(CH_LABELS[initial.channelFilter] || initial.channelFilter)
  if (f.q?.trim()) chips.push(`“${f.q.trim()}”`)
  if (f.aiState === 'on') chips.push('IA activa'); if (f.aiState === 'off') chips.push('Humano')
  f.labelIds.forEach(id => { const l = (labels || []).find(x => x.id === id); if (l) chips.push('🏷 ' + l.name) })
  if (f.assignee === 'unassigned') chips.push('Sin asignar'); else if (f.assignee !== 'all') chips.push('Asignado')
  if (f.unread) chips.push('Sin leer'); if (f.flowRunning) chips.push('Flujo activo')
  if (f.followup) chips.push('Seguimiento'); if (f.unreplied) chips.push('Sin responder')
  const ACT = { today: 'Activas hoy', '7d': 'Activas 7d', '30d': 'Activas 30d', stale7: 'Sin actividad +7d', stale30: 'Sin actividad +30d' }
  if (ACT[f.activity]) chips.push(ACT[f.activity])
  const CRE = { today: 'Nuevas hoy', '7d': 'Nuevas 7d', '30d': 'Nuevas 30d' }
  if (CRE[f.created]) chips.push(CRE[f.created])
  if (f.waWindow === 'open') chips.push('Ventana WA abierta'); if (f.waWindow === 'closed') chips.push('Ventana WA cerrada')
  if (f.minMsgs) chips.push(`≥ ${f.minMsgs} msgs`)

  function save() {
    if (!name.trim()) return
    onSave(name.trim(), canGlobal ? scope : 'personal', {
      quickFilter: initial.quickFilter || 'all',
      channelFilter: initial.channelFilter || null,
      filters: f,
    })
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <strong style={{ fontSize: 15 }}>Guardar filtro</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={field}><label style={lbl}>Nombre del filtro</label>
          <input autoFocus style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: VIP sin responder" /></div>

        <div style={subTitle}>Se guardará esta combinación</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {chips.length === 0 ? <span style={{ fontSize: 12.5, color: 'var(--text3)' }}>Sin filtros activos (mostrará todas las conversaciones).</span>
            : chips.map((c, i) => <span key={i} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-dim, rgba(79,168,255,.15))', border: '1px solid var(--border2)', borderRadius: 20, padding: '3px 10px' }}>{c}</span>)}
        </div>

        <div style={subTitle}>Tipo de filtro</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', border: '1px solid ' + (scope === 'personal' ? 'var(--accent)' : 'var(--border2)'), borderRadius: 8, cursor: 'pointer', fontSize: 13, background: scope === 'personal' ? 'var(--accent-dim)' : 'transparent' }}>
            <input type="radio" checked={scope === 'personal'} onChange={() => setScope('personal')} /> 👤 Personal</label>
          <label title={canGlobal ? '' : 'Sólo el owner puede crear filtros globales'}
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', border: '1px solid ' + (scope === 'global' ? 'var(--accent)' : 'var(--border2)'), borderRadius: 8, cursor: canGlobal ? 'pointer' : 'not-allowed', opacity: canGlobal ? 1 : .5, fontSize: 13, background: scope === 'global' ? 'var(--accent-dim)' : 'transparent' }}>
            <input type="radio" disabled={!canGlobal} checked={scope === 'global'} onChange={() => setScope('global')} /> 🌐 Global</label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
          <button onClick={save} disabled={!name.trim()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: name.trim() ? 1 : .5 }}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
