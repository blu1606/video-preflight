import { ArrowRight, Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Tag } from '@/components/score-visuals'
import { AGENT_STYLE } from '@/lib/agent-style'
import { groupSteps, runSeconds, summarizeStep } from '@/lib/run-stages'
import { cn } from '@/lib/utils'

const KIND_TONE = { tool: 'info', functional: 'muted', reasoning: 'accent' }
const REPLAY_SECONDS = 8 // a replay squeezes the real run into this long

export function JsonBlock({ label, value }) {
  if (value === null || value === undefined) return null
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <pre className="max-h-96 overflow-auto rounded-md bg-stage p-2 text-[11px] leading-relaxed text-on-stage">{JSON.stringify(value, null, 2)}</pre>
    </div>
  )
}

/** Agent flow over the 7 stages; each node is a trace step (agent, tool, kind, status, time). */
export function TabAgentFlow({ steps }) {
  const [selected, setSelected] = useState(null)
  const [clock, setClock] = useState(null) // replay time in run-ms; null = show everything
  const totalMs = runSeconds(steps) * 1000

  useEffect(() => {
    if (clock === null) return
    const step = Math.max(50, totalMs / ((REPLAY_SECONDS * 1000) / 100))
    const t = setInterval(() => setClock((c) => (c === null || c + step > totalMs ? null : c + step)), 100)
    return () => clearInterval(t)
  }, [clock === null, totalMs]) // eslint-disable-line react-hooks/exhaustive-deps -- restart only on play/stop

  const stateOf = (s) => {
    if (clock === null) return 'done'
    if (clock < s.started_ms) return 'pending'
    return clock < s.started_ms + s.duration_s * 1000 ? 'active' : 'done'
  }
  const stages = groupSteps(steps)
  const byAgent = {}
  for (const s of steps) {
    byAgent[s.agent] = byAgent[s.agent] ?? { n: 0, sec: 0 }
    byAgent[s.agent].n += 1
    byAgent[s.agent].sec += s.duration_s ?? 0
  }
  const focus = steps.find((s) => s === selected)

  if (!steps.length) return <p className="text-sm text-muted-foreground">Lần chạy này không có trace.</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">{steps.length} bước · {(totalMs / 1000).toFixed(1)}s</span>
        {Object.entries(byAgent).map(([agent, a]) => (
          <span key={agent} className={cn('rounded px-1.5 py-0.5 text-[11px]', AGENT_STYLE[agent])}>
            {agent}: {a.n} bước · {a.sec.toFixed(1)}s
          </span>
        ))}
        <button
          type="button"
          onClick={() => setClock(clock === null ? 0 : null)}
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-line-2 bg-surface px-2.5 font-medium hover:border-ink"
        >
          {clock === null ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          {clock === null ? 'Phát lại theo thời gian' : `${(clock / 1000).toFixed(1)}s · dừng`}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {stages.map((stage, si) => {
          const agents = {}
          for (const s of stage.steps) (agents[s.agent] = agents[s.agent] ?? []).push(s)
          return (
            <div key={stage.id} className="flex shrink-0 items-stretch gap-2">
              <div className="w-56 space-y-2 rounded-lg bg-surface p-2 shadow-sheet">
                <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {si + 1}. {stage.title}
                </div>
                {!stage.steps.length && <div className="text-[11px] text-faint">không chạy</div>}
                {Object.entries(agents).map(([agent, list]) => (
                  <div key={agent} className="space-y-1">
                    <span className={cn('rounded px-1.5 py-0.5 text-[10.5px]', AGENT_STYLE[agent])}>{agent}</span>
                    {list.map((s, k) => {
                      const st = stateOf(s)
                      return (
                        <button
                          key={`${s.name}-${k}`}
                          type="button"
                          onClick={() => setSelected(s === selected ? null : s)}
                          className={cn(
                            'w-full rounded-md border bg-surface px-2 py-1.5 text-left text-[11px] transition',
                            st === 'pending' && 'opacity-30',
                            st === 'active' && 'ring-2 ring-brand',
                            s.status === 'skipped' && 'border-dashed',
                            s.status === 'error' && 'border-critical',
                            s === selected && 'border-ink',
                          )}
                        >
                          <div className="flex items-center gap-1">
                            <span className="truncate font-mono font-medium">{s.tool ? `${s.tool}()` : s.name}</span>
                            <span className="ml-auto text-faint tabular-nums">{s.duration_s}s</span>
                          </div>
                          <div className="line-clamp-2 text-muted-foreground">{summarizeStep(s)}</div>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
              {si < stages.length - 1 && <ArrowRight className="size-4 shrink-0 self-center text-faint" />}
            </div>
          )
        })}
      </div>

      {focus ? (
        <div className="space-y-2 rounded-xl bg-surface p-3 shadow-sheet">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-sm font-semibold">{focus.name}</span>
            <span className={cn('rounded px-1.5 py-0.5 text-[11px]', AGENT_STYLE[focus.agent])}>{focus.agent}</span>
            {focus.tool && <Tag tone="muted">{focus.tool}()</Tag>}
            <Tag tone={KIND_TONE[focus.kind] ?? 'muted'}>{focus.kind}</Tag>
            <Tag tone={focus.status === 'error' ? 'critical' : focus.status === 'skipped' ? 'muted' : 'pass'}>{focus.status}</Tag>
            <span className="text-muted-foreground">bắt đầu {(focus.started_ms / 1000).toFixed(2)}s · {focus.duration_s}s</span>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row">
            <JsonBlock label="input" value={focus.input} />
            <JsonBlock label="output" value={focus.output} />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Bấm một bước để xem JSON input/output của nó.</p>
      )}
    </div>
  )
}
