// Data atlas: the catalogue of every dataset the lab holds, and the pure transforms its charts and tables
// read. Nothing here invents a number: missing values stay null and are drawn as "–".

import { overallView } from '../lib/overall-view.js'

/** Provenance kinds. REAL / MOCK / INFERRED / MISSING follow the backend; CONFIG and RUN describe atlas rows. */
export const STATUS_META = {
  REAL: { label: 'REAL', hint: 'dữ liệu thật (crawl hoặc nguồn công khai)' },
  MOCK: { label: 'NỘI BỘ', hint: 'dữ liệu shop nội bộ, sinh cho lab' },
  INFERRED: { label: 'INFERRED', hint: 'suy ra từ dữ liệu thật (AI hoặc diễn giải)' },
  MISSING: { label: 'MISSING', hint: 'chưa có dữ liệu' },
  CONFIG: { label: 'CONFIG', hint: 'cấu hình do tác giả đặt, không phải số đo' },
  RUN: { label: 'RUN', hint: 'kết quả pipeline tính từ các nguồn trên' },
}

export const NAV_GROUPS = [
  { id: 'shop', label: 'Shop & SKU' },
  { id: 'video', label: 'Video' },
  { id: 'market', label: 'Thị trường' },
  { id: 'rules', label: 'Policy & chấm điểm' },
  { id: 'runs', label: 'Lượt chạy & trích xuất' },
]

/**
 * One entry per dataset. `collection` = json-server collection (count via X-Total-Count); `scope` says what
 * the "hiện tại / tất cả" toggle narrows to; `status` is the declared kind (rows may carry their own).
 */
