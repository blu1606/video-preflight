import { useState } from 'react'

import { MarkerTooltip } from '@/components/result/marker-tooltip'
import { SEV_BG, SEV_TEXT } from '@/lib/score-style'
import { BEAT_LABELS, LANE_LABELS } from '@/lib/labels'
import { DOT_LANES, fmtTime, position, seekTimeFromClick, splitLanes } from '@/lib/timeline'
import { cn } from '@/lib/utils'

const BEAT_COLORS = {
  hook: 'bg-[#ee4d2d]/70',
  problem: 'bg-[#b45309]/60',
  solution: 'bg-[#1d4ed8]/55',
  proof: 'bg-[#17803d]/55',
  offer: 'bg-[#7c3aed]/55',
  cta: 'bg-[#d0011b]/65',
}

const pct = (t, d) => `${position(t, d) * 100}%`

function Dot({ marker, duration, highlighted, dimmed, onEnter, onSeek }) {
  const ghost = marker.kind === 'ghost'
  return (
    <button
      type="button"
      aria-label={`${marker.title} · ${fmtTime(marker.t_start)}`}
      onMouseEnter={onEnter}
      onFocus={onEnter}
      onClick={(e) => {
        e.stopPropagation() // the lane track behind would seek again to the raw click position
        onSeek(marker.t_start)
      }}
      className="absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-on-stage"
      style={{ left: pct(marker.t_start, duration) }}
    >
      <span
        className={cn(
          'block rounded-full transition-transform',
          ghost ? cn('marker-ghost size-3', SEV_TEXT[marker.severity]) : cn('size-2.5', SEV_BG[marker.severity]),
          highlighted && 'marker-pulse scale-150 ring-2 ring-on-stage',
          dimmed && 'opacity-30',
          SEV_TEXT[marker.severity],
        )}
      />
    </button>
  )
}

/**
 * Multi-lane timeline under the player: Policy / Conversion / Viral dots by severity (ghost = hollow dashed
 * "Gợi ý vị trí"), and a structure lane with story beats plus thin cut ticks. Click seeks; hover explains.
 */
export function TimelineLanes({ markers, duration, currentTime, highlightIds, focusLane, onSeek, onHoverMarker, onWhy }) {
  const [hover, setHover] = useState(null)
  const { lanes, beats, cuts } = splitLanes(markers)
  const enter = (m) => {
    setHover(m)
    onHoverMarker?.(m.id)
  }
  const leave = () => {
    setHover(null)
    onHoverMarker?.(null)
  }
  const seekFromTrack = (e) => {
    onSeek(seekTimeFromClick(e.clientX, e.currentTarget.getBoundingClientRect(), duration))
  }

  return (
    <div className="relative space-y-1 select-none" onMouseLeave={leave}>
      {DOT_LANES.map((lane) => (
        <div key={lane} className="flex items-center gap-2">
          <span className={cn('w-20 shrink-0 text-[11px] text-on-stage-2', focusLane === lane && 'font-semibold text-on-stage')}>
            {LANE_LABELS[lane]}
          </span>
          <div className="relative h-6 flex-1 cursor-pointer rounded bg-stage-2" onClick={seekFromTrack}>
            <span className="absolute top-1/2 right-0 left-0 h-px bg-on-stage-line" />
            {lanes[lane].map((m) => (
              <Dot
                key={m.id}
                marker={m}
                duration={duration}
                highlighted={highlightIds?.has(m.id)}
                dimmed={focusLane && focusLane !== lane}
                onEnter={() => enter(m)}
                onSeek={onSeek}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-[11px] text-on-stage-2">{LANE_LABELS.structure}</span>
        <div className="relative h-6 flex-1 cursor-pointer overflow-hidden rounded bg-stage-2" onClick={seekFromTrack}>
          {beats.map((b) => (
            <button
              key={b.id}
              type="button"
              onMouseEnter={() => enter(b)}
              onFocus={() => enter(b)}
              onClick={(e) => {
                e.stopPropagation()
                onSeek(b.t_start)
              }}
              className={cn('absolute inset-y-0.5 overflow-hidden rounded-sm px-1 text-left text-[10px] leading-5 font-semibold text-white', BEAT_COLORS[b.title] ?? 'bg-on-stage-line')}
              style={{ left: pct(b.t_start, duration), width: `calc(${(position(b.t_end ?? b.t_start, duration) - position(b.t_start, duration)) * 100}% - 2px)` }}
            >
              {BEAT_LABELS[b.title] ?? b.title}
            </button>
          ))}
          {cuts.map((c) => (
            <span key={c.id} title={`Cắt cảnh ${fmtTime(c.t_start)}`} className="pointer-events-none absolute inset-y-0 w-px bg-on-stage" style={{ left: pct(c.t_start, duration) }} />
          ))}
        </div>
      </div>
      {/* playhead across all lanes */}
      <div className="pointer-events-none absolute inset-y-0 right-0 left-[88px]">
        <span className="absolute inset-y-0 w-0.5 -translate-x-px bg-brand" style={{ left: pct(currentTime, duration) }} />
      </div>
      <div className="flex justify-between pl-[88px] font-mono text-[10px] text-on-stage-2">
        <span>{fmtTime(currentTime)}</span>
        <span>{fmtTime(duration)}</span>
      </div>
      {hover && (
        <div
          className="absolute bottom-full z-20 mb-2"
          style={{ left: `clamp(0px, calc(88px + ${position(hover.t_start, duration)} * (100% - 88px) - 144px), calc(100% - 288px))` }}
>
          <MarkerTooltip marker={hover} onWhy={hover.lane === 'structure' ? null : onWhy} />
        </div>
      )}
    </div>
  )
}
