import { useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import { SYSTEM_VARIABLE_GROUPS } from '../../lib/systemVariables'
import s from './VariablesPanel.module.css'

// ── Variables Panel ──────────────────────────────────────────────────────────
export function VariablesPanel() {
  const { account, addVariable, deleteVariable } = useAccount()
  const [tab, setTab] = useState('custom') // 'custom' | 'system'
  const [showNew, setShowNew] = useState(false)
  const [nv, setNv] = useState({ name: '', type: 'local', defaultValue: '', description: '' })
  const [toast, setToast] = useState('')

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2000) }

  function handleAdd(e) {
    e.preventDefault()
    if (!nv.name.trim()) return
    addVariable({ ...nv, name: nv.name.trim().replace(/\s+/g, '_') })
    setNv({ name: '', type: 'local', defaultValue: '', description: '' })
    setShowNew(false)
    flash('Variable creada ✓')
  }

  const vars = account?.variables || []
  const local = vars.filter(v => v.type === 'local')
  const global = vars.filter(v => v.type === 'global')

  return (
    <div className={s.panel}>
      {toast && <div className={s.toast}>{toast}</div>}

      <div className={s.tabs}>
        <button className={`${s.tab} ${tab === 'custom' ? s.tabActive : ''}`} onClick={() => setTab('custom')}>
          Personalizadas
        </button>
        <button className={`${s.tab} ${tab === 'system' ? s.tabActive : ''}`} onClick={() => setTab('system')}>
          De sistema
        </button>
      </div>

      {tab === 'system' && <SystemVariablesView />}

      {tab === 'custom' && <>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>Variables personalizadas</h2>
          <p className={s.sub}>
            <strong>Locales</strong>: valor distinto por conversación (ej: nombre del usuario).
            <strong> Globales</strong>: valor único para todo el agente (ej: nombre de la empresa).
            <br />Úsalas en prompts y mensajes de flujos con <code className={s.code}>{'{{nombre_variable}}'}</code>
          </p>
        </div>
        <button className={s.addBtn} onClick={() => setShowNew(!showNew)}>
          {showNew ? '✕ Cancelar' : '+ Nueva variable'}
        </button>
      </div>

      {showNew && (
        <form className={s.formCard} onSubmit={handleAdd}>
          <div className={s.formGrid}>
            <div className={s.field}>
              <label>Nombre <span className={s.labelHint}>(sin espacios)</span></label>
              <input required placeholder="ej: nombre_usuario" value={nv.name}
                onChange={e => setNv(p => ({ ...p, name: e.target.value.replace(/\s+/g, '_') }))}
                className={s.mono} />
            </div>
            <div className={s.field}>
              <label>Tipo</label>
              <select value={nv.type} onChange={e => setNv(p => ({ ...p, type: e.target.value }))}>
                <option value="local">Local (por conversación)</option>
                <option value="global">Global (todo el agente)</option>
              </select>
            </div>
            <div className={s.field}>
              <label>Valor por defecto</label>
              <input placeholder="vacío" value={nv.defaultValue}
                onChange={e => setNv(p => ({ ...p, defaultValue: e.target.value }))} />
            </div>
            <div className={s.field} style={{ gridColumn: 'span 1' }}>
              <label>Descripción</label>
              <input placeholder="¿Para qué sirve?" value={nv.description}
                onChange={e => setNv(p => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <div className={s.formActions}>
            <button type="button" className={s.cancelBtn} onClick={() => setShowNew(false)}>Cancelar</button>
            <button type="submit" className={s.primaryBtn}>Crear variable</button>
          </div>
        </form>
      )}

      <VarGroup title="Variables Locales" color="var(--accent)" vars={local} onDelete={v => {}} account={account} />
      <VarGroup title="Variables Globales" color="var(--amber)" vars={global} onDelete={v => {}} account={account} />
      </>}
    </div>
  )
}

// ── Vista de variables de sistema (solo lectura) ──────────────────────────────
function SystemVariablesView() {
  return (
    <div className={s.sysWrap}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>Variables de sistema</h2>
          <p className={s.sub}>
            El motor de flujos las rellena automáticamente al ejecutar los nodos. No se crean ni se borran;
            úsalas igual que las personalizadas con <code className={s.code}>{'{{nombre_variable}}'}</code>.
          </p>
        </div>
      </div>

      {SYSTEM_VARIABLE_GROUPS.map(g => (
        <div key={g.group} className={s.group}>
          <div className={s.groupTitle} style={{ color: 'var(--amber)' }}>
            {g.group} <span className={s.groupCount}>{g.vars.length}</span>
          </div>
          <div className={s.varTable}>
            <div className={s.sysTHead}>
              <span>Variable</span><span>Descripción</span>
            </div>
            {g.vars.map(v => (
              <div key={v.name} className={s.sysRow}>
                <div className={s.varNameCell}>
                  <code className={s.varCode}>{`{{${v.name}}}`}</code>
                </div>
                <span className={s.varDesc}>{v.desc}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function VarGroup({ title, color, vars, account }) {
  const { deleteVariable } = useAccount()
  if (vars.length === 0) return null
  return (
    <div className={s.group}>
      <div className={s.groupTitle} style={{ color }}>{title} <span className={s.groupCount}>{vars.length}</span></div>
      <div className={s.varTable}>
        <div className={s.varTHead}>
          <span>Variable</span><span>Valor por defecto</span><span>Descripción</span><span></span>
        </div>
        {vars.map(v => (
          <div key={v.id} className={s.varRow}>
            <div className={s.varNameCell}>
              <code className={s.varCode}>{`{{${v.name}}}`}</code>
              {v.isSystem && <span className={s.sysTag}>sistema</span>}
            </div>
            <span className={s.varVal}>{v.defaultValue || <em className={s.empty}>vacío</em>}</span>
            <span className={s.varDesc}>{v.description}</span>
            {!v.isSystem
              ? <button className={s.delBtn} onClick={() => deleteVariable(v.id)}>✕</button>
              : <span />
            }
          </div>
        ))}
      </div>
    </div>
  )
}

// ── AI Tools Panel ────────────────────────────────────────────────────────────
export function AIToolsPanel() {
  const { account, addAITool, updateAITool, deleteAITool } = useAccount()
  const [showNew, setShowNew] = useState(false)
  const [editId, setEditId] = useState(null)
  const [toast, setToast] = useState('')

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2000) }

  const tools = account?.aiTools || []
  const vars = account?.variables || []
  const flows = account?.flows || []
  // Prompts that reference each tool — informativo, para saber dónde se usa.
  const promptsUsing = toolId => (account?.agents || [])
    .flatMap(a => (a.prompts || []).map(p => ({ agent: a.name, prompt: p.name, ids: p.toolIds || [] })))
    .filter(x => x.ids.includes(toolId))

  function handleCreate(payload) { addAITool(payload); setShowNew(false); flash('Herramienta creada ✓') }
  function handleUpdate(id, payload) { updateAITool(id, payload); setEditId(null); flash('Herramienta actualizada ✓') }

  return (
    <div className={s.panel}>
      {toast && <div className={s.toast}>{toast}</div>}

      <div className={s.header}>
        <div>
          <h2 className={s.title}>Herramientas IA</h2>
          <p className={s.sub}>
            Define herramientas que el agente puede invocar (recolectar datos o ejecutar flujos).
            La asignación se hace <strong>por prompt</strong>: ve a <strong>Prompts</strong> → edita un prompt → sección <strong>🔧 Herramientas IA</strong>.
          </p>
        </div>
        <button className={s.addBtn} onClick={() => { setShowNew(!showNew); setEditId(null) }}>
          {showNew ? '✕ Cancelar' : '+ Nueva herramienta'}
        </button>
      </div>

      {showNew && (
        <ToolForm
          vars={vars} flows={flows}
          submitLabel="Crear herramienta"
          onCancel={() => setShowNew(false)}
          onSubmit={handleCreate}
        />
      )}

      <div className={s.toolsList}>
        {tools.length === 0 && (
          <div className={s.emptyTools}>
            <span>🔧</span>
            <p>Sin herramientas creadas</p>
            <small>Crea herramientas para que el agente pueda recolectar datos y ejecutar acciones</small>
          </div>
        )}
        {tools.map(tool => {
          const toolFlow = flows.find(f => f.id === tool.flowId)
          const editing = editId === tool.id
          const usedBy = promptsUsing(tool.id)
          const special = tool.special || tool.actionType === 'cms_resource'
          return (
            <div key={tool.id} className={`${s.toolCard} ${usedBy.length ? s.toolCardAssigned : ''}`}>
              <div className={s.toolCardHeader}>
                <div className={s.toolCardLeft}>
                  <div className={s.toolCardName}>
                    <code className={s.mono}>{tool.name}</code>
                    {special && <span className={s.assignedBadge} style={{ background: 'var(--accent-dim)', color: 'var(--accent)', borderColor: 'var(--accent-glow)' }}>✨ Herramienta IA Especial</span>}
                    {usedBy.length > 0
                      ? <span className={s.assignedBadge} title={usedBy.map(u => `${u.agent} · ${u.prompt}`).join('\n')}>✓ En {usedBy.length} prompt{usedBy.length > 1 ? 's' : ''}</span>
                      : <span className={s.labelHint}>Sin asignar a ningún prompt</span>}
                  </div>
                  <div className={s.toolCardDesc}>{tool.description}</div>
                </div>
                <div className={s.toolCardActions}>
                  {special
                    ? (tool.actionType === 'woocommerce'
                        ? <span className={s.labelHint} title="Herramienta del sistema: configura la conexión en la pestaña Tienda">🛒 Conexión en Tienda</span>
                        : tool.actionType === 'scheduling'
                        ? <span className={s.labelHint} title="Herramienta del sistema: elige los calendarios en la pestaña Agenda">🗓 Calendarios en Agenda</span>
                        : <span className={s.labelHint} title="Herramienta del sistema: gestiona sus recursos en la pestaña CMS">📁 Recursos en CMS</span>)
                    : <>
                        <button className={s.assignBtn} onClick={() => { setEditId(editing ? null : tool.id); setShowNew(false) }}>
                          {editing ? 'Cerrar' : '✎ Editar'}
                        </button>
                        <button className={s.delBtn} onClick={() => { if (confirm(`¿Eliminar herramienta "${tool.name}"?`)) deleteAITool(tool.id) }}>✕</button>
                      </>}
                </div>
              </div>

              {!editing && (
                <div className={s.toolCardMeta}>
                  {tool.collectFields?.length > 0 && (
                    <div className={s.toolFields}>
                      {tool.collectFields.map((f, i) => (
                        <span key={i} className={s.toolFieldTag}>
                          {f.label}{f.required === false && <span style={{ opacity: .6 }}> (opcional)</span>}
                          {f.variableId && <span className={s.toolFieldVar}> → {`{{${vars.find(v => v.id === f.variableId)?.name || '?'}}}`}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  {toolFlow && (
                    <span className={s.toolFlowTag}>⚡ {toolFlow.name}</span>
                  )}
                </div>
              )}

              {editing && (
                <ToolForm
                  initial={tool}
                  vars={vars} flows={flows}
                  submitLabel="Guardar cambios"
                  onCancel={() => setEditId(null)}
                  onSubmit={payload => handleUpdate(tool.id, payload)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── ToolForm — formulario reutilizable para crear y editar herramientas ─────────
function ToolForm({ initial, vars, flows, submitLabel, onSubmit, onCancel }) {
  const [nt, setNt] = useState(() => ({
    name: initial?.name || '',
    description: initial?.description || '',
    collectFields: initial?.collectFields || [],
    actionType: initial?.actionType || 'variable',
    flowId: initial?.flowId || null,
  }))
  const [newField, setNewField] = useState({ label: '', variableId: '', paramName: '', required: true })

  function addField() {
    if (!newField.label.trim()) return
    const paramName = newField.paramName || newField.label.replace(/\s+/g, '_').toLowerCase()
    setNt(p => ({ ...p, collectFields: [...p.collectFields, { ...newField, paramName }] }))
    setNewField({ label: '', variableId: '', paramName: '', required: true })
  }
  function removeField(i) {
    setNt(p => ({ ...p, collectFields: p.collectFields.filter((_, j) => j !== i) }))
  }
  function toggleRequired(i) {
    setNt(p => ({ ...p, collectFields: p.collectFields.map((f, j) => j === i ? { ...f, required: f.required === false ? true : false } : f) }))
  }
  function submit(e) {
    e.preventDefault()
    if (!nt.name.trim() || !nt.description.trim()) return
    onSubmit({
      ...nt,
      name: nt.name.trim().replace(/\s+/g, '_').toLowerCase(),
      flowId:           nt.actionType === 'flow' ? nt.flowId : null,
    })
  }

  return (
    <form className={s.formCard} onSubmit={submit}>
      <div className={s.formGrid}>
        <div className={s.field}>
          <label>Nombre de la herramienta <span className={s.labelHint}>(función interna, sin espacios)</span></label>
          <input required placeholder="ej: guardar_nombre, crear_ticket..." value={nt.name}
            onChange={e => setNt(p => ({ ...p, name: e.target.value }))} className={s.mono} />
        </div>
        <div className={s.field}>
          <label>Acción al invocar</label>
          <select value={nt.actionType || 'variable'} onChange={e => setNt(p => ({ ...p, actionType: e.target.value }))}>
            <option value="variable">📝 Solo guardar variables</option>
            <option value="flow">⚡ Ejecutar un flujo</option>
          </select>
          {nt.actionType === 'flow' && (
            <select value={nt.flowId || ''} onChange={e => setNt(p => ({ ...p, flowId: e.target.value || null }))} style={{ marginTop: 6 }}>
              <option value="">Selecciona un flujo...</option>
              {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
        </div>
        <div className={s.field} style={{ gridColumn: 'span 2' }}>
          <label>Descripción <span className={s.labelHint}>(el agente lee esto para saber cuándo usarla)</span></label>
          <textarea rows={3} required placeholder="Ej: Usa esta herramienta cuando el usuario te diga su nombre. Guarda el nombre completo." value={nt.description}
            onChange={e => setNt(p => ({ ...p, description: e.target.value }))} />
        </div>
      </div>

      <div className={s.fieldsSection}>
        <div className={s.fieldsSectionTitle}>Campos a recolectar</div>
        <div className={s.existingFields}>
          {nt.collectFields.map((f, i) => (
            <div key={i} className={s.fieldChip}>
              <span className={s.fieldChipLabel}>{f.label}</span>
              {f.variableId && <span className={s.fieldChipVar}>→ {`{{${vars.find(v => v.id === f.variableId)?.name || f.variableId}}}`}</span>}
              <button type="button" onClick={() => toggleRequired(i)} title="Cambiar obligatorio/opcional"
                style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, border: '1px solid var(--border2)', cursor: 'pointer', background: 'transparent', color: f.required === false ? 'var(--text3)' : 'var(--amber, #f5a623)' }}>
                {f.required === false ? 'opcional' : 'obligatorio'}
              </button>
              <button type="button" onClick={() => removeField(i)}>✕</button>
            </div>
          ))}
          {nt.collectFields.length === 0 && <span className={s.noFields}>Sin campos definidos</span>}
        </div>
        <div className={s.addFieldRow}>
          <input placeholder="Etiqueta del campo (ej: Nombre completo)" value={newField.label}
            onChange={e => setNewField(p => ({ ...p, label: e.target.value }))} style={{ flex: 2 }} />
          <select value={newField.variableId} onChange={e => setNewField(p => ({ ...p, variableId: e.target.value }))} style={{ flex: 1 }}>
            <option value="">Guardar en variable...</option>
            {vars.map(v => <option key={v.id} value={v.id}>{`{{${v.name}}}`} ({v.type})</option>)}
          </select>
          <label className={s.labelHint} style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={newField.required !== false} onChange={e => setNewField(p => ({ ...p, required: e.target.checked }))} /> Obligatorio
          </label>
          <button type="button" className={s.addFieldBtn} onClick={addField}>+ Campo</button>
        </div>
      </div>

      <div className={s.formActions}>
        <button type="button" className={s.cancelBtn} onClick={onCancel}>Cancelar</button>
        <button type="submit" className={s.primaryBtn}>{submitLabel}</button>
      </div>
    </form>
  )
}

export default VariablesPanel
