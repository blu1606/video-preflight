// Turns a backend analysis `result` (or the partial outputs of a run still streaming) into what the result
// page renders. Pure functions only: every number here is read from the backend payload, never invented.

import { overallView } from './overall-view.js'
import {
  DOMAIN_GROUP,
  dimensionLabel,
  GROUP_HINTS,
  GROUP_LANE,
  groupLabel,
  platformLabel,
  policyVerdictLabel,
} from './labels.js'
import { severityRank, sortBySeverity } from './timeline.js'

const POLICY_SEVERITY = { critical: 'high', high: 'high', medium: 'medium', low: 'low' }
// Groups shown on the result page, in order. Only the first three count toward the overall score (backend).
const VIDEO_GROUPS = ['viral_potential', 'conversion_potential', 'sku_market', 'policy_compliance', 'post_publish_performance']

export function indexQuestions(decisions) {
  return Object.fromEntries((decisions?.questions ?? []).map((q) => [q.id, q]))
}

/** Most likely level of a Decisions `score` answer, with its rubric description. */
export function topLevel(question) {
  const probs = question?.answer?.probabilities
  if (!probs?.length) return null
  const best = probs.reduce((a, b) => (b.probability > a.probability ? b : a))
  const level = question.levels?.find((l) => l.label === best.label)
  return { label: best.label, probability: best.probability, description: level?.description ?? null }
}

const questionOf = (criterion, questions) => {
  const input = (criterion.inputs ?? []).find((n) => typeof n === 'string' && n.startsWith('decision.'))
  return input ? (questions[input.slice(9)] ?? null) : null
}

export function criterionView(c, questions = {}) {
  const q = questionOf(c, questions)
  const top = topLevel(q)
  return {
    id: c.id,
    name: dimensionLabel(q?.dimension, c.name),
    rawName: c.name,
    weight: c.weight,
    score: c.score ?? null,
    notScoredReason: c.score == null ? c.reason || 'Thiếu dữ liệu đầu vào' : null,
    mockDependency: !!c.mock_dependency,
    inputs: c.inputs ?? [],
    questionId: q?.id ?? null,
    confidence: q?.answer?.confidence ?? null,
    topLevel: top,
  }
}

export function groupView(g, questions = {}) {
  return {
    name: g.name,
    label: groupLabel(g.name),
    hint: GROUP_HINTS[g.name] ?? '',
    score: g.score ?? null,
    coverage: g.coverage ?? 0,
    mockDependency: !!g.mock_dependency,
    lane: GROUP_LANE[g.name] ?? null,
    criteria: (g.criteria ?? []).map((c) => criterionView(c, questions)),
    notScored: g.not_scored ?? null,
  }
}

/** score_rubric step output {group: {score, coverage, mock_dependency, scored, not_scored}} -> groups. */
export function groupsFromStepOutput(output) {
  return Object.entries(output ?? {})
    .filter(([, v]) => v && typeof v === 'object' && 'score' in v)
    .map(([name, v]) => ({ name, score: v.score, coverage: v.coverage, mock_dependency: v.mock_dependency, not_scored: v.not_scored }))
}

/**
 * Provisional group scores from Decisions answers alone (before score_rubric): weighted mean of the answered
 * `score` questions per domain. Quantitative criteria (V7, C8, S2, S8) are not known yet, hence "tạm tính".
 */
export function provisionalGroups(decisions, policyScore) {
  const acc = {}
  for (const q of decisions?.questions ?? []) {
    const group = DOMAIN_GROUP[q.domain]
    if (!group || q.type !== 'score' || q.value == null || q.weight == null) continue
    acc[group] = acc[group] ?? { sum: 0, w: 0, total: 0 }
    acc[group].sum += q.weight * q.value
    acc[group].w += q.weight
  }
  for (const q of decisions?.questions ?? []) {
    const group = DOMAIN_GROUP[q.domain]
    if (group && q.type === 'score' && q.weight != null && acc[group]) acc[group].total += q.weight
  }
  const groups = Object.entries(acc).map(([name, a]) => ({
    name,
    score: Math.round((a.sum / a.w) * 10) / 10,
    coverage: a.total ? Math.round((a.w / a.total) * 100) / 100 : 0,
    mock_dependency: (decisions.questions ?? []).some((q) => DOMAIN_GROUP[q.domain] === name && q.mock_dependency),
  }))
  if (policyScore != null) groups.push({ name: 'policy_compliance', score: policyScore, coverage: 1, mock_dependency: false })
  return groups
}

