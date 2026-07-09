import { useState, useEffect, useRef, useMemo } from 'react'
import { useAccount } from '../../context/AccountContext'
import { useAuth } from '../../context/AuthContext'
import { PROVIDERS, DEFAULT_ADVANCED, getModel } from '../../lib/aiClient'
import ChangeAgentPanel from '../changeagent/ChangeAgentPanel'
import s from './PromptsPanel.module.css'

const BLANK = {
  name: '', content: '', provider: 'openai', model: 'gpt-4o-mini',
  advanced: { ...DEFAULT_ADVANCED }, toolIds: [], ragFileIds: [], annotations: [],
}

// Paleta de colores para resaltar zonas / pines dentro del prompt.
const HL_COLORS = [
  { id: 'yellow', label: 'Amarillo', bg: 'rgba(255,214,10,.40)',  dot: '#ffcf33' },
  { id: 'green',  label: 'Verde',    bg: 'rgba(34,217,138,.36)',  dot: '#22d98a' },
  { id: 'blue',   label: 'Azul',     bg: 'rgba(79,168,255,.36)',  dot: '#4fa8ff' },
  { id: 'pink',   label: 'Rosa',     bg: 'rgba(255,105,180,.34)', dot: '#ff69b4' },
  { id: 'purple', label: 'Morado',   bg: 'rgba(178,102,255,.36)', dot: '#b266ff' },
  { id: 'orange', label: 'Naranja',  bg: 'rgba(255,149,0,.36)',   dot: '#ff9500' },
]
const colorOf = id => HL_COLORS.find(c => c.id === id) || HL_COLORS[0]

// Reubica los offsets de las anotaciones cuando cambia el texto (prefijo/sufijo
// común → una sola región reemplazada). Mantiene los pines anclados al editar.
function remapAnnotations(oldText, newText, anns) {
  if (!anns || !anns.length || oldText === newText) return anns || []
  const oldLen = oldText.length, newLen = newText.length
  let p = 0
  while (p < oldLen && p < newLen && oldText[p] === newText[p]) p++
  let s2 = 0
  while (s2 < (oldLen - p) && s2 < (newLen - p) && oldText[oldLen - 1 - s2] === newText[newLen - 1 - s2]) s2++
  const oldEnd = oldLen - s2      // fin de la región eliminada (coords viejas)
  const delta = newLen - oldLen
  const adj = x => (x <= p ? x : (x >= oldEnd ? x + delta : p))
  return anns
    .map(a => ({ ...a, start: adj(a.start), end: adj(a.end) }))
    .filter(a => a.end > a.start)
}

// Recorta el contenido (trim) reajustando los offsets de las anotaciones: desplaza
// por el espacio inicial eliminado y acota al largo recortado.
function trimWithAnns(content, anns) {
  const leading = content.length - content.replace(/^\s+/, '').length
  const trimmed = content.trim()
  const out = (anns || [])
    .map(a => ({ ...a, start: a.start - leading, end: a.end - leading }))
    .map(a => ({ ...a, start: Math.max(0, Math.min(a.start, trimmed.length)), end: Math.max(0, Math.min(a.end, trimmed.length)) }))
    .filter(a => a.end > a.start)
  return { trimmed, anns: out }
}

// Divide el texto en segmentos según las anotaciones (recorta solapes: gana la
// primera). Se usa para pintar el "backdrop" alineado con el textarea.
function buildSegments(text, anns) {
  const pts = (anns || []).filter(a => a.end > a.start).slice().sort((a, b) => a.start - b.start)
  const segs = []; let i = 0
  for (const a of pts) {
    const start = Math.max(a.start, i)
    if (start > i) segs.push({ text: text.slice(i, start) })
    if (a.end > start) { segs.push({ text: text.slice(start, a.end), ann: a }); i = a.end }
  }
  if (i < text.length) segs.push({ text: text.slice(i) })
  return segs
}

function compact(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + 'k'
  return String(n)
}

