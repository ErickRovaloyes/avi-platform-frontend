import { useState, useEffect, useRef } from 'react'
import { api } from '../../lib/api'
import s from './TutorialsPanel.module.css'

const CATEGORIES = {
  general:'General', webchat:'Webchat', flujos:'Flujos', prompts:'Prompts & IA',
  canales:'Canales', crm:'CRM', superadmin:'Super Admin', integraciones:'Integraciones',
  equipo:'Equipo', soporte:'Soporte',
}
const CAT_COLORS = {
  general:'#888', webchat:'#22d98a', flujos:'#4fa8ff', prompts:'#c179ff',
  canales:'#f5a623', crm:'#ff6b6b', superadmin:'#7c6fff', integraciones:'#2dd4c8',
  equipo:'#f59e0b', soporte:'#ec4899',
}
const BLANK = { title:'', category:'general', excerpt:'', content:'', thumbnail:'', published:true, sort_order:0 }

function getYouTubeId(url) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([^&?/]+)/)
  return m ? m[1] : null
}

function renderContent(text) {
  if (!text) return null
  return text.split('\n').map((line, i) => {
    const videoMatch = line.match(/\{\{video:(.+?)\}\}/)
    if (videoMatch) {
      const ytId = getYouTubeId(videoMatch[1])
      if (ytId) return <iframe key={i} className={s.viewerVideo} src={'https://www.youtube.com/embed/'+ytId} allowFullScreen title="video"/>
      return <a key={i} href={videoMatch[1]} target="_blank" rel="noreferrer">{videoMatch[1]}</a>
    }
    const imgMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/)
    if (imgMatch) return <img key={i} className={s.viewerImg} src={imgMatch[2]} alt={imgMatch[1]}/>
    if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>
    if (line.startsWith('### ')) return <h3 key={i}>{line.slice(4)}</h3>
    if (line.startsWith('> ')) return <blockquote key={i}>{inlineFmt(line.slice(2))}</blockquote>
    if (line.trim() === '') return <br key={i}/>
    return <p key={i}>{inlineFmt(line)}</p>
  })
}

function inlineFmt(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map((p,i) => {
    if(p.startsWith('**')&&p.endsWith('**')) return <strong key={i}>{p.slice(2,-2)}</strong>
    return p
  })
}

function TutorialViewer({ tutorial, onBack }) {
  return (
    <div className={s.viewer}>
      <div className={s.viewerHeader}>
        <button className={s.backBtn} onClick={onBack}>← Volver</button>
        <div className={s.viewerTitle}>{tutorial.title}</div>
        <span className={s.catBadge} style={{
          background:CAT_COLORS[tutorial.category]+'20',
          color:CAT_COLORS[tutorial.category],
          borderColor:CAT_COLORS[tutorial.category]+'50'
        }}>
          {CATEGORIES[tutorial.category]||tutorial.category}
        </span>
      </div>
      {tutorial.thumbnail && <img className={s.viewerThumb} src={tutorial.thumbnail} alt="thumbnail"/>}
      <div className={s.viewerBody}>{renderContent(tutorial.content)}</div>
    </div>
  )
}

