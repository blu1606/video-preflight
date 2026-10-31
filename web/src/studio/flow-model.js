// Pure helpers for the Decisions dialog and the agent flow diagram. Everything is read from the backend
// result or trace as-is; nothing here scores, guesses or invents a value.

import { markerTitle, sourceLabel } from '../lib/labels.js'
import { parseTimestamp } from '../lib/timeline.js'

/* ---------- Decisions map ---------- */

// One row per question family: evidence chips -> question tiles -> group score.
export const DECISION_ROWS = [
  { id: 'viral', title: 'Viral', group: 'viral_potential' },
  { id: 'conversion', title: 'Conversion', group: 'conversion_potential' },
  { id: 'sku', title: 'SKU & listing', group: 'sku_market' },
  { id: 'shop', title: 'Shop health', group: 'shop_health' },
  { id: 'policy', title: 'Policy (predicate)', group: 'policy_compliance' },
  { id: 'meta', title: 'Meta (choice, điều phối)', group: null },
]

const DOMAIN_ROW = { viral: 'viral', conversion: 'conversion', sku: 'sku', shop: 'shop' }

/** Row of a question: score questions by their rubric group, policy by domain, everything else is meta. */
export function rowOf(q) {
  if (q?.type === 'score') {
    const byGroup = DECISION_ROWS.find((r) => r.group && r.group === q.group)
    if (byGroup) return byGroup.id
    if (DOMAIN_ROW[q.domain]) return DOMAIN_ROW[q.domain]
  }
  return q?.domain === 'policy' ? 'policy' : 'meta'
}

/** Schema features a question uses: what was sent plus what the bank asks for. */
export const questionFeatureNames = (q) => [...new Set([...(q?.inputs ?? []), ...(q?.required_features ?? [])])]

/** Data status of one schema feature; image inputs count as real. */
export function chipStatus(name, features) {
  if (String(name).startsWith('keyframes:')) return 'REAL'
  return features?.[name]?.status ?? 'MISSING'
}

/** The map rows of a result, empty rows dropped. */
export function decisionRows(result) {
  const questions = result?.decisions?.questions ?? []
  const features = result?.features ?? {}
  const scores = Object.fromEntries((result?.scores ?? []).map((g) => [g.name, g]))
  return DECISION_ROWS.map((row) => {
    const qs = questions.filter((q) => rowOf(q) === row.id)
    const names = [...new Set(qs.flatMap(questionFeatureNames))]
    const g = row.group ? scores[row.group] : null
    return {
      ...row,
      questions: qs,
      chips: names.map((name) => ({ name, status: chipStatus(name, features) })),
      score: g ? { score: g.score ?? null, coverage: g.coverage ?? null } : null,
    }
  }).filter((r) => r.questions.length)
}

export const isAnswered = (q) => q?.status !== 'MISSING' && q?.value != null

/** Score questions feed the radar and the score; predicate (policy) and choice questions only classify. */
const isScoreQuestion = (q) => q?.type == null || q.type === 'score'

/**
 * Question counts split the same way everywhere: the score questions the radar and left list count, then the
 * policy / classification questions the same batch also answered. {score, scoreAnswered, other, otherAnswered}.
 */
export function questionCounts(questions) {
  const qs = questions ?? []
  const score = qs.filter(isScoreQuestion)
  const other = qs.filter((q) => !isScoreQuestion(q))
  return {
    score: score.length,
    scoreAnswered: score.filter(isAnswered).length,
    other: other.length,
    otherAnswered: other.filter(isAnswered).length,
  }
}

/** "28/28 câu chấm điểm có trả lời · +8 câu policy/phân loại (7 có trả lời)". */
export function questionCountLabel(questions) {
  const c = questionCounts(questions)
  const head = `${c.scoreAnswered}/${c.score} câu chấm điểm có trả lời`
  if (!c.other) return head
  return `${head} · +${c.other} câu policy/phân loại${c.otherAnswered < c.other ? ` (${c.otherAnswered} có trả lời)` : ''}`
}

/** What a tile shows: score 0-100, predicate probability, choice label, or a dash. */
export function answerText(q) {
  if (!isAnswered(q)) return '–'
  if (q.type === 'score') return String(Math.round(q.value))
  if (q.type === 'predicate' && typeof q.value === 'number') return `${Math.round(q.value * 100)}%`
  return String(q.value)
}

/** Tile tone: missing (dashed) | bad (score < 50) | ok | neutral (choice / predicate). */
export function answerTone(q, pass = 50) {
  if (!isAnswered(q)) return 'missing'
  if (q.type !== 'score') return 'neutral'
  return q.value >= pass ? 'ok' : 'bad'
}

export const crossCheckById = (result) => Object.fromEntries((result?.cross_check ?? []).map((c) => [c.id, c]))

/** Header facts of the single batched Decisions call. */
export function decisionsCall(result) {
  const call = result?.decisions?.calls?.[0]
  if (!call) return null
  return {
    model: call.model ?? null,
    inputTokens: call.usage?.input_tokens ?? null,
    cachedTokens: call.usage?.input_tokens_details?.cached_tokens ?? null,
    questionCount: call.questions?.length ?? null,
  }
}

