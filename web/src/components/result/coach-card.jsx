import { Play } from 'lucide-react'

import { SEV_BG } from '@/lib/score-style'
import { fmtRange } from '@/lib/timeline'
import { cn } from '@/lib/utils'

/** Coach mode: the video paused at a marker; shows the advice and resumes on "Tiếp". */
export function CoachCard({ marker, onContinue, onWhy }) {
  if (!marker) return null
  return (
    <div className="absolute inset-x-3 bottom-3 z-10 rounded-lg bg-surface/95 p-3 text-ink shadow-pop backdrop-blur" role="dialog" aria-label="Góp ý tại mốc này">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className={cn('size-2 rounded-full', SEV_BG[marker.severity])} />
        <span className="font-mono">{fmtRange(marker)}</span>
        {marker.kind === 'ghost' && <span>Gợi ý vị trí</span>}
      </div>
      <div className="mt-0.5 text-sm font-semibold leading-snug">{marker.title}</div>
      {marker.comment && <p className="mt-0.5 line-clamp-3 text-xs text-ink-2">{marker.comment}</p>}
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={onContinue} className="inline-flex h-7 items-center gap-1 rounded-md border border-ink px-2.5 text-xs font-semibold">
          <Play className="size-3.5" /> Tiếp
        </button>
        <button type="button" onClick={() => onWhy(marker)} className="text-xs font-medium text-brand hover:underline">
          Vì sao?
        </button>
      </div>
    </div>
  )
}
