import assert from 'node:assert/strict'
import { test } from 'node:test'

import { analysisRunReducer, initialRunState } from './analysis-run-reducer.js'
import { DEFAULT_OPTIONS, paidConfirmText, paidWarnings } from './analysis-options.js'
import { buildViewModel } from './analysis-view-model.js'
import { newestAfter, waitForNewRun } from './latest-run.js'
import { overallView } from './overall-view.js'
import { seekTimeFromClick } from './timeline.js'

test('the overall score is the backend result.overall as sent; a run without one shows none', () => {
  assert.equal(overallView(null), null)
  const o = overallView({
    score: 100, label: 'ready', coverage: 0.25, groups_used: ['viral_potential'], missing_groups: ['conversion_potential', 'sku_market'],
    weights: { viral_potential: 0.35, conversion_potential: 0.45, sku_market: 0.2 },
    warnings: ['Thiếu nhóm Conversion, SKU & thị trường: điểm tổng chỉ tính trên Lan toả.'],
    policy_gate: { status: 'clear', blockers: [] },
  })
  assert.equal(o.overall, 100)
  assert.equal(o.status, 'ready')
  assert.equal(o.policyReview, false)
  assert.match(o.reason, /^Thiếu nhóm Conversion/)
})

test('while streaming: group scores fill in, the overall score waits for the finished run', () => {
  const partial = { policy: { 'policy.score': { value: 100 }, targets: { tiktok_shop_video: { verdict: 'no_issue_detected', findings: [] } } }, decisions: null, scores: null }
  const vm = buildViewModel(null, partial)
  assert.equal(vm.stage, 'provisional')
  assert.equal(vm.overall, null)
  assert.deepEqual(vm.videoGroups.map((g) => [g.name, g.score]), [['policy_compliance', 100]])
  assert.equal(vm.policy[0].verdictLabel, 'Không phát hiện vi phạm')
  const scored = buildViewModel(null, { ...partial, scores: { viral_potential: { score: 70, coverage: 1 } } })
  assert.equal(scored.overall, null)
  assert.equal(scored.videoGroups[0].score, 70)
})

test('seek from a lane click maps x to time and clamps', () => {
  const rect = { left: 100, width: 200 }
  assert.equal(seekTimeFromClick(200, rect, 40), 20)
  assert.equal(seekTimeFromClick(50, rect, 40), 0)
  assert.equal(seekTimeFromClick(400, rect, 40), 40)
  assert.equal(seekTimeFromClick(200, { left: 0, width: 0 }, 40), 0)
})

test('paid warnings: extract=auto is paid when the cache is missing or changed', () => {
  const free = { ...DEFAULT_OPTIONS, insights: false, policy_llm: false }
  assert.deepEqual(paidWarnings(free, 'current'), [])
  assert.equal(paidConfirmText(paidWarnings(free, 'current')), null)
  assert.deepEqual(paidWarnings(free, 'missing').map((w) => w.key), ['extract_auto'])
  assert.deepEqual(paidWarnings(free, 'changed').map((w) => w.key), ['extract_auto'])
  assert.deepEqual(paidWarnings({ ...free, extract: 'never' }, 'missing'), [])
  // the AI summary is on by default and is confirmed like any paid step
  assert.deepEqual(paidWarnings(DEFAULT_OPTIONS, 'current').map((w) => w.key), ['policy_llm', 'insights'])
  const w = paidWarnings({ ...free, decisions: true }, 'missing')
  assert.deepEqual(w.map((x) => x.key), ['extract_auto', 'decisions'])
  assert.match(paidConfirmText(w), /14k token[\s\S]*10k token/)
})

test('a dropped stream is flagged lost', () => {
  const s = analysisRunReducer({ ...initialRunState, status: 'running' }, { type: 'error', data: { lost: true, message: 'x' } })
  assert.equal(s.lost, true)
  assert.equal(analysisRunReducer(s, { type: 'start' }).lost, false)
})

test('latest saved run: newest id above the known one, polled briefly', async () => {
  assert.equal(newestAfter([{ id: 3 }, { id: 5 }, { id: 4 }], 3).id, 5)
  assert.equal(newestAfter([{ id: 3 }], 3), null)
  let calls = 0
  const load = async () => (++calls < 3 ? [{ id: 7 }] : [{ id: 8 }, { id: 7 }])
  const found = await waitForNewRun(load, 7, { sleep: async () => {} })
  assert.equal(found.id, 8)
  assert.equal(calls, 3)
  assert.equal(await waitForNewRun(async () => [{ id: 7 }], 7, { tries: 2, sleep: async () => {} }), null)
})