export const DATASETS = [
  {
    id: 'shops', group: 'shop', title: 'Shop', collection: 'shops', scope: 'none', status: 'MOCK',
    what: 'Hồ sơ 9 shop: rating, tuổi shop, GMV, đơn, lượt vào shop, tỉ lệ huỷ/hoàn/giao trễ trong 30 ngày.',
    source: 'Dữ liệu shop nội bộ (Shopee), sinh bằng script', file: 'fixtures/shopee_seed/shops.csv (build_seed.py)', date: 'cửa sổ 27/09–26/10/2026',
  },
  {
    id: 'shopDailyMetrics', group: 'shop', title: 'Shop theo ngày', collection: 'shopDailyMetrics', scope: 'shop', status: 'MOCK',
    what: 'GMV, đơn và lượt vào shop theo nguồn (tự nhiên, video, ads) từng ngày trong 30 ngày.',
    source: 'Dữ liệu shop nội bộ (Shopee)', file: 'fixtures/shopee_seed/shop_daily_metrics.csv', date: 'cửa sổ 27/09–26/10/2026',
  },
  {
    id: 'skus', group: 'shop', title: 'SKU', collection: 'skus', scope: 'shop', status: 'MOCK',
    what: 'Sản phẩm của shop: giá bán, giá gốc, giá vốn, tồn kho, rating, số ảnh. Ảnh SKU là ảnh minh hoạ.',
    source: 'Dữ liệu shop nội bộ (Shopee)', file: 'fixtures/shopee_seed/skus.csv · ảnh web/public/skus/', date: 'cửa sổ 27/09–26/10/2026',
  },
  {
    id: 'skuDailyMetrics', group: 'shop', title: 'SKU theo ngày', collection: 'skuDailyMetrics', scope: 'shop', status: 'MOCK',
    what: 'Phễu từng SKU mỗi ngày: hiển thị → xem trang sản phẩm → số đơn, kèm GMV và còn hàng.',
    source: 'Dữ liệu shop nội bộ (Shopee)', file: 'fixtures/shopee_seed/sku_daily_metrics.csv', date: 'cửa sổ 27/09–26/10/2026',
  },
  {
    id: 'skuReviews', group: 'shop', title: 'Đánh giá SKU', collection: 'skuReviews', scope: 'shop', status: 'MOCK',
    what: 'Tóm tắt đánh giá mỗi SKU: số đánh giá, tỉ lệ tích cực, chủ đề phàn nàn.',
    source: 'Dữ liệu shop nội bộ (Shopee)', file: 'fixtures/shopee_seed/sku_reviews_summary.csv', date: 'cửa sổ 27/09–26/10/2026',
  },
  {
    id: 'skuAudience', group: 'shop', title: 'Audience SKU', collection: 'skuAudience', scope: 'shop', status: 'MOCK',
    what: 'Chân dung người mua mỗi SKU: độ tuổi, giới tính, vùng, sở thích.',
    source: 'Dữ liệu nội bộ, sinh bằng script', file: 'fixtures/sku_audience/sku_audience.json (build_audience.py)', date: null,
  },
  {
    id: 'videos', group: 'video', title: 'Video của shop', collection: 'videos', scope: 'shop', status: 'MOCK',
    what: 'Video gắn với SKU: lượt xem, click sản phẩm, đơn, completion. File video là video TikTok Shop thật (Clipcat); số hiệu quả của video trong shop nội bộ là dữ liệu nội bộ, video tải lên là REAL.',
    source: 'Dữ liệu shop nội bộ + video người dùng tải lên', file: 'fixtures/shopee_seed/videos.csv · data/*.mp4', date: null,
  },
  {
    id: 'benchmarkVideos', group: 'video', title: 'Benchmark Clipcat', collection: 'benchmarkVideos', scope: 'shop', status: 'REAL',
    what: 'Video TikTok Shop thật với lượt xem, số bán, GMV do Clipcat báo cáo (chưa kiểm chứng với sàn), loại hook và loại video.',
    // clipcat_details.json `_note`: "Clipcat /api/viral-prompt/detail, fetched 2026-10-27"
    source: 'Clipcat (clipcat.ai), số liệu nền tảng tự báo cáo', file: 'fixtures/clipcat_benchmark/clipcat_video_benchmark_24.csv + clipcat_details.json', date: 'lấy từ Clipcat ngày 27/10/2026',
  },
  {
    id: 'shopeeListings', group: 'video', title: 'Shopee listing', collection: 'shopeeListings', scope: 'shop', status: 'MOCK',
    what: 'Ứng viên listing Shopee cho sản phẩm trong video benchmark: cùng sản phẩm, đối thủ, hoặc combo. Một phần tìm thật qua search snippet, phần còn lại là dữ liệu nội bộ.',
    source: 'search snippet (REAL) + dữ liệu nội bộ (NỘI BỘ)', file: 'fixtures/clipcat_benchmark/public_product_candidates.csv + synthetic_product_listings.csv', date: 'ghi ngày 27/10/2026',
  },
  {
    id: 'marketSnapshots', group: 'market', title: 'Đối thủ & thị trường', collection: 'marketSnapshots', scope: 'shop', status: 'REAL',
    what: 'Mỗi SKU: tối đa 30 listing đối thủ trên Google Shopping (gồm Shopee) và TikTok Shop, cùng số liệu ngành TikTok từ FastMoss.',
    source: 'SerpAPI Google Shopping (gl=vn) + FastMoss product_search (region=VN)', file: 'fixtures/market/market_snapshots.json · docs/market-data-provenance.md', date: 'crawl 27/10/2026',
  },
  {
    id: 'policyRules', group: 'rules', title: 'Policy rules', collection: 'policyRules', scope: 'none', status: 'INFERRED',
    what: '16 rule policy diễn giải từ trang chính sách chính thức của TikTok, TikTok Shop, Shopee, Meta, kèm danh mục hàng hạn chế và danh sách nguồn.',
    source: 'Trang chính sách chính thức, diễn giải lại (không phải văn bản pháp lý)', file: 'fixtures/policy_baseline_v01/rules.json · restricted_categories.json · sources.json', date: 'kiểm tra URL 27/10/2026',
  },
  {
    id: 'questions', group: 'rules', title: 'Bộ câu hỏi Decisions', py: '/questions', scope: 'none', status: 'CONFIG',
    what: 'Câu hỏi gửi Decisions API: nhóm, dimension, kiểu câu, trọng số, 5 mức đánh giá, feature cần có.',
    source: 'Rubric do tác giả viết', file: 'fixtures/decisions_v1/decision_question_bank.json', date: null,
  },
  {
    id: 'calibration', group: 'rules', title: 'Ngưỡng & calibration', py: '/reference/calibration', scope: 'none', status: 'CONFIG',
    what: 'Mọi ngưỡng và benchmark rule scoring dùng, kèm trạng thái: placeholder (mốc tạm tự đặt, chưa đo), sourced (có nguồn), calibrated (khớp với kết quả thật).',
    source: 'Tác giả + dữ liệu crawl có trích nguồn', file: 'fixtures/calibration_v0.json', date: null,
  },
  {
    id: 'platformSpecs', group: 'rules', title: 'Thông số nền tảng', py: '/reference/platform_specs', scope: 'none', status: 'REAL',
    what: 'Thông số video chính thức của TikTok Shop, TikTok Ads, Shopee và Meta: độ dài, tỉ lệ khung, độ phân giải, dung lượng, định dạng, nhạc. Mỗi dòng có trích dẫn và trang nguồn; Meta cần đăng nhập nên chưa có số.',
    source: 'Trang trợ giúp / seller chính thức, thu bằng ChatGPT browsing; 8 trang kiểm tra lại (7 khớp, 1 PDF không đọc được)',
    file: 'fixtures/platform_specs_v1/platform_specs.json · raw/platform_video_specs_vn_2026-10-30.json', date: 'thu thập 30/10/2026',
  },
  {
    id: 'analyses', group: 'runs', title: 'Lịch sử lượt chạy', collection: 'analyses', scope: 'video', status: 'RUN',
    what: 'Các lần phân tích video đã lưu: tuỳ chọn, điểm từng nhóm và điểm tổng theo thời gian.',
    source: 'Pipeline phân tích của lab', file: 'db/db.json → analyses (kind=video_run)', date: 'theo từng lượt chạy (cột createdAt)',
  },
  {
    id: 'extraction', group: 'runs', title: 'Trích xuất video hiện tại', py: '/videos/{id}/features', scope: 'video', status: 'INFERRED',
    what: 'Những gì AI đọc được từ video đang chọn: transcript có mốc giờ, khoảnh khắc chính, JSON của VLM và frame 1 giây/ảnh.',
    source: 'VLM + speech-to-text chạy trên file video thật', file: 'cache trích xuất của video (FastAPI /py/videos/{id}/features)', date: null,
  },
]

