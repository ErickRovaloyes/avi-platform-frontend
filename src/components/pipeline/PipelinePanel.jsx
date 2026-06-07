import { useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import s from './PipelinePanel.module.css'

const COLORS=['#4fa8ff','#f5a623','#7c6fff','#ff6eb4','#22d98a','#2dd4c8','#ff5f5f']

export default function PipelinePanel() {
  const { account, selectedAgent, getAllGuestNames, addPipeline, deletePipeline, addStage, deleteStage, addCard, updateCard, moveCard, moveCardToPipeline, deleteCard } = useAccount()
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
  const [editCard, setEditCard] = useState(null) // {pipeId, card}

  const pipelines = account?.pipelines || []
  const pipe = pipelines.find(p=>p.id===selPipeId)||pipelines[0]
  const stages = [...(pipe?.stages||[])].sort((a,b)=>a.order-b.order)
  const cards = pipe?.cards || []

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

  function cardsForStage(stageId){ return cards.filter(c=>c.stageId===stageId) }

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
          {pipe&&<button className={s.delPipeBtn} onClick={()=>{if(confirm('¿Eliminar pipeline?'))deletePipeline(pipe.id)}}>🗑</button>}
        </div>
      </div>

      {!pipe?(
        <div className={s.empty}><span>📊</span><p>Crea tu primer pipeline</p></div>
      ):(
        <div className={s.board}>
          {stages.map(stage=>{
            const stageCards=cardsForStage(stage.id)
            return (
              <div key={stage.id} className={`${s.col} ${dragOver===stage.id?s.colOver:''}`}
                onDragOver={e=>onDragOver(e,stage.id)} onDrop={()=>onDrop(stage.id)}>
                <div className={s.colHdr}>
                  <span className={s.colDot} style={{background:stage.color}}/>
                  <span className={s.colName}>{stage.name}</span>
                  <span className={s.colCount}>{stageCards.length}</span>
                  <button className={s.delStageBtn} onClick={()=>{if(confirm('¿Eliminar etapa?'))deleteStage(pipe.id,stage.id)}}>✕</button>
                </div>

                <div className={s.cardList}>
                  {stageCards.map(card=>(
                    <div key={card.id} className={`${s.card} ${dragging===card.id?s.cardDragging:''}`}
                      draggable onDragStart={()=>onDragStart(card.id)}>
                      <div className={s.cardTitle}>{card.title}</div>
                      {card.contact&&<div className={s.cardContact}>👤 {card.contact}</div>}
                      {card.value&&<div className={s.cardValue}>${card.value}</div>}
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
    </div>
  )
}
