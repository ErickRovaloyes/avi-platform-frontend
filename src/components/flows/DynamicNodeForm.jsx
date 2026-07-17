import { useRef, useState, useEffect } from 'react'
import { listGoogleSheets, googleSheetColumns, googleWorksheets, uploadChatMedia, mediaUrl } from '../../lib/storage'
import { useAccount } from '../../context/AccountContext'
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
export default function DynamicNodeForm({ node, def, onChange, variables = [], flows = [], members = [], prompts = [], calendars = [], cmsAssets = [], accId = null }) {
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
            {renderInput(f, value, setField, { variables, flows, members, prompts, calendars, cmsAssets, data, accId, setData: patch => onChange({ ...data, ...patch }) })}
            {f.hint && <div className={s.hint}>{f.hint}</div>}
          </div>
        )
      })}
    </div>
  )
}

function renderInput(f, value, setField, { variables, flows, members, prompts, calendars, cmsAssets, data, accId, setData }) {
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

    case 'calendarRef':
      return (
        <select className={s.input} value={value ?? ''} onChange={e => setField(f.key, e.target.value)}>
          <option value="">— elegir calendario —</option>
          {calendars.map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.type === 'form' ? ' (formulario)' : ''}</option>
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

    case 'cmsAssetRef':
      return (
        <select className={s.input} value={value ?? ''} onChange={e => setField(f.key, e.target.value)}>
          <option value="">{(cmsAssets || []).length ? '— elegir recurso —' : 'No hay recursos (créalos en Zona IA → CMS)'}</option>
          {(cmsAssets || []).map(a => (
            <option key={a.id} value={a.id}>{a.name}{a.kind ? ` · ${a.kind}` : ''}</option>
          ))}
        </select>
      )

    case 'mediaSource':
      return <MediaSourceField data={data} setData={setData} cmsAssets={cmsAssets} accId={accId} />

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

    case 'worksheetRef':
      return <WorksheetSelect accId={accId} data={data} value={value} onChange={v => setField(f.key, v)} />

    case 'sheetFilters':
      return <SheetFilters accId={accId} data={data} value={value} variables={variables} onChange={v => setField(f.key, v)} />

    case 'sheetFieldMap':
      return <SheetFieldMap accId={accId} data={data} value={value} variables={variables} onChange={v => setField(f.key, v)} />

    case 'sheetConsumeMap':
      return <SheetConsumeMap accId={accId} data={data} value={value} variables={variables} onChange={v => setField(f.key, v)} />

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
// Fuente de un medio (imagen/archivo): URL, subir desde el dispositivo (queda
// guardado en el CMS) o elegir uno del CMS. Guarda en node.data: src/url/assetId.
function MediaSourceField({ data, setData, cmsAssets = [], accId }) {
  const { addCmsAsset } = useAccount()
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState(data.assetId ? 'cms' : 'url')
  const fileRef = useRef(null)

  async function onUpload(file) {
    if (!file) return
    setBusy(true)
    try {
      const up = await uploadChatMedia(accId, file, 'cms')
      const a = addCmsAsset({
        name: file.name.replace(/\.[^.]+$/, ''), description: '', tags: [],
        kind: up.kind, mediaId: up.mediaId, filename: up.filename, mime: up.mime, sizeBytes: up.sizeBytes,
      })
      setData({ src: 'cms', assetId: a.id, url: '' })
      setTab('cms')
    } catch (e) { alert('No se pudo subir: ' + (e?.message || 'error')) }
    setBusy(false)
  }

  const Btn = (id, label) => (
    <button type="button" className={`${s.srcTab} ${tab === id ? s.srcTabOn : ''}`} onClick={() => setTab(id)}>{label}</button>
  )
  return (
    <div>
      <div className={s.srcTabs}>
        {Btn('url', '🔗 URL')}
        {Btn('cms', '📁 Del CMS')}
        {Btn('upload', '⬆ Subir')}
      </div>
      {tab === 'url' && (
        <input className={s.input} placeholder="https://…" value={data.url || ''}
          onChange={e => setData({ src: 'url', url: e.target.value, assetId: '' })} />
      )}
      {tab === 'cms' && (
        <select className={s.input} value={data.assetId || ''} onChange={e => setData({ src: 'cms', assetId: e.target.value, url: '' })}>
          <option value="">{cmsAssets.length ? '— elegir recurso —' : 'No hay recursos (créalos en Zona IA → CMS)'}</option>
          {cmsAssets.map(a => <option key={a.id} value={a.id}>{a.name}{a.kind ? ` · ${a.kind}` : ''}</option>)}
        </select>
      )}
      {tab === 'upload' && (
        <div>
          <button type="button" className={s.input} style={{ cursor: 'pointer', textAlign: 'left' }} disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Subiendo…' : '⬆ Elegir archivo del dispositivo (se guardará en el CMS)'}
          </button>
          <input ref={fileRef} type="file" hidden onChange={e => onUpload(e.target.files?.[0])} />
        </div>
      )}
      {data.assetId && (() => {
        const a = cmsAssets.find(x => x.id === data.assetId)
        return <div className={s.hint} style={{ marginTop: 4 }}>{a ? `✓ Recurso: ${a.name}` : '⚠ El recurso elegido ya no existe.'}</div>
      })()}
    </div>
  )
}

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

// Resuelve la hoja de cálculo elegida (spreadsheetId o link manual).
function spreadsheetOf(data) {
  return (data?.sheetId && String(data.sheetId).trim()) || data?.spreadsheet || ''
}

// Hook compartido: lee los encabezados (1ª fila) de la hoja/pestaña elegida.
function useSheetHeaders(accId, data) {
  const spreadsheet = spreadsheetOf(data)
  const worksheet = data?.worksheet || ''
  const range = worksheet ? '' : (data?.range || 'A1:Z1000')
  const [headers, setHeaders] = useState(null) // null = cargando
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    if (!accId || !spreadsheet) { setHeaders([]); return }
    setHeaders(null); setErr('')
    googleSheetColumns(accId, { spreadsheet, range, worksheet })
      .then(r => { if (alive) setHeaders(Array.isArray(r?.headers) ? r.headers : []) })
      .catch(e => { if (alive) { setHeaders([]); setErr(e?.message || 'No se pudieron leer las columnas.') } })
    return () => { alive = false }
  }, [accId, spreadsheet, worksheet, range])
  return { headers, err, spreadsheet }
}

