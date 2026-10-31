// Phone preview skins: the feed chrome the viewer sees around the video. A skin is a look, not a publishing
// choice: post.platforms decides what is posted; the skin in view only changes what the preview draws.

export const PREVIEW_SKINS = [
  { id: 'shopee', name: 'Shopee Video', brand: 'shopee', target: 'shopee_listing', note: 'Giỏ hàng gốc · mua ngay trong video' },
  { id: 'tiktok', name: 'TikTok Shop video', brand: 'tiktok', target: 'tiktok_shop_video', note: 'Giỏ hàng TikTok Shop · mua trong app' },
  { id: 'tiktok-ads', name: 'TikTok Ads', brand: 'tiktok', target: 'tiktok_ads', note: 'Quảng cáo in-feed · nút Mua ngay' },
  { id: 'fb', name: 'Facebook Reels', brand: 'fb', target: 'meta_ads', note: 'Không có giỏ hàng · link affiliate sang Shopee' },
  { id: 'ig', name: 'Instagram Reels', brand: 'ig', target: 'meta_ads', note: 'Không có giỏ hàng · thẻ sản phẩm dẫn ra website' },
]

const DEFAULT_SKIN = 'shopee'

// Meta Ads opens on Facebook Reels; the viewer picks Instagram Reels from the same target.
const TARGET_SKIN = { shopee_listing: 'shopee', tiktok_shop_video: 'tiktok', tiktok_ads: 'tiktok-ads', meta_ads: 'fb' }

export function skinById(id) {
  return PREVIEW_SKINS.find((s) => s.id === id) ?? null
}

export function skinForTarget(target) {
  return TARGET_SKIN[target] ?? null
}

/** The skin a video opens on: its first posting platform, else Shopee. */
export function defaultSkin(platforms) {
  return (platforms ?? []).map(skinForTarget).find(Boolean) ?? DEFAULT_SKIN
}

/** The content score the skin's platform shows (platformView rows); null when the platform has none. */
export function skinScore(rows, skinId) {
  const target = skinById(skinId)?.target
  const row = (rows ?? []).find((r) => r.id === target)
  return row?.content == null ? null : Math.round(row.content)
}
