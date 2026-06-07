import { useState, useEffect } from 'react'
import { listApiKeys, createApiKey, deleteApiKey } from '../../lib/storage'
import s from './N8NPanel.module.css'

const AVAILABLE_SCOPES = [
  { value: '*',                     label: '🔓 Todos los permisos (*)', dangerous: true },
  { value: 'messages:send',         label: 'Enviar mensajes a conversaciones' },
  { value: 'messages:read',         label: 'Leer mensajes' },
  { value: 'contacts:read',         label: 'Leer contactos' },
  { value: 'contacts:write',        label: 'Crear / editar contactos' },
  { value: 'conversations:read',    label: 'Leer conversaciones' },
  { value: 'conversations:write',   label: 'Modificar conversaciones (asignar, etc.)' },
  { value: 'crm:tasks:write',       label: 'Crear tareas CRM' },
  { value: 'crm:notes:write',       label: 'Crear notas CRM' },
]

/**
 * UI to create/list/revoke API keys for this account. The plaintext key is
 * displayed exactly ONCE — when created — and then never again.
 */
export default function ApiKeysPanel({ accountId }) {
  const [keys, setKeys]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft]       = useState({ name: '', scopes: ['messages:send', 'contacts:write'] })
  const [justCreated, setJustCreated] = useState(null) // shown ONCE
  const [toast, setToast]       = useState('')

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2500) }

  async function reload() {
    if (!accountId) return
    setLoading(true)
    try { setKeys(await listApiKeys(accountId)) } catch { setKeys([]) }
    setLoading(false)
  }
  useEffect(() => { reload() }, [accountId])

  function toggleScope(s) {
    setDraft(d => {
      const has = d.scopes.includes(s)
      return { ...d, scopes: has ? d.scopes.filter(x => x !== s) : [...d.scopes, s] }
    })
  }

  async function save() {
    if (!draft.name?.trim()) { flash('Nombre requerido'); return }
    if (!draft.scopes.length) { flash('Selecciona al menos un permiso'); return }
    try {
      const r = await createApiKey(accountId, draft)
      setJustCreated(r)
      setCreating(false); setDraft({ name: '', scopes: ['messages:send', 'contacts:write'] })
      reload()
    } catch (e) { flash('Error: ' + e.message) }
  }

  async function remove(id) {
    if (!confirm('¿Revocar esta API key? Las integraciones que la usen dejarán de funcionar.')) return
    try { await deleteApiKey(accountId, id); reload() } catch (e) { flash('Error: ' + e.message) }
  }

  return (
    <div className={s.root}>
      {toast && <div className={s.toast}>{toast}</div>}

      <div className={s.header}>
        <div>
          <h2 className={s.title}>🔑 API Keys (entrante)</h2>
          <p className={s.sub}>
            Genera claves para que N8N (o cualquier sistema externo) llame a la API REST de AVI Platform.
            Las claves se envían en el header <code>X-AVI-Key</code>.
          </p>
        </div>
        <button className={s.primaryBtn} onClick={() => setCreating(c => !c)}>
          {creating ? '✕ Cancelar' : '+ Nueva API key'}
        </button>
      </div>

      {justCreated && (
        <div className={s.justCreatedBox}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>✓ API Key creada: {justCreated.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>
            <strong>⚠ Cópiala ahora.</strong> Por seguridad, AVI Platform no la mostrará de nuevo. Si la pierdes, deberás revocarla y crear otra.
          </div>
          <div className={s.keyDisplay}>
            <code>{justCreated.key}</code>
            <button className={s.smallBtn} onClick={() => { navigator.clipboard?.writeText(justCreated.key); flash('Copiada al portapapeles') }}>📋 Copiar</button>
          </div>
          <button className={s.smallBtn} style={{ marginTop: 10 }} onClick={() => setJustCreated(null)}>Cerrar</button>
        </div>
      )}

      {creating && (
        <div className={s.formCard}>
          <div className={s.formTitle}>Nueva API Key</div>
          <div className={s.field}>
            <label>Nombre descriptivo</label>
            <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Ej: N8N producción, Zapier integration..." />
          </div>
          <div className={s.field}>
            <label>Permisos (scopes)</label>
            <div className={s.scopeList}>
              {AVAILABLE_SCOPES.map(sc => (
                <label key={sc.value} className={`${s.scopeItem} ${draft.scopes.includes(sc.value) ? s.scopeActive : ''} ${sc.dangerous ? s.scopeDanger : ''}`}>
                  <input type="checkbox" checked={draft.scopes.includes(sc.value)} onChange={() => toggleScope(sc.value)} />
                  <span>{sc.label}</span>
                  <code className={s.scopeCode}>{sc.value}</code>
                </label>
              ))}
            </div>
          </div>
          <div className={s.formActions}>
            <button className={s.cancelBtn} onClick={() => setCreating(false)}>Cancelar</button>
            <button className={s.primaryBtn} onClick={save}>Generar key</button>
          </div>
        </div>
      )}

      {loading && <div className={s.empty}>Cargando...</div>}
      {!loading && keys.length === 0 && !creating && !justCreated && (
        <div className={s.empty}>Sin API keys todavía. Genera la primera con <strong>+ Nueva API key</strong>.</div>
      )}

      {keys.map(k => (
        <div key={k.id} className={s.itemCard}>
          <div className={s.itemHeader}>
            <div>
              <div className={s.itemTitle}>{k.name}</div>
              <div className={s.itemMeta}>
                <code style={{ fontSize: 11 }}>{k.prefix}…</code>
                {k.lastUsed
                  ? <> · Último uso: {new Date(k.lastUsed).toLocaleString('es')}</>
                  : <> · Nunca usada</>}
                · Creada: {new Date(k.createdAt).toLocaleDateString('es')}
              </div>
              <div className={s.itemMeta}>
                {(k.scopes || []).map(s => <code key={s} className={s.scopeBadge}>{s}</code>)}
              </div>
            </div>
            <div className={s.itemActions}>
              <button className={`${s.smallBtn} ${s.dangerBtn}`} onClick={() => remove(k.id)}>🗑 Revocar</button>
            </div>
          </div>
        </div>
      ))}

      <div className={s.docsBox}>
        <strong>📘 Ejemplo de uso desde N8N:</strong>
        <pre>{`HTTP Request Node
  Method: POST
  URL: https://tu-aviplatform.com/api/v1/messages
  Headers:
    X-AVI-Key: avi_live_...
    Content-Type: application/json
  Body: { "conversationId": "{{ $json.convId }}", "content": "Hola desde N8N" }`}</pre>
      </div>
    </div>
  )
}
