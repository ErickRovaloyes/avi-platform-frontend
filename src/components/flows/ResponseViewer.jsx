import { useState, useMemo, useEffect } from 'react'
import s from './ResponseViewer.module.css'

/**
 * Modal grande para inspeccionar una respuesta JSON/texto:
 *  - JSON pretty con resaltado
 *  - Búsqueda dentro del contenido
 *  - Copiar todo / copiar como JSON minificado / descargar como .json
 *  - Modo crudo (raw text) vs pretty
 *
 * Props:
 *   title:    string para el header
 *   subtitle: opcional
 *   data:     cualquier valor (objeto, array, string, number…)
 *   onClose:  () => void
 */
export default function ResponseViewer({ title = 'Respuesta', subtitle, data, onClose }) {
  const [mode, setMode] = useState('pretty') // 'pretty' | 'raw'
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Si llega un string que es JSON, parsealo para poder pretty-printar.
  const parsed = useMemo(() => {
    if (typeof data === 'string') {
      const t = data.trim()
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
        try { return JSON.parse(data) } catch {}
      }
      return data
    }
    return data
  }, [data])

  const pretty = useMemo(() => {
    if (parsed === undefined) return ''
    if (typeof parsed === 'string') return parsed
    try { return JSON.stringify(parsed, null, 2) } catch { return String(parsed) }
  }, [parsed])

  const raw = useMemo(() => {
    if (typeof data === 'string') return data
    try { return JSON.stringify(data) } catch { return String(data) }
  }, [data])

  // Filtrar líneas para búsqueda
  const visiblePretty = useMemo(() => {
    if (!query.trim()) return pretty
    const q = query.toLowerCase()
    const lines = pretty.split('\n')
    return lines.filter(l => l.toLowerCase().includes(q)).join('\n') || '(sin coincidencias)'
  }, [pretty, query])

  const byteSize = new Blob([raw]).size
  const lineCount = pretty.split('\n').length

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // Fallback antiguo
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
      setCopied(label)
      setTimeout(() => setCopied(null), 1500)
    }
  }

  function downloadFile() {
    const blob = new Blob([pretty], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `respuesta_${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className={s.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        {/* Header */}
        <div className={s.header}>
          <div className={s.titleBlock}>
            <h3 className={s.title}>🌐 {title}</h3>
            {subtitle && <p className={s.subtitle}>{subtitle}</p>}
            <div className={s.metaRow}>
              <span className={s.metaPill}>{fmtBytes(byteSize)}</span>
              <span className={s.metaPill}>{lineCount.toLocaleString('es')} líneas</span>
              <span className={s.metaPill}>{typeLabel(parsed)}</span>
            </div>
          </div>
          <button className={s.closeBtn} onClick={onClose} title="Cerrar (Esc)">✕</button>
        </div>

        {/* Toolbar */}
        <div className={s.toolbar}>
          <div className={s.modeSwitch}>
            <button
              className={`${s.modeBtn} ${mode === 'pretty' ? s.modeBtnActive : ''}`}
              onClick={() => setMode('pretty')}
            >📄 Pretty JSON</button>
            <button
              className={`${s.modeBtn} ${mode === 'raw' ? s.modeBtnActive : ''}`}
              onClick={() => setMode('raw')}
            >🧱 Raw</button>
          </div>

          <input
            type="text"
            className={s.search}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={mode === 'pretty' ? '🔍 Filtrar líneas…' : '🔍 Filtrar (deshabilitado en raw)'}
            disabled={mode === 'raw'}
          />

          <div className={s.copyGroup}>
            <button className={s.copyBtn} onClick={() => copyText(pretty, 'pretty')}>
              {copied === 'pretty' ? '✓ Copiado' : '📋 Copiar pretty'}
            </button>
            <button className={s.copyBtn} onClick={() => copyText(raw, 'raw')}>
              {copied === 'raw' ? '✓ Copiado' : '📋 Copiar raw'}
            </button>
            <button className={s.copyBtn} onClick={downloadFile} title="Descargar como .json">⤓</button>
          </div>
        </div>

        {/* Body */}
        <div className={s.body}>
          <pre className={s.pre}>
            <code
              className={s.code}
              dangerouslySetInnerHTML={{
                __html: mode === 'pretty'
                  ? colorize(visiblePretty, query)
                  : escapeHtml(raw),
              }}
            />
          </pre>
        </div>

        {/* Footer */}
        <div className={s.footer}>
          <span className={s.footerHint}>
            💡 Click derecho en el contenido para copiar selección · Esc para cerrar
          </span>
          <button className={s.doneBtn} onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Colorize a JSON pretty-print string with simple regex-based highlighting.
// Aplica también un highlight amarillo a las coincidencias del query.
function colorize(json, query = '') {
  let out = escapeHtml(json)
  // strings (keys + values)
  out = out.replace(/("(?:\\.|[^"\\])*")(\s*:)?/g, (m, str, colon) => {
    if (colon) return `<span class="json-key">${str}</span>${colon}`
    return `<span class="json-str">${str}</span>`
  })
  // numbers
  out = out.replace(/\b(-?\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g, '<span class="json-num">$1</span>')
  // booleans + null
  out = out.replace(/\b(true|false|null)\b/g, '<span class="json-bool">$1</span>')
  // search highlight
  if (query.trim()) {
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`(${safe})`, 'gi'), '<mark>$1</mark>')
  }
  return out
}

function fmtBytes(b) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
}

function typeLabel(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return `array · ${v.length} items`
  if (typeof v === 'object') return `object · ${Object.keys(v).length} keys`
  return typeof v
}
