import { useState, useMemo, useEffect, useRef } from 'react'
import { listCategories, listByCategory } from '../../lib/flowNodes'
import s from './NodePicker.module.css'

/**
 * Modal picker with sidebar of categories + searchable grid of nodes.
 * Replaces the old inline horizontal strip.
 */
export default function NodePicker({ onPick, onClose }) {
  const categories = listCategories()
  const [activeCat, setActiveCat] = useState(categories[0]?.id || 'conversation')
  const [search, setSearch]       = useState('')
  const searchRef = useRef(null)

  useEffect(() => { searchRef.current?.focus() }, [])

  // When the user types, switch to "all categories" mode to surface every match.
  const visibleNodes = useMemo(() => {
    if (search.trim()) {
      const q = search.toLowerCase()
      const allCats = categories.map(c => c.id)
      return allCats.flatMap(cid => listByCategory(cid))
        .filter(n =>
          (n.label || '').toLowerCase().includes(q) ||
          (n.description || '').toLowerCase().includes(q) ||
          (n.type || '').toLowerCase().includes(q)
        )
    }
    return listByCategory(activeCat)
  }, [search, activeCat])

  return (
    <div className={s.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.header}>
          <h3 className={s.title}>Agregar nodo</h3>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={s.searchRow}>
          <input
            ref={searchRef}
            className={s.search}
            placeholder="🔍 Buscar nodo por nombre, descripción o tipo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className={s.body}>
          {!search && (
            <aside className={s.sidebar}>
              {categories.map(c => (
                <button
                  key={c.id}
                  className={`${s.catBtn} ${c.id === activeCat ? s.catBtnActive : ''}`}
                  style={{ '--cat-color': c.color }}
                  onClick={() => setActiveCat(c.id)}
                >
                  <span className={s.catIcon}>{c.icon}</span>
                  <span className={s.catLabel}>{c.label}</span>
                  <span className={s.catCount}>{listByCategory(c.id).length}</span>
                </button>
              ))}
            </aside>
          )}

          <div className={s.grid}>
            {visibleNodes.length === 0 && (
              <div className={s.empty}>Sin nodos que coincidan con "{search}"</div>
            )}
            {visibleNodes.map(n => (
              <button
                key={n.type}
                className={`${s.card} ${n.stub ? s.cardStub : ''}`}
                style={{ '--node-color': n.color }}
                onClick={() => { onPick(n.type); onClose() }}
                title={n.description}
              >
                <div className={s.cardHdr}>
                  <span className={s.cardIcon}>{n.icon}</span>
                  <span className={s.cardLabel}>{n.label}</span>
                  {n.stub && <span className={s.cardStubBadge}>próx</span>}
                </div>
                <p className={s.cardDesc}>{n.description}</p>
                <code className={s.cardType}>{n.type}</code>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
