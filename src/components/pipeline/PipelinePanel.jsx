import { useState, useEffect, useRef } from 'react'
import { useAccount } from '../../context/AccountContext'
import { crmDetectOpportunities, crmLeadScores } from '../../lib/storage'
import PipelineCardModal from './PipelineCardModal'
import CRMFilterBar, { selMatches, numInRange } from '../crm/CRMFilterBar'
import s from './PipelinePanel.module.css'

// Badge de lead score (probabilidad de cierre estimada por IA).
function scoreBadge(v) {
  if (v == null) return null
  if (v >= 70) return { icon: '🔥', color: '#22d98a', label: 'caliente' }
  if (v >= 40) return { icon: '☀️', color: '#f5a623', label: 'templado' }
  return { icon: '❄️', color: '#4fa8ff', label: 'frío' }
}

const COLORS=['#4fa8ff','#f5a623','#7c6fff','#ff6eb4','#22d98a','#2dd4c8','#ff5f5f']

const PRIO = { alta: { color: '#f5a623', label: '⬆ Alta' }, urgente: { color: '#ff5f5f', label: '🔴 Urgente' } }
// Aviso de próxima acción: vencida (roja) o para hoy (ámbar).
function nextActionInfo(card) {
  if (!card.nextActionDate) return null
  const day = 86400000, today = new Date().setHours(0, 0, 0, 0)
  const d = new Date(Number(card.nextActionDate)).setHours(0, 0, 0, 0)
  if (d < today) return { color: '#ff5f5f', label: '📌 vencida', title: `Acción vencida: ${card.nextAction || ''}` }
  if (d < today + day) return { color: '#f5a623', label: '📌 hoy', title: `Acción para hoy: ${card.nextAction || ''}` }
  return { color: '#8b9a90', label: '📌', title: `Próxima acción: ${card.nextAction || ''} (${new Date(Number(card.nextActionDate)).toLocaleDateString('es')})` }
}

// Semáforo de estancamiento: días sin moverse en la etapa actual.
function staleInfo(card){
  const ref = card.movedAt || card.updatedAt || card.createdAt
  if(!ref) return null
  const days = Math.floor((Date.now()-ref)/86400000)
  if(days<3) return null
  if(days<7) return { color:'#f5a623', label:`⏳ ${days}d`, title:`Sin moverse hace ${days} días` }
  return { color:'#ff5f5f', label:`🔴 ${days}d`, title:`Estancado hace ${days} días — necesita atención` }
}

