import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  buildFixes,
  buildViewModel,
  groupsFromStepOutput,
  provisionalGroups,
  refTarget,
  topLevel,
} from './analysis-view-model.js'
import { overallView } from './overall-view.js'

// Trimmed copy of a real SHOP001-VID01 video_run (db.json analyses id 21) with markers from core/markers.py.
const run = JSON.parse(readFileSync(new URL('./fixtures/shop001-vid01-run.json', import.meta.url), 'utf-8'))
const result = run.result

test('overall is the backend result.overall, shown as sent: 0.35*64.6 + 0.45*49.7 + 0.20*63.9 = 57.8', () => {
  const o = overallView(result.overall)
  assert.equal(o.overall, 57.8)
  assert.equal(o.status, 'fix')
  assert.equal(o.policyReview, true)
  assert.equal(o.coverage, 1)
  assert.deepEqual(o.weights, { viral_potential: 0.35, conversion_potential: 0.45, sku_market: 0.2 })
})

test('the label follows the score even with a policy hit; missing groups are named beside it', () => {
  const o = overallView({
    score: 85, label: 'ready', coverage: 0.5, groups_used: ['viral_potential'], missing_groups: ['conversion_potential', 'sku_market'],
    weights: { viral_potential: 0.35, conversion_potential: 0.45, sku_market: 0.2 },
    warnings: ['Thiếu nhóm Conversion, SKU & thị trường: điểm tổng chỉ tính trên Lan toả.'],
    policy_gate: { status: 'review', blockers: [{ rule_id: 'TTA-001' }] },
  })
  assert.equal(o.overall, 85)
  assert.equal(o.status, 'ready')
  assert.equal(o.label, 'Sẵn sàng đăng')
  assert.equal(o.policyReview, true)
  assert.equal(o.reason, 'Thiếu nhóm Conversion, SKU & thị trường: điểm tổng chỉ tính trên Lan toả.')
  assert.equal(overallView({ score: null, label: null, coverage: 0, groups_used: [], warnings: [] }).status, 'none')
})

test('final view model reads groups, criteria and Decisions answers from the result', () => {
  const vm = buildViewModel(result)
  assert.equal(vm.stage, 'final')
  assert.deepEqual(vm.videoGroups.map((g) => g.name), ['viral_potential', 'conversion_potential', 'sku_market', 'policy_compliance'])
  assert.equal(vm.shopHealth.score, 26.5)
  const v01 = vm.videoGroups[0].criteria.find((c) => c.id === 'V01')
  assert.equal(v01.score, 92.8)
  assert.equal(v01.name, 'Hook mở đầu')
  assert.equal(v01.confidence, 0.76)
  assert.equal(v01.topLevel.label, '4 Excellent')
  assert.equal(vm.policy.find((p) => p.platform === 'tiktok_ads').verdictLabel, 'Cần xem lại')
})

test('not scored criteria keep null and a reason, never 0', () => {
  const vm = buildViewModel({
    mode: 'evidence',
    scores: [{ name: 'viral_potential', score: null, coverage: 0, criteria: [{ id: 'V01', name: 'Hook immediacy', weight: 1.5, score: null, inputs: ['decision.V01'], reason: 'decision.V01 missing' }] }],
  })
  const c = vm.videoGroups[0].criteria[0]
  assert.equal(c.score, null)
  assert.equal(c.notScoredReason, 'decision.V01 missing')
  assert.equal(vm.overall, null)
})

test('fixes: worst policy hit first, then weakest video criteria, with marker links', () => {
  const fixes = buildFixes(result, result.markers)
  assert.equal(fixes.length, 3)
  assert.equal(fixes[0].kind, 'policy')
  assert.equal(fixes[0].ref, 'TTA-001')
  assert.deepEqual(fixes[0].times, [0, 3, 9, 13, 17, 35])
  assert.ok(fixes.every((f) => f.group !== 'shop_health'))
  assert.deepEqual(fixes.slice(1).map((f) => f.ref), ['C07', 'C08'])
})

test('old runs without markers still produce fixes without times', () => {
  const { markers: _drop, ...old } = result
  const vm = buildViewModel(old)
  assert.equal(vm.hasMarkers, false)
  assert.deepEqual(vm.markers, [])
  assert.ok(vm.fixes.length > 0)
  assert.ok(vm.fixes.every((f) => f.times.length === 0))
})

