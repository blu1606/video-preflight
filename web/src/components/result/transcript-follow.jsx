import { useEffect, useRef } from 'react'

import { activeSegmentIndex, fmtTime, highlightClaims } from '@/lib/timeline'
import { cn } from '@/lib/utils'

/**
 * Transcript that follows the video: the spoken line is highlighted and absolute claims
 * (features video.policy_absolute_claims) are underlined in red. Click a line to seek.
 */
export function TranscriptFollow({ segments, claims, currentTime, onSeek }) {
  const box = useRef(null)
  const active = activeSegmentIndex(segments, currentTime)

  useEffect(() => {
    const el = box.current?.querySelector(`[data-seg="${active}"]`)
    if (el && box.current) box.current.scrollTo({ top: el.offsetTop - box.current.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' })
  }, [active])

  if (!segments?.length) return <p className="text-xs text-on-stage-2">Chưa có lời thoại theo mốc thời gian cho video này.</p>
  const spoken = (claims ?? []).filter((c) => !c.channel || c.channel === 'spoken')

  return (
    <div ref={box} className="relative max-h-40 space-y-0.5 overflow-y-auto pr-1 text-xs">
      {segments.map((s, i) => (
        <button
          key={`${s.start}-${i}`}
          type="button"
          data-seg={i}
          onClick={() => onSeek(s.start)}
          className={cn(
            'flex w-full gap-2 rounded px-1.5 py-0.5 text-left transition',
            i === active ? 'bg-on-stage-line text-on-stage' : 'text-on-stage-2 hover:text-on-stage',
          )}
        >
          <span className="shrink-0 font-mono text-[10px] leading-5 opacity-70">{fmtTime(s.start)}</span>
          <span className="leading-5">
            {highlightClaims(s.text, spoken).map((p, k) =>
              p.claim ? (
                <span key={k} className="underline decoration-[#ff5a5f] decoration-2 underline-offset-2" title="Absolute claim (Policy)">
                  {p.text}
                </span>
              ) : (
                <span key={k}>{p.text}</span>
              ),
            )}
          </span>
        </button>
      ))}
    </div>
  )
}
