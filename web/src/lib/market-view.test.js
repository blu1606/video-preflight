import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fmtDate, marketView } from './market-view.js'

const snap = {
  sku_id: 'S1',
  crawled_at: '2026-10-27',
  tiktok: { keyword: 'xà phòng', video_count: 24459, units_28d: 142478, units_7d: 36933 },
  competitors: [
    { platform: 'tiktok_shop', title: 'A', price_vnd: 59082, sold_count: 92574, linked_video_count: 14157, linked_creator_count: 3693, like_for_like: true, fastmoss_url: 'f', tiktok_url: 't' },
    { platform: 'shopee.vn', title: 'B', price_vnd: 56050, sold_count: null, like_for_like: true },
    { platform: 'tiktok_shop', title: 'C', price_vnd: 9000, sold_count: 5, like_for_like: false },
  ],
}

test('like-for-like rows only; Google Shopping only in the price chart', () => {
  const v = marketView(snap)
  assert.deepEqual(v.priceRows.map((r) => [r.title, r.source]), [['B', 'Google Shopping'], ['A', 'FastMoss']])
  assert.deepEqual(v.soldRows.map((r) => [r.title, r.sold, r.videos, r.creators]), [['A', 92574, 14157, 3693]])
  assert.deepEqual(v.market, { videoCount: 24459, units28d: 142478, units7d: 36933 })
  assert.equal(v.likeCount, 2)
  assert.equal(marketView(null), null)
  assert.equal(fmtDate('2026-10-27'), '27/10/2026')
})