export const datasetById = (id) => DATASETS.find((d) => d.id === id) ?? DATASETS[0]

/** One row per platform spec: its status, quote, source page and the collection date from the file. */
export function platformSpecRows(payload) {
  const collected = payload?.provenance?.collected_on ?? null
  return Object.entries(payload?.specs ?? {}).map(([key, s]) => {
    const [platform, placement, ...field] = key.split('.')
    return {
      id: key, platform, placement, field: field.join('.'), status: s.status, display: s.display,
      spot_check: s.spot_check ?? null, conflict: s.conflict === true,
      quote: s.quote ?? null, page_title: s.page_title ?? null, source_url: s.source_url ?? null,
      accessed: s.accessed ?? null, collected,
    }
  })
}

/** Shown when no source file records when the data was collected; a date is never guessed. */
export const NO_DATE = 'chưa ghi ngày thu thập'

/** Collection date of a dataset as recorded by its source, or the explicit "not recorded" label. */
export const datasetDate = (d) => (typeof d?.date === 'string' && d.date.trim() ? d.date : NO_DATE)

// ---------- generic table helpers ----------

const isBlank = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))

/** Count of rows per `source_status`, e.g. {REAL: 1, MOCK: 27}; rows without one are skipped. */
export function statusCounts(rows) {
  const out = {}
  for (const r of rows ?? []) {
    const s = r?.source_status
    if (s) out[s] = (out[s] ?? 0) + 1
  }
  return out
}

