import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DATASETS,
  autoColumns,
  calibrationRows,
  calibrationSummary,
  columnsOf,
  competitorChannel,
  crossCount,
  funnelTotals,
  marketSummary,
  median,
  platformSpecRows,
  nextSort,
  overallSeries,
  parseLoose,
  parseTopics,
  priceRows,
  questionWeights,
  restrictedRows,
  runRows,
  sortRows,
  statusCounts,
  sumDailyByDate,
  topicCounts,
  transcriptRows,
  videoRates,
  benchmarkPoints,
  datasetDate,
  logAxis,
  NO_DATE,
  CALIBRATION_STATUS_NOTE,
} from './data-atlas-model.js'

test('every dataset declares provenance and a known status', () => {
  const ids = new Set()
  for (const d of DATASETS) {
    assert.ok(!ids.has(d.id), `duplicate ${d.id}`)
    ids.add(d.id)
    assert.ok(d.title && d.what && d.source && d.file, d.id)
    assert.ok(['REAL', 'MOCK', 'INFERRED', 'CONFIG', 'RUN'].includes(d.status), d.id)
    assert.ok(d.collection || d.py, d.id)
  }
})

test('statusCounts counts per source_status and skips rows without one', () => {
  assert.deepEqual(statusCounts([{ source_status: 'MOCK' }, { source_status: 'REAL' }, { source_status: 'MOCK' }, {}]), { MOCK: 2, REAL: 1 })
  assert.deepEqual(statusCounts(null), {})
})

test('sortRows: numbers numerically, numeric strings as numbers, blanks last in both directions, stable', () => {
  const rows = [{ v: 10 }, { v: null }, { v: '9' }, { v: 2 }, { v: '' }]
  assert.deepEqual(sortRows(rows, 'v', 'asc').map((r) => r.v), [2, '9', 10, null, ''])
  assert.deepEqual(sortRows(rows, 'v', 'desc').map((r) => r.v), [10, '9', 2, null, ''])
  const text = [{ t: 'b', i: 1 }, { t: 'a', i: 2 }, { t: 'b', i: 3 }]
  assert.deepEqual(sortRows(text, 't').map((r) => r.i), [2, 1, 3])
  assert.equal(sortRows(rows, null).length, 5)
})

test('nextSort cycles asc → desc → off', () => {
  let s = nextSort(null, 'a')
  assert.deepEqual(s, { key: 'a', dir: 'asc' })
  s = nextSort(s, 'a')
  assert.deepEqual(s, { key: 'a', dir: 'desc' })
  s = nextSort(s, 'a')
  assert.equal(s.key, null)
  assert.deepEqual(nextSort({ key: 'a', dir: 'desc' }, 'b'), { key: 'b', dir: 'asc' })
})

test('columnsOf keeps preferred first and drops skipped keys', () => {
  assert.deepEqual(columnsOf([{ a: 1, b: 2 }, { c: 3, a: 4 }], ['c'], ['b']), ['c', 'a'])
})

test('autoColumns marks numeric columns from the first present value', () => {
  const cols = autoColumns([{ a: null, b: 'x' }, { a: 3, b: 'y' }])
  assert.deepEqual(cols, [{ key: 'a', label: 'a', num: true }, { key: 'b', label: 'b', num: false }])
})

test('median ignores missing values and returns null when empty', () => {
  assert.equal(median([3, null, 1, '2']), 2)
  assert.equal(median([1, 2, 3, 4]), 2.5)
  assert.equal(median([null, undefined]), null)
})

test('sumDailyByDate adds shops per date in date order', () => {
  const out = sumDailyByDate([
    { date: '2026-09-28', gmv_vnd: 5, paid_orders: 1 },
    { date: '2026-09-27', gmv_vnd: 10, paid_orders: 2 },
    { date: '2026-09-27', gmv_vnd: 1, paid_orders: null },
  ])
  assert.deepEqual(out.map((r) => r.date), ['2026-09-27', '2026-09-28'])
  assert.equal(out[0].gmv_vnd, 11)
  assert.equal(out[0].paid_orders, 2)
  assert.equal(out[0].shops, 2)
})

test('priceRows computes margin and discount, null when an input is missing', () => {
  const [a, b] = priceRows([
    { sku_id: 'S1', item_name: 'A', price_vnd: 80, original_price_vnd: 100, cost_vnd: 50, stock: 3 },
    { sku_id: 'S2', price_vnd: 80, original_price_vnd: null, cost_vnd: null },
  ])
  assert.equal(a.margin, 30)
  assert.ok(Math.abs(a.discount - 0.2) < 1e-9)
  assert.equal(b.margin, null)
  assert.equal(b.discount, null)
  assert.equal(b.name, 'S2')
})