test('provisional scores from Decisions answers by domain, policy from check_policy', () => {
  const groups = provisionalGroups(result.decisions, 40)
  const viral = groups.find((g) => g.name === 'viral_potential')
  const qs = result.decisions.questions.filter((q) => q.domain === 'viral' && q.type === 'score' && q.value != null)
  const expected = qs.reduce((a, q) => a + q.weight * q.value, 0) / qs.reduce((a, q) => a + q.weight, 0)
  assert.equal(viral.score, Math.round(expected * 10) / 10)
  assert.equal(groups.find((g) => g.name === 'policy_compliance').score, 40)
  const vm = buildViewModel(null, { decisions: result.decisions, policy: { 'policy.score': { value: 40 }, targets: result.policy.targets }, scores: null })
  assert.equal(vm.stage, 'provisional')
  assert.equal(vm.overall, null) // the overall score waits for the finished run
  assert.equal(vm.videoGroups.find((g) => g.name === 'viral_potential').score, viral.score)
})

test('score_rubric step output becomes final groups before done', () => {
  const output = result.trace.find((s) => s.name === 'score_rubric').output
  const groups = groupsFromStepOutput(output)
  assert.equal(groups.find((g) => g.name === 'conversion_potential').score, 49.7)
  const vm = buildViewModel(null, { scores: output, policy: null, decisions: null })
  assert.equal(vm.stage, 'final')
  assert.equal(vm.overall, null)
  assert.equal(vm.videoGroups.find((g) => g.name === 'conversion_potential').score, 49.7)
})

test('topLevel picks the most likely level', () => {
  const q = result.decisions.questions.find((x) => x.id === 'C07')
  assert.equal(topLevel(q).label, '0 Absent')
  assert.equal(topLevel({}), null)
})

test('"Vì sao?" deep links: policy marker, Decisions criterion, formula criterion, ghost', async () => {
  const { reportTarget } = await import('./analysis-view-model.js')
  const tta = result.markers.find((m) => m.source.ref === 'TTA-001')
  assert.deepEqual(reportTarget(tta, result), { tab: 'policy', anchor: 'rule-TTA-001' })
  const c06 = result.markers.find((m) => m.id === 'criterion:C06')
  assert.deepEqual(reportTarget(c06, result), { tab: 'decisions', anchor: 'q-C06' })
  assert.deepEqual(reportTarget({ id: 'S2', questionId: null }, result), { tab: 'scoring', anchor: 'crit-S2' })
  assert.deepEqual(reportTarget({ kind: 'criterion', ref: 'C07' }, result), { tab: 'decisions', anchor: 'q-C07' })
  assert.deepEqual(reportTarget(result.markers.find((m) => m.id === 'ghost:cta'), result), { tab: 'ai-saw', anchor: null })
})

test('AI summary fixes replace the template list, light their markers and open the cited numbers', () => {
  const insights = {
    headline: 'h',
    insights: [{ text: 'x', tone: 'bad', refs: ['C07'] }],
    fixes: [
      { text: 'Bỏ câu hứa tuyệt đối', why: 'dễ bị gỡ', t: 3, refs: ['TTA-001'] },
      { text: 'Thêm ưu đãi', why: 'chưa có lý do mua', t: null, refs: ['C07'] },
    ],
    groups: { viral_potential: 'ok' },
  }
  const vm = buildViewModel({ ...result, insights })
  assert.equal(vm.insights.headline, 'h')
  assert.deepEqual(vm.fixes.map((f) => [f.kind, f.title, f.times]), [['ai', 'Bỏ câu hứa tuyệt đối', [3]], ['ai', 'Thêm ưu đãi', []]])
  assert.equal(vm.fixes[0].severity, 'high')
  assert.ok(vm.fixes[0].markerIds.some((id) => id.includes('TTA-001')))
  assert.deepEqual(refTarget('TTA-001', result), { tab: 'policy', anchor: 'rule-TTA-001' })
  assert.deepEqual(refTarget('viral_potential', result), { tab: 'scoring', anchor: 'group-viral_potential' })
  assert.deepEqual(refTarget('C07', result), { tab: 'decisions', anchor: 'q-C07' })
  assert.equal(buildViewModel(result).insights, null)
  assert.equal(buildViewModel(result).fixes[0].kind, 'policy')
})
