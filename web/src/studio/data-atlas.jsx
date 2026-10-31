import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'

import { useFetch } from '../hooks/use-fetch'
import { compactNum, compactVnd, db, num, pct, py, showValue, vnd } from '../lib/api'
import { GROUP_LABELS } from '../lib/labels'
import {
  CHANNELS, DATASETS, DATA_GAPS, MIN_SCATTER_POINTS, NAV_GROUPS, STATUS_META, autoColumns, benchmarkPoints,
  CALIBRATION_STATUS_NOTE, calibrationRows, calibrationSummary, competitorRows, crossCount, datasetById, datasetDate, funnelTotals, keyMomentRows,
  platformSpecRows, logAxis, marketSummary, nextSort,
  overallSeries, parseLoose, priceRows, questionWeights, restrictedRows, restrictedSources, rulesByPlatform, runRows,
  shareRows, sortRows, statusCounts, sumDailyByDate, toNumber, topicCounts, transcriptRows, videoRates,
} from './data-atlas-model'
import { Icon } from './icon'
import './data-atlas.css'

// The mockup-v2 world: ink, accent, critical, pass and greys only (no blue / amber). `soft` = accent at a lighter
// tone for a second accent series; `grey` / `light` = muted series.
const C = { accent: '#ee4d2d', soft: '#f5a08f', ink: '#212121', pass: '#1a7f37', critical: '#d0011b', muted: '#757575', grey: '#9e9e9e', light: '#c7c7c7' }
const SERIES = [C.accent, C.ink, C.pass, C.grey, C.critical, C.soft]
const SEVERITY = { critical: C.critical, high: C.accent, medium: C.soft, low: C.grey }
const CHANNEL_COLOR = { tiktok: C.ink, shopee: C.accent, google: C.grey }
const GAPS_ID = 'gaps'
// id / code columns never wrap, so "SHOP001-SKU03" stays one readable token
const ID_KEY = /(^id$|_id$|Id$|^key$|code|^sku|^date$|At$|_at$)/
const PAGE = 50
const axis = { fontSize: 13, fill: '#616161' }
const axisLabel = (value, position) => ({ value, position, fill: '#212121', fontSize: 13, fontWeight: 600 })
const mmss = (s) => (s == null ? '–' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`)

/** Row count of a json-server collection (X-Total-Count) without downloading it. */
async function countOf(collection) {
  const res = await fetch(`/api/${collection}?_limit=1`)
  return res.ok ? Number(res.headers.get('X-Total-Count') ?? 0) : null
}

/** Rows of a dataset for the chosen scope: the selected shop / video, or everything. */
async function loadDataset(d, { all, shopId, videoId }) {
  const q = (s) => `?${new URLSearchParams(s)}`
  switch (d.id) {
    case 'questions': {
      const bank = await py('/questions')
      return { rows: bank.questions ?? bank, scoring: bank.scoring }
    }
    case 'calibration':
      return { cal: await py('/reference/calibration') }
    case 'platformSpecs':
      return { rows: platformSpecRows(await py('/reference/platform_specs')) }
    case 'policyRules': {
      const [rows, restricted, sources] = await Promise.all([db('/policyRules'), py('/reference/restricted_categories'), py('/reference/policy_sources')])
      return { rows, restricted, sources: sources.sources ?? [] }
    }
    case 'extraction': {
      if (!videoId) return { rows: [] }
      const id = encodeURIComponent(videoId)
      const [features, frames] = await Promise.all([py(`/videos/${id}/features`).catch(() => null), py(`/videos/${id}/frames`).catch(() => null)])
      return { rows: transcriptRows(features), features, frames: frames?.frames ?? [] }
    }
    case 'analyses':
      return { rows: await db(`/analyses${q(all || !videoId ? { kind: 'video_run' } : { kind: 'video_run', targetId: videoId })}`) }
    case 'shopeeListings': {
      const rows = await db('/shopeeListings')
      if (all || !shopId) return { rows }
      const bench = new Set((await db(`/benchmarkVideos${q({ shopId })}`)).map((b) => b.id))
      return { rows: rows.filter((r) => bench.has(r.benchmarkId)) }
    }
    case 'benchmarkVideos': {
      // every row is kept so a shop with too few videos can still draw the scatter against all benchmarks
      const allRows = await db('/benchmarkVideos')
      return { rows: all || !shopId ? allRows : allRows.filter((r) => r.shopId === shopId), allRows }
    }
    default:
      return { rows: await db(`/${d.collection}${d.scope === 'none' || all || !shopId ? '' : q({ shopId })}`) }
  }
}

function StatusPill({ status }) {
  if (!status) return null
  return (
    <span className={`atlas-status is-${status}`} title={STATUS_META[status]?.hint}>
      {STATUS_META[status]?.label ?? status}
    </span>
  )
}

function Card({ title, note, wide, children }) {
  return (
    <section className={`atlas-card${wide ? ' is-wide' : ''}`}>
      <h3 className="atlas-card-title">{title}</h3>
      {note && <p className="tiny muted atlas-card-note">{note}</p>}
      {children}
    </section>
  )
}

const Chart = ({ h = 240, children }) => (
  <div className="atlas-chart" style={{ height: h }}>
    <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
  </div>
)

function Tiles({ items }) {
  return (
    <dl className="atlas-tiles">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Sortable table over any rows; long text and JSON are shortened, URLs become links, images show. */
export function DataTable({ rows, columns, render = {} }) {
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  const [limit, setLimit] = useState(PAGE)
  const cols = columns ?? autoColumns(rows)
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort])
  if (!rows?.length) return <p className="tiny muted">Không có dòng nào cho phạm vi này.</p>
  const cell = (row, c) => {
    if (render[c.key]) return render[c.key](row[c.key], row)
    const v = row[c.key]
    if (v == null || v === '') return <span className="muted">–</span>
    if (c.key === 'source_status' || c.key === 'status_kind') return <StatusPill status={v} />
    if (typeof v === 'string' && /^https?:\/\//.test(v)) return <a href={v} target="_blank" rel="noreferrer">{v.replace(/^https?:\/\/(www\.)?/, '').slice(0, 36)}…</a>
    const parsed = parseLoose(v)
    if (typeof parsed === 'object') return <span className="atlas-json" title={JSON.stringify(parsed)}>{showValue(parsed, 70)}</span>
    if (c.num || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v))) return num(Number(v))
    return <span title={String(v).length > 80 ? String(v) : undefined}>{showValue(v, 80)}</span>
  }
  return (
    <div className="atlas-table-wrap">
      <table className="atlas-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={c.num ? 'is-num' : undefined} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                <button type="button" onClick={() => setSort(nextSort(sort, c.key))}>
                  {c.label}
                  {sort.key === c.key && <span aria-hidden="true">{sort.dir === 'asc' ? ' ↑' : ' ↓'}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, limit).map((r, i) => (
            <tr key={r.id ?? i}>
              {cols.map((c) => (
                <td key={c.key} className={[c.num && 'is-num', ID_KEY.test(c.key) && 'is-id'].filter(Boolean).join(' ') || undefined}>{cell(r, c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > limit && (
        <button type="button" className="btn btn-sm btn-secondary atlas-more" onClick={() => setLimit(limit + PAGE * 4)}>
          Xem thêm ({num(sorted.length - limit)} dòng)
        </button>
      )}
    </div>
  )
}

// ---------- views: one per dataset, charts first, the full table last ----------

function ShopsView({ rows, shopId }) {
  const data = rows.map((s) => ({
    name: s.shop_name, id: s.id, gmv: toNumber(s.gmv_30d_vnd),
    cancel: toNumber(s.cancellation_rate_30d), ret: toNumber(s.return_rate_30d), late: toNumber(s.late_shipment_rate_30d),
  }))
  return (
    <>
      <Card title="GMV 30 ngày theo shop" note="Shop đang chọn tô màu cam.">
        <Chart h={260}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" tickFormatter={compactNum} tick={axis} />
            <YAxis type="category" dataKey="name" width={130} tick={axis} />
            <Tooltip formatter={(v) => vnd(v)} />
            <Bar dataKey="gmv" name="GMV">
              {data.map((d) => <Cell key={d.id} fill={d.id === shopId ? C.accent : C.muted} />)}
            </Bar>
          </BarChart>
        </Chart>
      </Card>
      <Card title="Sức khoẻ vận hành 30 ngày" note="Tỉ lệ huỷ, hoàn và giao trễ: các số Shop health đọc.">
        <Chart h={260}>
          <BarChart data={data} margin={{ right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="id" tick={axis} />
            <YAxis tickFormatter={(v) => pct(v, 0)} tick={axis} />
            <Tooltip formatter={(v) => pct(v)} />
            <Legend />
            <Bar dataKey="cancel" name="Huỷ" fill={C.accent} />
            <Bar dataKey="ret" name="Hoàn" fill={C.ink} />
            <Bar dataKey="late" name="Giao trễ" fill={C.grey} />
          </BarChart>
        </Chart>
      </Card>
    </>
  )
}

function ShopDailyView({ rows, all }) {
  const data = all ? sumDailyByDate(rows) : rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === 'date' ? v : (toNumber(v) ?? v)])))
  return (
    <>
      <Card title="Lượt vào shop theo nguồn" note={all ? 'Cộng dồn mọi shop theo ngày.' : 'Tự nhiên, từ video, từ ads.'}>
        <Chart>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={axis} tickFormatter={(d) => String(d).slice(5)} />
            <YAxis tick={axis} tickFormatter={compactNum} />
            <Tooltip formatter={(v) => num(v)} />
            <Legend />
            <Area type="monotone" dataKey="visits_organic" name="Tự nhiên" stackId="v" stroke={C.grey} fill={C.light} fillOpacity={0.6} />
            <Area type="monotone" dataKey="visits_video" name="Video" stackId="v" stroke={C.accent} fill={C.accent} fillOpacity={0.45} />
            <Area type="monotone" dataKey="visits_ads" name="Ads" stackId="v" stroke={C.ink} fill={C.ink} fillOpacity={0.3} />
          </AreaChart>
        </Chart>
      </Card>
      <Card title="GMV và chi phí ads theo ngày">
        <Chart>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={axis} tickFormatter={(d) => String(d).slice(5)} />
            <YAxis tick={axis} tickFormatter={compactNum} />
            <Tooltip formatter={(v) => vnd(v)} />
            <Legend />
            <Line type="monotone" dataKey="gmv_vnd" name="GMV" stroke={C.accent} dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="ads_spend_vnd" name="Chi ads" stroke={C.ink} dot={false} />
            <Line type="monotone" dataKey="voucher_cost_vnd" name="Voucher" stroke={C.grey} dot={false} strokeDasharray="4 3" />
          </LineChart>
        </Chart>
      </Card>
    </>
  )
}

function SkusView({ rows }) {
  const prices = priceRows(rows).map((p) => ({ ...p, short: p.sku_id?.split('-').pop() }))
  return (
    <>
      <Card title="Sản phẩm" wide note="Ảnh SKU là ảnh minh hoạ.">
        <ul className="atlas-gallery">
          {rows.slice(0, 24).map((s) => (
            <li key={s.id}>
              <img src={`/skus/${encodeURIComponent(s.sku_id ?? s.id)}.jpg`} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
              <strong>{s.item_name}</strong>
              <span className="tiny muted">{vnd(toNumber(s.price_vnd))} · ★ {s.rating} · tồn {num(toNumber(s.stock))}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Thang giá: giá gốc, giá bán, giá vốn" wide>
        <Chart h={260}>
          <BarChart data={prices}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={rows.length > 12 ? 'sku_id' : 'name'} tick={axis} interval={0} angle={rows.length > 6 ? -20 : 0} textAnchor={rows.length > 6 ? 'end' : 'middle'} height={rows.length > 6 ? 70 : 30} />
            <YAxis tick={axis} tickFormatter={compactNum} />
            <Tooltip formatter={(v) => vnd(v)} />
            <Legend />
            <Bar dataKey="original" name="Giá gốc" fill={C.muted} />
            <Bar dataKey="price" name="Giá bán" fill={C.accent} />
            <Bar dataKey="cost" name="Giá vốn" fill={C.ink} />
          </BarChart>
        </Chart>
      </Card>
    </>
  )
}

function SkuDailyView({ rows }) {
  const funnel = funnelTotals(rows)
  const byDate = new Map()
  for (const r of rows) {
    const acc = byDate.get(r.date) ?? { date: r.date, units: 0, gmv: 0 }
    acc.units += toNumber(r.units_ordered) ?? 0
    acc.gmv += toNumber(r.gmv_vnd) ?? 0
    byDate.set(r.date, acc)
  }
  const daily = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  return (
    <>
      <Card title="Phễu: hiển thị → xem trang → đơn" note="Tổng trong phạm vi đang chọn; % là tỉ lệ so với bước trước.">
        <ol className="atlas-funnel">
          {funnel.map((f, i) => (
            <li key={f.key} style={{ '--w': `${Math.max(6, Math.sqrt((f.value ?? 0) / (funnel[0].value || 1)) * 100)}%` }}>
              <span className="atlas-funnel-bar" />
              <strong>{f.step}</strong>
              <span>{num(f.value)}</span>
              {i > 0 && <span className="tiny muted">{pct(f.rate, 2)}</span>}
            </li>
          ))}
        </ol>
      </Card>
      <Card title="Đơn theo ngày">
        <Chart>
          <LineChart data={daily}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={axis} tickFormatter={(d) => String(d).slice(5)} />
            <YAxis tick={axis} />
            <Tooltip />
            <Line type="monotone" dataKey="units" name="Đơn (units)" stroke={C.accent} dot={false} strokeWidth={2} />
          </LineChart>
        </Chart>
      </Card>
    </>
  )
}

function ReviewsView({ rows }) {
  const data = rows.map((r) => ({ id: r.sku_id, pos: toNumber(r.positive_ratio), n: toNumber(r.review_count) }))
  const topics = topicCounts(rows)
  return (
    <>
      <Card title="Tỉ lệ đánh giá tích cực theo SKU">
        <Chart>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="id" tick={axis} tickFormatter={(s) => String(s).split('-').pop()} />
            <YAxis tick={axis} domain={[0, 1]} tickFormatter={(v) => pct(v, 0)} />
            <Tooltip formatter={(v, k) => (k === 'pos' ? pct(v) : num(v))} />
            <Bar dataKey="pos" name="Tích cực" fill={C.pass} />
          </BarChart>
        </Chart>
      </Card>
      <Card title="Chủ đề phàn nàn" note="Số SKU có nhắc tới chủ đề.">
        {topics.length ? (
          <Chart h={Math.max(160, topics.length * 28)}>
            <BarChart data={topics} layout="vertical" margin={{ left: 8 }}>
              <XAxis type="number" allowDecimals={false} tick={axis} />
              <YAxis type="category" dataKey="topic" width={150} tick={axis} />
              <Tooltip />
              <Bar dataKey="count" name="SKU" fill={C.critical} />
            </BarChart>
          </Chart>
        ) : <p className="tiny muted">Không có chủ đề phàn nàn trong phạm vi này.</p>}
      </Card>
    </>
  )
}

function ShareBars({ title, obj }) {
  const data = shareRows(parseLoose(obj))
  return (
    <div className="atlas-share">
      <h4>{title}</h4>
      {data.map((d) => (
        <div key={d.label} className="atlas-share-row">
          <span>{d.label}</span>
          <span className="atlas-share-bar"><span style={{ width: pct(d.value, 0) }} /></span>
          <span className="tiny">{pct(d.value, 0)}</span>
        </div>
      ))}
    </div>
  )
}

function AudienceView({ rows, skuId }) {
  const [pick, setPick] = useState(null)
  const row = rows.find((r) => r.sku_id === (pick ?? skuId)) ?? rows[0]
  if (!row) return null
  const interests = parseLoose(row.interests)
  return (
    <Card title="Chân dung người mua" wide>
      <label className="atlas-select">
        SKU
        <select value={row.sku_id} onChange={(e) => setPick(e.target.value)}>
          {rows.map((r) => <option key={r.id} value={r.sku_id}>{r.sku_id}</option>)}
        </select>
      </label>
      <div className="atlas-share-grid">
        <ShareBars title="Độ tuổi" obj={row.age_bands} />
        <ShareBars title="Giới tính" obj={row.gender_split} />
        <ShareBars title="Vùng" obj={row.regions} />
        <div className="atlas-share">
          <h4>Sở thích</h4>
          <p className="atlas-chips">{Array.isArray(interests) ? interests.map((t) => <span key={t}>{t}</span>) : showValue(interests)}</p>
        </div>
      </div>
    </Card>
  )
}

function VideosView({ rows }) {
  const data = videoRates(rows).map((v) => ({ ...v, short: String(v.id).split('-').pop() }))
  return (
    <>
      <Card title="CTR sản phẩm và CVR theo video" note="CTR = click sản phẩm / lượt xem; CVR = đơn / click.">
        <Chart>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="short" tick={axis} />
            <YAxis tick={axis} tickFormatter={(v) => pct(v, 0)} />
            <Tooltip formatter={(v) => pct(v, 2)} labelFormatter={(l, p) => p?.[0]?.payload?.label ?? l} />
            <Legend />
            <Bar dataKey="ctr" name="CTR" fill={C.accent} />
            <Bar dataKey="cvr" name="CVR" fill={C.ink} />
          </BarChart>
        </Chart>
      </Card>
      <Card title="Lượt xem và tỉ lệ xem hết">
        <Chart>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="short" tick={axis} />
            <YAxis yAxisId="v" tick={axis} tickFormatter={compactNum} />
            <YAxis yAxisId="c" orientation="right" tick={axis} tickFormatter={(v) => pct(v, 0)} />
            <Tooltip formatter={(v, k) => (k === 'Xem hết' ? pct(v) : num(v))} labelFormatter={(l, p) => p?.[0]?.payload?.label ?? l} />
            <Legend />
            <Bar yAxisId="v" dataKey="views" name="Lượt xem" fill={C.muted} />
            <Bar yAxisId="c" dataKey="completion" name="Xem hết" fill={C.pass} />
          </BarChart>
        </Chart>
      </Card>
    </>
  )
}

function BenchmarkView({ rows, allRows, scoped }) {
  const own = benchmarkPoints(rows)
  const fallback = scoped && own.length < MIN_SCATTER_POINTS && allRows?.length > rows.length
  const points = fallback ? benchmarkPoints(allRows) : own
  const hooks = [...new Set(points.map((p) => p.hook ?? 'khác'))]
  const x = logAxis(points.map((p) => p.views))
  const y = logAxis(points.map((p) => p.sales))
  return (
    <Card title="Lượt xem × số bán (thang log)" wide note="Mỗi chấm một video Clipcat, màu theo loại hook. Số do nền tảng tự báo cáo, chưa kiểm chứng với sàn.">
      {fallback && (
        <p className="tiny atlas-note">
          Shop này chỉ có {own.length} video benchmark vẽ được (cần ≥ {MIN_SCATTER_POINTS}), nên biểu đồ hiện cả {points.length} video benchmark của mọi shop.
        </p>
      )}
      {!points.length ? <p className="tiny muted">Không có video nào có cả lượt xem và số bán.</p> : (
        <Chart h={380}>
          <ScatterChart margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" dataKey="views" name="Lượt xem" scale="log" domain={x.domain} ticks={x.ticks} allowDataOverflow tick={axis} tickFormatter={compactNum} label={axisLabel('Lượt xem (thang log)', 'insideBottom')} height={52} />
          <YAxis type="number" dataKey="sales" name="Số bán" scale="log" domain={y.domain} ticks={y.ticks} allowDataOverflow tick={axis} tickFormatter={compactNum} label={{ ...axisLabel('Số bán (thang log)', 'insideLeft'), angle: -90, style: { textAnchor: 'middle' } }} width={72} />
          <ZAxis range={[60, 60]} />
          <Tooltip formatter={(v) => num(v)} labelFormatter={() => ''} content={({ payload }) => payload?.[0] ? (
            <div className="atlas-tip"><strong>{payload[0].payload.label}</strong><br />{num(payload[0].payload.views)} xem · {num(payload[0].payload.sales)} bán · {payload[0].payload.hook}</div>
          ) : null} />
          <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 13 }} />
          {hooks.map((h, i) => (
            <Scatter key={h} name={h} data={points.filter((p) => (p.hook ?? 'khác') === h)} fill={SERIES[i % SERIES.length]} />
          ))}
          </ScatterChart>
        </Chart>
      )}
    </Card>
  )
}

function StackedCount({ cross, a, title, note }) {
  const { rows: data, series } = cross
  return (
    <Card title={title} note={note}>
      <Chart>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={a} tick={axis} />
          <YAxis allowDecimals={false} tick={axis} />
          <Tooltip />
          <Legend />
          {series.map((s, i) => <Bar key={s} dataKey={s} stackId="s" fill={SEVERITY[s] ?? SERIES[i % SERIES.length]} />)}
        </BarChart>
      </Chart>
    </Card>
  )
}

function MarketView({ rows, skuId }) {
  const [pick, setPick] = useState(null)
  const snap = rows.find((r) => r.sku_id === (pick ?? skuId)) ?? rows[0]
  if (!snap) return null
  const sum = marketSummary(snap)
  const comps = competitorRows(snap)
  return (
    <>
      <Card title={`Thị trường của “${snap.keyword}”`} wide note={`Cào ngày ${snap.crawled_at ?? '–'}. Chấm đặc = cùng loại (like-for-like).`}>
        <label className="atlas-select">
          SKU
          <select value={snap.sku_id} onChange={(e) => setPick(e.target.value)}>
            {rows.map((r) => <option key={r.id} value={r.sku_id}>{r.sku_id} · {r.keyword}</option>)}
          </select>
        </label>
        <Tiles items={[
          ['Listing đã cào', num(sum.total)],
          ['Cùng loại', num(sum.likeForLike)],
          ['Có số đã bán', num(sum.withSold)],
          ['Giá trung vị', vnd(sum.medianPrice)],
          ...sum.channels.map((c) => [c.label, `${num(c.count)} · ${compactVnd(c.medianPrice)}`]),
        ]} />
        <Chart h={300}>
          <ScatterChart margin={{ right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey="price" name="Giá" tick={axis} tickFormatter={compactNum} domain={['auto', 'auto']} />
            <YAxis type="number" dataKey="sold" name="Đã bán" tick={axis} tickFormatter={compactNum} />
            <ZAxis range={[55, 55]} />
            <Tooltip content={({ payload }) => payload?.[0] ? (
              <div className="atlas-tip"><strong>{payload[0].payload.title}</strong><br />{vnd(payload[0].payload.price)} · {num(payload[0].payload.sold)} đã bán</div>
            ) : null} />
            <Legend />
            {Object.keys(CHANNELS).map((ch) => (
              <Scatter key={ch} name={CHANNELS[ch]} data={comps.filter((c) => c.channel === ch && c.price != null && c.sold != null)} fill={CHANNEL_COLOR[ch]} />
            ))}
          </ScatterChart>
        </Chart>
      </Card>
      <Card title={`Listing đối thủ (${comps.length})`} wide>
        <DataTable
          rows={comps}
          columns={[
            { key: 'channel', label: 'Kênh' }, { key: 'title', label: 'Tên listing' }, { key: 'shop', label: 'Shop' },
            { key: 'price', label: 'Giá', num: true }, { key: 'sold', label: 'Đã bán', num: true }, { key: 'rating', label: 'Rating', num: true },
            { key: 'likeForLike', label: 'Cùng loại' }, { key: 'provider', label: 'Nguồn' }, { key: 'url', label: 'Link' },
          ]}
          render={{
            channel: (v) => CHANNELS[v] ?? v,
            price: (v) => vnd(v),
            likeForLike: (v) => (v == null ? '–' : v ? 'có' : 'không'),
          }}
        />
      </Card>
    </>
  )
}

function PolicyView({ data }) {
  const rules = (data.rows ?? []).map((r) => ({ ...r, platforms: parseLoose(r.platforms) }))
  const restricted = restrictedRows(data.restricted)
  return (
    <>
      <StackedCount cross={rulesByPlatform(rules)} a="platform" title="Rule theo nền tảng và mức độ" note="Một rule áp cho nhiều nền tảng được đếm ở mỗi nền tảng." />
      <Card title="Nguồn chính sách">
        <ul className="atlas-sources">
          {data.sources.map((s) => (
            <li key={s.id}><strong>{s.id}</strong> <span className="tiny muted">{s.platform} · {s.scope}</span> <a href={s.url} target="_blank" rel="noreferrer">mở trang</a></li>
          ))}
        </ul>
      </Card>
      <Card title={`Danh mục hàng hạn chế (${restricted.length})`} wide note={`Kiểm tra ngày ${data.restricted?.checked_at ?? '–'} · nguồn: ${restrictedSources(data.restricted).length} trang.`}>
        <DataTable rows={restricted} columns={autoColumns(restricted, ['list', 'id', 'label_vi', 'status', 'keywords', 'source_id'], ['source_text', 'verification'])} />
      </Card>
    </>
  )
}

function QuestionsView({ rows, scoring }) {
  const weights = questionWeights(rows)
  return (
    <>
      <Card title="Trọng số theo nhóm" note="Tổng trọng số câu hỏi trong mỗi nhóm.">
        <Chart>
          <BarChart data={weights}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="group" tick={axis} tickFormatter={(g) => GROUP_LABELS[g] ?? g} />
            <YAxis tick={axis} />
            <Tooltip />
            <Bar dataKey="weight" name="Trọng số" fill={C.accent} />
          </BarChart>
        </Chart>
      </Card>
      {scoring && (
        <Card title="Điểm tổng ghép thế nào">
          <Tiles items={[
            ...Object.entries(scoring.group_weights ?? {}).map(([g, w]) => [GROUP_LABELS[g] ?? g, pct(w, 0)]),
            ...Object.entries(scoring.thresholds ?? {}).map(([k, v]) => [`Ngưỡng ${k}`, String(v)]),
          ]} />
        </Card>
      )}
    </>
  )
}

function CalibrationView({ cal }) {
  const rows = calibrationRows(cal)
  return (
    <>
      <Card title="Trạng thái ngưỡng" note={CALIBRATION_STATUS_NOTE}>
        <Chart h={200}>
          <BarChart data={calibrationSummary(rows)}>
            <XAxis dataKey="status" tick={axis} />
            <YAxis allowDecimals={false} tick={axis} />
            <Tooltip />
            <Bar dataKey="count" name="Số ngưỡng">
              {calibrationSummary(rows).map((s) => <Cell key={s.status} fill={s.status === 'calibrated' ? C.pass : s.status === 'sourced' ? C.ink : C.grey} />)}
            </Bar>
          </BarChart>
        </Chart>
      </Card>
      <Card title={`Bảng ngưỡng (${rows.length})`} wide>
        <DataTable rows={rows} columns={autoColumns(rows, ['key', 'kind', 'value', 'unit', 'status', 'source', 'note'])} />
      </Card>
    </>
  )
}

function RunsView({ rows }) {
  const runs = runRows(rows)
  const { videos, points } = overallSeries(runs)
  return (
    <>
      <Card title="Điểm tổng qua các lượt chạy" wide note="Mỗi đường một video; điểm tổng tính lại bằng cùng công thức với trang kết quả.">
        <Chart h={260}>
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="id" tick={axis} tickFormatter={(id) => `#${id}`} />
            <YAxis domain={[0, 100]} tick={axis} />
            <Tooltip labelFormatter={(id) => `Lượt #${id}`} formatter={(v) => (v == null ? '–' : Number(v).toFixed(1))} />
            <Legend />
            {videos.map((v, i) => <Line key={v} dataKey={v} stroke={SERIES[i % SERIES.length]} connectNulls dot />)}
          </LineChart>
        </Chart>
      </Card>
      <Card title={`Lượt chạy (${runs.length})`} wide>
        <DataTable rows={runs} render={{ overall: (v) => (v == null ? '–' : Number(v).toFixed(1)), coverage: (v) => pct(v, 0) }} />
      </Card>
    </>
  )
}

