import { useState, useEffect } from 'react'
import {
  listAccountTypes, createAccountType, updateAccountType, deleteAccountType,
  listSubscriptionPlans, createSubscriptionPlan, updateSubscriptionPlan, deleteSubscriptionPlan,
  getAccountSubscription, assignAccountSubscription, subscriptionAction,
  updateAccountModules, saUpdateAccount,
} from '../../lib/storage'
import { MODULES } from '../../lib/modules'

const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 12 }
const inp = { padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 7, color: 'var(--text)', fontSize: 13, width: '100%', boxSizing: 'border-box' }
const lbl = { fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }
const btn = (bg, c = '#fff') => ({ padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: bg, color: c, fontSize: 13, fontWeight: 600 })
const num = (v, d = 0) => (v === '' || v == null ? d : Number(v))
const Field = ({ label, children }) => <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lbl}>{label}</span>{children}</div>

// ════════════ Tipos de Cuenta ════════════
export function AccountTypesPanel() {
  const [rows, setRows] = useState([])
  const [editing, setEditing] = useState(null) // id o 'new'
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)

  async function reload() { try { setRows(await listAccountTypes()) } catch { setRows([]) } }
  useEffect(() => { reload() }, [])

  function startNew() {
    setEditing('new')
    setDraft({ name: '', maxWebchatChannels: 1, maxWhatsappChannels: 1, maxTestChannels: 1, maxMessengerChannels: 0, maxInstagramChannels: 0, isDemo: false, demoDaysDuration: 7, demoMaxConversations: 100, demoMaxAiResponsesPerConversation: 30 })
  }
  function startEdit(t) { setEditing(t.id); setDraft({ ...t }) }

  async function save() {
    if (!draft.name.trim()) return
    setBusy(true)
    const payload = {
      name: draft.name.trim(),
      maxWebchatChannels: num(draft.maxWebchatChannels), maxWhatsappChannels: num(draft.maxWhatsappChannels),
      maxTestChannels: num(draft.maxTestChannels), maxMessengerChannels: num(draft.maxMessengerChannels),
      maxInstagramChannels: num(draft.maxInstagramChannels), isDemo: !!draft.isDemo,
      demoDaysDuration: num(draft.demoDaysDuration, 7), demoMaxConversations: num(draft.demoMaxConversations, 100),
      demoMaxAiResponsesPerConversation: num(draft.demoMaxAiResponsesPerConversation, 30),
      cmsStorageMb: num(draft.cmsStorageMb, 500),
      modules: Array.isArray(draft.modules) ? draft.modules : null,
    }
    try {
      if (editing === 'new') await createAccountType(payload)
      else await updateAccountType(editing, payload)
      setEditing(null); setDraft(null); reload()
    } catch (e) { alert(e?.message || 'No se pudo guardar') }
    setBusy(false)
  }
  async function remove(t) { if (confirm(`¿Eliminar el tipo "${t.name}"?`)) { try { await deleteAccountType(t.id); reload() } catch (e) { alert(e.message) } } }

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }))

  return (
    <div style={{ padding: 28, maxWidth: 920, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div><h1 style={{ margin: 0, fontSize: 20 }}>🏷 Tipos de Cuenta</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>Definen los límites de canales y, para Demo, la vigencia y topes de uso.</p></div>
        {editing == null && <button style={btn('linear-gradient(135deg,var(--accent),var(--accent2))')} onClick={startNew}>+ Nuevo tipo</button>}
      </div>

      {editing && draft && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>{editing === 'new' ? 'Nuevo tipo de cuenta' : 'Editar tipo'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            <Field label="Nombre"><input style={inp} value={draft.name} onChange={e => set('name', e.target.value)} placeholder="Demo, Starter…" /></Field>
            <Field label="Webchat (máx)"><input type="number" min="0" style={inp} value={draft.maxWebchatChannels} onChange={e => set('maxWebchatChannels', e.target.value)} /></Field>
            <Field label="WhatsApp (máx)"><input type="number" min="0" style={inp} value={draft.maxWhatsappChannels} onChange={e => set('maxWhatsappChannels', e.target.value)} /></Field>
            <Field label="Test (máx)"><input type="number" min="0" style={inp} value={draft.maxTestChannels} onChange={e => set('maxTestChannels', e.target.value)} /></Field>
            <Field label="Messenger (máx)"><input type="number" min="0" style={inp} value={draft.maxMessengerChannels} onChange={e => set('maxMessengerChannels', e.target.value)} /></Field>
            <Field label="Instagram (máx)"><input type="number" min="0" style={inp} value={draft.maxInstagramChannels} onChange={e => set('maxInstagramChannels', e.target.value)} /></Field>
            <Field label="Almacenamiento CMS (MB)"><input type="number" min="0" style={inp} value={draft.cmsStorageMb ?? 500} onChange={e => set('cmsStorageMb', e.target.value)} placeholder="500 / 2048 / 10240" /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 4px', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!draft.isDemo} onChange={e => set('isDemo', e.target.checked)} style={{ width: 15, height: 15 }} />
            Es tipo <strong>Demo</strong> (vigencia limitada y topes de uso)
          </label>
          {draft.isDemo && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 8, padding: 12, background: 'var(--bg3)', borderRadius: 8 }}>
              <Field label="Vigencia (días)"><input type="number" min="1" style={inp} value={draft.demoDaysDuration} onChange={e => set('demoDaysDuration', e.target.value)} /></Field>
              <Field label="Máx. conversaciones"><input type="number" min="1" style={inp} value={draft.demoMaxConversations} onChange={e => set('demoMaxConversations', e.target.value)} /></Field>
              <Field label="Máx. respuestas IA / conversación"><input type="number" min="1" style={inp} value={draft.demoMaxAiResponsesPerConversation} onChange={e => set('demoMaxAiResponsesPerConversation', e.target.value)} /></Field>
            </div>
          )}
          {/* Módulos incluidos en el tipo (vacío/desactivado = todos). */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 4px', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={Array.isArray(draft.modules)} onChange={e => set('modules', e.target.checked ? (Array.isArray(draft.modules) ? draft.modules : MODULES.map(m => m.id)) : null)} style={{ width: 15, height: 15 }} />
            Limitar <strong>módulos incluidos</strong> (si no, incluye todos)
          </label>
          {Array.isArray(draft.modules) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, padding: 12, background: 'var(--bg3)', borderRadius: 8, marginTop: 4 }}>
              {MODULES.map(m => {
                const on = draft.modules.includes(m.id)
                return (
                  <label key={m.id} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', background: on ? 'var(--accent)22' : 'var(--bg2)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border2)'}`, borderRadius: 6, padding: '4px 9px' }}>
                    <input type="checkbox" checked={on} onChange={() => set('modules', on ? draft.modules.filter(x => x !== m.id) : [...draft.modules, m.id])} /> {m.icon} {m.name}
                  </label>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button style={{ ...btn('transparent', 'var(--text2)'), border: '1px solid var(--border2)' }} onClick={() => { setEditing(null); setDraft(null) }}>Cancelar</button>
            <button style={btn('var(--green)')} disabled={busy} onClick={save}>Guardar</button>
          </div>
        </div>
      )}

      {rows.map(t => (
        <div key={t.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name} {t.isDemo && <span style={{ fontSize: 11, color: 'var(--amber)', border: '1px solid var(--amber)', borderRadius: 20, padding: '1px 8px', marginLeft: 6 }}>DEMO</span>}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
              🌐 {t.maxWebchatChannels} · 📱 {t.maxWhatsappChannels} · 🧪 {t.maxTestChannels} · 💬 {t.maxMessengerChannels} · 📸 {t.maxInstagramChannels}
              {t.isDemo && <span style={{ color: 'var(--amber)' }}> · {t.demoDaysDuration}d · {t.demoMaxConversations} convos · {t.demoMaxAiResponsesPerConversation} resp/conv</span>}
              {Array.isArray(t.modules) && <span style={{ color: 'var(--accent)' }}> · 🧩 {t.modules.length} módulos</span>}
            </div>
          </div>
          <button style={btn('transparent', 'var(--text)')} onClick={() => startEdit(t)}>✎ Editar</button>
          <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }} onClick={() => remove(t)}>🗑</button>
        </div>
      ))}
      {rows.length === 0 && editing == null && <div style={{ fontSize: 13, color: 'var(--text3)', padding: 20, textAlign: 'center', border: '1px dashed var(--border2)', borderRadius: 12 }}>Sin tipos de cuenta.</div>}
    </div>
  )
}

