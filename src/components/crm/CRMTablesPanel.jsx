import { useState, useEffect, useRef } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  listDataTables, createDataTable, updateDataTable, deleteDataTable,
  listTableRows, createTableRow, updateTableRow, deleteTableRow,
} from '../../lib/storage'

// Parser CSV mínimo (comillas, comas y saltos escapados).
function parseCsv(text) {
  const rows = []; let row = [], field = '', inQ = false
  const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (inQ) { if (ch === '"') { if (t[i + 1] === '"') { field += '"'; i++ } else inQ = false } else field += ch }
    else if (ch === '"') inQ = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += ch
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.length)
}
const csvEsc = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const slug = l => String(l).trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

export default function CRMTablesPanel() {
  const { account } = useAccount()
  const accId = account?.id
  const [tables, setTables] = useState([])
  const [selId, setSelId] = useState(null)
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [loadingRows, setLoadingRows] = useState(false)
  const [showCols, setShowCols] = useState(false)
  const fileRef = useRef(null)

  const table = tables.find(t => t.id === selId) || null
  const columns = table?.columns || []

  async function loadTables() {
    if (!accId) return
    try { const r = await listDataTables(accId); setTables(r.tables || []); if (!selId && r.tables?.[0]) setSelId(r.tables[0].id) }
    catch { setTables([]) }
  }
  useEffect(() => { loadTables() }, [accId]) // eslint-disable-line
  async function loadRows(id) {
    if (!accId || !id) return
    setLoadingRows(true)
    try { const r = await listTableRows(accId, id); setRows(r.rows || []) } catch { setRows([]) }
    setLoadingRows(false)
  }
  useEffect(() => { if (selId) loadRows(selId); else setRows([]) }, [selId]) // eslint-disable-line

  // ── Tablas ──────────────────────────────────────────────────────────────────
  async function newTable() {
    const name = prompt('Nombre de la base de datos:', 'Nueva base de datos'); if (!name) return
    const t = await createDataTable(accId, { name, columns: [{ label: 'Nombre', type: 'text' }] })
    await loadTables(); setSelId(t.id); setShowCols(true)
  }
  async function renameTable() {
    if (!table) return
    const name = prompt('Nombre de la base de datos:', table.name); if (name == null) return
    await updateDataTable(accId, table.id, { name }); loadTables()
  }
  async function setDescription(v) { await updateDataTable(accId, table.id, { description: v }); setTables(ts => ts.map(t => t.id === table.id ? { ...t, description: v } : t)) }
  async function toggleAi() { const v = !table.aiEnabled; await updateDataTable(accId, table.id, { aiEnabled: v }); setTables(ts => ts.map(t => t.id === table.id ? { ...t, aiEnabled: v } : t)) }
  async function removeTable() {
    if (!table || !confirm(`¿Eliminar la base de datos "${table.name}" y todas sus filas?`)) return
    await deleteDataTable(accId, table.id); setSelId(null); loadTables()
  }

  // ── Columnas ────────────────────────────────────────────────────────────────
  // La `key` de cada columna la asigna SIEMPRE el servidor (deduplica: columna, columna_, …).
  // Calcularla aquí provocaba que dos columnas con la misma etiqueta compartieran key y, por
  // tanto, que sus celdas leyeran y escribieran el MISMO valor (campos "sincronizados").
  async function saveColumns(cols) {
    const t = await updateDataTable(accId, table.id, { columns: cols })
    if (t?.id) setTables(ts => ts.map(x => x.id === t.id ? t : x))
    else await loadTables()
    loadRows(table.id)
  }
  function addColumn() {
    // Etiqueta única de salida para no nacer duplicada ("Columna 2", "Columna 3"…).
    const base = 'Columna'
    const taken = new Set(columns.map(c => (c.label || '').trim().toLowerCase()))
    let label = base, n = 1
    while (taken.has(label.toLowerCase())) label = `${base} ${++n}`
    saveColumns([...columns, { label, type: 'text' }])
  }
  function updateColumn(i, patch) { const next = columns.map((c, j) => j === i ? { ...c, ...patch } : c); saveColumns(next) }
  function removeColumn(i) { if (!confirm('¿Quitar esta columna? Se dejará de mostrar su dato.')) return; saveColumns(columns.filter((_, j) => j !== i)) }

  // ── Filas ───────────────────────────────────────────────────────────────────
  async function addRow() { await createTableRow(accId, table.id, {}); loadRows(table.id) }
  async function removeRow(id) { setRows(rs => rs.filter(r => r.id !== id)); await deleteTableRow(accId, table.id, id) }
  function setCell(rowId, key, val) { setRows(rs => rs.map(r => r.id === rowId ? { ...r, values: { ...r.values, [key]: val } } : r)) }
  async function commitCell(row, col) { await updateTableRow(accId, table.id, row.id, { [col.key]: row.values[col.key] ?? '' }) }

  const filteredRows = q.trim()
    ? rows.filter(r => Object.values(r.values || {}).some(v => String(v ?? '').toLowerCase().includes(q.toLowerCase())))
    : rows

  // ── CSV ──────────────────────────────────────────────────────────────────────
  function exportCsv() {
    const header = columns.map(c => c.label)
    const lines = [header.map(csvEsc).join(',')]
    rows.forEach(r => lines.push(columns.map(c => csvEsc(r.values?.[c.key])).join(',')))
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${table.name}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }
  async function importCsv(file) {
    if (!file || !table) return
    try {
      const parsed = parseCsv(await file.text())
      if (parsed.length < 2) { alert('El CSV no tiene filas.'); return }
      const header = parsed[0].map(h => h.trim())
      // Empareja cada columna del CSV con una columna de la tabla (por etiqueta).
      const idxByCol = columns.map(c => header.findIndex(h => slug(h) === c.key || h.toLowerCase() === c.label.toLowerCase()))
      let n = 0
      for (const r of parsed.slice(1)) {
        if (!r.some(v => (v || '').trim())) continue
        const values = {}
        columns.forEach((c, i) => { const idx = idxByCol[i]; if (idx >= 0) values[c.key] = r[idx] })
        await createTableRow(accId, table.id, values); n++
      }
      alert(`✓ Importadas ${n} fila(s).`); loadRows(table.id)
    } catch (e) { alert('No se pudo importar: ' + (e?.message || 'error')) }
  }

  const btn = { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text1)', cursor: 'pointer', fontSize: 12.5 }
  const inp = { padding: '6px 8px', fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6, boxSizing: 'border-box' }

  return (
    <div style={{ display: 'flex', gap: 14, height: '100%', minHeight: 0 }}>
      {/* Lista de tablas */}
      <aside style={{ width: 230, flexShrink: 0, borderRight: '1px solid var(--border)', paddingRight: 10, overflowY: 'auto' }}>
        <button style={{ ...btn, width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700, marginBottom: 10 }} onClick={newTable}>+ Nueva base de datos</button>
        {tables.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Sin bases de datos. Crea la primera.</div>}
        {tables.map(t => (
          <div key={t.id} onClick={() => setSelId(t.id)}
            style={{ padding: '9px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: t.id === selId ? 'var(--accent-dim, rgba(124,111,255,.15))' : 'transparent', border: `1px solid ${t.id === selId ? 'var(--accent,#7c6fff)' : 'transparent'}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>📊 {t.name}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{(t.columns || []).length} col · {t.aiEnabled ? '🤖 IA' : 'sin IA'}</div>
          </div>
        ))}
      </aside>

      {/* Tabla seleccionada */}
      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        {!table ? (
          <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 40, textAlign: 'center' }}>Selecciona o crea una base de datos.</div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text1)' }}>📊 {table.name}</div>
              <button style={{ ...btn, padding: '4px 9px' }} onClick={renameTable}>✏</button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', cursor: 'pointer', marginLeft: 'auto' }}>
                <input type="checkbox" checked={!!table.aiEnabled} onChange={toggleAi} /> 🤖 Permitir que la IA la use
              </label>
              <button style={{ ...btn, padding: '4px 9px', color: 'var(--red,#ff5f5f)' }} onClick={removeTable}>🗑</button>
            </div>
            <input style={{ ...inp, width: '100%', marginBottom: 10 }} defaultValue={table.description} onBlur={e => { if (e.target.value !== table.description) setDescription(e.target.value) }} placeholder="Descripción (ayuda a la IA a entender para qué es esta base de datos)…" />

            {/* Barra de acciones */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <input style={{ ...inp, flex: '1 1 200px' }} value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Buscar en las filas…" />
              <button style={btn} onClick={() => setShowCols(v => !v)}>⚙ Columnas</button>
              <button style={btn} onClick={exportCsv} disabled={!columns.length}>⬇ CSV</button>
              <button style={btn} onClick={() => fileRef.current?.click()} disabled={!columns.length}>⬆ CSV</button>
              <input ref={fileRef} type="file" hidden accept=".csv,text/csv" onChange={e => { importCsv(e.target.files?.[0]); if (fileRef.current) fileRef.current.value = '' }} />
            </div>

            {/* Editor de columnas */}
            {showCols && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>Columnas</div>
                {columns.map((c, i) => (
                  <div key={`${c.key || 'col'}_${i}`} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <input key={`lbl_${c.key || 'col'}_${i}`} style={{ ...inp, flex: 1 }} defaultValue={c.label} onBlur={e => { if (e.target.value.trim() && e.target.value !== c.label) updateColumn(i, { label: e.target.value.trim() }) }} />
                    <select style={{ ...inp, width: 110 }} value={c.type} onChange={e => updateColumn(i, { type: e.target.value })}>
                      <option value="text">Texto</option>
                      <option value="number">Número</option>
                    </select>
                    <button style={{ ...btn, padding: '4px 9px', color: 'var(--red,#ff5f5f)' }} onClick={() => removeColumn(i)}>✕</button>
                  </div>
                ))}
                <button style={{ ...btn, marginTop: 4 }} onClick={addColumn}>+ Columna</button>
              </div>
            )}

            {/* Grid de filas */}
            {columns.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: 13 }}>Agrega columnas para empezar (⚙ Columnas).</div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480 }}>
                  <thead>
                    <tr>
                      {columns.map((c, i) => <th key={`${c.key || 'col'}_${i}`} style={{ textAlign: 'left', padding: '9px 10px', fontSize: 11.5, color: 'var(--text3)', fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{c.label}{c.type === 'number' ? ' #' : ''}</th>)}
                      <th style={{ width: 36, borderBottom: '1px solid var(--border)' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {loadingRows && <tr><td colSpan={columns.length + 1} style={{ padding: 12, color: 'var(--text3)', fontSize: 13 }}>Cargando…</td></tr>}
                    {!loadingRows && filteredRows.length === 0 && <tr><td colSpan={columns.length + 1} style={{ padding: 12, color: 'var(--text3)', fontSize: 13 }}>{rows.length ? 'Sin resultados.' : 'Sin filas. Agrega la primera.'}</td></tr>}
                    {filteredRows.map(r => (
                      <tr key={r.id}>
                        {columns.map((c, i) => (
                          <td key={`${c.key || 'col'}_${i}`} style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>
                            <input
                              type={c.type === 'number' ? 'number' : 'text'}
                              style={{ ...inp, width: '100%', border: '1px solid transparent', background: 'transparent' }}
                              value={r.values?.[c.key] ?? ''}
                              onChange={e => setCell(r.id, c.key, e.target.value)}
                              onFocus={e => e.target.style.border = '1px solid var(--border2)'}
                              onBlur={e => { e.target.style.border = '1px solid transparent'; commitCell(r, c) }}
                            />
                          </td>
                        ))}
                        <td style={{ textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                          <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13 }} title="Eliminar fila" onClick={() => removeRow(r.id)}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button style={{ ...btn, margin: 8 }} onClick={addRow}>+ Fila</button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
