import { useState, useRef, useEffect, useMemo } from 'react'

/**
 * Barra de filtros reutilizable con facetas.
 *
 * Props:
 *   facets: [{ id, label, icon?, type, options?, placeholder?, unit? }]
 *     type 'multiselect' → options: [{ value, label, icon?, color? }] (elegir de una LISTA)
 *     type 'range'       → dos inputs numéricos (min/max)
 *     type 'daterange'   → dos inputs de fecha (from/to)
 *   value:   estado del filtro { [facetId]: [..] | {min,max} | {from,to} }
 *   onChange(nextValue)
 *
 * El componente SOLO gestiona la UI y el estado; el consumidor aplica el filtro
 * a sus datos usando los helpers exportados (selMatches / numInRange / tsInRange).
 */

// ── Helpers de coincidencia (para el consumidor) ──────────────────────────────
export function selMatches(selected, val) {
  if (!selected || !selected.length) return true
  const arr = Array.isArray(val) ? val : [val]
  return arr.some(v => selected.includes(v))
}
export function numInRange(n, r) {
  if (!r) return true
  const x = Number(n)
  if (Number.isNaN(x)) return !(has(r.min) || has(r.max))
  if (has(r.min) && !(x >= Number(r.min))) return false
  if (has(r.max) && !(x <= Number(r.max))) return false
  return true
}
export function tsInRange(ts, r) {
  if (!r) return true
  const t = Number(ts) || 0
  if (r.from && t < new Date(r.from + 'T00:00:00').getTime()) return false
  if (r.to   && t > new Date(r.to   + 'T23:59:59').getTime()) return false
  return true
}
const has = v => v !== '' && v != null

function countActive(f, v) {
  if (!v) return 0
  if (f.type === 'multiselect') return Array.isArray(v) ? v.length : 0
  if (f.type === 'range')       return (has(v.min) || has(v.max)) ? 1 : 0
  if (f.type === 'daterange')   return (v.from || v.to) ? 1 : 0
  return 0
}

