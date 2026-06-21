import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { readConvos, getContact, updateContact, deleteContact, createSupportTicket } from '../../lib/storage'
import { useAuth } from '../../context/AuthContext'
import { formatLeadOrigin } from '../../lib/leadOrigin'
import s from './ConvSidePanel.module.css'

export default function ConvSidePanel({ conv: initialConv, agentId, onClose }) {
  const { account, setLocalVar, setConvoLabels, reloadConvos } = useAccount()
  const [activeTab, setActiveTab] = useState('info')
  // Live conv — refreshed every second to show debug updates in real time
  const [liveConv, setLiveConv] = useState(initialConv)

  useEffect(() => {
    setLiveConv(initialConv)
  }, [initialConv?.messages?.length, initialConv?.labels?.join(), initialConv?.localVars])

  // Poll debugLog separately so it updates even when main conv polling hasn't triggered
  useEffect(() => {
    if (activeTab !== 'debug') return
    const interval = setInterval(() => {
      const convos = readConvos(account?.id, agentId)
      const fresh = convos.find(c => c.id === initialConv?.id)
      if (fresh && (fresh.debugLog?.length || 0) !== (liveConv.debugLog?.length || 0)) {
        setLiveConv(fresh)
      }
    }, 800)
    return () => clearInterval(interval)
  }, [activeTab, agentId, initialConv?.id, account?.id, liveConv.debugLog?.length])

  const conv = liveConv
  if (!conv) return null

  const variables = account?.variables || []
  const labels = account?.labels || []
  const pipelines = account?.pipelines || []
  const localVars = conv.localVars || {}
  const debugLog = conv.debugLog || []

  const localVariables = variables.filter(v => v.type === 'local')
  const globalVariables = variables.filter(v => v.type === 'global')

  function handleVarChange(varId, value) {
    setLocalVar(agentId, conv.id, varId, value)
  }

  function toggleLabel(labelId) {
    const cur = conv.labels || []
    setConvoLabels(agentId, conv.id, cur.includes(labelId)
      ? cur.filter(l => l !== labelId)
      : [...cur, labelId])
  }

  const convCards = (conv.pipelineCards || []).map(pc => {
    const pipe = pipelines.find(p => p.id === pc.pipelineId)
    const card = pipe?.cards?.find(c => c.id === pc.cardId)
    if (!card || !pipe) return null
    const stage = pipe.stages?.find(st => st.id === card.stageId)
    return { ...card, pipelineName: pipe.name, stageName: stage?.name, stageColor: stage?.color }
  }).filter(Boolean)

  const DEBUG_META = {
    tool_call:    { icon: '🔧', color: '#f5a623', label: 'Tool Call' },
    tool_result:  { icon: '✅', color: '#22d98a', label: 'Resultado' },
    ai_response:  { icon: '🤖', color: '#7c6fff', label: 'Respuesta IA' },
    error:        { icon: '❌', color: '#ff5f5f', label: 'Error' },
    system:       { icon: 'ℹ️', color: '#4fa8ff', label: 'Sistema' },
    variable_set: { icon: '📝', color: '#2dd4c8', label: 'Variable' },
    flow_run:     { icon: '⚡', color: '#ff6eb4', label: 'Flujo' },
  }

  const TABS = [
    { id: 'info', label: 'Info' },
    { id: 'contact', label: 'Contacto' },
    { id: 'variables', label: 'Variables' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'labels', label: 'Etiquetas' },
    { id: 'debug', label: `🐛 Debug${debugLog.length > 0 ? ` (${debugLog.length})` : ''}` },
  ]

  return (
    <div className={s.panel}>
      <div className={s.panelHeader}>
        <div className={s.userSection}>
          <div className={s.userAvatar}>{conv.initials}</div>
          <div>
            <div className={s.userName}>{conv.guestName}</div>
            <div className={s.userSub}>ID: #{conv.guestId}</div>
          </div>
        </div>
        <button className={s.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div className={s.tabs}>
        {TABS.map(t => (
          <button key={t.id} className={`${s.tab} ${activeTab === t.id ? s.tabActive : ''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={s.body}>

        {/* ── Info ── */}
        {activeTab === 'info' && (
          <div className={s.section}>
            <div className={s.sTitle}>Información del usuario</div>
            {[
              ['Nombre', conv.guestName],
              ['ID', `#${conv.guestId}`],
              ['Link', conv.linkId],
              ['Origen', (() => { const o = formatLeadOrigin(conv.origin); return o ? `${o.icon} ${o.label}${o.detail ? ' · ' + o.detail : ''}` : '—' })()],
              ['Mensajes', conv.messages?.length || 0],
              ['Creado', new Date(conv.createdAt).toLocaleString('es')],
              ['IA activa', conv.aiEnabled !== false ? '● Activa' : '○ Desactivada'],
            ].map(([k, v]) => (
              <div key={k} className={s.infoRow}>
                <span className={s.infoKey}>{k}</span>
                <span className={s.infoVal} style={k === 'IA activa' ? { color: conv.aiEnabled !== false ? 'var(--green)' : 'var(--red)' } : {}}>{v}</span>
              </div>
            ))}
            {(conv.labels || []).length > 0 && (
              <div className={s.infoRow}>
                <span className={s.infoKey}>Etiquetas</span>
                <div className={s.labelChips}>
                  {(conv.labels || []).map(lId => {
                    const l = labels.find(x => x.id === lId)
                    return l ? <span key={lId} className={s.labelChip} style={{ background: l.color + '22', color: l.color, borderColor: l.color + '55' }}>{l.name}</span> : null
                  })}
                </div>
              </div>
            )}
            <CreateTicketInline conv={conv} agentId={agentId} />
          </div>
        )}

        {/* ── Contacto ── */}
        {activeTab === 'contact' && (
          <ContactTab conv={conv} agentId={agentId} />
        )}

        {/* ── Variables ── */}
        {activeTab === 'variables' && (
          <div>
            <div className={s.section}>
              <div className={s.sTitle}>Variables Locales</div>
              {localVariables.length === 0 && <div className={s.empty}>Sin variables locales</div>}
              {localVariables.map(v => (
                <div key={v.id} className={s.varRow}>
                  <div className={s.varMeta}>
                    <code className={s.varName}>{`{{${v.name}}}`}</code>
                    {v.isSystem && <span className={s.systemTag}>sistema</span>}
                    <span className={s.varDesc}>{v.description}</span>
                  </div>
                  <input
                    className={s.varInput}
                    value={localVars[v.id] ?? v.defaultValue ?? ''}
                    onChange={e => handleVarChange(v.id, e.target.value)}
                    placeholder={v.defaultValue || 'vacío'}
                  />
                </div>
              ))}
            </div>
            <div className={s.section}>
              <div className={s.sTitle}>Variables Globales</div>
              {globalVariables.length === 0 && <div className={s.empty}>Sin variables globales</div>}
              {globalVariables.map(v => (
                <div key={v.id} className={s.varRow}>
                  <div className={s.varMeta}>
                    <code className={s.varName}>{`{{${v.name}}}`}</code>
                    <span className={s.varDesc}>{v.description}</span>
                  </div>
                  <div className={s.globalRow}>
                    <span className={s.globalVal}>{v.defaultValue || <em style={{ color: 'var(--text3)' }}>vacío</em>}</span>
                    <span className={s.globalNote}>global</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Pipeline ── */}
        {activeTab === 'pipeline' && (
          <div className={s.section}>
            <div className={s.sTitle}>Pipelines</div>
            {convCards.length === 0 && <div className={s.empty}>No está en ningún pipeline.<br />Usa el botón 📊 en el chat.</div>}
            {convCards.map(card => (
              <div key={card.id} className={s.pipeCard}>
                <div className={s.pipeCardTop}>
                  <span className={s.pipeCardTitle}>{card.title}</span>
                  <span className={s.pipeCardPipe}>{card.pipelineName}</span>
                </div>
                {card.stageName && (
                  <span className={s.pipeCardStage} style={{ background: card.stageColor + '22', color: card.stageColor, borderColor: card.stageColor + '55' }}>
                    {card.stageName}
                  </span>
                )}
                {card.value && <span className={s.pipeCardValue}>${card.value}</span>}
              </div>
            ))}
          </div>
        )}

        {/* ── Labels ── */}
        {activeTab === 'labels' && (
          <div className={s.section}>
            <div className={s.sTitle}>Etiquetas CRM</div>
            {labels.length === 0 && <div className={s.empty}>Sin etiquetas configuradas</div>}
            {labels.map(l => {
              const active = (conv.labels || []).includes(l.id)
              return (
                <button key={l.id}
                  className={`${s.labelToggle} ${active ? s.labelToggleActive : ''}`}
                  style={active ? { background: l.color + '22', color: l.color, borderColor: l.color + '66' } : {}}
                  onClick={() => toggleLabel(l.id)}>
                  <span className={s.lDot} style={{ background: l.color }} />
                  {l.name}
                  {active && <span className={s.lCheck}>✓</span>}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Debug ── */}
        {activeTab === 'debug' && (
          <div className={s.debugSection}>
            <div className={s.sTitle}>
              Debug Log — {debugLog.length} entradas
              {debugLog.length > 0 && (
                <span className={s.liveIndicator}>● live</span>
              )}
            </div>
            {debugLog.length === 0 && (
              <div className={s.empty}>
                Sin entradas todavía.<br />
                Las acciones del agente IA, herramientas y flujos aparecerán aquí en tiempo real.
              </div>
            )}
            <div className={s.debugList}>
              {[...debugLog].reverse().map((entry, i) => {
                const meta = DEBUG_META[entry.type] || { icon: '•', color: 'var(--text2)', label: entry.type }
                return (
                  <div key={i} className={s.debugEntry} style={{ borderLeftColor: meta.color }}>
                    <div className={s.debugEntryHeader}>
                      <span className={s.debugIcon}>{meta.icon}</span>
                      <span className={s.debugType} style={{ color: meta.color }}>{meta.label}</span>
                      <span className={s.debugTime}>{new Date(entry.ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                    {entry.title && <div className={s.debugTitle}>{entry.title}</div>}
                    {entry.detail && (
                      <pre className={s.debugDetail}>
                        {typeof entry.detail === 'object'
                          ? JSON.stringify(entry.detail, null, 2)
                          : String(entry.detail)}
                      </pre>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Crear ticket de SOPORTE (al equipo AVI) referenciando este chat ─────────────
function CreateTicketInline({ conv, agentId }) {
  const { account } = useAccount()
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function create() {
    if (!subject.trim()) return
    setSaving(true)
    try {
      const ref = { convId: conv.id, agentId, accId: account.id, guestName: conv.guestName || conv.guestId || conv.id, channel: conv.channel || 'webchat' }
      await createSupportTicket({
        accId: account.id,
        accountName: account.name,
        subject: subject.trim(),
        message: message.trim() || `Ticket sobre el chat con ${ref.guestName}.`,
        authorId: session?.id,
        authorName: session?.name || 'Asesor',
        refs: [ref],
      })
      setSubject(''); setMessage(''); setOpen(false); setDone(true)
      setTimeout(() => setDone(false), 3000)
    } catch { /* noop */ }
    finally { setSaving(false) }
  }

  const btn = { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text1)', cursor: 'pointer', fontSize: 12 }
  const inp = { padding: 7, fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6, width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      {!open ? (
        <button style={{ ...btn, width: '100%' }} onClick={() => setOpen(true)}>
          🎫 Crear ticket de soporte sobre este chat
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Se enviará al equipo de soporte de AVI, referenciando este chat.</div>
          <input style={inp} placeholder="Asunto" value={subject} autoFocus onChange={e => setSubject(e.target.value)} />
          <textarea style={{ ...inp, resize: 'vertical' }} rows={3} placeholder="Describe el problema (opcional)" value={message} onChange={e => setMessage(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btn, background: 'var(--green,#22d98a)', color: '#06281c', fontWeight: 600 }} onClick={create} disabled={saving || !subject.trim()}>{saving ? 'Enviando…' : 'Enviar a soporte'}</button>
            <button style={btn} onClick={() => { setOpen(false); setSubject(''); setMessage('') }}>Cancelar</button>
          </div>
        </div>
      )}
      {done && <div style={{ color: 'var(--green,#22d98a)', fontSize: 12, marginTop: 6 }}>✓ Ticket de soporte enviado al equipo AVI</div>}
    </div>
  )
}

// ── Contact tab: ver / editar / borrar el contacto vinculado a la conversación ──
function ContactTab({ conv, agentId }) {
  const { account, reloadConvos } = useAccount()
  const contactId = conv?.localVars?.contact_id
  const [contact, setContact] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [draft, setDraft]     = useState({ name: '', email: '', phone: '', companyName: '', position: '', tags: '' })

  const fieldStyle = { padding: 8, fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6, width: '100%', boxSizing: 'border-box' }

  async function load() {
    if (!account?.id || !contactId) { setLoading(false); return }
    setLoading(true); setError('')
    try {
      const c = await getContact(account.id, contactId)
      setContact(c)
      setDraft({
        name: c.name || '', email: c.email || '', phone: c.phone || '',
        companyName: c.companyName || '', position: c.position || '',
        tags: Array.isArray(c.tags) ? c.tags.join(', ') : (c.tags || ''),
      })
    } catch (e) {
      setError('No se pudo cargar el contacto')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [account?.id, contactId])

  async function save() {
    setSaving(true); setError('')
    try {
      const tags = draft.tags.split(',').map(t => t.trim()).filter(Boolean)
      await updateContact(account.id, contactId, { ...draft, tags })
      setEditing(false)
      await load()
      reloadConvos?.()
    } catch (e) { setError('No se pudo guardar') }
    finally { setSaving(false) }
  }

  async function remove() {
    if (!confirm(`¿Eliminar el contacto "${contact?.name || ''}"? Esta acción no se puede deshacer.`)) return
    setSaving(true); setError('')
    try {
      await deleteContact(account.id, contactId)
      setContact(null)
    } catch (e) { setError('No se pudo eliminar') }
    finally { setSaving(false) }
  }

  if (loading) return <div className={s.section}><div className={s.empty}>Cargando contacto…</div></div>
  if (!contactId || !contact) return (
    <div className={s.section}>
      <div className={s.sTitle}>Contacto</div>
      <div className={s.empty}>Esta conversación no tiene un contacto vinculado en el CRM.</div>
    </div>
  )

  return (
    <div className={s.section}>
      <div className={s.sTitle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Contacto (CRM)</span>
        {!editing && (
          <span style={{ display: 'flex', gap: 6 }}>
            <button className={s.tab} onClick={() => setEditing(true)}>✏ Editar</button>
            <button className={s.tab} style={{ color: 'var(--red, #ff5f5f)' }} onClick={remove} disabled={saving}>🗑</button>
          </span>
        )}
      </div>

      {error && <div style={{ color: 'var(--red, #ff5f5f)', fontSize: 12, marginBottom: 8 }}>⚠ {error}</div>}

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input style={fieldStyle} placeholder="Nombre"   value={draft.name}        onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
          <input style={fieldStyle} placeholder="Email"    value={draft.email}       onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} />
          <input style={fieldStyle} placeholder="Teléfono" value={draft.phone}       onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} />
          <input style={fieldStyle} placeholder="Empresa"  value={draft.companyName} onChange={e => setDraft(d => ({ ...d, companyName: e.target.value }))} />
          <input style={fieldStyle} placeholder="Cargo"    value={draft.position}    onChange={e => setDraft(d => ({ ...d, position: e.target.value }))} />
          <input style={fieldStyle} placeholder="Tags (coma)" value={draft.tags}     onChange={e => setDraft(d => ({ ...d, tags: e.target.value }))} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={s.tab} onClick={save} disabled={saving} style={{ background: 'var(--green,#22d98a)', color: '#06281c', fontWeight: 600 }}>{saving ? 'Guardando…' : 'Guardar'}</button>
            <button className={s.tab} onClick={() => { setEditing(false); load() }} disabled={saving}>Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          {[
            ['Nombre', contact.name],
            ['Email', contact.email],
            ['Teléfono', contact.phone],
            ['Empresa', contact.companyName],
            ['Cargo', contact.position],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className={s.infoRow}>
              <span className={s.infoKey}>{k}</span>
              <span className={s.infoVal}>{v}</span>
            </div>
          ))}
          {Array.isArray(contact.tags) && contact.tags.length > 0 && (
            <div className={s.infoRow}>
              <span className={s.infoKey}>Tags</span>
              <span className={s.infoVal}>{contact.tags.join(', ')}</span>
            </div>
          )}
          {!contact.email && !contact.phone && !contact.companyName && (
            <div className={s.empty}>Sin datos adicionales. Pulsa ✏ Editar para completar.</div>
          )}
        </>
      )}
    </div>
  )
}
