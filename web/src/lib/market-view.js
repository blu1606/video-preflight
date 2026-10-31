// Crawled market snapshot (marketSnapshots/{sku_id}) -> chart rows. FastMoss rows (TikTok Shop) carry
// price, 28-day units, videos and creators; SerpAPI/Google Shopping rows only carry a price, so they only
// feed the price chart. Only "like for like" listings are charted, as the backend scores with those.

const short = (title, n = 28) => (title && title.length > n ? `${title.slice(0, n - 1)}…` : (title ?? ''))

export const isFastMoss = (c) => c?.platform === 'tiktok_shop'

/** "2026-10-27" -> "27/10/2026" */
export const fmtDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : (d ?? '–'))

export function marketView(snapshot) {
  if (!snapshot) return null
  const all = snapshot.competitors ?? []
  const like = all.filter((c) => c.like_for_like)
  const priceRows = like
    .filter((c) => c.price_vnd != null)
    .map((c, i) => ({ key: `${c.platform}-${i}`, name: short(c.title), title: c.title, price: c.price_vnd, source: isFastMoss(c) ? 'FastMoss' : 'Google Shopping', shop: c.shop }))
    .sort((a, b) => a.price - b.price)
  const soldRows = like
    .filter((c) => isFastMoss(c) && c.sold_count != null)
    .map((c, i) => ({
      key: `tt-${i}`,
      name: short(c.title),
      title: c.title,
      sold: c.sold_count,
      units7d: c.units_7d ?? null,
      videos: c.linked_video_count ?? null,
      creators: c.linked_creator_count ?? null,
      fastmoss_url: c.fastmoss_url ?? null,
      tiktok_url: c.tiktok_url ?? null,
    }))
    .sort((a, b) => b.sold - a.sold)
  const tt = snapshot.tiktok ?? null
  return {
    skuId: snapshot.sku_id,
    keyword: tt?.keyword ?? snapshot.keyword,
    crawledAt: snapshot.crawled_at,
    priceRows,
    soldRows,
    market: tt ? { videoCount: tt.video_count ?? null, units28d: tt.units_28d ?? null, units7d: tt.units_7d ?? null } : null,
    own: tt?.own_product ?? null,
    hasFastMoss: all.some(isFastMoss),
    hasSerp: all.some((c) => !isFastMoss(c)),
    total: all.length,
    likeCount: like.length,
  }
}
