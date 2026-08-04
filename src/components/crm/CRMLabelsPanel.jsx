import { useState } from 'react'
import { useAccount } from '../../context/AccountContext'

// Editor de etiquetas del CRM. Movido desde Configuración → 🏷 CRM.
// Reusa account.labels + addLabel/deleteLabel del AccountContext, así que las
// etiquetas creadas aquí siguen apareciendo en el Inbox, filtros, etc.
const LABEL_COLORS = ['#ff5f5f', '#22d98a', '#f5a623', '#7c6fff', '#4fa8ff', '#ff6eb4', '#2dd4c8']

export default function CRMLabelsPanel() {
  const { account, addLabel, updateLabel, deleteLabel } = useAccount()
  const [nLabel, setNLabel] = useState({ name: '', color: LABEL_COLORS[0], description: '' })
  const [toast, setToast] = useState('')

  const labels = account?.labels || []

  function handleAdd(e) {
    e.preventDefault()
    if (!nLabel.name.trim()) return
    addLabel({ name: nLabel.name.trim(), color: nLabel.color, description: nLabel.description.trim() })
    setNLabel({ name: '', color: LABEL_COLORS[0], description: '' })
    setToast('Etiqueta creada ✓'); setTimeout(() => setToast(''), 2200)
  }

  const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, maxWidth: 560 }
  const inp = { padding: 9, fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 8, flex: 1, boxSizing: 'border-box' }
  const dot = c => ({ width: 12, height: 12, borderRadius: '50%', background: c, flexShrink: 0 })

  return (
    <div style={card}>
      <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>🏷 Etiquetas del CRM</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
        Crea etiquetas para clasificar conversaciones, contactos y tickets. La <strong>descripción</strong> explica
        cuándo aplicarlas: es lo que lee el asistente para etiquetar por su cuenta.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {labels.map(l => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8 }}>
            <span style={{ ...dot(l.color), marginTop: 4 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>{l.name}</div>
              <input
                defaultValue={l.description || ''}
                placeholder="¿Cuándo aplicarla? (lo usa la IA)"
                onBlur={e => { const v = e.target.value.trim(); if (v !== (l.description || '')) updateLabel(l.id, { name: l.name, color: l.color, description: v }) }}
                style={{ ...inp, padding: '4px 6px', fontSize: 11.5, marginTop: 3, width: '100%', flex: 'unset' }}
              />
            </div>
            <button
              onClick={() => deleteLabel(l.id)}
              title="Eliminar etiqueta"
              style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, marginTop: 2 }}
            >✕</button>
          </div>
        ))}
        {labels.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Sin etiquetas. Crea la primera abajo.</div>}
      </div>

      <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder="Nombre de la etiqueta..."
            value={nLabel.name}
            onChange={e => setNLabel(p => ({ ...p, name: e.target.value }))}
            style={inp}
          />
          <div style={{ display: 'flex', gap: 5 }}>
            {LABEL_COLORS.map(c => (
              <button key={c} type="button"
                onClick={() => setNLabel(p => ({ ...p, color: c }))}
                style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer', border: nLabel.color === c ? '2px solid var(--text)' : '2px solid transparent' }}
              />
            ))}
          </div>
          <button type="submit" style={{ padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: 'var(--accent)', color: '#fff' }}>+ Agregar</button>
        </div>
        <input
          placeholder="Descripción: cuándo aplicarla (p. ej. «cliente que ya compró alguna vez»)"
          value={nLabel.description}
          onChange={e => setNLabel(p => ({ ...p, description: e.target.value }))}
          style={{ ...inp, fontSize: 12 }}
        />
      </form>

      {toast && <div style={{ marginTop: 10, fontSize: 12.5, color: '#22d98a', fontWeight: 600 }}>{toast}</div>}
    </div>
  )
}