/** Selector de "Hoja de trabajo" (pestaña dentro del libro). */
function WorksheetSelect({ accId, data, value, onChange }) {
  const spreadsheet = spreadsheetOf(data)
  const [tabs, setTabs] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    if (!accId || !spreadsheet) { setTabs([]); return }
    setTabs(null); setErr('')
    googleWorksheets(accId, { spreadsheet })
      .then(r => { if (alive) setTabs(Array.isArray(r?.sheets) ? r.sheets : []) })
      .catch(e => { if (alive) { setTabs([]); setErr(e?.message || 'No se pudieron cargar las hojas de trabajo.') } })
    return () => { alive = false }
  }, [accId, spreadsheet])
  if (!spreadsheet) return <div className={s.hint}>Primero elige una hoja de cálculo.</div>
  if (tabs === null) return <div className={s.hint}>Cargando hojas de trabajo…</div>
  return (
    <>
      <select className={s.input} value={value ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">— elegir hoja de trabajo —</option>
        {tabs.map((t, i) => <option key={i} value={t}>{t}</option>)}
      </select>
      {err && <div className={s.hint}>{err}</div>}
    </>
  )
}

/** Campos a filtrar (Lookup Columns): lista de {column, value}. Coinciden TODOS. */
function SheetFilters({ accId, data, value, onChange, variables = [] }) {
  const { headers, err } = useSheetHeaders(accId, data)
  const rows = Array.isArray(value) ? value : []
  const update = (i, patch) => onChange(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const add = () => onChange([...rows, { column: '', value: '' }])
  const remove = i => onChange(rows.filter((_, idx) => idx !== i))
  return (
    <div className={s.mappings}>
      <div className={s.mappingsHint}>Devuelve / usa las filas que coinciden con TODOS los filtros.</div>
      {rows.map((row, i) => (
        <div key={i} className={s.mappingRow}>
          <select className={s.input} value={row.column || ''} onChange={e => update(i, { column: e.target.value })}>
            <option value="">— columna —</option>
            {(headers || []).map((h, hi) => <option key={hi} value={h}>{h || `(col ${hi + 1})`}</option>)}
          </select>
          <span className={s.mappingArrow}>=</span>
          <VarAutocomplete
            className={s.input}
            placeholder="valor · {{variable}}"
            value={row.value || ''}
            variables={variables}
            onChange={v => update(i, { value: v })}
          />
          <button type="button" className={s.mappingRemove} onClick={() => remove(i)} title="Quitar filtro">✕</button>
        </div>
      ))}
      <button type="button" className={s.mappingAdd} onClick={add}>+ Filtro</button>
      {err && <div className={s.hint}>{err}</div>}
    </div>
  )
}

/** Campos a enviar: una fila por columna de la hoja → valor a escribir. */
function SheetFieldMap({ accId, data, value, onChange, variables = [] }) {
  const { headers, err } = useSheetHeaders(accId, data)
  const stored = Array.isArray(value) ? value : []
  const valueFor = h => stored.find(e => String(e.column).toLowerCase() === String(h).toLowerCase())?.value ?? ''
  const setValueFor = (h, v) => {
    const others = stored.filter(e => String(e.column).toLowerCase() !== String(h).toLowerCase())
    onChange([...others, { column: h, value: v }])
  }
  if (headers === null) return <div className={s.hint}>Leyendo columnas…</div>
  if (!headers.length) return <div className={s.hint}>{err || 'No se encontraron columnas. Elige una hoja de trabajo.'}</div>
  return (
    <div className={s.mappings}>
      <div className={s.mapHeaderRow}><span>Valor a escribir</span><span>Columna de Google</span></div>
      {headers.map((h, i) => (
        <div key={i} className={s.mappingRow}>
          <VarAutocomplete
            className={s.input}
            placeholder="valor · {{variable}}"
            value={valueFor(h)}
            variables={variables}
            onChange={v => setValueFor(h, v)}
          />
          <span className={s.mappingArrow}>→</span>
          <span className={s.colLabel}>{h || `(col ${i + 1})`}</span>
        </div>
      ))}
      {err && <div className={s.hint}>{err}</div>}
    </div>
  )
}

/** Campos a consumir: una fila por columna de la hoja → variable donde guardar. */
function SheetConsumeMap({ accId, data, value, onChange, variables }) {
  const { headers, err } = useSheetHeaders(accId, data)
  const stored = Array.isArray(value) ? value : []
  const varFor = h => stored.find(e => String(e.column).toLowerCase() === String(h).toLowerCase())?.var ?? ''
  const setVarFor = (h, v) => {
    const others = stored.filter(e => String(e.column).toLowerCase() !== String(h).toLowerCase())
    onChange(v ? [...others, { column: h, var: v }] : others)
  }
  if (headers === null) return <div className={s.hint}>Leyendo columnas…</div>
  if (!headers.length) return <div className={s.hint}>{err || 'No se encontraron columnas. Elige una hoja de trabajo.'}</div>
  return (
    <div className={s.mappings}>
      <div className={s.mapHeaderRow}><span>Columna de Google</span><span>Guardar en variable</span></div>
      {headers.map((h, i) => (
        <div key={i} className={s.mappingRow}>
          <span className={s.colLabel}>{h || `(col ${i + 1})`}</span>
          <span className={s.mappingArrow}>→</span>
          <select className={s.input} value={varFor(h)} onChange={e => setVarFor(h, e.target.value)}>
            <option value="">— ninguna —</option>
            {variables.map(v => <option key={v.id} value={v.id}>{v.name || v.id}</option>)}
          </select>
        </div>
      ))}
      {err && <div className={s.hint}>{err}</div>}
    </div>
  )
}
