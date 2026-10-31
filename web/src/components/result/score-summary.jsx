import { AlertTriangle } from 'lucide-react'

import { ApprovePublish } from '@/components/result/approve-publish'
import { SkeletonBlock, StatusDot } from '@/components/score-visuals'
import { groupLabel } from '@/lib/labels'
import { fmtScore } from '@/lib/score-style'
import { cn } from '@/lib/utils'

const NUM_TONE = { pass: 'text-pass', amber: 'text-amber-ink', critical: 'text-critical', muted: 'text-faint' }

/**
 * Overall video score (§5): big number, status label, coverage and the formula the backend returned. The overall score is
 * only shown once the run is finished; while it streams the group scores below fill in. The label follows
 * the score; policy is asked about when the seller presses "Duyệt đăng".
 */
export function ScoreSummary({ vm, running, video, analysisId, onApproved }) {
  const o = vm.overall
  if (!o) {
    return running ? (
      <div className="space-y-2 rounded-2xl bg-surface p-4 shadow-sheet">
        <SkeletonBlock className="h-4 w-32" />
        <SkeletonBlock className="h-12 w-28" />
        <p className="text-xs text-muted-foreground">Điểm tổng hiện khi chạy xong. Điểm từng nhóm hiện dần ở bên dưới.</p>
      </div>
    ) : null
  }
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-raise">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold text-ink">Điểm video</span>
        {vm.rubric && <span>· rubric {vm.rubric}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-0.5">
          <span className={cn('text-5xl leading-none font-bold tabular-nums', NUM_TONE[o.tone] ?? 'text-ink')}>{fmtScore(o.overall)}</span>
          <span className="text-base text-muted-foreground">/100</span>
        </div>
        <div className="space-y-1 pb-1">
          <StatusDot tone={o.tone} className="text-sm font-semibold">
            {o.label}
          </StatusDot>
          <div className="text-xs text-muted-foreground">
            coverage {Math.round(o.coverage * 100)}% · {o.scoredGroups.length}/{Object.keys(o.weights).length} nhóm có điểm
          </div>
        </div>
        {video && o.overall != null && (
          <ApprovePublish className="mb-1 ml-auto" video={video} analysisId={analysisId} overall={o} policy={vm.policy} markers={vm.markers} onApproved={onApproved} />
        )}
      </div>
      {o.reason && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-tint px-2 py-1.5 text-xs text-amber-ink">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {o.reason}
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Điểm tổng = trung bình có trọng số của các nhóm có điểm ({Object.entries(o.weights).map(([g, w]) => `${groupLabel(g)} ${w}`).join(', ')}).
        Chính sách là cổng riêng, không cộng vào điểm. Hiệu suất thực (sau khi đăng) hiện riêng, không tính vào điểm tổng.
        Tình hình shop không tính vào: đó là bối cảnh của shop, dùng để chẩn đoán lỗi nằm ở video hay ở shop.
      </p>
    </div>
  )
}
