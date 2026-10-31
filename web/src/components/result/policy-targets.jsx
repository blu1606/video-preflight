import { ShieldAlert, ShieldQuestion } from 'lucide-react'

import { Sheet, Tag } from '@/components/score-visuals'
import { POLICY_ENGINE_NOTE, SEVERITY_LABELS } from '@/lib/labels'

/**
 * Policy per selected platform: verdict chip ("Cần xem lại", "Không phát hiện vi phạm" or "Chưa đủ dữ liệu",
 * never "passed") and the rules hit. Appears as soon as check_policy finishes.
 */
export function PolicyTargets({ targets, onOpenRule }) {
  if (!targets.length) return null
  return (
    <Sheet title="Policy theo nền tảng" aside={<span className="text-xs text-muted-foreground">{POLICY_ENGINE_NOTE}</span>} bodyClassName="space-y-3">
      {targets.map((t) => (
        <div key={t.platform} className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {t.verdict === 'needs_review' ? <ShieldAlert className="size-4 text-critical" /> : <ShieldQuestion className="size-4 text-faint" />}
            <span className="text-sm font-semibold">{t.label}</span>
            <Tag tone={t.verdict === 'needs_review' ? 'critical' : 'muted'}>{t.verdictLabel}</Tag>
            {t.unknown.length > 0 && <span className="text-[11px] text-muted-foreground">{t.unknown.length} rule thiếu dữ liệu</span>}
          </div>
          {t.hits.length > 0 && (
            <ul className="space-y-1 pl-6">
              {t.hits.map((f) => (
                <li key={f.rule_id}>
                  <button type="button" onClick={() => onOpenRule(f.rule_id)} className="text-left text-xs hover:underline">
                    <span className="font-mono font-semibold">{f.rule_id}</span>{' '}
                    <span className="text-muted-foreground">({SEVERITY_LABELS[f.severity] ?? f.severity})</span> {f.summary}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </Sheet>
  )
}
