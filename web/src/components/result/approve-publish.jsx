import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react'
import { useState } from 'react'

import { ErrorAlert } from '@/components/common'
import { Tag } from '@/components/score-visuals'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { dbPatch } from '@/lib/api'
import { POLICY_ENGINE_NOTE } from '@/lib/labels'
import { fmtTime } from '@/lib/timeline'
import { cn } from '@/lib/utils'

/** Policy hits across platforms, one row per rule, with the moments the timeline marks for it. */
function policyHits(policy, markers) {
  const rows = new Map()
  for (const t of policy) {
    for (const f of t.hits) {
      const row = rows.get(f.rule_id) ?? { ...f, platforms: [], times: [] }
      row.platforms.push(t.label)
      rows.set(f.rule_id, row)
    }
  }
  for (const row of rows.values()) {
    row.times = [...new Set(markers.filter((m) => m.source?.ref === row.rule_id).map((m) => m.t_start))].sort((a, b) => a - b)
  }
  return [...rows.values()]
}

/**
 * "Duyệt đăng": the seller's own go-ahead, saved on the video as `publish_review` (nothing is posted to a
 * platform). Policy hits from the baseline rule engine are listed and must be acknowledged first.
 */
export function ApprovePublish({ video, analysisId, overall, policy, markers, onApproved, className }) {
  const [open, setOpen] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const hits = policyHits(policy, markers)
  const review = video.publish_review
  const approved = review?.status === 'approved'

  const confirm = async () => {
    setSaving(true)
    setError(null)
    try {
      await dbPatch(`/videos/${encodeURIComponent(video.id)}`, {
        publish_review: {
          status: 'approved',
          approved_at: new Date().toISOString(),
          analysis_id: analysisId ?? null,
          overall: overall.overall,
          label: overall.label,
          policy_acknowledged: hits.map((h) => h.rule_id),
        },
      })
      setOpen(false)
      onApproved?.()
    } catch (e) {
      setError(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cn('flex flex-col items-end gap-1', className)}>
      <Button
        variant={approved ? 'outline' : 'default'}
        onClick={() => {
          setAcknowledged(false)
          setError(null)
          setOpen(true)
        }}
      >
        <CheckCircle2 /> {approved ? 'Duyệt lại' : 'Duyệt đăng'}
      </Button>
      {approved && (
        <span className="text-[11px] text-muted-foreground">
          Đã duyệt {new Date(review.approved_at).toLocaleString('vi-VN')} · run #{review.analysis_id ?? '–'}
        </span>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(560px,calc(100vw-32px))] gap-3 p-5">
          <DialogTitle>Duyệt đăng video này?</DialogTitle>
          <DialogDescription className="text-sm text-ink-2">
            Điểm {overall.overall}/100 · {overall.label}. Duyệt chỉ ghi lại quyết định của bạn, app không tự đăng lên sàn.
          </DialogDescription>
          {hits.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-critical/30 bg-critical/5 p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-critical">
                <ShieldAlert className="size-4" /> {hits.length} rule policy cần xem lại
              </div>
              <ul className="max-h-60 space-y-1.5 overflow-y-auto text-xs">
                {hits.map((h) => (
                  <li key={h.rule_id}>
                    <span className="font-mono font-semibold">{h.rule_id}</span> {h.summary}{' '}
                    <span className="text-muted-foreground">· {h.platforms.join(', ')}</span>
                    {h.times.length > 0 && <span className="text-muted-foreground"> · tại {h.times.map(fmtTime).join(', ')}</span>}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">{POLICY_ENGINE_NOTE}.</p>
              <label className="flex cursor-pointer items-start gap-2 text-xs font-medium">
                <input type="checkbox" className="mt-0.5 accent-[var(--mk-accent)]" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                Tôi đã xem các cảnh báo trên và vẫn muốn duyệt đăng
              </label>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              <Tag tone="muted">Policy</Tag> Rule engine không phát hiện vi phạm trên các nền tảng đã chọn. {POLICY_ENGINE_NOTE}.
            </p>
          )}
          {error && <ErrorAlert error={error} />}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button onClick={confirm} disabled={saving || (hits.length > 0 && !acknowledged)}>
              {saving && <Loader2 className="animate-spin" />} Xác nhận duyệt đăng
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
