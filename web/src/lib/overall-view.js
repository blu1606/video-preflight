/**
 * The overall video score as the backend returns it (result.overall from core/overall.py). The UI maps it to
 * labels and tones and shows the weights it was given; it never recomputes the number. A saved run without an
 * overall (made before the score existed) has none and shows no score.
 */

export const STATUS = {
  ready: { label: 'Sẵn sàng đăng', tone: 'pass' },
  fix: { label: 'Sửa rồi đăng', tone: 'amber' },
  rework: { label: 'Làm lại', tone: 'critical' },
  policy_review: { label: 'Cần xem lại policy', tone: 'critical' },
  none: { label: 'Chưa chấm được', tone: 'muted' },
}

/** result.overall -> the fields the result pages read; null when the run carries no overall. */
export function overallView(backend) {
  if (!backend) return null
  const status = backend.label ?? 'none'
  return {
    overall: backend.score ?? null,
    coverage: backend.coverage ?? 0,
    scoredGroups: backend.groups_used ?? [],
    missingGroups: backend.missing_groups ?? [],
    weights: backend.weights ?? {},
    thresholds: backend.thresholds ?? {},
    reason: (backend.warnings ?? []).join(' ') || null,
    policyReview: backend.policy_gate?.status === 'review',
    status,
    ...STATUS[status],
  }
}
