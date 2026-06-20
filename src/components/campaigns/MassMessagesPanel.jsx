import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { listCampaigns, previewCampaign, createCampaign, sendCampaign, cancelCampaign, deleteCampaign } from '../../lib/storage'

const STATUS = {
  draft:     { label: 'Borrador',   color: '#888' },
  scheduled: { label: 'Programada', color: '#4fa8ff' },
  sending:   { label: 'Enviando…',  color: '#f5a623' },
  done:      { label: 'Enviada',    color: '#22d98a' },
  cancelled: { label: 'Cancelada',  color: '#ff5f5f' },
}
const fmt = ts => ts ? new Date(Number(ts)).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export default function MassMessagesPanel() {
  const { account, selectedAgent } = useAccount()
  const accId = account?.id
  const flows = account?.flows || []
  const [rows, setRows] = useState([])
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')
  const [flowId, setFlowId] = useState('')
  const [tags, setTags] = useState('')
  const [schedule, setSchedule] = useState('')
  const [count, setCount] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function reload() { if (accId) try { setRows(await listCampaigns(accId)) } catch { setRows([]) } }
  useEffect(() => { reload() }, [accId]) // eslint-disable-line

  const audience = () => ({ tags: tags.split(',').map(t => t.trim()).filter(Boolean) })

  // Previsualiza el tamaño de la audiencia cuando cambian las etiquetas.
  useEffect(() => {
    if (!accId || !show) return
    let alive = true
    previewCampaign(accId, audience()).then(r => { if (alive) setCount(r?.count ?? 0) }).catch(() => {})
    return () => { alive = false }
  }, [tags, show, accId]) // eslint-disable-line

  async function create(sendNow) {
    setErr('')
    if (!name.trim()) { setErr('Ponle un nombre a la campaña'); return }
    if (!flowId) { setErr('Elige el flujo que se enviará (debe contener la plantilla)'); return }
    if (!selectedAgent) { setErr('Selecciona un agente'); return }
    const scheduledAt = (!sendNow && schedule) ? new Date(schedule).getTime() : null
    setBusy(true)
    try {
      const r = await createCampaign(accId, { name: name.trim(), agentId: selectedAgent.id, flowId, audience: audience(), scheduledAt })
      if (sendNow) { try { await sendCampaign(accId, r.id) } catch (e) { setErr('Creada, pero no se pudo iniciar: ' + e.message) } }
      setName(''); setFlowId(''); setTags(''); setSchedule(''); setShow(false)
      reload()
    } catch (e) { setErr(e?.message || 'No se pudo crear') }
    setBusy(false)
  }

  async function doSend(c) {
    if (!confirm(`¿Enviar la campaña "${c.name}" ahora? Se ejecutará el flujo para cada contacto de la audiencia.`)) return
    try { await sendCampaign(accId, c.id); reload() } catch (e) { alert(e?.message || 'No se pudo enviar') }
  }
  async function doCancel(c) { try { await cancelCampaign(accId, c.id); reload() } catch (e) { alert(e.message) } }
  async function doDelete(c) { if (confirm(`¿Eliminar "${c.name}"?`)) { try { await deleteCampaign(accId, c.id); reload() } catch (e) { alert(e.message) } } }

  const inp = { padding: '9px 11px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', fontSize: 13, width: '100%', boxSizing: 'border-box' }
  const field = { display: 'flex', flexDirection: 'column', gap: 4 }
  const lbl = { fontSize: 12, color: 'var(--text2)', fontWeight: 500 }
  const btn = (bg) => ({ padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: bg, color: '#fff', fontSize: 13, fontWeight: 600 })

  return (
    <div style={{ padding: 22, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>📣 Mensajes masivos</h2>
        <button style={btn('linear-gradient(135deg,var(--accent),var(--accent2))')} onClick={() => setShow(v => !v)}>{show ? '✕ Cerrar' : '+ Nueva campaña'}</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, maxWidth: 720 }}>
        Una campaña ejecuta un <strong>flujo</strong> sobre la audiencia filtrada. El flujo debe contener el nodo
        <strong> “Enviar plantilla WhatsApp”</strong> (la plantilla aprobada es el mensaje masivo). Puedes enviarla ya o programarla.
      </p>

      {show && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 12, padding: 16, margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
          <div style={field}><label style={lbl}>Nombre de la campaña</label>
            <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Promo noviembre" /></div>
          <div style={field}><label style={lbl}>Canal</label>
            <input style={{ ...inp, opacity: .7 }} value="WhatsApp" disabled /></div>
          <div style={field}><label style={lbl}>Flujo a ejecutar (contiene la plantilla)</label>
            <select style={inp} value={flowId} onChange={e => setFlowId(e.target.value)}>
              <option value="">— elegir flujo —</option>
              {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {flows.length === 0 && <span style={{ fontSize: 11, color: 'var(--amber)' }}>No hay flujos. Crea uno con el nodo “Enviar plantilla WhatsApp”.</span>}
          </div>
          <div style={field}><label style={lbl}>Audiencia · etiquetas de contacto (coma; vacío = todos con teléfono)</label>
            <input style={inp} value={tags} onChange={e => setTags(e.target.value)} placeholder="cliente, vip" />
            <span style={{ fontSize: 12, color: 'var(--accent)' }}>👥 {count == null ? '…' : count} contacto(s) coinciden</span>
          </div>
          <div style={field}><label style={lbl}>Programar para (opcional; vacío = enviar manualmente)</label>
            <input type="datetime-local" style={inp} value={schedule} onChange={e => setSchedule(e.target.value)} /></div>
          {err && <div style={{ fontSize: 12, color: 'var(--amber)', background: 'var(--amber-dim)', borderRadius: 7, padding: '7px 10px' }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button style={btn('var(--bg3)')} disabled={busy} onClick={() => create(false)}>{schedule ? 'Programar' : 'Guardar borrador'}</button>
            {!schedule && <button style={btn('var(--green)')} disabled={busy} onClick={() => create(true)}>🚀 Crear y enviar ya</button>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, maxWidth: 860 }}>
        {rows.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)', padding: 20, textAlign: 'center', border: '1px dashed var(--border2)', borderRadius: 12 }}>Sin campañas todavía.</div>}
        {rows.map(c => {
          const st = STATUS[c.status] || STATUS.draft
          const flow = flows.find(f => f.id === c.flowId)
          return (
            <div key={c.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  ⚡ {flow?.name || c.flowId} · 🏷 {(c.audience?.tags?.length ? c.audience.tags.join(', ') : 'todos')}
                  {c.scheduledAt ? ` · ⏰ ${fmt(c.scheduledAt)}` : ''}
                  {c.stats ? ` · ✓ ${c.stats.sent}/${c.stats.total}${c.stats.failed ? ` · ✗ ${c.stats.failed}` : ''}` : ''}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, color: st.color, background: st.color + '22' }}>{st.label}</span>
              {['draft', 'scheduled'].includes(c.status) && <button style={btn('var(--green)')} onClick={() => doSend(c)}>Enviar ya</button>}
              {['draft', 'scheduled'].includes(c.status) && <button style={{ ...btn('transparent'), color: 'var(--text2)', border: '1px solid var(--border2)' }} onClick={() => doCancel(c)}>Cancelar</button>}
              <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 15 }} title="Eliminar" onClick={() => doDelete(c)}>🗑</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
