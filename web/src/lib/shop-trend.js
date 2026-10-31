// Pure helpers for the Operate screens. Numbers come from the synthetic shop daily metrics and are only
// arithmetic on them: no score, no verdict.

export const MAIN_CATEGORY_LABEL = {
  beauty: 'Làm đẹp',
  fashion: 'Thời trang',
  home: 'Gia dụng',
  household: 'Đồ gia dụng',
  general: 'Tổng hợp',
  mother_baby: 'Mẹ & bé',
  electronics: 'Điện tử',
  electronics_accessories: 'Phụ kiện điện tử',
  health_fitness: 'Sức khỏe & thể thao',
}

export function categoryLabel(code) {
  return MAIN_CATEGORY_LABEL[code] ?? code ?? 'Chưa rõ ngành'
}

/**
 * GMV of the last 7 days against the 7 days before, from one shop's daily rows.
 * Returns null when there are not 14 days of rows: the UI then says "chưa đủ dữ liệu" instead of a trend.
 */
export function gmvTrend(rows) {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  if (sorted.length < 14) return null
  const sum = (part) => part.reduce((total, r) => total + Number(r.gmv_vnd ?? 0), 0)
  const current = sum(sorted.slice(0, 7))
  const previous = sum(sorted.slice(7, 14))
  if (previous <= 0) return null
  const change = (current - previous) / previous
  return { current, previous, change, direction: change < 0 ? 'down' : 'up' }
}

/** Shop daily rows grouped by shop id. */
export function rowsByShop(rows) {
  const map = new Map()
  for (const r of rows ?? []) {
    const id = r.shop_id ?? r.shopId
    if (!map.has(id)) map.set(id, [])
    map.get(id).push(r)
  }
  return map
}
