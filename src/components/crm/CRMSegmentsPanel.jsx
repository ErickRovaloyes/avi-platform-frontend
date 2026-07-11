import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { crmListSegments, crmCreateSegment, crmUpdateSegment, crmDeleteSegment, crmPreviewSegment } from '../../lib/storage'
import s from './CRMPanel.module.css'

// Segmentos dinámicos: listas vivas de contactos por reglas, reutilizables en campañas.
const emptyRules = { tagsAny: [], subscribedOnly: true, requirePhone: false, createdWithinDays: '', minOrders: '', minSpend: '', purchasedWithinDays: '', notPurchasedWithinDays: '' }

// Plantillas rápidas de segmentos comunes.
const TEMPLATES = [
  { name: 'Clientes recientes', rules: { purchasedWithinDays: 30, subscribedOnly: true } },
  { name: 'No han vuelto (60d+)', rules: { minOrders: 1, notPurchasedWithinDays: 60, subscribedOnly: true } },
  { name: 'Clientes frecuentes', rules: { minOrders: 3, subscribedOnly: true } },
  { name: 'Alto valor', rules: { minSpend: 500000, subscribedOnly: true } },
  { name: 'Contactos nuevos (7d)', rules: { createdWithinDays: 7, subscribedOnly: true } },
]

const inp = { padding: '7px 9px', fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 7, width: '100%', boxSizing: 'border-box' }
const btn = { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text1)', cursor: 'pointer', fontSize: 12.5 }
const btnPri = { ...btn, background: 'var(--accent,#4fa8ff)', color: '#fff', border: 'none', fontWeight: 700 }

function RuleField({ label, hint, children }) {
  return <div><label style={{ fontSize: 11.5, color: 'var(--text2)', fontWeight: 600 }}>{label}{hint && <span style={{ color: 'var(--text3)', fontWeight: 400 }}> · {hint}</span>}</label><div style={{ marginTop: 4 }}>{children}</div></div>
}