export default function PromptsPanel({ agentId }) {
  const { account, addPrompt, updatePrompt, setActivePrompt, deletePrompt, getChangeAgentInfo } = useAccount()
  const { session } = useAuth()
  // Solo un SUPER ADMIN (sesión superadmin o impersonando) puede ver/cambiar el
  // modelo IA de los prompts. El owner y demás usuarios no lo ven.
  const isSA = session?.type === 'superadmin' || !!session?.isImpersonating
  // Modelo por defecto para prompts nuevos (lo fija el super admin en su panel).
  const defProvider = account?.defaultPromptProvider || 'deepseek'
  const defModel = account?.defaultPromptModel || 'deepseek-v4-flash'
  const agent = account?.agents?.find(a => a.id === agentId)
  const prompts = agent?.prompts || []
  const aiTools = account?.aiTools || []
  // Archivos de la base de conocimiento (RAG) asignables a un prompt, igual que
  // las Herramientas IA. Se reutiliza el componente ToolsPicker.
  const ragFiles = (agent?.rag?.files || []).map(f => ({
    id: f.id,
    name: f.name,
    description: `${f.chunkCount || 0} fragmentos`,
  }))
  const [showNew, setShowNew] = useState(false)
  const [showChangeAgent, setShowChangeAgent] = useState(false)
  const [newP, setNewP] = useState(BLANK)
  const [expandedId, setExpandedId] = useState(null)
  const [drafts, setDrafts] = useState({}) // { [id]: {name, content, provider, model} }
  const [toast, setToast] = useState('')
  const [fs, setFs] = useState(null) // { target: 'new' | promptId } → editor a pantalla completa

  const caInfo = getChangeAgentInfo()

  // Enlaza el modal de pantalla completa al contenido + anotaciones en edición.
  const fsCtx = (() => {
    if (!fs) return null
    if (fs.target === 'new') return {
      title: newP.name || 'Nuevo prompt', value: newP.content, annotations: newP.annotations || [],
      onChange: editNewContent, onAnnotationsChange: a => setNewP(p => ({ ...p, annotations: a })),
    }
    const d = drafts[fs.target]
    if (!d) return null
    return {
      title: d.name || 'Prompt', value: d.content, annotations: d.annotations || [],
      onChange: v => editDraftContent(fs.target, v), onAnnotationsChange: a => patchDraft(fs.target, { annotations: a }),
    }
  })()

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2200) }

  // ── New prompt ──────────────────────────────────────────────────────────────
  function handleAdd(e) {
    e.preventDefault()
    if (!newP.name.trim() || !newP.content.trim()) return
    // El modelo lo gobierna el super admin: un usuario normal no puede elegirlo,
    // así que el prompt nuevo usa el modelo por defecto de la plataforma.
    const model = isSA ? newP.model : defModel
    const provider = isSA ? newP.provider : defProvider
    const { trimmed, anns } = trimWithAnns(newP.content, newP.annotations || [])
    addPrompt(agentId, { ...newP, provider, model, name: newP.name.trim(), content: trimmed, annotations: anns })
    setNewP(BLANK); setShowNew(false); flash('Prompt creado ✓')
  }
  function openNew() { setNewP({ ...BLANK, provider: defProvider, model: defModel }); setShowNew(true) }

  // ── Edit draft ──────────────────────────────────────────────────────────────
  function openEdit(p) {
    setExpandedId(p.id)
    setDrafts(prev => ({ ...prev, [p.id]: {
      name: p.name,
      content: p.content,
      provider: p.provider || 'openai',
      model: p.model || 'gpt-4o-mini',
      advanced: { ...DEFAULT_ADVANCED, ...(p.advanced || {}) },
      toolIds: p.toolIds || [],
      ragFileIds: p.ragFileIds || [],
      annotations: p.annotations || [],
    }}))
  }

  function closeEdit(id) { setExpandedId(null); setDrafts(prev => { const n = { ...prev }; delete n[id]; return n }) }

  function patchDraft(id, patch) { setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } })) }

  // Edición de contenido con remapeo de anotaciones (mantiene los pines anclados).
  function editNewContent(val) { setNewP(p => ({ ...p, content: val, annotations: remapAnnotations(p.content, val, p.annotations || []) })) }
  function editDraftContent(id, val) { setDrafts(prev => { const d = prev[id]; if (!d) return prev; return { ...prev, [id]: { ...d, content: val, annotations: remapAnnotations(d.content, val, d.annotations || []) } } }) }
  function patchAdvanced(id, patch, isNew = false) {
    if (isNew) setNewP(p => ({ ...p, advanced: { ...p.advanced, ...patch } }))
    else setDrafts(prev => ({ ...prev, [id]: { ...prev[id], advanced: { ...prev[id].advanced, ...patch } } }))
  }

  function saveDraft(id) {
    const d = drafts[id]; if (!d) return
    const { trimmed, anns } = trimWithAnns(d.content, d.annotations || [])
    updatePrompt(agentId, id, {
      name: d.name.trim(), content: trimmed,
      provider: d.provider, model: d.model,
      advanced: d.advanced,
      toolIds: d.toolIds || [],
      ragFileIds: d.ragFileIds || [],
      annotations: anns,
    })
    closeEdit(id); flash('Prompt guardado ✓')
  }

  function activate(id) { setActivePrompt(agentId, id); flash('Prompt activado ✓') }

  // ── Provider/model change ──────────────────────────────────────────────────
  function changeProvider(id, newProvider, isNew = false) {
    const firstModel = PROVIDERS[newProvider]?.models[0]?.id || ''
    if (isNew) setNewP(p => ({ ...p, provider: newProvider, model: firstModel }))
    else patchDraft(id, { provider: newProvider, model: firstModel })
  }

  function providerColor(p) { return p === 'deepseek' ? '#4fa8ff' : '#22d98a' }

  const activePrompt = prompts.find(p => p.isActive)

  return (
    <div className={s.root}>
      {toast && <div className={s.toast}>{toast}</div>}

      {/* Header */}
      <div className={s.header}>
        <div className={s.headerText}>
          <h3 className={s.title}>Prompts del agente</h3>
          <p className={s.sub}>
            Cada prompt define completamente la personalidad, instrucciones, proveedor y modelo del agente.
            El prompt <strong>activo</strong> es el que usa el agente en este momento.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={s.changeAgentBtn}
            onClick={() => setShowChangeAgent(true)}
            title={`Tokens restantes este mes — ⚡ ${(caInfo.remaining ?? 0).toLocaleString()} / ${(caInfo.limit ?? 0).toLocaleString()}`}
          >
            🤖 Agente de Cambios
            <span className={s.caUsage} style={{ display: 'inline-flex', gap: 6, fontSize: 10 }}>
              <span style={{ color: (caInfo.remaining ?? 0) <= (caInfo.limit ?? 0) * 0.15 ? '#ff5f5f' : '#22d98a' }} title="Tokens del mes">⚡{compact(caInfo.remaining ?? 0)}</span>
            </span>
          </button>
          <button className={s.newBtn} onClick={() => { if (showNew) setShowNew(false); else openNew(); setExpandedId(null) }}>
            {showNew ? '✕ Cancelar' : '+ Nuevo prompt'}
          </button>
        </div>
      </div>

      {showChangeAgent && (
        <ChangeAgentPanel agentId={agentId} onClose={() => setShowChangeAgent(false)} />
      )}

      {/* Active prompt summary */}
      {activePrompt && (
        <div className={s.activeSummary}>
          <span className={s.activeDot} />
          <div className={s.activeSummaryText}>
            <span className={s.activeSummaryLabel}>Prompt activo:</span>
            <strong> {activePrompt.name}</strong>
            {isSA && (
              <span className={s.activeSummaryModel} style={{ color: providerColor(activePrompt.provider) }}>
                · {PROVIDERS[activePrompt.provider || 'openai']?.name} · {activePrompt.model}
              </span>
            )}
          </div>
        </div>
      )}

      {/* New prompt form */}
      {showNew && (
        <div className={s.formCard}>
          <div className={s.formTitle}>Nuevo prompt</div>
          <form onSubmit={handleAdd} className={s.form}>
            <div className={s.field}>
              <label>Nombre del prompt</label>
              <input required placeholder="Ej: Soporte general, Ventas agresivo, Técnico formal..."
                value={newP.name} onChange={e => setNewP(p => ({ ...p, name: e.target.value }))} />
            </div>
            {isSA && (
              <ModelPicker
                provider={newP.provider} model={newP.model}
                onProviderChange={pid => changeProvider(null, pid, true)}
                onModelChange={mid => setNewP(p => ({ ...p, model: mid }))}
              />
            )}
            <div className={s.field}>
              <div style={fsLabelRow}>
                <label style={{ margin: 0 }}>System prompt — instrucciones completas para el agente</label>
                <button type="button" style={fsBtnStyle} onClick={() => setFs({ target: 'new' })} title="Editar en pantalla completa">⛶ Pantalla completa</button>
              </div>
              <textarea required rows={7} className={s.mono}
                placeholder={`Eres un asistente de [empresa] especializado en [área].\n\nResponde siempre en español, sé conciso y empático.\n\nCuando el usuario te diga su nombre, usa la herramienta guardar_nombre.\n\n[Añade aquí todas las instrucciones que necesites]`}
                value={newP.content}
                onChange={e => editNewContent(e.target.value)}
              />
              <span className={s.charCount}>{newP.content.length} caracteres</span>
            </div>
            <AdvancedParamsEditor
              provider={newP.provider}
              model={newP.model}
              advanced={newP.advanced || DEFAULT_ADVANCED}
              onChange={patch => patchAdvanced(null, patch, true)}
            />
            <ToolsPicker
              tools={aiTools}
              selected={newP.toolIds}
              onChange={ids => setNewP(p => ({ ...p, toolIds: ids }))}
            />
            <ToolsPicker
              tools={ragFiles}
              selected={newP.ragFileIds}
              onChange={ids => setNewP(p => ({ ...p, ragFileIds: ids }))}
              label="📚 Conocimiento (archivos asignados a este prompt)"
              emptyText="Sube archivos en la pestaña Conocimiento para poder asignarlos."
              placeholder="Selecciona archivos…"
              searchPlaceholder="Buscar archivo…"
            />
            <div className={s.formActions}>
              <button type="button" className={s.cancelBtn} onClick={() => setShowNew(false)}>Cancelar</button>
              <button type="submit" className={s.primaryBtn}>Crear prompt</button>
            </div>
          </form>
        </div>
      )}

      {/* Prompts list */}
      <div className={s.list}>
        {prompts.length === 0 && (
          <div className={s.emptyState}>
            <span className={s.emptyIcon}>📋</span>
            <p>Sin prompts todavía.</p>
            <small>Crea el primero para que el agente sepa cómo comportarse.</small>
          </div>
        )}

        {prompts.map((p, idx) => {
          const isActive = p.isActive
          const isExpanded = expandedId === p.id
          const d = drafts[p.id]
          const pColor = providerColor(p.provider || 'openai')
          const pName = PROVIDERS[p.provider || 'openai']?.name

          return (
            <div key={p.id} className={`${s.card} ${isActive ? s.cardActive : ''}`}>
              {/* Card header */}
              <div className={s.cardHeader}>
                <div className={s.cardIndex} style={{ background: isActive ? pColor + '20' : undefined, color: isActive ? pColor : undefined }}>
                  {isActive ? '●' : idx + 1}
                </div>
                <div className={s.cardMeta}>
                  <div className={s.cardNameRow}>
                    <span className={s.cardName}>{p.name}</span>
                    {isActive && <span className={s.activeBadge}>ACTIVO</span>}
                  </div>
                  <div className={s.cardModelRow}>
                    {isSA && (
                      <span className={s.modelTag} style={{ color: pColor, background: pColor + '15', borderColor: pColor + '40' }}>
                        {pName} · {p.model}
                      </span>
                    )}
                    <span className={s.charHint}>{p.content.length} chars</span>
                    {(p.toolIds?.length > 0) && (
                      <span className={s.charHint} title="Herramientas IA asignadas">🔧 {p.toolIds.length}</span>
                    )}
                    {(p.annotations?.length > 0) && (
                      <span className={s.charHint} title="Pines y zonas resaltadas">📌 {p.annotations.length}</span>
                    )}
                  </div>
                </div>
                <div className={s.cardActions}>
                  {!isActive && (
                    <button className={s.activateBtn} onClick={() => activate(p.id)}>▶ Usar este</button>
                  )}
                  <button className={s.editBtn} onClick={() => isExpanded ? closeEdit(p.id) : openEdit(p)}>
                    {isExpanded ? 'Cerrar' : 'Editar'}
                  </button>
                  {!isActive && (
                    <button className={s.delBtn} onClick={() => { if (confirm(`¿Eliminar "${p.name}"?`)) deletePrompt(agentId, p.id) }}>✕</button>
                  )}
                </div>
              </div>

              {/* Preview (collapsed) */}
              {!isExpanded && (
                <div className={s.preview}>{p.content.slice(0, 240)}{p.content.length > 240 ? '…' : ''}</div>
              )}

              {/* Editor (expanded) */}
              {isExpanded && d && (
                <div className={s.editor}>
                  <div className={s.field}>
                    <label>Nombre</label>
                    <input value={d.name} onChange={e => patchDraft(p.id, { name: e.target.value })} />
                  </div>
                  {isSA && (
                    <ModelPicker
                      provider={d.provider} model={d.model}
                      onProviderChange={pid => changeProvider(p.id, pid)}
                      onModelChange={mid => patchDraft(p.id, { model: mid })}
                    />
                  )}
                  <div className={s.field}>
                    <div style={fsLabelRow}>
                      <label style={{ margin: 0 }}>System prompt</label>
                      <button type="button" style={fsBtnStyle} onClick={() => setFs({ target: p.id })} title="Editar en pantalla completa">⛶ Pantalla completa</button>
                    </div>
                    <textarea rows={9} className={s.mono} value={d.content}
                      onChange={e => editDraftContent(p.id, e.target.value)} />
                    <span className={s.charCount}>{d.content.length} caracteres</span>
                  </div>
                  <AdvancedParamsEditor
                    provider={d.provider}
                    model={d.model}
                    advanced={d.advanced || DEFAULT_ADVANCED}
                    onChange={patch => patchAdvanced(p.id, patch)}
                  />
                  <ToolsPicker
                    tools={aiTools}
                    selected={d.toolIds}
                    onChange={ids => patchDraft(p.id, { toolIds: ids })}
                  />
                  <ToolsPicker
                    tools={ragFiles}
                    selected={d.ragFileIds}
                    onChange={ids => patchDraft(p.id, { ragFileIds: ids })}
                    label="📚 Conocimiento (archivos asignados a este prompt)"
                    emptyText="Sube archivos en la pestaña Conocimiento para poder asignarlos."
                    placeholder="Selecciona archivos…"
                    searchPlaceholder="Buscar archivo…"
                  />
                  <div className={s.formActions}>
                    <button className={s.cancelBtn} onClick={() => closeEdit(p.id)}>Cancelar</button>
                    <button className={s.primaryBtn} onClick={() => saveDraft(p.id)}>Guardar cambios</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {fsCtx && (
        <PromptFullscreenModal
          title={fsCtx.title}
          value={fsCtx.value}
          annotations={fsCtx.annotations}
          onChange={fsCtx.onChange}
          onAnnotationsChange={fsCtx.onAnnotationsChange}
          onClose={() => setFs(null)}
        />
      )}
    </div>
  )
}

// Estilos del botón/label de "pantalla completa".
const fsLabelRow = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }
const fsBtnStyle = { cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: 'var(--accent)', padding: '3px 10px', borderRadius: 7, border: '1px solid var(--accent)', background: 'transparent', whiteSpace: 'nowrap' }

// ── Editor a pantalla completa con resaltado + pines ─────────────────────────
// Popup grande para editar el system prompt con comodidad. Permite RESALTAR
// zonas por color y crear PINES/etiquetas que, al hacer click, saltan a esa
// parte del prompt. Escribe en vivo sobre el mismo borrador.
const EDIT_TYPO = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 14.5, lineHeight: 1.65, padding: '18px 22px', letterSpacing: 'normal', tabSize: 2, whiteSpace: 'pre-wrap', wordWrap: 'break-word', overflowWrap: 'break-word', boxSizing: 'border-box', margin: 0, border: 'none' }

function PromptFullscreenModal({ title, value, annotations, onChange, onAnnotationsChange, onClose }) {
  const taRef = useRef(null)
  const backRef = useRef(null)
  const [activeColor, setActiveColor] = useState('yellow')
  const [hasSel, setHasSel] = useState(false)
  const [flashId, setFlashId] = useState(null)
  const anns = annotations || []

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const segments = useMemo(() => buildSegments(value, anns), [value, anns])
  const sorted = useMemo(() => anns.slice().sort((a, b) => a.start - b.start), [anns])

  function syncScroll() { if (backRef.current && taRef.current) { backRef.current.scrollTop = taRef.current.scrollTop; backRef.current.scrollLeft = taRef.current.scrollLeft } }
  function captureSel() { const ta = taRef.current; if (ta) setHasSel(ta.selectionStart !== ta.selectionEnd) }

  function addAnnotation(withLabel) {
    const ta = taRef.current; if (!ta) return
    const start = ta.selectionStart, end = ta.selectionEnd
    if (start === end) return
    let label = ''
    if (withLabel) {
      const suggested = value.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, 40)
      label = window.prompt('Nombre del pin / etiqueta:', suggested)
      if (label === null) return
    }
    const ann = { id: 'an_' + Math.random().toString(36).slice(2, 9), start, end, color: activeColor, label: (label || '').trim() }
    onAnnotationsChange([...anns, ann])
    setHasSel(false)
  }
  function removeAnn(id) { onAnnotationsChange(anns.filter(a => a.id !== id)) }
  function cycleColor(id) {
    const a = anns.find(x => x.id === id); if (!a) return
    const i = HL_COLORS.findIndex(c => c.id === a.color)
    const next = HL_COLORS[(i + 1) % HL_COLORS.length].id
    onAnnotationsChange(anns.map(x => x.id === id ? { ...x, color: next } : x))
  }
  function renameAnn(id) {
    const a = anns.find(x => x.id === id); if (!a) return
    const label = window.prompt('Nombre del pin / etiqueta:', a.label || '')
    if (label === null) return
    onAnnotationsChange(anns.map(x => x.id === id ? { ...x, label: label.trim() } : x))
  }
  function jumpTo(ann) {
    const ta = taRef.current; if (!ta) return
    ta.focus(); ta.setSelectionRange(ann.start, ann.end)
    const mark = backRef.current?.querySelector(`[data-ann="${ann.id}"]`)
    if (mark) { ta.scrollTop = Math.max(0, mark.offsetTop - 80); syncScroll() }
    setFlashId(ann.id); setTimeout(() => setFlashId(null), 1100)
  }

  return (
    <div onMouseDown={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.62)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2.5vh 2.5vw' }}>
      <div onMouseDown={e => e.stopPropagation()}
        style={{ background: 'var(--surface1, #16171b)', border: '1px solid var(--border)', borderRadius: 14, width: 'min(1240px, 97vw)', height: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 70px rgba(0,0,0,.55)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>✏️ {title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{value.length} caracteres</span>
            <button onClick={onClose}
              style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--text)', padding: '6px 13px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3, transparent)' }}>
              ✕ Cerrar <span style={{ opacity: .6, fontWeight: 400 }}>(Esc)</span>
            </button>
          </div>
        </div>

        {/* Toolbar de resaltado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: 'var(--text2)', fontWeight: 600 }}>Color:</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {HL_COLORS.map(c => (
              <button key={c.id} title={c.label} onClick={() => setActiveColor(c.id)}
                style={{ width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', background: c.dot, border: activeColor === c.id ? '2px solid var(--text)' : '2px solid transparent', boxShadow: activeColor === c.id ? '0 0 0 2px var(--accent)' : 'none' }} />
            ))}
          </div>
          <button onClick={() => addAnnotation(false)} disabled={!hasSel} title="Resaltar la selección"
            style={{ cursor: hasSel ? 'pointer' : 'not-allowed', opacity: hasSel ? 1 : .45, fontSize: 12.5, fontWeight: 700, color: 'var(--text)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3, transparent)' }}>
            🖍 Resaltar
          </button>
          <button onClick={() => addAnnotation(true)} disabled={!hasSel} title="Crear un pin/etiqueta en la selección"
            style={{ cursor: hasSel ? 'pointer' : 'not-allowed', opacity: hasSel ? 1 : .45, fontSize: 12.5, fontWeight: 700, color: '#fff', padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)' }}>
            📌 Fijar pin
          </button>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Selecciona texto y elige “Resaltar” o “Fijar pin”.</span>
        </div>

        {/* Cuerpo: editor + panel de pines */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Editor con backdrop de resaltado */}
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <div ref={backRef} aria-hidden="true"
              style={{ ...EDIT_TYPO, position: 'absolute', inset: 0, overflow: 'hidden', color: 'transparent', pointerEvents: 'none', background: 'transparent' }}>
              {segments.map((sg, i) => sg.ann
                ? <mark key={i} data-ann={sg.ann.id}
                    style={{ background: colorOf(sg.ann.color).bg, color: 'transparent', borderRadius: 3, boxShadow: flashId === sg.ann.id ? `0 0 0 2px ${colorOf(sg.ann.color).dot}` : `inset 0 -2px 0 ${colorOf(sg.ann.color).dot}` }}>{sg.text}</mark>
                : <span key={i}>{sg.text}</span>
              )}
              {'\n'}
            </div>
            <textarea ref={taRef} autoFocus value={value} spellCheck={false}
              onChange={e => onChange(e.target.value)}
              onScroll={syncScroll}
              onSelect={captureSel} onKeyUp={captureSel} onMouseUp={captureSel} onClick={captureSel}
              placeholder="Escribe aquí las instrucciones completas del agente…"
              style={{ ...EDIT_TYPO, position: 'absolute', inset: 0, width: '100%', height: '100%', resize: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', caretColor: 'var(--text)', overflow: 'auto' }} />
          </div>

          {/* Panel lateral: pines y zonas */}
          <div style={{ width: 268, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg2, rgba(0,0,0,.15))' }}>
            <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>
              📌 Pines y zonas <span style={{ color: 'var(--text3)', fontWeight: 500 }}>({sorted.length})</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
              {sorted.length === 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.6, padding: '6px 4px' }}>
                  Aún no hay pines. Selecciona una parte del prompt y pulsa <strong>📌 Fijar pin</strong> o <strong>🖍 Resaltar</strong>. Después haz click en un pin para saltar a esa zona.
                </div>
              )}
              {sorted.map(a => {
                const c = colorOf(a.color)
                const line = value.slice(0, a.start).split('\n').length
                const snippet = value.slice(a.start, a.end).replace(/\s+/g, ' ').trim().slice(0, 46)
                return (
                  <div key={a.id}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 9px', borderRadius: 9, marginBottom: 6, background: flashId === a.id ? c.bg : 'var(--bg3, rgba(255,255,255,.03))', border: `1px solid ${c.dot}44`, cursor: 'pointer' }}
                    onClick={() => jumpTo(a)} title="Ir a esta zona del prompt">
                    <button onClick={e => { e.stopPropagation(); cycleColor(a.id) }} title="Cambiar color"
                      style={{ width: 14, height: 14, borderRadius: '50%', background: c.dot, border: 'none', cursor: 'pointer', flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.label || <span style={{ fontStyle: 'italic', color: 'var(--text2)' }}>{snippet || 'zona'}</span>}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>línea {line}{a.label && snippet ? ` · ${snippet}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); renameAnn(a.id) }} title="Renombrar"
                        style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: 'var(--text2)', fontSize: 12, padding: '2px 4px' }}>✎</button>
                      <button onClick={e => { e.stopPropagation(); removeAnn(a.id) }} title="Eliminar"
                        style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#ff5f5f', fontSize: 12, padding: '2px 4px' }}>✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ToolsPicker sub-component ────────────────────────────────────────────────
// Asigna Herramientas IA a un prompt específico. Las herramientas se crean en la
// pestaña "Herramientas IA"; aquí solo se eligen las que este prompt podrá usar.
// Selector desplegable y multiseleccionable: muestra las elegidas como chips y
// expande una lista con checkboxes (búsqueda + seleccionar todas/ninguna).
function ToolsPicker({ tools, selected, onChange,
  label = <>🔧 Herramientas IA <span style={{ fontWeight: 400, color: 'var(--text2)' }}>(el agente podrá usarlas solo con este prompt)</span></>,
  emptyText = 'No hay herramientas creadas todavía. Créalas en la pestaña “Herramientas IA”.',
  placeholder = 'Selecciona herramientas…',
  searchPlaceholder = 'Buscar herramienta…' }) {
  const ids = selected || []
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  function toggle(id) { onChange(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]) }
  const chosen = ids.map(id => tools.find(t => t.id === id)).filter(Boolean)
  const needle = q.trim().toLowerCase()
  const filtered = needle ? tools.filter(t => `${t.name} ${t.description || ''}`.toLowerCase().includes(needle)) : tools

  return (
    <div className={s.field}>
      <label>{label}</label>
      {tools.length === 0 ? (
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>{emptyText}</span>
      ) : (
        <div className={s.toolsDd} ref={ref}>
          <div role="button" tabIndex={0}
            className={`${s.toolsTrigger} ${open ? s.toolsTriggerOpen : ''}`}
            onClick={() => setOpen(o => !o)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) } }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1, minWidth: 0 }}>
              {chosen.length === 0
                ? <span className={s.toolsPh}>{placeholder}</span>
                : chosen.map(t => (
                    <span key={t.id} className={s.toolsChip}>
                      <code>{t.name}</code>
                      <button type="button" className={s.toolsChipX} title="Quitar"
                        onClick={e => { e.stopPropagation(); toggle(t.id) }}>×</button>
                    </span>
                  ))}
            </div>
            <span className={`${s.toolsCaret} ${open ? s.toolsCaretOpen : ''}`}>▾</span>
          </div>

          {open && (
            <div className={s.toolsMenu}>
              {tools.length > 5 && (
                <input autoFocus className={s.toolsSearch} placeholder={searchPlaceholder}
                  value={q} onChange={e => setQ(e.target.value)} />
              )}
              <div className={s.toolsBar}>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{ids.length} de {tools.length} seleccionada(s)</span>
                <span style={{ display: 'flex', gap: 12 }}>
                  <button type="button" className={s.toolsBarBtn} onClick={() => onChange(tools.map(t => t.id))}>Todas</button>
                  <button type="button" className={s.toolsBarBtn} onClick={() => onChange([])}>Ninguna</button>
                </span>
              </div>
              {filtered.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text3)', padding: '6px 8px' }}>Sin resultados.</div>
              ) : filtered.map(t => {
                const on = ids.includes(t.id)
                const special = t.special || t.actionType === 'cms_resource'
                return (
                  <label key={t.id} className={`${s.toolsRowMini} ${on ? s.toolsRowOn : ''}`} title={t.description || ''}
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: on ? 'var(--accent)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</code>
                    {special && <span className={s.specialTag}>✨ Especial</span>}
                    <input type="checkbox" checked={on} onChange={() => toggle(t.id)}
                      style={{ width: 15, height: 15, flexShrink: 0, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ModelPicker sub-component ────────────────────────────────────────────────
function ModelPicker({ provider, model, onProviderChange, onModelChange }) {
  const models = PROVIDERS[provider]?.models || []
  const selectedModel = models.find(m => m.id === model)

  return (
    <div className={s.modelPicker}>
      <div className={s.pickerSection}>
        <span className={s.pickerLabel}>Proveedor</span>
        <div className={s.providerBtns}>
          {Object.values(PROVIDERS).map(p => {
            const color = p.id === 'deepseek' ? '#4fa8ff' : '#22d98a'
            const isSelected = provider === p.id
            return (
              <button key={p.id} type="button"
                className={`${s.providerBtn} ${isSelected ? s.providerBtnActive : ''}`}
                style={isSelected ? { borderColor: color, color, background: color + '15' } : {}}
                onClick={() => onProviderChange(p.id)}>
                <span>{p.id === 'openai' ? '🟢' : '🔵'}</span>
                <span>{p.name}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className={s.pickerSection}>
        <span className={s.pickerLabel}>Modelo</span>
        <div className={s.modelBtns}>
          {models.map(m => {
            const isSelected = model === m.id
            return (
              <button key={m.id} type="button"
                className={`${s.modelBtn} ${isSelected ? s.modelBtnActive : ''}`}
                onClick={() => onModelChange(m.id)}>
                <span className={s.modelBtnName}>{m.name}</span>
                <span className={s.modelBtnTags}>
                  {m.supportsTools && <span className={s.tag}>tools ✓</span>}
                  {m.supportsStream && <span className={s.tag}>stream ✓</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {selectedModel && !selectedModel.supportsTools && (
        <div className={s.noToolsWarn}>
          ⚠ Este modelo no soporta herramientas IA. Las herramientas asignadas no se ejecutarán.
        </div>
      )}
    </div>
  )
}

// ── Advanced parameters editor (collapsible) ─────────────────────────────────
function AdvancedParamsEditor({ provider, model, advanced, onChange }) {
  const [open, setOpen] = useState(false)
  const modelInfo = getModel(provider, model)
  const isReasoning = !!modelInfo?.isReasoning
  const isOpenAI    = provider === 'openai'
  const isAnthropic = provider === 'anthropic'

  function num(v, fallback = '') { return v === null || v === undefined ? fallback : v }

  return (
    <div className={s.field} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: open ? 12 : 8, background: 'var(--surface2)' }}>
      <button type="button"
        onClick={() => setOpen(!open)}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>
        <span>⚙️ Parámetros avanzados del modelo {open ? '▼' : '▶'}</span>
        <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
          maxTokens={advanced.maxTokens} · temp={advanced.temperature}{isReasoning && isOpenAI ? ` · effort=${advanced.reasoningEffort}` : ''}
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          <FieldNum label="max_tokens" hint="Tokens máximos de la respuesta" value={num(advanced.maxTokens)} min={50} max={32000} step={100}
            onChange={v => onChange({ maxTokens: parseInt(v) || 4096 })} />
          {!isReasoning && (
            <FieldNum label="temperature" hint="Aleatoriedad 0-2 (0=determinista)" value={num(advanced.temperature)} min={0} max={2} step={0.1}
              onChange={v => onChange({ temperature: parseFloat(v) })} />
          )}
          {!isReasoning && (
            <FieldNum label="top_p" hint="Nucleus sampling 0-1" value={num(advanced.topP)} min={0} max={1} step={0.05}
              onChange={v => onChange({ topP: parseFloat(v) })} />
          )}
          {isAnthropic && (
            <FieldNum label="top_k" hint="Solo Claude — N tokens más probables" value={num(advanced.topK)} min={1} max={500} step={1}
              onChange={v => onChange({ topK: v === '' ? null : parseInt(v) })} />
          )}
          {!isReasoning && !isAnthropic && (
            <FieldNum label="presence_penalty" hint="-2 a 2 — penaliza repetir temas" value={num(advanced.presencePenalty)} min={-2} max={2} step={0.1}
              onChange={v => onChange({ presencePenalty: parseFloat(v) })} />
          )}
          {!isReasoning && !isAnthropic && (
            <FieldNum label="frequency_penalty" hint="-2 a 2 — penaliza repetir tokens" value={num(advanced.frequencyPenalty)} min={-2} max={2} step={0.1}
              onChange={v => onChange({ frequencyPenalty: parseFloat(v) })} />
          )}
          {isOpenAI && !isReasoning && (
            <FieldNum label="seed" hint="Reproducibilidad (opcional)" value={num(advanced.seed)} placeholder="(opcional)"
              onChange={v => onChange({ seed: v === '' ? null : parseInt(v) })} />
          )}
          {isOpenAI && isReasoning && (
            <FieldSelect label="reasoning_effort" hint="Cuánto razona el modelo (más = más tokens internos)" value={advanced.reasoningEffort || 'medium'}
              options={[
                { value: 'minimal', label: 'minimal' },
                { value: 'low',     label: 'low' },
                { value: 'medium',  label: 'medium' },
                { value: 'high',    label: 'high' },
              ]}
              onChange={v => onChange({ reasoningEffort: v })} />
          )}
          {isAnthropic && (
            <>
              <FieldToggle label="extended_thinking" hint="Activa el modo razonamiento extendido (más calidad, más tokens)"
                value={!!advanced.extendedThinking}
                onChange={v => onChange({ extendedThinking: v })} />
              {advanced.extendedThinking && (
                <FieldNum label="thinking_budget" hint="Tokens reservados para pensar (min 1024)" value={num(advanced.thinkingBudgetTokens)} min={1024} max={32000} step={500}
                  onChange={v => onChange({ thinkingBudgetTokens: parseInt(v) || 5000 })} />
              )}
            </>
          )}
          <FieldText label="stop_sequences" hint="Coma-separadas — el modelo se detiene al ver una" value={(advanced.stopSequences || []).join(',')}
            placeholder="ej: ###,FIN" colSpan={2}
            onChange={v => onChange({ stopSequences: v.split(',').map(s => s.trim()).filter(Boolean) })} />
        </div>
      )}
    </div>
  )
}

function FieldNum({ label, hint, value, onChange, min, max, step, placeholder, colSpan }) {
  return (
    <div style={{ gridColumn: colSpan ? `span ${colSpan}` : undefined }}>
      <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', fontWeight: 500, marginBottom: 2 }}>{label}</label>
      <input type="number" value={value} onChange={e => onChange(e.target.value)} min={min} max={max} step={step} placeholder={placeholder}
        style={{ width: '100%', background: 'var(--surface1)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'var(--text1)', fontFamily: 'monospace' }} />
      {hint && <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, display: 'block' }}>{hint}</span>}
    </div>
  )
}
function FieldText({ label, hint, value, onChange, placeholder, colSpan }) {
  return (
    <div style={{ gridColumn: colSpan ? `span ${colSpan}` : undefined }}>
      <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', fontWeight: 500, marginBottom: 2 }}>{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', background: 'var(--surface1)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'var(--text1)', fontFamily: 'monospace' }} />
      {hint && <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, display: 'block' }}>{hint}</span>}
    </div>
  )
}
function FieldSelect({ label, hint, value, onChange, options, colSpan }) {
  return (
    <div style={{ gridColumn: colSpan ? `span ${colSpan}` : undefined }}>
      <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', fontWeight: 500, marginBottom: 2 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', background: 'var(--surface1)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'var(--text1)' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, display: 'block' }}>{hint}</span>}
    </div>
  )
}
function FieldToggle({ label, hint, value, onChange, colSpan }) {
  return (
    <div style={{ gridColumn: colSpan ? `span ${colSpan}` : undefined }}>
      <label style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, cursor: 'pointer' }}>
        <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
        {label}
      </label>
      {hint && <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, display: 'block' }}>{hint}</span>}
    </div>
  )
}
