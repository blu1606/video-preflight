import assert from 'node:assert/strict'
import { test } from 'node:test'

import { categoryLabel, gmvTrend, rowsByShop } from './shop-trend.js'

const day = (i, gmv) => ({ shop_id: 'S1', date: `2026-10-${String(i).padStart(2, '0')}`, gmv_vnd: gmv })

test('gmvTrend compares the last 7 days with the 7 days before', () => {
  const rows = []
  for (let i = 1; i <= 14; i += 1) rows.push(day(i, i > 7 ? 100 : 80))
  const t = gmvTrend(rows)
  assert.equal(t.current, 700)
  assert.equal(t.previous, 560)
  assert.equal(t.direction, 'up')
  assert.ok(Math.abs(t.change - 0.25) < 1e-9)
})

test('gmvTrend reports a down direction and ignores row order', () => {
  const rows = []
  for (let i = 1; i <= 14; i += 1) rows.push(day(i, i > 7 ? 50 : 100))
  rows.reverse()
  assert.equal(gmvTrend(rows).direction, 'down')
})

test('gmvTrend returns null with fewer than 14 days, so the UI shows no trend', () => {
  assert.equal(gmvTrend([day(1, 10), day(2, 10)]), null)
})

test('rowsByShop groups by shop_id', () => {
  const map = rowsByShop([{ shop_id: 'A' }, { shop_id: 'B' }, { shop_id: 'A' }])
  assert.equal(map.get('A').length, 2)
  assert.equal(map.get('B').length, 1)
})

test('categoryLabel falls back to the raw code', () => {
  assert.equal(categoryLabel('beauty'), 'Làm đẹp')
  assert.equal(categoryLabel('unknown_code'), 'unknown_code')
})
