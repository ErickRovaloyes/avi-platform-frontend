import { useState, useRef } from 'react'
import { useAccount } from '../../context/AccountContext'
import { useAuth } from '../../context/AuthContext'
import { getDraft, getExecutions } from '../../lib/flowLocalStorage'
import { api } from '../../lib/api'
import { listNodes } from '../../lib/flowNodes'
import { listFlowTemplates, createFlowTemplate, deleteFlowTemplate, installFlowTemplate } from '../../lib/storage'
import s from './FlowsListView.module.css'

// Catálogo compacto de nodos (sin los alias legacy) que se envía a la IA.
function buildNodeCatalog() {
  return listNodes()
    .filter(n => !String(n.description || '').startsWith('Alias compatible'))
    .map(n => ({
      type: n.type, label: n.label, category: n.category, description: n.description,
      fields: (n.fields || []).map(f => ({ key: f.key, label: f.label, type: f.type })),
    }))
}

// Descarga un flujo como archivo .json (export).
function exportFlow(flow) {
  const payload = {
    _type: 'avi.flow',
    _version: 1,
    name: flow.name,
    trigger: flow.trigger || 'manual',
    triggerKeyword: flow.triggerKeyword || '',
    startNodeId: flow.startNodeId || null,
    nodes: flow.nodes || [],
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safe = (flow.name || 'flujo').replace(/[^\w\-]+/g, '_').toLowerCase()
  a.href = url
  a.download = `flujo_${safe}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Vista de lista de flujos. Cada flujo se muestra como una card con datos clave
 * y un click la abre en el editor (vía onOpen).
 *
 * Props:
 *   onOpen(flowId) — handler para entrar al editor
 */
export default function FlowsListView({ onOpen }) {
  const { account, addFlow, deleteFlow, updateFlow, importFlow, copyFlowToAccount, accessibleAccounts, reloadAccount } = useAccount()
  const { session } = useAuth()
  const isSA = session?.type === 'superadmin'
  const flows = account?.flows || []
  const accId = account?.id

  // Plantillas de flujos (biblioteca global).
  const [tplOpen, setTplOpen] = useState(false)
  const [templates, setTemplates] = useState(null)
  const [tplBusy, setTplBusy] = useState(false)
  const [publishFlow, setPublishFlow] = useState(null)
  const [pub, setPub] = useState({ name: '', description: '', category: '' })

  async function openTemplates() {
    setTplOpen(true); setTemplates(null)
    try { setTemplates(await listFlowTemplates()) } catch { setTemplates([]) }
  }
  async function installTpl(t) {
    setTplBusy(true)
    try { const r = await installFlowTemplate(accId, t.id); await reloadAccount?.(); setTplOpen(false); if (r?.id) onOpen(r.id) }
    catch (e) { alert('No se pudo instalar: ' + (e.message || 'error')) }
    setTplBusy(false)
  }
  async function removeTpl(t) {
    if (!confirm(`¿Eliminar la plantilla "${t.name}" de la biblioteca?`)) return
    try { await deleteFlowTemplate(t.id); setTemplates(ts => (ts || []).filter(x => x.id !== t.id)) } catch (e) { alert(e.message) }
  }
  function openPublish(flow) { setPublishFlow(flow); setPub({ name: flow.name || '', description: '', category: '' }) }
  async function doPublish() {
    if (!pub.name.trim() || !publishFlow) return
    setTplBusy(true)
    try {
      await createFlowTemplate({
        name: pub.name.trim(), description: pub.description.trim(), category: pub.category.trim(),
        nodes: publishFlow.nodes || [], startNodeId: publishFlow.startNodeId || null, trigger: publishFlow.trigger || 'manual',
      })
      setPublishFlow(null); alert('Plantilla publicada en la biblioteca ✓')
    } catch (e) { alert('No se pudo publicar: ' + (e.message || 'error')) }
    setTplBusy(false)
  }

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [search, setSearch] = useState('')
  const [filterTrigger, setFilterTrigger] = useState('all')
  const [copyTarget, setCopyTarget] = useState(null)   // flow pendiente de copiar a otra cuenta
  const fileRef = useRef(null)

  // Diseño de flujos con IA
  const [aiOpen, setAiOpen] = useState(false)
  const [aiDesc, setAiDesc] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState(null)

  async function handleAIDesign() {
    if (!aiDesc.trim() || aiBusy) return
    setAiBusy(true); setAiError(null)
    try {
      const catalog = buildNodeCatalog()
      const r = await api.post(`/api/flows/${accId}/ai-design`, { description: aiDesc.trim(), catalog })
      if (!r?.ok || !r.flow) throw new Error('La IA no pudo generar el flujo')
      const newId = await importFlow(r.flow)
      setAiOpen(false); setAiDesc('')
      onOpen(newId)
    } catch (e) {
      // Cualquier fallo (sin API key, IA, red) → ofrecemos contacto con el equipo.
      setAiError(e?.message || 'No fue posible generar el flujo automáticamente.')
    }
    setAiBusy(false)
  }

  // Otras cuentas a las que el usuario tiene acceso (excluye la actual).
  const otherAccounts = (accessibleAccounts || []).filter(a => a && a.id !== accId)

  function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    addFlow({ name: newName.trim(), trigger: 'manual', startNodeId: null })
    setNewName(''); setCreating(false)
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''  // permite re-importar el mismo archivo
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data || !Array.isArray(data.nodes)) throw new Error('Formato inválido')
      await importFlow(data)
    } catch (err) {
      alert('No se pudo importar el flujo: ' + (err.message || 'archivo inválido'))
    }
  }

  async function handleCopyToAccount(flow, targetAccId) {
    try {
      await copyFlowToAccount(flow, targetAccId)
      const acc = otherAccounts.find(a => a.id === targetAccId)
      setCopyTarget(null)
      alert(`Flujo "${flow.name}" copiado a "${acc?.name || targetAccId}".`)
    } catch (err) {
      alert('No se pudo copiar: ' + (err.message || 'error'))
    }
  }

  const filtered = flows.filter(f => {
    if (filterTrigger !== 'all' && f.trigger !== filterTrigger) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (f.name || '').toLowerCase().includes(q) ||
             (f.triggerKeyword || '').toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className={s.panel}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.titleRow}>
          <h2 className={s.title}>⚡ Flujos</h2>
          <span className={s.count}>{flows.length} {flows.length === 1 ? 'flujo' : 'flujos'}</span>
        </div>
        <div className={s.actions}>
          <input
            className={s.search}
            placeholder="🔍 Buscar flujo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className={s.filter}
            value={filterTrigger}
            onChange={e => setFilterTrigger(e.target.value)}
          >
            <option value="all">Todos los triggers</option>
            <option value="manual">Manual</option>
            <option value="conversation_start">Inicio conversación</option>
            <option value="keyword">Palabra clave</option>
            <option value="ai_tool">Herramienta IA</option>
          </select>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <button className={s.importBtn} onClick={() => fileRef.current?.click()} title="Importar flujo desde un archivo .json">
            ⬆ Importar
          </button>
          <button className={s.importBtn} onClick={openTemplates} title="Instalar un flujo desde la biblioteca de plantillas">
            📥 Usar plantilla
          </button>
          <button className={s.importBtn} onClick={() => { setAiError(null); setAiOpen(true) }} title="Diseñar un flujo automáticamente con IA" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
            ✨ Diseñar con IA
          </button>
          {creating ? (
            <form onSubmit={handleCreate} className={s.createForm}>
              <input
                autoFocus
                placeholder="Nombre del flujo…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className={s.createInput}
              />
              <button type="submit" className={s.createBtn}>Crear</button>
              <button type="button" className={s.cancelBtn} onClick={() => setCreating(false)}>✕</button>
            </form>
          ) : (
            <button className={s.newBtn} onClick={() => setCreating(true)}>+ Nuevo flujo</button>
          )}
        </div>
      </div>

      {/* Body */}
      {flows.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>⚡</div>
          <h3>Aún no tienes flujos</h3>
          <p>Los flujos automatizan respuestas, llaman APIs y orquestan la IA con tu CRM.</p>
          <button className={s.newBtn} onClick={() => setCreating(true)}>+ Crear primer flujo</button>
        </div>
      ) : (
        <div className={s.grid}>
          {filtered.map(f => (
            <FlowCard
              key={f.id}
              flow={f}
              accId={accId}
              onOpen={() => onOpen(f.id)}
              onDelete={() => { if (confirm(`¿Eliminar "${f.name}"?`)) deleteFlow(f.id) }}
              onRename={name => updateFlow(f.id, { name })}
              onExport={() => exportFlow(f)}
              onCopyToAccount={otherAccounts.length ? () => setCopyTarget(f) : null}
              onPublish={isSA ? () => openPublish(f) : null}
            />
          ))}
          {filtered.length === 0 && (
            <div className={s.noResults}>Sin resultados para los filtros actuales.</div>
          )}
        </div>
      )}

      {/* Modal: diseñar flujo con IA */}
      {aiOpen && (
        <div className={s.copyBackdrop} onClick={e => e.target === e.currentTarget && !aiBusy && setAiOpen(false)}>
          <div className={s.copyModal} style={{ maxWidth: 560 }}>
            <div className={s.copyHeader}>
              <h3>✨ Diseñar flujo con IA</h3>
              <button className={s.copyClose} onClick={() => !aiBusy && setAiOpen(false)}>✕</button>
            </div>
            <p className={s.copyDesc}>
              Describe en lenguaje natural qué debe hacer el flujo. La IA lo construirá con los nodos
              disponibles y lo abrirá para que lo ajustes.
            </p>
            <textarea
              autoFocus
              value={aiDesc}
              onChange={e => setAiDesc(e.target.value)}
              disabled={aiBusy}
              placeholder={'Ej: Da la bienvenida, pregunta el nombre y el motivo de contacto, guárdalos como variables y, si el motivo es "soporte", deriva a un asesor humano; si no, responde con la IA.'}
              style={{ width: '100%', minHeight: 130, boxSizing: 'border-box', resize: 'vertical', padding: 12, borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13.5, lineHeight: 1.5 }}
            />

            {aiError && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'rgba(255,95,95,.08)', border: '1px solid #ff5f5f55' }}>
                <div style={{ fontSize: 13, color: '#ff8c8c', fontWeight: 600, marginBottom: 6 }}>No fue posible generar el flujo automáticamente.</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
                  Puedes intentar reformular la descripción, crear el flujo manualmente, o
                  escribirnos y lo diseñamos contigo.
                </div>
                <a href={`mailto:soporte@aviasistente.com?subject=${encodeURIComponent('Ayuda para diseñar un flujo')}&body=${encodeURIComponent('Quiero un flujo que: ' + aiDesc)}`}
                  style={{ display: 'inline-block', marginTop: 10, padding: '7px 13px', borderRadius: 8, background: 'linear-gradient(135deg,var(--accent),var(--accent2))', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                  Contactar al equipo
                </a>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button className={s.cancelBtn} onClick={() => !aiBusy && setAiOpen(false)} disabled={aiBusy} style={{ padding: '8px 14px' }}>Cancelar</button>
              <button className={s.newBtn} onClick={handleAIDesign} disabled={aiBusy || !aiDesc.trim()}>
                {aiBusy ? '✨ Generando…' : '✨ Generar flujo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: copiar flujo a otra cuenta */}
      {copyTarget && (
        <div className={s.copyBackdrop} onClick={e => e.target === e.currentTarget && setCopyTarget(null)}>
          <div className={s.copyModal}>
            <div className={s.copyHeader}>
              <h3>📋 Copiar flujo a otra cuenta</h3>
              <button className={s.copyClose} onClick={() => setCopyTarget(null)}>✕</button>
            </div>
            <p className={s.copyDesc}>
              Se creará una copia de <strong>"{copyTarget.name}"</strong> en la cuenta que elijas.
              Solo se muestran cuentas a las que tienes acceso.
            </p>
            <div className={s.copyAccList}>
              {otherAccounts.map(acc => (
                <button
                  key={acc.id}
                  className={s.copyAccBtn}
                  onClick={() => handleCopyToAccount(copyTarget, acc.id)}
                >
                  <span className={s.copyAccName}>{acc.name || acc.id}</span>
                  <span className={s.copyAccGo}>Copiar →</span>
                </button>
              ))}
              {otherAccounts.length === 0 && (
                <div className={s.copyEmpty}>No tienes acceso a otras cuentas.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: biblioteca de plantillas de flujos */}
      {tplOpen && (
        <div className={s.copyBackdrop} onClick={e => e.target === e.currentTarget && !tplBusy && setTplOpen(false)}>
          <div className={s.copyModal} style={{ maxWidth: 620 }}>
            <div className={s.copyHeader}>
              <h3>📥 Plantillas de flujos</h3>
              <button className={s.copyClose} onClick={() => !tplBusy && setTplOpen(false)}>✕</button>
            </div>
            <p className={s.copyDesc}>Elige una plantilla para instalarla como un flujo nuevo en tu cuenta. Podrás editarla después.</p>
            <div className={s.copyAccList} style={{ maxHeight: 380, overflowY: 'auto' }}>
              {templates == null && <div className={s.copyEmpty}>Cargando…</div>}
              {templates && templates.length === 0 && <div className={s.copyEmpty}>Aún no hay plantillas publicadas.</div>}
              {(templates || []).map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 10, marginBottom: 8, background: 'var(--bg3)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                      {t.category ? <span style={{ fontSize: 10.5, color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 20, padding: '1px 7px', marginRight: 6 }}>{t.category}</span> : null}
                      {t.name}
                    </div>
                    {t.description && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{t.description}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>🔧 {t.nodeCount} nodo(s) · {triggerLabel(t.trigger)}</div>
                  </div>
                  {isSA && <button className={s.cancelBtn} style={{ padding: '6px 10px' }} disabled={tplBusy} onClick={() => removeTpl(t)} title="Eliminar de la biblioteca">🗑</button>}
                  <button className={s.newBtn} disabled={tplBusy} onClick={() => installTpl(t)}>{tplBusy ? '…' : 'Instalar →'}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: publicar un flujo como plantilla (solo super admin) */}
      {publishFlow && (
        <div className={s.copyBackdrop} onClick={e => e.target === e.currentTarget && !tplBusy && setPublishFlow(null)}>
          <div className={s.copyModal}>
            <div className={s.copyHeader}>
              <h3>📤 Publicar como plantilla</h3>
              <button className={s.copyClose} onClick={() => !tplBusy && setPublishFlow(null)}>✕</button>
            </div>
            <p className={s.copyDesc}>Se guardará el diseño de <strong>"{publishFlow.name}"</strong> en la biblioteca global para que cualquier cuenta lo instale.</p>
            {(() => {
              const inp = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13.5, marginBottom: 10 }
              return (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Nombre</label>
                  <input style={inp} value={pub.name} onChange={e => setPub(p => ({ ...p, name: e.target.value }))} placeholder="Nombre de la plantilla" />
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Categoría (opcional)</label>
                  <input style={inp} value={pub.category} onChange={e => setPub(p => ({ ...p, category: e.target.value }))} placeholder="Ventas, Soporte, Agendamiento…" />
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Descripción (opcional)</label>
                  <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={pub.description} onChange={e => setPub(p => ({ ...p, description: e.target.value }))} placeholder="Qué hace este flujo y cuándo usarlo." />
                </div>
              )
            })()}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button className={s.cancelBtn} style={{ padding: '8px 14px' }} onClick={() => !tplBusy && setPublishFlow(null)} disabled={tplBusy}>Cancelar</button>
              <button className={s.newBtn} onClick={doPublish} disabled={tplBusy || !pub.name.trim()}>{tplBusy ? 'Publicando…' : 'Publicar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Card de un flujo ────────────────────────────────────────────────────────
function FlowCard({ flow, accId, onOpen, onDelete, onRename, onExport, onCopyToAccount, onPublish }) {
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(flow.name)

  const draft = accId ? getDraft(accId, flow.id) : null
  const executions = accId ? getExecutions(accId, flow.id) : []
  const lastRun = executions[0]
  const nodeCount = flow.nodes?.length || 0
  const isActive = nodeCount > 0 && flow.startNodeId

  function saveName() {
    if (name.trim() && name !== flow.name) onRename(name.trim())
    setEditingName(false)
  }

  return (
    <div className={s.card} onClick={onOpen}>
      <div className={s.cardHeader}>
        <div className={s.cardIcon}>
          <span>{flow.trigger === 'keyword' ? '🔑' :
                 flow.trigger === 'conversation_start' ? '🎬' :
                 flow.trigger === 'ai_tool' ? '🤖' : '👆'}</span>
        </div>
        <div className={s.cardTitleBlock}>
          {editingName ? (
            <input
              autoFocus
              className={s.cardNameEdit}
              value={name}
              onClick={e => e.stopPropagation()}
              onChange={e => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setName(flow.name); setEditingName(false) } }}
            />
          ) : (
            <button
              className={s.cardName}
              onClick={e => { e.stopPropagation(); setEditingName(true) }}
              title="Click para renombrar"
            >{flow.name}</button>
          )}
          <div className={s.cardSub}>
            <span className={s.cardTrigger}>{triggerLabel(flow.trigger)}</span>
            {flow.triggerKeyword && (
              <span className={s.cardKeyword}>"{flow.triggerKeyword}"</span>
            )}
          </div>
        </div>
        <div className={s.cardActions} onClick={e => e.stopPropagation()}>
          <button className={`${s.iconBtn} ${s.iconBtnNeutral}`} onClick={onExport} title="Exportar a archivo .json">⬇</button>
          {onCopyToAccount && (
            <button className={`${s.iconBtn} ${s.iconBtnNeutral}`} onClick={onCopyToAccount} title="Copiar a otra cuenta">📋</button>
          )}
          {onPublish && (
            <button className={`${s.iconBtn} ${s.iconBtnNeutral}`} onClick={onPublish} title="Publicar como plantilla (biblioteca global)">📤</button>
          )}
          <button className={s.iconBtn} onClick={onDelete} title="Eliminar">🗑</button>
        </div>
      </div>

      <div className={s.cardStats}>
        <Stat icon="🔧" label="Nodos" value={nodeCount} />
        <Stat icon="▶" label="Ejecuciones" value={executions.length} />
        <Stat icon="🚦" label="Estado"
          value={isActive
            ? <span className={s.statOk}>Activo</span>
            : <span className={s.statOff}>Sin inicio</span>} />
      </div>

      <div className={s.cardFooter}>
        {draft && (
          <span className={s.draftBadge} title="Hay cambios sin guardar">
            📝 borrador {fmtRelative(draft.savedAt)}
          </span>
        )}
        {lastRun && (
          <span className={`${s.runBadge} ${s['run_' + lastRun.status]}`} title={`Última ejecución`}>
            {lastRun.status === 'success' ? '✓' : lastRun.status === 'error' ? '✗' : '⏸'} {fmtRelative(lastRun.ts)}
          </span>
        )}
        <span className={s.openHint}>Abrir →</span>
      </div>
    </div>
  )
}

function Stat({ icon, label, value }) {
  return (
    <div className={s.stat}>
      <span className={s.statIcon}>{icon}</span>
      <span className={s.statValue}>{value}</span>
      <span className={s.statLabel}>{label}</span>
    </div>
  )
}

function triggerLabel(t) {
  switch (t) {
    case 'manual':              return 'Manual'
    case 'conversation_start':  return 'Inicio de conversación'
    case 'keyword':             return 'Palabra clave'
    case 'ai_tool':             return 'Herramienta IA'
    default:                    return t || 'sin trigger'
  }
}

function fmtRelative(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60_000) return 'ahora'
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)}h`
  return `hace ${Math.floor(diff / 86_400_000)}d`
}