export default function PipelinePanel() {
  const { account, selectedAgent, getAllGuestNames, addPipeline, deletePipeline, addStage, deleteStage, updateStage, reorderStages, addCard, updateCard, moveCard, moveCardToPipeline, deleteCard, reloadDB } = useAccount()
  const [detecting, setDetecting] = useState(false)
  const [detectMsg, setDetectMsg] = useState('')
  const [scores, setScores] = useState({})
  useEffect(() => { if (account?.id) crmLeadScores(account.id).then(r => setScores(r.scores || {})).catch(() => setScores({})) }, [account?.id, account?.pipelines])
  async function detectOps() {
    if (detecting || !account?.id) return
    setDetecting(true); setDetectMsg('')
    try {
      const r = await crmDetectOpportunities(account.id)
      setDetectMsg(r.created ? `✓ ${r.created} oportunidad(es) creada(s)` : 'No hay nuevas oportunidades')
      if (r.created) await reloadDB?.()
    } catch (e) { setDetectMsg('Error: ' + (e.message || 'no se pudo')) }
    setDetecting(false)
    setTimeout(() => setDetectMsg(''), 4000)
  }
  const [selPipeId, setSelPipeId] = useState(account?.pipelines?.[0]?.id)
  const [showNewPipe, setShowNewPipe] = useState(false)
  const [newPipeName, setNewPipeName] = useState('')
  const [showNewStage, setShowNewStage] = useState(false)
  const [newStage, setNewStage] = useState({name:'',color:COLORS[0]})
  const [addCardStage, setAddCardStage] = useState(null)
  const [newCard, setNewCard] = useState({title:'',value:'',contact:''})
  const [contactSearch, setContactSearch] = useState('')
  const [showContactList, setShowContactList] = useState(false)
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [stageDrag, setStageDrag] = useState(null)      // id de la ETAPA que se arrastra (reordenar columnas)
  const [stageDragOver, setStageDragOver] = useState(null)
  const [stageMenu, setStageMenu] = useState(null)      // id de la etapa con el menú ⋮ abierto
  const [editingStage, setEditingStage] = useState(null) // id de la etapa que se está renombrando
  const [editName, setEditName] = useState('')
  const editingRef = useRef(null)                        // evita doble guardado (Enter + blur)
  const [editCard, setEditCard] = useState(null) // {pipeId, card}
  const [modalCard, setModalCard] = useState(null) // card abierta en el popup

  const pipelines = account?.pipelines || []
  const pipe = pipelines.find(p=>p.id===selPipeId)||pipelines[0]
  const stages = [...(pipe?.stages||[])].sort((a,b)=>a.order-b.order)
  const cards = pipe?.cards || []
  const members = account?.members || []

  // ── Filtros del pipeline (sobre los tickets/deals de la vista actual) ─────────
  const [filters, setFilters] = useState({})
  const scoreBucket = v => v == null ? null : v >= 70 ? 'hot' : v >= 40 ? 'warm' : 'cold'
  function followupTags(card){
    const out = []
    if (card.nextActionDate){ const day=86400000, today=new Date().setHours(0,0,0,0); const d=new Date(Number(card.nextActionDate)).setHours(0,0,0,0); if(d<today) out.push('overdue'); else if(d<today+day) out.push('today') }
    if (staleInfo(card)) out.push('stale')
    return out
  }
  function cardMatches(card){
    const f = filters
    if (f.stage?.length    && !f.stage.includes(card.stageId)) return false
    if (f.status?.length   && !f.status.includes(card.status || 'open')) return false
    if (f.priority?.length && !f.priority.includes(card.priority || 'media')) return false
    if (f.owner?.length    && !f.owner.includes(card.ownerId || '')) return false
    if (f.source?.length     && !selMatches(f.source, card.source || '')) return false
    if (f.originType?.length && !f.originType.includes(card.originType || '')) return false
    if (f.tags?.length     && !selMatches(f.tags, Array.isArray(card.tags) ? card.tags : [])) return false
    if (f.value           && !numInRange(card.value, f.value)) return false
    if (f.score?.length){ const b = scoreBucket(scores[card.id]); if (!b || !f.score.includes(b)) return false }
    if (f.followup?.length){ const ts = followupTags(card); if (!ts.some(t => f.followup.includes(t))) return false }
    return true
  }
  const visibleCards = cards.filter(cardMatches)

  // Facetas: etapa/responsable/etiquetas/fuente se derivan de los datos actuales.
  const tagSet = new Set(), srcSet = new Set()
  cards.forEach(c => { (Array.isArray(c.tags) ? c.tags : []).forEach(t => t && tagSet.add(t)); if (c.source) srcSet.add(c.source) })
  const pipeFacets = [
    { id: 'stage',    label: 'Etapa',       icon: '📊', type: 'multiselect', options: stages.map(st => ({ value: st.id, label: st.name, color: st.color })) },
    { id: 'status',   label: 'Estado',      icon: '🚦', type: 'multiselect', options: [{ value: 'open', label: 'Abierto', color: '#4fa8ff' }, { value: 'won', label: 'Ganado', color: '#22d98a' }, { value: 'lost', label: 'Perdido', color: '#ff5f5f' }] },
    { id: 'priority', label: 'Prioridad',   icon: '⚡', type: 'multiselect', options: [{ value: 'baja', label: 'Baja' }, { value: 'media', label: 'Media' }, { value: 'alta', label: 'Alta' }, { value: 'urgente', label: 'Urgente' }] },
    { id: 'owner',    label: 'Responsable', icon: '🧑‍💼', type: 'multiselect', options: [{ value: '', label: '— sin asignar —' }, ...members.map(m => ({ value: m.id, label: m.name || m.email }))] },
    { id: 'originType', label: 'Origen del lead', icon: '🎯', type: 'multiselect', options: [
      { value: 'direct', label: 'Directo', icon: '✦' }, { value: 'ad', label: 'Anuncio', icon: '📢' },
      { value: 'link', label: 'Link', icon: '🔗' }, { value: 'campaign', label: 'Campaña', icon: '📈' },
    ] },
    ...(srcSet.size ? [{ id: 'source', label: 'Fuente', icon: '📍', type: 'multiselect', options: [...srcSet].sort().map(v => ({ value: v, label: v })) }] : []),
    ...(tagSet.size ? [{ id: 'tags',  label: 'Etiquetas', icon: '🏷', type: 'multiselect', options: [...tagSet].sort().map(v => ({ value: v, label: v })) }] : []),
    { id: 'value',    label: 'Valor',       icon: '💲', type: 'range' },
    { id: 'score',    label: 'Score IA',    icon: '🔥', type: 'multiselect', options: [{ value: 'hot', label: 'Caliente', color: '#22d98a' }, { value: 'warm', label: 'Templado', color: '#f5a623' }, { value: 'cold', label: 'Frío', color: '#4fa8ff' }] },
    { id: 'followup', label: 'Seguimiento', icon: '📌', type: 'multiselect', options: [{ value: 'overdue', label: 'Acción vencida' }, { value: 'today', label: 'Acción hoy' }, { value: 'stale', label: 'Estancado' }] },
  ]

  // Guest names from conversations for autocomplete
  const guestNames = getAllGuestNames(selectedAgent?.id)||[]
  const filteredGuests = guestNames.filter(g => g.name.toLowerCase().includes(contactSearch.toLowerCase()))

  function handleAddPipe(e){ e.preventDefault(); if(!newPipeName.trim()) return; addPipeline(newPipeName.trim()); setNewPipeName(''); setShowNewPipe(false) }
  function handleAddStage(e){ e.preventDefault(); if(!newStage.name.trim()) return; addStage(pipe.id, newStage.name, newStage.color); setNewStage({name:'',color:COLORS[0]}); setShowNewStage(false) }
  function handleAddCard(e){
    e.preventDefault(); if(!newCard.title.trim()) return
    addCard(pipe.id, addCardStage, {...newCard})
    setNewCard({title:'',value:'',contact:''}); setContactSearch(''); setAddCardStage(null)
  }

  function onDragStart(cardId){ setDragging(cardId) }
  function onDragOver(e,stageId){ e.preventDefault(); setDragOver(stageId) }
  function onDrop(stageId){ if(dragging) moveCard(pipe.id, dragging, stageId); setDragging(null); setDragOver(null) }

  // Reordenar COLUMNAS (etapas): se arrastra la CABECERA de una columna y se suelta sobre otra.
  function onStageDrop(targetStageId){
    if (stageDrag && stageDrag !== targetStageId){
      const ids = stages.map(s=>s.id)
      const from = ids.indexOf(stageDrag), to = ids.indexOf(targetStageId)
      if (from !== -1 && to !== -1){ ids.splice(to, 0, ids.splice(from, 1)[0]); reorderStages(pipe.id, ids) }
    }
    setStageDrag(null); setStageDragOver(null)
  }

  function cardsForStage(stageId){ return visibleCards.filter(c=>c.stageId===stageId) }

  // ── Renombrar / eliminar etapa (menú ⋮) ──────────────────────────────────
  function startEditStage(stage){ editingRef.current = stage.id; setEditingStage(stage.id); setEditName(stage.name); setStageMenu(null) }
  function commitStage(stage){
    if (editingRef.current !== stage.id) return   // ya guardado (evita Enter + blur dobles)
    editingRef.current = null
    setEditingStage(null)
    const name = editName.trim()
    if (name && name !== stage.name) updateStage(pipe.id, stage.id, { name })
  }
  function cancelEditStage(){ editingRef.current = null; setEditingStage(null) }
  // Cierra el menú ⋮ al hacer clic fuera.
  useEffect(() => {
    if (!stageMenu) return
    const close = () => setStageMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [stageMenu])

  const stageMenuItem = { display:'block', width:'100%', textAlign:'left', padding:'8px 12px', background:'transparent', border:'none', color:'var(--text)', fontSize:12.5, cursor:'pointer' }

  return (
    <div className={s.panel}>
      <div className={s.topBar}>
        <div className={s.pipeSelector}>
          {pipelines.map(p=>(
            <button key={p.id} className={`${s.pipeTab} ${p.id===pipe?.id?s.pipeTabActive:''}`} onClick={()=>setSelPipeId(p.id)}>{p.name}</button>
          ))}
          {showNewPipe?(
            <form onSubmit={handleAddPipe} className={s.inlineForm}>
              <input autoFocus placeholder="Nombre..." value={newPipeName} onChange={e=>setNewPipeName(e.target.value)} className={s.inlineInput}/>
              <button type="submit" className={s.inlineBtn}>Crear</button>
              <button type="button" className={s.cancelBtn} onClick={()=>setShowNewPipe(false)}>✕</button>
            </form>
          ):(
            <button className={s.newPipeBtn} onClick={()=>setShowNewPipe(true)}>+ Pipeline</button>
          )}
        </div>
        <div className={s.pipeActions}>
          {pipe&&(showNewStage?(
            <form onSubmit={handleAddStage} className={s.inlineForm}>
              <input autoFocus placeholder="Etapa..." value={newStage.name} onChange={e=>setNewStage(p=>({...p,name:e.target.value}))} className={s.inlineInput}/>
              <div className={s.colorRow}>{COLORS.map(c=><button key={c} type="button" className={`${s.colorDot} ${newStage.color===c?s.colorDotActive:''}`} style={{background:c}} onClick={()=>setNewStage(p=>({...p,color:c}))}/>)}</div>
              <button type="submit" className={s.inlineBtn}>OK</button>
              <button type="button" className={s.cancelBtn} onClick={()=>setShowNewStage(false)}>✕</button>
            </form>
          ):(
            <button className={s.addStageBtn} onClick={()=>setShowNewStage(true)}>+ Etapa</button>
          ))}
          {pipe&&<button className={s.addStageBtn} onClick={detectOps} disabled={detecting} title="La IA crea deals desde chats con intención de compra (analiza primero las conversaciones en el Dashboard)">{detecting?'Detectando…':'✨ Detectar oportunidades'}</button>}
          {detectMsg&&<span style={{fontSize:11,color:'var(--text3)',alignSelf:'center'}}>{detectMsg}</span>}
          {pipe&&<button className={s.delPipeBtn} onClick={()=>{if(confirm('¿Eliminar pipeline?'))deletePipeline(pipe.id)}}>🗑</button>}
        </div>
      </div>

      {pipe && (
        <div style={{ padding: '10px 14px 0' }}>
          <CRMFilterBar facets={pipeFacets} value={filters} onChange={setFilters}
            right={<span style={{ fontSize: 12, color: 'var(--text3)' }}>{visibleCards.length}/{cards.length} tarjetas</span>} />
        </div>
      )}

      {!pipe?(
        <div className={s.empty}><span>📊</span><p>Crea tu primer pipeline</p></div>
      ):(
        <div className={s.board}>
          {stages.map(stage=>{
            const stageCards=cardsForStage(stage.id)
            return (
              <div key={stage.id} className={`${s.col} ${dragOver===stage.id?s.colOver:''}`}
                style={stageDragOver===stage.id && stageDrag && stageDrag!==stage.id ? { outline:'2px dashed var(--accent,#7c6fff)', outlineOffset:2, borderRadius:8 } : undefined}
                onDragOver={e=>{ e.preventDefault(); if(stageDrag) setStageDragOver(stage.id); else if(dragging) setDragOver(stage.id) }}
                onDrop={()=>{ if(stageDrag) onStageDrop(stage.id); else if(dragging) onDrop(stage.id) }}>
                <div className={s.colHdr}
                  draggable={editingStage!==stage.id}
                  onDragStart={e=>{ e.stopPropagation(); setStageDrag(stage.id) }}
                  onDragEnd={()=>{ setStageDrag(null); setStageDragOver(null) }}
                  style={{ cursor: editingStage===stage.id ? 'default' : 'grab' }}
                  title={editingStage===stage.id ? '' : 'Arrastra para reordenar la etapa'}>
                  <span className={s.colDot} style={{background:stage.color}}/>
                  {editingStage===stage.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={e=>setEditName(e.target.value)}
                      onClick={e=>e.stopPropagation()}
                      onMouseDown={e=>e.stopPropagation()}
                      onKeyDown={e=>{ e.stopPropagation(); if(e.key==='Enter'){ e.preventDefault(); commitStage(stage) } else if(e.key==='Escape'){ cancelEditStage() } }}
                      onBlur={()=>commitStage(stage)}
                      style={{ flex:1, minWidth:0, background:'var(--bg3)', border:'1px solid var(--accent,#7c6fff)', borderRadius:6, color:'var(--text)', padding:'3px 7px', fontSize:12, fontWeight:600, boxSizing:'border-box' }}
                    />
                  ) : (
                    <span className={s.colName}>{stage.name}</span>
                  )}
                  <span className={s.colCount}>{stageCards.length}</span>
                  <div style={{ position:'relative' }} onClick={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}>
                    <button className={s.delStageBtn} title="Opciones de la etapa"
                      style={{ opacity:1, fontSize:15, lineHeight:1 }}
                      onClick={e=>{ e.stopPropagation(); setStageMenu(stageMenu===stage.id ? null : stage.id) }}>⋮</button>
                    {stageMenu===stage.id && (
                      <div style={{ position:'absolute', top:'100%', right:0, marginTop:2, zIndex:30, minWidth:150, background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,.3)', overflow:'hidden' }}>
                        <button style={stageMenuItem} onClick={()=>startEditStage(stage)}>✏️ Renombrar</button>
                        <button style={{...stageMenuItem, color:'var(--red,#ef4444)'}} onClick={()=>{ setStageMenu(null); if(confirm('¿Eliminar etapa?')) deleteStage(pipe.id,stage.id) }}>🗑 Eliminar</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className={s.cardList}>
                  {stageCards.map(card=>(
                    <div key={card.id} className={`${s.card} ${dragging===card.id?s.cardDragging:''}`}
                      draggable onDragStart={()=>onDragStart(card.id)}>
                      <div style={{ cursor: 'pointer' }} onClick={() => setModalCard(card)} title="Ver y editar la tarjeta">
                        <div className={s.cardTitle}>{card.title}</div>
                        {card.contact&&<div className={s.cardContact}>👤 {card.contact}</div>}
                        <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap', marginTop:4 }}>
                          {card.value&&<div className={s.cardValue}>${card.value}</div>}
                          {(() => { const b = scoreBadge(scores[card.id]); return b ? <span title={`Probabilidad de cierre: ${scores[card.id]}% (${b.label})`} style={{ fontSize:10, fontWeight:700, color:b.color, background:b.color+'22', border:`1px solid ${b.color}55`, borderRadius:8, padding:'1px 7px' }}>{b.icon} {scores[card.id]}</span> : null })()}
                          {PRIO[card.priority] && <span title={`Prioridad ${card.priority}`} style={{ fontSize:10, fontWeight:700, color:PRIO[card.priority].color, background:PRIO[card.priority].color+'22', border:`1px solid ${PRIO[card.priority].color}55`, borderRadius:8, padding:'1px 7px' }}>{PRIO[card.priority].label}</span>}
                          {(() => { const na = nextActionInfo(card); return na ? <span title={na.title} style={{ fontSize:10, fontWeight:700, color:na.color, background:na.color+'22', border:`1px solid ${na.color}55`, borderRadius:8, padding:'1px 7px' }}>{na.label}</span> : null })()}
                          {(() => { const st = staleInfo(card); return st ? <span title={st.title} style={{ fontSize:10, fontWeight:700, color:st.color, background:st.color+'22', border:`1px solid ${st.color}55`, borderRadius:8, padding:'1px 7px', marginLeft:'auto' }}>{st.label}</span> : null })()}
                        </div>
                        {card.owner&&<div style={{ fontSize:10.5, color:'var(--text3)', marginTop:4 }}>🧑‍💼 {card.owner}</div>}
                      </div>
                      <div className={s.cardFooter}>
                        {/* Move to stage */}
                        <select className={s.cardMoveSelect} value={card.stageId||''} onChange={e=>moveCard(pipe.id,card.id,e.target.value)} onClick={e=>e.stopPropagation()}>
                          {stages.map(st=><option key={st.id} value={st.id}>{st.name}</option>)}
                        </select>
                        {/* Move to pipeline */}
                        {pipelines.length>1&&(
                          <select className={s.cardMoveSelect} value="" onChange={e=>{const[pId,sId]=e.target.value.split('::');if(pId&&sId)moveCardToPipeline(pipe.id,card.id,pId,sId)}} onClick={e=>e.stopPropagation()}>
                            <option value="" disabled>→ Pipeline</option>
                            {pipelines.filter(p=>p.id!==pipe.id).map(p=>p.stages.map(st=>(
                              <option key={`${p.id}::${st.id}`} value={`${p.id}::${st.id}`}>{p.name}→{st.name}</option>
                            )))}
                          </select>
                        )}
                        <button className={s.cardDelBtn} onClick={()=>deleteCard(pipe.id,card.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>

                {addCardStage===stage.id?(
                  <form className={s.newCardForm} onSubmit={handleAddCard}>
                    <input autoFocus placeholder="Título..." value={newCard.title} onChange={e=>setNewCard(p=>({...p,title:e.target.value}))}/>
                    <div className={s.contactWrapper}>
                      <input placeholder="Contacto (escribe para buscar)..." value={contactSearch}
                        onChange={e=>{setContactSearch(e.target.value);setNewCard(p=>({...p,contact:e.target.value}));setShowContactList(true)}}
                        onFocus={()=>setShowContactList(true)} onBlur={()=>setTimeout(()=>setShowContactList(false),200)}/>
                      {showContactList&&filteredGuests.length>0&&(
                        <div className={s.contactDrop}>
                          {filteredGuests.map(g=>(
                            <button key={g.convId} type="button" className={s.contactOpt}
                              onMouseDown={()=>{setNewCard(p=>({...p,contact:g.name}));setContactSearch(g.name);setShowContactList(false)}}>
                              {g.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input placeholder="Valor ($)" value={newCard.value} onChange={e=>setNewCard(p=>({...p,value:e.target.value}))}/>
                    <div className={s.cardFormActions}>
                      <button type="button" className={s.cancelBtn} onClick={()=>setAddCardStage(null)}>Cancelar</button>
                      <button type="submit" className={s.inlineBtn}>Agregar</button>
                    </div>
                  </form>
                ):(
                  <button className={s.addCardBtn} onClick={()=>setAddCardStage(stage.id)}>+ Agregar</button>
                )}
              </div>
            )
          })}
          {stages.length===0&&<div className={s.noStages}><span>Agrega etapas para construir tu pipeline</span></div>}
        </div>
      )}

      {modalCard && pipe && (
        <PipelineCardModal pipe={pipe} card={modalCard} onClose={() => setModalCard(null)} />
      )}
    </div>
  )
}
