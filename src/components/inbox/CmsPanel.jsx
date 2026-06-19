import { useState, useRef } from 'react'
import { useAccount } from '../../context/AccountContext'
import { uploadChatMedia, mediaUrl } from '../../lib/storage'
import { ingestFile, deleteFile as ragDeleteFile, formatBytes } from '../../lib/ragService'
import s from './CmsPanel.module.css'

// Tipos que el pipeline RAG sabe extraer (ver ragService.extractText) + su límite.
const RAG_EXT = ['txt', 'md', 'markdown', 'csv', 'pdf']
const RAG_MAX = 2 * 1024 * 1024

const extOf = (n = '') => (n.split('.').pop() || '').toLowerCase()
const iconFor = k => (k === 'video' ? '🎬' : k === 'audio' ? '🎵' : '📄')

/**
 * CMS — biblioteca de recursos (imágenes/documentos) a nivel de cuenta. El
 * asistente IA puede enviarlos en las conversaciones de dos formas:
 *  - automáticamente, vía la herramienta integrada "enviar_recurso", o
 *  - manualmente, con el nodo de flujo "Enviar recurso (CMS)".
 * Cada recurso tiene nombre, descripción y etiquetas para que la IA elija bien.
 */
export default function CmsPanel() {
  const { account, selectedAgent, addCmsAsset, updateCmsAsset, deleteCmsAsset } = useAccount()
  const accId = account?.id
  const assets = account?.cmsAssets || []

  const [show, setShow] = useState(false)
  const [file, setFile] = useState(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [tags, setTags] = useState('')
  const [doRag, setDoRag] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef(null)

  const ragEligible = !!(file && RAG_EXT.includes(extOf(file.name)) && file.size <= RAG_MAX && account?.openaiKey)

  function pickFile(f) {
    if (!f) return
    setFile(f); setErr('')
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
    if (!(RAG_EXT.includes(extOf(f.name)) && f.size <= RAG_MAX)) setDoRag(false)
  }

  function resetForm() {
    setFile(null); setName(''); setDesc(''); setTags(''); setDoRag(false); setShow(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function submit(e) {
    e.preventDefault()
    if (!file) { setErr('Selecciona un archivo'); return }
    if (!name.trim()) { setErr('Ponle un nombre al recurso'); return }
    setBusy('up'); setErr('')
    try {
      const up = await uploadChatMedia(accId, file, 'cms')
      const tagArr = tags.split(',').map(t => t.trim()).filter(Boolean)
      let ragFileId = null, ragAgentId = null
      if (doRag && ragEligible && selectedAgent) {
        setBusy('rag')
        try {
          const r = await ingestFile({ accId, agId: selectedAgent.id, file, apiKey: account.openaiKey })
          ragFileId = r.fileId; ragAgentId = selectedAgent.id
        } catch (ragErr) {
          setErr('Recurso subido, pero no se pudo indexar en Conocimiento: ' + ragErr.message)
        }
      }
      addCmsAsset({
        name: name.trim(), description: desc.trim(), tags: tagArr,
        kind: up.kind, mediaId: up.mediaId, filename: up.filename, mime: up.mime, sizeBytes: up.sizeBytes,
        ragFileId, ragAgentId,
      })
      resetForm()
    } catch (e2) {
      setErr(e2?.message || 'No se pudo subir el archivo')
    }
    setBusy('')
  }

  async function remove(a) {
    if (!confirm(`¿Eliminar el recurso "${a.name}"? El asistente dejará de poder enviarlo.`)) return
    if (a.ragFileId && a.ragAgentId) { try { await ragDeleteFile(accId, a.ragAgentId, a.ragFileId) } catch { /* noop */ } }
    deleteCmsAsset(a.id)
  }

  function saveTags(a, value) {
    const arr = value.split(',').map(t => t.trim()).filter(Boolean)
    updateCmsAsset(a.id, { tags: arr })
  }

  const filtered = q.trim()
    ? assets.filter(a => `${a.name} ${a.description || ''} ${(a.tags || []).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))
    : assets

  const agentName = selectedAgent?.name || 'el agente'

  return (
    <div className={s.panel}>
      <div className={s.intro}>
        📁 Sube <strong>imágenes y documentos</strong> que el asistente podrá <strong>enviar en las conversaciones</strong>.
        Lo hace de forma automática cuando es relevante (herramienta <code>enviar_recurso</code>) o cuando lo colocas con el
        nodo <code>Enviar recurso (CMS)</code> en un flujo. Dale a cada recurso un <strong>nombre, descripción y etiquetas</strong> claros
        para que la IA elija el correcto.
      </div>

      <div className={s.toolbar}>
        <input className={s.search} placeholder="🔍 Buscar por nombre, descripción o etiqueta…" value={q} onChange={e => setQ(e.target.value)} />
        <button className={s.newBtn} onClick={() => setShow(v => !v)}>{show ? '✕ Cerrar' : '+ Subir recurso'}</button>
      </div>

      {show && (
        <form className={s.form} onSubmit={submit}>
          <div
            className={`${s.drop} ${drag ? s.dropActive : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]) }}
          >
            <span style={{ fontSize: 26 }}>{file ? (file.type?.startsWith('image/') ? '🖼' : '📄') : '⬆'}</span>
            <span>{file ? `${file.name} · ${formatBytes(file.size)}` : 'Arrastra un archivo o haz clic para elegir'}</span>
            <input ref={fileRef} type="file" hidden
              accept="image/*,application/pdf,.txt,.md,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              onChange={e => pickFile(e.target.files?.[0])} />
          </div>

          <div className={s.field}>
            <label>Nombre del recurso *</label>
            <input className={s.input} placeholder="Ej: Catálogo 2026, Lista de precios, Foto producto X" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className={s.field}>
            <label>Descripción <span style={{ fontWeight: 400 }}>(ayuda a la IA a saber cuándo enviarlo)</span></label>
            <textarea className={s.textarea} placeholder="Ej: Catálogo completo de productos con precios y fotos, para clientes que piden ver lo disponible." value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          <div className={s.field}>
            <label>Etiquetas <span style={{ fontWeight: 400 }}>(separadas por coma)</span></label>
            <input className={s.input} placeholder="catálogo, productos, precios" value={tags} onChange={e => setTags(e.target.value)} />
          </div>

          {file && RAG_EXT.includes(extOf(file.name)) && (
            <label className={s.ragRow} title={!account?.openaiKey ? 'Requiere una API key de OpenAI en Ajustes' : (file.size > RAG_MAX ? 'Máximo 2 MB para indexar' : '')}>
              <input type="checkbox" checked={doRag} disabled={!ragEligible} onChange={e => setDoRag(e.target.checked)} />
              📚 Además, indexar su contenido en el <strong>Conocimiento</strong> de {agentName} (RAG), para que también pueda responder preguntas sobre él.
              {!account?.openaiKey && <span style={{ color: 'var(--amber)' }}> · falta API key de OpenAI</span>}
              {account?.openaiKey && file.size > RAG_MAX && <span style={{ color: 'var(--amber)' }}> · máx. 2 MB</span>}
            </label>
          )}

          {err && <div className={s.err}>{err}</div>}
          <div className={s.formActions}>
            <button type="button" className={s.ghostBtn} onClick={resetForm}>Cancelar</button>
            <button type="submit" className={s.newBtn} disabled={!!busy}>
              {busy === 'up' ? 'Subiendo…' : busy === 'rag' ? 'Indexando…' : 'Guardar recurso'}
            </button>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <div className={s.empty}>{assets.length === 0 ? 'Aún no hay recursos. Sube el primero para que el asistente pueda enviarlo.' : 'Sin resultados para tu búsqueda.'}</div>
      ) : (
        <div className={s.grid}>
          {filtered.map(a => (
            <div key={a.id} className={s.card}>
              <div className={s.thumb}>
                {a.kind === 'image'
                  ? <img src={mediaUrl(accId, a.mediaId)} alt={a.name} onError={e => { e.currentTarget.style.display = 'none' }} />
                  : <span>{iconFor(a.kind)}</span>}
              </div>
              <div className={s.cardBody}>
                <input className={s.cardName} defaultValue={a.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== a.name) updateCmsAsset(a.id, { name: v }) }} />
                <textarea className={s.cardDesc} defaultValue={a.description || ''} placeholder="Descripción…" onBlur={e => { if (e.target.value !== (a.description || '')) updateCmsAsset(a.id, { description: e.target.value }) }} />
                <input className={s.tagsInput} defaultValue={(a.tags || []).join(', ')} placeholder="etiquetas, separadas, por coma" onBlur={e => saveTags(a, e.target.value)} />
                <div className={s.cardFoot}>
                  <span className={s.badge}>{a.kind === 'image' ? '🖼 imagen' : a.kind === 'video' ? '🎬 video' : a.kind === 'audio' ? '🎵 audio' : '📄 documento'}</span>
                  {a.sizeBytes ? <span className={s.badge}>{formatBytes(a.sizeBytes)}</span> : null}
                  {a.ragFileId ? <span className={`${s.badge} ${s.badgeRag}`} title="Indexado en el Conocimiento (RAG)">📚 conocimiento</span> : null}
                  <button className={s.delBtn} title="Eliminar" onClick={() => remove(a)}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