/** Short printable value; the full text stays in `full` for a title attribute. */
export function showValue(v, max = 160) {
  if (v === null || v === undefined) return { text: 'null', full: 'null' }
  const full = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return { text: full.length > max ? `${full.slice(0, max - 1)}…` : full, full }
}

/* ---------- Keyframes and the 1-fps frames ---------- */

export const KEYFRAME_SEGMENTS = [
  { id: 'hook', label: 'Hook' },
  { id: 'demo', label: 'Demo' },
  { id: 'cta', label: 'CTA' },
]

export const frameList = (frames) => (Array.isArray(frames) ? frames : frames?.frames ?? [])

const nearest = (list, sec) =>
  list.length ? list.reduce((a, b) => (Math.abs(b.sec - sec) < Math.abs(a.sec - sec) ? b : a)) : null

/**
 * Keyframes sent to the AI with this question.
 * state: recorded (result.decisions.keyframes) | fallback (only keyframes_used secs, matched on the 1-fps frames) | none.
 * Groups follow hook / demo / cta; keyframes without a segment land in "other".
 */
export function questionKeyframes(q, result, frames) {
  const recorded = result?.decisions?.keyframes
  const used = q?.keyframes_used ?? null
  let items = []
  let state = 'none'
  if (Array.isArray(recorded) && recorded.length) {
    const usedSet = used ? new Set(used.map(Number)) : null
    items = usedSet ? recorded.filter((k) => [...usedSet].some((s) => Math.abs(s - k.sec) < 0.51)) : recorded
    if (usedSet && !items.length) items = recorded
    state = 'recorded'
  } else if (used?.length) {
    const fl = frameList(frames)
    items = used.map((sec) => {
      const f = nearest(fl, sec)
      return f ? { sec, url: f.url, segment: null } : null
    }).filter(Boolean)
    state = items.length ? 'fallback' : 'none'
  }
  const sorted = [...items].sort((a, b) => a.sec - b.sec)
  const groups = [...KEYFRAME_SEGMENTS, { id: 'other', label: 'Khác' }]
    .map((s) => ({ ...s, items: sorted.filter((k) => (KEYFRAME_SEGMENTS.some((x) => x.id === k.segment) ? k.segment : 'other') === s.id) }))
    .filter((g) => g.items.length)
  return { state, items: sorted, groups, scope: result?.decisions?.keyframes_scope ?? null }
}

/**
 * Seconds of the 1-fps grid that something points at: feature evidence, timeline markers, Decisions keyframes.
 * Returns Map<roundedSec, string[]> of short labels.
 */
export function frameMarks(result, frames) {
  const marks = new Map()
  const fl = frameList(frames)
  const add = (sec, label) => {
    if (sec == null || Number.isNaN(Number(sec))) return
    const f = nearest(fl, Number(sec))
    const key = f ? Math.round(f.sec) : Math.round(Number(sec))
    const list = marks.get(key) ?? []
    if (!list.includes(label)) list.push(label)
    marks.set(key, list)
  }
  for (const [name, f] of Object.entries(result?.features ?? {})) {
    for (const e of f?.evidence ?? []) {
      const t = parseTimestamp(e)
      if (t) add(t.start, name)
    }
  }
  for (const m of result?.markers ?? []) {
    if (m.kind === 'cut' || m.kind === 'beat') continue
    add(m.t_start, markerTitle(m) ?? m.id)
  }
  for (const k of result?.decisions?.keyframes ?? []) add(k.sec, `Keyframe gửi Decisions${k.segment ? ` (${k.segment})` : ''}`)
  return marks
}

/** Decisions keyframe secs placed on the 1-fps grid (nearest frame). */
export function keyframeSecs(result, frames) {
  const fl = frameList(frames)
  return new Set((result?.decisions?.keyframes ?? []).map((k) => {
    const f = nearest(fl, k.sec)
    return f ? Math.round(f.sec) : Math.round(k.sec)
  }))
}

export function transcriptSegments(result) {
  const v = result?.features?.['video.transcript_segments']?.value
  return Array.isArray(v) ? v.filter((s) => s && typeof s.text === 'string') : []
}

/* ---------- Agent flow ---------- */

const okSteps = (stage) => (stage?.steps ?? []).filter((s) => s.status === 'ok' || s.status === 'done')
const stepOut = (stage, name) => okSteps(stage).find((s) => s.name === name)?.output ?? null

/** Feature counts by status across step outputs ("37 REAL · 12 MOCK"). */
export function featureCounts(steps) {
  const counts = {}
  for (const s of steps) {
    const o = s.output
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object' && typeof v.status === 'string') counts[v.status] = (counts[v.status] ?? 0) + 1
    }
  }
  return counts
}

const ORDER = ['REAL', 'INFERRED', 'MOCK', 'MISSING']