export default function CRMFilterBar({ facets = [], value = {}, onChange, right = null }) {
  const [open, setOpen] = useState(null)  // id de la faceta con el desplegable abierto
  const [q, setQ] = useState('')
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const totalActive = useMemo(
    () => facets.reduce((n, f) => n + countActive(f, value[f.id]), 0),
    [facets, value]
  )

  function set(id, v) { onChange({ ...value, [id]: v }) }
  function clearFacet(id) { const n = { ...value }; delete n[id]; onChange(n) }
  function clearAll() { onChange({}) }
  function openFacet(id) { setQ(''); setOpen(open === id ? null : id) }

  function toggleOption(f, optVal) {
    const cur = Array.isArray(value[f.id]) ? value[f.id] : []
    const next = cur.includes(optVal) ? cur.filter(x => x !== optVal) : [...cur, optVal]
    if (next.length) set(f.id, next); else clearFacet(f.id)
  }

  // ── estilos ────────────────────────────────────────────────────────────────
  const wrap = { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }
  const bar  = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
  const pill = active => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 999,
    background: active ? 'var(--accent-dim, rgba(124,111,255,.15))' : 'var(--bg3)',
    border: `1px solid ${active ? 'var(--accent, #7c6fff)' : 'var(--border2)'}`,
    color: active ? 'var(--accent, #7c6fff)' : 'var(--text2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
  })
  const badge = { background: 'var(--accent, #7c6fff)', color: '#fff', borderRadius: 999, fontSize: 10.5, fontWeight: 700, padding: '0 6px', minWidth: 16, textAlign: 'center' }
  const drop = { position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 60, minWidth: 220, maxWidth: 300, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.35)', overflow: 'hidden' }
  const dropInp = { width: '100%', boxSizing: 'border-box', padding: '7px 9px', fontSize: 12.5, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 7 }
  const optRow = sel => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 12.5, color: 'var(--text)', background: sel ? 'var(--bg3)' : 'transparent' })
  const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 999, background: 'var(--bg3)', border: '1px solid var(--border2)', fontSize: 11.5, color: 'var(--text2)' }

  const optLabel = (f, val) => {
    const o = (f.options || []).find(o => o.value === val)
    return o ? o.label : val
  }

  // ── chips activos ────────────────────────────────────────────────────────────
  const chips = []
  for (const f of facets) {
    const v = value[f.id]
    if (!countActive(f, v)) continue
    if (f.type === 'multiselect') {
      for (const val of v) chips.push({ key: `${f.id}:${val}`, text: `${f.label}: ${optLabel(f, val)}`, onX: () => toggleOption(f, val) })
    } else if (f.type === 'range') {
      const t = [has(v.min) ? `≥${v.min}` : '', has(v.max) ? `≤${v.max}` : ''].filter(Boolean).join(' ')
      chips.push({ key: f.id, text: `${f.label}: ${t}${f.unit || ''}`, onX: () => clearFacet(f.id) })
    } else if (f.type === 'daterange') {
      const t = [v.from, v.to].filter(Boolean).join(' → ')
      chips.push({ key: f.id, text: `${f.label}: ${t}`, onX: () => clearFacet(f.id) })
    }
  }

  return (
    <div style={wrap} ref={rootRef}>
      <div style={bar}>
        {facets.map(f => {
          const n = countActive(f, value[f.id])
          return (
            <div key={f.id} style={{ position: 'relative' }}>
              <button type="button" style={pill(n > 0)} onClick={() => openFacet(f.id)}>
                {f.icon && <span>{f.icon}</span>}{f.label}
                {n > 0 && <span style={badge}>{n}</span>}
                <span style={{ opacity: .6, fontSize: 10 }}>▾</span>
              </button>
              {open === f.id && (
                <div style={drop} onClick={e => e.stopPropagation()}>
                  {f.type === 'multiselect' && (() => {
                    const opts = f.options || []
                    const showSearch = opts.length > 8
                    const shown = showSearch && q ? opts.filter(o => (o.label || '').toLowerCase().includes(q.toLowerCase())) : opts
                    const sel = Array.isArray(value[f.id]) ? value[f.id] : []
                    return (
                      <div>
                        {showSearch && (
                          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                            <input autoFocus placeholder="Buscar..." value={q} onChange={e => setQ(e.target.value)} style={dropInp} />
                          </div>
                        )}
                        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                          {shown.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--text3)' }}>Sin opciones.</div>}
                          {shown.map(o => {
                            const isSel = sel.includes(o.value)
                            return (
                              <div key={o.value} style={optRow(isSel)} onClick={() => toggleOption(f, o.value)}>
                                <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${isSel ? 'var(--accent,#7c6fff)' : 'var(--border2)'}`, background: isSel ? 'var(--accent,#7c6fff)' : 'transparent', color: '#fff', fontSize: 11, lineHeight: '13px', textAlign: 'center', flexShrink: 0 }}>{isSel ? '✓' : ''}</span>
                                {o.color && <span style={{ width: 9, height: 9, borderRadius: '50%', background: o.color, flexShrink: 0 }} />}
                                <span style={{ flex: 1 }}>{o.icon ? `${o.icon} ` : ''}{o.label}</span>
                              </div>
                            )
                          })}
                        </div>
                        {sel.length > 0 && (
                          <div style={{ borderTop: '1px solid var(--border)', padding: 6, textAlign: 'right' }}>
                            <button type="button" onClick={() => clearFacet(f.id)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 11.5, cursor: 'pointer' }}>Limpiar</button>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {f.type === 'range' && (() => {
                    const r = value[f.id] || { min: '', max: '' }
                    return (
                      <div style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="number" placeholder="mín" value={r.min ?? ''} onChange={e => set(f.id, { ...r, min: e.target.value })} style={{ ...dropInp, width: 90 }} />
                        <span style={{ color: 'var(--text3)' }}>—</span>
                        <input type="number" placeholder="máx" value={r.max ?? ''} onChange={e => set(f.id, { ...r, max: e.target.value })} style={{ ...dropInp, width: 90 }} />
                      </div>
                    )
                  })()}

                  {f.type === 'daterange' && (() => {
                    const r = value[f.id] || { from: '', to: '' }
                    return (
                      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontSize: 11, color: 'var(--text3)' }}>Desde<input type="date" value={r.from || ''} onChange={e => set(f.id, { ...r, from: e.target.value })} style={{ ...dropInp, marginTop: 3 }} /></label>
                        <label style={{ fontSize: 11, color: 'var(--text3)' }}>Hasta<input type="date" value={r.to || ''} onChange={e => set(f.id, { ...r, to: e.target.value })} style={{ ...dropInp, marginTop: 3 }} /></label>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )
        })}
        {totalActive > 0 && (
          <button type="button" onClick={clearAll} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
            Limpiar filtros
          </button>
        )}
        {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </div>

      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {chips.map(c => (
            <span key={c.key} style={chip}>
              {c.text}
              <button type="button" onClick={c.onX} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
