import { useState, useEffect } from 'react'
import { listFlowTemplates, deleteFlowTemplate, updateFlowTemplate } from '../../lib/storage'

/**
 * Biblioteca GLOBAL de plantillas de flujos (Super Panel).
 *
 * Aquí se ven, renombran y borran. PUBLICAR se hace desde la pestaña Flujos de una cuenta,
 * porque una plantilla se crea copiando un flujo que ya existe.
 */
export default function FlowTemplatesPanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)   // { id, name, description, category }
  const [msg, setMsg] = useState('')

  async function load() {
    setLoading(true)
    try { setRows(await listFlowTemplates() || []) } catch { setRows([]) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  async function remove(t) {
    if (!confirm(`¿Eliminar la plantilla "${t.name}"? Las cuentas que ya la instalaron conservan su flujo.`)) return
    setRows(rs => rs.filter(x => x.id !== t.id))
    try { await deleteFlowTemplate(t.id); flash('Plantilla eliminada ✓') } catch (e) { flash('Error: ' + e.message); load() }
  }

  async function saveEdit() {
    const e = editing
    if (!e?.name?.trim()) return
    try {
      await updateFlowTemplate(e.id, { name: e.name.trim(), description: e.description || '', category: e.category || '' })
      setEditing(null); flash('Plantilla actualizada ✓'); load()
    } catch (err) { flash('Error: ' + err.message) }
  }

  const filtered = rows.filter(t => {
    const s = q.trim().toLowerCase()
    if (!s) return true
    return [t.name, t.description, t.category].some(v => String(v || '').toLowerCase().includes(s))
  })
  // Agrupadas por categoría, como se ven al instalarlas.
  const groups = [...new Set(filtered.map(t => t.category || 'Sin categoría'))].sort()

  const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 10 }
  const inp = { padding: '8px 10px', fontSize: 13, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 8, boxSizing: 'border-box' }
  const btn = (bg, c = '#fff') => ({ padding: '7px 13px', borderRadius: 8, border: 'none', cursor: 'pointer', background: bg, color: c, fontSize: 12.5, fontWeight: 600 })

  return (
    <div style={{ padding: 28, maxWidth: 900, overflowY: 'auto' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>🧩 Plantillas de flujos</h1>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>
          Biblioteca global: cualquier cuenta puede instalarlas desde su pestaña <strong>Flujos → 📥 Usar plantilla</strong>.
          Para <strong>crear</strong> una, entra a una cuenta, abre Flujos y pulsa <strong>📤</strong> en el flujo que quieras publicar.
        </p>
      </div>

      <input style={{ ...inp, width: '100%', marginBottom: 12 }} value={q} onChange={e => setQ(e.target.value)}
        placeholder="🔍 Buscar plantilla…" />

      {msg && <div style={{ fontSize: 12.5, color: '#22d98a', fontWeight: 600, marginBottom: 10 }}>{msg}</div>}

      {loading ? <div style={{ fontSize: 13, color: 'var(--text3)' }}>Cargando…</div>
        : rows.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: 26 }}>
            Todavía no hay plantillas publicadas.<br />
            Entra a una cuenta → <strong>Flujos</strong> → pulsa <strong>📤</strong> en el flujo que quieras convertir en plantilla.
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Sin resultados para «{q}».</div>
        ) : groups.map(g => (
          <div key={g} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{g}</div>
            {filtered.filter(t => (t.category || 'Sin categoría') === g).map(t => (
              <div key={t.id} style={card}>
                {editing?.id === t.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input style={inp} value={editing.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} placeholder="Nombre" />
                    <input style={inp} value={editing.category} onChange={e => setEditing(p => ({ ...p, category: e.target.value }))} placeholder="Categoría" />
                    <textarea style={{ ...inp, minHeight: 60, fontFamily: 'inherit', resize: 'vertical' }}
                      value={editing.description} onChange={e => setEditing(p => ({ ...p, description: e.target.value }))} placeholder="Descripción" />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button style={{ ...btn('transparent', 'var(--text2)'), border: '1px solid var(--border2)' }} onClick={() => setEditing(null)}>Cancelar</button>
                      <button style={btn('var(--accent)')} onClick={saveEdit}>Guardar</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{t.name}</div>
                      {t.description && <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 3 }}>{t.description}</div>}
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>
                        {t.nodeCount} nodo{t.nodeCount === 1 ? '' : 's'} · disparador: {t.trigger || 'manual'}
                        {t.createdAt ? ` · ${new Date(Number(t.createdAt)).toLocaleDateString('es')}` : ''}
                      </div>
                    </div>
                    <button style={{ ...btn('transparent', 'var(--text)'), border: '1px solid var(--border2)' }}
                      onClick={() => setEditing({ id: t.id, name: t.name, description: t.description || '', category: t.category || '' })}>✎ Editar</button>
                    <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }}
                      title="Eliminar plantilla" onClick={() => remove(t)}>🗑</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
    </div>
  )
}
