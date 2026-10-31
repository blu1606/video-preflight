import { ArrowUpRight, Sparkles } from 'lucide-react'

import { Sheet, SkeletonBlock, Tag } from '@/components/score-visuals'
import { cn } from '@/lib/utils'

const TONE_DOT = { good: 'bg-pass', bad: 'bg-critical', info: 'bg-faint' }

function SourceLink({ refs, onOpenRef }) {
  if (!refs?.length) return null
  return (
    <button type="button" onClick={() => onOpenRef(refs[0])} className="inline-flex items-center gap-0.5 text-[11px] font-medium whitespace-nowrap text-brand hover:underline">
      Xem số liệu <ArrowUpRight className="size-3" />
    </button>
  )
}

/**
 * The simple view's reading layer: the AI gateway (step summarize_insights) explains the finished run in
 * plain Vietnamese. Each point cites the ids it rests on; "Xem số liệu" opens them in the full report.
 * Without insights (step off, failed or not run) it says why and the template explanations below remain.
 */
export function InsightSummary({ insights, running, step, onOpenRef }) {
  if (running) {
    return (
      <Sheet title="Tóm tắt dễ hiểu" bodyClassName="space-y-2">
        <SkeletonBlock className="h-5 w-3/4" />
        <SkeletonBlock className="h-4 w-full" />
        <p className="text-xs text-muted-foreground">AI viết tóm tắt sau khi chấm xong.</p>
      </Sheet>
    )
  }
  if (!insights) {
    if (!step) return null
    return (
      <div className="flex items-start gap-2 rounded-xl border border-dashed border-line px-3 py-2 text-xs text-muted-foreground">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Chưa có tóm tắt AI cho lần chạy này ({step.output?.reason ?? step.status}). Bật “AI tóm tắt kết quả” trong tùy chọn rồi chạy lại để có bản đọc dễ hiểu.
        </span>
      </div>
    )
  }
  return (
    <Sheet
      title={
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-4 text-brand" /> Tóm tắt dễ hiểu
        </span>
      }
      aside={<Tag tone="accent" title={`${insights.model ?? ''} · ${insights.source ?? ''}`}>AI tóm tắt · số gốc ở báo cáo đầy đủ</Tag>}
      bodyClassName="space-y-3"
    >
      {insights.headline && <p className="text-base leading-snug font-semibold text-ink">{insights.headline}</p>}
      {insights.summary && <p className="text-sm text-ink-2">{insights.summary}</p>}
      {insights.insights.length > 0 && (
        <ul className="space-y-1.5">
          {insights.insights.map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', TONE_DOT[it.tone] ?? TONE_DOT.info)} />
              <span className="min-w-0 flex-1">{it.text}</span>
              <SourceLink refs={it.refs} onOpenRef={onOpenRef} />
            </li>
          ))}
        </ul>
      )}
      {(insights.policy || insights.shop) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {insights.policy && (
            <div className="rounded-lg bg-subtle px-3 py-2 text-xs">
              <div className="mb-0.5 font-semibold text-ink">Policy</div>
              <p className="text-ink-2">{insights.policy}</p>
            </div>
          )}
          {insights.shop && (
            <div className="rounded-lg bg-subtle px-3 py-2 text-xs">
              <div className="mb-0.5 font-semibold text-ink">Về shop (không tính vào điểm video)</div>
              <p className="text-ink-2">{insights.shop}</p>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