export default function CRMSegmentsPanel() {
  const { account } = useAccount()
  const [segments, setSegments] = useState([])
  const [editing, setEditing] = useState(null)   // { id?, name, rules }
  const [preview, setPreview] = useState(null)
  const [previewing, setPreviewing] = useState(false)

  async function load() { if (account?.id) setSegments(await crmListSegments(account.id).catch(() => [])) }
  useEffect(() => { load() }, [account?.id])

  function startNew() { setEditing({ name: '', rules: { ...emptyRules } }); setPreview(null) }
  function startEdit(seg) { setEditing({ id: seg.id, name: seg.name, rules: { ...emptyRules, ...seg.rules, tagsAny: seg.rules?.tagsAny || [] } }); setPreview(null) }

  function setRule(k, v) { setEditing(e => ({ ...e, rules: { ...e.rules, [k]: v } })) }

  function cleanRules(r) {
    const out = {}
    if (r.tagsAny?.length) out.tagsAny = r.tagsAny
    if (r.subscribedOnly) out.subscribedOnly = true
    if (r.requirePhone) out.requirePhone = true
    for (const k of ['createdWithinDays', 'minOrders', 'minSpend', 'purchasedWithinDays', 'notPurchasedWithinDays']) {
      const n = Number(r[k]); if (r[k] !== '' && Number.isFinite(n) && n > 0) out[k] = n
    }
    return out
  }

  async function runPreview() {
    if (!editing) return
    setPreviewing(true)
    try { setPreview(await crmPreviewSegment(account.id, cleanRules(editing.rules))) }
    catch (e) { setPreview({ error: e.message }) }
    setPreviewing(false)
  }

  async function save() {
    const payload = { name: editing.name.trim() || 'Segmento', rules: cleanRules(editing.rules) }
    if (editing.id) await crmUpdateSegment(account.id, editing.id, payload)
    else await crmCreateSegment(account.id, payload)
    setEditing(null); load()
  }
  async function remove(id) { if (!confirm('¿Eliminar este segmento?')) return; await crmDeleteSegment(account.id, id); load() }

  return (
    <div style={{ padding: '14px 4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Segmentos</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text3)' }}>Listas vivas de contactos por reglas. Úsalas al enviar masivos.</p>
        </div>
        {!editing && <button style={btnPri} onClick={startNew}>+ Nuevo segmento</button>}
      </div>

      {editing ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, maxWidth: 640 }}>
          <RuleField label="Nombre del segmento">
            <input style={inp} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Ej: Clientes que no han vuelto" />
          </RuleField>
          <div style={{ margin: '12px 0 8px', fontSize: 11.5, color: 'var(--text3)', fontWeight: 700 }}>PLANTILLAS RÁPIDAS</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {TEMPLATES.map(t => <button key={t.name} style={btn} onClick={() => setEditing(e => ({ ...e, name: e.name || t.name, rules: { ...emptyRules, ...t.rules } }))}>{t.name}</button>)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            <RuleField label="Etiquetas (cualquiera)" hint="separadas por coma">
              <input style={inp} value={(editing.rules.tagsAny || []).join(', ')} onChange={e => setRule('tagsAny', e.target.value.split(',').map(x => x.trim()).filter(Boolean))} placeholder="vip, mayorista" />
            </RuleField>
            <RuleField label="Creados hace ≤ (días)"><input style={inp} type="number" min="0" value={editing.rules.createdWithinDays} onChange={e => setRule('createdWithinDays', e.target.value)} placeholder="—" /></RuleField>
            <RuleField label="Compró hace ≤ (días)"><input style={inp} type="number" min="0" value={editing.rules.purchasedWithinDays} onChange={e => setRule('purchasedWithinDays', e.target.value)} placeholder="—" /></RuleField>
            <RuleField label="No compra hace ≥ (días)" hint="win-back"><input style={inp} type="number" min="0" value={editing.rules.notPurchasedWithinDays} onChange={e => setRule('notPurchasedWithinDays', e.target.value)} placeholder="—" /></RuleField>
            <RuleField label="Mínimo de pedidos"><input style={inp} type="number" min="0" value={editing.rules.minOrders} onChange={e => setRule('minOrders', e.target.value)} placeholder="—" /></RuleField>
            <RuleField label="Gasto mínimo ($)"><input style={inp} type="number" min="0" value={editing.rules.minSpend} onChange={e => setRule('minSpend', e.target.value)} placeholder="—" /></RuleField>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer' }}><input type="checkbox" checked={!!editing.rules.subscribedOnly} onChange={e => setRule('subscribedOnly', e.target.checked)} /> Solo suscritos (excluir bajas)</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer' }}><input type="checkbox" checked={!!editing.rules.requirePhone} onChange={e => setRule('requirePhone', e.target.checked)} /> Solo con teléfono</label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14, flexWrap: 'wrap' }}>
            <button style={btn} onClick={runPreview} disabled={previewing}>{previewing ? 'Calculando…' : '👁 Vista previa'}</button>
            {preview && !preview.error && <span style={{ fontSize: 13 }}><b>{preview.count}</b> contactos · {preview.withPhone} con teléfono</span>}
            {preview?.error && <span style={{ fontSize: 12, color: '#ff5f5f' }}>{preview.error}</span>}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button style={btn} onClick={() => setEditing(null)}>Cancelar</button>
              <button style={btnPri} onClick={save} disabled={!editing.name.trim()}>Guardar</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
          {segments.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13 }}>Sin segmentos. Crea uno para reutilizarlo en tus campañas.</div>}
          {segments.map(seg => (
            <div key={seg.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{seg.name}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={{ ...btn, padding: '3px 8px' }} onClick={() => startEdit(seg)}>✎</button>
                  <button style={{ ...btn, padding: '3px 8px', color: '#ff5f5f' }} onClick={() => remove(seg.id)}>🗑</button>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 6 }}>{describe(seg.rules)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function describe(r) {
  const parts = []
  if (r.tagsAny?.length) parts.push(`etiquetas: ${r.tagsAny.join('/')}`)
  if (r.createdWithinDays) parts.push(`nuevos ≤${r.createdWithinDays}d`)
  if (r.purchasedWithinDays) parts.push(`compró ≤${r.purchasedWithinDays}d`)
  if (r.notPurchasedWithinDays) parts.push(`sin comprar ≥${r.notPurchasedWithinDays}d`)
  if (r.minOrders) parts.push(`≥${r.minOrders} pedidos`)
  if (r.minSpend) parts.push(`gasto ≥${Number(r.minSpend).toLocaleString('es-CO')}`)
  if (r.subscribedOnly) parts.push('suscritos')
  return parts.length ? parts.join(' · ') : 'Todos los contactos'
}
