import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  answerLevels,
  estimateAfterFixes,
  groupOfQuestion,
  keyAxes,
  keyQuestionIds,
  provisionalOverall,
  questionFeatures,
  questionSegments,
  radarAxes,
  radarPoint,
  revealOrder,
  scoreBand,
  segmentOf,
  skuMarketView,
  platformView,
  fitSummaryText,
  fitCell,
  missingPostInfo,
  topFixes,
  fixMoment,
  groupPolicyByRule,
} from './studio-model.js'

// Trimmed copy of a real SHOP001-VID01 video_run with markers.
const run = JSON.parse(readFileSync(new URL('../lib/fixtures/shop001-vid01-run.json', import.meta.url), 'utf-8'))
const result = run.result
const questions = result.decisions.questions

test('radar axes are the real Decisions score questions of one group, in bank order', () => {
  const axes = radarAxes(questions, 'viral_potential')
  assert.deepEqual(axes.map((a) => a.id), questions.filter((q) => q.type === 'score' && q.id.startsWith('V')).map((q) => q.id))
  const v01 = axes.find((a) => a.id === 'V01')
  assert.equal(v01.label, 'Hook mở đầu')
  assert.equal(v01.value, questions.find((q) => q.id === 'V01').value)
  assert.equal(groupOfQuestion('H04'), 'shop_health')
  assert.equal(groupOfQuestion('M02'), null) // choice questions never become axes
})

test('a streaming reveal shows only revealed answers, others stay pending', () => {
  const order = revealOrder(questions)
  assert.ok(order.length > 0)
  const firstGroup = order.slice(0, 2)
  const axes = radarAxes(questions, 'viral_potential', new Set(firstGroup))
  assert.equal(axes.filter((a) => a.value != null).length, firstGroup.filter((id) => id.startsWith('V')).length)
  assert.ok(axes.some((a) => a.status === 'pending'))
})

test('answer levels carry every level with its probability and the most likely one', () => {
  const q = questions.find((x) => x.id === 'C07')
  const { levels, best } = answerLevels(q)
  assert.equal(levels.length, 5)
  assert.equal(best.label, '0 Absent')
  assert.equal(best.probability, 1)
})

test('questions are grouped by where they sit in the video; unanswered ones keep the backend reason', () => {
  const segs = questionSegments(result, 38)
  const all = segs.flatMap((s) => s.items)
  assert.equal(all.length, questions.filter((q) => q.type === 'score').length)
  const c07 = all.find((r) => r.id === 'C07')
  assert.equal(c07.state, 'bad')
  const missing = all.find((r) => r.state === 'miss')
  if (missing) assert.ok(missing.reason)
  assert.equal(segmentOf(1, 38), 'open')
  assert.equal(segmentOf(36, 38), 'end')
  assert.equal(segmentOf(null, 38), 'whole')
})

test('question drill lists sent and missing schema features with their extraction', () => {
  const q = questions.find((x) => x.id === 'V02')
  const feats = questionFeatures(q, result)
  assert.ok(feats.length >= (q.inputs ?? []).length)
  const sent = feats.filter((f) => f.sent)
  assert.ok(sent.every((f) => f.status !== undefined))
  assert.deepEqual(sent.map((f) => f.name), q.inputs)
})

test('estimate after fixes adds only the selected backend gains and caps at 100', () => {
  const fixes = [{ id: 'a', expected_gain: 2.9 }, { id: 'b', expected_gain: 3 }, { id: 'c', expected_gain: null }]
  assert.equal(estimateAfterFixes(52.1, fixes, new Set(['a', 'c'])), 55)
  assert.equal(estimateAfterFixes(99, fixes, new Set(['a', 'b'])), 100)
  assert.equal(estimateAfterFixes(null, fixes, new Set(['a'])), null)
})

test('radar geometry starts straight up', () => {
  assert.deepEqual(radarPoint(0, 8, 1), [160, 58])
  assert.deepEqual(radarPoint(0, 8, 0.5), [160, 109])
})

test('shared radar takes the two heaviest questions of every group', () => {
  const ids = keyQuestionIds(questions)
  assert.equal(ids.length, 8)
  assert.ok(ids.includes('V01')) // weight 1.5, the heaviest Viral question
  assert.ok(ids.includes('C06')) // weight 1.3
  assert.deepEqual(keyAxes(questions).map((a) => a.id).sort(), [...ids].sort()) // drawn in bank order
})

test('provisional score grows with revealed answers and stays null without weights', () => {
  const weights = { viral_potential: 0.3, conversion_potential: 0.4, sku_market: 0.2, shop_health: 0.1 }
  const order = revealOrder(questions)
  assert.equal(provisionalOverall(questions, new Set(), weights), null)
  const one = provisionalOverall(questions, new Set(order.slice(0, 1)), weights)
  assert.equal(one, questions.find((q) => q.id === order[0]).value)
  assert.ok(provisionalOverall(questions, null, weights) != null)
  assert.equal(provisionalOverall(questions, null, null), null)
})