test('funnelTotals sums steps and gives step rates; empty input stays null', () => {
  const f = funnelTotals([
    { impressions: 1000, product_page_views: 100, units_ordered: 5 },
    { impressions: 1000, product_page_views: 100, units_ordered: 5 },
  ])
  assert.deepEqual(f.map((s) => s.value), [2000, 200, 10])
  assert.equal(f[1].rate, 0.1)
  assert.equal(f[2].rate, 0.05)
  assert.deepEqual(funnelTotals([]).map((s) => s.value), [null, null, null])
})

test('parseTopics reads JSON strings, arrays and raw text', () => {
  assert.deepEqual(parseTopics('[]'), [])
  assert.deepEqual(parseTopics('["a","b"]'), ['a', 'b'])
  assert.deepEqual(parseTopics(['x']), ['x'])
  assert.deepEqual(parseTopics('not json'), ['not json'])
  assert.deepEqual(parseTopics(null), [])
})

test('topicCounts counts SKUs per topic, most frequent first', () => {
  const out = topicCounts([{ negative_topics: '["a","b"]' }, { negative_topics: '["a","a"]' }, { negative_topics: '[]' }])
  assert.deepEqual(out, [{ topic: 'a', count: 2 }, { topic: 'b', count: 1 }])
})

test('videoRates: CTR and CVR are null when the denominator is 0 or missing', () => {
  const [v] = videoRates([{ id: 'V', video_views: 1000, product_clicks: 20, attributed_orders: 2, completion_rate: 0.4 }])
  assert.equal(v.ctr, 0.02)
  assert.equal(v.cvr, 0.1)
  const [z] = videoRates([{ id: 'Z', video_views: 0, product_clicks: 0, attributed_orders: 0 }])
  assert.equal(z.ctr, null)
  assert.equal(z.cvr, null)
})

test('benchmarkPoints parses string proxies and drops points a log scale cannot draw', () => {
  const pts = benchmarkPoints([
    { id: 'a', views_reported: 1000, sales_reported: 5, sales_per_1000_views_proxy: '5.0' },
    { id: 'b', views_reported: 1000, sales_reported: 0 },
  ])
  assert.equal(pts.length, 1)
  assert.equal(pts[0].perK, 5)
})

test('logAxis pads the domain to [min/2, max*2] and ticks on powers of ten', () => {
  const a = logAxis([117928, 2569411, 0, null, '450000'])
  assert.deepEqual(a.domain, [58964, 5138822])
  assert.deepEqual(a.ticks, [100000, 1000000])
  assert.equal(logAxis([0, -1, null]), null)
})

test('logAxis widens to the enclosing decades when fewer than two powers of ten fit', () => {
  const a = logAxis([375, 423])
  assert.deepEqual(a.domain, [100, 1000])
  assert.deepEqual(a.ticks, [100, 1000])
  for (const v of [375, 423]) assert.ok(v > a.domain[0] && v < a.domain[1])
})

test('datasetDate shows the recorded date or says it was not recorded, never a dash', () => {
  assert.equal(datasetDate({ date: 'crawl 27/10/2026' }), 'crawl 27/10/2026')
  assert.equal(datasetDate({ date: null }), NO_DATE)
  assert.equal(datasetDate({ date: '  ' }), NO_DATE)
  assert.equal(datasetDate(DATASETS.find((d) => d.id === 'benchmarkVideos')), 'lấy từ Clipcat ngày 27/10/2026')
  assert.equal(datasetDate(DATASETS.find((d) => d.id === 'extraction')), NO_DATE)
})

test('crossCount builds one row per first key with counts per second key', () => {
  const { rows, series } = crossCount([{ m: 'x', s: 'p' }, { m: 'x', s: 'q' }, { m: 'y', s: 'p' }], 'm', 's')
  assert.deepEqual(series, ['p', 'q'])
  assert.deepEqual(rows, [{ m: 'x', p: 1, q: 1 }, { m: 'y', p: 1 }])
})

test('competitorChannel separates FastMoss, Shopee via Google and other sites', () => {
  assert.equal(competitorChannel({ platform: 'tiktok_shop' }), 'tiktok')
  assert.equal(competitorChannel({ platform: 'Shopee', provenance: { provider: 'SerpAPI (Google Shopping, Vietnam)' } }), 'shopee')
  assert.equal(competitorChannel({ platform: 'shopee.vn' }), 'shopee')
  assert.equal(competitorChannel({ platform: 'Lazada Vietnam' }), 'google')
})

test('marketSummary counts per channel and like-for-like', () => {
  const s = marketSummary({
    competitors: [
      { platform: 'tiktok_shop', price_vnd: 100, sold_count: 5, like_for_like: true },
      { platform: 'Shopee', price_vnd: 200, sold_count: null, like_for_like: false },
      { platform: 'Lazada', price_vnd: 300, like_for_like: true },
    ],
  })
  assert.equal(s.total, 3)
  assert.equal(s.likeForLike, 2)
  assert.equal(s.withSold, 1)
  assert.equal(s.medianPrice, 200)
  assert.deepEqual(s.channels.map((c) => c.count), [1, 1, 1])
  assert.equal(marketSummary(null).total, 0)
})

