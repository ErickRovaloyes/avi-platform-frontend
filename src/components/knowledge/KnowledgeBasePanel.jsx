import { useState, useRef } from 'react'
import { useAccount } from '../../context/AccountContext'
import { ingestFile, deleteFile, formatBytes } from '../../lib/ragService'
import s from './KnowledgeBasePanel.module.css'

const ACCEPTED = '.txt,.md,.markdown,.csv,.pdf'

export default function KnowledgeBasePanel() {
  const { account, selectedAgent, updateAgentRag, reloadDB } = useAccount()
  const agent = account?.agents?.find(a => a.id === selectedAgent?.id)
  const rag = agent?.rag || { enabled: false, files: [] }

  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const fileRef = useRef()

  if (!selectedAgent) return <div className={s.empty}>Selecciona un agente</div>

  const apiKey = account?.openaiKey || ''
  const storageBytes = rag.files.reduce((sum, f) => sum + (f.size || 0), 0)
  const totalChunks = rag.files.reduce((s, f) => s + (f.chunkCount || 0), 0)

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2500) }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    fileRef.current.value = ''

    if (!apiKey) {
      setError('Se requiere una API Key de OpenAI para generar embeddings. Configúrala en Configuración.')
      return
    }

    setError('')
    setUploading(true)
    setProgress('Iniciando...')
    setProgressPct(0)

    try {
      await ingestFile({
        accId: account.id,
        agId: selectedAgent.id,
        file,
        apiKey,
        onProgress: (msg, pct) => { setProgress(msg); setProgressPct(pct) },
      })
      reloadDB()
      flash(`"${file.name}" añadido a la base de conocimiento ✓`)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      setProgress('')
      setProgressPct(0)
    }
  }

  async function handleDel(fileId, fileName) {
    if (confirmDel === fileId) {
      await deleteFile(account.id, selectedAgent.id, fileId)
      reloadDB()
      setConfirmDel(null)
      flash(`"${fileName}" eliminado`)
    } else {
      setConfirmDel(fileId)
      setTimeout(() => setConfirmDel(null), 3000)
    }
  }

  function toggleRag() {
    updateAgentRag(selectedAgent.id, { enabled: !rag.enabled })
    flash(rag.enabled ? 'RAG desactivado' : 'RAG activado ✓')
  }

  return (
    <div className={s.panel}>
      {toast && <div className={s.toast}>{toast}</div>}

      <div className={s.header}>
        <div>
          <h2 className={s.title}>Base de Conocimiento (RAG)</h2>
          <p className={s.sub}>
            Sube documentos para que el agente los use como referencia al responder.
            Requiere API Key de OpenAI configurada.
          </p>
        </div>
        <div className={s.toggleWrap}>
          <span className={s.toggleLabel}>{rag.enabled ? 'Activado' : 'Desactivado'}</span>
          <button
            className={`${s.toggle} ${rag.enabled ? s.toggleOn : ''}`}
            onClick={toggleRag}
          >
            <span className={s.toggleThumb} />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className={s.statsBar}>
        <div className={s.stat}><span className={s.statValue}>{rag.files.length}</span><span className={s.statLabel}>archivos</span></div>
        <div className={s.stat}><span className={s.statValue}>{totalChunks}</span><span className={s.statLabel}>fragmentos</span></div>
        <div className={s.stat}><span className={s.statValue}>{formatBytes(storageBytes)}</span><span className={s.statLabel}>almacenamiento</span></div>
        {!apiKey && <div className={s.noKeyWarn}>⚠ Sin API Key de OpenAI — no se pueden subir archivos</div>}
      </div>

      {/* Upload area */}
      <div className={s.uploadArea} onClick={() => !uploading && fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept={ACCEPTED} onChange={handleUpload} hidden />
        {uploading ? (
          <div className={s.uploadProgress}>
            <div className={s.progressBar}><div className={s.progressFill} style={{ width: `${progressPct}%` }} /></div>
            <span className={s.progressText}>{progress}</span>
          </div>
        ) : (
          <>
            <span className={s.uploadIcon}>📎</span>
            <span className={s.uploadText}>Arrastra un archivo o haz clic para subir</span>
            <span className={s.uploadHint}>Soportado: .txt · .md · .csv · .pdf (texto)</span>
          </>
        )}
      </div>

      {error && <div className={s.errorBox}>{error}</div>}

      {/* File list */}
      {rag.files.length === 0 ? (
        <div className={s.emptyFiles}>
          <span className={s.emptyIcon}>📄</span>
          <p>Sin archivos todavía</p>
          <small>Sube tu primer documento para empezar</small>
        </div>
      ) : (
        <div className={s.fileList}>
          <div className={s.fileListHeader}>
            <span>Archivos en la base de conocimiento</span>
            <span>{rag.files.length} archivo{rag.files.length !== 1 ? 's' : ''}</span>
          </div>
          {rag.files.map(f => (
            <div key={f.id} className={s.fileCard}>
              <div className={s.fileIcon}>{fileIcon(f.name)}</div>
              <div className={s.fileMeta}>
                <span className={s.fileName}>{f.name}</span>
                <div className={s.fileDetail}>
                  <span>{formatBytes(f.size)}</span>
                  <span>·</span>
                  <span>{f.chunkCount} fragmentos</span>
                  <span>·</span>
                  <span>{new Date(f.createdAt).toLocaleDateString('es')}</span>
                  <span className={`${s.fileStatus} ${f.status === 'ready' ? s.fileStatusReady : s.fileStatusError}`}>
                    {f.status === 'ready' ? '● Listo' : '● Error'}
                  </span>
                </div>
              </div>
              <button
                className={`${s.delBtn} ${confirmDel === f.id ? s.delConfirm : ''}`}
                onClick={() => handleDel(f.id, f.name)}
              >
                {confirmDel === f.id ? '¿Confirmar?' : '✕ Eliminar'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className={s.infoBox}>
        <strong>¿Cómo funciona?</strong>
        <ul>
          <li>Al subir un archivo, se divide en fragmentos y se generan vectores de búsqueda (embeddings).</li>
          <li>Cuando un usuario envía un mensaje, el sistema busca los fragmentos más relevantes.</li>
          <li>Los fragmentos encontrados se incluyen en el contexto del agente antes de generar la respuesta.</li>
          <li>Solo funciona con el proveedor OpenAI (se usa <code>text-embedding-3-small</code>).</li>
        </ul>
      </div>
    </div>
  )
}

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase()
  if (ext === 'pdf') return '📕'
  if (['csv'].includes(ext)) return '📊'
  if (['md', 'markdown'].includes(ext)) return '📝'
  return '📄'
}
