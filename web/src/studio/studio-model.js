// What the studio screen draws, read from a backend analysis `result` (or the partial outputs of a run that
// is still streaming). Pure functions: every number comes from the backend payload, nothing is invented.

import { dimensionLabel, groupLabel } from '../lib/labels.js'
import { parseTimestamp } from '../lib/timeline.js'

// Radar tabs: the four rubric v2 groups the Decisions score questions feed (core/rubric.py V2_GROUPS).
// Shop health is shop context, not part of the video's overall score (core/overall.py), so it stays off the chart.
export const RADAR_GROUPS = [
  { group: 'viral_potential', prefix: 'V', label: 'Viral' },
  { group: 'conversion_potential', prefix: 'C', label: 'Conversion' },
  { group: 'sku_market', prefix: 'S', label: 'SKU' },
  { group: 'shop_health', prefix: 'H', label: 'Shop', overall: false },
]

export const groupOfQuestion = (id) => RADAR_GROUPS.find((g) => String(id ?? '').startsWith(g.prefix))?.group ?? null

/** Most likely level of a `score` answer with its rubric description and the full distribution. */
export function answerLevels(q) {
  const probs = q?.answer?.probabilities ?? []
  const levels = (q?.levels ?? []).map((l) => {
    const p = probs.find((x) => x.label === l.label)
    return { label: l.label, description: l.description, probability: p?.probability ?? null }
  })
  const best = probs.length ? probs.reduce((a, b) => (b.probability > a.probability ? b : a)) : null
  return { levels, best: best ? levels.find((l) => l.label === best.label) ?? null : null, confidence: q?.answer?.confidence ?? null }
}

/**
 * Radar axes of one group: its Decisions `score` questions in bank order. `value` is the backend's 0-100
 * score or null (not asked / not eligible / no answer yet); `revealed` limits a streaming reveal.
 */
export function radarAxes(questions, group, revealed = null) {
  return (questions ?? [])
    .filter((q) => q.type === 'score' && groupOfQuestion(q.id) === group)
    .map((q) => {
      const shown = revealed == null || revealed.has(q.id)
      return {
        id: q.id,
        label: dimensionLabel(q.dimension, q.id),
        value: shown && q.value != null ? q.value : null,
        status: shown ? q.status : 'pending',
        reason: q.reason ?? null,
        question: q,
      }
    })
}

export const AXES_PER_GROUP = 2

/**
 * The shared radar's axes: the AXES_PER_GROUP heaviest score questions of each group (bank weight, ties by
 * id), so every group the overall score uses is on one chart. Pure selection, no score is invented.
 */
export function keyQuestionIds(questions) {
  return RADAR_GROUPS.filter((g) => g.overall !== false).flatMap(({ group }) =>
    (questions ?? [])
      .filter((q) => q.type === 'score' && groupOfQuestion(q.id) === group)
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || a.id.localeCompare(b.id))
      .slice(0, AXES_PER_GROUP)
      .map((q) => q.id),
  )
}

/** Axes of the shared radar, in group order. */
export function keyAxes(questions, revealed = null) {
  const ids = new Set(keyQuestionIds(questions))
  return RADAR_GROUPS.flatMap(({ group }) => radarAxes(questions, group, revealed).filter((a) => ids.has(a.id)))
}

/**
 * Score while the batched answer is being revealed: each group = weighted mean of its revealed Decisions
 * answers (bank weights), overall = group weights over the groups that have one. An estimate only: the
 * final score also includes the measured criteria and comes from the backend when the run ends.
 */
export function provisionalOverall(questions, revealed, groupWeights) {
  if (!groupWeights) return null
  let num = 0
  let den = 0
  for (const { group } of RADAR_GROUPS) {
    const qs = (questions ?? []).filter((q) => q.type === 'score' && groupOfQuestion(q.id) === group && q.value != null && (!revealed || revealed.has(q.id)))
    const w = qs.reduce((a, q) => a + (q.weight ?? 1), 0)
    if (!w || groupWeights[group] == null) continue
    num += groupWeights[group] * (qs.reduce((a, q) => a + (q.weight ?? 1) * q.value, 0) / w)
    den += groupWeights[group]
  }
  return den ? Math.round((num / den) * 10) / 10 : null
}

