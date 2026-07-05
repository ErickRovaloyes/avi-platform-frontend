import { useEffect, useRef } from 'react'

/**
 * Cursor de marca AVI — "las bolitas":
 *  · Bolita principal: borde morado con halo de contraste y centro de cristal
 *    (backdrop-blur) que va pegada al puntero.
 *  · Estela: dos bolitas (verde y dorada) que persiguen al cursor con retardo
 *    elástico, dejando la estela de los colores de la marca.
 *  · Sobre elementos interactivos crece y el anillo pasa a verde; al hacer
 *    clic, late.
 * Se activa/desactiva desde el perfil (localStorage 'avi_cursor_fx') y emite
 * el evento 'avi-cursor-fx' para reaccionar en vivo. Solo puntero fino (no táctil)
 * y respeta prefers-reduced-motion.
 */

export function cursorFxEnabled() {
  try { return localStorage.getItem('avi_cursor_fx') !== 'off' } catch { return true }
}
export function setCursorFxEnabled(on) {
  try { localStorage.setItem('avi_cursor_fx', on ? 'on' : 'off') } catch {}
  window.dispatchEvent(new CustomEvent('avi-cursor-fx', { detail: { on } }))
}

const BALL = {
  main:  { size: 22, style: { border: '1.5px solid rgba(139,47,214,.95)', background: 'rgba(255,255,255,.07)', boxShadow: '0 0 0 1.5px rgba(255,255,255,.22), 0 0 14px rgba(139,47,214,.45), inset 0 1px 2px rgba(255,255,255,.18)', backdropFilter: 'blur(4px) saturate(1.4)', WebkitBackdropFilter: 'blur(4px) saturate(1.4)' } },
  green: { size: 12, style: { background: 'radial-gradient(circle at 35% 35%, rgba(27,222,113,.95), rgba(27,222,113,.35))', boxShadow: '0 0 10px rgba(27,222,113,.55)' } },
  gold:  { size: 8,  style: { background: 'radial-gradient(circle at 35% 35%, rgba(245,183,10,.95), rgba(245,183,10,.35))', boxShadow: '0 0 8px rgba(245,183,10,.55)' } },
}

export default function CursorFX() {
  const rootRef = useRef(null)

  useEffect(() => {
    // Solo escritorio con mouse; nunca en táctil ni con "reducir movimiento".
    if (!window.matchMedia?.('(pointer: fine)').matches) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const root = document.createElement('div')
    root.setAttribute('aria-hidden', 'true')
    // z-index por encima de cualquier modal/lightbox para que el cursor se vea siempre.
    Object.assign(root.style, { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2147483000, overflow: 'hidden' })
    document.body.appendChild(root)
    rootRef.current = root

    const mk = ({ size, style }) => {
      const el = document.createElement('div')
      Object.assign(el.style, {
        position: 'fixed', left: 0, top: 0, width: size + 'px', height: size + 'px',
        marginLeft: (-size / 2) + 'px', marginTop: (-size / 2) + 'px',
        borderRadius: '50%', pointerEvents: 'none', opacity: '0',
        transition: 'opacity .35s ease', willChange: 'transform',
        ...style,
      })
      root.appendChild(el)
      return el
    }
    const elMain = mk(BALL.main), elGreen = mk(BALL.green), elGold = mk(BALL.gold)

    const pos = { x: innerWidth / 2, y: innerHeight / 2 }
    const green = { ...pos }, gold = { ...pos }
    let scale = 1, targetScale = 1, ringGreen = false, shown = false
    let idleTimer = null, raf = 0, enabled = cursorFxEnabled()

    const applyEnabled = () => {
      document.documentElement.classList.toggle('aviCursorOn', enabled)
      if (!enabled) { elMain.style.opacity = elGreen.style.opacity = elGold.style.opacity = '0'; shown = false }
    }
    applyEnabled()

    const show = () => {
      if (shown) return
      shown = true
      elMain.style.opacity = '1'; elGreen.style.opacity = '.9'; elGold.style.opacity = '.85'
    }
    const hide = () => { shown = false; elMain.style.opacity = elGreen.style.opacity = elGold.style.opacity = '0' }

    const onMove = e => {
      if (!enabled) return
      pos.x = e.clientX; pos.y = e.clientY
      show()
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => { elGreen.style.opacity = '0'; elGold.style.opacity = '0' }, 1600)
      elGreen.style.opacity = '.9'; elGold.style.opacity = '.85'
      // Interactivo → crece y el anillo pasa a verde de marca.
      const it = e.target?.closest?.('a,button,input,select,textarea,[role="button"],[onclick],label')
      targetScale = it ? 1.35 : 1
      if (!!it !== ringGreen) {
        ringGreen = !!it
        elMain.style.border = ringGreen ? '1.5px solid rgba(27,222,113,.95)' : BALL.main.style.border
        elMain.style.boxShadow = ringGreen
          ? '0 0 0 1.5px rgba(255,255,255,.22), 0 0 16px rgba(27,222,113,.5), inset 0 1px 2px rgba(255,255,255,.18)'
          : BALL.main.style.boxShadow
      }
    }
    const onDown = () => { if (enabled) targetScale = 0.8 }
    const onUp = e => { if (enabled) onMove(e) }
    const onLeave = () => hide()
    const onFx = e => { enabled = e?.detail?.on ?? cursorFxEnabled(); applyEnabled() }

    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!enabled || !shown) return
      // Estela elástica: cada bolita persigue con su propio retardo.
      green.x += (pos.x - green.x) * 0.16; green.y += (pos.y - green.y) * 0.16
      gold.x  += (green.x - gold.x) * 0.14; gold.y  += (green.y - gold.y) * 0.14
      scale += (targetScale - scale) * 0.25
      elMain.style.transform  = `translate3d(${pos.x}px,${pos.y}px,0) scale(${scale.toFixed(3)})`
      elGreen.style.transform = `translate3d(${green.x}px,${green.y}px,0)`
      elGold.style.transform  = `translate3d(${gold.x}px,${gold.y}px,0)`
    }
    raf = requestAnimationFrame(loop)

    addEventListener('mousemove', onMove, { passive: true })
    addEventListener('mousedown', onDown, { passive: true })
    addEventListener('mouseup', onUp, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
    addEventListener('avi-cursor-fx', onFx)

    return () => {
      cancelAnimationFrame(raf); clearTimeout(idleTimer)
      removeEventListener('mousemove', onMove); removeEventListener('mousedown', onDown); removeEventListener('mouseup', onUp)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      removeEventListener('avi-cursor-fx', onFx)
      document.documentElement.classList.remove('aviCursorOn')
      root.remove()
    }
  }, [])

  return null
}