test('sku market view normalises crawled competitors and compares like-for-like prices', () => {
  const snapshot = {
    keyword: 'x', crawled_at: '2026-10-31', source: 'serpapi',
    competitors: [
      { platform: 'shopee.vn', price_vnd: '56050', like_for_like: 'True', rating: '4.6' },
      { platform: 'tiktok_shop', price_vnd: 39000, like_for_like: true, sold_count: 1200 },
      { platform: 'Chiaki.vn', price_vnd: 80000, like_for_like: false },
      { platform: 'Shopee', price_vnd: 60000, like_for_like: true },
    ],
    tiktok: { video_count: '24459', units_28d: 142478, momentum_7d_vs_28d: '1.04', own_product: '{"title":"t"}' },
  }
  const v = skuMarketView(snapshot, 46550)
  assert.deepEqual(v.rows.map((r) => r.channel), ['shopee', 'tiktok', 'web', 'shopee'])
  assert.equal(v.comparable, 3)
  assert.equal(v.median, 56050)
  assert.equal(v.pricierShare, 2 / 3) // 56050 and 60000 are pricier than 46550
  assert.deepEqual(v.priceRange, [39000, 80000])
  assert.equal(v.tiktok.videoCount, 24459)
  assert.equal(v.tiktok.ownProduct.title, 't')
  assert.equal(skuMarketView(null, 1), null)
})

test('platformView: same content score everywhere, decision follows each platform policy and cart', () => {
  const result = {
    overall: { score: 80, thresholds: { ready: 75, fix: 50 } },
    scores: [
      { name: 'viral_potential', score: 82 },
      { name: 'conversion_potential', score: 78 },
      { name: 'sku_market', score: 60 },
    ],
    features: { 'video.has_cta': { value: true } },
    policy: {
      targets: {
        tiktok_shop_video: { score: 100, verdict: 'pass', findings: [] },
        tiktok_ads: { score: 40, verdict: 'needs_review', findings: [{ rule_id: 'TTA-001', outcome: 'needs_review', severity: 'high', summary: 'x' }] },
        shopee_listing: { score: 90, verdict: 'pass', findings: [] },
        meta_ads: { score: null, verdict: 'unknown', findings: [] },
      },
    },
  }
  const v = platformView(result)
  const by = Object.fromEntries(v.rows.map((r) => [r.id, r]))
  assert.equal(by.tiktok_shop_video.content, 80)
  assert.equal(by.tiktok_shop_video.decision.tone, 'green')
  assert.equal(by.tiktok_ads.decision.tone, 'red')
  assert.deepEqual(by.tiktok_ads.issues.map((i) => i.rule), ['TTA-001'])
  assert.equal(by.shopee_listing.content, 60) // a listing is judged on SKU & market
  assert.equal(by.shopee_listing.decision.tone, 'amber')
  assert.equal(by.meta_ads.cart, 'link')
  assert.equal(by.meta_ads.decision.text, 'Chưa nên chạy ads')
  assert.equal(v.bestId, 'tiktok_shop_video')
  // a listing never takes the tag, even with the best policy score; organic wins a tie with ads
  result.policy.targets.tiktok_shop_video.score = 40
  result.policy.targets.shopee_listing.score = 100
  assert.equal(platformView(result).bestId, 'tiktok_shop_video')
})

test('platformView: ads go green only when policy passes, a CTA exists and both groups clear the bar', () => {
  const base = (viral, conversion, cta) => ({
    overall: { score: 80, thresholds: { ready: 75, fix: 50 } },
    scores: [{ name: 'viral_potential', score: viral }, { name: 'conversion_potential', score: conversion }],
    features: { 'video.has_cta': { value: cta } },
    policy: { targets: { tiktok_ads: { score: 100, verdict: 'pass', findings: [] } } },
  })
  const ads = (r) => platformView(r).rows[0].decision.tone
  assert.equal(ads(base(80, 80, true)), 'green')
  assert.equal(ads(base(80, 60, true)), 'amber')
  assert.equal(ads(base(80, 80, false)), 'red')
  assert.equal(platformView({}), null)
})

test('scoreBand colours by need-to-fix: high scores are ready, low ones rework, no score is missing (never 0)', () => {
  assert.equal(scoreBand(100), 'ready')
  assert.equal(scoreBand(75), 'ready')
  assert.equal(scoreBand(74.9), 'fix')
  assert.equal(scoreBand(50), 'fix')
  assert.equal(scoreBand(46), 'rework')
  assert.equal(scoreBand(0), 'rework')
  assert.equal(scoreBand(null), 'missing')
  assert.equal(scoreBand(undefined), 'missing')
  assert.equal(scoreBand(60, 80, 65), 'rework')
})

