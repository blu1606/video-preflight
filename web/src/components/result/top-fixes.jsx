import { HelpCircle } from 'lucide-react'

import { ScoreText, Sheet, Tag, TimeChip } from '@/components/score-visuals'
import { SEV_BG } from '@/lib/score-style'
import { groupLabel } from '@/lib/labels'
import { cn } from '@/lib/utils'

/**
 * Three things to fix: the AI summary's fixes when the run has them, else verdict.weakest + policy hits. Hovering a fix lights its markers on the timeline
 * and hovering a marker lights its fix; time chips seek the video.
 */
export function TopFixes({ fixes, hoveredMarkerId, onHoverFix, onSeek, onWhy, hasMarkers }) {
  if (!fixes.length) return null
  const ai = fixes.some((f) => f.kind === 'ai')
  return (
    <Sheet
      title="Việc nên sửa trước"
      aside={<span className="text-xs text-muted-foreground">{fixes.length} việc{ai ? ' · AI viết lại từ kết quả chấm' : ''}</span>}
      bodyClassName="p-2"
    >
      <ol className="space-y-1">
        {fixes.map((f, i) => {
          const lit = hoveredMarkerId && f.markerIds.includes(hoveredMarkerId)
          return (
            <li
              key={f.key}
              onMouseEnter={() => onHoverFix(f)}
              onMouseLeave={() => onHoverFix(null)}
              className={cn('flex gap-3 rounded-lg px-2 py-2 transition', lit ? 'bg-brand-tint ring-1 ring-brand/40' : 'hover:bg-subtle')}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('size-2 shrink-0 rounded-full', SEV_BG[f.severity])} />
                  <span className={cn('text-sm font-semibold', f.kind === 'ai' && 'min-w-0 flex-1')}>{f.title}</span>
                  {f.kind === 'criterion' && (
                    <>
                      <Tag tone="muted">{groupLabel(f.group)}</Tag>
                      <ScoreText value={f.score} className="text-xs" />
                    </>
                  )}
                  {f.kind === 'policy' && <Tag tone="critical">{f.platforms.join(', ')}</Tag>}
                </div>
                {f.reason && <p className="text-xs text-ink-2">{f.reason}</p>}
                <div className="flex flex-wrap items-center gap-1">
                  {f.times.map((t) => (
                    <TimeChip key={t} sec={t} onSeek={onSeek} />
                  ))}
                  {!f.times.length && (
                    <span className="text-[11px] text-muted-foreground">
                      {hasMarkers ? 'Không có mốc thời gian cụ thể trong video' : 'Lần chạy này chưa có marker'}
                    </span>
                  )}
                  <button type="button" onClick={() => onWhy(f)} className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline">
                    <HelpCircle className="size-3.5" /> Vì sao?
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </Sheet>
  )
}
