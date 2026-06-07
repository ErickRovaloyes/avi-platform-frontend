import { useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import s from './LinksPanel.module.css'

export default function LinksPanel() {
  const { account, selectedAgent, addLink, deleteLink, getConvos } = useAccount()
  const [newLabel, setNewLabel] = useState('')
  const [copied, setCopied] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const links = selectedAgent?.links || []
  const convos = getConvos(selectedAgent?.id) || []

  function handleAdd(e) {
    e.preventDefault()
    const label = newLabel.trim() || `Link ${links.length + 1}`
    addLink(selectedAgent.id, label)
    setNewLabel('')
  }

  function copy(linkId) {
    const url = `${window.location.origin}/chat/${account?.id}/${selectedAgent?.id}/${linkId}`
    navigator.clipboard.writeText(url)
    setCopied(linkId)
    setTimeout(() => setCopied(null), 2000)
  }

  function handleDel(linkId) {
    if (confirmDel === linkId) { deleteLink(selectedAgent.id, linkId); setConfirmDel(null) }
    else { setConfirmDel(linkId); setTimeout(() => setConfirmDel(null), 3000) }
  }

  const chatsForLink = (linkId) => convos.filter(c => c.linkId === linkId).length

  if (!selectedAgent) return <div className={s.empty}><span>Selecciona un agente</span></div>

  return (
    <div className={s.panel}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>Webchat Links</h2>
          <p className={s.sub}>Genera links únicos para compartir. Cada visitante recibe un nombre como <strong>Invitado #1001</strong>.</p>
        </div>
      </div>

      <form className={s.addForm} onSubmit={handleAdd}>
        <input
          placeholder="Nombre del link (ej: Instagram, Sitio web, WhatsApp...)"
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
        />
        <button type="submit" className={s.addBtn}>+ Generar link</button>
      </form>

      {links.length === 0 ? (
        <div className={s.emptyLinks}>
          <span>🔗</span>
          <p>No hay links generados</p>
          <small>Crea tu primer link para empezar a recibir conversaciones</small>
        </div>
      ) : (
        <div className={s.list}>
          {links.map(link => {
            const url = `${window.location.origin}/chat/${account?.id}/${selectedAgent?.id}/${link.id}`
            const chats = chatsForLink(link.id)
            const date = new Date(link.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
            return (
              <div key={link.id} className={s.card}>
                <div className={s.cardTop}>
                  <div className={s.cardLeft}>
                    <span className={s.cardLabel}>{link.label}</span>
                    <span className={s.cardDate}>{date}</span>
                  </div>
                  <span className={s.chatCount}>{chats} chat{chats !== 1 ? 's' : ''}</span>
                </div>
                <div className={s.urlBox}>
                  <code className={s.urlText}>{url}</code>
                </div>
                <div className={s.cardActions}>
                  <button className={s.copyBtn} onClick={() => copy(link.id)}>
                    {copied === link.id ? '✓ Copiado' : '⧉ Copiar'}
                  </button>
                  <a href={url} target="_blank" rel="noreferrer" className={s.openBtn}>↗ Abrir</a>
                  <button
                    className={`${s.delBtn} ${confirmDel === link.id ? s.delConfirm : ''}`}
                    onClick={() => handleDel(link.id)}
                  >
                    {confirmDel === link.id ? '¿Confirmar?' : 'Eliminar'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
