import { useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useState, useRef, useCallback } from 'react'
import { generateGuest, createConvo, appendMsg, readConvos, K } from '../../lib/storage'
import { api, getSocket } from '../../lib/api'
import { runTrigger, executeFlow } from '../../lib/flowEngine'
import { PROVIDERS } from '../../lib/aiClient'
import MediaInput   from '../../components/media/MediaInput'
import MediaMessage from '../../components/media/MediaMessage'
import s from './WebchatPage.module.css'

export default function WebchatPage() {
  const { accId, agId, lnkId } = useParams()
  const [searchParams] = useSearchParams()
  // 'main' → use fallbackFlowId, 'test' → use testFlowId
  const flowMode = searchParams.get('mode') || 'main'
  // Chat de prueba lanzado desde el editor de flujos: conversación pre-creada
  // (siempre nueva) + flujo a ejecutar automáticamente al abrir.
  const convIdParam   = searchParams.get('convId')
  const autoRunFlowId = searchParams.get('runFlow')

  const [accountData, setAccountData] = useState(null)
  const [loadError, setLoadError]     = useState(null)
  const [session,   setSession]       = useState(null)
  const [conv,      setConv]          = useState(null)
  const [messages,  setMessages]      = useState([])
  const [input,     setInput]         = useState('')
  const [loading,   setLoading]       = useState(false)
  const [streamText, setStreamText]   = useState('')
  const [mediaMaxMb, setMediaMaxMb]   = useState(30)
  const initialized = useRef(false)
  const bottomRef   = useRef(null)

  const account = accountData
  const agent   = account?.agents?.find(a => a.id === agId)
  const channel = agent?.channels?.find(c => c.id === lnkId && ['webchat', 'test'].includes(c.type))
            || agent?.links?.find(l => l.id === lnkId)

  const activePrompt = agent?.prompts?.find(p => p.isActive) || {
    content: agent?.systemPrompt || 'Eres un asistente útil.',
    provider: 'openai', model: agent?.model || 'gpt-4o-mini',
  }

  // ── Load account from public API ────────────────────────────────────────────
  useEffect(() => {
    api.get(`/api/public/accounts/${accId}`)
      .then(data => setAccountData(data))
      .catch(() => setLoadError('Cuenta no encontrada'))
    // Public integrations endpoint exposes the configured media upload limit
    api.get('/api/platform/integrations')
      .then(d => { if (d?.mediaMaxSizeMb) setMediaMaxMb(d.mediaMaxSizeMb) })
      .catch(() => {})
  }, [accId])

  // ── Init session once account/agent loaded ──────────────────────────────────
  useEffect(() => {
    if (!agent || !channel || initialized.current) return
    initialized.current = true

    // Chat de prueba pre-creado por el editor: NO usamos sessionStorage (queremos
    // un chat nuevo cada vez). Cargamos la conversación indicada y ejecutamos el flujo.
    if (convIdParam) {
      api.get(`/api/conversations/${accId}/${agId}/${convIdParam}`)
        .then(c => {
          const sess = { convId: convIdParam, guestName: c?.guestName || 'Prueba', guestId: c?.guestId || '' }
          setSession(sess)
          setConv(c)
          setMessages([buildWelcome(agent), ...((c?.messages) || [])])
          if (autoRunFlowId) {
            setTimeout(() => {
              executeFlow({ flowId: autoRunFlowId, accId, agId, convId: convIdParam, triggeredBy: { type: 'test' } })
            }, 600)
          }
        })
        .catch(() => setLoadError('No se pudo abrir el chat de prueba'))
      return
    }

    const sKey   = K.webchatSession(agId, lnkId)
    const stored = sessionStorage.getItem(sKey)
    if (stored) {
      const sess = JSON.parse(stored)
      setSession(sess)
      api.get(`/api/conversations/${accId}/${agId}/${sess.convId}`)
        .then(c => { setConv(c); setMessages([buildWelcome(agent), ...(c.messages || [])]) })
        .catch(() => {})
    } else {
      ;(async () => {
        const { name, id } = await generateGuest()
        const convId = await createConvo(accId, agId, lnkId, name, id)
        const sess   = { convId, guestName: name, guestId: id }
        sessionStorage.setItem(sKey, JSON.stringify(sess))
        setSession(sess)
        setMessages([buildWelcome(agent)])
        setTimeout(() => runTrigger({ trigger: 'conversation_start', accId, agId, convId }), 600)
      })()
    }
  }, [agent?.id, channel?.id])

  // ── WebSocket: join per-conversation room for real-time messages ────────────
  useEffect(() => {
    if (!session?.convId) return
    const sock = getSocket()
    if (!sock.connected) sock.connect()

    const joinConv = () => sock.emit('join:conv', session.convId)
    joinConv()
    // Re-join room on reconnect to keep receiving messages after network drops
    sock.on('connect', joinConv)

    const onMessage = ({ message }) => {
      if (message.sender === 'user') return
      setMessages(prev => {
        // Dedup by id (post-server-roundtrip) OR by content+sender within 10s
        // (handles race where socket arrives before local tempId is updated)
        const exists = prev.some(m =>
          (m.id && message.id && m.id === message.id) ||
          (m.content === message.content && m.sender === message.sender && Math.abs((m.ts || 0) - (message.ts || 0)) < 10000)
        )
        if (exists) return prev
        return [...prev, message]
      })
    }
    sock.on('message:new', onMessage)

    return () => {
      sock.off('connect', joinConv)
      sock.off('message:new', onMessage)
      sock.emit('leave:conv', session.convId)
    }
  }, [session?.convId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length, streamText])

  // ── Send message ────────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || loading || !session) return

    const userMsg = { role: 'user', sender: 'user', senderName: session.guestName, content: input.trim(), ts: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setStreamText('')

    await appendMsg(accId, agId, session.convId, userMsg)

    // Si un asesor tomó el control, no responde ningún automatismo
    const freshConvs = await readConvos(accId, agId)
    const freshConv  = freshConvs.find(c => c.id === session.convId)
    if (freshConv?.flowRunning || freshConv?.aiEnabled === false) {
      setLoading(false)
      return
    }

    // El flujo de entrada (principal o de pruebas) es el ÚNICO respondedor por
    // mensaje. La IA nunca se invoca directamente. Cuando hay flujo de entrada
    // NO se corren además los triggers por palabra clave (eso duplicaría la
    // respuesta) — el ruteo por keyword debe vivir DENTRO del flujo.
    const isTestChannel = channel?.type === 'test'
    const entryFlowId = isTestChannel && flowMode === 'test'
      ? (agent?.testFlowId || agent?.fallbackFlowId)  // modo prueba: prioriza testFlowId
      : agent?.fallbackFlowId                           // modo principal: fallbackFlowId

    if (entryFlowId) {
      await executeFlow({
        flowId: entryFlowId, accId, agId,
        convId: session.convId,
        triggerContext: { message: userMsg.content, _lastUserMessage: userMsg.content },
      })
    } else {
      // Sin flujo de entrada: solo flujos legacy disparados por palabra clave
      await runTrigger({ trigger: 'keyword', accId, agId, convId: session.convId, context: { message: userMsg.content } })
    }
    setLoading(false)
  }

  // ── Media del usuario (audio/imagen/archivo) → ejecuta el flujo ──────────────
  // El audio se transcribe en el servidor (uploadMedia) y vuelve en r.transcription;
  // esa transcripción alimenta {{_lastUserMessage}}. Para imagen/archivo el flujo
  // (nodo Acumular / IA) lee la media desde la conversación.
  async function handleUserMedia(r) {
    if (!session) return
    const text = r?.transcription || ''
    try {
      const freshConvs = await readConvos(accId, agId)
      const freshConv  = freshConvs.find(c => c.id === session.convId)
      if (freshConv?.aiEnabled === false) return
    } catch {}
    setLoading(true)
    try {
      const isTestChannel = channel?.type === 'test'
      const entryFlowId = isTestChannel && flowMode === 'test'
        ? (agent?.testFlowId || agent?.fallbackFlowId)
        : agent?.fallbackFlowId
      if (entryFlowId) {
        await executeFlow({ flowId: entryFlowId, accId, agId, convId: session.convId, triggerContext: { message: text, _lastUserMessage: text } })
      } else if (text) {
        await runTrigger({ trigger: 'keyword', accId, agId, convId: session.convId, context: { message: text } })
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loadError) return <ErrorPage title="Error" msg={loadError} />
  if (!account)  return <div className={s.page}><div className={s.loading}>Cargando...</div></div>
  if (!agent)    return <ErrorPage title="Agente no encontrado" msg="Este agente no existe." />
  if (!channel)  return <ErrorPage title="Link eliminado" msg="Este link fue eliminado." />
  // En modo prueba permitimos agentes en borrador (es un chat interno de pruebas).
  if (agent.status !== 'active' && flowMode !== 'test') return <ErrorPage title="Agente no disponible" msg="Este agente está en modo borrador." />

  const aiEnabled     = conv?.aiEnabled !== false
  const providerColor = activePrompt.provider === 'deepseek' ? '#4fa8ff' : '#22d98a'
  const providerName  = PROVIDERS[activePrompt.provider || 'openai']?.name || 'IA'

  return (
    <div className={s.page}>
      <div className={s.chatBox}>
        <div className={s.header}>
          <div className={s.headerAvatar}>▲</div>
          <div className={s.headerInfo}>
            <div className={s.headerName}>{agent.name}</div>
            <div className={s.headerStatus}>
              <span className={s.statusDot} style={{ background: aiEnabled ? 'var(--green)' : 'var(--amber)' }} />
              {aiEnabled ? 'En línea' : 'Asesor humano activo'}
            </div>
          </div>
          <div className={s.providerBadge} style={{ background: providerColor + '18', color: providerColor, borderColor: providerColor + '44' }}>
            {providerName} · {activePrompt.model || 'default'}
          </div>
          {session && <div className={s.guestTag}>{session.guestName}</div>}
        </div>

        <div className={s.messages}>
          {messages.map((msg, i) => {
            const isUser  = msg.sender === 'user'
            const isAI    = msg.sender === 'ai' || (!msg.sender && msg.role === 'assistant')
            const isHuman = msg.sender === 'human'
            // El webchat lo ve el VISITANTE: sus mensajes (user) van a la derecha,
            // los del agente/IA/asesor a la izquierda.
            const isRight = isUser
            return (
              <div key={i} className={`${s.msgGroup} ${isRight ? s.msgGroupRight : s.msgGroupLeft}`}>
                <div className={s.senderTag}>
                  {isUser  && <span className={s.tagUser}>👤 {msg.senderName || session?.guestName || 'Tú'}</span>}
                  {isAI    && <span className={s.tagAI}>🤖 {agent.name}{msg.fromFlow ? ' · flujo' : ''}</span>}
                  {isHuman && <span className={s.tagHuman}>💬 {msg.senderName || 'Asesor'}</span>}
                </div>
                <div className={`${s.msg} ${isUser ? s.msgUser : isAI ? s.msgAI : s.msgHuman} ${msg.fromFlow ? s.msgFlow : ''}`}>
                  {msg.mediaId && (
                    <MediaMessage
                      accId={accId}
                      mediaId={msg.mediaId}
                      kind={msg.kind}
                      mime={msg.mime}
                      filename={msg.filename}
                      sizeBytes={msg.sizeBytes}
                    />
                  )}
                  {msg.content && <div style={{ marginTop: msg.mediaId ? 6 : 0 }}>{msg.content}</div>}
                </div>
                {msg.ts && <div className={s.msgTime}>{new Date(msg.ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</div>}
              </div>
            )
          })}
          {loading && !streamText && (
            <div className={`${s.msgGroup} ${s.msgGroupLeft}`}>
              <div className={s.senderTag}><span className={s.tagAI}>🤖 {agent.name}</span></div>
              <div className={`${s.msg} ${s.msgAI} ${s.typing}`}><span /><span /><span /></div>
            </div>
          )}
          {streamText && (
            <div className={`${s.msgGroup} ${s.msgGroupLeft}`}>
              <div className={s.senderTag}><span className={s.tagAI}>🤖 {agent.name}</span></div>
              <div className={`${s.msg} ${s.msgAI}`}>{streamText}<span className={s.cursor} /></div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {!aiEnabled && <div className={s.humanBanner}>💬 Un asesor está atendiendo tu consulta.</div>}

        <div className={s.inputArea}>
          <MediaInput
            accId={accId}
            agId={agId}
            convId={session?.convId}
            maxSizeMb={mediaMaxMb}
            sender="user"
            senderName={session?.guestName}
            disabled={loading}
            onUploaded={handleUserMedia}
          />
          <input type="text" placeholder="Escribe tu mensaje..." value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            disabled={loading} />
          <button className={s.sendBtn} onClick={sendMessage} disabled={loading || !input.trim()}>↑</button>
        </div>
        <div className={s.footer}>Powered by <strong>AVI Platform</strong></div>
      </div>
    </div>
  )
}

function buildWelcome(agent) {
  return { role: 'assistant', sender: 'ai', content: agent?.welcomeMessage || '¡Hola! ¿En qué te puedo ayudar?', ts: 0 }
}

function ErrorPage({ title, msg }) {
  return (
    <div className={s.errorPage}>
      <div className={s.errorIcon}>▲</div>
      <h1>{title}</h1><p>{msg}</p>
    </div>
  )
}