export function policyTargetsView(targets) {
  return Object.entries(targets ?? {}).map(([platform, t]) => {
    const findings = t?.findings ?? []
    return {
      platform,
      label: platformLabel(platform),
      verdict: t?.verdict ?? 'unknown',
      verdictLabel: policyVerdictLabel(t?.verdict),
      score: t?.score ?? null,
      hits: findings.filter((f) => f.outcome === 'needs_review').sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
      unknown: findings.filter((f) => f.outcome === 'unknown'),
      findings,
    }
  })
}

const markerRef = (m) => String(m?.source?.ref ?? '').replace(/^decision\./, '')

/** Up to 3 things to fix: the most severe policy hit first, then the weakest video criteria. */
export function buildFixes(result, markers = [], limit = 3) {
  const questions = indexQuestions(result?.decisions)
  const allCriteria = Object.fromEntries((result?.scores ?? []).flatMap((g) => (g.criteria ?? []).map((c) => [c.id, { ...c, group: g.name }])))
  const markerIdsFor = (ref) => markers.filter((m) => markerRef(m) === ref && m.lane !== 'structure').map((m) => m.id)
  const timesFor = (ref) => [...new Set(markers.filter((m) => markerRef(m) === ref && m.lane !== 'structure').map((m) => m.t_start))].sort((a, b) => a - b)

  const policy = []
  for (const t of policyTargetsView(result?.policy?.targets)) {
    for (const f of t.hits) {
      const existing = policy.find((p) => p.ref === f.rule_id)
      if (existing) {
        existing.platforms.push(t.label)
        continue
      }
      policy.push({
        key: `policy:${f.rule_id}`,
        kind: 'policy',
        ref: f.rule_id,
        title: `Policy ${f.rule_id}`,
        reason: f.summary,
        severity: POLICY_SEVERITY[f.severity] ?? 'medium',
        platforms: [t.label],
        markerIds: markerIdsFor(f.rule_id),
        times: timesFor(f.rule_id),
      })
    }
  }
  policy.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.markerIds.length - a.markerIds.length)

  const criteria = (result?.verdict?.weakest ?? [])
    .filter((w) => w.group !== 'shop_health' && !(policy.length && w.group === 'policy_compliance'))
    .map((w) => {
      const c = criterionView(allCriteria[w.id] ?? { id: w.id, name: w.name, score: w.score, inputs: w.inputs }, questions)
      return {
        key: `criterion:${w.id}`,
        kind: 'criterion',
        ref: w.id,
        group: w.group,
        title: `${c.name} (${w.id})`,
        reason: c.topLevel ? `${c.topLevel.label}: ${c.topLevel.description ?? ''}` : (c.notScoredReason ?? ''),
        score: w.score ?? null,
        severity: w.score != null && w.score < 40 ? 'high' : 'medium',
        markerIds: markerIdsFor(w.id),
        times: timesFor(w.id),
      }
    })

  const out = [...policy.slice(0, 1), ...criteria, ...policy.slice(1)]
  return out.slice(0, limit)
}

/**
 * The AI gateway's plain-language summary (result.insights, written by step summarize_insights), with its
 * fixes shaped like buildFixes rows so the same list renders them. Null when the step was off or failed.
 */
export function insightView(result, markers = []) {
  const ins = result?.insights
  if (!ins || typeof ins !== 'object') return null
  const scores = Object.fromEntries((result.scores ?? []).flatMap((g) => (g.criteria ?? []).map((c) => [c.id, c.score])))
  const policyRules = new Set(policyTargetsView(result.policy?.targets).flatMap((t) => t.hits.map((f) => f.rule_id)))
  const fixes = (ins.fixes ?? []).map((f, i) => {
    const refs = f.refs ?? []
    const lit = markers.filter((m) => m.lane !== 'structure' && (refs.includes(markerRef(m)) || (f.t != null && m.t_start === f.t)))
    const urgent = refs.some((r) => policyRules.has(r) || (scores[r] != null && scores[r] < 40))
    return {
      key: `ai:${i}`,
      kind: 'ai',
      ref: refs[0] ?? null,
      refs,
      title: f.text,
      reason: f.why,
      severity: urgent ? 'high' : 'medium',
      markerIds: lit.map((m) => m.id),
      times: f.t != null ? [f.t] : [],
    }
  })
  return {
    headline: ins.headline ?? null,
    summary: ins.summary ?? null,
    insights: ins.insights ?? [],
    groups: ins.groups ?? {},
    policy: ins.policy ?? null,
    shop: ins.shop ?? null,
    fixes,
    model: ins.model ?? null,
    source: ins.source ?? null,
  }
}

