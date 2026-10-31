// Width of the studio's right column in px. The seller drags its left edge; the width is bounded by the viewport
// and by the phone stage that sits beside it. Pure functions: the drag and storage live in column-resizer.jsx.

export const RIGHT_MIN = 400
export const RIGHT_STEP = 24
export const STORAGE_KEY = 'studio.rightColumnWidth'
const PHONE_MIN = 480

/** The width used until the seller drags: 30% of the viewport, between 420 and 600 px. */
export const defaultRightWidth = (viewport) => Math.round(Math.min(600, Math.max(420, viewport * 0.3)))

/** At least RIGHT_MIN; at most half the viewport and what the phone stage keeps beside the left column. */
export function rightWidthBounds(viewport, leftWidth) {
  const max = Math.min(viewport * 0.5, viewport - leftWidth - PHONE_MIN)
  return { min: RIGHT_MIN, max: Math.max(RIGHT_MIN, Math.round(max)) }
}

export function clampRightWidth(width, viewport, leftWidth) {
  const { min, max } = rightWidthBounds(viewport, leftWidth)
  return Math.round(Math.min(max, Math.max(min, width)))
}

/** A stored width as a number, or null when the stored value is missing or not a positive number. */
export function parseStoredWidth(raw) {
  const n = Number(raw)
  return raw != null && Number.isFinite(n) && n > 0 ? n : null
}
