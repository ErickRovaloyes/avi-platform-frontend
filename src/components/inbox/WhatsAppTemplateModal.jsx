import { useState, useEffect, useMemo } from 'react'
import { listWhatsAppTemplates, sendWhatsAppTemplate } from '../../lib/storage'

// Extrae el texto del componente BODY de una plantilla
function bodyText(tpl) {
  const body = (tpl.components || []).find(c => (c.type || '').toUpperCase() === 'BODY')
  return body?.text || ''
}
// Cuenta las variables {{1}}, {{2}}... del texto
function varCount(text) {
  const matches = String(text || '').match(/\{\{(\d+)\}\}/g) || []
  return matches.length
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
const box = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(560px, 94vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
const head = { padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
const bodyStyle = { padding: 16, overflowY: 'auto' }
const inp = { padding: 8, fontSize: 13, background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 6, width: '100%', boxSizing: 'border-box' }
const btnPrimary = { padding: '9px 16px', background: 'var(--green, #22d98a)', color: '#06281c', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }
const btnGhost = { padding: '9px 16px', background: 'var(--bg3)', color: 'var(--text1)', border: '1px solid var(--border2)', borderRadius: 8, cursor: 'pointer' }

export default function WhatsAppTemplateModal({ accId, agentId, conv, onClose, onSent }) {
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [templates, setTemplates] = useState([])
  const [selected, setSelected] = useState(null)
  const [vars, setVars]         = useState([])
  const [sending, setSending]   = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setError('')
      try {
        const r = await listWhatsAppTemplates(accId, agentId, conv?.channelId)
        if (!alive) return
        setTemplates(r?.templates || [])
      } catch (e) {
        if (alive) setError(e?.message || 'No se pudieron cargar las plantillas')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [accId, agentId, conv?.channelId])

  function pick(tpl) {
    setSelected(tpl)
    setVars(Array(varCount(bodyText(tpl))).fill(''))
  }

  const preview = useMemo(() => {
    if (!selected) return ''
    let txt = bodyText(selected)
    vars.forEach((v, i) => { txt = txt.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), v || `{{${i + 1}}}`) })
    return txt
  }, [selected, vars])

  const allFilled = vars.every(v => v.trim())

  async function doSend() {
    if (!selected) return
    setSending(true); setError('')
    try {
      const components = vars.length
        ? [{ type: 'body', parameters: vars.map(v => ({ type: 'text', text: v })) }]
        : []
      await sendWhatsAppTemplate(accId, agentId, {
        convId: conv.id,
        channelId: conv.channelId,
        templateName: selected.name,
        language: selected.language || 'es',
        components,
        previewText: preview,
      })
      onSent?.()
      onClose?.()
    } catch (e) {
      setError(e?.message || 'No se pudo enviar la plantilla')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={head}>
          <strong style={{ color: 'var(--text1)' }}>📋 Enviar plantilla de WhatsApp</strong>
          <button style={{ ...btnGhost, padding: '4px 10px' }} onClick={onClose}>✕</button>
        </div>

        <div style={bodyStyle}>
          {loading && <div style={{ color: 'var(--text2)' }}>Cargando plantillas…</div>}
          {error && <div style={{ color: 'var(--red, #ff5f5f)', marginBottom: 10, fontSize: 13 }}>⚠ {error}</div>}

          {!loading && !error && templates.length === 0 && (
            <div style={{ color: 'var(--text2)', fontSize: 13 }}>
              No hay plantillas aprobadas en este número de WhatsApp. Crea y aprueba plantillas en Meta Business Manager,
              y verifica que el canal tenga configurado el <em>Business Account ID</em>.
            </div>
          )}

          {!selected && templates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 4 }}>
                Las plantillas permiten escribir al cliente incluso fuera de la ventana de 24 h.
              </div>
              {templates.map(t => (
                <button key={`${t.name}_${t.language}`} onClick={() => pick(t)}
                  style={{ textAlign: 'left', padding: 10, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, cursor: 'pointer', color: 'var(--text1)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', margin: '2px 0 4px' }}>{t.language} · {t.category}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{bodyText(t).slice(0, 140)}</div>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => setSelected(null)} style={{ ...btnGhost, alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12 }}>← Volver a la lista</button>
              <div style={{ fontWeight: 600, color: 'var(--text1)' }}>{selected.name} <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>({selected.language})</span></div>

              {vars.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Rellena las variables de la plantilla:</div>
                  {vars.map((v, i) => (
                    <input key={i} style={inp} placeholder={`Variable {{${i + 1}}}`} value={v}
                      onChange={e => setVars(arr => arr.map((x, j) => j === i ? e.target.value : x))} />
                  ))}
                </div>
              )}

              <div style={{ fontSize: 12, color: 'var(--text2)' }}>Vista previa:</div>
              <div style={{ padding: 10, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 13, color: 'var(--text1)', whiteSpace: 'pre-wrap' }}>
                {preview || <em style={{ color: 'var(--text3)' }}>(sin contenido)</em>}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button style={btnGhost} onClick={onClose} disabled={sending}>Cancelar</button>
                <button style={{ ...btnPrimary, opacity: (sending || !allFilled) ? .6 : 1 }} onClick={doSend} disabled={sending || !allFilled}>
                  {sending ? 'Enviando…' : 'Enviar plantilla'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