/** Everything the result page shows. `result` wins; otherwise the partial outputs of a streaming run. */
export function buildViewModel(result, partial = null) {
  let stage = 'empty'
  let rawGroups = []
  let decisions = null
  let policyTargets = null

  if (result) {
    stage = 'final'
    rawGroups = result.scores ?? []
    decisions = result.decisions ?? null
    policyTargets = result.policy?.targets ?? null
  } else if (partial) {
    decisions = partial.decisions ?? null
    policyTargets = partial.policy?.targets ?? null
    if (partial.scores) {
      stage = 'final'
      rawGroups = groupsFromStepOutput(partial.scores)
    } else if (decisions || partial.policy) {
      stage = 'provisional'
      rawGroups = provisionalGroups(decisions, partial.policy?.['policy.score']?.value ?? null)
    }
  }

  const questions = indexQuestions(decisions)
  const groups = rawGroups.map((g) => groupView(g, questions))
  const byName = Object.fromEntries(groups.map((g) => [g.name, g]))
  const videoGroups = VIDEO_GROUPS.map((n) => byName[n]).filter(Boolean)
  const markers = Array.isArray(result?.markers) ? result.markers : []
  // Group scores stream in; the overall score is shown once the run is finished (backend result.overall).
  const overall = result ? overallView(result.overall) : null
  const insights = insightView(result, markers)

  return {
    stage,
    overall,
    videoGroups,
    shopHealth: byName.shop_health ?? null,
    policy: policyTargetsView(policyTargets),
    decisions,
    insights,
    fixes: insights?.fixes.length ? insights.fixes : result ? buildFixes(result, markers) : [],
    markers,
    hasMarkers: Array.isArray(result?.markers),
    issueMarkers: sortBySeverity(markers.filter((m) => m.kind === 'issue' || m.kind === 'ghost')),
    rubric: result?.rubric ?? null,
    qualityGate: result?.quality_gate ?? null,
    absoluteClaims: result?.features?.['video.policy_absolute_claims']?.value ?? [],
  }
}

/**
 * Where "Vì sao?" opens the report: a policy rule -> Policy tab at the rule; a criterion answered by a
 * Decisions question -> Questions tab at that question; any other criterion -> Scoring tab at its row;
 * a feature-based marker (ghost, beat) -> what the AI saw.
 * `item` is a marker ({source}), a fix ({kind, ref}) or a criterion view ({id, questionId}).
 */
export function reportTarget(item, result) {
  if (item?.refs?.length) return refTarget(item.refs[0], result)
  const type = item?.source?.type ?? item?.kind ?? (item?.id ? 'criterion' : null)
  const ref = String(item?.source?.ref ?? item?.ref ?? item?.questionId ?? item?.id ?? '').replace(/^decision\./, '')
  if (type === 'policy') return { tab: 'policy', anchor: `rule-${ref}` }
  if (type === 'criterion') {
    const questions = indexQuestions(result?.decisions)
    if (questions[ref]) return { tab: 'decisions', anchor: `q-${ref}` }
    return { tab: 'scoring', anchor: `crit-${item?.id && !item.source ? item.id : ref}` }
  }
  return { tab: 'ai-saw', anchor: null }
}

/** Where an id cited by the AI summary opens the report: rule, score group, diagnosis or criterion. */
export function refTarget(ref, result) {
  const rules = new Set(Object.values(result?.policy?.targets ?? {}).flatMap((t) => (t?.findings ?? []).map((f) => f.rule_id)))
  if (rules.has(ref)) return { tab: 'policy', anchor: `rule-${ref}` }
  if ((result?.scores ?? []).some((g) => g.name === ref)) return { tab: 'scoring', anchor: `group-${ref}` }
  if (ref === 'diagnosis') return { tab: 'scoring', anchor: null }
  return reportTarget({ kind: 'criterion', ref }, result)
}
