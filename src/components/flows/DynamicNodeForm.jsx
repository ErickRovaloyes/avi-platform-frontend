import { useRef, useState, useEffect } from 'react'
import { listGoogleSheets, googleSheetColumns } from '../../lib/storage'
import s from './DynamicNodeForm.module.css'

// System variables always available inside flows (not stored in account.variables)
const SYSTEM_VARS = [
  { id: '_lastUserMessage', name: '_lastUserMessage', description: 'Último mensaje del usuario' },
]

/**
 * Input / textarea con autocompletado de variables. Al escribir "{" despliega la
 * lista de variables disponibles; al elegir una inserta {{nombre}} en el cursor.
 */
function VarAutocomplete({ value, onChange, variables = [], multiline = false, rows = 3, className, placeholder, spellCheck }) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hi, setHi] = useState(0)  // highlighted index

  const allVars = [
    ...SYSTEM_VARS,
    ...variables.map(v => ({ id: v.id, name: v.name || v.id, description: v.description })),
  ]
  const filtered = allVars
    .filter(v => v.name.toLowerCase().includes((query || '').toLowerCase()))
    .slice(0, 8)

  function detectTrigger(el) {
    const caret = el.selectionStart
    const before = String(el.value).slice(0, caret)
    // Coincide con "{" o "{{" seguido opcionalmente de palabra, al final del texto
    const m = before.match(/\{\{?([\w]*)$/)
    if (m) { setQuery(m[1] || ''); setHi(0); setOpen(true) }
    else setOpen(false)
  }

  function handleChange(e) {
    onChange(e.target.value)
    detectTrigger(e.target)
  }

  function insertVar(v) {
    const el = ref.current
    if (!el) return
    const caret = el.selectionStart
    const before = String(value).slice(0, caret)
    const after  = String(value).slice(caret)
    const newBefore = before.replace(/\{\{?[\w]*$/, `{{${v.name}}}`)
    onChange(newBefore + after)
    setOpen(false)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(newBefore.length, newBefore.length)
    }, 0)
  }

  function handleKeyDown(e) {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => (h + 1) % filtered.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => (h - 1 + filtered.length) % filtered.length) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertVar(filtered[hi]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  const inputProps = {
    ref,
    className,
    value: value ?? '',
    placeholder,
    spellCheck,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onKeyUp: e => detectTrigger(e.target),
    onClick: e => detectTrigger(e.target),
    onBlur: () => setTimeout(() => setOpen(false), 150),
  }

  return (
    <div className={s.varField}>
      {multiline
        ? <textarea {...inputProps} rows={rows} />
        : <input {...inputProps} type="text" />}
      {open && filtered.length > 0 && (
        <div className={s.varDropdown}>
          <div className={s.varDropdownHdr}>Variables — Enter para insertar</div>
          {filtered.map((v, i) => (
            <button
              key={v.id}
              type="button"
              className={`${s.varOption} ${i === hi ? s.varOptionActive : ''}`}
              onMouseDown={e => { e.preventDefault(); insertVar(v) }}
              onMouseEnter={() => setHi(i)}
            >
              <code className={s.varOptionName}>{`{{${v.name}}}`}</code>
              {v.description && <span className={s.varOptionDesc}>{v.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Renders the editable form for a node based on its declarative `fields` schema.
 *
 * Supported field types:
 *   - text, password, email, url            → <input>
 *   - number                                → <input type=number>
 *   - textarea                              → <textarea>
 *   - select                                → <select> with field.options
 *   - toggle                                → <input type=checkbox>
 *   - code                                  → <textarea class=code> (language is hint only)
 *   - list                                  → multi-line textarea, value as \n-separated array
 *   - variableRef                           → <select> con variables del account
 *   - memberRef                             → <select> con miembros (acepta lista en prop)
 *   - flowRef                               → <select> de flows del account
 *   - jsonMappings                          → editor lista de {path → variable}
 *   - promptRef                             → <select> con prompts del agente
 *
 * Props:
 *   node       — the node (with data: object)
 *   def        — the node definition from registry (with fields[])
 *   onChange   — (patch) => void  (applies updates to node.data)
 *   variables  — array of {id, name}
 *   flows      — array of {id, name}
 *   members    — array of {id, name}
 *   prompts    — array of {id, name, provider}
 */
export default function DynamicNodeForm({ node, def, onChange, variables = [], flows = [], members = [], prompts = [], accId = null }) {
  const data = node?.data || {}

  function setField(key, value) {
    onChange({ ...data, [key]: value })
  }

  if (!def?.fields?.length) {
    return <div className={s.empty}>Este nodo no tiene parámetros editables.</div>
  }

  return (
    <div className={s.form} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      {def.fields.map(f => {
        // Conditional fields: hide when their showIf predicate returns false
        if (typeof f.showIf === 'function' && !f.showIf(data)) return null
        const value = data[f.key] ?? f.default ?? ''
        return (
          <div key={f.key} className={s.field}>
            <label className={s.label}>
              {f.label || f.key}
              {f.required && <span className={s.required}>*</span>}
            </label>
            {renderInput(f, value, setField, { variables, flows, members, prompts, data, accId })}
            {f.hint && <div className={s.hint}>{f.hint}</div>}
          </div>
        )
      })}
    </div>
  )
}

function renderInput(f, value, setField, { variables, flows, members, prompts, data, accId }) {
  const common = {
    className: s.input,
    placeholder: f.placeholder || '',
    value: value ?? '',
    onChange: e => setField(f.key, e.target.value),
  }

  switch (f.type) {
    case 'textarea':
      return (
        <VarAutocomplete
          multiline rows={f.rows || 3}
          className={s.textarea}
          placeholder={f.placeholder || ''}
          value={value}
          variables={variables}
          onChange={v => setField(f.key, v)}
        />
      )

    case 'code':
      return (
        <VarAutocomplete
          multiline rows={f.rows || 5}
          className={`${s.textarea} ${s.code}`}
          spellCheck={false}
          placeholder={f.placeholder || `// ${f.language || 'code'}`}
          value={value}
          variables={variables}
          onChange={v => setField(f.key, v)}
        />
      )

    case 'number':
      return (
        <input
          type="number"
          className={s.input}
          value={value ?? ''}
          min={f.min}
          max={f.max}
          step={f.step}
          placeholder={f.placeholder}
          onChange={e => setField(f.key, e.target.value === '' ? '' : Number(e.target.value))}
        />
      )

    case 'password':
    case 'email':
    case 'url':
      return <input {...common} type={f.type} />

    case 'toggle':
      return (
        <label className={s.toggleRow}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={e => setField(f.key, e.target.checked)}
          />
          <span className={s.toggleHint}>{f.toggleLabel || 'Activado'}</span>
        </label>
      )

    case 'select':
      return (
        <select className={s.input} value={value ?? ''} onChange={e => setField(f.key, e.target.value)}>
          {!f.required && <option value="">— elegir —</option>}
          {(f.options || []).map(opt =>
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          )}
        </select>
      )

    case 'list':
      return (
        <textarea
          rows={f.rows || 4}
          className={s.textarea}
          placeholder={f.placeholder || 'Una opción por línea'}
          value={Array.isArray(value) ? value.join('\n') : String(value || '')}
          onChange={e => setField(f.key, e.target.value.split('\n'))}
        />
      )

    case 'variableRef':
      return (
        <select className={s.input} value={value ?? ''} onChange={e => setField(f.key, e.target.value)}>
          <option value="">— elegir variable —</option>
          {variables.map(v => (
            <option key={v.id} value={v.id}>{v.name || v.id}</option>
          ))}
        </select>
      )

    case 'flowRef':
      return (
        <select className={s.input} value={value ?? ''} onChange={e => setField(f.key, e.target.value)}>
          <option value="">— elegir flujo —</option>
          {flows.map(fl => (
            <option key={fl.id} value={fl.id}>{fl.name}</option>
          ))}
        </select>
      )

    case 'memberRef':
      return (
        <select className={s.input} value={value ?? ''} onChange={e => setField(f.key, e.target.value)}>
          <option value="">— elegir miembro —</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.name || m.email || m.id}</option>
          ))}
        </select>
      )

    case 'promptRef':
      return (
        <select className={s.input} value={value ?? ''} onChange={e => setField(f.key, e.target.value)}>
          <option value="">— elegir prompt —</option>
          {prompts.map(p => (
            <option key={p.id} value={p.id}>{p.name}{p.provider ? ` (${p.provider})` : ''}</option>
          ))}
        </select>
      )

    case 'jsonMappings':
      return (
        <JsonMappingsEditor
          value={Array.isArray(value) ? value : []}
          variables={variables}
          placeholder={f.placeholder}
          onChange={v => setField(f.key, v)}
        />
      )

    case 'sheetRef':
      return <SheetSelect accId={accId} value={value} onChange={v => setField(f.key, v)} />

    case 'sheetColumnRef':
      return <SheetColumnSelect accId={accId} data={data} value={value} onChange={v => setField(f.key, v)} />

    case 'text':
    default:
      return (
        <VarAutocomplete
          className={s.input}
          placeholder={f.placeholder || ''}
          value={value}
          variables={variables}
          onChange={v => setField(f.key, v)}
        />
      )
  }
}

/**
 * Editor de mapeos JSON → variable.
 * Cada fila es { path: 'data.user.name', var: 'variableId' }.
 *
 * El path admite notación con puntos y corchetes:
 *   data.user.name
 *   items[0].price
 *   results.0.id
 */
function JsonMappingsEditor({ value, variables, onChange, placeholder }) {
  const rows = value.length ? value : []

  function update(idx, patch) {
    const next = rows.map((r, i) => i === idx ? { ...r, ...patch } : r)
    onChange(next)
  }
  function add() { onChange([...rows, { path: '', var: '' }]) }
  function remove(idx) { onChange(rows.filter((_, i) => i !== idx)) }

  return (
    <div className={s.mappings}>
      {rows.length === 0 && (
        <div className={s.mappingsHint}>
          {placeholder || 'Aún no hay extracciones configuradas.'}
        </div>
      )}
      {rows.map((row, idx) => (
        <div key={idx} className={s.mappingRow}>
          <input
            className={`${s.input} ${s.mappingPath}`}
            placeholder="EMAIL · data.user.name"
            value={row.path || ''}
            onChange={e => update(idx, { path: e.target.value })}
          />
          <span className={s.mappingArrow}>→</span>
          <select
            className={s.input}
            value={row.var || ''}
            onChange={e => update(idx, { var: e.target.value })}
          >
            <option value="">— variable —</option>
            {variables.map(v => (
              <option key={v.id} value={v.id}>{v.name || v.id}</option>
            ))}
          </select>
          <button
            type="button"
            className={s.mappingRemove}
            onClick={() => remove(idx)}
            title="Eliminar extracción"
          >✕</button>
        </div>
      ))}
      <button type="button" className={s.mappingAdd} onClick={add}>
        + Añadir extracción
      </button>
    </div>
  )
}

/**
 * Selector de una hoja de Google previamente vinculada (Configuración → Google).
 * Guarda el spreadsheetId como valor.
 */
function SheetSelect({ accId, value, onChange }) {
  const [sheets, setSheets] = useState(null) // null = cargando
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    if (!accId) { setSheets([]); return }
    setSheets(null); setErr('')
    listGoogleSheets(accId)
      .then(list => { if (alive) setSheets(Array.isArray(list) ? list : []) })
      .catch(() => { if (alive) { setSheets([]); setErr('No se pudieron cargar las hojas vinculadas.') } })
    return () => { alive = false }
  }, [accId])

  if (sheets === null) return <div className={s.hint}>Cargando hojas vinculadas…</div>
  return (
    <>
      <select className={s.input} value={value ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">— elegir hoja vinculada —</option>
        {sheets.map(sh => (
          <option key={sh.id} value={sh.spreadsheetId}>{sh.name || sh.spreadsheetId}</option>
        ))}
      </select>
      {sheets.length === 0 && !err && (
        <div className={s.hint}>No hay hojas vinculadas. Añádelas en Configuración → Google.</div>
      )}
      {err && <div className={s.hint}>{err}</div>}
    </>
  )
}

/**
 * Selector de columna (encabezado) de la hoja elegida. Lee la primera fila del
 * rango y muestra cada columna como opción. Guarda el nombre del encabezado.
 */
function SheetColumnSelect({ accId, data, value, onChange }) {
  const spreadsheet = (data?.sheetId && String(data.sheetId).trim()) || data?.spreadsheet || ''
  const range = data?.range || 'A1:Z1000'
  const [cols, setCols] = useState(null) // null = cargando
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    if (!accId || !spreadsheet) { setCols([]); return }
    setCols(null); setErr('')
    googleSheetColumns(accId, { spreadsheet, range })
      .then(r => { if (alive) setCols(Array.isArray(r?.headers) ? r.headers : []) })
      .catch(e => { if (alive) { setCols([]); setErr(e?.message || 'No se pudieron leer las columnas.') } })
    return () => { alive = false }
  }, [accId, spreadsheet, range])

  if (!spreadsheet) return <div className={s.hint}>Primero elige una hoja vinculada (o pega un link arriba).</div>
  if (cols === null) return <div className={s.hint}>Leyendo columnas de la hoja…</div>
  return (
    <>
      <select className={s.input} value={value ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">— sin filtro (todas las filas) —</option>
        {cols.map((c, i) => (
          <option key={i} value={c}>{c || `(columna ${i + 1})`}</option>
        ))}
      </select>
      {err && <div className={s.hint}>{err}</div>}
      {!err && cols.length === 0 && (
        <div className={s.hint}>No se encontraron encabezados en {range}. Revisa el rango/pestaña.</div>
      )}
    </>
  )
}
