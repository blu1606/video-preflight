import { test } from 'node:test'
import assert from 'node:assert/strict'

import { citeChip, citeChips, criterionTarget, datasetTitle } from './insight-cites.js'

test('criterion, policy and fix citations open their own place in the studio', () => {
  assert.deepEqual(citeChip({ kind: 'criterion', id: 'C08' }).action, { type: 'criterion', id: 'C08' })
  assert.equal(citeChip({ kind: 'criterion', id: 'C08' }).label, 'Câu C08')
  assert.deepEqual(citeChip({ kind: 'policy', id: 'SHP-003' }).action, { type: 'policy', id: 'SHP-003' })
  assert.equal(citeChip({ kind: 'fix', id: 'criterion:C08' }).action.type, 'fix')
})

test('a time citation is labelled with the video clock and seeks there', () => {
  const chip = citeChip({ kind: 'time', t: 12 })
  assert.equal(chip.label, '00:12')
  assert.deepEqual(chip.action, { type: 'time', t: 12 })
})

test('metric and dataset citations open the Data Atlas at their dataset', () => {
  const metric = citeChip({ kind: 'metric', field: 'perf.views', value: 116710, dataset: 'videos', source: 'video record SHOP002-VID01' })
  assert.deepEqual(metric.action, { type: 'dataset', dataset: 'videos' })
  assert.equal(metric.label, 'Số liệu · Video của shop')
  assert.match(metric.title, /perf\.views = 116710/)
  const row = citeChip({ kind: 'dataset', dataset: 'benchmarkVideos', row: 'vn-phones-436820' })
  assert.equal(row.label, 'Kho dữ liệu · Benchmark Clipcat')
  assert.deepEqual(row.action, { type: 'dataset', dataset: 'benchmarkVideos' })
})

test('unknown kinds give no chip and unknown datasets keep their id', () => {
  assert.equal(citeChip({ kind: 'mystery' }), null)
  assert.equal(citeChip(null), null)
  assert.equal(datasetTitle('nope'), 'nope')
})

test('chips of one insight show each source once, in order', () => {
  const chips = citeChips([
    { kind: 'metric', field: 'perf.views', value: 1, dataset: 'videos' },
    { kind: 'metric', field: 'perf.product_ctr', value: 0.003, dataset: 'videos' },
    { kind: 'criterion', id: 'C08' },
    { kind: 'mystery' },
    { kind: 'fix', id: 'criterion:C08' },
    { kind: 'fix', id: 'criterion:C02' },
    { kind: 'time', t: 4 },
  ])
  assert.deepEqual(chips.map((c) => c.label), ['Số liệu · Video của shop', 'Câu C08', 'Việc cần sửa', '00:04'])
  assert.deepEqual(citeChips(undefined), [])
})

test('a criterion opens its Decisions question only when the batch answered it', () => {
  const answered = new Set(['C08', 'C07'])
  assert.deepEqual(criterionTarget('C08', answered), { open: 'question', id: 'C08' })
  assert.deepEqual(criterionTarget('C8', answered), { open: 'fix' })
})
