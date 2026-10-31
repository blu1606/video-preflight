import { useLayoutEffect, useRef, useState } from 'react'

import { groupLabel, levelPlain, QUESTION_PLAIN } from '../lib/labels'
import { useTweenedValues } from './motion'
import { answerLevels, groupOfQuestion, keyAxes, radarPoint } from './studio-model'

const RINGS = [0.25, 0.5, 0.75, 1]
// The chart is drawn in its own units; axis labels are HTML placed over it, so their text stays at a fixed px size.
// The label box (max 92 px) sits beside the chart: the chart radius leaves room for it inside a 400 px column.
const VIEW = { x: 0, y: 0, w: 440, h: 356 }
const CENTER = { cx: 220, cy: 172, r: 110 }
const LABEL_AT = { ...CENTER, r: CENTER.r + 12 }
const GROUP_SHORT = { viral_potential: 'Viral', conversion_potential: 'Conversion', sku_market: 'SKU', shop_health: 'Shop' }

/** Score band of one axis: the same three colours as the group bars. */
const bandOf = (v, ready) => (v == null ? 'none' : v >= ready ? 'good' : v >= 50 ? 'warn' : 'bad')

/** Wedge of the chart that belongs to axis i: half-way to each neighbour, tinted by the axis's group. */
function sectorPoints(i, n) {
  const half = 0.5
  return [
    [CENTER.cx, CENTER.cy],
    radarPoint(i - half, n, Math.cos(Math.PI / n), CENTER),
    radarPoint(i, n, 1, CENTER),
    radarPoint(i + half, n, Math.cos(Math.PI / n), CENTER),
  ].map((pt) => pt.join(',')).join(' ')
}

const pointsOf = (n, ratios) => ratios.map((r, i) => radarPoint(i, n, r, CENTER).join(',')).join(' ')

/** Label placement around its axis end: side labels grow outward, top and bottom ones stand clear of the chart. */
function labelStyle(i, n, x, y) {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n
  const dx = Math.cos(a)
  const dy = Math.sin(a)
  const side = dx > 0.3 ? 'start' : dx < -0.3 ? 'end' : 'center'
  return {
    left: `${(x / VIEW.w) * 100}%`,
    top: `${(y / VIEW.h) * 100}%`,
    transform: `translate(${{ start: '0%', end: '-100%', center: '-50%' }[side]}, ${dy < -0.5 ? '-100%' : dy > 0.5 ? '0%' : '-50%'})`,
    justifyItems: side === 'start' ? 'start' : side === 'end' ? 'end' : 'center',
    textAlign: side === 'start' ? 'left' : side === 'end' ? 'right' : 'center',
  }
}

/** Hover/focus card of one axis: what the question asks in plain Vietnamese, its level, and the original. */
function AxisCard({ axis, x, y }) {
  const q = axis.question
  const { best } = answerLevels(q)
  const ref = useRef(null)
  const [left, setLeft] = useState(null)
  // centred on the label, then clamped inside the radar box so the column's edge never clips it
  useLayoutEffect(() => {
    const card = ref.current
    const box = card?.parentElement
    if (!box) return
    const anchor = ((x - VIEW.x) / VIEW.w) * box.clientWidth
    setLeft(Math.max(0, Math.min(anchor - card.offsetWidth / 2, box.clientWidth - card.offsetWidth)))
  }, [x])
  return (
    <div
      ref={ref}
      className="studio-axis-card"
      style={{ left: left ?? 0, top: `${((y - VIEW.y) / VIEW.h) * 100}%`, visibility: left == null ? 'hidden' : undefined }}
      role="tooltip"
    >
      <p className="studio-axis-title">
        <span className="studio-qid">{axis.id}</span> {axis.label}
        <strong>{axis.value == null ? '–' : Math.round(axis.value)}</strong>
      </p>
      <p className="tiny muted">Nhóm {groupLabel(groupOfQuestion(axis.id))}</p>
      <p>{QUESTION_PLAIN[q.dimension] ?? q.instructions}</p>
      {best && <p className="tiny">Mức AI chọn: <b>{levelPlain(best.label)}</b> ({Math.round((best.probability ?? 0) * 100)}%)</p>}
      {axis.value == null && axis.reason && <p className="tiny muted">{axis.reason}</p>}
      <p className="tiny muted">Bấm để mở câu hỏi, schema và frame AI đã xem.</p>
    </div>
  )
}

/**
 * One Decisions radar in mockup-v2's drawing: the two heaviest questions of every scoring group on a single
 * chart. Unanswered axes sit hatched at the centre, never at 0; a streaming run reveals them one by one.
 */