/** Union of row keys in first-seen order, `preferred` first; `skip` keys left out. */
export function columnsOf(rows, preferred = [], skip = []) {
  const seen = new Set(preferred)
  const out = [...preferred]
  for (const r of rows ?? []) {
    for (const k of Object.keys(r ?? {})) {
      if (!seen.has(k) && !skip.includes(k)) {
        seen.add(k)
        out.push(k)
      }
    }
  }
  return out.filter((k) => !skip.includes(k))
}

/** Table columns for every key; `num` (right-aligned) when the first present value is a number. */
export function autoColumns(rows, preferred = [], skip = []) {
  return columnsOf(rows, preferred, skip).map((key) => {
    const first = (rows ?? []).map((r) => r?.[key]).find((v) => !isBlank(v))
    return { key, label: key, num: typeof first === 'number' }
  })
}

const sortKey = (v) => {
  if (isBlank(v)) return null
  if (typeof v === 'number' || typeof v === 'boolean') return Number(v)
  if (typeof v === 'string' && v.trim() !== '' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v)
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

/** Stable sort by `key` (or an accessor), numbers numerically, text in Vietnamese order, blanks always last. */
export function sortRows(rows, key, dir = 'asc') {
  if (!key) return [...(rows ?? [])]
  const get = typeof key === 'function' ? key : (r) => r?.[key]
  const sign = dir === 'desc' ? -1 : 1
  return (rows ?? [])
    .map((r, i) => ({ r, i, k: sortKey(get(r)) }))
    .sort((a, b) => {
      if (a.k === null && b.k === null) return a.i - b.i
      if (a.k === null) return 1
      if (b.k === null) return -1
      const c = typeof a.k === 'number' && typeof b.k === 'number' ? a.k - b.k : String(a.k).localeCompare(String(b.k), 'vi')
      return c === 0 ? a.i - b.i : c * sign
    })
    .map((x) => x.r)
}

/** Next sort state when a header is clicked: asc → desc → off. */
export function nextSort(sort, key) {
  if (sort?.key !== key) return { key, dir: 'asc' }
  if (sort.dir === 'asc') return { key, dir: 'desc' }
  return { key: null, dir: 'asc' }
}

export const toNumber = (v) => {
  if (isBlank(v)) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function median(values) {
  const xs = (values ?? []).map(toNumber).filter((n) => n != null).sort((a, b) => a - b)
  if (!xs.length) return null
  const m = Math.floor(xs.length / 2)
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2
}

export const safeRatio = (a, b) => {
  const x = toNumber(a)
  const y = toNumber(b)
  return x == null || !y ? null : x / y
}

// ---------- shop / SKU ----------

const DAILY_SUM_KEYS = [
  'shop_visits', 'visits_ads', 'visits_video', 'visits_organic', 'product_page_views', 'paid_orders',
  'canceled_orders', 'returned_orders', 'gmv_vnd', 'ads_orders', 'ads_gmv_vnd', 'ads_spend_vnd', 'voucher_cost_vnd',
]

/** Shop daily rows summed per date across shops (the "tất cả" view), oldest first. */
export function sumDailyByDate(rows) {
  const byDate = new Map()
  for (const r of rows ?? []) {
    const acc = byDate.get(r.date) ?? { date: r.date, shops: 0 }
    acc.shops += 1
    for (const k of DAILY_SUM_KEYS) {
      const n = toNumber(r[k])
      if (n != null) acc[k] = (acc[k] ?? 0) + n
    }
    byDate.set(r.date, acc)
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

/** Price ladder per SKU: original price, selling price, cost, unit margin and discount. */
export function priceRows(skus) {
  return (skus ?? []).map((s) => {
    const price = toNumber(s.price_vnd)
    const original = toNumber(s.original_price_vnd)
    const cost = toNumber(s.cost_vnd)
    return {
      sku_id: s.sku_id ?? s.id,
      name: s.item_name ?? s.sku_id ?? s.id,
      price,
      original,
      cost,
      margin: price != null && cost != null ? price - cost : null,
      discount: price != null && original ? 1 - price / original : null,
      stock: toNumber(s.stock),
    }
  })
}

/** Funnel totals of SKU daily rows: impressions → page views → units, with the step rates. */
export function funnelTotals(rows) {
  const sum = (k) => {
    const xs = (rows ?? []).map((r) => toNumber(r[k])).filter((n) => n != null)
    return xs.length ? xs.reduce((a, b) => a + b, 0) : null
  }
  const impressions = sum('impressions')
  const views = sum('product_page_views')
  const units = sum('units_ordered')
  return [
    { step: 'Hiển thị', key: 'impressions', value: impressions, rate: null },
    { step: 'Xem trang SP', key: 'product_page_views', value: views, rate: safeRatio(views, impressions) },
    { step: 'Đơn (units)', key: 'units_ordered', value: units, rate: safeRatio(units, views) },
  ]
}

/** `negative_topics` arrives as a JSON string ("[]") or an array; anything unreadable is one raw topic. */
export function parseTopics(value) {
  if (Array.isArray(value)) return value.map(String)
  if (isBlank(value)) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)]
  } catch {
    return [String(value)]
  }
}

/** How many SKUs mention each negative topic, most frequent first. */
export function topicCounts(reviews) {
  const counts = new Map()
  for (const r of reviews ?? []) for (const t of new Set(parseTopics(r.negative_topics))) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
}

/** {label: share} object → [{label, value}] in the stored order (age bands keep their natural order). */
export const shareRows = (obj) =>
  Object.entries(obj ?? {}).map(([label, value]) => ({ label, value: toNumber(value) }))

// ---------- videos ----------

/** Per-video rates: product CTR (clicks / views), click → order CVR, completion. */
export function videoRates(videos) {
  return (videos ?? []).map((v) => ({
    id: v.id,
    label: v.product_label ?? v.id,
    status: v.source_status ?? null,
    views: toNumber(v.video_views),
    clicks: toNumber(v.product_clicks),
    orders: toNumber(v.attributed_orders),
    ctr: safeRatio(v.product_clicks, v.video_views),
    cvr: safeRatio(v.attributed_orders, v.product_clicks),
    completion: toNumber(v.completion_rate),
  }))
}

/** Benchmark points for the views × sales scatter; rows without both numbers are left out. */
export function benchmarkPoints(rows) {
  return (rows ?? [])
    .map((b) => ({
      id: b.id,
      label: b.video_label ?? b.id,
      views: toNumber(b.views_reported),
      sales: toNumber(b.sales_reported),
      perK: toNumber(b.sales_per_1000_views_proxy),
      flag: b.review_flag ?? null,
      hook: b.hook_type ?? null,
      type: b.video_type ?? null,
    }))
    .filter((p) => p.views != null && p.views > 0 && p.sales != null && p.sales > 0)
}

/** Fewest points a shop-scoped scatter needs before the chart falls back to every benchmark video. */
export const MIN_SCATTER_POINTS = 5

const decades = (lo, hi) => Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => 10 ** (lo + i))

