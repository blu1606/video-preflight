import { Check, ChevronDown, Circle, CircleSlash, ListTree, Loader2, X } from 'lucide-react'
import { useState } from 'react'

import { Tag } from '@/components/score-visuals'
import { groupSteps, runSeconds, summarizeStep } from '@/lib/run-stages'
import { cn } from '@/lib/utils'

const ICON = {
  pending: [Circle, 'text-faint'],
  running: [Loader2, 'text-brand animate-spin'],
  done: [Check, 'text-pass'],
  ok: [Check, 'text-pass'],
  skipped: [CircleSlash, 'text-faint'],
  error: [X, 'text-critical'],
}
const STATUS_TEXT = { pending: 'chờ', running: 'đang chạy', done: 'xong', ok: 'xong', skipped: 'bỏ qua', error: 'lỗi' }

function StatusIcon({ status }) {
  const [Icon, cls] = ICON[status] ?? ICON.pending
  return <Icon className={cn('size-3.5 shrink-0', cls)} aria-label={STATUS_TEXT[status]} />
}

/**
 * Live step list grouped into the 7 stages. Steps appear as stream events arrive; when the run is over it
 * collapses into one line ("19 bước · 12.4s · xem trace").
 */
export function RunSteps({ steps, runStatus, source, onOpenTrace }) {
  const [expanded, setExpanded] = useState(false)
  const stages = groupSteps(steps, runStatus === 'running' ? 'running' : 'done')
  const live = runStatus === 'running'

  if (!live && !expanded) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-4 py-2.5 text-xs shadow-sheet">
        <Check className="size-4 text-pass" />
        <span className="font-medium">
          {steps.length} bước · {runSeconds(steps).toFixed(1)}s
        </span>
        {steps.some((s) => s.status === 'error') && <Tag tone="critical">có bước lỗi</Tag>}
        {steps.some((s) => s.status === 'skipped') && <Tag tone="muted">{steps.filter((s) => s.status === 'skipped').length} bỏ qua</Tag>}
        <button type="button" onClick={() => setExpanded(true)} className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-ink">
          các chặng <ChevronDown className="size-3.5" />
        </button>
        <button type="button" onClick={onOpenTrace} className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
          <ListTree className="size-3.5" /> xem trace
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-surface shadow-sheet">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs">
        {live ? <Loader2 className="size-4 animate-spin text-brand" /> : <Check className="size-4 text-pass" />}
        <span className="font-semibold">{live ? 'Đang phân tích' : 'Các bước đã chạy'}</span>
        <span className="text-muted-foreground">
          {steps.length} bước{source === 'replay' ? ' · phát lại từ kết quả (stream không mở được)' : live ? ' · stream trực tiếp' : ''}
        </span>
        {!live && (
          <button type="button" onClick={() => setExpanded(false)} className="ml-auto text-muted-foreground hover:text-ink">
            thu gọn
          </button>
        )}
      </div>
      <ol className="divide-y divide-line">
        {stages.map((stage, i) => (
          <li key={stage.id} className="px-4 py-2">
            <div className="flex items-center gap-2 text-xs">
              <StatusIcon status={stage.status} />
              <span className={cn('font-semibold', stage.status === 'pending' && 'text-faint')}>
                {i + 1}. {stage.title}
              </span>
              {stage.id === 'decisions' && <span className="text-muted-foreground">· 1 lần gọi cho mọi câu</span>}
              <span className="ml-auto text-[11px] text-muted-foreground">{STATUS_TEXT[stage.status] ?? stage.status}</span>
            </div>
            {stage.steps.length > 0 && (
              <ul className="mt-1 space-y-0.5 pl-5">
                {stage.steps.map((s, k) => (
                  <li key={`${s.name}-${k}`} className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-start gap-2 text-[11.5px]">
                    <StatusIcon status={s.status} />
                    <span className="min-w-0">
                      <span className="font-mono">{s.name}</span>
                      <span className="text-muted-foreground"> · {s.agent}</span>
                      <span className="block truncate text-muted-foreground">{summarizeStep(s)}</span>
                    </span>
                    <span className="font-mono text-[10.5px] text-faint tabular-nums">{s.duration_s != null ? `${s.duration_s}s` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
