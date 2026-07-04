import { useEffect } from 'react'

/**
 * SmoothFX — micro-interacciones globales de la plataforma:
 *
 * 1) POPUPS: detecta cualquier overlay a pantalla completa (aunque esté
 *    estilizado inline, como ProfileModal o los modales de flujos) y le añade
 *    difuminado del fondo (backdrop-blur) + entrada con rebote suave a su
 *    tarjeta. Así TODOS los popups se comportan como "⚡ Ejecutar flujo".
 *
 * 2) HOVER DESLIZANTE: en listas (chats, riel de navegación, menús, chips…)
 *    el resaltado no aparece y desaparece: es una pastilla de cristal que se
 *    DESLIZA suavemente de un elemento al otro siguiendo el mouse.
 *
 * Respeta prefers-reduced-motion y solo actúa con puntero fino.
 */

// Listas donde el hover se desliza (clases locales de CSS Modules).
const GLIDE_TARGETS = [
  '[class*="_convItem_"]', '[class*="_railBtn_"]', '[class*="_navItem_"]',
  '[class*="_labelOpt_"]', '[class*="_switcherItem_"]', '[class*="_filterChip_"]',
  '[class*="_agentBtn_"]', '[class*="_commBtn_"]', '[class*="_subTab_"]',
].join(',')

export default function SmoothFX() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

    /* ── 1) Popups: blur del fondo + rebote de entrada ──────────────────── */
    const OVERLAYISH = /overlay|backdrop|modal/i
    const enhance = el => {
      try {
        if (el.nodeType !== 1 || el.classList.contains('aviOverlayFX') || el.classList.contains('aviGlide')) return
        const st = el.style
        if (st.pointerEvents === 'none' || el.getAttribute('aria-hidden') === 'true') return
        // Overlay = fixed a pantalla completa: por estilo inline (barato) o por
        // clase CSS con nombre de overlay/modal (computado, solo si el nombre lo sugiere).
        const inlineFixed = st.position === 'fixed'
        if (!inlineFixed && !(typeof el.className === 'string' && OVERLAYISH.test(el.className))) return
        if (!inlineFixed && getComputedStyle(el).position !== 'fixed') return
        const r = el.getBoundingClientRect()
        if (r.width < innerWidth * 0.9 || r.height < innerHeight * 0.9) return
        el.classList.add('aviOverlayFX')
        const card = [...el.children].find(c => c.nodeType === 1 && !c.classList.contains('aviPopFX'))
        if (card) card.classList.add('aviPopFX')
      } catch {}
    }
    const mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue
        enhance(n)
        if (n.childElementCount) {
          for (const c of n.children) enhance(c)
          // Overlays anidados dentro del subárbol montado (envueltos por wrappers)
          for (const c of n.querySelectorAll('[class*="verlay"],[class*="ackdrop"],[class*="odal"]')) enhance(c)
        }
      }
    })
    mo.observe(document.body, { childList: true, subtree: true })

    /* ── 2) Hover deslizante ────────────────────────────────────────────── */
    const glides = new WeakMap()   // contenedor → pastilla
    const place = (g, item, cont) => {
      const cr = cont.getBoundingClientRect(), ir = item.getBoundingClientRect()
      g.style.width = ir.width + 'px'
      g.style.height = ir.height + 'px'
      g.style.transform = `translate(${ir.left - cr.left + cont.scrollLeft}px,${ir.top - cr.top + cont.scrollTop}px)`
      g.style.borderRadius = getComputedStyle(item).borderRadius
    }
    const onOver = e => {
      const item = e.target?.closest?.(GLIDE_TARGETS)
      if (!item) return
      const cont = item.parentElement
      if (!cont) return
      if (getComputedStyle(cont).position === 'static') cont.style.position = 'relative'
      if (!item.style.zIndex) {
        if (getComputedStyle(item).position === 'static') item.style.position = 'relative'
        item.style.zIndex = '1'
      }
      let g = glides.get(cont)
      if (!g) {
        g = document.createElement('div')
        g.className = 'aviGlide'
        cont.prepend(g)
        glides.set(cont, g)
        g.style.transition = 'none'          // primera vez: aparece en el sitio, sin volar
        place(g, item, cont)
        void g.offsetWidth                   // fuerza layout antes de reactivar la transición
        g.style.transition = ''
      } else {
        place(g, item, cont)
      }
      clearTimeout(g._hide)
      g.style.opacity = '1'
    }
    const onOut = e => {
      const item = e.target?.closest?.(GLIDE_TARGETS)
      if (!item) return
      const cont = item.parentElement
      const g = cont && glides.get(cont)
      if (!g) return
      const to = e.relatedTarget
      if (to && cont.contains(to) && to.closest?.(GLIDE_TARGETS)) return   // va hacia otro item: se desliza
      g._hide = setTimeout(() => { g.style.opacity = '0' }, 90)
    }
    if (fine) {
      addEventListener('mouseover', onOver, { passive: true })
      addEventListener('mouseout', onOut, { passive: true })
    }

    return () => {
      mo.disconnect()
      if (fine) { removeEventListener('mouseover', onOver); removeEventListener('mouseout', onOut) }
    }
  }, [])

  return null
}
