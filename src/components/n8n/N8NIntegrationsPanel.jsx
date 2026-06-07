import { useState, useEffect } from 'react'
import {
  listN8NIntegrations, createN8NIntegration, updateN8NIntegration,
  deleteN8NIntegration, testN8NIntegration,
} from '../../lib/storage'
import s from './N8NPanel.module.css'

const AUTH_TYPES = [
  { value: 'none',   label: 'Sin auth' },
  { value: 'header', label: 'Header custom' },
  { value: 'bearer', label: 'Bearer token' },
  { value: 'basic',  label: 'Basic auth' },
]
const SYNC_MODES = [
  { value: 'fire_forget',   label: 'Fire & forget (no espera respuesta)' },
  { value: 'wait_response', label: 'Esperar respuesta (sync)' },
]

const BLANK = {
  scope: 'account', accountId: '', name: '', webhookUrl: '',
  authType: 'none', authValue: '', syncMode: 'fire_forget', timeoutMs: 15000,
}

/**
 * Reusable CRUD UI for N8N integrations.
 * Props:
 *   scope        — 'platform' | 'account'
 *   accountId    — current account id (ignored when scope='platform')
 *   accounts     — optional list of accounts (for super admin to target a specific account)
 */
export default function N8NIntegrationsPanel({ scope = 'account', accountId, accounts = [] }) {
  const [list, setList]       = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft]     = useState({ ...BLANK, scope, accountId: scope === 'account' ? accountId : '' })
  const [editingId, setEditingId] = useState(null)
  const [testResult, setTestResult] = useState(null)
  const [toast, setToast]     = useState('')

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2500) }

  async function reload() {
    setLoading(true)
    try {
      const params = scope === 'platform' ? { scope: 'platform' } : {}
      const all = await listN8NIntegrations(params)
      // For scope=account, filter out globals (those are read-only and shown separately if needed)
      setList(scope === 'platform' ? all.filter(i => i.scope === 'platform') : all)
    } catch (e) { setList([]) }
    setLoading(false)
  }
  useEffect(() => { reload() }, [scope, accountId])

  async function save() {
    if (!draft.name?.trim() || !draft.webhookUrl?.trim()) {
      flash('Nombre y URL son requeridos'); return
    }
    try {
      if (editingId) {
        await updateN8NIntegration(editingId, draft)
        flash('Integración actualizada ✓')
      } else {
        await createN8NIntegration({ ...draft, scope, ...(scope === 'account' ? { accountId } : {}) })
        flash('Integración creada ✓')
      }
      setCreating(false); setEditingId(null); setDraft({ ...BLANK, scope, accountId: scope === 'account' ? accountId : '' })
      reload()
    } catch (e) { flash('Error: ' + e.message) }
  }

  async function startEdit(it) {
    setEditingId(it.id)
    setCreating(true)
    setDraft({
      scope: it.scope, accountId: it.accountId,
      name: it.name, webhookUrl: it.webhookUrl,
      authType: it.authType || 'none', authValue: '', // never pre-fill secrets
      syncMode: it.syncMode || 'fire_forget',
      timeoutMs: it.timeoutMs || 15000,
    })
  }

  async function remove(id) {
    if (!confirm('¿Eliminar esta integración?')) return
    try { await deleteN8NIntegration(id); reload() } catch (e) { flash('Error: ' + e.message) }
  }

  async function test(it) {
    setTestResult({ id: it.id, loading: true })
    try {
      const r = await testN8NIntegration(it.id)
      setTestResult({ id: it.id, ok: r.ok, status: r.status, data: r.data, error: r.error })
    } catch (e) { setTestResult({ id: it.id, ok: false, error: e.message }) }
  }

  return (
    <div className={s.root}>
      {toast && <div className={s.toast}>{toast}</div>}

      <div className={s.header}>
        <div>
          <h2 className={s.title}>🔗 Integraciones N8N</h2>
          <p className={s.sub}>
            {scope === 'platform'
              ? 'Plantillas globales disponibles para todas las cuentas. Los secretos quedan ocultos para los miembros.'
              : 'URLs de webhooks de N8N que tu equipo puede usar en flujos y herramientas IA. Las plantillas globales aparecen como solo lectura.'}
          </p>
        </div>
        <button className={s.primaryBtn} onClick={() => {
          setCreating(c => !c)
          setEditingId(null)
          setDraft({ ...BLANK, scope, accountId: scope === 'account' ? accountId : '' })
        }}>
          {creating ? '✕ Cancelar' : '+ Nueva integración'}
        </button>
      </div>

      {creating && (
        <div className={s.formCard}>
          <div className={s.formTitle}>{editingId ? 'Editar integración' : 'Nueva integración N8N'}</div>
          <div className={s.formGrid}>
            <div className={s.field}>
              <label>Nombre</label>
              <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Ej: CRM externo, Notificaciones Slack..." />
            </div>
            {scope === 'platform' && accounts.length > 0 && (
              <div className={s.field}>
                <label>Cuenta (opcional)</label>
                <select value={draft.accountId || ''} onChange={e => setDraft(d => ({ ...d, accountId: e.target.value }))}>
                  <option value="">Disponible para todas</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
            <div className={s.field} style={{ gridColumn: '1 / -1' }}>
              <label>URL del Webhook Node (n8n)</label>
              <input value={draft.webhookUrl} onChange={e => setDraft(d => ({ ...d, webhookUrl: e.target.value }))} placeholder="https://n8n.tudominio.com/webhook/abc-xyz" style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            <div className={s.field}>
              <label>Tipo de autenticación</label>
              <select value={draft.authType} onChange={e => setDraft(d => ({ ...d, authType: e.target.value }))}>
                {AUTH_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {draft.authType !== 'none' && (
              <div className={s.field}>
                <label>Valor de auth {editingId ? '(deja vacío para no cambiarlo)' : ''}</label>
                <input type="password" value={draft.authValue} onChange={e => setDraft(d => ({ ...d, authValue: e.target.value }))}
                  placeholder={
                    draft.authType === 'header' ? 'X-Header-Name: valor' :
                    draft.authType === 'basic'  ? 'usuario:contraseña' :
                    'token'
                  }
                  style={{ fontFamily: 'monospace', fontSize: 12 }} />
              </div>
            )}
            <div className={s.field}>
              <label>Modo de respuesta</label>
              <select value={draft.syncMode} onChange={e => setDraft(d => ({ ...d, syncMode: e.target.value }))}>
                {SYNC_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label>Timeout (ms)</label>
              <input type="number" min="1000" max="60000" step="1000" value={draft.timeoutMs} onChange={e => setDraft(d => ({ ...d, timeoutMs: parseInt(e.target.value) || 15000 }))} />
            </div>
          </div>
          <div className={s.formActions}>
            <button className={s.cancelBtn} onClick={() => { setCreating(false); setEditingId(null) }}>Cancelar</button>
            <button className={s.primaryBtn} onClick={save}>{editingId ? 'Guardar cambios' : 'Crear integración'}</button>
          </div>
        </div>
      )}

      {loading && <div className={s.empty}>Cargando...</div>}
      {!loading && list.length === 0 && !creating && (
        <div className={s.empty}>
          Sin integraciones N8N todavía. Crea la primera con <strong>+ Nueva integración</strong>.
        </div>
      )}

      {list.map(it => {
        const isReadOnly = scope === 'account' && it.scope === 'platform'
        return (
          <div key={it.id} className={s.itemCard}>
            <div className={s.itemHeader}>
              <div>
                <div className={s.itemTitle}>
                  {it.scope === 'platform' && <span className={s.badge}>🌐 Global</span>}
                  {it.name}
                  {isReadOnly && <span className={s.badge} style={{ background: 'rgba(150,150,150,.15)', color: 'var(--text3)' }}>solo lectura</span>}
                </div>
                <div className={s.itemMeta}>
                  <code style={{ fontSize: 11 }}>{it.webhookUrl?.slice(0, 60)}{it.webhookUrl?.length > 60 ? '…' : ''}</code>
                </div>
                <div className={s.itemMeta}>
                  Auth: <strong>{it.authType}</strong> · {it.syncMode === 'wait_response' ? '⏳ wait_response' : '🚀 fire_forget'} · timeout {it.timeoutMs}ms
                </div>
              </div>
              <div className={s.itemActions}>
                <button className={s.smallBtn} onClick={() => test(it)}>🧪 Test</button>
                {!isReadOnly && <button className={s.smallBtn} onClick={() => startEdit(it)}>✏ Editar</button>}
                {!isReadOnly && <button className={`${s.smallBtn} ${s.dangerBtn}`} onClick={() => remove(it.id)}>🗑</button>}
              </div>
            </div>
            {testResult?.id === it.id && (
              <div className={`${s.testResult} ${testResult.ok ? s.testOk : s.testFail}`}>
                {testResult.loading ? '⏳ Probando...' : (
                  testResult.ok
                    ? <>✓ Status {testResult.status}{testResult.data ? <> · Response: <code>{(typeof testResult.data === 'string' ? testResult.data : JSON.stringify(testResult.data)).slice(0, 200)}</code></> : ''}</>
                    : <>✗ {testResult.error || 'Status ' + testResult.status}</>
                )}
              </div>
            )}
            <div className={s.idLine}><strong>ID:</strong> <code>{it.id}</code> <span className={s.copyHint}>(úsalo en nodos de flujo y tools IA)</span></div>
          </div>
        )
      })}
    </div>
  )
}
