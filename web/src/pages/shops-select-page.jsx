import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useFetch } from '../hooks/use-fetch'
import { compactVnd, db, num } from '../lib/api'
import { categoryLabel, gmvTrend, rowsByShop } from '../lib/shop-trend'
import { OperatePage, Skeleton, StateBlock } from './operate-shell'

const PREVIEW_SKUS = 4

const trendText = (change) => `${change > 0 ? '+' : ''}${(change * 100).toFixed(1).replace('.', ',')}%`

const shopAgeLabel = (days) => {
  if (days == null) return null
  const months = Math.floor(days / 30.4)
  return months >= 12 ? `${Math.floor(months / 12)} năm ${months % 12} tháng` : `${months} tháng`
}

/** Daily GMV of the last 30 days as a sparkline; the last 7 days are drawn solid, the change sits beside it. */
function Sparkline({ rows, direction }) {
  const days = [...rows].sort((x, y) => (x.date < y.date ? -1 : 1)).slice(-30)
  const values = days.map((r) => Number(r.gmv_vnd ?? 0))
  if (values.length < 2) return null
  const W = 96
  const H = 28
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - ((v - min) / span) * (H - 6)])
  const line = (from) => pts.slice(from).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')
  const split = Math.max(0, pts.length - 7)
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg className={`op-spark op-spark--${direction}`} viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <path d={`${line(0)}L${W},${H}L0,${H}Z`} className="op-spark-area" />
      <path d={line(0)} className="op-spark-past" />
      <path d={line(split)} className="op-spark-now" />
      <circle cx={lx} cy={ly} r="2.6" className="op-spark-dot" />
    </svg>
  )
}

function Trend({ rows }) {
  const trend = gmvTrend(rows)
  if (!trend) {
    return <p className="op-trend op-trend--none" title="Chưa đủ 14 ngày số liệu">–</p>
  }
  const Icon = trend.direction === 'down' ? TrendingDown : TrendingUp
  return (
    <p className={`op-trend op-trend--${trend.direction}`} title="GMV 7 ngày so với 7 ngày trước">
      <Sparkline rows={rows} direction={trend.direction} />
      <Icon size={14} aria-hidden="true" />
      {trendText(trend.change)}
    </p>
  )
}

function ShopCard({ shop, skus, rows }) {
  const mine = skus.filter((s) => s.shop_id === shop.id)
  const shown = mine.slice(0, PREVIEW_SKUS)
  const age = shopAgeLabel(shop.shop_age_days)
  return (
    <Link to={`/shops/${encodeURIComponent(shop.id)}`} className="op-card">
      <div className="op-card-head">
        <h2 className="op-card-name">{shop.shop_name}</h2>
        <p className="op-card-meta">
          {categoryLabel(shop.main_category)} · {shop.id}{age ? ` · mở ${age}` : ''}
        </p>
      </div>

      <dl className="op-stats">
        <div>
          <dt className="op-stat-label">Đánh giá shop</dt>
          <dd className="op-stat-value">{num(shop.shop_rating)}</dd>
        </div>
        <div>
          <dt className="op-stat-label">GMV 30 ngày</dt>
          <dd className="op-stat-value">{compactVnd(shop.gmv_30d_vnd)}</dd>
        </div>
        <div>
          <dt className="op-stat-label">Đơn 30 ngày</dt>
          <dd className="op-stat-value">{num(shop.orders_30d)}</dd>
        </div>
      </dl>

      <div className="op-card-foot">
        <div className="op-sku-stack" title={mine.map((sku) => sku.item_name).join('\n')}>
          {shown.map((sku) => (
            <img
              key={sku.sku_id}
              className="op-mini-thumb"
              src={`/skus/${sku.sku_id}.jpg`}
              alt=""
              loading="lazy"
              onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
            />
          ))}
          <span className="op-sku-count">{mine.length} SKU</span>
        </div>
        <Trend rows={rows} />
        <ArrowRight className="op-card-go" size={18} aria-hidden="true" />
      </div>
    </Link>
  )
}

export default function ShopsSelectPage() {
  const shops = useFetch(() => db('/shops'), [])
  const skus = useFetch(() => db('/skus'), [])
  const daily = useFetch(() => db('/shopDailyMetrics'), [])

  const loading = shops.loading || skus.loading || daily.loading
  const failure = shops.error || skus.error || daily.error
  const retry = () => {
    shops.reload()
    skus.reload()
    daily.reload()
  }
  const dailyByShop = rowsByShop(daily.data)

  return (
    <OperatePage step={1} back={{ href: '/login', label: 'Đăng nhập lại' }}>

      <div className="op-page-head op-page-head--art">
        <h1 className="op-title">Chọn shop</h1>
        <p className="op-lede">{shops.data ? `${shops.data.length} shop đã cấp quyền` : 'Shop đã cấp quyền'}</p>
        <img className="op-head-art" src="/illustrations/shop-select.webp" alt="" width="1200" height="900" />
      </div>

      {loading && <Skeleton count={3} />}

      {!loading && failure && (
        <StateBlock
          tone="error"
          title="Không tải được danh sách shop"
          text={`Kiểm tra json-server (cổng 3101) đang chạy. Chi tiết: ${failure.message}`}
          action={<button type="button" className="op-btn op-btn--ghost" onClick={retry}>Thử lại</button>}
        />
      )}

      {!loading && !failure && shops.data?.length === 0 && (
        <StateBlock title="Chưa có shop nào được cấp quyền" text="Quay lại đăng nhập để cấp quyền cho shop." />
      )}

      {!loading && !failure && shops.data?.length > 0 && (
        <div className="op-shop-grid">
          {shops.data.map((shop) => (
            <ShopCard key={shop.id} shop={shop} skus={skus.data ?? []} rows={dailyByShop.get(shop.id) ?? []} />
          ))}
        </div>
      )}
    </OperatePage>
  )
}
