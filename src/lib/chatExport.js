/**
 * Export a single conversation as JSON or Markdown and trigger a browser download.
 * No external dependencies — uses URL.createObjectURL + a synthetic <a download>.
 */

function fmtTs(ts) {
  if (!ts) return ''
  return new Date(Number(ts)).toLocaleString('es', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function safe(name = '') {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportChatAsJson(conv, { accountName = '', agentName = '' } = {}) {
  const payload = {
    exportedAt: Date.now(),
    accountName, agentName,
    conversation: {
      id: conv.id,
      channel: conv.channel,
      guestName: conv.guestName,
      guestId: conv.guestId,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      labels: conv.labels || [],
      assignedTo: conv.assignedTo || null,
      messageCount: (conv.messages || []).length,
    },
    messages: (conv.messages || []).map(m => ({
      id: m.id, ts: m.ts, sender: m.sender,
      senderName: m.senderName, content: m.content,
      ...(m.mediaId ? { media: { mediaId: m.mediaId, kind: m.kind, mime: m.mime, filename: m.filename, sizeBytes: m.sizeBytes } } : {}),
      ...(m.fromFlow ? { fromFlow: true } : {}),
    })),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const day  = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `chat-${safe(conv.guestName) || 'export'}-${day}.json`)
}

export function exportChatAsMarkdown(conv, { accountName = '', agentName = '' } = {}) {
  const lines = []
  lines.push(`# Conversación con ${conv.guestName || '(sin nombre)'}`)
  lines.push('')
  if (accountName) lines.push(`**Cuenta:** ${accountName}`)
  if (agentName)   lines.push(`**Agente:** ${agentName}`)
  lines.push(`**Canal:** ${conv.channel || 'webchat'}`)
  if (conv.createdAt) lines.push(`**Inicio:** ${fmtTs(conv.createdAt)}`)
  if (conv.updatedAt) lines.push(`**Última actividad:** ${fmtTs(conv.updatedAt)}`)
  if ((conv.messages || []).length) lines.push(`**Total mensajes:** ${conv.messages.length}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const m of (conv.messages || [])) {
    const who = m.sender === 'user'  ? '👤 ' + (m.senderName || conv.guestName || 'Usuario')
              : m.sender === 'human' ? '💬 ' + (m.senderName || 'Asesor')
              : m.sender === 'ai'    ? '🤖 IA'
              : m.sender
    lines.push(`### ${who}  \`${fmtTs(m.ts)}\``)
    if (m.mediaId) {
      const icon = m.kind === 'image' ? '🖼' : m.kind === 'video' ? '🎬' : m.kind === 'audio' ? '🎤' : '📎'
      lines.push(`${icon} **${m.kind}** — ${m.filename || ''} (${m.mime || ''})`)
    }
    if (m.content) lines.push('')
    if (m.content) lines.push(m.content.split('\n').map(l => '> ' + l).join('\n'))
    lines.push('')
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  const day  = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `chat-${safe(conv.guestName) || 'export'}-${day}.md`)
}