// ════════════ Mensualidades (Planes) ════════════
export function PlansPanel() {
  const [rows, setRows] = useState([])
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)

  async function reload() { try { setRows(await listSubscriptionPlans()) } catch { setRows([]) } }
  useEffect(() => { reload() }, [])

  function startNew() { setEditing('new'); setDraft({ name: '', monthlyConversationLimit: 1500, isCustomLimit: false, gracePeriodDays: 5, monthlyPrice: 0 }) }
  function startEdit(p) { setEditing(p.id); setDraft({ ...p }) }

  async function save() {
    if (!draft.name.trim()) return
    setBusy(true)
    const payload = { name: draft.name.trim(), monthlyConversationLimit: num(draft.monthlyConversationLimit), isCustomLimit: !!draft.isCustomLimit, gracePeriodDays: num(draft.gracePeriodDays, 5), monthlyPrice: num(draft.monthlyPrice, 0) }
    try {
      if (editing === 'new') await createSubscriptionPlan(payload)
      else await updateSubscriptionPlan(editing, payload)
      setEditing(null); setDraft(null); reload()
    } catch (e) { alert(e?.message || 'No se pudo guardar') }
    setBusy(false)
  }
  async function remove(p) { if (confirm(`¿Eliminar el plan "${p.name}"?`)) { try { await deleteSubscriptionPlan(p.id); reload() } catch (e) { alert(e.message) } } }

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }))

  return (
    <div style={{ padding: 28, maxWidth: 760, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div><h1 style={{ margin: 0, fontSize: 20 }}>💳 Mensualidades</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>Planes con el límite de conversaciones mensuales y el periodo de gracia.</p></div>
        {editing == null && <button style={btn('linear-gradient(135deg,var(--accent),var(--accent2))')} onClick={startNew}>+ Nuevo plan</button>}
      </div>

      {editing && draft && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>{editing === 'new' ? 'Nuevo plan' : 'Editar plan'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
            <Field label="Nombre"><input style={inp} value={draft.name} onChange={e => set('name', e.target.value)} placeholder="Starter, Pro, Expert…" /></Field>
            <Field label="Límite mensual de conversaciones"><input type="number" min="0" style={{ ...inp, opacity: draft.isCustomLimit ? .5 : 1 }} disabled={draft.isCustomLimit} value={draft.monthlyConversationLimit} onChange={e => set('monthlyConversationLimit', e.target.value)} /></Field>
            <Field label="Precio mensual (USD)"><input type="number" min="0" step="0.01" style={inp} value={draft.monthlyPrice ?? 0} onChange={e => set('monthlyPrice', e.target.value)} /></Field>
            <Field label="Periodo de gracia (días)"><input type="number" min="0" style={inp} value={draft.gracePeriodDays} onChange={e => set('gracePeriodDays', e.target.value)} /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 0', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!draft.isCustomLimit} onChange={e => set('isCustomLimit', e.target.checked)} style={{ width: 15, height: 15 }} />
            Límite <strong>personalizado por cuenta</strong> (Enterprise: lo define el SuperAdmin en cada cuenta)
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button style={{ ...btn('transparent', 'var(--text2)'), border: '1px solid var(--border2)' }} onClick={() => { setEditing(null); setDraft(null) }}>Cancelar</button>
            <button style={btn('var(--green)')} disabled={busy} onClick={save}>Guardar</button>
          </div>
        </div>
      )}

      {rows.map(p => (
        <div key={p.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
              {p.isCustomLimit ? '🔧 Límite personalizado por cuenta' : `📊 ${Number(p.monthlyConversationLimit).toLocaleString('es')} conversaciones/mes`} · ⏳ gracia {p.gracePeriodDays}d · 💵 ${Number(p.monthlyPrice || 0).toLocaleString('es')}/mes
            </div>
          </div>
          <button style={btn('transparent', 'var(--text)')} onClick={() => startEdit(p)}>✎ Editar</button>
          <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }} onClick={() => remove(p)}>🗑</button>
        </div>
      ))}
      {rows.length === 0 && editing == null && <div style={{ fontSize: 13, color: 'var(--text3)', padding: 20, textAlign: 'center', border: '1px dashed var(--border2)', borderRadius: 12 }}>Sin planes.</div>}
    </div>
  )
}

