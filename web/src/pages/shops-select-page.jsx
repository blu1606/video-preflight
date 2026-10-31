import { ArrowLeft, ArrowRight, TrendingDown, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useFetch } from '../hooks/use-fetch'
import { compactVnd, db, num } from '../lib/api'
import { categoryLabel, gmvTrend, rowsByShop } from '../lib/shop-trend'
import { OperatePage, Skeleton, StateBlock } from './operate-shell'

const PREVIEW_SKUS = 3

const trendText = (change) => `${change > 0 ? '+' : ''}${(change * 100).toFixed(1).replace('.', ',')}%`

const shopAgeLabel = (days) => {
  if (days == null) return null
  const months = Math.floor(days / 30.4)
  return months >= 12 ? `${Math.floor(months / 12)} năm ${months % 12} tháng` : `${months} tháng`
}

function Trend({ rows }) {
  const trend = gmvTrend(rows)
  if (!trend) {
    return <p className="op-trend op-trend--none">Chưa đủ 14 ngày số liệu để so sánh GMV</p>
  }
  const Icon = trend.direction === 'down' ? TrendingDown : TrendingUp
  return (
    <p className={`op-trend op-trend--${trend.direction}`}>
      <Icon size={16} aria-hidden="true" />
      GMV 7 ngày {trendText(trend.change)} <small>so với 7 ngày trước</small>
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

      <Trend rows={rows} />

      <div className="op-sku-preview">
        <p className="op-sku-preview-title">SKU đang bán · {mine.length}</p>
        {shown.map((sku) => (
          <div key={sku.sku_id} className="op-mini">
            <img
              className="op-mini-thumb"
              src={`/skus/${sku.sku_id}.jpg`}
              alt=""
              loading="lazy"
              onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
            />
            <span className="op-mini-name">{sku.item_name}</span>
          </div>
        ))}
        {mine.length > PREVIEW_SKUS && (
          <p className="op-sku-preview-title">và {mine.length - PREVIEW_SKUS} SKU khác</p>
        )}
      </div>

      <div className="op-card-foot">
        <span className="op-card-foot-note">Dữ liệu mô phỏng</span>
        <span className="op-card-foot-action">
          Chọn shop <ArrowRight size={16} aria-hidden="true" />
        </span>
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
    <OperatePage step={1}>
      <a href="/login" className="op-back">
        <ArrowLeft size={16} aria-hidden="true" />
        Đăng nhập lại
      </a>

      <div className="op-page-head">
        <h1 className="op-title">Chọn shop</h1>
        <p className="op-lede">
          Tài khoản demo đã cấp quyền cho {shops.data ? shops.data.length : 'các'} shop. Chọn một shop để chọn sản phẩm và video.
        </p>
        <p className="op-source">
          Nguồn: dữ liệu mô phỏng synthetic_shopee_intelligence (fixtures/shopee_seed). Chỉ để thử, không phải số liệu thật của shop nào.
        </p>
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
