import { ExternalLink } from 'lucide-react'

import { Tag, TimeChip } from '@/components/score-visuals'
import { SEV_BG } from '@/lib/score-style'
import { policyTargetsView } from '@/lib/analysis-view-model'
import { OUTCOME_LABELS, SEVERITY_LABELS } from '@/lib/labels'
import { parseTimestamp } from '@/lib/timeline'
import { cn } from '@/lib/utils'

const OUTCOME_TONE = { needs_review: 'critical', unknown: 'muted', not_triggered: 'pass' }
const CLAIM_TONE = { supported: 'pass', not_in_listing: 'amber', contradicts: 'critical' }

function Evidence({ text, onSeek }) {
  const t = parseTimestamp(text)
  return (
    <li className="flex items-start gap-1.5 text-xs">
      {t && <TimeChip sec={t.start} onSeek={onSeek} />}
      <span className="pt-0.5 break-words text-ink-2">{t ? text.replace(/^\s*\d{1,2}:\d{2}(\s*[-–]\s*\d{1,2}:\d{2})?\s*/, '') : text}</span>
    </li>
  )
}

/** Per platform and rule: severity, outcome, evidence (seekable), source; then claims vs listing. */
export function TabPolicy({ result, anchor, onSeek }) {
  const targets = policyTargetsView(result.policy?.targets)
  const anchored = new Set()
  const claims = result.claims_verdicts ?? []

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Rule engine baseline {result.policy?.baseline_version ?? ''}: mỗi nền tảng chỉ có “Cần xem lại” hoặc “Chưa đủ dữ liệu”, không bao giờ là “đạt”. Nguồn là trang chính sách của nền tảng.
      </p>
      {targets.map((t) => (
        <section key={t.platform} className="space-y-2">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {t.label}
            <Tag tone={t.verdict === 'needs_review' ? 'critical' : 'muted'}>{t.verdictLabel}</Tag>
            <span className="text-xs font-normal text-muted-foreground">điểm policy {t.score ?? '–'} · {t.findings.length} rule</span>
          </h3>
          <div className="space-y-2">
            {t.findings.map((f) => {
              const id = anchored.has(f.rule_id) ? undefined : `rule-${f.rule_id}`
              anchored.add(f.rule_id)
              return (
                <article
                  key={f.rule_id}
                  id={id}
                  className={cn('scroll-mt-24 space-y-1.5 rounded-xl bg-surface p-3 shadow-sheet', anchor === `rule-${f.rule_id}` && id && 'ring-2 ring-brand')}
                >
                  <header className="flex flex-wrap items-center gap-2">
                    <span className={cn('size-2 rounded-full', SEV_BG[f.severity])} />
                    <span className="font-mono text-sm font-semibold">{f.rule_id}</span>
                    <Tag tone="muted">{SEVERITY_LABELS[f.severity] ?? f.severity}</Tag>
                    <Tag tone={OUTCOME_TONE[f.outcome] ?? 'muted'}>{OUTCOME_LABELS[f.outcome] ?? f.outcome}</Tag>
                    {f.source_url && (
                      <a href={f.source_url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-info hover:underline">
                        Nguồn chính sách <ExternalLink className="size-3" />
                      </a>
                    )}
                  </header>
                  <p className="text-sm">{f.summary}</p>
                  {f.evidence?.length > 0 && (
                    <ul className="space-y-1">
                      {f.evidence.map((e, i) => (
                        <Evidence key={i} text={e} onSeek={onSeek} />
                      ))}
                    </ul>
                  )}
                  <div className="text-[11px] text-muted-foreground">
                    {f.inputs?.length ? <>đầu vào: <span className="font-mono">{f.inputs.join(', ')}</span> · </> : null}
                    {f.verification_status}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ))}
      {!targets.length && <p className="text-sm text-muted-foreground">Lần chạy này không có kết quả policy.</p>}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Claim trong video so với listing ({claims.length})</h3>
        {claims.length ? (
          <ul className="divide-y divide-line rounded-xl bg-surface shadow-sheet">
            {claims.map((c, i) => (
              <li key={i} className="flex flex-wrap items-start gap-2 p-3 text-xs">
                <Tag tone={CLAIM_TONE[c.verdict] ?? 'muted'}>{c.verdict}</Tag>
                <span className="min-w-0 flex-1">{c.claim}</span>
                {c.listing_evidence && <span className="w-full text-muted-foreground">Listing: {c.listing_evidence}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Không có claim nào được đối chiếu (bước claims không chạy hoặc không có claim).</p>
        )}
      </section>
    </div>
  )
}
