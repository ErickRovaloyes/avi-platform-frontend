import { useEffect, useState, useRef } from 'react'
import { listCategories, listByCategory, getNode } from '../../lib/flowNodes'
import s from './CanvasContextMenu.module.css'

/**
 * Right-click menu that floats over the canvas at (x, y).
 * Two zones:
 *   - "Nodos rápidos": atajos a los nodos más usados.
 *   - "Por categoría":   submenús lazily expandidos.
 *
 * Props:
 *   x, y         — screen coords for positioning
 *   canvasPos    — {x, y} pos within the canvas (where the node should be placed)
 *   onPick(type, canvasPos)
 *   onClose()
 */
const QUICK_NODES = [
  'send_message',
  'ai_chat',
  'if',
  'http_request',
  'memory_set',
  'wait',
  'request_answer',
  'custom_code',
]

export default function CanvasContextMenu({ x, y, canvasPos, onPick, onClose }) {
  const categories = listCategories()
  const [openCat, setOpenCat] = useState(null)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  // Close on outside click or Escape
  useEffect(() => {
    function onDocDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDocDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  function pick(type) { onPick(type, canvasPos); onClose() }

  // Build search results across all categories
  const searchResults = search.trim()
    ? categories.flatMap(c => listByCategory(c.id)).filter(n => {
        const q = search.toLowerCase()
        return (n.label || '').toLowerCase().includes(q) ||
               (n.description || '').toLowerCase().includes(q) ||
               (n.type || '').toLowerCase().includes(q)
      }).slice(0, 12)
    : null

  return (
    <div
      ref={ref}
      className={s.menu}
      style={{ left: x, top: y }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className={s.searchRow}>
        <input
          autoFocus
          className={s.search}
          value={search}
          placeholder="🔍 Buscar nodo…"
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Search results ─────────────────────────────────────────────────── */}
      {searchResults && (
        <div className={s.section}>
          {searchResults.length === 0 ? (
            <div className={s.empty}>Sin resultados</div>
          ) : (
            searchResults.map(n => (
              <button key={n.type} className={s.item} onClick={() => pick(n.type)}>
                <span className={s.itemIcon} style={{ color: n.color }}>{n.icon}</span>
                <span className={s.itemLabel}>{n.label}</span>
                <code className={s.itemType}>{n.type}</code>
              </button>
            ))
          )}
        </div>
      )}

      {/* Quick nodes ─────────────────────────────────────────────────────── */}
      {!searchResults && (
        <>
          <div className={s.section}>
            <div className={s.sectionTitle}>⚡ Nodos rápidos</div>
            <div className={s.quickGrid}>
              {QUICK_NODES.map(t => {
                const def = getNode(t)
                if (!def) return null
                return (
                  <button
                    key={t}
                    className={s.quickBtn}
                    style={{ '--c': def.color }}
                    onClick={() => pick(t)}
                    title={def.description}
                  >
                    <span className={s.quickIcon}>{def.icon}</span>
                    <span className={s.quickLabel}>{def.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Categories ──────────────────────────────────────────────────── */}
          <div className={s.divider} />
          <div className={s.section}>
            <div className={s.sectionTitle}>📂 Por categoría</div>
            {categories.map(c => {
              const isOpen = openCat === c.id
              const nodes = isOpen ? listByCategory(c.id) : null
              return (
                <div key={c.id} className={s.catBlock}>
                  <button
                    className={`${s.catRow} ${isOpen ? s.catRowOpen : ''}`}
                    style={{ '--c': c.color }}
                    onClick={() => setOpenCat(isOpen ? null : c.id)}
                  >
                    <span className={s.catIcon}>{c.icon}</span>
                    <span className={s.catLabel}>{c.label}</span>
                    <span className={s.catCount}>{listByCategory(c.id).length}</span>
                    <span className={s.caret}>{isOpen ? '▾' : '▸'}</span>
                  </button>
                  {isOpen && (
                    <div className={s.catNodes}>
                      {nodes.map(n => (
                        <button key={n.type} className={s.item} onClick={() => pick(n.type)}>
                          <span className={s.itemIcon} style={{ color: n.color }}>{n.icon}</span>
                          <span className={s.itemLabel}>{n.label}</span>
                          {n.stub && <span className={s.stubMini}>próx</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
