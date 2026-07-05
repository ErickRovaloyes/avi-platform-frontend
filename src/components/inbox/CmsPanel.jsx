import { useState, useRef, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { uploadChatMedia, mediaUrl, getCmsUsage } from '../../lib/storage'
import { ingestFile, deleteFile as ragDeleteFile, formatBytes } from '../../lib/ragService'
import s from './CmsPanel.module.css'

// Tipos que el pipeline RAG sabe extraer (ver ragService.extractText) + su límite.
const RAG_EXT = ['txt', 'md', 'markdown', 'csv', 'pdf']
const RAG_MAX = 2 * 1024 * 1024

const extOf = (n = '') => (n.split('.').pop() || '').toLowerCase()
const iconFor = k => (k === 'video' ? '🎬' : k === 'audio' ? '🎵' : '📄')

// Multiselección de etiquetas globales + crear nueva al vuelo.
function TagSelect({ allTags, selected, onToggle, onCreate }) {
  const [val, setVal] = useState('')
  const sel = selected || []
  return (
    <div className={s.tagSelect}>
      {allTags.map(t => {
        const on = sel.includes(t.name)
        return <button type="button" key={t.id} className={`${s.tagChip} ${on ? s.tagChipOn : ''}`} onClick={() => onToggle(t.name)}>{on ? '✓ ' : ''}{t.name}</button>
      })}
      <span className={s.tagAdd}>
        <input className={s.tagAddInput} placeholder="+ etiqueta" value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const n = val.trim(); if (n) { onCreate(n); onToggle(n); setVal('') } } }} />
      </span>
    </div>
  )
}

/**
 * CMS — biblioteca de recursos (imágenes/documentos) a nivel de cuenta. El
 * asistente IA los envía con la Herramienta IA Especial "enviar_recurso" o con el
 * nodo de flujo "Enviar recurso (CMS)". Se organizan en carpetas (simples o de
 * "super unidad" = un producto/servicio con varias fotos), con etiquetas y
 * categorías globales para mantenerlas bien parametrizadas.
 */