/** What leaves a finished stage, read from its step outputs; null when nothing finished yet. */
export function stageHandoff(stage) {
  if (!okSteps(stage).length) return null
  switch (stage.id) {
    case 'request': {
      const v = stepOut(stage, 'get_video')
      const s = stepOut(stage, 'get_shop')
      return [v?.id, s?.shop_name].filter(Boolean).join(' · ') || null
    }
    case 'gather': {
      const counts = featureCounts(okSteps(stage))
      const keys = Object.keys(counts).sort((a, b) => (ORDER.indexOf(a) + 1 || 9) - (ORDER.indexOf(b) + 1 || 9))
      const total = keys.reduce((a, k) => a + counts[k], 0)
      return total ? `${total} features: ${keys.map((k) => `${counts[k]} ${sourceLabel(k)}`).join(' · ')}` : null
    }
    case 'checks': {
      const parts = []
      const p = stepOut(stage, 'check_policy')
      if (p) {
        const n = Object.values(p.targets ?? {}).flatMap((t) => t?.findings ?? []).filter((f) => f.outcome === 'needs_review')
        parts.push(`${new Set(n.map((f) => f.rule_id)).size} rule cần xem lại`)
      }
      const c = stepOut(stage, 'check_claims_vs_listing')?.['video.claims_sku_match']
      if (c?.value != null) parts.push(`claims khớp ${c.value}`)
      return parts.join(' · ') || null
    }
    case 'decisions': {
      const o = stepOut(stage, 'ask_decisions_api')
      if (!o) return null
      return questionCountLabel(o.questions)
    }
    case 'crosscheck': {
      const o = stepOut(stage, 'cross_check_low_answers')
      if (!o) return null
      const rows = Object.values(o)
      const conflicts = rows.filter((r) => r?.verdict === 'conflict').length
      return rows.length ? `${conflicts} mâu thuẫn / ${rows.length} câu thấp` : 'không có câu dưới ngưỡng'
    }
    case 'scoring': {
      const o = stepOut(stage, 'compose_overall')
      // rounded like the score in the right column
      if (o?.score != null) return `điểm ${Math.round(o.score)}${o.label_vi ? ` · ${o.label_vi}` : ''}`
      const r = stepOut(stage, 'score_rubric')
      return r ? `${Object.keys(r).length} nhóm có điểm` : null
    }
    case 'verdict': {
      const o = stepOut(stage, 'summarize_insights')
      return o?.kept ? `${o.kept.insights ?? 0} ý · ${o.kept.fixes ?? 0} việc cần làm` : null
    }
    default:
      return null
  }
}

/** Connector state between stage i and i+1: flowing (next runs) | done | idle. */
export function connectorState(stages, i) {
  const a = stages[i]
  const b = stages[i + 1]
  if (!a || !b) return 'idle'
  if (b.status === 'running') return 'flowing'
  if (a.status === 'done' && (b.status === 'done' || b.status === 'error')) return 'done'
  return 'idle'
}

/** Progress of a running step: determinate when done/total are numbers, else indeterminate. */
export function progressView(progress) {
  if (!progress) return null
  const { done, total } = progress
  const known = typeof done === 'number' && typeof total === 'number' && total > 0
  return {
    label: progress.label ?? progress.phase ?? '',
    detail: progress.detail ?? null,
    pct: known ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : null,
    count: known ? `${done}/${total}` : null,
  }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function normTokens(u) {
  if (!u || typeof u !== 'object') return null
  const input = num(u.input) ?? num(u.input_tokens) ?? num(u.prompt_tokens)
  const output = num(u.output) ?? num(u.output_tokens) ?? num(u.completion_tokens)
  const total = num(u.total) ?? num(u.total_tokens) ?? (input != null || output != null ? (input ?? 0) + (output ?? 0) : null)
  if (total == null) return null
  return {
    input,
    output,
    total,
    cached: num(u.cached) ?? num(u.input_tokens_details?.cached_tokens) ?? num(u.prompt_tokens_details?.cached_tokens),
    reasoning: num(u.reasoning) ?? num(u.output_tokens_details?.reasoning_tokens) ?? num(u.completion_tokens_details?.reasoning_tokens),
  }
}

/**
 * Tokens a step spent: the normalized `step.tokens` when the backend sends it, else the provider usage found in
 * its output (extraction / localize / insights, the Decisions call, the policy reviewer). null = no AI call.
 */
export function stepTokens(step) {
  const o = step?.output
  return (
    normTokens(step?.tokens) ??
    normTokens(o?.token_usage) ??
    normTokens(o?.calls?.[0]?.usage) ??
    normTokens(o?.reviewer?.token_usage) ??
    null
  )
}

/** Run totals for the root node: wall seconds (from step timings) and tokens across steps. */
export function runTotals(steps) {
  const list = steps ?? []
  const seconds = list.length ? Math.max(...list.map((s) => (s.started_ms ?? 0) + (s.duration_s ?? 0) * 1000)) / 1000 : 0
  const tokens = list.reduce((a, s) => a + (stepTokens(s)?.total ?? 0), 0)
  return { seconds, tokens }
}

/** Stage time: sum of its step durations, seconds. */
export const stageSeconds = (stage) => (stage?.steps ?? []).reduce((a, s) => a + (s.duration_s ?? 0), 0)
