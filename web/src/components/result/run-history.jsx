import { ChevronDown, History, RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { AnalysisOptionsPanel } from '@/components/analysis-options-panel'
import { fmtScore } from '@/lib/score-style'
import { Button } from '@/components/ui/button'
import { overallView } from '@/lib/overall-view'
import { cn } from '@/lib/utils'

const when = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? (iso ?? '') : d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

/** Run history (with each run's rubric and stored overall) and "Chạy lại" with the collapsed advanced options. */
/** onRerun goes through the page's paid-step confirmation. */
export function RunHistory({ runs, selectedId, onSelect, options, onOptionsChange, onRerun, running, extractionState }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl bg-surface shadow-sheet">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <History className="size-4 text-muted-foreground" />
        <label className="sr-only" htmlFor="run-history">Lịch sử chạy</label>
        <select
          id="run-history"
          value={selectedId ?? ''}
          disabled={!runs.length || running}
          onChange={(e) => onSelect(Number(e.target.value))}
          className="h-8 min-w-0 flex-1 rounded-md border border-line-2 bg-surface px-2 text-xs"
        >
          {!runs.length && <option value="">Chưa có lần chạy nào</option>}
          {runs.map((a) => {
            const o = overallView(a.result?.overall)
            return (
              <option key={a.id} value={a.id}>
                #{a.id} · {when(a.createdAt)} · rubric {a.result?.rubric ?? '?'} · điểm {fmtScore(o?.overall ?? null)}
              </option>
            )
          })}
        </select>
        <Button variant="outline" size="sm" disabled={running} onClick={onRerun}>
          <RotateCcw /> {runs.length ? 'Chạy lại' : 'Chạy phân tích'}
        </Button>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-ink"
        >
          Tùy chọn nâng cao <ChevronDown className={cn('size-3.5 transition', open && 'rotate-180')} />
        </button>
      </div>
      {open && (
        <div className="border-t border-line p-4">
          <AnalysisOptionsPanel options={options} onChange={onOptionsChange} extractionState={extractionState} />
        </div>
      )}
    </div>
  )
}