export default function CmsPanel() {
  const {
    account, selectedAgent,
    addCmsAsset, updateCmsAsset, deleteCmsAsset,
    addCmsFolder, updateCmsFolder, deleteCmsFolder,
    addCmsTag, deleteCmsTag, addCmsCategory, deleteCmsCategory,
  } = useAccount()
  const accId = account?.id
  const assets = account?.cmsAssets || []
  const folders = account?.cmsFolders || []
  const tags = account?.cmsTags || []
  const categories = account?.cmsCategories || []

  const [show, setShow] = useState(false)
  const [file, setFile] = useState(null)
  const [form, setForm] = useState({ name: '', desc: '', folderId: '', category: '', tags: [] })
  const [doRag, setDoRag] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [drag, setDrag] = useState(false)
  const [currentFolder, setCurrentFolder] = useState(null) // null = raíz · folderId = dentro de la carpeta
  const [manage, setManage] = useState(false)
  const [newFolder, setNewFolder] = useState({ name: '', type: 'simple' })
  const [usage, setUsage] = useState(null)  // { usedBytes, quotaBytes }
  const fileRef = useRef(null)

  const refreshUsage = () => { if (accId) getCmsUsage(accId).then(setUsage).catch(() => {}) }
  useEffect(() => { refreshUsage() }, [accId, assets.length])

  const ragEligible = !!(file && RAG_EXT.includes(extOf(file.name)) && file.size <= RAG_MAX && account?.openaiKey)
  const setF = patch => setForm(f => ({ ...f, ...patch }))

  function pickFile(f) {
    if (!f) return
    setFile(f); setErr('')
    if (!form.name) setF({ name: f.name.replace(/\.[^.]+$/, '') })
    if (!(RAG_EXT.includes(extOf(f.name)) && f.size <= RAG_MAX)) setDoRag(false)
  }
  function resetForm() {
    setFile(null); setForm({ name: '', desc: '', folderId: currentFolder || '', category: '', tags: [] })
    setDoRag(false); setShow(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function submit(e) {
    e.preventDefault()
    if (!file) { setErr('Selecciona un archivo'); return }
    if (!form.name.trim()) { setErr('Ponle un nombre al recurso'); return }
    // Pre-chequeo de cuota: evita subir si no cabe en el plan.
    if (usage && (usage.usedBytes + file.size) > usage.quotaBytes) {
      setErr(`Sin espacio en el CMS: tu plan permite ${Math.round(usage.quotaBytes / 1048576)} MB y ya usas ${(usage.usedBytes / 1048576).toFixed(1)} MB. Elimina archivos o mejora tu plan.`)
      return
    }
    setBusy('up'); setErr('')
    try {
      const up = await uploadChatMedia(accId, file, 'cms')
      let ragFileId = null, ragAgentId = null
      if (doRag && ragEligible && selectedAgent) {
        setBusy('rag')
        try { const r = await ingestFile({ accId, agId: selectedAgent.id, file, apiKey: account.openaiKey }); ragFileId = r.fileId; ragAgentId = selectedAgent.id }
        catch (ragErr) { setErr('Recurso subido, pero no se pudo indexar en Conocimiento: ' + ragErr.message) }
      }
      addCmsAsset({
        name: form.name.trim(), description: form.desc.trim(), tags: form.tags,
        folderId: form.folderId || null, category: form.category || '',
        kind: up.kind, mediaId: up.mediaId, filename: up.filename, mime: up.mime, sizeBytes: up.sizeBytes,
        ragFileId, ragAgentId,
      })
      resetForm()
      refreshUsage()
    } catch (e2) { setErr(e2?.message || 'No se pudo subir el archivo') }
    setBusy('')
  }

  async function remove(a) {
    if (!confirm(`¿Eliminar el recurso "${a.name}"? El asistente dejará de poder enviarlo.`)) return
    if (a.ragFileId && a.ragAgentId) { try { await ragDeleteFile(accId, a.ragAgentId, a.ragFileId) } catch { /* noop */ } }
    deleteCmsAsset(a.id)
  }
  function ensureTag(name) { if (!tags.some(t => t.name.toLowerCase() === name.toLowerCase())) addCmsTag(name) }
  function toggleAssetTag(a, name) {
    const cur = a.tags || []
    updateCmsAsset(a.id, { tags: cur.includes(name) ? cur.filter(t => t !== name) : [...cur, name] })
  }

  // Navegación tipo explorador de Windows: en la raíz se ven las CARPETAS (como
  // elementos de la galería) + los recursos sueltos; al entrar a una carpeta se
  // ven sus recursos. La búsqueda aplana todo (busca en todos los recursos).
  const searching = !!q.trim()
  const matchesQ = a => `${a.name} ${a.description || ''} ${(a.tags || []).join(' ')} ${a.category || ''}`.toLowerCase().includes(q.trim().toLowerCase())
  const filtered = searching
    ? assets.filter(matchesQ)
    : assets.filter(a => (currentFolder ? a.folderId === currentFolder : !a.folderId))
  const visibleFolders = (searching || currentFolder) ? [] : folders
  const currentFolderObj = folders.find(f => f.id === currentFolder)
  const folderName = id => folders.find(f => f.id === id)?.name
  const agentName = selectedAgent?.name || 'el agente'

  return (
    <div className={s.panel}>
      <div className={s.intro}>
        📁 Sube <strong>imágenes y documentos</strong> que el asistente podrá <strong>enviar en las conversaciones</strong> con la
        herramienta especial <code>enviar_recurso</code> (asígnala a un prompt) o con el nodo <code>Enviar recurso (CMS)</code>.
        Organízalos en <strong>carpetas</strong>: las de tipo <strong>📦 super unidad</strong> agrupan todas las fotos de un producto/servicio
        (se envían juntas, o una concreta si el cliente la pide). Usa <strong>etiquetas y categorías</strong> para que la IA elija bien.
      </div>

      {/* Barra de almacenamiento del CMS (según el plan) */}
      {usage && (() => {
        const pct = usage.quotaBytes ? Math.min(100, (usage.usedBytes / usage.quotaBytes) * 100) : 0
        const full = pct >= 100, near = pct >= 85
        const col = full ? 'var(--red)' : near ? 'var(--amber)' : 'var(--accent)'
        return (
          <div style={{ margin: '4px 0 12px', padding: '10px 14px', background: 'var(--glass-card,var(--bg2))', border: '1px solid var(--border2)', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: 'var(--text2)', fontWeight: 600 }}>💾 Almacenamiento del CMS</span>
              <span style={{ color: full ? 'var(--red)' : 'var(--text2)' }}>{(usage.usedBytes / 1048576).toFixed(1)} / {Math.round(usage.quotaBytes / 1048576)} MB</span>
            </div>
            <div style={{ height: 7, borderRadius: 5, background: 'var(--bg3)', overflow: 'hidden' }}>
              <div style={{ width: pct + '%', height: '100%', background: col, transition: 'width .3s' }} />
            </div>
            {near && <div style={{ fontSize: 11, color: col, marginTop: 6 }}>{full ? 'Sin espacio: elimina archivos o mejora tu plan para subir más.' : 'Te queda poco espacio en tu plan.'}</div>}
          </div>
        )
      })()}

      {/* Migas de pan (ruta actual) tipo explorador de archivos */}
      <div className={s.folderBar}>
        <button className={`${s.folderChip} ${!currentFolder ? s.folderChipActive : ''}`} onClick={() => setCurrentFolder(null)}>🏠 Inicio</button>
        {currentFolder && (
          <>
            <span style={{ color: 'var(--text3)', alignSelf: 'center' }}>/</span>
            <button className={`${s.folderChip} ${s.folderChipActive}`} title={currentFolderObj?.description || ''}>
              {currentFolderObj?.type === 'unit' ? '📦 ' : '📁 '}{currentFolderObj?.name} ({filtered.length})
            </button>
          </>
        )}
        <button className={s.folderManage} onClick={() => setManage(true)}>⚙ Gestionar carpetas</button>
      </div>

      <div className={s.toolbar}>
        <input className={s.search} placeholder="🔍 Buscar en todos los recursos…" value={q} onChange={e => setQ(e.target.value)} />
        <button className={s.newBtn} onClick={() => { setShow(v => !v); if (!show) setF({ folderId: currentFolder || '' }) }}>{show ? '✕ Cerrar' : '+ Subir recurso'}</button>
      </div>

      {show && (
        <form className={s.form} onSubmit={submit}>
          <div className={`${s.drop} ${drag ? s.dropActive : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]) }}>
            <span style={{ fontSize: 26 }}>{file ? (file.type?.startsWith('image/') ? '🖼' : '📄') : '⬆'}</span>
            <span>{file ? `${file.name} · ${formatBytes(file.size)}` : 'Arrastra un archivo o haz clic para elegir'}</span>
            <input ref={fileRef} type="file" hidden
              accept="image/*,application/pdf,.txt,.md,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              onChange={e => pickFile(e.target.files?.[0])} />
          </div>

          <div className={s.field}>
            <label>Nombre del recurso *</label>
            <input className={s.input} placeholder="Ej: Catálogo 2026, Suite presidencial, Foto frontal" value={form.name} onChange={e => setF({ name: e.target.value })} />
          </div>
          <div className={s.field}>
            <label>Descripción <span style={{ fontWeight: 400 }}>(ayuda a la IA a saber cuándo enviarlo)</span></label>
            <textarea className={s.textarea} placeholder="Ej: Vista frontal de la suite con cama king y balcón." value={form.desc} onChange={e => setF({ desc: e.target.value })} />
          </div>
          <div className={s.row}>
            <div className={s.field}>
              <label>Carpeta</label>
              <select className={s.input} value={form.folderId} onChange={e => setF({ folderId: e.target.value })}>
                <option value="">— sin carpeta —</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.type === 'unit' ? '📦 ' : '📁 '}{f.name}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label>Categoría</label>
              <select className={s.input} value={form.category} onChange={e => setF({ category: e.target.value })}>
                <option value="">— sin categoría —</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className={s.field}>
            <label>Etiquetas</label>
            <TagSelect allTags={tags} selected={form.tags} onCreate={ensureTag}
              onToggle={n => setF({ tags: form.tags.includes(n) ? form.tags.filter(t => t !== n) : [...form.tags, n] })} />
          </div>

          {file && RAG_EXT.includes(extOf(file.name)) && (
            <label className={s.ragRow}>
              <input type="checkbox" checked={doRag} disabled={!ragEligible} onChange={e => setDoRag(e.target.checked)} />
              📚 Además, indexar su contenido en el <strong>Conocimiento</strong> de {agentName} (RAG).
              {!account?.openaiKey && <span style={{ color: 'var(--amber)' }}> · falta API key de OpenAI</span>}
              {account?.openaiKey && file.size > RAG_MAX && <span style={{ color: 'var(--amber)' }}> · máx. 2 MB</span>}
            </label>
          )}

          {err && <div className={s.err}>{err}</div>}
          <div className={s.formActions}>
            <button type="button" className={s.ghostBtn} onClick={resetForm}>Cancelar</button>
            <button type="submit" className={s.newBtn} disabled={!!busy}>{busy === 'up' ? 'Subiendo…' : busy === 'rag' ? 'Indexando…' : 'Guardar recurso'}</button>
          </div>
        </form>
      )}

      {filtered.length === 0 && visibleFolders.length === 0 ? (
        <div className={s.empty}>{
          searching ? 'Sin resultados.'
            : currentFolder ? 'Esta carpeta está vacía. Sube un recurso o mueve uno aquí.'
            : (assets.length === 0 && folders.length === 0) ? 'Aún no hay recursos. Sube el primero para que el asistente pueda enviarlo.'
            : 'No hay recursos sueltos. Abre una carpeta o sube un recurso.'
        }</div>
      ) : (
        <div className={s.grid}>
          {visibleFolders.map(f => {
            const count = assets.filter(a => a.folderId === f.id).length
            return (
              <div key={`fld_${f.id}`} className={s.card} style={{ cursor: 'pointer' }} onClick={() => setCurrentFolder(f.id)} title={f.description || 'Abrir carpeta'}>
                <div className={s.thumb} style={{ fontSize: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span>{f.type === 'unit' ? '📦' : '📁'}</span>
                </div>
                <div className={s.cardBody}>
                  <div className={s.cardName} style={{ fontWeight: 700, padding: '4px 0' }}>{f.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {count} elemento{count === 1 ? '' : 's'}{f.type === 'unit' ? ' · 📦 super unidad' : ''}
                  </div>
                  {f.description && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>{f.description}</div>}
                  <div className={s.cardFoot}>
                    <span className={s.badge} style={{ pointerEvents: 'none' }}>Abrir →</span>
                  </div>
                </div>
              </div>
            )
          })}
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
                <div className={s.row} style={{ gap: 6 }}>
                  <select className={s.selectMini} value={a.folderId || ''} onChange={e => updateCmsAsset(a.id, { folderId: e.target.value || null })}>
                    <option value="">📁 sin carpeta</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.type === 'unit' ? '📦 ' : '📁 '}{f.name}</option>)}
                  </select>
                  <select className={s.selectMini} value={a.category || ''} onChange={e => updateCmsAsset(a.id, { category: e.target.value })}>
                    <option value="">🏷 sin categoría</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <TagSelect allTags={tags} selected={a.tags || []} onCreate={ensureTag} onToggle={n => toggleAssetTag(a, n)} />
                <div className={s.cardFoot}>
                  <span className={s.badge}>{a.kind === 'image' ? '🖼' : a.kind === 'video' ? '🎬' : a.kind === 'audio' ? '🎵' : '📄'} {a.sizeBytes ? formatBytes(a.sizeBytes) : ''}</span>
                  {a.folderId && <span className={s.badge}>{folders.find(f => f.id === a.folderId)?.type === 'unit' ? '📦' : '📁'} {folderName(a.folderId)}</span>}
                  {a.ragFileId ? <span className={`${s.badge} ${s.badgeRag}`} title="Indexado en el Conocimiento (RAG)">📚</span> : null}
                  <button className={s.delBtn} title="Eliminar" onClick={() => remove(a)}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {manage && (
        <div className={s.mBackdrop} onClick={e => e.target === e.currentTarget && setManage(false)}>
          <div className={s.mModal}>
            <div className={s.mHead}><strong>⚙ Gestionar CMS</strong><button className={s.ghostBtn} onClick={() => setManage(false)}>✕</button></div>

            <div className={s.mSection}>
              <div className={s.mTitle}>📁 Carpetas</div>
              <div className={s.mNewFolder}>
                <input className={s.input} placeholder="Nombre de la carpeta" value={newFolder.name} onChange={e => setNewFolder(f => ({ ...f, name: e.target.value }))} />
                <select className={s.selectMini} value={newFolder.type} onChange={e => setNewFolder(f => ({ ...f, type: e.target.value }))}>
                  <option value="simple">📁 Simple</option>
                  <option value="unit">📦 Super unidad</option>
                </select>
                <button className={s.newBtn} onClick={() => { const n = newFolder.name.trim(); if (n) { addCmsFolder({ name: n, type: newFolder.type }); setNewFolder({ name: '', type: 'simple' }) } }}>Crear</button>
              </div>
              <span className={s.mHint}>Las carpetas <strong>📦 super unidad</strong> se interpretan como un producto/servicio: al pedirlo, el asistente envía todas sus fotos (o la concreta que pidan).</span>
              {folders.map(f => (
                <div key={f.id} className={s.mRow}>
                  <input className={s.input} defaultValue={f.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== f.name) updateCmsFolder(f.id, { name: v }) }} />
                  <select className={s.selectMini} value={f.type} onChange={e => updateCmsFolder(f.id, { type: e.target.value })}>
                    <option value="simple">📁 Simple</option>
                    <option value="unit">📦 Super unidad</option>
                  </select>
                  <input className={s.input} defaultValue={f.description || ''} placeholder="Descripción (opcional)" onBlur={e => { if (e.target.value !== (f.description || '')) updateCmsFolder(f.id, { description: e.target.value }) }} />
                  <button className={s.delBtn} onClick={() => { if (confirm(`¿Eliminar la carpeta "${f.name}"? Sus recursos quedarán sin carpeta.`)) deleteCmsFolder(f.id) }}>🗑</button>
                </div>
              ))}
              {folders.length === 0 && <span className={s.mHint}>Aún no hay carpetas.</span>}
            </div>

            <div className={s.mSection}>
              <div className={s.mTitle}>🏷 Etiquetas globales</div>
              <ChipManager items={tags} onAdd={addCmsTag} onDelete={deleteCmsTag} placeholder="Nueva etiqueta" />
            </div>
            <div className={s.mSection}>
              <div className={s.mTitle}>🗂 Categorías globales</div>
              <ChipManager items={categories} onAdd={addCmsCategory} onDelete={deleteCmsCategory} placeholder="Nueva categoría" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ChipManager({ items, onAdd, onDelete, placeholder }) {
  const [val, setVal] = useState('')
  return (
    <div>
      <div className={s.mNewFolder}>
        <input className={s.input} placeholder={placeholder} value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const n = val.trim(); if (n) { onAdd(n); setVal('') } } }} />
        <button className={s.newBtn} onClick={() => { const n = val.trim(); if (n) { onAdd(n); setVal('') } }}>Añadir</button>
      </div>
      <div className={s.tagSelect} style={{ marginTop: 8 }}>
        {items.map(it => (
          <span key={it.id} className={s.tagChip}>{it.name}<button type="button" className={s.tagX} onClick={() => onDelete(it.id)}>×</button></span>
        ))}
        {items.length === 0 && <span className={s.mHint}>Aún no hay.</span>}
      </div>
    </div>
  )
}