/** Order in which a batched Decisions answer is revealed: group by group, then bank order. */
export function revealOrder(questions) {
  return RADAR_GROUPS.flatMap(({ group }) =>
    (questions ?? []).filter((q) => q.type === 'score' && groupOfQuestion(q.id) === group && q.value != null).map((q) => q.id),
  )
}

/** SVG geometry of a radar: `n` axes around (cx, cy), axis 0 straight up. */
export function radarPoint(i, n, ratio, { cx = 160, cy = 160, r = 102 } = {}) {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n
  return [Math.round((cx + Math.cos(a) * r * ratio) * 10) / 10, Math.round((cy + Math.sin(a) * r * ratio) * 10) / 10]
}

const featureOf = (result, name) => result?.features?.[name] ?? null

/** Seconds of every "MM:SS" evidence line, in order. */
const evidenceTimes = (lines) => (lines ?? []).map(parseTimestamp).filter(Boolean).map((t) => t.start)

// Features read off the opening seconds: 00:00 from them is a real moment. Elsewhere the VLM writes 0 when it
// has no time (a CTA it judged absent still comes back at 00:00), so 0 alone does not place a question.
const OPENING_INPUTS = new Set([
  'video.hook', 'video.hook_type', 'video.hook_verbal', 'video.opening_evidence', 'video.opening_signals',
  'video.product_first_clear_sec',
])

/**
 * When in the video a question's judgement sits: its timeline marker, else the evidence of its inputs.
 * null (whole video) when nothing places it, including a bare 00:00 on a question that is not about the opening.
 */
export function questionTime(q, result) {
  const inputs = [...(q.inputs ?? []), ...(q.required_features ?? [])]
  const marker = (result?.markers ?? []).find((m) => m.kind !== 'cut' && m.kind !== 'beat' && String(m.source?.ref ?? '') === q.id)
  const times = marker
    ? [marker.t_start, ...evidenceTimes(marker.evidence)]
    : inputs.flatMap((n) => evidenceTimes(featureOf(result, n)?.evidence))
  const opening = inputs.some((n) => OPENING_INPUTS.has(n))
  return times.find((t) => t != null && (t > 0 || opening)) ?? null
}

export const SEGMENTS = [
  { id: 'open', label: 'Mở đầu' },
  { id: 'body', label: 'Thân video' },
  { id: 'end', label: 'Kết và CTA' },
  { id: 'whole', label: 'Toàn video, caption, trang SKU' },
]
const OPEN_S = 3
const END_S = 5

export function segmentOf(t, duration) {
  if (t == null) return 'whole'
  if (t < OPEN_S) return 'open'
  if (duration && t >= duration - END_S) return 'end'
  return 'body'
}

export const PASS_SCORE = 50 // backend LOW_SCORE: a Decisions answer below it is a finding

/**
 * Left column after a run: every score question grouped by where it sits in the video.
 * state: ok (score >= 50) | bad | miss (no answer, with the backend's reason).
 */
export function questionSegments(result, duration) {
  const qs = (result?.decisions?.questions ?? []).filter((q) => q.type === 'score')
  const rows = qs.map((q) => {
    const t = questionTime(q, result)
    const state = q.value == null ? 'miss' : q.value >= PASS_SCORE ? 'ok' : 'bad'
    return { id: q.id, label: dimensionLabel(q.dimension, q.id), group: groupOfQuestion(q.id), groupLabel: groupLabel(groupOfQuestion(q.id)), t, state, value: q.value, reason: q.reason ?? null, question: q, segment: segmentOf(t, duration) }
  })
  return SEGMENTS.map((s) => {
    const items = rows.filter((r) => r.segment === s.id).sort((a, b) => (a.t ?? 1e9) - (b.t ?? 1e9) || a.id.localeCompare(b.id))
    return { ...s, items, issues: items.filter((r) => r.state === 'bad').length }
  }).filter((s) => s.items.length)
}

/**
 * Drill from a question to the schema features behind it: the features actually sent (q.inputs) and the
 * ones the bank asks for but the run did not have, each with what the AI or a source extracted.
 */