/**
 * Log axis over the positive values: domain padded to [min / 2, max * 2] so no dot sits on an edge, ticks on
 * powers of ten. When fewer than two powers of ten fall inside, the domain widens to the enclosing decades.
 * null when there is nothing positive to draw.
 */
export function logAxis(values) {
  const xs = (values ?? []).map(toNumber).filter((n) => n != null && n > 0)
  if (!xs.length) return null
  const domain = [Math.min(...xs) / 2, Math.max(...xs) * 2]
  const ticks = decades(Math.ceil(Math.log10(domain[0])), Math.floor(Math.log10(domain[1])))
  if (ticks.length >= 2) return { domain, ticks }
  const lo = Math.floor(Math.log10(domain[0]))
  const hi = Math.max(lo + 1, Math.ceil(Math.log10(domain[1])))
  return { domain: [10 ** lo, 10 ** hi], ticks: decades(lo, hi) }
}

/** Rows counted by two keys, e.g. listings by match_type × source: [{[a]: value, [b1]: n, [b2]: n}]. */
export function crossCount(rows, a, b) {
  const keysB = new Set()
  const byA = new Map()
  for (const r of rows ?? []) {
    const ka = r?.[a] ?? '(trống)'
    const kb = r?.[b] ?? '(trống)'
    keysB.add(kb)
    const acc = byA.get(ka) ?? { [a]: ka }
    acc[kb] = (acc[kb] ?? 0) + 1
    byA.set(ka, acc)
  }
  return { rows: [...byA.values()], series: [...keysB] }
}

