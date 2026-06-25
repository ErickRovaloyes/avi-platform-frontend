import { useState } from 'react'
import { listWhatsAppTemplatesAll, deleteWhatsAppTemplate } from '../../lib/storage'
import WhatsAppTemplateEditor from './WhatsAppTemplateEditor'

// Pestaña "Plantillas de WhatsApp" dentro del canal de WhatsApp (Canales):
// muestra las plantillas (HSM) de la cuenta de WhatsApp Business y su ESTADO
// (Aprobada / Pendiente / Rechazada …). Solo lectura: las plantillas se crean y
// aprueban en el Administrador de WhatsApp de Meta.

const STATUS = {
  APPROVED:          { label: 'Aprobada',      color: '#22d98a', bg: 'rgba(34,217,138,.14)' },
  PENDING:           { label: 'Pendiente',     color: '#f5a623', bg: 'rgba(245,166,35,.14)' },
  IN_APPEAL:         { label: 'En apelación',  color: '#f5a623', bg: 'rgba(245,166,35,.14)' },
  PENDING_DELETION:  { label: 'Por eliminar',  color: '#f5a623', bg: 'rgba(245,166,35,.14)' },
  REJECTED:          { label: 'Rechazada',     color: '#ff5f5f', bg: 'rgba(255,95,95,.12)' },
  DISABLED:          { label: 'Deshabilitada', color: '#ff5f5f', bg: 'rgba(255,95,95,.12)' },
  PAUSED:            { label: 'Pausada',        color: '#ff5f5f', bg: 'rgba(255,95,95,.12)' },
}
function statusInfo(s) { return STATUS[s] || { label: s || 'Desconocido', color: 'var(--text2)', bg: 'var(--bg2)' } }

// Texto del cuerpo de la plantilla (para previsualizar de qué trata).
function bodyText(components = []) {
  const b = components.find(c => (c.type || '').toUpperCase() === 'BODY')
  return b?.text || ''
}

export default function WhatsAppTemplatesSection({ accId, agentId, channelId, canLoad }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [templates, setTemplates] = useState(null)
  const [editor, setEditor] = useState(null)   // { template } | { template: null } para crear
  const [actionMsg, setActionMsg] = useState(null)

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await listWhatsAppTemplatesAll(accId, agentId, channelId)
      setTemplates(r?.templates || [])
    } catch (e) {
      setError(e?.message || 'No se pudieron cargar las plantillas')
      setTemplates(null)
    }
    setLoading(false)
  }

  async function handleDelete(t) {
    if (!confirm(`¿Eliminar la plantilla "${t.name}"? Esta acción no se puede deshacer.`)) return
    setActionMsg(null)
    try {
      await deleteWhatsAppTemplate(accId, agentId, t.name, channelId)
      setActionMsg({ ok: true, text: `Plantilla "${t.name}" eliminada.` })
      load()
    } catch (e) { setActionMsg({ ok: false, text: e?.message || 'No se pudo eliminar.' }) }
  }

  function onEditorDone(text) {
    setEditor(null)
    setActionMsg({ ok: true, text })
    load()
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && templates === null && canLoad && !loading) load()
  }

  const btn = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'space-between',
    padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg)',
    color: 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer', marginTop: 10 }

  return (
    <div>
      <button type="button" style={btn} onClick={toggle}>
        <span>📋 Plantillas de WhatsApp{Array.isArray(templates) ? ` (${templates.length})` : ''}</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg2)' }}>
          {!canLoad ? (
            <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>
              Conecta el canal de WhatsApp (con <strong>Business Account ID</strong> y <strong>Access Token</strong>) para ver tus plantillas.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, color: 'var(--text3)', flex: 1, minWidth: 180 }}>Crea plantillas aquí (las revisa Meta) o gestiónalas en el Administrador de WhatsApp.</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={load} disabled={loading}
                    style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {loading ? '⏳' : '↻ Actualizar'}
                  </button>
                  {!editor && (
                    <button type="button" onClick={() => { setActionMsg(null); setEditor({ template: null }) }}
                      style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      ➕ Nueva plantilla
                    </button>
                  )}
                </div>
              </div>

              {actionMsg && (
                <div style={{ marginBottom: 8, padding: '8px 11px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                  background: actionMsg.ok ? 'rgba(34,217,138,.12)' : 'rgba(255,95,95,.12)', color: actionMsg.ok ? '#22d98a' : '#ff5f5f',
                  border: `1px solid ${actionMsg.ok ? 'rgba(34,217,138,.35)' : 'rgba(255,95,95,.35)'}` }}>{actionMsg.text}</div>
              )}

              {editor && (
                <WhatsAppTemplateEditor
                  accId={accId} agentId={agentId} channelId={channelId}
                  editing={editor.template}
                  onDone={onEditorDone}
                  onCancel={() => setEditor(null)}
                />
              )}

              {loading && <div style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0' }}>Cargando plantillas…</div>}
              {error && <div style={{ fontSize: 12.5, color: '#ff5f5f', padding: '8px 0' }}>⚠ {error}</div>}

              {!editor && !loading && !error && Array.isArray(templates) && templates.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0' }}>No hay plantillas en esta cuenta de WhatsApp Business.</div>
              )}

              {!editor && !loading && !error && Array.isArray(templates) && templates.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {templates.map((t, i) => {
                    const si = statusInfo(t.status)
                    const body = bodyText(t.components)
                    return (
                      <div key={`${t.name}_${t.language}_${i}`} style={{ border: '1px solid var(--border2)', borderRadius: 9, padding: '10px 12px', background: 'var(--bg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, color: si.color, background: si.bg }}>{si.label}</span>
                          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{t.language}</span>
                          {t.category && <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'capitalize' }}>· {String(t.category).toLowerCase()}</span>}
                          <span style={{ flex: 1 }} />
                          <button type="button" title="Editar" onClick={() => { setActionMsg(null); setEditor({ template: t }) }}
                            style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>✏️ Editar</button>
                          <button type="button" title="Eliminar" onClick={() => handleDelete(t)}
                            style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--bg2)', color: '#ff5f5f', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>🗑</button>
                        </div>
                        {body && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 5, whiteSpace: 'pre-wrap' }}>{body.length > 220 ? body.slice(0, 220) + '…' : body}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
