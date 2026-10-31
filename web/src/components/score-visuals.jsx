// Visual primitives in the mockup-v2 language: sheets, meters, signal bars, tags, status dots, time chips.
// A missing score always renders "–" with its reason, never 0.
import { Clock } from 'lucide-react'

import { fmtScore, scoreTone, TONE_BG, TONE_TAG, TONE_TEXT } from '@/lib/score-style'
import { fmtTime } from '@/lib/timeline'
import { cn } from '@/lib/utils'

/** One white working surface (mockup "L2 sheet"). */
export function Sheet({ id, title, aside, children, className, bodyClassName }) {
  return (
    <section id={id} className={cn('rounded-2xl bg-surface shadow-sheet', className)}>
      {(title || aside) && (
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {aside && <div className="ml-auto flex flex-wrap items-center gap-2">{aside}</div>}
        </header>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export function Meter({ value, tone, className }) {
  const t = tone ?? scoreTone(value)
  return (
    <span className={cn('block h-1 w-full overflow-hidden rounded-full bg-[#e4e6ea]', className)} aria-hidden>
      {value == null ? (
        <span className="block h-full w-full bg-[repeating-linear-gradient(45deg,#cfd2d8_0_2px,#eceef1_2px_4px)]" />
      ) : (
        <span className={cn('block h-full rounded-full', TONE_BG[t])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      )}
    </span>
  )
}

/** 3-bar signal: 1 bar < 40, 2 bars < 70, 3 bars >= 70; empty when not scored. */
export function Signal({ value }) {
  const level = value == null ? 0 : value < 40 ? 1 : value < 70 ? 2 : 3
  const on = level === 1 ? 'bg-amber-ink' : 'bg-pass'
  return (
    <span className="inline-flex h-3 items-end gap-0.5" aria-label={value == null ? 'chưa chấm' : `${level}/3`}>
      {[5, 8, 12].map((h, i) => (
        <i key={h} className={cn('w-[3px] rounded-[1px]', i < level ? on : 'bg-[#d3d6db]')} style={{ height: h }} />
      ))}
    </span>
  )
}

export function ScoreText({ value, reason, className }) {
  if (value == null) {
    return (
      <span className={cn('text-faint', className)} title={reason ?? 'Chưa chấm'}>
        –
      </span>
    )
  }
  return <span className={cn('font-semibold tabular-nums', TONE_TEXT[scoreTone(value)], className)}>{fmtScore(value)}</span>
}

export function Tag({ tone = 'muted', className, children, title }) {
  return (
    <span title={title} className={cn('inline-flex h-[22px] items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium whitespace-nowrap', TONE_TAG[tone], className)}>
      {children}
    </span>
  )
}

export function StatusDot({ tone = 'muted', children, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', className)}>
      <span className={cn('size-2 rounded-full', TONE_BG[tone])} />
      {children}
    </span>
  )
}



export function TimeChip({ sec, onSeek, className }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onSeek?.(sec)
      }}
      disabled={!onSeek}
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-full border border-line bg-surface px-1.5 font-mono text-[11px] font-semibold text-ink hover:border-ink disabled:cursor-default disabled:hover:border-line',
        className,
      )}
      title={onSeek ? 'Tua video tới đây' : undefined}
    >
      <Clock className="size-3" /> {fmtTime(sec)}
    </button>
  )
}

export function SkeletonBlock({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-[#e4e6ea]', className)} />
}
