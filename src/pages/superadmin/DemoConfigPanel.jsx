import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getDemoRegistration, setDemoRegistration,
  listDemoTemplates, uploadDemoTemplate, activateDemoTemplate, deleteDemoTemplate, downloadDemoTemplate,
} from '../../lib/storage'

const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 14 }
const btn = (bg, c = '#fff') => ({ padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: bg, color: c, fontSize: 13, fontWeight: 600 })
const mini = (bg, c = '#fff') => ({ padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: bg, color: c, fontSize: 11.5, fontWeight: 600 })
const fmt = ts => ts ? new Date(Number(ts)).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const kb = n => n ? (n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB') : ''

export default function DemoConfigPanel() {
  const [enabled, setEnabled] = useState(true)
  const [templates, setTemplates] = useState([])
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef(null)

  const reload = useCallback(async () => {
    try { const [r, t] = await Promise.all([getDemoRegistration(), listDemoTemplates()]); setEnabled(r?.enabled !== false); setTemplates(t || []) } catch { /* */ }
  }, [])
  useEffect(() => { reload() }, [reload])

  async function toggle() {
    setBusy(true)
    try { await setDemoRegistration(!enabled); await reload() } catch (e) { alert(e.message) }
    setBusy(false)
  }
  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf', 'docx', 'doc'].includes(ext)) { alert(`Ese archivo (.${ext}) no se acepta. La plantilla debe ser PDF o DOCX.`); if (fileRef.current) fileRef.current.value = ''; return }
    if (file.size > 100 * 1024 * 1024) { alert(`El archivo pesa ${(file.size / 1048576).toFixed(1)} MB y el máximo es 100 MB.`); if (fileRef.current) fileRef.current.value = ''; return }
    setBusy(true)
    try { await uploadDemoTemplate(file); await reload() } catch (err) { alert(err?.message || 'No se pudo subir el archivo.') }
    setBusy(false); if (fileRef.current) fileRef.current.value = ''
  }
  async function activate(id) { setBusy(true); try { await activateDemoTemplate(id); await reload() } catch (e) { alert(e.message) } setBusy(false) }
  async function remove(t) { if (!confirm(`¿Eliminar "${t.name}"?`)) return; setBusy(true); try { await deleteDemoTemplate(t.id); await reload() } catch (e) { alert(e.message) } setBusy(false) }
  async function download(t) { try { await downloadDemoTemplate(t.id, t.filename) } catch (e) { alert(e.message) } }

  const active = templates.find(t => t.active)

  return (
    <div style={{ padding: 28, maxWidth: 860, overflowY: 'auto' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>🎁 Configuración de Demo</h1>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 16px' }}>Controla el registro público de cuentas Demo y la plantilla de descubrimiento empresarial que descargan los usuarios.</p>

      {/* Enlace público de registro Demo (único y global) */}
      {(() => {
        const demoUrl = `${window.location.origin}/demo`
        return (
          <div style={{ ...card, borderColor: 'var(--accent-glow)', background: 'var(--accent-dim)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>🔗 Enlace público de registro</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 10 }}>Comparte este enlace para que cualquiera cree su cuenta Demo. Es único y global (no se generan enlaces distintos).</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ flex: 1, minWidth: 200, fontSize: 13, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '9px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{demoUrl}</code>
              <button style={btn('var(--accent)')} onClick={() => { navigator.clipboard?.writeText(demoUrl); setCopied(true); setTimeout(() => setCopied(false), 1800) }}>{copied ? '✓ Copiado' : '📋 Copiar'}</button>
              <a href={demoUrl} target="_blank" rel="noreferrer" style={{ ...btn('transparent', 'var(--text)'), border: '1px solid var(--border2)', textDecoration: 'none' }}>Abrir ↗</a>
            </div>
          </div>
        )
      })()}

      {/* Interruptor de registro */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Registro de cuentas Demo</div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>{enabled ? 'Activo — cualquiera puede registrarse en /demo.' : 'Deshabilitado — el registro público está cerrado.'}</div>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: enabled ? '#22d98a' : '#ff5f5f' }}>{enabled ? '● Activo' : '○ Inactivo'}</span>
          <button style={btn(enabled ? 'transparent' : 'var(--green)', enabled ? 'var(--text2)' : '#fff')} onClick={toggle} disabled={busy}>{enabled ? 'Desactivar' : 'Activar'}</button>
        </span>
      </div>

      {/* Plantilla de descubrimiento */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>📄 Plantilla de Descubrimiento Empresarial</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>PDF o DOCX. Solo una activa a la vez; es la que descargan los usuarios en el onboarding.</div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc" style={{ display: 'none' }} onChange={onFile} />
          <button style={btn('linear-gradient(135deg,var(--accent),var(--accent2))')} onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'Subiendo…' : '⬆ Subir plantilla'}</button>
        </div>

        {active ? (
          <div style={{ background: 'var(--green-dim)', border: '1px solid #22d98a55', borderRadius: 9, padding: '10px 12px', fontSize: 13, marginBottom: 10 }}>
            ✓ Activa: <strong>{active.name}</strong> <span style={{ color: 'var(--text3)' }}>({active.ext?.toUpperCase()} · {kb(active.size_bytes)})</span>
          </div>
        ) : <div style={{ fontSize: 12.5, color: 'var(--amber)', marginBottom: 10 }}>⚠ No hay plantilla activa. Sube una para habilitar el paso de descarga en el onboarding.</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {templates.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 160, fontSize: 13, fontWeight: 600 }}>{t.name} {t.active ? <span style={{ fontSize: 10, color: '#22d98a', border: '1px solid #22d98a', borderRadius: 20, padding: '1px 7px', marginLeft: 6 }}>ACTIVA</span> : null}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{t.ext?.toUpperCase()} · {kb(t.size_bytes)} · {fmt(t.created_at)}</span>
              <button style={mini('transparent', 'var(--text)')} onClick={() => download(t)}>⬇ Descargar</button>
              {!t.active && <button style={mini('var(--accent)')} onClick={() => activate(t.id)} disabled={busy}>Activar</button>}
              <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 15 }} onClick={() => remove(t)}>🗑</button>
            </div>
          ))}
          {templates.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text3)', padding: 14, textAlign: 'center', border: '1px dashed var(--border2)', borderRadius: 8 }}>Sin plantillas. Sube la primera.</div>}
        </div>
      </div>
    </div>
  )
}