export function questionFeatures(q, result) {
  const sent = new Set(q?.inputs ?? [])
  const names = [...new Set([...(q?.inputs ?? []), ...(q?.required_features ?? [])])]
  return names.map((name) => {
    const f = featureOf(result, name)
    return {
      name,
      sent: sent.has(name),
      status: f?.status ?? 'MISSING',
      value: f?.value ?? null,
      source: f?.source ?? null,
      evidence: f?.evidence ?? [],
      times: (f?.evidence ?? []).map(parseTimestamp).filter(Boolean).map((t) => t.start),
    }
  })
}

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const parseMaybe = (v) => {
  if (typeof v !== 'string') return v
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

export const MARKET_CHANNELS = [
  { id: 'tiktok', label: 'TikTok Shop', test: (p) => /tiktok/i.test(p) },
  { id: 'shopee', label: 'Shopee', test: (p) => /shopee/i.test(p) },
  { id: 'web', label: 'Web (Google)', test: () => true },
]
const channelOf = (platform) => MARKET_CHANNELS.find((c) => c.test(String(platform ?? ''))).id

/**
 * The SKU against its crawled market (marketSnapshots): competitors per channel, how many like-for-like
 * listings are pricier than the SKU, and the TikTok Shop demand block from FastMoss. Read as crawled.
 */
export function skuMarketView(snapshot, ownPrice) {
  if (!snapshot) return null
  const rows = (snapshot.competitors ?? []).map((c) => ({
    channel: channelOf(c.platform),
    platform: c.platform,
    title: c.title,
    shop: c.shop,
    price: num(c.price_vnd),
    sold: num(c.sold_count),
    soldDisplay: c.sold_display ?? null,
    rating: num(c.rating),
    reviews: num(c.review_count),
    likeForLike: c.like_for_like === true || c.like_for_like === 'True',
    method: c.like_for_like_method ?? null,
    url: c.url ?? null,
  }))
  const comparable = rows.filter((r) => r.likeForLike && r.price != null)
  const prices = comparable.map((r) => r.price).sort((a, b) => a - b)
  const median = prices.length ? prices[Math.floor((prices.length - 1) / 2)] : null
  const pricier = ownPrice == null ? null : comparable.filter((r) => r.price > ownPrice).length
  const t = snapshot.tiktok ?? {}
  return {
    keyword: snapshot.keyword,
    crawledAt: snapshot.crawled_at,
    source: snapshot.source,
    notes: snapshot.notes,
    rows,
    comparable: comparable.length,
    median,
    pricierShare: pricier == null || !comparable.length ? null : pricier / comparable.length,
    priceRange: rows.some((r) => r.price != null)
      ? [Math.min(...rows.filter((r) => r.price != null).map((r) => r.price), ownPrice ?? Infinity), Math.max(...rows.filter((r) => r.price != null).map((r) => r.price), ownPrice ?? 0)]
      : null,
    tiktok: {
      keyword: parseMaybe(t.keyword),
      videoCount: num(t.video_count),
      units28d: num(t.units_28d),
      units7d: num(t.units_7d),
      momentum: num(t.momentum_7d_vs_28d),
      ownProduct: parseMaybe(t.own_product),
      source: parseMaybe(t.source),
    },
  }
}

/** Funnel and outcome numbers, with where they come from. */
export function metricsView(result) {
  const f = result?.revenue_funnel
  const b = result?.benchmark
  return {
    funnel: f && f.status !== 'not_scored'
      ? { views: f.views, clicks: f.product_clicks, orders: f.orders, aov: f.aov_vnd, gmv: f.expected_gmv_vnd }
      : null,
    funnelReason: f?.status === 'not_scored' ? f.reason : null,
    benchmark: b ?? null,
  }
}

/** Overall after applying the selected fixes: the backend's per-fix gains added up, labelled an estimate. */
export function estimateAfterFixes(overallScore, fixes, selected) {
  if (overallScore == null) return null
  const gain = (fixes ?? []).filter((f) => selected.has(f.id) && f.expected_gain != null).reduce((a, f) => a + f.expected_gain, 0)
  return Math.min(100, Math.round((overallScore + gain) * 10) / 10)
}

// ---------- per-platform view ----------

/**
 * Publishing targets the policy engine checks. `cart` = native: the viewer buys inside the app; link: the viewer
 * must tap out to a shop (fewer orders for the same views). `kind` decides what the row recommends.
 */
export const PLATFORM_TARGETS = [
  { id: 'tiktok_shop_video', kind: 'organic', cart: 'native' },
  { id: 'tiktok_ads', kind: 'ads', cart: 'native' },
  { id: 'shopee_listing', kind: 'listing', cart: 'native' },
  { id: 'meta_ads', kind: 'ads', cart: 'link' },
]

const groupScore = (result, name) => result?.scores?.find((g) => g.name === name)?.score ?? null

/**
 * Heat-cell band of a 0-100 score by how much it needs fixing, on our rubric thresholds: ready (>= ready),
 * fix (>= fix) or rework; missing when there is no score. Higher is better, so the alarm tones sit low.
 */
export function scoreBand(v, ready = 75, fix = 50) {
  if (v == null || Number.isNaN(Number(v))) return 'missing'
  return v >= ready ? 'ready' : v >= fix ? 'fix' : 'rework'
}

/**
 * One row per publishing target, from what the run measured: the content score is the same video on every
 * platform; what changes is that platform's policy verdict, its cart, and so the decision (post / fix / hold,
 * run ads or not). Thresholds are ours (rubric `ready`), not the platforms'.
 */
export function platformView(result) {
  const overall = result?.overall
  if (!overall) return null
  const ready = overall.thresholds?.ready ?? 75
  const fix = overall.thresholds?.fix ?? 50
  const viral = groupScore(result, 'viral_potential')
  const conversion = groupScore(result, 'conversion_potential')
  const sku = groupScore(result, 'sku_market')
  const hasCta = result?.features?.['video.has_cta']?.value
  const targets = result?.policy?.targets ?? {}
  const chosen = result?.post?.platforms ?? result?.options?.platforms ?? null

  const rows = PLATFORM_TARGETS.filter((p) => targets[p.id] || chosen?.includes(p.id)).map((p) => {
    const pol = targets[p.id] ?? null
    const verdict = pol?.verdict ?? 'unknown'
    const issues = (pol?.findings ?? []).filter((f) => f.outcome === 'needs_review' || f.outcome === 'fail')
    // the listing is judged on the SKU / market group, every video target on the overall content score
    const content = p.kind === 'listing' ? sku : overall.score
    const band = scoreBand(content, ready, fix)
    const contentLabel = band === 'missing' ? 'unknown' : band
    const reasons = []
    if (verdict === 'fail') reasons.push('policy vi phạm')
    if (verdict === 'needs_review') reasons.push(`${issues.length} rule policy cần xem lại`)
    if (verdict === 'unknown') reasons.push('chưa đủ dữ liệu để kiểm tra policy')
    if (contentLabel !== 'ready' && content != null) reasons.push(`${p.kind === 'listing' ? 'SKU & thị trường' : 'nội dung'} ${Math.round(content)} < ${ready}`)
    let decision
    if (p.kind === 'ads') {
      const adReasons = []
      if (verdict !== 'pass') adReasons.push(verdict === 'unknown' ? 'policy ads chưa kiểm tra được' : 'policy ads cần xem lại')
      if (hasCta === false) adReasons.push('chưa có lời kêu gọi mua')
      if (conversion != null && conversion < fix) adReasons.push(`Chuyển đổi ${Math.round(conversion)} < ${fix}`)
      const strong = viral != null && conversion != null && viral >= ready && conversion >= ready
      decision = adReasons.length
        ? { tone: 'red', text: 'Chưa nên chạy ads', why: adReasons }
        : strong
          ? { tone: 'green', text: 'Đủ điều kiện chạy ads chuyển đổi', why: [`Lan toả và Chuyển đổi đều ≥ ${ready}`] }
          : { tone: 'amber', text: 'Chạy thử ngân sách nhỏ', why: [viral < ready && `Lan toả ${Math.round(viral)} < ${ready}`, conversion < ready && `Chuyển đổi ${Math.round(conversion)} < ${ready}`].filter(Boolean) }
    } else {
      decision = verdict === 'fail'
        ? { tone: 'red', text: 'Chưa đăng được', why: reasons }
        : verdict === 'pass' && contentLabel === 'ready'
          ? { tone: 'green', text: p.kind === 'listing' ? 'Listing đủ tốt' : 'Nên đăng', why: [] }
          : { tone: 'amber', text: p.kind === 'listing' ? 'Sửa listing trước' : 'Sửa rồi đăng', why: reasons }
    }
    return {
      ...p,
      content,
      contentLabel,
      policyScore: pol?.score ?? null,
      verdict,
      issues: issues.map((f) => ({ rule: f.rule_id, severity: f.severity, summary: f.summary })),
      decision,
      selected: chosen ? chosen.includes(p.id) : null,
      fit: result?.platform_fit?.targets?.[p.id] ?? null,
    }
  })
  // where the video should go first: video targets only (a listing is a product page, not a place to post) whose own
  // decision is not red ("Chưa nên chạy ads", "Chưa đăng được"), highest policy score, organic before ads on a tie
  const rank = (r) => (r.policyScore ?? 0) * 10 + (r.kind === 'organic' ? 1 : 0)
  const best = rows.filter((r) => r.kind !== 'listing' && r.decision.tone !== 'red').sort((a, b) => rank(b) - rank(a))[0] ?? null
  return { rows, bestId: best?.id ?? null, ready, fix, hasCta }
}

// ---------- post info of an uploaded video ----------

/**
 * What the seller has not filled in on a video still to be posted: caption, hashtags, and the SKU while it is the
 * one attached automatically at upload (`sku_auto`). Each item names the edit panel that fixes it.
 */
export function missingPostInfo(video) {
  if (video?.stage !== 'prepublish') return []
  const items = []
  if (!video.post?.caption?.trim()) items.push({ id: 'caption', panel: 'caption', label: 'Tiêu đề / caption chưa viết' })
  if (!video.post?.hashtags?.length) items.push({ id: 'hashtags', panel: 'caption', label: 'Chưa có hashtag' })
  if (!video.sku_id) items.push({ id: 'sku', panel: 'products', label: 'Chưa gắn sản phẩm' })
  else if (video.sku_auto) items.push({ id: 'sku', panel: 'products', label: 'Sản phẩm đang để mặc định (SKU của video đang xem lúc tải lên)' })
  return items
}

// ---------- platform spec fit (core/platform_fit.py): a checklist beside the scores, never mixed into them ----------

/** Status id -> the word shown for it in the platform table and the checklist. */
export const FIT_STATUS_LABEL = {
  pass: 'đạt', fail: 'không đạt', tip: 'nên sửa', unverified: 'chưa xác minh', unmeasured: 'chưa đo',
}

/** "4 đạt · 1 nên sửa · 2 chưa xác minh" from one platform's fit summary; null when there is no fit. */
export function fitSummaryText(fit) {
  if (!fit?.summary) return null
  const parts = Object.entries(FIT_STATUS_LABEL).filter(([id]) => fit.summary[id]).map(([id, label]) => `${fit.summary[id]} ${label}`)
  return parts.join(' · ') || 'không có check'
}

/**
 * Compact heat-table cell: passes over the checks that got a verdict, the worst miss, and how many could not be
 * judged (no official spec, or we do not measure it). Null when there is no fit.
 */
export function fitCell(fit) {
  if (!fit?.summary) return null
  const { pass = 0, fail = 0, tip = 0, unverified = 0, unmeasured = 0 } = fit.summary
  const judged = pass + fail + tip
  return {
    main: judged ? `${pass}/${judged} đạt` : null,
    miss: fail ? { tone: 'fail', text: `${fail} không đạt` } : tip ? { tone: 'tip', text: `${tip} nên sửa` } : null,
    unknown: unverified + unmeasured ? `${unverified + unmeasured} chưa xác minh` : null,
  }
}

// ---------- first screen of the result column ----------


/** The first n fixes in the backend's order (policy blockers come first there). */
export const topFixes = (fixes, n = 3) => (fixes ?? []).slice(0, n)

/** Seconds of a fix's first moment in the video: its first timestamp, else the suggested spot; null when none. */
export function fixMoment(fix) {
  // a missing element has a suggested spot instead of a moment: {start, end, label: "3 giây cuối"}
  const spot = fix?.suggested_at
  const start = (fix?.timestamps ?? []).find((m) => m?.start != null)?.start ?? (typeof spot === 'object' ? spot?.start : spot)
  return Number.isFinite(start) ? start : null
}

/** Policy blockers grouped by rule: one entry per rule_id, the platforms it hits and all its evidence. */
export function groupPolicyByRule(blockers) {
  const byRule = new Map()
  for (const b of blockers ?? []) {
    const g = byRule.get(b.rule_id) ?? { rule_id: b.rule_id, summary: b.summary, targets: [], quotes: [], evidence: [] }
    if (!g.targets.includes(b.target)) g.targets.push(b.target)
    g.quotes.push(...(b.quotes ?? []))
    g.evidence.push(...(b.evidence ?? []))
    byRule.set(b.rule_id, g)
  }
  return [...byRule.values()]
}
