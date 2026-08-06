import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { listCampaigns, previewCampaign, createCampaign, updateCampaign, sendCampaign, resendCampaign, cancelCampaign, deleteCampaign, crmListSegments, crmCreateSegment, campaignRoi, campaignAb, campaignBestTime } from '../../lib/storage'

const WD = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const hourLabel = h => `${String(h % 24).padStart(2, '0')}:00`

const STATUS = {
  draft:     { label: 'Borrador',   color: '#888' },
  scheduled: { label: 'Programada', color: '#4fa8ff' },
  sending:   { label: 'Enviando…',  color: '#f5a623' },
  done:      { label: 'Enviada',    color: '#22d98a' },
  cancelled: { label: 'Cancelada',  color: '#ff5f5f' },
}
const fmt = ts => ts ? new Date(Number(ts)).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const toLocalInput = ts => {
  if (!ts) return ''
  const d = new Date(Number(ts) - new Date().getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}

// Una métrica de la campaña (entregados, leídos, etc.)
function Metric({ icon, label, value, color, title }) {
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color, background: color + '18', border: '1px solid ' + color + '40', borderRadius: 20, padding: '2px 9px' }}>
      {icon} {value} <span style={{ color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
    </span>
  )
}

export default function MassMessagesPanel() {
  const { account, selectedAgent } = useAccount()
  const accId = account?.id
  const flows = account?.flows || []
  const [rows, setRows] = useState([])
  const [show, setShow] = useState(false)
  const [editId, setEditId] = useState(null)        // id de la campaña en edición
  const [name, setName] = useState('')
  const [flowId, setFlowId] = useState('')
  const [variantFlowId, setVariantFlowId] = useState('')  // flujo B para A/B (vacío = sin A/B)
  const [abSplit, setAbSplit] = useState(50)
  const [segmentId, setSegmentId] = useState('')
  const [segments, setSegments] = useState([])
  const [rules, setRules] = useState({})            // filtro a medida (mismo vocabulario que un segmento)
  const [excludeIds, setExcludeIds] = useState([])  // desmarcados en la lista
  const [frozen, setFrozen] = useState(false)       // true → se guarda la lista fija (contactIds)
  const [preview, setPreview] = useState(null)      // { count, contacts, truncated }
  const [schedule, setSchedule] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function reload() { if (accId) try { setRows(await listCampaigns(accId)) } catch { setRows([]) } }
  useEffect(() => { reload() }, [accId]) // eslint-disable-line
  useEffect(() => { if (accId) crmListSegments(accId).then(setSegments).catch(() => setSegments([])) }, [accId]) // eslint-disable-line

  // Refresca al recibir cambios (los webhooks de estado actualizan métricas).
  useEffect(() => {
    if (!accId) return
    const onUpd = () => reload()
    window.addEventListener('focus', onUpd)
    const id = setInterval(reload, 20000) // refresco suave de métricas en vivo
    return () => { window.removeEventListener('focus', onUpd); clearInterval(id) }
  }, [accId]) // eslint-disable-line

  // La BASE de la audiencia (segmento guardado o filtro a medida), sin los desmarcados.
  // Se separa de `audience()` para poder previsualizar la lista completa y tachar encima
  // los quitados, en vez de pedir al servidor una lista ya recortada.
  const baseAudience = () => (segmentId ? { segmentId } : { rules })

  // La audiencia que se GUARDA. Con `frozen` se congela la lista tal cual está ahora; si no,
  // queda dinámica: una campaña programada alcanzará también a quien entre mientras tanto.
  const audience = () => {
    const base = baseAudience()
    if (frozen) return { ...base, contactIds: selectedIds }
    return { ...base, excludeIds }
  }

  // Previsualiza cuando cambia el filtro. Devuelve la lista, no solo el número.
  useEffect(() => {
    if (!accId || !show) return
    let alive = true
    previewCampaign(accId, baseAudience()).then(r => { if (alive) setPreview(r || { count: 0, contacts: [] }) }).catch(() => {})
    return () => { alive = false }
  }, [JSON.stringify(rules), segmentId, show, accId]) // eslint-disable-line

  const previewList = preview?.contacts || []
  const selectedIds = previewList.map(c => c.id).filter(id => !excludeIds.includes(id))
  // Los desmarcados solo se pueden contar sobre lo que se ha traído. Si la lista venía
  // recortada, el total real lo dice el servidor y no se puede restar a ciegas.
  const finalCount = preview
    ? (preview.truncated ? Math.max(0, preview.count - excludeIds.length) : selectedIds.length)
    : null

  // Guarda el filtro a medida como segmento del CRM, para reutilizarlo sin rehacerlo.
  async function saveAsSegment() {
    const nombre = prompt('Nombre del segmento:', name.trim() || 'Segmento de campaña')
    if (!nombre || !nombre.trim()) return
    try {
      const seg = await crmCreateSegment(accId, { name: nombre.trim(), rules })
      setSegments(await crmListSegments(accId).catch(() => segments))
      // Se deja seleccionado: lo que se acaba de guardar es lo que se va a usar.
      if (seg?.id) { setSegmentId(seg.id); setRules({}) }
    } catch (e) { setErr(e?.message || 'No se pudo guardar el segmento') }
  }

  function resetForm() {
    setName(''); setFlowId(''); setVariantFlowId(''); setAbSplit(50)
    setSegmentId(''); setRules({}); setExcludeIds([]); setFrozen(false); setPreview(null)
    setSchedule(''); setEditId(null); setErr('')
  }

  function startNew() { resetForm(); setShow(s => !s) }
  function startEdit(c) {
    setEditId(c.id)
    setName(c.name || '')
    setFlowId(c.flowId || '')
    setVariantFlowId(c.variantFlowId || '')
    setAbSplit(c.abSplit || 50)
    setSegmentId(c.audience?.segmentId || '')
    // `tags` sueltas es el formato antiguo: se sube a `rules.tagsAny` al abrir la campaña,
    // así se edita con los mismos controles que todo lo demás.
    const legacy = (c.audience?.tags || []).filter(Boolean)
    setRules({ ...(c.audience?.rules || {}), ...(legacy.length ? { tagsAny: legacy } : {}) })
    setExcludeIds(c.audience?.excludeIds || [])
    setFrozen(!!(c.audience?.contactIds || []).length)
    setPreview(null)
    setSchedule(c.scheduledAt ? toLocalInput(c.scheduledAt) : '')
    setErr(''); setShow(true)
  }

  async function submit(sendNow) {
    setErr('')
    if (!name.trim()) { setErr('Ponle un nombre a la campaña'); return }
    if (!flowId) { setErr('Elige el flujo que se enviará (debe contener la plantilla)'); return }
    if (variantFlowId && variantFlowId === flowId) { setErr('La variante B debe ser un flujo distinto al A'); return }
    if (!editId && !selectedAgent) { setErr('Selecciona un agente'); return }
    const scheduledAt = (!sendNow && schedule) ? new Date(schedule).getTime() : null
    const ab = { variantFlowId: variantFlowId || null, abSplit: variantFlowId ? Number(abSplit) : null }
    setBusy(true)
    try {
      if (editId) {
        await updateCampaign(accId, editId, { name: name.trim(), flowId, audience: audience(), scheduledAt, ...ab })
        if (sendNow) { try { await sendCampaign(accId, editId) } catch (e) { setErr('Guardada, pero no se pudo iniciar: ' + e.message) } }
      } else {
        const r = await createCampaign(accId, { name: name.trim(), agentId: selectedAgent.id, flowId, audience: audience(), scheduledAt, ...ab })
        if (sendNow) { try { await sendCampaign(accId, r.id) } catch (e) { setErr('Creada, pero no se pudo iniciar: ' + e.message) } }
      }
      resetForm(); setShow(false); reload()
    } catch (e) { setErr(e?.message || 'No se pudo guardar') }
    setBusy(false)
  }

  async function doSend(c) {
    if (!confirm(`¿Enviar la campaña "${c.name}" ahora? Se ejecutará el flujo para cada contacto de la audiencia.`)) return
    try { await sendCampaign(accId, c.id); reload() } catch (e) { alert(e?.message || 'No se pudo enviar') }
  }
  async function doResend(c) {
    if (!confirm(`¿Reenviar "${c.name}"? Se creará una copia y se enviará ahora a la audiencia.`)) return
    try { await resendCampaign(accId, c.id); reload() } catch (e) { alert(e?.message || 'No se pudo reenviar') }
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
        <button style={btn('linear-gradient(135deg,var(--accent),var(--accent2))')} onClick={startNew}>{show && !editId ? '✕ Cerrar' : '+ Nueva campaña'}</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, maxWidth: 720 }}>
        Una campaña ejecuta un <strong>flujo</strong> sobre la audiencia filtrada. El flujo debe contener el nodo
        <strong> “Enviar plantilla WhatsApp”</strong> (la plantilla aprobada es el mensaje masivo). Puedes enviarla ya o programarla.
      </p>

      <BestTime accId={accId} onPick={ts => { setShow(true); setSchedule(toLocalInput(ts)) }} />

      {show && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 12, padding: 16, margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
          {editId && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>✎ Editando campaña</div>}
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

          {/* Prueba A/B: flujo variante B + reparto de la audiencia */}
          <div style={{ border: '1px solid var(--border2)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg3)' }}>
            <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700 }}>
              <input type="checkbox" checked={!!variantFlowId} onChange={e => setVariantFlowId(e.target.checked ? (flows.find(f => f.id !== flowId)?.id || '') : '')} />
              🧪 Prueba A/B <span style={{ fontWeight: 400, color: 'var(--text3)' }}>· compara dos mensajes y mide cuál convierte más</span>
            </label>
            {variantFlowId && (
              <>
                <div style={field}><label style={lbl}>Flujo variante B (mensaje alternativo)</label>
                  <select style={inp} value={variantFlowId} onChange={e => setVariantFlowId(e.target.value)}>
                    <option value="">— elegir flujo B —</option>
                    {flows.filter(f => f.id !== flowId).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div style={field}>
                  <label style={lbl}>Reparto de la audiencia · A {100 - abSplit}% / B {abSplit}%</label>
                  <input type="range" min={5} max={95} step={5} value={abSplit} onChange={e => setAbSplit(Number(e.target.value))} style={{ width: '100%' }} />
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>Cada contacto recibe A o B al azar según este reparto. Tras el envío verás qué variante ganó.</span>
                </div>
              </>
            )}
          </div>

          <AudiencePicker
            account={account} segments={segments}
            segmentId={segmentId} setSegmentId={setSegmentId}
            rules={rules} setRules={setRules}
            preview={preview} previewList={previewList}
            excludeIds={excludeIds} setExcludeIds={setExcludeIds}
            frozen={frozen} setFrozen={setFrozen}
            finalCount={finalCount} selectedIds={selectedIds}
            onSaveSegment={saveAsSegment}
          />

          <div style={field}><label style={lbl}>Programar para (opcional; vacío = enviar manualmente)</label>
            <input type="datetime-local" style={inp} value={schedule} onChange={e => setSchedule(e.target.value)} /></div>
          {err && <div style={{ fontSize: 12, color: 'var(--amber)', background: 'var(--amber-dim)', borderRadius: 7, padding: '7px 10px' }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {editId && <button style={{ ...btn('transparent'), color: 'var(--text2)', border: '1px solid var(--border2)' }} disabled={busy} onClick={() => { resetForm(); setShow(false) }}>Cancelar</button>}
            <button style={btn('var(--bg3)')} disabled={busy} onClick={() => submit(false)}>{schedule ? 'Programar' : (editId ? 'Guardar' : 'Guardar borrador')}</button>
            {!schedule && <button style={btn('var(--green)')} disabled={busy} onClick={() => submit(true)}>🚀 {editId ? 'Guardar y enviar ya' : 'Crear y enviar ya'}</button>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, maxWidth: 920 }}>
        {rows.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)', padding: 20, textAlign: 'center', border: '1px dashed var(--border2)', borderRadius: 12 }}>Sin campañas todavía.</div>}
        {rows.map(c => {
          const st = STATUS[c.status] || STATUS.draft
          const flow = flows.find(f => f.id === c.flowId)
          const s = c.stats || null
          const showMetrics = s && ['done', 'sending'].includes(c.status)
          return (
            <div key={c.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    ⚡ {flow?.name || c.flowId} · 🏷 {(c.audience?.tags?.length ? c.audience.tags.join(', ') : 'todos')}
                    {c.hasAb ? ' · 🧪 A/B' : ''}
                    {c.scheduledAt ? ` · ⏰ ${fmt(c.scheduledAt)}` : ''}
                    {c.sentAt ? ` · 📤 ${fmt(c.sentAt)}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, color: st.color, background: st.color + '22' }}>{st.label}</span>
                {['draft', 'scheduled'].includes(c.status) && <button style={btn('transparent')} title="Editar" onClick={() => startEdit(c)}>✎ Editar</button>}
                {['draft', 'scheduled'].includes(c.status) && <button style={btn('var(--green)')} onClick={() => doSend(c)}>Enviar ya</button>}
                {['draft', 'scheduled'].includes(c.status) && <button style={{ ...btn('transparent'), color: 'var(--text2)', border: '1px solid var(--border2)' }} onClick={() => doCancel(c)}>Cancelar</button>}
                {['done', 'cancelled'].includes(c.status) && <button style={btn('var(--accent)')} title="Crear copia y enviar de nuevo" onClick={() => doResend(c)}>🔁 Reenviar</button>}
                <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 15 }} title="Eliminar" onClick={() => doDelete(c)}>🗑</button>
              </div>

              {showMetrics && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 2 }}>
                  <Metric icon="👥" label="audiencia" value={s.total ?? '—'} color="#8a8a8a" title="Contactos en la audiencia" />
                  <Metric icon="📤" label="enviados" value={s.sent ?? 0} color="#4fa8ff" title="Mensajes despachados a WhatsApp" />
                  <Metric icon="✓✓" label="entregados" value={s.delivered ?? 0} color="#22d98a" title="Confirmados como entregados por WhatsApp" />
                  <Metric icon="👁" label="leídos" value={s.read ?? 0} color="#7c6fff" title="Confirmados como leídos por WhatsApp" />
                  <Metric icon="💬" label="respondieron" value={s.responded ?? 0} color="#f5a623" title="Contactos que respondieron tras el envío" />
                  {(s.failed ?? 0) > 0 && <Metric icon="✗" label="fallidos" value={s.failed} color="#ff5f5f" title="No se pudieron enviar" />}
                </div>
              )}
              {c.status === 'done' && c.hasAb && <CampaignAb accId={accId} campaignId={c.id} flows={flows} campaign={c} />}
              {c.status === 'done' && <CampaignRoi accId={accId} campaignId={c.id} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ROI de la campaña: ingresos atribuidos (pedidos de los destinatarios tras el envío).
function CampaignRoi({ accId, campaignId }) {
  const [data, setData] = useState(null)
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(false)
  async function load(d) {
    setLoading(true)
    try { setData(await campaignRoi(accId, campaignId, d)) } catch { setData({ error: true }) }
    setLoading(false)
  }
  if (!data) {
    return <button onClick={() => load(days)} disabled={loading}
      style={{ alignSelf: 'flex-start', fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}>
      {loading ? 'Calculando…' : '💰 Ver ingresos atribuidos'}
    </button>
  }
  if (data.error) return <span style={{ fontSize: 11.5, color: '#ff5f5f' }}>No se pudo calcular el ROI.</span>
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5, background: 'rgba(34,217,138,.08)', border: '1px solid rgba(34,217,138,.3)', borderRadius: 8, padding: '7px 11px' }}>
      <span style={{ fontWeight: 800, color: '#22d98a', fontSize: 14 }}>💰 {Number(data.revenue).toLocaleString('es-CO')} {data.currency}</span>
      <span style={{ color: 'var(--text2)' }}>{data.orders} pedido(s) · {data.convRate}% de {data.recipients} destinatarios</span>
      <select value={days} onChange={e => { setDays(Number(e.target.value)); load(Number(e.target.value)) }}
        style={{ fontSize: 11, padding: '2px 6px', background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }}>
        {[7, 14, 30].map(d => <option key={d} value={d}>ventana {d}d</option>)}
      </select>
    </div>
  )
}

// Resultado de la prueba A/B: compara variante A vs B (respuesta + conversión) y marca la ganadora.
function CampaignAb({ accId, campaignId, flows, campaign }) {
  const [data, setData] = useState(null)
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(false)
  const flowName = id => flows.find(f => f.id === id)?.name || id
  async function load(d) {
    setLoading(true)
    try { setData(await campaignAb(accId, campaignId, d)) } catch { setData({ error: true }) }
    setLoading(false)
  }
  if (!data) {
    return <button onClick={() => load(days)} disabled={loading}
      style={{ alignSelf: 'flex-start', fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}>
      {loading ? 'Calculando…' : '🧪 Ver resultado A/B'}
    </button>
  }
  if (data.error || data.ab === false) return <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>No hay datos A/B para esta campaña.</span>
  const Col = ({ g, label, flowId, win }) => (
    <div style={{ flex: 1, minWidth: 150, background: win ? 'rgba(34,217,138,.1)' : 'var(--bg3)', border: `1px solid ${win ? 'rgba(34,217,138,.5)' : 'var(--border2)'}`, borderRadius: 8, padding: '9px 11px' }}>
      <div style={{ fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
        {label} {win && <span style={{ fontSize: 10, color: '#22d98a', background: 'rgba(34,217,138,.2)', borderRadius: 5, padding: '1px 6px' }}>🏆 ganó</span>}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>⚡ {flowName(flowId)}</div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div><div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)' }}>{g.replyRate}%</div><div style={{ fontSize: 9.5, color: 'var(--text3)' }}>respuesta · {g.responded}/{g.recipients}</div></div>
        <div><div style={{ fontSize: 15, fontWeight: 800, color: '#22d98a' }}>{g.convRate}%</div><div style={{ fontSize: 9.5, color: 'var(--text3)' }}>compra · {g.orders} ped.</div></div>
      </div>
    </div>
  )
  return (
    <div style={{ background: 'rgba(124,111,255,.06)', border: '1px solid rgba(124,111,255,.28)', borderRadius: 8, padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#7c6fff' }}>🧪 Prueba A/B · reparto A {100 - data.split}% / B {data.split}%</span>
        <select value={days} onChange={e => { setDays(Number(e.target.value)); load(Number(e.target.value)) }}
          style={{ fontSize: 11, padding: '2px 6px', background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6 }}>
          {[7, 14, 30].map(d => <option key={d} value={d}>ventana {d}d</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Col g={data.a} label="Variante A" flowId={campaign.flowId} win={data.winner === 'a'} />
        <Col g={data.b} label="Variante B" flowId={campaign.variantFlowId} win={data.winner === 'b'} />
      </div>
      {data.winner === 'tie' && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Empate técnico — sin diferencia clara todavía.</span>}
    </div>
  )
}

// Mejor hora de envío: mapa de calor de actividad del cliente (día × hora) + recomendación.
function BestTime({ accId, onPick }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  async function load() {
    if (data) return
    setLoading(true)
    try { setData(await campaignBestTime(accId, 90)) } catch { setData({ error: true }) }
    setLoading(false)
  }
  function toggle() { setOpen(o => !o); if (!open) load() }
  // Próxima ocurrencia futura del mejor día×hora (para programar con un clic).
  function nextSlot(wd, hr) {
    const d = new Date(); d.setHours(hr, 0, 0, 0)
    let add = (wd - d.getDay() + 7) % 7
    if (add === 0 && d.getTime() <= Date.now()) add = 7
    d.setDate(d.getDate() + add)
    return d.getTime()
  }
  return (
    <div style={{ margin: '10px 0', maxWidth: 720 }}>
      <button onClick={toggle}
        style={{ fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text2)', cursor: 'pointer' }}>
        🕐 Mejor hora de envío {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{ marginTop: 8, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 12, padding: 14 }}>
          {loading && <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Analizando cuándo te escriben tus clientes…</div>}
          {data?.error && <div style={{ fontSize: 12.5, color: '#ff5f5f' }}>No se pudo calcular.</div>}
          {data && !data.error && (data.total === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Aún no hay suficientes mensajes entrantes para recomendar una hora.</div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: 'var(--text1)', fontWeight: 600, marginBottom: 4 }}>
                📈 Tus clientes escriben más el <b style={{ color: 'var(--accent)' }}>{WD[data.best.wd]}</b> hacia las <b style={{ color: 'var(--accent)' }}>{hourLabel(data.best.hr)}</b>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 10 }}>
                Mejor franja: {hourLabel(data.bestWindow.hr)}–{hourLabel(data.bestWindow.hr + 2)} · Día más activo: {WD[data.bestDay]} · Basado en {data.total.toLocaleString()} mensajes (90 días)
                <button onClick={() => onPick(nextSlot(data.best.wd, data.best.hr))}
                  style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}>
                  ⏰ Programar a esta hora
                </button>
              </div>
              <Heatmap grid={data.grid} />
            </>
          ))}
        </div>
      )}
    </div>
  )
}

function Heatmap({ grid }) {
  const max = Math.max(1, ...grid.flat())
  const cell = v => {
    if (!v) return 'var(--bg3)'
    const a = 0.18 + 0.82 * (v / max)
    return `rgba(124,111,255,${a.toFixed(2)})`
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 9 }}>
        <thead>
          <tr>
            <th></th>
            {Array.from({ length: 24 }, (_, h) => <th key={h} style={{ color: 'var(--text3)', fontWeight: 500, padding: '0 1px', width: 14 }}>{h % 6 === 0 ? h : ''}</th>)}
          </tr>
        </thead>
        <tbody>
          {WD.map((d, wd) => (
            <tr key={wd}>
              <td style={{ color: 'var(--text3)', fontWeight: 600, paddingRight: 5, fontSize: 10, whiteSpace: 'nowrap' }}>{d}</td>
              {grid[wd].map((v, h) => (
                <td key={h} title={`${d} ${hourLabel(h)} · ${v} mensaje(s)`}
                  style={{ width: 14, height: 14, background: cell(v), border: '1px solid var(--bg2)', borderRadius: 2 }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


// ─── Audiencia: filtros + lista revisable ─────────────────────────────────────
// Antes la audiencia era un campo de texto con etiquetas separadas por comas y un número.
// Se enviaba a ciegas: no se veía a quién, y un dedazo en una etiqueta dejaba la campaña en
// cero sin avisar. Ahora se filtra con los MISMOS criterios que los segmentos del CRM y la
// lista resultante se puede revisar y recortar antes de enviar.
const CANALES = [
  { id: 'whatsapp',  label: 'WhatsApp' },
  { id: 'webchat',   label: 'Webchat' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'test',      label: 'Pruebas' },
]

function Chips({ options, value, onChange, empty }) {
  const sel = value || []
  if (!options.length) return <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{empty}</span>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {options.map(o => {
        const on = sel.includes(o.id)
        return (
          <button key={o.id} type="button"
            onClick={() => onChange(on ? sel.filter(x => x !== o.id) : [...sel, o.id])}
            style={{
              fontSize: 11.5, padding: '3px 9px', borderRadius: 20, cursor: 'pointer',
              border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border2)'),
              background: on ? 'var(--accent-dim)' : 'transparent',
              color: on ? 'var(--accent)' : 'var(--text2)', fontWeight: on ? 600 : 500,
            }}>{o.label}</button>
        )
      })}
    </div>
  )
}

function AudiencePicker({
  account, segments, segmentId, setSegmentId, rules, setRules,
  preview, previewList, excludeIds, setExcludeIds, frozen, setFrozen,
  finalCount, selectedIds, onSaveSegment,
}) {
  const [q, setQ] = useState('')
  const [openFiltros, setOpenFiltros] = useState(false)

  const field = { display: 'flex', flexDirection: 'column', gap: 4 }
  const lbl = { fontSize: 12, color: 'var(--text2)', fontWeight: 500 }
  const inp = { padding: '7px 9px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 7, color: 'var(--text)', fontSize: 12.5, outline: 'none' }
  const num = { ...inp, width: 92 }

  const setRule = (k, v) => setRules(r => {
    const n = { ...r }
    if (v === '' || v == null || (Array.isArray(v) && !v.length)) delete n[k]
    else n[k] = v
    return n
  })

  // Etiquetas y etapas reales de la cuenta: se eligen, no se escriben. Un dedazo ya no
  // deja la audiencia en cero.
  const tagOpts = [...new Set((account?.contacts || []).flatMap(c => c.tags || []).map(t => String(t).toLowerCase()))]
    .sort().map(t => ({ id: t, label: t }))
  const stageOpts = (account?.pipelines || []).flatMap(pl =>
    (pl.stages || []).map(st => ({ id: st.id, label: (account.pipelines.length > 1 ? pl.name + ' · ' : '') + (st.name || st.id) })))

  const usandoSegmento = !!segmentId
  const hayFiltro = Object.keys(rules || {}).length > 0
  const visibles = previewList.filter(c =>
    !q.trim() || `${c.name} ${c.phone}`.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = id => setExcludeIds(ex => ex.includes(id) ? ex.filter(x => x !== id) : [...ex, id])

  return (
    <div style={{ ...field, border: '1px solid var(--border2)', borderRadius: 9, padding: 11, gap: 9 }}>
      <label style={{ ...lbl, fontWeight: 600 }}>👥 Audiencia</label>

      {segments.length > 0 && (
        <div style={field}>
          <label style={lbl}>Segmento guardado del CRM</label>
          <select style={inp} value={segmentId} onChange={e => setSegmentId(e.target.value)}>
            <option value="">— sin segmento: filtrar aquí —</option>
            {segments.map(sg => <option key={sg.id} value={sg.id}>🎯 {sg.name}</option>)}
          </select>
        </div>
      )}

      {!usandoSegmento && (
        <>
          <button type="button" onClick={() => setOpenFiltros(v => !v)}
            style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: 0 }}>
            {openFiltros ? '▾' : '▸'} Filtros {hayFiltro ? `(${Object.keys(rules).length} activo${Object.keys(rules).length === 1 ? '' : 's'})` : ''}
          </button>

          {openFiltros && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingLeft: 4 }}>
              <div style={field}>
                <label style={lbl}>Etiquetas (cualquiera de las marcadas)</label>
                <Chips options={tagOpts} value={rules.tagsAny} onChange={v => setRule('tagsAny', v)}
                  empty="Esta cuenta aún no tiene contactos etiquetados." />
              </div>
              <div style={field}>
                <label style={lbl}>Etapa del pipeline</label>
                <Chips options={stageOpts} value={rules.stageIds} onChange={v => setRule('stageIds', v)}
                  empty="No hay pipelines configurados." />
              </div>
              <div style={field}>
                <label style={lbl}>Canal de origen</label>
                <Chips options={CANALES} value={rules.channels} onChange={v => setRule('channels', v)} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <div style={field}><label style={lbl}>Creados hace ≤ (días)</label>
                  <input type="number" min={1} style={num} value={rules.createdWithinDays || ''} onChange={e => setRule('createdWithinDays', e.target.value && Number(e.target.value))} /></div>
                <div style={field}><label style={lbl}>Con actividad ≤ (días)</label>
                  <input type="number" min={1} style={num} value={rules.lastSeenWithinDays || ''} onChange={e => setRule('lastSeenWithinDays', e.target.value && Number(e.target.value))} /></div>
                <div style={field}><label style={lbl}>Sin actividad ≥ (días)</label>
                  <input type="number" min={1} style={num} value={rules.notSeenWithinDays || ''} onChange={e => setRule('notSeenWithinDays', e.target.value && Number(e.target.value))} /></div>
                <div style={field}><label style={lbl}>Mínimo de pedidos</label>
                  <input type="number" min={1} style={num} value={rules.minOrders || ''} onChange={e => setRule('minOrders', e.target.value && Number(e.target.value))} /></div>
                <div style={field}><label style={lbl}>Mínimo gastado</label>
                  <input type="number" min={1} style={num} value={rules.minSpend || ''} onChange={e => setRule('minSpend', e.target.value && Number(e.target.value))} /></div>
                <div style={field}><label style={lbl}>Compraron ≤ (días)</label>
                  <input type="number" min={1} style={num} value={rules.purchasedWithinDays || ''} onChange={e => setRule('purchasedWithinDays', e.target.value && Number(e.target.value))} /></div>
                <div style={field}><label style={lbl}>Sin comprar ≥ (días)</label>
                  <input type="number" min={1} style={num} value={rules.notPurchasedWithinDays || ''} onChange={e => setRule('notPurchasedWithinDays', e.target.value && Number(e.target.value))} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {hayFiltro && <button type="button" onClick={() => setRules({})} style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 7, color: 'var(--text2)', cursor: 'pointer', fontSize: 11.5, padding: '4px 10px' }}>Limpiar filtros</button>}
                {hayFiltro && <button type="button" onClick={onSaveSegment} style={{ background: 'none', border: '1px solid var(--accent)', borderRadius: 7, color: 'var(--accent)', cursor: 'pointer', fontSize: 11.5, padding: '4px 10px' }}>🎯 Guardar como segmento</button>}
              </div>
            </div>
          )}
        </>
      )}

      {/* Lista revisable */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 600 }}>
          {finalCount == null ? 'Calculando…' : `Se enviará a ${finalCount} contacto${finalCount === 1 ? '' : 's'}`}
        </span>
        {preview?.truncated && (
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            (se muestran los primeros {preview.limit} de {preview.count})
          </span>
        )}
        {!!excludeIds.length && (
          <button type="button" onClick={() => setExcludeIds([])}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11.5 }}>
            restaurar {excludeIds.length} quitado{excludeIds.length === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {previewList.length > 0 && (
        <>
          <input style={inp} placeholder="🔍 Buscar en la lista…" value={q} onChange={e => setQ(e.target.value)} />
          <div style={{ maxHeight: 190, overflowY: 'auto', border: '1px solid var(--border2)', borderRadius: 7 }}>
            {visibles.map(c => {
              const on = !excludeIds.includes(c.id)
              return (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 9px', borderBottom: '1px solid var(--border)', cursor: 'pointer', opacity: on ? 1 : 0.45 }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(c.id)} style={{ accentColor: 'var(--accent)' }} />
                  <span style={{ fontSize: 12.5, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name || '(sin nombre)'}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{c.phone}</span>
                </label>
              )
            })}
            {!visibles.length && <div style={{ fontSize: 12, color: 'var(--text3)', padding: 10, textAlign: 'center' }}>Ningún contacto coincide con la búsqueda.</div>}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setExcludeIds([])} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11.5 }}>Marcar todos</button>
            <button type="button" onClick={() => setExcludeIds(previewList.map(c => c.id))} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 11.5 }}>Desmarcar todos</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text2)', cursor: 'pointer', marginLeft: 'auto' }}
              title="Congela la lista tal como está ahora. Si no, la audiencia se vuelve a calcular al enviar y una campaña programada alcanzará también a los contactos que entren mientras tanto.">
              <input type="checkbox" checked={frozen} onChange={e => setFrozen(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
              Usar solo estos {selectedIds.length} (lista fija)
            </label>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            {frozen
              ? '📌 Lista fija: se enviará exactamente a estos contactos, aunque entren otros nuevos.'
              : '🔄 Audiencia dinámica: se recalcula al enviar, así que incluirá a los contactos que entren hasta ese momento.'}
          </span>
        </>
      )}
    </div>
  )
}
