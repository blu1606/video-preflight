import { useRef } from 'react'

import { RIGHT_STEP } from './column-width'

/**
 * Vertical separator on the left edge of the right column (positioned by the parent grid's --col-right).
 * Drag left to widen; arrow keys step by RIGHT_STEP; double-click or Home resets to the default.
 */
export function ColumnResizer({ width, bounds, onResize, onReset, onDragging }) {
  const drag = useRef(null)
  const onPointerDown = (e) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, width }
    e.currentTarget.setPointerCapture(e.pointerId)
    onDragging(true)
  }
  const onPointerMove = (e) => {
    if (drag.current) onResize(drag.current.width + drag.current.x - e.clientX)
  }
  const onPointerUp = (e) => {
    if (!drag.current) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    onDragging(false)
  }
  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      onResize(width + (e.key === 'ArrowLeft' ? RIGHT_STEP : -RIGHT_STEP))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onReset()
    }
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Đổi độ rộng cột Điểm"
      aria-valuenow={width}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      tabIndex={0}
      className="studio-col-resizer"
      title="Kéo để đổi độ rộng; bấm đúp để về mặc định"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  )
}
