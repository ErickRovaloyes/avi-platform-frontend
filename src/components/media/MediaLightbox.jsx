import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

/**
 * Lightbox de media in-app: previsualiza imágenes, videos, PDF y texto SIN salir
 * a una pestaña nueva. Se abre disparando `openMediaLightbox({url,kind,mime,filename})`
 * desde cualquier parte; el componente se monta una sola vez (en el shell).
 */
export function openMediaLightbox(item) {
  window.dispatchEvent(new CustomEvent('avi-lightbox', { detail: item }))
}

const EMBEDDABLE = /(pdf|^text\/|json|xml|csv|html)/i
function fmtSize(b) {
  if (!b) return ''
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(2) + ' MB'
}

export default function MediaLightbox() {
  const [item, setItem] = useState(null)
  const [zoom, setZoom] = useState(false)
  const close = useCallback(() => { setItem(null); setZoom(false) }, [])

  useEffect(() => {
    const onOpen = e => { setItem(e.detail); setZoom(false) }
    window.addEventListener('avi-lightbox', onOpen)
    return () => window.removeEventListener('avi-lightbox', onOpen)
  }, [])
  useEffect(() => {
    if (!item) return
    const onKey = e => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [item, close])

  if (!item) return null
  const { url, kind, mime = '', filename, sizeBytes } = item
  const isImg = kind === 'image' || kind === 'sticker' || /^image\//.test(mime)
  const isVid = kind === 'video' || /^video\//.test(mime)
  const isAud = kind === 'audio' || /^audio\//.test(mime)
  const canEmbed = !isImg && !isVid && !isAud && (EMBEDDABLE.test(mime) || /\.(pdf|txt|csv|json|xml|html?)($|\?)/i.test(url || ''))

  const overlay = { position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', flexDirection: 'column',
    background: 'rgba(4,7,10,.86)', WebkitBackdropFilter: 'blur(14px)', backdropFilter: 'blur(14px)',
    animation: 'aviFadeIn .18s ease both' }
  const bar = { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', flexShrink: 0, color: '#e8edf3' }
  const name = { flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
    color: '#e8edf3', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', textDecoration: 'none' }
  const stage = { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px 20px' }

  return createPortal(
    <div style={overlay} onClick={close}>
      <div style={bar} onClick={e => e.stopPropagation()}>
        <span style={name}>{filename || (isImg ? 'Imagen' : isVid ? 'Video' : 'Archivo')}{sizeBytes ? ` · ${fmtSize(sizeBytes)}` : ''}</span>
        <a href={url} download={filename || true} style={btn} onClick={e => e.stopPropagation()}>⤓ Descargar</a>
        <button style={btn} onClick={close} aria-label="Cerrar">✕</button>
      </div>
      <div style={stage} onClick={close}>
        {isImg && (
          <img src={url} alt={filename || ''} onClick={e => { e.stopPropagation(); setZoom(z => !z) }}
            style={{ maxWidth: zoom ? 'none' : '100%', maxHeight: zoom ? 'none' : '100%', width: zoom ? 'auto' : undefined,
              objectFit: 'contain', borderRadius: 10, cursor: zoom ? 'zoom-out' : 'zoom-in',
              boxShadow: '0 20px 60px rgba(0,0,0,.5)' }} />
        )}
        {isVid && (
          <video src={url} controls autoPlay onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,.5)' }} />
        )}
        {isAud && (
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, padding: 24, minWidth: 320 }}>
            <div style={{ color: '#e8edf3', fontSize: 13, marginBottom: 12 }}>🎤 {filename || 'Audio'}</div>
            <audio src={url} controls autoPlay style={{ width: '100%' }} />
          </div>
        )}
        {canEmbed && (
          <iframe src={url} title={filename || 'documento'} onClick={e => e.stopPropagation()}
            style={{ width: 'min(1000px,100%)', height: '100%', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, background: '#fff' }} />
        )}
        {!isImg && !isVid && !isAud && !canEmbed && (
          <div onClick={e => e.stopPropagation()} style={{ textAlign: 'center', color: '#e8edf3', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 16, padding: '36px 40px' }}>
            <div style={{ fontSize: 46, marginBottom: 10 }}>📄</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{filename || 'Archivo'}</div>
            <div style={{ fontSize: 12, color: '#8b97a6', marginBottom: 18 }}>{(mime || '').split('/').pop()}{sizeBytes ? ` · ${fmtSize(sizeBytes)}` : ''} · vista previa no disponible</div>
            <a href={url} download={filename || true} style={{ ...btn, padding: '10px 18px' }}>⤓ Descargar archivo</a>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