// ════════════ Asignación de suscripción a una cuenta (en la ficha de cuenta) ════
const STATUS_META = {
  active:    { label: 'Activa',            color: '#22d98a' },
  grace:     { label: 'Periodo de gracia', color: '#f5a623' },
  suspended: { label: 'Suspendida',        color: '#ff5f5f' },
  expired:   { label: 'Vencida',           color: '#ff5f5f' },
}
export function AccountSubscriptionControl({ accId }) {
  const [types, setTypes] = useState([])
  const [plans, setPlans] = useState([])
  const [sub, setSub] = useState(null)
  const [limit, setLimit] = useState(null)
  const [typeId, setTypeId] = useState('')
  const [planId, setPlanId] = useState('')
  const [customLimit, setCustomLimit] = useState('')
  const [busy, setBusy] = useState(false)

  async function reload() {
    try {
      const r = await getAccountSubscription(accId)
      setSub(r?.subscription || null); setLimit(r?.effectiveMonthlyLimit ?? null)
      setTypeId(r?.subscription?.accountTypeId || '')
      setPlanId(r?.subscription?.subscriptionPlanId || '')
      setCustomLimit(r?.subscription?.customMonthlyLimit ?? '')
    } catch { setSub(null) }
  }
  useEffect(() => {
    listAccountTypes().then(setTypes).catch(() => {})
    listSubscriptionPlans().then(setPlans).catch(() => {})
    reload()
  }, [accId]) // eslint-disable-line

  const selectedPlan = plans.find(p => p.id === planId)
  const isCustom = !!selectedPlan?.isCustomLimit

  async function save() {
    setBusy(true)
    try {
      await assignAccountSubscription(accId, { accountTypeId: typeId || null, subscriptionPlanId: planId || null, customMonthlyLimit: isCustom ? (customLimit === '' ? null : Number(customLimit)) : undefined })
      await reload()
    } catch (e) { alert(e?.message || 'No se pudo asignar') }
    setBusy(false)
  }
  async function act(type, value) { setBusy(true); try { await subscriptionAction(accId, type, value); await reload() } catch (e) { alert(e.message) } setBusy(false) }

  const st = STATUS_META[sub?.status] || STATUS_META.active
  const used = sub?.conversationCount ?? 0
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null
  const sel = { padding: '6px 8px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', fontSize: 12 }
  const mini = (bg, c = '#fff') => ({ padding: '4px 9px', borderRadius: 6, border: 'none', cursor: 'pointer', background: bg, color: c, fontSize: 11, fontWeight: 600 })

  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 12 }}>💳 Suscripción</strong>
        <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.color + '22', borderRadius: 20, padding: '2px 9px' }}>{st.label}</span>
        {pct != null && <span style={{ fontSize: 11, color: 'var(--text2)' }}>{used.toLocaleString('es')} / {Number(limit).toLocaleString('es')} ({pct}%)</span>}
        {sub?.type?.isDemo && sub?.demoExpiresAt && <span style={{ fontSize: 11, color: 'var(--amber)' }}>Demo vence {new Date(Number(sub.demoExpiresAt)).toLocaleDateString('es')}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={sel} value={typeId} onChange={e => setTypeId(e.target.value)}>
          <option value="">— Tipo de cuenta —</option>
          {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select style={sel} value={planId} onChange={e => setPlanId(e.target.value)}>
          <option value="">— Plan mensual —</option>
          {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {isCustom && <input type="number" min="0" placeholder="Límite mensual" style={{ ...sel, width: 130 }} value={customLimit} onChange={e => setCustomLimit(e.target.value)} />}
        <button style={mini('var(--accent)')} disabled={busy} onClick={save}>Guardar</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {sub?.status === 'suspended' || sub?.status === 'expired'
          ? <button style={mini('var(--green)')} disabled={busy} onClick={() => act('reactivate')}>Reactivar</button>
          : <button style={mini('transparent', 'var(--red)')} disabled={busy} onClick={() => act('suspend')}>Suspender</button>}
        <button style={mini('transparent', 'var(--text2)')} disabled={busy} onClick={() => act('extendGrace', 5)}>+5d gracia</button>
        <button style={mini('transparent', 'var(--text2)')} disabled={busy} onClick={() => act('resetConsumption')}>Reiniciar consumo</button>
      </div>
    </div>
  )
}

// ════════════ Módulos override por cuenta (en la ficha de cuenta) ════════════
// `acc.modules`: array de ids habilitados (override) | null = heredar del tipo / todos.
export function AccountModulesControl({ acc, onSaved }) {
  const allIds = MODULES.map(m => m.id)
  const [custom, setCustom] = useState(Array.isArray(acc.modules) ? acc.modules : null)
  const [busy, setBusy] = useState(false)
  const personalize = custom !== null

  const [cmsMb, setCmsMb] = useState(acc.cmsStorageQuotaMb ?? '')
  function toggleMode(on) { setCustom(on ? (Array.isArray(acc.modules) ? [...acc.modules] : [...allIds]) : null) }
  function toggle(id) { setCustom(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]) }
  function presetCRM() { setCustom(['crm', 'channels', 'inbox']) }

  async function save() {
    setBusy(true)
    try {
      await updateAccountModules(acc.id, personalize ? custom : null)
      await saUpdateAccount(acc.id, { cmsStorageQuotaMb: cmsMb === '' ? null : Number(cmsMb) })
      await onSaved?.()
    }
    catch (e) { alert(e?.message || 'No se pudo guardar') }
    setBusy(false)
  }

  const mini = (bg, c = '#fff') => ({ padding: '4px 9px', borderRadius: 6, border: '1px solid var(--border2)', cursor: 'pointer', background: bg, color: c, fontSize: 11, fontWeight: 600 })
  const chip = on => ({ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', background: on ? 'var(--accent)22' : 'var(--bg2)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border2)'}`, borderRadius: 6, padding: '4px 8px' })

  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: personalize ? 8 : 0 }}>
        <strong style={{ fontSize: 12 }}>🧩 Módulos</strong>
        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: 'var(--text2)' }}>
          <input type="checkbox" checked={personalize} onChange={e => toggleMode(e.target.checked)} />
          Personalizar {personalize ? '' : '(hereda del tipo / todos)'}
        </label>
        {personalize && <button style={mini('transparent', 'var(--text2)')} onClick={presetCRM}>Preset CRM</button>}
        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text2)' }} title="Almacenamiento del CMS personalizado para esta cuenta (MB). Vacío = usa el del plan.">
          💾 CMS <input type="number" min="0" placeholder="plan" value={cmsMb} onChange={e => setCmsMb(e.target.value)} style={{ width: 76, padding: '3px 6px', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', fontSize: 11 }} /> MB
        </label>
        <button style={{ ...mini('var(--accent)'), marginLeft: 'auto' }} disabled={busy} onClick={save}>Guardar</button>
      </div>
      {personalize && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {MODULES.map(m => {
            const on = custom.includes(m.id)
            return (
              <label key={m.id} style={chip(on)}>
                <input type="checkbox" checked={on} onChange={() => toggle(m.id)} /> {m.icon} {m.name}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
