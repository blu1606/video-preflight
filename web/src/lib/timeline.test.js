import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  activeRegions,
  activeSegmentIndex,
  crossedMarkers,
  fmtTime,
  highlightClaims,
  isRangeMarker,
  issueHint,
  parseTimestamp,
  position,
  safeZoneWarning,
  splitLanes,
} from './timeline.js'

const { result } = JSON.parse(readFileSync(new URL('./fixtures/shop001-vid01-run.json', import.meta.url), 'utf-8'))

test('window issues are bars; hover text names the range and the transcript line', () => {
  const opening = { kind: 'issue', precise: false, t_start: 0, t_end: 3, title: 'Hook', time_label: 'Cả đoạn mở đầu 0–3s' }
  assert.equal(isRangeMarker(opening), true)
  assert.equal(isRangeMarker({ ...opening, precise: true, t_end: null }), false)
  assert.equal(isRangeMarker({ ...opening, kind: 'ghost' }), false)
  assert.equal(issueHint(opening), 'Hook · Cả đoạn mở đầu 0–3s')
  assert.equal(issueHint({ title: 'Speech', quote: { t: 9, text: 'giảm 90%' } }), 'Speech · “giảm 90%” 00:09')
})

test('safe-zone warning names the overlays a box sits under', () => {
  assert.equal(safeZoneWarning({ covered_by: ['thanh điều hướng dưới', 'caption và nhạc'] }),
    'có thể bị che bởi thanh điều hướng dưới, caption và nhạc khi đăng')
  assert.equal(safeZoneWarning({ covered_by: [] }), '')
  assert.equal(safeZoneWarning(undefined), '')
})

test('fmtTime and parseTimestamp', () => {
  assert.equal(fmtTime(75.4), '01:15')
  assert.equal(fmtTime(null), '–')
  assert.deepEqual(parseTimestamp('00:36 before/after comparison'), { start: 36, end: null })
  assert.deepEqual(parseTimestamp('00:05-00:36'), { start: 5, end: 36 })
  assert.equal(parseTimestamp('no detector yet'), null)
  assert.equal(parseTimestamp(undefined), null)
})

test('real markers split into lanes: TTA-001 at 0s and 3s, TTA-002 at 36s, beats and cuts', () => {
  const { lanes, beats, cuts } = splitLanes(result.markers)
  const policyAt = (rule) => lanes.policy.filter((m) => m.source.ref === rule).map((m) => m.t_start)
  assert.ok(policyAt('TTA-001').includes(0))
  assert.ok(policyAt('TTA-001').includes(3))
  assert.deepEqual(policyAt('TTA-002'), [36])
  assert.ok(lanes.conversion.some((m) => m.kind === 'ghost' && m.id === 'ghost:cta'))
  assert.ok(beats.length >= 3)
  assert.equal(cuts.length, 8)
  assert.deepEqual(splitLanes(undefined).beats, [])
})

test('position clamps', () => {
  assert.equal(position(19.35, 38.7), 0.5)
  assert.equal(position(50, 38.7), 1)
  assert.equal(position(5, 0), 0)
})

test('region shows within ±0.75s of its frame and only with a box', () => {
  const markers = [
    { id: 'a', region: { box: [0.1, 0.1, 0.2, 0.2], frame_sec: 3 } },
    { id: 'b', region: { box: null, frame_sec: 3 } },
    { id: 'c' },
  ]
  assert.deepEqual(activeRegions(markers, 3.7).map((m) => m.id), ['a'])
  assert.deepEqual(activeRegions(markers, 3.8), [])
})

test('coach mode stops at markers crossed while playing, not when seeking', () => {
  const markers = result.markers
  assert.deepEqual(crossedMarkers(markers, 2.8, 3.1).map((m) => m.id), ['policy:tiktok_ads:TTA-001:3'])
  assert.deepEqual(crossedMarkers(markers, 0, 30), [])
  assert.deepEqual(crossedMarkers(markers, 4.3, 4.5), []) // a cut is not a stop
})

test('transcript: active segment and absolute-claim highlight', () => {
  const segments = [{ start: 0, end: 3.5, text: 'A' }, { start: 3.5, end: 4.1, text: 'B' }]
  assert.equal(activeSegmentIndex(segments, 3.6), 1)
  assert.equal(activeSegmentIndex(segments, 10), -1)
  const parts = highlightClaims('Ê, tao xài rồi, trắng thật nha', [{ text: 'trắng thật' }])
  assert.deepEqual(parts.map((p) => p.claim), [false, true, false])
  assert.equal(parts[1].text, 'trắng thật')
  assert.deepEqual(highlightClaims('Hehehe', [{ text: 'trắng' }]), [{ text: 'Hehehe', claim: false }])
  assert.deepEqual(highlightClaims('tắm xong trắng', ['Tao mua về tắm xong trắng, mẹ tao']), [{ text: 'tắm xong trắng', claim: true }])
})

test('criterion marker titles show the Vietnamese dimension label', () => {
  const hint = issueHint({ title: 'Cần cải thiện: Cta clarity (C08) · 4/100', time_label: null })
  assert.equal(hint, 'Cần cải thiện: CTA rõ ràng (C08) · 4/100')
  assert.equal(issueHint({ title: 'Policy TTA-001 · cần xem lại' }), 'Policy TTA-001 · cần xem lại')
})
