import { useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import s from './PipelineConvoModal.module.css'

export default function PipelineConvoModal({ conv, agentId, onClose }) {
  const { account, addCard, moveCard, moveCardToPipeline, deleteCard, linkConvoToPipeline, unlinkConvoFromPipeline, reloadConvos } = useAccount()
  const pipelines = account?.pipelines || []
  const [selectedPipeId, setSelectedPipeId] = useState(pipelines[0]?.id || '')
  const [selectedStageId, setSelectedStageId] = useState('')
  const [cardTitle, setCardTitle] = useState(conv.guestName)
  const [cardValue, setCardValue] = useState('')
  const [movePipe, setMovePipe] = useState({})

  const pipe = pipelines.find(p => p.id === selectedPipeId)
  const stages = [...(pipe?.stages||[])].sort((a,b)=>a.order-b.order)
  const linkedCards = (conv.pipelineCards || []).map(pc => {
    const p = pipelines.find(p => p.id === pc.pipelineId)
    const card = p?.cards?.find(c => c.id === pc.cardId)
    return card ? { ...card, pipelineName: p.name, pipelineId: pc.pipelineId } : null
  }).filter(Boolean)

  function handleLink(e) {
    e.preventDefault()
    if (!selectedPipeId || !selectedStageId) return
    linkConvoToPipeline(agentId, conv.id, selectedPipeId, selectedStageId, { title: cardTitle, value: cardValue, contact: conv.guestName })
    reloadConvos()
  }

  function handleMoveCard(card, toPipeId, toStageId) {
    if (card.pipelineId === toPipeId) {
      moveCard(toPipeId, card.id, toStageId)
    } else {
      moveCardToPipeline(card.pipelineId, card.id, toPipeId, toStageId)
    }
    reloadConvos()
  }

  function handleUnlink(card) {
    unlinkConvoFromPipeline(agentId, conv.id, card.pipelineId, card.id)
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e=>e.stopPropagation()}>
        <div className={s.header}>
          <div className={s.title}>📊 Pipeline — {conv.guestName}</div>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {linkedCards.length > 0 && (
          <div className={s.section}>
            <div className={s.sTitle}>Tarjetas actuales</div>
            {linkedCards.map(card => {
              const cardPipe = pipelines.find(p=>p.id===card.pipelineId)
              const cardStage = cardPipe?.stages?.find(st=>st.id===card.stageId)
              return (
                <div key={card.id} className={s.linkedCard}>
                  <div className={s.lcInfo}>
                    <span className={s.lcTitle}>{card.title}</span>
                    <span className={s.lcPipe}>{card.pipelineName}</span>
                    {cardStage&&<span className={s.lcStage} style={{background:cardStage.color+'22',color:cardStage.color}}>{cardStage.name}</span>}
                    {card.value&&<span className={s.lcValue}>${card.value}</span>}
                  </div>
                  <div className={s.lcActions}>
                    {/* Move stage within same pipeline */}
                    <select className={s.moveSelect} value={card.stageId||''}
                      onChange={e=>handleMoveCard(card, card.pipelineId, e.target.value)}>
                      <option value="" disabled>Mover etapa...</option>
                      {cardPipe?.stages?.map(st=><option key={st.id} value={st.id}>{st.name}</option>)}
                    </select>
                    {/* Move to different pipeline */}
                    <select className={s.moveSelect} value=""
                      onChange={e=>{
                        const [pId,sId]=e.target.value.split('::')
                        if(pId&&sId) handleMoveCard(card, pId, sId)
                      }}>
                      <option value="" disabled>Mover a pipeline...</option>
                      {pipelines.filter(p=>p.id!==card.pipelineId).map(p=>
                        p.stages.map(st=>(
                          <option key={`${p.id}::${st.id}`} value={`${p.id}::${st.id}`}>{p.name} → {st.name}</option>
                        ))
                      )}
                    </select>
                    <button className={s.unlinkBtn} onClick={()=>handleUnlink(card)}>Quitar</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className={s.section}>
          <div className={s.sTitle}>Agregar a pipeline</div>
          <form className={s.form} onSubmit={handleLink}>
            <div className={s.row}>
              <div className={s.field}><label>Pipeline</label>
                <select value={selectedPipeId} onChange={e=>{setSelectedPipeId(e.target.value);setSelectedStageId('')}}>
                  {pipelines.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className={s.field}><label>Etapa</label>
                <select value={selectedStageId} onChange={e=>setSelectedStageId(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {stages.map(st=><option key={st.id} value={st.id}>{st.name}</option>)}
                </select>
              </div>
            </div>
            <div className={s.row}>
              <div className={s.field}><label>Título de la tarjeta</label>
                <input value={cardTitle} onChange={e=>setCardTitle(e.target.value)} placeholder="Título..."/>
              </div>
              <div className={s.field}><label>Valor ($)</label>
                <input value={cardValue} onChange={e=>setCardValue(e.target.value)} placeholder="0"/>
              </div>
            </div>
            <button type="submit" className={s.addBtn} disabled={!selectedStageId}>+ Agregar tarjeta</button>
          </form>
        </div>
      </div>
    </div>
  )
}
