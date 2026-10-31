import { ChevronRight, HelpCircle } from 'lucide-react'
import { useState } from 'react'

import { CriteriaRadar } from '@/components/result/criteria-radar'
import { Meter, ScoreText, Sheet, Signal, Tag } from '@/components/score-visuals'
import { fmtScore } from '@/lib/score-style'
import { cn } from '@/lib/utils'

function CriterionRow({ c, selected, onSelect, onWhy }) {
  return (
    <li
      className={cn('grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-subtle', selected && 'bg-subtle')}
      onClick={() => onSelect(c.id)}
    >
      <span className="pt-0.5">
        <Signal value={c.score} />
      </span>
      <span className="min-w-0">
        <span className="font-medium text-ink">{c.name}</span>{' '}
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {c.id} · w {c.weight}
        </span>
        {c.score == null ? (
          <span className="block text-[11px] text-muted-foreground">Chưa chấm: {c.notScoredReason}</span>
        ) : (
          c.topLevel && (
            <span className="block text-[11px] text-muted-foreground">
              {c.topLevel.label}
              {c.topLevel.description ? `: ${c.topLevel.description}` : ''}
              {c.confidence != null ? ` · confidence ${c.confidence.toFixed(2)}` : ''}
            </span>
          )
        )}
      </span>
      <span className="flex items-center gap-1.5">
        <ScoreText value={c.score} reason={c.notScoredReason} className="text-sm" />
        <button
          type="button"
          aria-label={`Vì sao ${c.id}?`}
          onClick={(e) => {
            e.stopPropagation()
            onWhy(c)
          }}
          className="text-faint hover:text-brand"
        >
          <HelpCircle className="size-3.5" />
        </button>
      </span>
    </li>
  )
}

/**
 * Meters per real backend group (score, coverage from result.scores). Opening a group lists
 * its criteria (v2: Decisions questions, v1: formula criteria) with signal bars and a radar of them.
 * `notes`: one plain-language line per group from the AI summary, when the run has one.
 */
export function GroupScores({ groups, provisional, notes = {}, openGroup, onOpenGroup, onWhyCriterion }) {
  const [selected, setSelected] = useState(null)
  if (!groups.length) return null
  return (
    <Sheet
      title="Điểm theo nhóm"
      aside={provisional ? <Tag tone="accent">tạm tính từ câu Decisions</Tag> : <span className="text-xs text-muted-foreground">bấm một nhóm để xem tiêu chí</span>}
      bodyClassName="p-0"
    >
      <ul className="divide-y divide-line">
        {groups.map((g) => {
          const open = openGroup === g.name
          return (
            <li key={g.name}>
              <button
                type="button"
                aria-expanded={open}
                disabled={!g.criteria.length}
                onClick={() => onOpenGroup(open ? null : g.name)}
                className="grid w-full grid-cols-[minmax(0,1fr)_minmax(80px,140px)_56px_16px] items-center gap-3 px-4 py-3 text-left hover:bg-subtle disabled:cursor-default"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">{g.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {g.hint} · coverage {Math.round(g.coverage * 100)}%
                  </span>
                  {notes[g.name] && <span className="mt-0.5 block text-xs text-ink-2">{notes[g.name]}</span>}
                </span>
                <Meter value={g.score} />
                <ScoreText value={g.score} reason="Chưa có tiêu chí nào chấm được" className="text-right text-lg" />
                {g.criteria.length > 0 ? <ChevronRight className={cn('size-4 text-faint transition', open && 'rotate-90')} /> : <span />}
              </button>
              {open && (
                <div className="grid gap-2 border-t border-line bg-page/40 px-2 py-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <ul className="space-y-0.5">
                    {g.criteria.map((c) => (
                      <CriterionRow key={c.id} c={c} selected={selected === c.id} onSelect={setSelected} onWhy={onWhyCriterion} />
                    ))}
                  </ul>
                  <div className="space-y-1">
                    <CriteriaRadar criteria={g.criteria} selectedId={selected} onSelect={setSelected} />
                    <p className="px-2 text-center text-[10.5px] text-muted-foreground">
                      Vòng chấm = 50 điểm. Trục đứt nét: tiêu chí chưa chấm (không vẽ ở 0). Điểm nhóm {fmtScore(g.score)}.
                    </p>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
