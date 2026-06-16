import { useRef, useState, useEffect } from 'react'
import { uploadMedia } from '../../lib/storage'
import { useAccount } from '../../context/AccountContext'
import s from './MediaInput.module.css'

/**
 * Toolbar that attaches to the right of a chat input. Renders:
 *  - 📎 file picker  (any file)
 *  - 🖼 image picker (mobile camera roll on phones)
 *  - 🎤 microphone   (record-and-send voice note)
 *
 * Props:
 *   accId, agId, convId — destination conversation
 *   sender, senderName  — who is sending (defaults to 'human' / asesor)
 *   onUploaded(msg)     — optional callback after each successful upload
 *   disabled            — bool, hides recording mid-conversation lockouts
 */
export default function MediaInput({ accId, agId, convId, sender = 'human', senderName = '', onUploaded, disabled = false, maxSizeMb, uploadFn }) {
  const fileRef  = useRef(null)
  const imageRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')

  // Effective max size: explicit prop > AccountContext setting > 30 MB default
  const ctx = useAccount?.()
  const platformLimit = ctx?.platformSettings?.mediaMaxSizeMb
  const effectiveMaxMb = maxSizeMb || platformLimit || 30
  const effectiveMaxBytes = effectiveMaxMb * 1024 * 1024

  // ── Audio recording ──────────────────────────────────────────────────────
  const [recording, setRecording] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const recorderRef = useRef(null)
  const chunksRef   = useRef([])
  const streamRef   = useRef(null)
  const timerRef    = useRef(null)

  // ── Vista previa antes de enviar ──────────────────────────────────────────
  // El asesor revisa el audio/imagen/video/archivo y confirma el envío.
  const [pending, setPending] = useState(null) // { file, filename, kind, url, size }

  // Stop recorder if the component unmounts mid-recording
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (pending?.url) URL.revokeObjectURL(pending.url)
  }, [])

  function kindOf(file, filename = '') {
    const mime = file.type || ''
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('video/')) return 'video'
    if (mime.startsWith('audio/') || /\.(ogg|webm|mp3|m4a|wav)$/i.test(filename)) return 'audio'
    return 'file'
  }

  // Pone el archivo en vista previa (no lo envía todavía).
  function stage(file, filenameOverride) {
    if (pending?.url) URL.revokeObjectURL(pending.url)
    const filename = filenameOverride || file.name || 'archivo'
    setPending({ file, filename, kind: kindOf(file, filename), url: URL.createObjectURL(file), size: file.size })
  }

  function cancelPending() {
    if (pending?.url) URL.revokeObjectURL(pending.url)
    setPending(null)
  }

  async function confirmSend() {
    if (!pending) return
    const { file, filename, url } = pending
    setPending(null)
    await send(file, filename)
    if (url) URL.revokeObjectURL(url)
  }

  async function send(file, filenameOverride) {
    // When a custom uploader is provided (team chat / support) we don't need a
    // conversation target. Otherwise require accId/agId/convId.
    if (!uploadFn && (!accId || !agId || !convId)) return
    setError('')
    setUploading(true)
    try {
      const r = uploadFn
        ? await uploadFn(file, filenameOverride)
        : await uploadMedia(accId, agId, convId, file, { sender, senderName, filename: filenameOverride })
      onUploaded?.(r)
    } catch (e) {
      setError(e.message || 'Error al subir')
      setTimeout(() => setError(''), 3500)
    }
    setUploading(false)
  }

  function pickFile()  { fileRef.current?.click() }
  function pickImage() { imageRef.current?.click() }

  function handleFile(e) {
    const f = e.target.files?.[0]
    e.target.value = '' // allow same file again
    if (!f) return
    if (f.size > effectiveMaxBytes) {
      setError(`Archivo > ${effectiveMaxMb} MB`)
      setTimeout(() => setError(''), 3500); return
    }
    stage(f)
  }

  async function startRecording() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm' : ''
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorderRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        // Clean up the mic stream
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
        setRecording(false)

        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        if (blob.size < 200) { setError('Grabación muy corta'); setTimeout(() => setError(''), 2500); return }
        const ext = (rec.mimeType || '').includes('webm') ? 'webm' : 'ogg'
        // A vista previa: el asesor escucha el audio antes de enviarlo.
        stage(blob, `audio_${Date.now()}.${ext}`)
      }
      rec.start()
      setRecording(true)
      setRecSeconds(0)
      const startedAt = Date.now()
      timerRef.current = setInterval(() => setRecSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250)
    } catch (e) {
      setError(e.name === 'NotAllowedError' ? 'Permiso de micrófono denegado' : 'No se pudo acceder al micrófono')
      setTimeout(() => setError(''), 3500)
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }

  function cancelRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      // Throw away the chunks before stopping
      chunksRef.current = []
      recorderRef.current.onstop = () => {
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
        setRecording(false)
      }
      recorderRef.current.stop()
    }
  }

  const fmtTime = s => {
    const m = Math.floor(s / 60), sec = s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  const fmtSize = b => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

  return (
    <div className={s.wrap}>
      <input ref={fileRef}  type="file" hidden onChange={handleFile} />
      <input ref={imageRef} type="file" hidden accept="image/*,video/*" onChange={handleFile} />

      {/* Vista previa antes de enviar */}
      {pending && (
        <div className={s.previewOverlay} onClick={cancelPending}>
          <div className={s.previewCard} onClick={e => e.stopPropagation()}>
            <div className={s.previewHead}>
              <span>Vista previa</span>
              <button type="button" className={s.previewClose} onClick={cancelPending} title="Descartar">✕</button>
            </div>
            <div className={s.previewBody}>
              {pending.kind === 'image' && <img src={pending.url} alt={pending.filename} className={s.previewImg} />}
              {pending.kind === 'video' && <video src={pending.url} controls className={s.previewVideo} />}
              {pending.kind === 'audio' && <audio src={pending.url} controls className={s.previewAudio} />}
              {pending.kind === 'file' && (
                <div className={s.previewFile}><span className={s.previewFileIcon}>📄</span>
                  <div><div className={s.previewFileName}>{pending.filename}</div><div className={s.previewFileSize}>{fmtSize(pending.size)}</div></div>
                </div>
              )}
              {pending.kind !== 'file' && <div className={s.previewMeta}>{pending.filename} · {fmtSize(pending.size)}</div>}
            </div>
            <div className={s.previewActions}>
              <button type="button" className={s.previewCancel} onClick={cancelPending} disabled={uploading}>Cancelar</button>
              <button type="button" className={s.previewSend} onClick={confirmSend} disabled={uploading}>
                {uploading ? 'Enviando…' : '↑ Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {recording ? (
        <div className={s.recordingPanel}>
          <span className={s.recDot} />
          <span className={s.recTime}>{fmtTime(recSeconds)}</span>
          <button type="button" className={s.recCancel} onClick={cancelRecording} title="Cancelar">✕</button>
          <button type="button" className={s.recStop}   onClick={stopRecording}   title="Detener y enviar">↑</button>
        </div>
      ) : (
        <>
          <button type="button" className={s.btn} onClick={pickImage} title="Imagen o video" disabled={disabled || uploading}>🖼</button>
          <button type="button" className={s.btn} onClick={pickFile}  title="Archivo"         disabled={disabled || uploading}>📎</button>
          <button type="button" className={s.btn} onClick={startRecording} title="Grabar audio" disabled={disabled || uploading}>🎤</button>
        </>
      )}

      {uploading && <span className={s.statusMsg}>Subiendo...</span>}
      {error     && <span className={s.errMsg}>{error}</span>}
    </div>
  )
}