export function Radar({ questions, revealed, selectedId, onSelect, threshold, onOpenAll, answered, total, otherCount = 0, scanning = false }) {
  const [hover, setHover] = useState(null)
  const axes = keyAxes(questions, revealed)
  const n = axes.length
  const shown = axes.filter((a) => a.value != null)
  const vals = useTweenedValues(axes.map((a) => a.value))
  if (n < 3) return null

  return (
    <section className={`radar-wrap studio-radar${scanning ? ' is-scanning' : ''}`} aria-label="Radar câu hỏi Decisions">
      <div className="studio-radar-head">
        {/* the count only matters while answers are missing */}
        <p className="tiny">{answered < total ? `${answered}/${total} câu chấm điểm đã trả lời` : 'Câu hỏi chấm điểm'}</p>
        <button type="button" className="link-btn tiny" onClick={onOpenAll}>Xem {total + otherCount} câu</button>
      </div>
      <div className="studio-radar-box">
        <svg className="radar" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} role="img" aria-label={`Radar ${shown.length}/${n} trục có trả lời`}>
          {axes.map((a, i) => (
            <polygon key={a.id} className={`rd-sector is-${groupOfQuestion(a.id)}`} points={sectorPoints(i, n)} />
          ))}
          {RINGS.map((r) => <polygon key={r} className="rd-ring" points={pointsOf(n, Array(n).fill(r))} />)}
          {threshold != null && <polygon className="rd-threshold" points={pointsOf(n, Array(n).fill(threshold / 100))} />}
          {/* while a run streams: a sweep turns around the centre, like a radar reading the axes it has not filled */}
          {scanning && (
            <g className="rd-sweep" style={{ transformOrigin: `${CENTER.cx}px ${CENTER.cy}px` }}>
              <defs>
                <linearGradient id="rdSweep" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#ee4d2d" stopOpacity="0" />
                  <stop offset="1" stopColor="#ee4d2d" stopOpacity=".28" />
                </linearGradient>
              </defs>
              <path
                d={`M${CENTER.cx},${CENTER.cy} L${CENTER.cx + CENTER.r * Math.cos(-Math.PI / 2 - 0.7)},${CENTER.cy + CENTER.r * Math.sin(-Math.PI / 2 - 0.7)} A${CENTER.r},${CENTER.r} 0 0 1 ${CENTER.cx},${CENTER.cy - CENTER.r} Z`}
                fill="url(#rdSweep)"
              />
              <line x1={CENTER.cx} y1={CENTER.cy} x2={CENTER.cx} y2={CENTER.cy - CENTER.r} className="rd-sweep-edge" />
            </g>
          )}
          {axes.map((a, i) => {
            const [x, y] = radarPoint(i, n, 1, CENTER)
            return <line key={a.id} className={`rd-axis${a.id === selectedId ? ' is-sel' : ''}`} x1={CENTER.cx} y1={CENTER.cy} x2={x} y2={y} />
          })}
          {shown.length > 0 && <polygon className="rd-shape studio-rd-shape" points={pointsOf(n, axes.map((a, i) => (vals[i] == null ? 0 : vals[i] / 100)))} />}
          {axes.map((a, i) => {
            if (a.value == null || vals[i] == null) return null
            const [x, y] = radarPoint(i, n, vals[i] / 100, CENTER)
            return <circle key={a.id} className={`rd-dot studio-rd-dot is-${bandOf(a.value, threshold ?? 75)}`} cx={x} cy={y} r="5" />
          })}
        </svg>
        {axes.map((a, i) => {
          const [x, y] = radarPoint(i, n, 1, LABEL_AT)
          const g = groupOfQuestion(a.id)
          const missing = a.value == null
          return (
            <button
              key={a.id}
              type="button"
              className={`studio-rd-label is-${g} band-${bandOf(a.value, threshold ?? 75)}${a.id === selectedId ? ' is-sel' : ''}${missing && scanning ? ' is-pending' : ''}`}
              style={labelStyle(i, n, x, y)}
              aria-pressed={a.id === selectedId}
              aria-label={`${a.label} (${GROUP_SHORT[g]}): ${missing ? (a.status === 'pending' ? 'đang chờ' : 'chưa chấm') : Math.round(a.value)}`}
              onClick={() => onSelect(a.id)}
              onMouseEnter={() => setHover(a.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(a.id)}
              onBlur={() => setHover(null)}
            >
              <span className={`studio-rd-num${missing ? ' is-miss' : ''}`}>{missing ? (scanning || a.status === 'pending' ? '··' : '–') : Math.round(a.value)}</span>
              <span className="studio-rd-name">{a.label}</span>
            </button>
          )
        })}
        {axes.map((a, i) => {
          if (a.id !== hover) return null
          const [x, y] = radarPoint(i, n, 1, LABEL_AT)
          return <AxisCard key={a.id} axis={a} x={x} y={y} />
        })}
      </div>
      {/* group colours are read once here instead of naming the group on every label */}
      <p className="legend studio-radar-legend">
        {[...new Set(axes.map((a) => groupOfQuestion(a.id)))].map((g) => (
          <span key={g} className={`lg-group is-${g}`}><i />{GROUP_SHORT[g]}</span>
        ))}
        {threshold != null && <span><i className="lg-thr" />{threshold}</span>}
        {shown.length < n && <span title="Chưa chấm, không tính 0"><i className="lg-miss" />chưa chấm</span>}
      </p>
    </section>
  )
}
