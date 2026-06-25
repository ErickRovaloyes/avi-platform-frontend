import { useState } from 'react'
import { createWhatsAppTemplate, updateWhatsAppTemplate } from '../../lib/storage'

// Editor para CREAR o EDITAR una plantilla de WhatsApp. Arma el array de
// `components` que pide la Graph API (HEADER/BODY/FOOTER/BUTTONS) y lo envía.
// Al crear queda PENDING hasta que Meta la apruebe.

const LANGS = [
  ['es', 'Español'], ['es_CO', 'Español (Colombia)'], ['es_MX', 'Español (México)'],
  ['es_AR', 'Español (Argentina)'], ['es_ES', 'Español (España)'],
  ['en', 'Inglés'], ['en_US', 'Inglés (EE.UU.)'], ['pt_BR', 'Portugués (Brasil)'],
]
const CATEGORIES = [
  ['MARKETING', 'Marketing (promos, novedades)'],
  ['UTILITY', 'Utilidad (confirmaciones, avisos)'],
]

const field = { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }
const labelS = { fontSize: 12, fontWeight: 700 }
const inputS = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }
const hintS = { fontSize: 11, color: 'var(--text3)' }

function maxVar(text) {
  let max = 0
  for (const m of String(text || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)) max = Math.max(max, parseInt(m[1]) || 0)
  return max
}

function parseTemplate(t) {
  const comps = t?.components || []
  const find = type => comps.find(c => (c.type || '').toUpperCase() === type)
  const header = find('HEADER'), body = find('BODY'), footer = find('FOOTER'), btns = find('BUTTONS')
  return {
    name: t?.name || '', language: t?.language || 'es', category: (t?.category || 'MARKETING').toUpperCase(),
    headerText: header && (header.format || '').toUpperCase() === 'TEXT' ? (header.text || '') : '',
    body: body?.text || '',
    footerText: footer?.text || '',
    examples: (body?.example?.body_text?.[0] || []).map(String),
    buttons: (btns?.buttons || []).map(b => (b.type || '').toUpperCase() === 'URL'
      ? { kind: 'URL', text: b.text || '', url: b.url || '' }
      : { kind: 'QUICK_REPLY', text: b.text || '', url: '' }),
  }
}

