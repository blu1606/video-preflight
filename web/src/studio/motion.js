// Motion helpers for the studio's state changes (glass.css holds the durations and curves).
import { useEffect, useRef, useState } from 'react'

const INDICATOR_GROUPS = '.view-tabs, .seg-switch, .rb-tabs, .studio-side-tabs'
const SELECTED = '[aria-selected="true"], [aria-pressed="true"]'
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Put the selected option's offset and width on its group, so one indicator can travel between options. */
function measure(group) {
  const on = group.querySelector(SELECTED)
  if (!on || !on.offsetWidth) {
    delete group.dataset.ind
    return
  }
  group.style.setProperty('--ind-x', `${on.offsetLeft}px`)
  group.style.setProperty('--ind-w', `${on.offsetWidth}px`)
  group.dataset.ind = ''
}

/**
 * Sliding indicators for every tab / segmented group under `rootRef`: re-measured when a selection changes, a
 * group appears, or the layout resizes. CSS transitions retarget from the current position, so rapid clicks glide
 * to the last choice instead of queueing.
 */
export function useSlidingIndicators(rootRef) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    let frame = 0
    const all = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => root.querySelectorAll(INDICATOR_GROUPS).forEach(measure))
    }
    all()
    const mo = new MutationObserver(all)
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected', 'aria-pressed'] })
    const ro = new ResizeObserver(all)
    ro.observe(root)
    return () => {
      cancelAnimationFrame(frame)
      mo.disconnect()
      ro.disconnect()
    }
  }, [rootRef])
}

const easeOut = (t) => 1 - (1 - t) ** 3

/** A number that counts from its previous value to `value` (null passes straight through). */
export function useCountUp(value, ms = 650) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (value == null || from.current == null || reducedMotion()) {
      from.current = value
      setShown(value)
      return undefined
    }
    const start = performance.now()
    const a = from.current
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / ms)
      const v = a + (value - a) * easeOut(t)
      from.current = v
      setShown(v)
      if (t < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [value, ms])
  return shown
}

/** Each number of `values` glides to its new value together (radar shape morphs instead of jumping). */
export function useTweenedValues(values, ms = 520) {
  const key = values.map((v) => (v == null ? 'n' : v.toFixed(2))).join(',')
  const [shown, setShown] = useState(values)
  const from = useRef(values)
  useEffect(() => {
    const target = key.split(',').map((v) => (v === 'n' ? null : Number(v)))
    const a = from.current
    if (reducedMotion() || a.length !== target.length) {
      from.current = target
      setShown(target)
      return undefined
    }
    const start = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const t = easeOut(Math.min(1, (now - start) / ms))
      const v = target.map((b, i) => (b == null ? null : (a[i] ?? 0) + (b - (a[i] ?? 0)) * t))
      from.current = v
      setShown(v)
      if (t < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [key, ms])
  return shown
}
