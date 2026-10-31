import { useEffect, useState } from 'react'

import { clampRightWidth, defaultRightWidth, parseStoredWidth, rightWidthBounds, STORAGE_KEY } from './column-width'

// localStorage can be blocked or full (private window): the width then lasts for this visit only.
const readStored = () => {
  try {
    return parseStoredWidth(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}
const writeStored = (width) => {
  try {
    localStorage.setItem(STORAGE_KEY, String(width))
  } catch {
    // keep the width in state only
  }
}
const clearStored = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // nothing to clear
  }
}

/** Right column width in px: the seller's dragged width (kept across visits) or the default, clamped to the viewport. */
export function useRightWidth(leftWidth) {
  const [stored, setStored] = useState(readStored)
  const [viewport, setViewport] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const setWidth = (width) => {
    const next = clampRightWidth(width, viewport, leftWidth)
    setStored(next)
    writeStored(next)
  }
  const reset = () => {
    setStored(null)
    clearStored()
  }
  return {
    width: clampRightWidth(stored ?? defaultRightWidth(viewport), viewport, leftWidth),
    bounds: rightWidthBounds(viewport, leftWidth),
    setWidth,
    reset,
  }
}
