import { TriangleAlert } from 'lucide-react'

import { StatusBadge } from '@/components/common'
import { ScoreText, Tag } from '@/components/score-visuals'
import { showValue } from '@/lib/api'
import { DIMENSION_LABELS, domainLabel } from '@/lib/labels'
import { cn } from '@/lib/utils'

const SECTIONS = [['viral'], ['conversion'], ['sku'], ['shop'], ['policy'], ['video', 'orchestration']]
const VERDICT_TONE = { conflict: 'critical', agree: 'pass', unverified: 'muted' }

function LevelBars({ q }) {
  const probs = q.answer?.probabilities ?? []
  if (!probs.length) return <div className="text-xs">Kết quả: <b>{showValue(q.value)}</b></div>
  const best = Math.max(...probs.map((p) => p.probability))
  return (
    <div className="space-y-1">
      {probs.map((p, i) => {
        const level = q.levels?.find((l) => l.label === p.label)
        return (
          <div key={`${p.label}-${i}`} className={cn('grid grid-cols-[96px_minmax(0,1fr)_40px] items-center gap-2 text-xs', p.probability === best && 'font-semibold')}>
            <span className="truncate">{p.label}</span>
            <div className="relative h-5 overflow-hidden rounded bg-subtle">
              <div className="absolute inset-y-0 left-0 rounded bg-brand/25" style={{ width: `${p.probability * 100}%` }} />
              <span className="relative block truncate px-1.5 text-[10.5px] leading-5 text-ink-2">{level?.description}</span>
            </div>
            <span className="text-right tabular-nums">{Math.round(p.probability * 100)}%</span>
          </div>
        )
      })}
    </div>
  )
}

function CrossCheck({ c }) {
  return (
    <div className={cn('space-y-1 rounded-md border p-2 text-xs', c.verdict === 'conflict' ? 'border-critical/40 bg-critical-tint' : 'border-line bg-surface')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Cross-check</span>
        <span>Decisions <ScoreText value={c.decision_score} /></span>
        <span>· Rule <ScoreText value={c.rule?.score ?? null} /></span>
        <span>· Agent <ScoreText value={c.agent?.score ?? null} reason={c.agent?.reason} /></span>
        <Tag tone={VERDICT_TONE[c.verdict] ?? 'muted'}>{c.verdict}</Tag>
      </div>
      {(c.rule?.criteria ?? []).map((r) => (
        <div key={r.id} className="text-muted-foreground">
          Rule {r.rubric} <span className="font-mono">{r.id}</span> {r.name}: {r.score ?? 'not_scored'} ·{' '}
          <span className="font-mono">{Object.entries(r.inputs ?? {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' · ')}</span>
        </div>
      ))}
      {c.agent?.status === 'ok' ? (
        <div>
          Agent ({c.agent.model}, {c.agent.source}): <b>{c.agent.label}</b>. {c.agent.rationale}
        </div>
      ) : (
        c.agent && <div className="text-muted-foreground">Agent: {c.agent.status} {c.agent.reason ?? ''}</div>
      )}
    </div>
  )
}

function Question({ q, features, check, highlighted }) {
  const missing = q.status === 'MISSING'
  return (
    <article id={`q-${q.id}`} className={cn('scroll-mt-24 space-y-2 rounded-xl bg-surface p-3 shadow-sheet', highlighted && 'ring-2 ring-brand')}>
      <header className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{q.id}</span>
        <span className="text-sm font-medium">{DIMENSION_LABELS[q.dimension] ?? q.dimension}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{q.dimension}</span>
        <Tag tone="muted">{q.type}</Tag>
        {q.weight != null && <Tag tone="muted">w {q.weight}</Tag>}
        <StatusBadge status={q.status} />
        {check?.verdict === 'conflict' && <TriangleAlert className="size-4 text-critical" />}
        <span className="ml-auto flex items-center gap-2 text-xs">
          {q.answer?.confidence != null && <span className="text-muted-foreground">confidence {q.answer.confidence.toFixed(2)}</span>}
          {q.type === 'score' ? <ScoreText value={q.value} reason={q.reason} className="text-base" /> : <b>{missing ? '–' : showValue(q.value)}</b>}
        </span>
      </header>
      {q.instructions && <p className="text-xs text-ink-2 italic">“{q.instructions}”</p>}
      {missing ? <p className="text-xs text-muted-foreground">Không gửi câu này: {q.reason}</p> : <LevelBars q={q} />}
      {q.type === 'score' && !missing && (
        <p className="text-[11px] text-muted-foreground">Điểm 0–100 = level kỳ vọng (Σ level × xác suất) / level cao nhất. Đây là mức rubric, không phải xác suất bán được.</p>
      )}
      {(q.inputs ?? []).length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Dữ liệu đã gửi ({q.inputs.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {q.inputs.map((n) => (
              <li key={n} className="flex flex-wrap items-center gap-1">
                <span className="font-mono">{n}</span> = <span className="break-all">{n.startsWith('keyframes:') ? 'ảnh keyframe' : showValue(features?.[n]?.value)}</span>
                {!n.startsWith('keyframes:') && <StatusBadge status={features?.[n]?.status ?? 'MISSING'} />}
              </li>
            ))}
          </ul>
        </details>
      )}
      {check && <CrossCheck c={check} />}
    </article>
  )
}

/** Decisions API questions by backend domain, with % per level, confidence, inputs and cross-check. */
export function TabDecisions({ decisions, step, features, checks, anchor }) {
  const questions = decisions?.questions ?? []
  if (!questions.length) {
    return <p className="text-sm text-muted-foreground">Lần chạy này không có câu hỏi Decisions (rubric v1 hoặc bước bị bỏ qua{step?.output?.reason ? `: ${step.output.reason}` : ''}).</p>
  }
  const call = decisions.calls?.[0]
  const usage = call?.usage
  const checkById = Object.fromEntries((checks ?? []).map((c) => [c.id, c]))
  const answered = questions.filter((q) => q.status !== 'MISSING').length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface p-3 text-xs shadow-sheet">
        <span className="font-semibold">1 lần gọi cho mọi câu</span>
        {call && <span>· model {call.model}</span>}
        {usage && <span>· {usage.input_tokens} input token ({usage.input_tokens_details?.cached_tokens ?? 0} cached)</span>}
        <span>· nguồn {step?.output?.source ?? decisions.source ?? 'không rõ'}</span>
        {call?.cache_key && <span className="font-mono text-muted-foreground">· cache {call.cache_key}</span>}
        <span className="ml-auto">{answered}/{questions.length} câu có trả lời · {(checks ?? []).filter((c) => c.verdict === 'conflict').length} mâu thuẫn</span>
      </div>
      {SECTIONS.map((domains) => {
        const qs = questions.filter((q) => domains.includes(q.domain))
        if (!qs.length) return null
        return (
          <section key={domains[0]} className="space-y-2">
            <h3 className="text-sm font-semibold">
              {domains.map(domainLabel).join(' / ')} <span className="font-normal text-muted-foreground">· {qs.length} câu</span>
            </h3>
            <div className="grid gap-2 xl:grid-cols-2">
              {qs.map((q) => (
                <Question key={q.id} q={q} features={features} check={checkById[q.id]} highlighted={anchor === `q-${q.id}`} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
