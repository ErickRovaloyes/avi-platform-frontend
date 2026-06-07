import { useRef, useState, useEffect } from 'react'
import { mediaUrl } from '../../lib/storage'
import s from './MediaMessage.module.css'

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

/**
 * Renders a media attachment from a message (image / video / audio / file).
 * Props:
 *   accId, mediaId — required; URL is built from these
 *   kind, mime, filename, sizeBytes — metadata
 */
export default function MediaMessage({ accId, mediaId, kind, mime, filename, sizeBytes }) {
  if (!accId || !mediaId) return null
  const url = mediaUrl(accId, mediaId)

  if (kind === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={s.imgWrap}>
        <img src={url} alt={filename || ''} className={s.img} loading="lazy" />
      </a>
    )
  }
  if (kind === 'video') {
    return (
      <div className={s.videoWrap}>
        <video src={url} controls preload="metadata" className={s.video} />
        {filename && <div className={s.fileMeta}>🎬 {filename} <span>· {fmtSize(sizeBytes)}</span></div>}
      </div>
    )
  }
  if (kind === 'audio') {
    return <AudioPlayer url={url} filename={filename} sizeBytes={sizeBytes} />
  }
  // generic file
  return (
    <a href={url} target="_blank" rel="noreferrer" download={filename} className={s.fileBox}>
      <span className={s.fileIcon}>📎</span>
      <div className={s.fileText}>
        <div className={s.fileName}>{filename || 'archivo'}</div>
        <div className={s.fileSub}>{(mime || '').split('/').pop()} · {fmtSize(sizeBytes)} · descargar</div>
      </div>
    </a>
  )
}

// ── Custom audio player with a playable progress bar ────────────────────────
function AudioPlayer({ url, filename, sizeBytes }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)  // 0..1
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    function onTime() {
      setCurrent(a.currentTime)
      setProgress(a.duration > 0 ? a.currentTime / a.duration : 0)
    }
    function onMeta() { setDuration(a.duration || 0) }
    function onEnd() { setPlaying(false); setProgress(0); setCurrent(0) }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('ended', onEnd)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('ended', onEnd)
    }
  }, [])

  function toggle() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) { a.play(); setPlaying(true) }
    else { a.pause(); setPlaying(false) }
  }

  function seek(e) {
    const a = audioRef.current
    if (!a || !a.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    a.currentTime = pct * a.duration
  }

  const fmt = sec => {
    if (!isFinite(sec) || sec < 0) return '0:00'
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className={s.audioWrap}>
      <audio ref={audioRef} src={url} preload="metadata" />
      <button type="button" className={s.audioBtn} onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproducir'}>
        {playing ? '⏸' : '▶'}
      </button>
      <div className={s.audioBody}>
        <div className={s.audioBar} onClick={seek}>
          <div className={s.audioFill} style={{ width: `${progress * 100}%` }} />
        </div>
        <div className={s.audioMeta}>
          <span>🎤 {filename || 'Audio'}</span>
          <span className={s.audioTime}>{fmt(current)} / {fmt(duration)}</span>
        </div>
      </div>
    </div>
  )
}
