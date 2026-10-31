import { useEffect, useRef } from 'react'

import { ErrorBoundary } from '@/components/error-boundary'
import { TabAgentFlow } from '@/components/report/tab-agent-flow'
import { TabAiSaw } from '@/components/report/tab-ai-saw'
import { TabDecisions } from '@/components/report/tab-decisions'
import { TabPolicy } from '@/components/report/tab-policy'
import { TabScoring } from '@/components/report/tab-scoring'
import { TabTrust } from '@/components/report/tab-trust'
import { Tag } from '@/components/score-visuals'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { indexQuestions } from '@/lib/analysis-view-model'
import { cn } from '@/lib/utils'

const REPORT_TABS = [
  ['agent', 'Quy trình agent'],
  ['ai-saw', 'AI đã xem gì'],
  ['decisions', 'Câu hỏi (Decisions API)'],
  ['scoring', 'Cách tính điểm'],
  ['policy', 'Policy'],
  ['trust', 'Có tin được không'],
]

/**
 * "Báo cáo đầy đủ": full-screen dialog (mockup-v2 deep-dialog) with 6 tabs. Opens at a tab and an anchor
 * (deep link from a marker, fix or policy rule), scrolls to it and highlights it.
 */
export function ReportDialog({ open, onOpenChange, tab, anchor, onTabChange, analysis, video, onSeek }) {
  const body = useRef(null)
  const result = analysis?.result

  useEffect(() => {
    if (!open || !anchor) return
    // wait for the tab content to render (some tabs load data first)
    let tries = 0
    const t = setInterval(() => {
      const el = body.current?.querySelector(`#${CSS.escape(anchor)}`)
      if (el || ++tries > 20) {
        clearInterval(t)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
    return () => clearInterval(t)
  }, [open, tab, anchor])

  if (!result) return null
  const trace = result.trace ?? []
  const step = (name) => trace.find((s) => s.name === name)
  const seekAndClose = (t) => {
    onOpenChange(false)
    onSeek?.(t)
  }

  let content = null
  if (tab === 'agent') content = <TabAgentFlow steps={trace} />
  else if (tab === 'ai-saw')
    content = (
      <TabAiSaw
        videoId={video?.id ?? result.video_id}
        hasFile={!!video?.local_file}
        markers={result.markers ?? []}
        cutTimes={result.features?.['video.pacing_cut_timestamps']?.value}
        extractStep={step('extract_video_content')}
        onSeek={video?.local_file ? seekAndClose : undefined}
      />
    )
  else if (tab === 'decisions')
    content = <TabDecisions decisions={result.decisions} step={step('ask_decisions_api')} features={result.features} checks={result.cross_check} anchor={anchor} />
  else if (tab === 'scoring') content = <TabScoring result={result} questions={indexQuestions(result.decisions)} anchor={anchor} />
  else if (tab === 'policy') content = <TabPolicy result={result} anchor={anchor} onSeek={video?.local_file ? seekAndClose : undefined} />
  else if (tab === 'trust') content = <TabTrust result={result} skuId={video?.sku_id ?? result.features?.['sku.sku_id']?.value} extractStep={step('extract_video_content')} />

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <header className="space-y-2 border-b border-line bg-surface px-4 pt-3 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Báo cáo đầy đủ</DialogTitle>
            <span className="font-mono text-xs text-muted-foreground">
              {video?.id} · run #{analysis.id}
            </span>
            <Tag tone="muted">rubric {result.rubric}</Tag>
          </div>
          <DialogDescription className="sr-only">Chi tiết cách AI phân tích và chấm điểm video này</DialogDescription>
          <nav className="-mb-px flex gap-1 overflow-x-auto" role="tablist">
            {REPORT_TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => onTabChange(id)}
                className={cn(
                  'h-9 shrink-0 border-b-2 px-3 text-xs font-medium whitespace-nowrap transition',
                  tab === id ? 'border-brand text-brand' : 'border-transparent text-ink-2 hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </header>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto p-4" role="tabpanel">
          <ErrorBoundary key={tab} name={`report:${tab}`} title="Không hiển thị được tab này">
            {content}
          </ErrorBoundary>
        </div>
      </DialogContent>
    </Dialog>
  )
}
