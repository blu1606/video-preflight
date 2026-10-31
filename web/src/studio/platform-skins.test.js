import assert from 'node:assert/strict'
import { test } from 'node:test'

import { defaultSkin, skinById, skinForTarget, skinScore } from './platform-skins.js'

test('skinForTarget: each publishing target opens its own skin, Meta Ads opens on Facebook', () => {
  assert.equal(skinForTarget('shopee_listing'), 'shopee')
  assert.equal(skinForTarget('tiktok_shop_video'), 'tiktok')
  assert.equal(skinForTarget('tiktok_ads'), 'tiktok-ads')
  assert.equal(skinForTarget('meta_ads'), 'fb')
  assert.equal(skinForTarget('unknown_target'), null)
})

test('defaultSkin: first posting platform with a skin, else Shopee', () => {
  assert.equal(defaultSkin(['tiktok_shop_video', 'shopee_listing']), 'tiktok')
  assert.equal(defaultSkin(['meta_ads']), 'fb')
  assert.equal(defaultSkin(['unknown_target', 'tiktok_ads']), 'tiktok-ads')
  assert.equal(defaultSkin([]), 'shopee')
  assert.equal(defaultSkin(undefined), 'shopee')
})

test('skinById: known ids only', () => {
  assert.equal(skinById('ig').name, 'Instagram Reels (Meta Ads)')
  assert.equal(skinById('x'), null)
})

test('skinScore: rounds the content score of the skin platform, Facebook and Instagram share meta_ads', () => {
  const rows = [
    { id: 'tiktok_shop_video', content: 80.4 },
    { id: 'meta_ads', content: 62.5 },
    { id: 'shopee_listing', content: null },
  ]
  assert.equal(skinScore(rows, 'tiktok'), 80)
  assert.equal(skinScore(rows, 'fb'), 63)
  assert.equal(skinScore(rows, 'ig'), 63)
  assert.equal(skinScore(rows, 'shopee'), null)
  assert.equal(skinScore(rows, 'tiktok-ads'), null)
  assert.equal(skinScore(undefined, 'fb'), null)
})