test('fitSummaryText counts non-zero statuses in a fixed order', () => {
  assert.equal(fitSummaryText({ summary: { pass: 4, fail: 0, tip: 1, unverified: 2, unmeasured: 0 } }),
    '4 đạt · 1 nên sửa · 2 chưa xác minh')
  assert.equal(fitSummaryText({ summary: { pass: 0, fail: 1, tip: 0, unverified: 0, unmeasured: 3 } }),
    '1 không đạt · 3 chưa đo')
  assert.equal(fitSummaryText({ summary: { pass: 0, fail: 0, tip: 0, unverified: 0, unmeasured: 0 } }), 'không có check')
  assert.equal(fitSummaryText(null), null)
})

test('fitCell shows passes over judged checks, the worst miss, and unjudged checks together', () => {
  assert.deepEqual(fitCell({ summary: { pass: 7, fail: 0, tip: 1, unverified: 2, unmeasured: 1 } }),
    { main: '7/8 đạt', miss: { tone: 'tip', text: '1 nên sửa' }, unknown: '3 chưa xác minh' })
  assert.deepEqual(fitCell({ summary: { pass: 0, fail: 1, tip: 2, unverified: 0, unmeasured: 0 } }),
    { main: '0/3 đạt', miss: { tone: 'fail', text: '1 không đạt' }, unknown: null })
  assert.deepEqual(fitCell({ summary: { pass: 0, fail: 0, tip: 0, unverified: 7, unmeasured: 0 } }),
    { main: null, miss: null, unknown: '7 chưa xác minh' })
  assert.equal(fitCell(null), null)
})

test('platform fit reaches its platform row; rows have no fit without platform_fit', () => {
  const base = {
    overall: { score: 80, thresholds: { ready: 75, fix: 50 } },
    policy: { targets: { tiktok_shop_video: { score: 100, verdict: 'pass', findings: [] } } },
  }
  const plain = platformView(base)
  assert.equal(plain.rows[0].fit, null)
  const summary = { pass: 2, fail: 0, tip: 1, unverified: 1, unmeasured: 0 }
  const withFit = platformView({ ...base, platform_fit: { targets: { tiktok_shop_video: { checks: [], summary } } } })
  assert.deepEqual(withFit.rows[0].fit.summary, summary)
})

test('missingPostInfo lists caption, hashtags and a default or missing SKU of a video still to be posted', () => {
  const ids = (v) => missingPostInfo(v).map((i) => i.id)
  assert.deepEqual(ids({ stage: 'prepublish', sku_id: 'S1', sku_auto: true, post: {} }), ['caption', 'hashtags', 'sku'])
  assert.deepEqual(ids({ stage: 'prepublish', post: { caption: 'x', hashtags: ['a'] } }), ['sku'])
  assert.deepEqual(ids({ stage: 'prepublish', sku_id: 'S1', post: { caption: ' ', hashtags: ['a'] } }), ['caption'])
  assert.deepEqual(ids({ stage: 'prepublish', sku_id: 'S1', post: { caption: 'x', hashtags: ['a'] } }), [])
  assert.deepEqual(ids({ stage: 'published', post: {} }), [])
  assert.deepEqual(ids(null), [])
})


test('top fixes keep the backend order and cap at three', () => {
  const fixes = [{ id: 'p1' }, { id: 'c1' }, { id: 'c2' }, { id: 'c3' }]
  assert.deepEqual(topFixes(fixes).map((f) => f.id), ['p1', 'c1', 'c2'])
  assert.deepEqual(topFixes(fixes, 1).map((f) => f.id), ['p1'])
  assert.deepEqual(topFixes(null), [])
})

test('a fix moment is its first timestamp, else the suggested spot, else none', () => {
  assert.equal(fixMoment({ timestamps: [{ start: 12.5 }, { start: 3 }], suggested_at: 1 }), 12.5)
  assert.equal(fixMoment({ timestamps: [], suggested_at: 7 }), 7)
  assert.equal(fixMoment({ timestamps: [], suggested_at: { start: 7, end: 10, label: '3 giây cuối' } }), 7)
  assert.equal(fixMoment({ timestamps: [{ label: 'x' }] }), null)
  assert.equal(fixMoment(null), null)
})

test('policy blockers are grouped so each rule appears once with all its platforms', () => {
  const groups = groupPolicyByRule([
    { rule_id: 'TTA-001', target: 'tiktok_ads', summary: 'Absolute claim', quotes: [{ t: 4, text: 'a' }] },
    { rule_id: 'TTA-001', target: 'meta_ads', summary: 'Absolute claim', quotes: [{ t: 9, text: 'b' }] },
    { rule_id: 'SHP-003', target: 'shopee_listing', summary: 'Promo word', evidence: ['e'] },
  ])
  assert.deepEqual(groups.map((g) => g.rule_id), ['TTA-001', 'SHP-003'])
  assert.deepEqual(groups[0].targets, ['tiktok_ads', 'meta_ads'])
  assert.deepEqual(groups[0].quotes.map((q) => q.t), [4, 9])
  assert.deepEqual(groups[1].evidence, ['e'])
  assert.deepEqual(groupPolicyByRule(undefined), [])
})