import { StatusBadge } from '@/components/common'
import { Meter, ScoreText, Tag } from '@/components/score-visuals'
import { useFetch } from '@/hooks/use-fetch'
import { showValue } from '@/lib/api'
import { criterionView } from '@/lib/analysis-view-model'
import { groupLabel } from '@/lib/labels'
import { cn } from '@/lib/utils'

async function loadRubrics() {
  const res = await fetch('/py/rubrics')
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

export function CodeBlock({ source }) {
  if (!source) return null
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[11px] text-muted-foreground">Xem code</summary>
      <pre className="mt-1 max-h-60 overflow-auto rounded bg-stage p-2 text-[11px] text-on-stage">{source}</pre>
    </details>
  )
}

/** Σ(w × score) / Σw over the scored criteria, written out with the real numbers. */
function GroupMath({ criteria }) {
  const scored = criteria.filter((c) => c.score != null)
  if (!scored.length) return <div className="font-mono text-[11px] text-muted-foreground">không có tiêu chí nào chấm được → điểm nhóm “–”</div>
  const num = scored.reduce((a, c) => a + c.weight * c.score, 0)
  const den = scored.reduce((a, c) => a + c.weight, 0)
  return (
    <div className="font-mono text-[11px] break-words text-muted-foreground">
      ({scored.map((c) => `${c.weight}×${c.score}`).join(' + ')}) / {den.toFixed(2)} = {(num / den).toFixed(1)}
    </div>
  )
}

/** How each group score was computed: criteria, weights, inputs with source labels, the math and the code. */
export function TabScoring({ result, questions, anchor }) {
  const rubrics = useFetch(loadRubrics, [])
  const sources = { ...rubrics.data?.shop_rubric, ...rubrics.data?.[`rubric_${result.rubric}`] }
  const features = result.features ?? {}
  const weights = Object.keys(result.overall?.weights ?? {}).length ? result.overall.weights : null

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Điểm nhóm = trung bình có trọng số của các tiêu chí đã chấm; coverage = tổng trọng số đã chấm / tổng trọng số. {weights ? (
          <>Điểm video = {Object.entries(weights).map(([g, w]) => `${w}×${groupLabel(g)}`).join(' + ')} (chia cho tổng trọng số các nhóm có điểm).</>
        ) : (
          'Lần chạy này không có điểm tổng.'
        )}
        {rubrics.error && <span className="text-critical"> Không tải được code tính điểm: {rubrics.error.message}</span>}
      </p>
      {(result.scores ?? []).map((g) => {
        const criteria = (g.criteria ?? []).map((c) => ({ raw: c, view: criterionView(c, questions) }))
        return (
          <section key={g.name} id={`group-${g.name}`} className="space-y-2 rounded-xl bg-surface p-3 shadow-sheet">
            <header className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{groupLabel(g.name)}</h3>
              <span className="font-mono text-[11px] text-muted-foreground">{g.name}</span>
              <span className="ml-auto flex items-center gap-2 text-xs">
                coverage {Math.round((g.coverage ?? 0) * 100)}%
                <ScoreText value={g.score} className="text-lg" />
              </span>
            </header>
            <Meter value={g.score} />
            <GroupMath criteria={criteria.map((c) => c.raw)} />
            <table className="w-full text-xs">
              <thead className="text-left text-[11px] text-muted-foreground">
                <tr>
                  <th className="w-12 py-1 font-medium">id</th>
                  <th className="w-44 font-medium">tiêu chí</th>
                  <th className="w-10 font-medium">w</th>
                  <th className="w-14 font-medium">điểm</th>
                  <th className="font-medium">đầu vào / lý do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {criteria.map(({ raw: c, view }) => (
                  <tr key={c.id} id={`crit-${c.id}`} className={cn('scroll-mt-24 align-top', anchor === `crit-${c.id}` && 'bg-brand-tint')}>
                    <td className="py-1.5 font-mono">{c.id}</td>
                    <td>
                      {view.name}
                      {view.name !== c.name && <div className="text-[10.5px] text-muted-foreground">{c.name}</div>}
                    </td>
                    <td className="tabular-nums">{c.weight}</td>
                    <td>
                      <ScoreText value={c.score} reason={c.reason} />
                    </td>
                    <td className="space-y-0.5">
                      {c.score == null && <div className="text-muted-foreground">Chưa chấm: {c.reason || 'thiếu dữ liệu'}</div>}
                      {(c.inputs ?? []).map((name) =>
                        name.startsWith('decision.') ? (
                          <div key={name}>
                            <span className="font-mono">{name}</span>
                            {view.topLevel && (
                              <span className="text-muted-foreground">
                                {' '}→ {view.topLevel.label} (p {view.topLevel.probability.toFixed(2)}
                                {view.confidence != null ? `, confidence ${view.confidence.toFixed(2)}` : ''})
                              </span>
                            )}
                          </div>
                        ) : (
                          <div key={name} className="flex flex-wrap items-center gap-1">
                            <span className="font-mono">{name}</span> = <span className="break-all">{showValue(features[name]?.value)}</span>
                            {features[name] && <StatusBadge status={features[name].status} />}
                          </div>
                        ),
                      )}
                      {!(c.inputs ?? []).some((n) => n.startsWith('decision.')) && <CodeBlock source={sources[c.id]?.source} />}
                      {(c.inputs ?? []).some((n) => n.startsWith('decision.')) && <Tag tone="muted">điểm từ câu Decisions (xem tab Câu hỏi)</Tag>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