function TutorialEditor({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...BLANK, ...initial })
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef(null)
  const isNew = !initial?.id

  function patch(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function insertAtCursor(text) {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart, end = ta.selectionEnd
    const next = form.content.slice(0, start) + text + form.content.slice(end)
    setForm(f => ({ ...f, content: next }))
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + text.length, start + text.length) }, 0)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      if (isNew) await api.post('/api/tutorials', form)
      else await api.put('/api/tutorials/'+initial.id, form)
      onSave()
    } catch { } finally { setSaving(false) }
  }

  return (
    <form className={s.editor} onSubmit={handleSubmit}>
      <div className={s.editorHeader}>
        <button type="button" className={s.backBtn} onClick={onCancel}>← Cancelar</button>
        <div className={s.editorTitle}>{isNew ? 'Nuevo tutorial' : 'Editar tutorial'}</div>
      </div>

      <div className={s.formRow}>
        <div className={s.field}>
          <label className={s.label}>Titulo</label>
          <input className={s.input} required value={form.title}
            onChange={e=>patch('title',e.target.value)} placeholder="Titulo del tutorial"/>
        </div>
        <div className={s.field}>
          <label className={s.label}>Categoria</label>
          <select className={s.input} value={form.category} onChange={e=>patch('category',e.target.value)}>
            {Object.entries(CATEGORIES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className={s.field}>
        <label className={s.label}>Resumen (excerpt)</label>
        <textarea className={s.textarea} rows={2} value={form.excerpt}
          onChange={e=>patch('excerpt',e.target.value)}
          placeholder="Breve descripcion para la tarjeta del tutorial"/>
      </div>

      <div className={s.formRow}>
        <div className={s.field}>
          <label className={s.label}>URL de miniatura (thumbnail)</label>
          <input className={s.input} type="url" value={form.thumbnail}
            onChange={e=>patch('thumbnail',e.target.value)} placeholder="https://..."/>
        </div>
        <div className={s.field}>
          <label className={s.label}>Orden</label>
          <input className={s.input} type="number" value={form.sort_order}
            onChange={e=>patch('sort_order',Number(e.target.value))} min={0}/>
        </div>
      </div>

      <div className={s.field}>
        <label className={s.label}>Contenido</label>
        <div className={s.toolbar}>
          <button type="button" className={s.toolBtn} onClick={()=>insertAtCursor('## Titulo de seccion\n')}>📝 Titulo</button>
          <button type="button" className={s.toolBtn} onClick={()=>insertAtCursor('### Subtitulo\n')}>📌 Subtitulo</button>
          <button type="button" className={s.toolBtn} onClick={()=>insertAtCursor('**texto en negrita**')}>B Negrita</button>
          <button type="button" className={s.toolBtn} onClick={()=>insertAtCursor('> Nota: texto de la nota\n')}>💡 Nota</button>
          <button type="button" className={s.toolBtn} onClick={()=>{
            const url=prompt('URL de la imagen:'); if(url) insertAtCursor('![descripcion]('+url+')\n')
          }}>📷 Imagen</button>
          <button type="button" className={s.toolBtn} onClick={()=>{
            const url=prompt('URL de YouTube:'); if(url) insertAtCursor('{{video:'+url+'}}\n')
          }}>▶ Video</button>
        </div>
        <textarea ref={textareaRef} className={s.textarea+' '+s.monoArea} rows={16}
          value={form.content} onChange={e=>patch('content',e.target.value)}
          placeholder={'## Introduccion\nEscribe el contenido aqui...\n\n### Paso 1\nDescripcion del paso.\n\n{{video:https://youtube.com/watch?v=...}}\n\n![Captura](https://...)'}
        />
      </div>

      <div className={s.toggleRow}>
        <input type="checkbox" id="pub" checked={!!form.published}
          onChange={e=>patch('published',e.target.checked)}/>
        <label htmlFor="pub">Publicado (visible para todos)</label>
      </div>

      <div className={s.formActions}>
        <button type="button" className={s.cancelBtn} onClick={onCancel}>Cancelar</button>
        <button type="submit" className={s.saveBtn} disabled={saving}>
          {saving?'Guardando...':'Guardar tutorial'}
        </button>
      </div>
    </form>
  )
}

export default function TutorialsPanel() {
  const [tutorials, setTutorials] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [filterCat, setFilterCat] = useState('all')

  async function load() {
    setLoading(true)
    try { setTutorials(await api.get('/api/tutorials') || []) } catch { }
    setLoading(false)
  }
  useEffect(()=>{ load() }, [])

  async function handleDelete(id, title) {
    if (!confirm('Eliminar "'+title+'"?')) return
    await api.delete('/api/tutorials/'+id)
    load()
  }

  function openEditor(t=null) { setEditing(t); setView('editor') }
  function openViewer(t) { setViewing(t); setView('viewer') }
  function backToList() { setView('list'); setEditing(null); setViewing(null) }
  function onSave() { backToList(); load() }

  const filtered = filterCat==='all' ? tutorials : tutorials.filter(t=>t.category===filterCat)

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>Tutoriales</h2>
          <p className={s.sub}>Contenido administrable para guiar a los usuarios en el uso de la plataforma.</p>
        </div>
        {view==='list' && <button className={s.addBtn} onClick={()=>openEditor(null)}>+ Nuevo tutorial</button>}
      </div>

      <div className={s.content}>
        {view==='editor' && <TutorialEditor initial={editing} onSave={onSave} onCancel={backToList}/>}
        {view==='viewer' && viewing && <TutorialViewer tutorial={viewing} onBack={backToList}/>}

        {view==='list' && (
          <>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
              {['all',...Object.keys(CATEGORIES)].map(cat=>(
                <button key={cat} onClick={()=>setFilterCat(cat)} style={{
                  padding:'4px 12px', borderRadius:20, border:'1px solid', cursor:'pointer',
                  fontSize:12, fontWeight:600,
                  background: filterCat===cat ? (cat==='all'?'var(--accent-dim)':CAT_COLORS[cat]+'22') : 'var(--bg2)',
                  color: filterCat===cat ? (cat==='all'?'var(--accent)':CAT_COLORS[cat]) : 'var(--text2)',
                  borderColor: filterCat===cat ? (cat==='all'?'var(--accent)':CAT_COLORS[cat]) : 'var(--border2)',
                }}>
                  {cat==='all'?'Todos':CATEGORIES[cat]}
                </button>
              ))}
            </div>

            {loading && <div style={{color:'var(--text2)',padding:40,textAlign:'center'}}>Cargando...</div>}

            {!loading && filtered.length===0 && (
              <div className={s.empty}>
                <span>🎓</span>
                <p>{filterCat==='all'?'No hay tutoriales todavia.':'No hay tutoriales en esta categoria.'}</p>
              </div>
            )}

            {!loading && filtered.length>0 && (
              <div className={s.grid}>
                {filtered.map(t=>(
                  <div key={t.id} className={s.card}>
                    <div className={s.cardThumb}>
                      {t.thumbnail ? <img src={t.thumbnail} alt={t.title}/> : '🎓'}
                    </div>
                    <div className={s.cardBody}>
                      <div className={s.cardTitle}>{t.title}</div>
                      {t.excerpt && <div className={s.cardExcerpt}>{t.excerpt}</div>}
                      <div className={s.cardMeta}>
                        <span className={s.catBadge} style={{
                          background:CAT_COLORS[t.category]+'20',
                          color:CAT_COLORS[t.category],
                          borderColor:CAT_COLORS[t.category]+'50'
                        }}>
                          {CATEGORIES[t.category]||t.category}
                        </span>
                        {!t.published && <span className={s.draftBadge}>Borrador</span>}
                      </div>
                    </div>
                    <div className={s.cardActions}>
                      <button className={s.viewBtn} onClick={()=>openViewer(t)}>👁 Ver</button>
                      <button className={s.editBtn} onClick={()=>openEditor(t)}>✎ Editar</button>
                      <button className={s.delBtn} onClick={()=>handleDelete(t.id,t.title)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
