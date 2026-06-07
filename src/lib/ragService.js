/**
 * RAG Service — Retrieval-Augmented Generation
 * Handles file ingestion, chunking, embedding, and semantic search.
 * Uses OpenAI text-embedding-3-small.
 */

import { api } from './api'
import { readRagChunks, writeRagChunks, deleteRagFileChunks, uid } from './storage'

const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 80
const TOP_K = 3
const MAX_FILE_BYTES = 2 * 1024 * 1024
const EMBED_MODEL = 'text-embedding-3-small'

// ─── Text extraction ──────────────────────────────────────────────────────────

export async function extractText(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (['txt', 'md', 'markdown'].includes(ext)) {
    return await readAsText(file)
  }
  if (ext === 'csv') {
    const text = await readAsText(file)
    const lines = text.split('\n').filter(l => l.trim())
    return lines.join('\n')
  }
  if (ext === 'pdf') {
    return await extractPdfText(file)
  }
  if (['docx', 'doc'].includes(ext)) {
    throw new Error('Los archivos Word (.docx) no están soportados directamente. Por favor convierte a .txt o .md.')
  }
  throw new Error(`Formato no soportado: .${ext}. Usa .txt, .md, .csv o .pdf`)
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    reader.readAsText(file, 'UTF-8')
  })
}

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const str = new TextDecoder('latin1').decode(bytes)

  let text = ''
  const btEtRegex = /BT([\s\S]*?)ET/g
  let match
  while ((match = btEtRegex.exec(str)) !== null) {
    const block = match[1]
    const strRegex = /\(([^)\\]*(\\.[^)\\]*)*)\)\s*Tj/g
    const arrRegex = /\[([^\]]*)\]\s*TJ/g
    let m
    while ((m = strRegex.exec(block)) !== null) {
      text += decodePdfString(m[1]) + ' '
    }
    while ((m = arrRegex.exec(block)) !== null) {
      const parts = m[1].match(/\(([^)\\]*(\\.[^)\\]*)*)\)/g) || []
      text += parts.map(p => decodePdfString(p.slice(1, -1))).join('') + ' '
    }
  }

  text = text.replace(/\s+/g, ' ').trim()
  if (text.length < 50) {
    throw new Error('No se pudo extraer texto del PDF. Puede ser un PDF de imagen/scan. Convierte a .txt primero.')
  }
  return text
}

function decodePdfString(s) {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

export function chunkText(text) {
  const words = text.split(/\s+/).filter(Boolean)
  const chunkWords = Math.floor(CHUNK_SIZE * 4 / 5)
  const overlapWords = Math.floor(CHUNK_OVERLAP * 4 / 5)
  const chunks = []
  let i = 0
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkWords).join(' ')
    if (chunk.trim()) chunks.push(chunk)
    i += chunkWords - overlapWords
    if (i >= words.length) break
  }
  return chunks
}

// ─── Embeddings ───────────────────────────────────────────────────────────────

async function getEmbedding(text, apiKey) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Embeddings API error: ${err?.error?.message || res.status}`)
  }
  const data = await res.json()
  return data.data[0].embedding
}

async function getEmbeddings(texts, apiKey, onProgress) {
  const embeddings = []
  for (let i = 0; i < texts.length; i++) {
    embeddings.push(await getEmbedding(texts[i], apiKey))
    onProgress?.(i + 1, texts.length)
  }
  return embeddings
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ─── Ingestion pipeline ───────────────────────────────────────────────────────

export async function ingestFile({ accId, agId, file, apiKey, onProgress }) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`El archivo es demasiado grande. Máximo 2 MB por archivo.`)
  }

  onProgress?.('Extrayendo texto...', 0)
  const text = await extractText(file)

  if (text.length < 20) throw new Error('El archivo no contiene texto suficiente.')

  onProgress?.('Dividiendo en fragmentos...', 10)
  const chunks = chunkText(text)

  if (chunks.length === 0) throw new Error('No se generaron fragmentos del archivo.')

  onProgress?.(`Generando embeddings (0/${chunks.length})...`, 20)
  const embeddings = await getEmbeddings(chunks, apiKey, (done, total) => {
    onProgress?.(`Generando embeddings (${done}/${total})...`, 20 + Math.floor(done / total * 70))
  })

  onProgress?.('Guardando en base de conocimiento...', 95)
  const fileId = 'raf_' + uid()
  const existingChunks = await readRagChunks(accId, agId)
  const newChunks = chunks.map((content, i) => ({
    fileId, fileName: file.name, content, embedding: embeddings[i],
  }))
  await writeRagChunks(accId, agId, [...(existingChunks || []), ...newChunks])

  // Register file metadata in agent.rag.files via API
  const account = await api.get(`/api/public/accounts/${accId}`)
  const agent = account?.agents?.find(a => a.id === agId)
  const currentRag = agent?.rag || { enabled: true, files: [] }
  const updatedRag = {
    ...currentRag,
    enabled: true,
    files: [...(currentRag.files || []), {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type || 'text/plain',
      chunkCount: chunks.length,
      charCount: text.length,
      status: 'ready',
      createdAt: Date.now(),
    }],
  }
  await api.put(`/api/agents/${accId}/${agId}`, { rag: updatedRag })

  onProgress?.('¡Listo!', 100)
  return { fileId, chunkCount: chunks.length }
}

// ─── Semantic search ──────────────────────────────────────────────────────────

export async function searchRelevantChunks(query, accId, agId, apiKey) {
  const rawChunks = await readRagChunks(accId, agId)
  if (!rawChunks?.length) return []

  // Normalize field names: API returns `content`, internally use `text`
  const chunks = rawChunks.map(c => ({ ...c, text: c.content || c.text }))

  const queryEmbedding = await getEmbedding(query, apiKey)

  const scored = chunks.map(chunk => ({
    ...chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }))

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, TOP_K)
}

// ─── Context builder ──────────────────────────────────────────────────────────

export async function buildRagContext(query, accId, agId, apiKey) {
  try {
    const relevant = await searchRelevantChunks(query, accId, agId, apiKey)
    if (!relevant.length) return ''

    const contextText = relevant
      .filter(c => c.score > 0.25)
      .map((c, i) => `[Fragmento ${i + 1}]\n${c.text}`)
      .join('\n\n')

    if (!contextText) return ''

    return `\n\n---\n[CONTEXTO DE CONOCIMIENTO]\nUsa la siguiente información como referencia para responder:\n\n${contextText}\n---\n`
  } catch (err) {
    console.warn('[RAG] Error buscando contexto:', err.message)
    return ''
  }
}

export async function deleteFile(accId, agId, fileId) {
  await deleteRagFileChunks(accId, agId, fileId)

  const account = await api.get(`/api/public/accounts/${accId}`)
  const agent = account?.agents?.find(a => a.id === agId)
  if (agent?.rag) {
    const updatedRag = {
      ...agent.rag,
      files: (agent.rag.files || []).filter(f => f.id !== fileId),
    }
    await api.put(`/api/agents/${accId}/${agId}`, { rag: updatedRag })
  }
}

export function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}
