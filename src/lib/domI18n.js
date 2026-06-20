// Traductor de interfaz en runtime. Recorre el DOM y traduce el TEXTO de la UI
// (nodos de texto + atributos placeholder/title/aria-label) usando UI_ES_EN.
//
// Reglas de seguridad:
//  - NO toca <input>/<textarea>/<code>/<pre>/<script>/<style>/<svg>.
//  - NO toca subárboles marcados con [data-i18n-skip] ni [contenteditable].
//    Ahí viven los CONTENIDOS dinámicos (mensajes de chat, textos de flujos,
//    descripciones, prompts) que NO se deben traducir.
//  - Guarda el original en el propio nodo para poder RESTAURAR al volver a 'es'.
//  - Un MutationObserver re-traduce lo que React vaya montando (solo en 'en').

import { UI_ES_EN } from './uiDict'

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'SVG'])
const ATTRS = ['placeholder', 'title', 'aria-label']

let mode = 'es'        // 'en' = traducir, 'es' = restaurar
let observer = null

function isSkipped(node) {
  let n = node && node.nodeType === 3 ? node.parentNode : node
  while (n && n.nodeType === 1) {
    if (SKIP_TAGS.has((n.tagName || '').toUpperCase())) return true
    if (n.hasAttribute && (n.hasAttribute('data-i18n-skip') || n.getAttribute('contenteditable') === 'true')) return true
    n = n.parentNode
  }
  return false
}

// Traduce un string de UI; devuelve null si no hay traducción aplicable.
function translateString(str) {
  if (!str) return null
  const trimmed = str.trim()
  if (!trimmed || trimmed.length > 200) return null
  const direct = UI_ES_EN[trimmed]
  if (direct) return direct === trimmed ? null : str.replace(trimmed, direct)
  // Separar prefijo de emoji/símbolos antes de la primera letra y traducir el núcleo.
  let idx = -1
  try { idx = trimmed.search(/\p{L}/u) } catch { idx = trimmed.search(/[A-Za-zÁÉÍÓÚÑÜáéíóúñü]/) }
  if (idx > 0) {
    const rest = trimmed.slice(idx)
    const hit = UI_ES_EN[rest]
    if (hit && hit !== rest) return str.replace(rest, hit)
  }
  return null
}

function applyTextNode(node) {
  if (!node || node.nodeType !== 3) return
  if (isSkipped(node)) return
  if (mode === 'en') {
    const out = translateString(node.nodeValue)
    if (out != null) {
      if (node.__i18nOrig === undefined) node.__i18nOrig = node.nodeValue
      if (node.nodeValue !== out) node.nodeValue = out
    }
  } else if (node.__i18nOrig !== undefined) {
    node.nodeValue = node.__i18nOrig
    node.__i18nOrig = undefined
  }
}

function applyAttrs(el) {
  if (!el || el.nodeType !== 1 || !el.getAttribute) return
  if (isSkipped(el)) return
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue
    const store = '__i18nA_' + a
    if (mode === 'en') {
      const out = translateString(el.getAttribute(a))
      if (out != null) {
        if (el[store] === undefined) el[store] = el.getAttribute(a)
        el.setAttribute(a, out)
      }
    } else if (el[store] !== undefined) {
      el.setAttribute(a, el[store])
      el[store] = undefined
    }
  }
}

function walk(root) {
  if (!root) return
  // Nodos de texto
  if (root.nodeType === 3) { applyTextNode(root); return }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  const texts = []
  let cur
  while ((cur = tw.nextNode())) texts.push(cur)
  for (const t of texts) applyTextNode(t)
  // Atributos
  if (root.nodeType === 1) applyAttrs(root)
  const withAttrs = root.querySelectorAll ? root.querySelectorAll('[' + ATTRS.join('],[') + ']') : []
  for (const el of withAttrs) applyAttrs(el)
}

export function refreshUiLang(lang) {
  if (typeof document === 'undefined' || !document.body) return
  mode = lang === 'en' ? 'en' : 'es'
  walk(document.body)
  if (!observer) {
    observer = new MutationObserver(muts => {
      if (mode !== 'en') return
      for (const m of muts) {
        if (m.type === 'characterData') applyTextNode(m.target)
        else if (m.type === 'attributes') applyAttrs(m.target)
        else m.addedNodes && m.addedNodes.forEach(n => {
          if (n.nodeType === 3) applyTextNode(n)
          else if (n.nodeType === 1) walk(n)
        })
      }
    })
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS,
    })
  }
}
