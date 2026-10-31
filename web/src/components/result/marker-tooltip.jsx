import { HelpCircle } from 'lucide-react'

import { Tag } from '@/components/score-visuals'
import { SEV_BG } from '@/lib/score-style'
import { LANE_LABELS, SEVERITY_LABELS } from '@/lib/labels'
import { fmtRange } from '@/lib/timeline'
import { cn } from '@/lib/utils'

const SOURCE_LABEL = { policy: 'Rule', criterion: 'Tiêu chí', feature: 'Feature' }

/** Hover card of one timeline marker: title, comment, rule/criterion, time, and "Vì sao?". */
export function MarkerTooltip({ marker, onWhy, className }) {
  if (!marker) return null
  const src = marker.source ?? {}
  return (
    <div role="tooltip" className={cn('w-72 rounded-lg bg-surface p-3 text-left text-ink shadow-pop', className)}>
      <div className="flex items-center gap-2">
        <span className={cn('size-2 shrink-0 rounded-full', SEV_BG[marker.severity])} />
        <span className="font-mono text-[11px] text-muted-foreground">{fmtRange(marker)}</span>
        <span className="text-[11px] text-muted-foreground">
          {LANE_LABELS[marker.lane]} · {SEVERITY_LABELS[marker.severity] ?? marker.severity}
        </span>
      </div>
      <div className="mt-1 text-sm font-semibold leading-snug">{marker.title}</div>
      {marker.kind === 'ghost' && (
        <Tag tone="muted" className="mt-1">
          Gợi ý vị trí · video không có đoạn này
        </Tag>
      )}
      {marker.comment && <p className="mt-1 text-xs leading-relaxed text-ink-2">{marker.comment}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {src.ref && (
          <span>
            {SOURCE_LABEL[src.type] ?? src.type}: <span className="font-mono text-ink">{src.ref}</span>
            {src.target ? ` · ${src.target}` : ''}
          </span>
        )}
        {marker.region?.box && <Tag tone="accent">AI ước lượng vị trí</Tag>}
        {onWhy && (
          <button
            type="button"
            onClick={() => onWhy(marker)}
            className="ml-auto inline-flex items-center gap-1 font-medium text-brand hover:underline"
          >
            <HelpCircle className="size-3.5" /> Vì sao?
          </button>
        )}
      </div>
    </div>
  )
}
