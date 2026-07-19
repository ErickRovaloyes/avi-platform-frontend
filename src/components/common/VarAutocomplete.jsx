import { useRef, useState } from 'react'
import { SYSTEM_VARIABLES_FLAT } from '../../lib/systemVariables'

/**
 * Input / textarea con autocompletado de variables (sistema + locales). Al escribir "{"
 * o "{{" despliega la lista; Enter/Tab inserta {{nombre}}. Cuando el desplegable NO está
 * abierto, reenvía onKeyDown al padre (p. ej. Enter para enviar en el chat).
 *
 * props: value, onChange, variables[] (locales {id,name,description}), multiline, rows,
 *        className, placeholder, style, onKeyDown (passthrough), spellCheck, autoFocus
 */
export default function VarAutocomplete({
  value, onChange, variables = [], multiline = false, rows = 3,
  className, placeholder, style, wrapperStyle, onKeyDown, spellCheck, autoFocus, inputRef,
}) {
  const internalRef = useRef(null)
  const ref = inputRef || internalRef
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hi, setHi] = useState(0)

  const allVars = [
    ...SYSTEM_VARIABLES_FLAT,
    ...variables.map(v => ({ id: v.id || v.name, name: v.name || v.id, description: v.description })),
  ]
  const filtered = allVars.filter(v => v.name.toLowerCase().includes((query || '').toLowerCase())).slice(0, 8)

  function detectTrigger(el) {
    const before = String(el.value).slice(0, el.selectionStart)
    const m = before.match(/\{\{?([\w]*)$/)
    if (m) { setQuery(m[1] || ''); setHi(0); setOpen(true) } else setOpen(false)
  }
  function handleChange(e) { onChange(e.target.value); detectTrigger(e.target) }
  function insertVar(v) {
    const el = ref.current; if (!el) return
    const caret = el.selectionStart
    const before = String(value).slice(0, caret), after = String(value).slice(caret)
    const newBefore = before.replace(/\{\{?[\w]*$/, `{{${v.name}}}`)
    onChange(newBefore + after)
    setOpen(false)
    setTimeout(() => { el.focus(); el.setSelectionRange(newBefore.length, newBefore.length) }, 0)
  }
  function handleKeyDown(e) {
    if (open && filtered.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => (h + 1) % filtered.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => (h - 1 + filtered.length) % filtered.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertVar(filtered[hi]); return }
      if (e.key === 'Escape') { setOpen(false); return }
    }
    onKeyDown?.(e) // p. ej. Enter para enviar
  }

  const dropdown = {
    position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4, zIndex: 50,
    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
    boxShadow: '0 12px 30px rgba(0,0,0,.35)', maxHeight: 240, overflowY: 'auto',
  }
  const opt = active => ({
    display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', cursor: 'pointer',
    background: active ? 'var(--accent-dim, rgba(124,111,255,.18))' : 'transparent', border: 'none', color: 'var(--text)',
  })
  const inputProps = {
    ref, className, value: value ?? '', placeholder, spellCheck, autoFocus, style,
    onChange: handleChange, onKeyDown: handleKeyDown,
    onKeyUp: e => detectTrigger(e.target), onClick: e => detectTrigger(e.target),
    onBlur: () => setTimeout(() => setOpen(false), 150),
  }

  return (
    <div style={{ position: 'relative', width: '100%', ...wrapperStyle }}>
      {multiline ? <textarea {...inputProps} rows={rows} /> : <input {...inputProps} type="text" />}
      {open && filtered.length > 0 && (
        <div style={dropdown}>
          <div style={{ padding: '5px 10px', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Variables — Enter para insertar</div>
          {filtered.map((v, i) => (
            <button key={v.id} type="button" style={opt(i === hi)}
              onMouseDown={e => { e.preventDefault(); insertVar(v) }} onMouseEnter={() => setHi(i)}>
              <code style={{ fontSize: 12, color: 'var(--accent, #7c6fff)' }}>{`{{${v.name}}}`}</code>
              {v.description && <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>{v.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
