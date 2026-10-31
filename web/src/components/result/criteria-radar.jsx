import { fmtScore } from '@/lib/score-style'
import { cn } from '@/lib/utils'

const SIZE = 320
const C = SIZE / 2
const R = 105

const point = (i, n, value) => {
  const a = -Math.PI / 2 + (i / n) * Math.PI * 2
  const r = (R * value) / 100
  return [C + r * Math.cos(a), C + r * Math.sin(a)]
}

/**
 * Radar (mockup-v2 style) of the criteria in one real backend group; each axis is a real criterion.
 * An unscored criterion gets a dashed axis and "–", and is left out of the shape (never drawn at 0).
 */
export function CriteriaRadar({ criteria, selectedId, onSelect }) {
  const n = criteria.length
  if (n < 3) return null
  const scored = criteria.map((c, i) => ({ c, i })).filter(({ c }) => c.score != null)
  const shape = scored.map(({ c, i }) => point(i, n, c.score).join(',')).join(' ')

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto w-full max-w-[320px]" role="img" aria-label="Radar điểm tiêu chí">
      {[25, 50, 75, 100].map((v) => (
        <polygon
          key={v}
          points={criteria.map((_, i) => point(i, n, v).join(',')).join(' ')}
          fill="none"
          stroke={v === 50 ? 'var(--mk-ink)' : 'var(--mk-line)'}
          strokeDasharray={v === 50 ? '1 3' : undefined}
          strokeWidth={v === 50 ? 1.2 : 1}
        />
      ))}
      {criteria.map((c, i) => {
        const [x, y] = point(i, n, 100)
        return (
          <line
            key={c.id}
            x1={C}
            y1={C}
            x2={x}
            y2={y}
            stroke={c.id === selectedId ? 'var(--mk-ink)' : 'var(--mk-line)'}
            strokeWidth={c.id === selectedId ? 2 : 1}
            strokeDasharray={c.score == null ? '3 3' : undefined}
          />
        )
      })}
      {scored.length >= 2 && <polygon points={shape} fill="rgba(238, 77, 45, .18)" stroke="var(--mk-accent)" strokeWidth="2" />}
      {scored.map(({ c, i }) => {
        const [x, y] = point(i, n, c.score)
        return <circle key={c.id} cx={x} cy={y} r={c.id === selectedId ? 5 : 3.5} fill={c.id === selectedId ? 'var(--mk-ink)' : 'var(--mk-accent)'} />
      })}
      {criteria.map((c, i) => {
        const [x, y] = point(i, n, 128)
        const anchor = Math.abs(x - C) < 8 ? 'middle' : x > C ? 'start' : 'end'
        return (
          <g
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect?.(c.id)}
            onKeyDown={(e) => e.key === 'Enter' && onSelect?.(c.id)}
            className="cursor-pointer outline-none"
          >
            <title>{c.score == null ? `${c.name}: chưa chấm (${c.notScoredReason})` : `${c.name}: ${fmtScore(c.score)}`}</title>
            <text x={x} y={y - 4} textAnchor={anchor} className={cn('fill-muted-foreground text-[10.5px]', c.id === selectedId && 'fill-ink font-bold')}>
              {c.id}
            </text>
            <text x={x} y={y + 9} textAnchor={anchor} className={cn('text-[12px] font-bold', c.score == null ? 'fill-faint' : 'fill-ink')}>
              {c.score == null ? '–' : Math.round(c.score)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