export default function WhatsAppTemplateEditor({ accId, agentId, channelId, editing, onDone, onCancel }) {
  const isEdit = !!editing
  const [form, setForm] = useState(() => editing
    ? parseTemplate(editing)
    : { name: '', language: 'es', category: 'MARKETING', headerText: '', body: '', footerText: '', examples: [], buttons: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const upd = patch => setForm(f => ({ ...f, ...patch }))
  const nVars = maxVar(form.body)

  function setExample(i, v) {
    setForm(f => { const ex = [...(f.examples || [])]; ex[i] = v; return { ...f, examples: ex } })
  }
  function addButton() {
    if ((form.buttons || []).length >= 3) return
    setForm(f => ({ ...f, buttons: [...(f.buttons || []), { kind: 'QUICK_REPLY', text: '', url: '' }] }))
  }
  function updButton(i, patch) {
    setForm(f => { const b = [...f.buttons]; b[i] = { ...b[i], ...patch }; return { ...f, buttons: b } })
  }
  function rmButton(i) { setForm(f => ({ ...f, buttons: f.buttons.filter((_, x) => x !== i) })) }

  function buildComponents() {
    const comps = []
    if (form.headerText.trim()) comps.push({ type: 'HEADER', format: 'TEXT', text: form.headerText.trim() })
    const body = { type: 'BODY', text: form.body }
    if (nVars > 0) body.example = { body_text: [Array.from({ length: nVars }, (_, i) => (form.examples[i] || '').trim() || `ejemplo${i + 1}`)] }
    comps.push(body)
    if (form.footerText.trim()) comps.push({ type: 'FOOTER', text: form.footerText.trim() })
    const btns = (form.buttons || []).filter(b => b.text.trim())
    if (btns.length) comps.push({
      type: 'BUTTONS',
      buttons: btns.map(b => b.kind === 'URL'
        ? { type: 'URL', text: b.text.trim(), url: (b.url || '').trim() }
        : { type: 'QUICK_REPLY', text: b.text.trim() }),
    })
    return comps
  }

  async function save() {
    setError('')
    if (!isEdit && !form.name.trim()) { setError('Ponle un nombre a la plantilla.'); return }
    if (!form.body.trim()) { setError('El cuerpo (body) es obligatorio.'); return }
    if ((form.buttons || []).some(b => b.kind === 'URL' && b.text.trim() && !(b.url || '').trim())) { setError('Los botones de tipo enlace necesitan una URL.'); return }
    setBusy(true)
    try {
      const components = buildComponents()
      if (isEdit) {
        await updateWhatsAppTemplate(accId, agentId, { channelId, templateId: editing.id, category: form.category, components })
        onDone?.('Plantilla actualizada. Meta volverá a revisarla.')
      } else {
        await createWhatsAppTemplate(accId, agentId, { channelId, name: form.name, language: form.language, category: form.category, components })
        onDone?.('Plantilla enviada a Meta. Quedará Pendiente hasta su aprobación.')
      }
    } catch (e) { setError(e?.message || 'No se pudo guardar la plantilla') }
    setBusy(false)
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--bg2)', marginTop: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>{isEdit ? `✏️ Editar plantilla` : '➕ Nueva plantilla'}</div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ ...field, flex: 1, minWidth: 180 }}>
          <label style={labelS}>Nombre {isEdit && <span style={hintS}>(no editable)</span>}</label>
          <input style={inputS} value={form.name} disabled={isEdit}
            onChange={e => upd({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
            placeholder="confirmacion_pedido" />
          {!isEdit && <span style={hintS}>Solo minúsculas, números y guion bajo.</span>}
        </div>
        <div style={{ ...field, width: 190 }}>
          <label style={labelS}>Idioma {isEdit && <span style={hintS}>(no editable)</span>}</label>
          <select style={inputS} value={form.language} disabled={isEdit} onChange={e => upd({ language: e.target.value })}>
            {LANGS.map(([c, n]) => <option key={c} value={c}>{n} · {c}</option>)}
          </select>
        </div>
        <div style={{ ...field, width: 220 }}>
          <label style={labelS}>Categoría</label>
          <select style={inputS} value={form.category} onChange={e => upd({ category: e.target.value })}>
            {CATEGORIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </div>
      </div>

      <div style={field}>
        <label style={labelS}>Encabezado (opcional)</label>
        <input style={inputS} value={form.headerText} onChange={e => upd({ headerText: e.target.value })} placeholder="Texto del encabezado (sin variables)" maxLength={60} />
      </div>

      <div style={field}>
        <label style={labelS}>Cuerpo del mensaje <span style={{ color: '#ff5f5f' }}>*</span></label>
        <textarea style={{ ...inputS, minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }} value={form.body}
          onChange={e => upd({ body: e.target.value })}
          placeholder="Hola {{1}}, tu pedido {{2}} ya está listo. ¡Gracias!" maxLength={1024} />
        <span style={hintS}>Usa {'{{1}}'}, {'{{2}}'}… para variables. Las llenas al enviar.</span>
      </div>

      {nVars > 0 && (
        <div style={{ ...field, gap: 6 }}>
          <label style={labelS}>Ejemplos de las variables (los pide Meta para aprobar)</label>
          {Array.from({ length: nVars }, (_, i) => (
            <input key={i} style={inputS} value={form.examples[i] || ''} onChange={e => setExample(i, e.target.value)}
              placeholder={`Ejemplo para {{${i + 1}}}`} />
          ))}
        </div>
      )}

      <div style={field}>
        <label style={labelS}>Pie de página (opcional)</label>
        <input style={inputS} value={form.footerText} onChange={e => upd({ footerText: e.target.value })} placeholder="Ej: Responde STOP para no recibir más mensajes" maxLength={60} />
      </div>

      <div style={{ ...field, gap: 6 }}>
        <label style={labelS}>Botones (opcional, máx. 3)</label>
        {(form.buttons || []).map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select style={{ ...inputS, width: 150 }} value={b.kind} onChange={e => updButton(i, { kind: e.target.value })}>
              <option value="QUICK_REPLY">Respuesta rápida</option>
              <option value="URL">Enlace (URL)</option>
            </select>
            <input style={{ ...inputS, flex: 1, minWidth: 120 }} value={b.text} onChange={e => updButton(i, { text: e.target.value })} placeholder="Texto del botón" maxLength={25} />
            {b.kind === 'URL' && <input style={{ ...inputS, flex: 1, minWidth: 140 }} value={b.url} onChange={e => updButton(i, { url: e.target.value })} placeholder="https://…" />}
            <button type="button" onClick={() => rmButton(i)} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--bg)', color: '#ff5f5f', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
        {(form.buttons || []).length < 3 && (
          <button type="button" onClick={addButton} style={{ alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 7, border: '1px dashed var(--border2)', background: 'transparent', color: 'var(--text2)', fontSize: 12, cursor: 'pointer' }}>➕ Añadir botón</button>
        )}
      </div>

      {isEdit && (
        <div style={{ ...hintS, marginBottom: 8 }}>⚠ Meta solo permite editar plantillas aprobadas/rechazadas y un número limitado de veces.</div>
      )}
      {error && <div style={{ fontSize: 12.5, color: '#ff5f5f', marginBottom: 8, fontWeight: 600 }}>⚠ {error}</div>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={save} disabled={busy}
          style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          {busy ? '⏳ Guardando…' : (isEdit ? 'Guardar cambios' : 'Crear y enviar a Meta')}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}
          style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