function ExtractionView({ data, onSeek }) {
  const { features, frames } = data
  if (!features) return <p className="tiny muted">Video này chưa được trích xuất.</p>
  const moments = keyMomentRows(features)
  const usage = features.token_usage ?? {}
  return (
    <>
      <Card title="Thông số trích xuất">
        <Tiles items={[
          ['Thời lượng', mmss(toNumber(features.video_duration_sec))],
          ['Số frame', num(frames.length)],
          ['Model thị giác', features.vision_model ?? '–'],
          ['Token', num(toNumber(usage.total_tokens ?? usage.total))],
          ['Đoạn transcript', num(features.transcript_segments?.length)],
        ]} />
      </Card>
      <Card title={`Khoảnh khắc chính (${moments.length})`}>
        <ol className="atlas-moments">
          {moments.map((m) => (
            <li key={m.i}><button type="button" className="atlas-time" onClick={() => onSeek?.(m.sec)}>{mmss(m.sec)}</button> <strong>{m.event}</strong> <span className="muted">{m.description}</span></li>
          ))}
        </ol>
      </Card>
      <Card title={`Frame 1 giây/ảnh (${frames.length})`} wide note="Ảnh AI nhìn thấy; bấm để tua video tới giây đó.">
        <ul className="atlas-frames">
          {frames.map((f) => (
            <li key={f.sec}>
              <button type="button" onClick={() => onSeek?.(f.sec)}>
                <img src={f.url} alt={`Frame giây ${f.sec}`} loading="lazy" />
                <span>{mmss(f.sec)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

function GapsView() {
  return (
    <Card title="Dữ liệu nên bổ sung" wide note="Chưa có trong lab. Mỗi mục ghi điều nó mở ra và nguồn có thể lấy.">
      <ul className="atlas-gaps">
        {DATA_GAPS.map((g) => (
          <li key={g.id}>
            <StatusPill status="MISSING" />
            <strong>{g.title}</strong>
            <p>{g.unlocks}</p>
            <p className="tiny muted">Nguồn: {g.source} · Công sức: {g.effort}</p>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function DatasetBody({ d, data, all, shopId, skuId, onSeek }) {
  const rows = data.rows ?? []
  switch (d.id) {
    case 'shops': return <ShopsView rows={rows} shopId={shopId} />
    case 'shopDailyMetrics': return <ShopDailyView rows={rows} all={all} />
    case 'skus': return <SkusView rows={rows} />
    case 'skuDailyMetrics': return <SkuDailyView rows={rows} />
    case 'skuReviews': return <ReviewsView rows={rows} />
    case 'skuAudience': return <AudienceView rows={rows} skuId={skuId} />
    case 'videos': return <VideosView rows={rows} />
    case 'benchmarkVideos': return <BenchmarkView rows={rows} allRows={data.allRows} scoped={!all && !!shopId} />
    case 'shopeeListings': return <StackedCount cross={crossCount(rows, 'match_type', 'source')} a="match_type" title="Listing theo loại khớp và nguồn" note="search_snippet là tìm thật; phần còn lại là dữ liệu nội bộ." />
    case 'marketSnapshots': return <MarketView rows={rows} skuId={skuId} />
    case 'policyRules': return <PolicyView data={data} />
    case 'questions': return <QuestionsView rows={rows} scoring={data.scoring} />
    case 'calibration': return <CalibrationView cal={data.cal} />
    case 'analyses': return <RunsView rows={rows} />
    case 'extraction': return <ExtractionView data={data} onSeek={onSeek} />
    default: return null
  }
}

// Datasets whose view already ends in its own table, or whose raw rows are too heavy to list.
const OWN_TABLE = new Set(['marketSnapshots', 'analyses', 'calibration'])

/**
 * Kho dữ liệu: every dataset behind the lab, each with its provenance (status, source, file, date), charts of what
 * it holds, and the full table. Scope follows the shop / video selected in the studio, or shows everything.
 */
export function DataAtlas({ open, onClose, shopId, videoId, skuId, onSeek, initialId = 'shops' }) {
  const ref = useRef(null)
  const [id, setId] = useState(initialId)
  const [all, setAll] = useState(false)
  const d = id === GAPS_ID ? null : datasetById(id)
  const counts = useFetch(
    () => (open ? Promise.all(DATASETS.map(async (x) => [x.id, x.collection ? await countOf(x.collection).catch(() => null) : null])).then(Object.fromEntries) : Promise.resolve({})),
    [open],
  )
  const key = `${id}|${all}|${shopId}|${videoId}`
  const data = useFetch(
    () => (open && d ? loadDataset(d, { all, shopId, videoId }).then((x) => ({ ...x, key })) : Promise.resolve(null)),
    [open, key],
  )
  const ready = data.data?.key === key

  useEffect(() => {
    if (!open) return undefined
    ref.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const rows = (ready && data.data?.rows) || []
  const mixed = statusCounts(rows)
  const scopeLabel = d?.scope === 'video' ? `Video ${videoId ?? '–'}` : `Shop ${shopId ?? '–'}`
  const seek = (s) => {
    onSeek?.(s)
    onClose()
  }

  return (
    <div className="deep-modal atlas-modal">
      <div className="deep-scrim" onClick={onClose} />
      <section ref={ref} className="deep-dialog atlas" role="dialog" aria-modal="true" aria-labelledby="atlasTitle" tabIndex={-1}>
        <header className="ep-head atlas-head">
          <div>
            <h2 id="atlasTitle">Kho dữ liệu</h2>
            <p className="tiny muted">Mọi dữ liệu lab đang dùng, kèm nguồn, ngày và trạng thái thật / nội bộ.</p>
          </div>
          <button type="button" className="ep-x" onClick={onClose} aria-label="Đóng"><Icon name="close" /></button>
        </header>
        <div className="atlas-body">
          <nav className="atlas-nav" aria-label="Bộ dữ liệu">
            {NAV_GROUPS.map((g) => (
              <div key={g.id} className="atlas-nav-group">
                <h3>{g.label}</h3>
                {DATASETS.filter((x) => x.group === g.id).map((x) => (
                  <button key={x.id} type="button" className={`atlas-nav-item${x.id === id ? ' is-active' : ''}`} aria-current={x.id === id ? 'page' : undefined} onClick={() => setId(x.id)}>
                    <span>{x.title}</span>
                    <span className="atlas-nav-meta">
                      {counts.data?.[x.id] != null && <span className="tiny muted">{num(counts.data[x.id])}</span>}
                      <StatusPill status={x.status} />
                    </span>
                  </button>
                ))}
              </div>
            ))}
            <div className="atlas-nav-group">
              <h3>Đề xuất</h3>
              <button type="button" className={`atlas-nav-item${id === GAPS_ID ? ' is-active' : ''}`} onClick={() => setId(GAPS_ID)}>
                <span>Dữ liệu còn thiếu</span>
                <span className="atlas-nav-meta"><span className="tiny muted">{DATA_GAPS.length}</span><StatusPill status="MISSING" /></span>
              </button>
            </div>
          </nav>
          <main className="atlas-main">
            {!d ? <GapsView /> : (
              <>
                <header className="atlas-ds-head">
                  <div className="atlas-ds-title">
                    <h2>{d.title}</h2>
                    <StatusPill status={d.status} />
                    {Object.entries(mixed).filter(([s]) => s !== d.status).map(([s, n]) => (
                      <span key={s} className="tiny muted">+ {n} dòng <StatusPill status={s} /></span>
                    ))}
                  </div>
                  {d.scope !== 'none' && (
                    <div className="atlas-scope" role="group" aria-label="Phạm vi">
                      <button type="button" aria-pressed={!all} onClick={() => setAll(false)}>{scopeLabel}</button>
                      <button type="button" aria-pressed={all} onClick={() => setAll(true)}>Tất cả</button>
                    </div>
                  )}
                </header>
                <dl className="atlas-prov">
                  <div><dt>Nội dung</dt><dd>{d.what}</dd></div>
                  <div><dt>Nguồn</dt><dd>{d.source}</dd></div>
                  <div><dt>File</dt><dd><code>{d.file}</code></dd></div>
                  <div><dt>Ngày</dt><dd className={d.date ? undefined : 'atlas-nodate'}>{datasetDate(d)}</dd></div>
                </dl>
                {!ready && !data.error && <p className="tiny muted">Đang tải…</p>}
                {data.error && <p className="tiny studio-err">Không tải được: {String(data.error.message)}</p>}
                {ready && (
                  <div className="atlas-grid">
                    <DatasetBody d={d} data={data.data} all={all} shopId={shopId} skuId={skuId} onSeek={seek} />
                    {!OWN_TABLE.has(d.id) && (
                      <Card title={`Bảng dữ liệu (${num(rows.length)} dòng)`} wide>
                        <DataTable rows={rows} columns={autoColumns(rows, [], ['shopId'])} />
                      </Card>
                    )}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </section>
    </div>
  )
}