// ---------- market ----------

export const CHANNELS = {
  tiktok: 'TikTok Shop (FastMoss)',
  shopee: 'Shopee (qua Google Shopping)',
  google: 'Web khác (Google Shopping)',
}

/** Where a competitor row came from: FastMoss rows are TikTok Shop, SerpAPI rows split into Shopee / other. */
export function competitorChannel(c) {
  const platform = String(c?.platform ?? '').toLowerCase()
  const provider = String(c?.provenance?.provider ?? '')
  if (platform === 'tiktok_shop' || provider.startsWith('FastMoss')) return 'tiktok'
  if (platform.includes('shopee')) return 'shopee'
  return 'google'
}

/** Competitor rows of a snapshot, flattened for charts and the table. */
export function competitorRows(snapshot) {
  return (snapshot?.competitors ?? []).map((c, i) => ({
    i,
    channel: competitorChannel(c),
    platform: c.platform ?? null,
    title: c.title ?? null,
    shop: c.shop ?? null,
    price: toNumber(c.price_vnd),
    sold: toNumber(c.sold_count),
    soldWindow: c.sold_window ?? null,
    rating: toNumber(c.rating),
    reviews: toNumber(c.review_count),
    likeForLike: c.like_for_like ?? null,
    url: c.url ?? null,
    provider: c.provenance?.provider ?? null,
    capturedAt: c.provenance?.captured_at ?? null,
    rawFile: c.provenance?.raw_file ?? null,
  }))
}

/** Counts and price median per channel, plus like-for-like totals. */
export function marketSummary(snapshot) {
  const rows = competitorRows(snapshot)
  const channels = Object.keys(CHANNELS).map((ch) => {
    const xs = rows.filter((r) => r.channel === ch)
    return { channel: ch, label: CHANNELS[ch], count: xs.length, likeForLike: xs.filter((r) => r.likeForLike).length, medianPrice: median(xs.map((r) => r.price)) }
  })
  return {
    total: rows.length,
    likeForLike: rows.filter((r) => r.likeForLike).length,
    withSold: rows.filter((r) => r.sold != null).length,
    medianPrice: median(rows.map((r) => r.price)),
    channels,
  }
}

// ---------- rules ----------

/** Policy rules counted per platform and severity: [{platform, critical: n, high: n, ...}]. */
export function rulesByPlatform(rules) {
  const rows = []
  for (const r of rules ?? []) for (const p of r.platforms ?? ['(không rõ)']) rows.push({ platform: p, severity: r.severity ?? '(không rõ)' })
  return crossCount(rows, 'platform', 'severity')
}

/** Restricted category lists flattened: one row per category with its list and source ids. */
export function restrictedRows(ref) {
  const out = []
  for (const [list, body] of Object.entries(ref?.lists ?? {})) {
    for (const c of body?.categories ?? []) {
      out.push({
        list,
        id: c.id,
        label_vi: c.label_vi ?? null,
        status: c.status ?? null,
        source_id: c.source_id ?? null,
        source_text: c.source_text ?? null,
        verification: c.verification ?? null,
        keywords: (c.keywords ?? []).join(', '),
      })
    }
  }
  return out
}

