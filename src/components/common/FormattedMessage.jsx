/**
 * Renderiza el texto de un mensaje preservando los saltos de línea y aplicando
 * formato ligero (negrita, cursiva, código y enlaces) tanto en estilo Markdown
 * (**negrita**, *cursiva*, `código`) como WhatsApp (*negrita*, _cursiva_).
 * Sin dependencias: parser inline propio + white-space: pre-wrap para los saltos.
 */

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|https?:\/\/[^\s]+)/g

function renderInline(text, kp) {
  const out = []
  let last = 0, m, i = 0
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    const key = `${kp}-${i++}`
    if (t.startsWith('**') || t.startsWith('__')) out.push(<strong key={key}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) out.push(<code key={key} style={{ background: 'rgba(127,127,127,.18)', padding: '1px 4px', borderRadius: 4, fontSize: '.92em' }}>{t.slice(1, -1)}</code>)
    else if (t.startsWith('~')) out.push(<s key={key}>{t.slice(1, -1)}</s>)
    else if (t.startsWith('*') || t.startsWith('_')) out.push(<em key={key}>{t.slice(1, -1)}</em>)
    else out.push(<a key={key} href={t} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{t}</a>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export default function FormattedMessage({ text }) {
  const str = String(text ?? '')
  if (!str) return null
  return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderInline(str, 'fm')}</span>
}
