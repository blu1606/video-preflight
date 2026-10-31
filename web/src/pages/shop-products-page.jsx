import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { useFetch } from '../hooks/use-fetch'
import { db, num, py, vnd } from '../lib/api'
import { categoryLabel } from '../lib/shop-trend'
import { OperatePage, Skeleton, StateBlock } from './operate-shell'

const enc = encodeURIComponent

const ratingText = (n) => (n == null ? '–' : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 1 }))

/** Product thumbnail from the seed folder; a text box when the image is missing. */
export function SkuThumb({ sku, className }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <span className={`${className} op-thumb-fallback`} aria-hidden="true">Chưa có ảnh</span>
  }
  return (
    <img
      className={className}
      src={`/skus/${enc(sku.sku_id)}.jpg`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

/** Paste a Shopee product link: resolved through the existing /py/listings/resolve (live fetch, else crawled). */
function ListingLinkPanel() {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    const link = url.trim()
    if (!link) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await py('/listings/resolve', { method: 'POST', body: { url: link } }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const listing = result?.listing
  const title = listing?.title ?? listing?.sku_title ?? listing?.name
  return (
    <section aria-labelledby="link-title">
      <h2 id="link-title" className="op-label">Dán link sản phẩm Shopee</h2>
      <form className="op-link-row" onSubmit={submit}>
        <input
          className="op-input"
          type="url"
          inputMode="url"
          placeholder="https://shopee.vn/ten-san-pham-i.<shop>.<item>"
          aria-label="Link sản phẩm Shopee"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="op-btn op-btn--ghost" disabled={busy || !url.trim()}>
          {busy ? 'Đang lấy…' : 'Lấy thông tin'}
        </button>
      </form>
      <p className="op-help op-mt-8">
        Đọc listing trực tiếp từ Shopee, hoặc từ listing đã thu thập. Kết quả chỉ để xem: không tạo SKU mới và không gắn vào SKU nào của shop.
      </p>
      {error && <p className="op-help op-help--error op-mt-12" role="alert">Không lấy được listing: {error}</p>}
      {result && (
        <div className="op-result" role="status">
          <strong>Tìm thấy listing</strong>
          <dl>
            <dt>Tên</dt>
            <dd>{title ?? '–'}</dd>
            <dt>Giá</dt>
            <dd>{vnd(listing?.price_vnd)}</dd>
            <dt>Nguồn</dt>
            <dd>{result.source === 'live' ? `Đọc trực tiếp lúc ${result.fetched_at}` : `Listing đã thu thập lúc ${result.crawled_at ?? '–'}`}</dd>
          </dl>
        </div>
      )}
    </section>
  )
}

function SkuRow({ shopId, sku, videoCount }) {
  const oldPrice = sku.original_price_vnd && sku.original_price_vnd > sku.price_vnd ? sku.original_price_vnd : null
  return (
    <Link to={`/shops/${enc(shopId)}/products/${enc(sku.sku_id)}/add-video`} className="op-row">
      <div className="op-row-product">
        <SkuThumb sku={sku} className="op-row-thumb" />
        <div className="op-row-text">
          <p className="op-row-name">{sku.item_name}</p>
          <p className="op-row-sub">{sku.sku_id}</p>
        </div>
      </div>
      <div className="op-row-meta">
        <p className="op-num-cell">
          {vnd(sku.price_vnd)}
          {oldPrice && <span className="op-price-old">{vnd(oldPrice)}</span>}
        </p>
        <div className="op-num-cell">
          <p>{ratingText(sku.rating)}</p>
          <p className="op-row-sub">{num(sku.rating_count)} đánh giá</p>
        </div>
        <p className="op-num-cell">{sku.stock > 0 ? `${num(sku.stock)} cái` : 'Hết hàng'}</p>
      </div>
      <span className={`op-video-badge${videoCount > 0 ? ' op-video-badge--yes' : ''}`}>
        {videoCount > 0 ? `Có ${videoCount} video` : 'Chưa có video'}
      </span>
    </Link>
  )
}

export default function ShopProductsPage() {
  const { id } = useParams()
  const shop = useFetch(() => db(`/shops/${enc(id)}`), [id])
  const skus = useFetch(() => db(`/skus?shopId=${enc(id)}`), [id])
  const videos = useFetch(() => db(`/videos?shopId=${enc(id)}`), [id])

  const loading = shop.loading || skus.loading || videos.loading
  const failure = shop.error || skus.error || videos.error
  const retry = () => {
    shop.reload()
    skus.reload()
    videos.reload()
  }
  const videoCount = (skuId) => (videos.data ?? []).filter((v) => v.sku_id === skuId).length

  return (
    <OperatePage step={2}>
      <Link to="/shops/select" className="op-back">
        <ArrowLeft size={16} aria-hidden="true" />
        Chọn shop
      </Link>

      {shop.data && (
        <div className="op-page-head">
          <h1 className="op-title">{shop.data.shop_name}</h1>
          <p className="op-lede">
            {categoryLabel(shop.data.main_category)} · {shop.data.id} · Shop mô phỏng, dữ liệu chỉ để thử.
          </p>
        </div>
      )}

      {loading && <Skeleton count={3} />}

      {!loading && failure && (
        <StateBlock
          tone="error"
          title="Không tải được shop hoặc sản phẩm"
          text={`Kiểm tra json-server (cổng 3101) đang chạy. Chi tiết: ${failure.message}`}
          action={<button type="button" className="op-btn op-btn--ghost" onClick={retry}>Thử lại</button>}
        />
      )}

      {!loading && !failure && shop.data && (
        <div className="op-stack">
          <ListingLinkPanel />

          <section aria-labelledby="skus-title">
            <div className="op-group-title">
              <h2 id="skus-title">Sản phẩm của shop</h2>
              <span>{skus.data.length} SKU · dữ liệu mô phỏng</span>
            </div>

            {skus.data.length === 0 ? (
              <StateBlock title="Shop này chưa có SKU" text="Dữ liệu mô phỏng của shop không có sản phẩm nào." />
            ) : (
              <div className="op-table">
                <div className="op-row op-row--head" aria-hidden="true">
                  <span>Sản phẩm</span>
                  <span>Giá</span>
                  <span>Đánh giá</span>
                  <span>Tồn kho</span>
                  <span>Video</span>
                </div>
                {skus.data.map((sku) => (
                  <SkuRow key={sku.sku_id} shopId={shop.data.id} sku={sku} videoCount={videoCount(sku.sku_id)} />
                ))}
              </div>
            )}
            <p className="op-help op-mt-12">Bấm một sản phẩm để chọn video cho sản phẩm đó.</p>
          </section>
        </div>
      )}
    </OperatePage>
  )
}
