import { useState, useRef, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'

/**
 * Selector de etiquetas del CRM (las de Zona CRM → Etiquetas), con color y buscador.
 *
 * El valor son NOMBRES de etiqueta (no ids) porque así lo guardan las tarjetas del
 * pipeline desde siempre: mantiene compatibles los tickets antiguos y el filtro del
 * tablero, que agrupa por el texto de la etiqueta.
 *
 * Las etiquetas que un ticket ya tenía y que no existen en el CRM se siguen mostrando
 * (chip gris) y se pueden quitar, pero no se pierden solas.
 */
export default function LabelPicker({ value = [], onChange, placeholder = 'Sin etiquetas' }) {
  const { account, addLabel } = useAccount()
  const labels = account?.labels || []
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (!boxRef.current?.contains(e.target)) { setOpen(false); setQ('') } }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selected = Array.isArray(value) ? value : []
  const colorOf = name => labels.find(l => l.name === name)?.color || null
  const toggle = name => onChange(selected.includes(name) ? selected.filter(x => x !== name) : [...selected, name])

  const filtered = labels.filter(l => !q.trim() || l.name.toLowerCase().includes(q.trim().toLowerCase()))
  // Permite crear la etiqueta que se está buscando si aún no existe.
  const canCreate = q.trim() && !labels.some(l => l.name.toLowerCase() === q.trim().toLowerCase())

  async function createAndPick() {
    const name = q.trim()
    if (!name || creating) return
    setCreating(true)
    try { await addLabel({ name, color: '#7c6fff' }) } catch { /* si falla, al menos se aplica al ticket */ }
    if (!selected.includes(name)) onChange([...selected, name])
    setQ(''); setCreating(false)
  }

  const chip = (name) => {
    const c = colorOf(name)
    return (
      <span key={name} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: '2px 8px', borderRadius: 999,
        background: c ? c + '22' : 'var(--bg3)', color: c || 'var(--text2)',
        border: `1px solid ${c ? c + '55' : 'var(--border2)'}`,
      }}>
        {name}
        <button onClick={e => { e.stopPropagation(); toggle(name) }} title="Quitar"
          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0, opacity: .7 }}>×</button>
      </span>
    )
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <div onClick={() => setOpen(v => !v)} title="Elegir etiquetas"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minHeight: 34, cursor: 'pointer',
          padding: '5px 8px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8,
        }}>
        {selected.length === 0
          ? <span style={{ fontSize: 12.5, color: 'var(--text3)' }}>{placeholder}</span>
          : selected.map(chip)}
        <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: 11 }}>▾</span>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4,
          background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,.35)', maxHeight: 260, overflowY: 'auto', padding: 6,
        }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar o crear…"
            onKeyDown={e => { if (e.key === 'Enter' && canCreate) { e.preventDefault(); createAndPick() } }}
            style={{ width: '100%', padding: '6px 8px', fontSize: 12.5, marginBottom: 6, boxSizing: 'border-box',
              background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 7, color: 'var(--text)' }} />

          {filtered.length === 0 && !canCreate && (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: '6px 8px' }}>
              No hay etiquetas. Créalas en Zona CRM → Etiquetas.
            </div>
          )}

          {filtered.map(l => {
            const on = selected.includes(l.name)
            return (
              <button key={l.id} onClick={() => toggle(l.name)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer',
                  padding: '6px 8px', borderRadius: 7, border: 'none', fontSize: 12.5,
                  background: on ? 'var(--accent-dim, rgba(124,111,255,.16))' : 'transparent', color: 'var(--text)',
                }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: l.color || '#888', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  {l.name}
                  {l.description && <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text3)' }}>{l.description}</span>}
                </span>
                {on && <span style={{ color: 'var(--accent,#7c6fff)' }}>✓</span>}
              </button>
            )
          })}

          {canCreate && (
            <button onClick={createAndPick} disabled={creating}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: '6px 8px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--accent,#7c6fff)', fontSize: 12.5, fontWeight: 600 }}>
              ＋ Crear «{q.trim()}»
            </button>
          )}
        </div>
      )}
    </div>
  )
}
