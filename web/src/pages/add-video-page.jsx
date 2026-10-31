import { useRef, useState } from 'react'
import { ArrowLeft, Upload } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useFetch } from '../hooks/use-fetch'
import { db, num, uploadVideo, vnd } from '../lib/api'
import { OperatePage, Skeleton, StateBlock } from './operate-shell'
import { SkuThumb } from './shop-products-page'

const enc = encodeURIComponent
const ACCEPT = '.mp4,.mov,.webm,.mkv'

const studioUrl = (shopId, videoId) => `/studio?shop=${enc(shopId)}&video=${enc(videoId)}`

/** local_file is relative to data/ ("SHOP001/x.mp4"). A bare file name is read from the shop's folder. */
const mediaPath = (video, shopId) => (video.local_file?.includes('/') ? video.local_file : `${shopId}/${video.local_file}`)

const formatDuration = (sec) => {
  if (!Number.isFinite(sec)) return null
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * One video of the shop. The frame is the file's own first frame (preload=metadata, seeked to 1 s), never a
 * generated thumbnail. The card opens Studio with this shop and video preselected.
 */
function VideoCard({ shopId, video, skuName, linked }) {
  const [duration, setDuration] = useState(null)
  const [broken, setBroken] = useState(false)
  const playable = Boolean(video.local_file)
  const posted = video.posted_at ? `Đã đăng ${video.posted_at}` : 'Chưa đăng'
  const body = (
    <>
      <div className="op-video-stage">
        {playable && !broken ? (
          <video
            src={`/media/${encodeURI(mediaPath(video, shopId))}#t=1`}
            preload="metadata"
            muted
            playsInline
            aria-label={`Khung hình đầu của ${video.product_label ?? video.id}`}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onError={() => setBroken(true)}
          />
        ) : (
          <span>{playable ? 'Không mở được file video' : 'Video không có file'}</span>
        )}
      </div>
      <div className="op-video-body">
        <p className="op-video-title">{video.product_label ?? video.id}</p>
        <p className="op-video-meta">
          {video.id}
          {formatDuration(duration) ? ` · ${formatDuration(duration)}` : ''} · {posted}
        </p>
        {!linked && <p className="op-video-sku" title="Studio dùng SKU của video này">SKU khác: {skuName ?? video.sku_id}</p>}
      </div>
    </>
  )

  if (!playable) {
    return <div className="op-video op-video--off" aria-disabled="true">{body}</div>
  }
  return (
    <Link to={studioUrl(shopId, video.id)} className="op-video" aria-label={`Mở Studio với video ${video.id}`}>
      {body}
    </Link>
  )
}

function UploadButton({ shopId, skuId }) {
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  async function onPick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setProgress(0)
    const form = new FormData()
    form.append('file', file)
    form.append('shop_id', shopId)
    form.append('sku_id', skuId)
    try {
      const video = await uploadVideo(form, setProgress)
      navigate(studioUrl(shopId, video.id))
    } catch (err) {
      setError(err.message)
      setProgress(null)
    }
  }

  return (
    <div>
      <div className="op-upload">
        <button
          type="button"
          className="op-btn op-btn--ghost"
          onClick={() => inputRef.current?.click()}
          disabled={progress !== null}
        >
          <Upload size={16} aria-hidden="true" />
          {progress === null ? 'Tải video khác lên' : `Đang tải ${progress}%`}
        </button>
        {progress !== null && (
          <div className="op-progress" role="progressbar" aria-label="Tiến độ tải lên" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
        <p className="op-upload-note">mp4, mov, webm, mkv</p>
      </div>
      <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={onPick} />
      {error && <p className="op-help op-help--error op-mt-12" role="alert">Tải lên lỗi: {error}</p>}
    </div>
  )
}

export default function AddVideoPage() {
  const { id, skuId } = useParams()
  const shop = useFetch(() => db(`/shops/${enc(id)}`), [id])
  const sku = useFetch(() => db(`/skus/${enc(skuId)}`), [skuId])
  const skus = useFetch(() => db(`/skus?shopId=${enc(id)}`), [id])
  const videos = useFetch(() => db(`/videos?shopId=${enc(id)}`), [id])

  const loading = shop.loading || sku.loading || skus.loading || videos.loading
  const failure = shop.error || sku.error || skus.error || videos.error
  const retry = () => {
    shop.reload()
    sku.reload()
    skus.reload()
    videos.reload()
  }
  const wrongShop = sku.data && sku.data.shop_id !== id
  const nameOf = new Map((skus.data ?? []).map((s) => [s.sku_id, s.item_name]))
  const all = videos.data ?? []
  const linked = all.filter((v) => v.sku_id === skuId)
  const others = all.filter((v) => v.sku_id !== skuId)

  return (
    <OperatePage step={3}>
      <Link to={`/shops/${enc(id)}`} className="op-back">
        <ArrowLeft size={16} aria-hidden="true" />
        Sản phẩm của {shop.data?.shop_name ?? id}
      </Link>

      <div className="op-page-head">
        <h1 className="op-title">Chọn video</h1>
        <p className="op-lede">Bấm một video để mở Studio.</p>
      </div>

      {loading && <Skeleton count={3} />}

      {!loading && failure && (
        <StateBlock
          tone="error"
          title="Không tải được video hoặc sản phẩm"
          text={`Kiểm tra json-server (cổng 3101) đang chạy. Chi tiết: ${failure.message}`}
          action={<button type="button" className="op-btn op-btn--ghost" onClick={retry}>Thử lại</button>}
        />
      )}

      {!loading && !failure && wrongShop && (
        <StateBlock tone="error" title="Sản phẩm này không thuộc shop đang chọn" text={`${skuId} thuộc ${sku.data.shop_id}.`} />
      )}

      {!loading && !failure && !wrongShop && sku.data && (
        <>
          <section className="op-sku-strip" aria-label="Sản phẩm đang chọn">
            <SkuThumb sku={sku.data} className="op-sku-strip-thumb" />
            <div>
              <p className="op-sku-strip-name">{sku.data.item_name}</p>
              <p className="op-row-sub">{sku.data.sku_id} · dữ liệu mô phỏng</p>
            </div>
            <dl className="op-sku-strip-facts">
              <div>
                <dt>Giá</dt>
                <dd>{vnd(sku.data.price_vnd)}</dd>
              </div>
              <div>
                <dt>Đánh giá</dt>
                <dd>{sku.data.rating ?? '–'}</dd>
              </div>
              <div>
                <dt>Tồn kho</dt>
                <dd>{num(sku.data.stock)}</dd>
              </div>
            </dl>
          </section>

          <div className="op-mt-20">
            <UploadButton shopId={id} skuId={skuId} />
          </div>

          <section aria-labelledby="linked-title" className="op-section-gap">
            <div className="op-group-title">
              <h2 id="linked-title">Video của SKU này</h2>
              <span>{linked.length}</span>
            </div>
            {linked.length === 0 ? (
              <StateBlock title="SKU này chưa có video" text="Tải lên, hoặc chọn video khác bên dưới." />
            ) : (
              <div className="op-video-grid">
                {linked.map((v) => (
                  <VideoCard key={v.id} shopId={id} video={v} linked />
                ))}
              </div>
            )}
          </section>

          {others.length > 0 && (
            <section aria-labelledby="other-title" className="op-section-gap">
              <div className="op-group-title">
                <h2 id="other-title">Video khác của shop</h2>
                <span>{others.length}</span>
              </div>
              <div className="op-video-grid">
                {others.map((v) => (
                  <VideoCard key={v.id} shopId={id} video={v} linked={false} skuName={nameOf.get(v.sku_id)} />
                ))}
              </div>
            </section>
          )}

          {all.length === 0 && (
            <StateBlock title="Shop này chưa có video" text="Tải video lên để bắt đầu." />
          )}
        </>
      )}
    </OperatePage>
  )
}