/** Sources of the restricted lists, de-duplicated by source_id (urls the categories cite). */
export function restrictedSources(ref) {
  const seen = new Map()
  for (const [list, body] of Object.entries(ref?.lists ?? {})) {
    for (const s of body?.sources ?? []) if (!seen.has(s.source_id)) seen.set(s.source_id, { list, ...s })
  }
  return [...seen.values()]
}

/** Weight and question count per group (choice / predicate questions without a group fall under their type). */
export function questionWeights(questions) {
  const by = new Map()
  for (const q of questions ?? []) {
    const key = q.group ?? `(${q.type ?? 'khác'})`
    const acc = by.get(key) ?? { group: key, weight: 0, count: 0, asked: 0 }
    acc.weight += toNumber(q.weight) ?? 0
    acc.count += 1
    if (q.asked !== false) acc.asked += 1
    by.set(key, acc)
  }
  return [...by.values()].map((g) => ({ ...g, weight: Math.round(g.weight * 100) / 100 }))
}

/** Calibration file → rows: constants and data benchmarks, each with value, unit, status and source. */
export function calibrationRows(cal) {
  const rows = []
  for (const [key, c] of Object.entries(cal?.constants ?? {})) {
    rows.push({ key, kind: 'constant', value: c?.value ?? null, unit: c?.unit ?? null, status: c?.status ?? null, source: c?.source ?? null, note: c?.note ?? null })
  }
  for (const [key, c] of Object.entries(cal?.data_benchmarks ?? {})) {
    rows.push({ key, kind: 'data_benchmark', value: c?.features ?? null, unit: null, status: c?.status ?? null, source: c?.source ?? null, note: c?.note ?? null })
  }
  return rows
}

export const CALIBRATION_STATUSES = ['placeholder', 'sourced', 'calibrated']

/** How the calibration card words each status: a placeholder is a figure the author set, not a measurement. */
export const CALIBRATION_STATUS_NOTE = 'placeholder = mốc tạm tự đặt, chưa đo từ dữ liệu; sourced = có nguồn; calibrated = khớp kết quả thật.'

/** Count per calibration status, always listing the three known statuses (0 when absent). */
export function calibrationSummary(rows) {
  const counts = Object.fromEntries(CALIBRATION_STATUSES.map((s) => [s, 0]))
  for (const r of rows ?? []) counts[r.status ?? 'unknown'] = (counts[r.status ?? 'unknown'] ?? 0) + 1
  return Object.entries(counts).map(([status, count]) => ({ status, count }))
}

// ---------- runs ----------

/** One summary row per saved video run: stored overall (lib/overall-view), group scores, options. */
export function runRows(analyses) {
  return (analyses ?? [])
    .map((a) => {
      const r = a?.result ?? {}
      const scores = Array.isArray(r.scores) ? r.scores : []
      const groups = Object.fromEntries(scores.map((g) => [g.name, toNumber(g.score)]))
      const o = overallView(r.overall) ?? { overall: null, coverage: null }
      const opts = r.options ?? a.options ?? null
      return {
        id: a.id,
        createdAt: a.createdAt ?? null,
        video: a.targetId ?? r.video_id ?? null,
        rubric: r.rubric ?? null,
        overall: o.overall,
        coverage: o.coverage ?? null,
        quality: r.quality_gate?.status ?? r.verdict?.quality_gate ?? null,
        options: opts ? Object.entries(opts).filter(([, v]) => v && v !== 'never').map(([k, v]) => (v === true ? k : `${k}=${v}`)).join(', ') : null,
        ...Object.fromEntries(Object.entries(groups).map(([k, v]) => [`g_${k}`, v])),
      }
    })
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || Number(a.id) - Number(b.id))
}

/** Runs pivoted for a line chart: one point per run, one key per video holding its overall score. */
export function overallSeries(runs) {
  const videos = [...new Set((runs ?? []).map((r) => r.video))]
  const points = (runs ?? []).map((r) => ({ id: r.id, createdAt: r.createdAt, [r.video]: r.overall }))
  return { videos, points }
}

