import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// One tooltip for the whole screen: icon-only controls (and anything with a title) explain themselves on hover and
// on keyboard focus. The text comes from the control's own title or aria-label, so naming stays in one place; the
// title is lifted off while the tip shows so the browser's own tooltip does not appear twice.

const TARGET = 'button, a, [role="button"], [role="tab"], [role="slider"], [title]'
const SHOW_DELAY = 280

const iconOnly = (el) => !el.textContent.trim() || el.matches('.bar-btn, .more-btn, .ep-x, .btn-ghost-ic')

function tipOf(el) {
  const title = el.getAttribute('title') || el.dataset.tipTitle
  if (title) return title
  const label = el.getAttribute('aria-label')
  return label && iconOnly(el) ? label : null
}

export function GlobalTooltip({ rootRef }) {
  const [tip, setTip] = useState(null) // {text, x, y, below}
  const current = useRef(null)
  const timer = useRef(0)
  const box = useRef(null)

  // keep the tip inside the viewport: a control at the screen edge would push half of it off
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const shift = r.left < 8 ? 8 - r.left : r.right > window.innerWidth - 8 ? window.innerWidth - 8 - r.right : 0
    el.style.marginLeft = `${shift}px`
  }, [tip])

  useEffect(() => {
    const root = rootRef?.current ?? document.body
    const restore = () => {
      const el = current.current
      if (el?.dataset.tipTitle) {
        el.setAttribute('title', el.dataset.tipTitle)
        delete el.dataset.tipTitle
      }
      current.current = null
    }
    const hide = () => {
      clearTimeout(timer.current)
      restore()
      setTip(null)
    }
    const show = (e) => {
      const el = e.target.closest?.(TARGET)
      if (!el || !root.contains(el) || el === current.current) return
      const text = tipOf(el)
      if (!text) return
      hide()
      current.current = el
      if (el.hasAttribute('title')) {
        el.dataset.tipTitle = el.getAttribute('title')
        el.removeAttribute('title')
      }
      timer.current = setTimeout(() => {
        const r = el.getBoundingClientRect()
        const below = r.top < 64
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below })
      }, e.type === 'focusin' ? 0 : SHOW_DELAY)
    }
    const leave = (e) => {
      if (current.current && !current.current.contains(e.relatedTarget)) hide()
    }
    root.addEventListener('pointerover', show)
    root.addEventListener('focusin', show)
    root.addEventListener('pointerout', leave)
    root.addEventListener('focusout', hide)
    root.addEventListener('pointerdown', hide)
    window.addEventListener('scroll', hide, true)
    return () => {
      hide()
      root.removeEventListener('pointerover', show)
      root.removeEventListener('focusin', show)
      root.removeEventListener('pointerout', leave)
      root.removeEventListener('focusout', hide)
      root.removeEventListener('pointerdown', hide)
      window.removeEventListener('scroll', hide, true)
    }
  }, [rootRef])

  if (!tip) return null
  return createPortal(
    <div ref={box} className={`pf-tip${tip.below ? ' is-below' : ''}`} role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>,
    document.body,
  )
}