test('restrictedRows flattens every list', () => {
  const rows = restrictedRows({ lists: { a: { categories: [{ id: 'x', keywords: ['k1', 'k2'] }] }, b: { categories: [{ id: 'y' }] } } })
  assert.deepEqual(rows.map((r) => [r.list, r.id, r.keywords]), [['a', 'x', 'k1, k2'], ['b', 'y', '']])
})

test('questionWeights sums weight per group and puts ungrouped questions under their type', () => {
  const out = questionWeights([
    { group: 'viral_potential', weight: 1.5, type: 'score' },
    { group: 'viral_potential', weight: 1, type: 'score', asked: false },
    { group: null, weight: 1, type: 'choice' },
  ])
  assert.deepEqual(out, [
    { group: 'viral_potential', weight: 2.5, count: 2, asked: 1 },
    { group: '(choice)', weight: 1, count: 1, asked: 1 },
  ])
})

test('calibration card names a placeholder as a hand-set threshold, not a measurement', () => {
  assert.match(CALIBRATION_STATUS_NOTE, /placeholder = mốc tạm tự đặt, chưa đo/)
})

test('calibration rows and summary keep the three statuses even when absent', () => {
  const rows = calibrationRows({
    constants: { a: { value: 1, unit: 'ratio', status: 'placeholder', source: 's' } },
    data_benchmarks: { b: { status: 'sourced', source: 'crawl', features: ['f'] } },
  })
  assert.deepEqual(rows.map((r) => [r.key, r.kind, r.status]), [['a', 'constant', 'placeholder'], ['b', 'data_benchmark', 'sourced']])
  assert.deepEqual(calibrationSummary(rows), [
    { status: 'placeholder', count: 1 },
    { status: 'sourced', count: 1 },
    { status: 'calibrated', count: 0 },
  ])
})

test('runRows reads the stored backend overall and orders runs by time', () => {
  const runs = runRows([
    { id: 2, createdAt: '2026-10-28T00:00:00', targetId: 'V1', result: { scores: [{ name: 'viral_potential', score: 80, coverage: 1 }], overall: { score: 80, coverage: 1, weights: {} }, options: { decisions: true, extract: 'never' } } },
    { id: 1, createdAt: '2026-10-27T00:00:00', targetId: 'V1', result: { scores: [] } },
  ])
  assert.deepEqual(runs.map((r) => r.id), [1, 2])
  assert.equal(runs[0].overall, null)
  assert.equal(runs[1].overall, 80)
  assert.equal(runs[1].g_viral_potential, 80)
  assert.equal(runs[1].options, 'decisions')
  const { videos, points } = overallSeries(runs)
  assert.deepEqual(videos, ['V1'])
  assert.equal(points[1].V1, 80)
})

test('transcriptRows sorts by start and drops segments without a start', () => {
  const rows = transcriptRows({ transcript_segments: [{ start: 3, end: 4, text: 'b' }, { start: 0, end: 3, text: 'a' }, { text: 'x' }] })
  assert.deepEqual(rows.map((r) => r.text), ['a', 'b'])
})

test('parseLoose reads Python reprs and leaves plain text alone', () => {
  assert.deepEqual(parseLoose("{'female': 0.82, 'male': 0.18}"), { female: 0.82, male: 0.18 })
  assert.deepEqual(parseLoose("['a', 'b']"), ['a', 'b'])
  assert.deepEqual(parseLoose('{"x": None, "y": True}'), { x: null, y: true })
  assert.equal(parseLoose('xin chào'), 'xin chào')
  assert.equal(parseLoose(3), 3)
})

test('platformSpecRows: one row per spec, split by platform and placement, with its status and collection date', () => {
  const payload = {
    provenance: { collected_on: '2026-10-30' },
    specs: {
      'tiktok_ads.in_feed_ads.duration_max.auction_non_spark': { display: 'tối đa 10 phút (600 s)', status: 'official', quote: '10 minutes', source_url: 'https://x', conflict: false },
      'meta.feed_video_ads.duration_min': { display: 'yêu cầu đăng nhập', status: 'login_required', quote: null, source_url: 'https://fb', conflict: false },
    },
  }
  const rows = platformSpecRows(payload)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], {
    id: 'tiktok_ads.in_feed_ads.duration_max.auction_non_spark', platform: 'tiktok_ads', placement: 'in_feed_ads',
    field: 'duration_max.auction_non_spark', status: 'official', display: 'tối đa 10 phút (600 s)', spot_check: null,
    conflict: false, quote: '10 minutes', page_title: null, source_url: 'https://x', accessed: null, collected: '2026-10-30',
  })
  assert.equal(rows[1].status, 'login_required')
  assert.deepEqual(platformSpecRows(null), [])
  assert.ok(DATASETS.some((d) => d.id === 'platformSpecs' && d.py === '/reference/platform_specs'))
})