// ---------- extraction ----------

/** Transcript segments with numeric start/end, in time order. */
export function transcriptRows(features) {
  return (features?.transcript_segments ?? [])
    .map((s, i) => ({ i, start: toNumber(s.start), end: toNumber(s.end), text: s.text ?? '' }))
    .filter((s) => s.start != null)
    .sort((a, b) => a.start - b.start)
}

/** VLM key moments, in time order. */
export function keyMomentRows(features) {
  return (features?.features?.key_moments ?? [])
    .map((m, i) => ({ i, sec: toNumber(m.timestamp_sec), event: m.event ?? '', description: m.description ?? '' }))
    .sort((a, b) => (a.sec ?? 0) - (b.sec ?? 0))
}

// ---------- loose values ----------

/**
 * Seed CSV columns hold Python reprs ("{'female': 0.82}", "['a', 'b']", "True"). Parsed to JSON values when
 * possible; anything else comes back as given.
 */
export function parseLoose(value) {
  if (typeof value !== 'string') return value
  const t = value.trim()
  if (!/^[[{]/.test(t)) return value
  try {
    return JSON.parse(t)
  } catch {
    try {
      return JSON.parse(t.replace(/'/g, '"').replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false'))
    } catch {
      return value
    }
  }
}

// ---------- gaps ----------

/** Data the lab does not hold yet, what each would unlock, and where it could come from. Shown as MISSING. */
export const DATA_GAPS = [
  { id: 'review_text', title: 'Nội dung đánh giá thật', unlocks: 'Chủ đề khen/chê thật của người mua thay cho tóm tắt nội bộ; đối chiếu claim trong video với phản hồi thật.', source: 'Trang đánh giá sản phẩm Shopee / TikTok Shop (công khai theo item) hoặc export Seller Centre', effort: 'Trung bình' },
  { id: 'listing_images', title: 'Ảnh listing đối thủ', unlocks: 'So sánh ảnh bìa, số ảnh, chữ trên ảnh với SKU của shop.', source: 'URL ảnh trong kết quả SerpAPI / FastMoss đã cào', effort: 'Thấp' },
  { id: 'competitor_videos', title: 'Video của đối thủ cùng SKU', unlocks: 'Benchmark hook, độ dài, CTA của video đang bán tốt cho cùng sản phẩm.', source: 'FastMoss tìm video theo product_id đã có', effort: 'Trung bình' },
  { id: 'ads_data', title: 'Dữ liệu quảng cáo theo video', unlocks: 'ROAS và CPA từng video, biết video nào đáng chạy ads.', source: 'Export TikTok Ads / Shopee Ads của shop', effort: 'Cao (cần quyền shop)' },
  { id: 'retention_curve', title: 'Đường giữ chân người xem', unlocks: 'Biết người xem rời video ở giây nào, khớp với marker trên timeline.', source: 'Export analytics TikTok Studio', effort: 'Cao (cần quyền shop)' },
  { id: 'trends', title: 'Xu hướng tìm kiếm theo mùa', unlocks: 'Chọn thời điểm đăng và từ khoá caption theo nhu cầu đang lên.', source: 'Google Trends (VN) theo từ khoá SKU', effort: 'Thấp' },
  { id: 'price_history', title: 'Lịch sử giá đối thủ', unlocks: 'Thấy đối thủ giảm giá theo đợt sale, không chỉ một ảnh chụp ngày 27/10.', source: 'Cào lại snapshot thị trường theo lịch (hằng tuần)', effort: 'Thấp' },
  { id: 'outcomes', title: 'Kết quả thật sau khi sửa video', unlocks: 'Calibrate ngưỡng điểm bằng số bán thật trước và sau khi áp dụng fix.', source: 'Theo dõi video đăng lại qua dashboard shop', effort: 'Cao (cần thời gian)' },
]
