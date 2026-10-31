import { useState } from 'react'

import { FILLED, GLYPH, brandSvg } from './feed-glyphs'
import './feed-skins.css'

// The feed chrome drawn around the seller's real video, one component per preview skin. Each skin keeps the
// mockup-v2 layout (Shopee Video, Facebook Reels, Instagram Reels) and adds TikTok Shop / TikTok Ads.
// Purchase controls open the per-platform product sheet; they do not buy anything.

const money = (v) => (v == null ? '' : `${Number(v).toLocaleString('vi-VN')}₫`)
const initial = (name) => (name || 'S').trim().charAt(0).toUpperCase()

export function Glyph({ name }) {
  const svg = GLYPH[name] ?? FILLED[name] ?? ''
  return <span className="fg" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
}

export function BrandMark({ id, size = 18 }) {
  return <span className="fg" aria-hidden="true" dangerouslySetInnerHTML={{ __html: brandSvg(id, size) }} />
}

function RailItem({ glyph, label = '' }) {
  return (
    <span className="pf-rail-item">
      <span className="pf-rail-ic"><Glyph name={glyph} /></span>
      {label && <span className="pf-rail-lab">{label}</span>}
    </span>
  )
}

function Thumb({ sku, className }) {
  return (
    <span className={`${className} has-img`}>
      <img src={`/skus/${sku.sku_id}.jpg`} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
    </span>
  )
}

/** Caption = the seller's title plus hashtags (bold, as the real feeds show them); a click opens the caption panel. */
function Caption({ caption, hashtags, onEdit, className = 'js-cap', more = false }) {
  const empty = !caption && hashtags.length === 0
  return (
    <button type="button" className={`feed-tap ${className}`} onClick={onEdit} aria-label="Sửa tiêu đề và hashtag">
      <span className="od-clamp-2">
        {empty ? (
          <span className="studio-cap-empty">Chưa có caption · bấm để viết</span>
        ) : (
          <>
            {caption}
            {hashtags.map((t, i) => <b key={i}> {t}</b>)}
          </>
        )}
        {more && !empty && <span className="sv-more"> Xem thêm</span>}
      </span>
    </button>
  )
}

function ShopeeFeed({ sku, caption, hashtags, handle, shopName, music, onEdit, openSheet }) {
  const [cardOpen, setCardOpen] = useState(true)
  return (
    <div className="pf pf-shopee">
      <div className="sv-top">
        <span className="sv-top-l"><Glyph name="user" /><Glyph name="search" /></span>
        <span className="sv-tabs"><span>Video</span><span>Live</span><span className="is-on">Dành cho bạn</span></span>
        <span className="sv-top-r"><Glyph name="create" /></span>
      </div>
      <div className="pf-rail sv-rail">
        <span className="sv-avatar"><span>{initial(shopName)}</span><i><Glyph name="plus" /></i></span>
        <RailItem glyph="filledHeart" label="Thích" />
        <RailItem glyph="filledChat" label="Bình luận" />
        <RailItem glyph="filledShare" label="Chia sẻ" />
        <span className="pf-rail-item">
          <span className="sv-ask"><BrandMark id="shopee" size={30} /></span>
          <span className="pf-rail-lab">Hỏi</span>
        </span>
      </div>
      {sku && cardOpen && (
        <div className="sv-pop">
          <button type="button" className="sv-pop-x" onClick={() => setCardOpen(false)} aria-label="Đóng thẻ sản phẩm"><Glyph name="close" /></button>
          <div className="sv-pop-body">
            <button type="button" className="feed-tap sv-pop-edit" onClick={openSheet} aria-label="Xem sản phẩm"><Thumb sku={sku} className="pf-thumb sv-thumb" /></button>
            <div className="sv-card-info">
              <button type="button" className="feed-tap sv-name od-clamp-2" onClick={openSheet}>{sku.item_name}</button>
              <p className="sv-price od-nowrap">{money(sku.price_vnd)}</p>
              <div className="sv-actions">
                <button type="button" className="sv-cart" onClick={openSheet} aria-label="Thêm vào giỏ hàng"><Glyph name="cart" /></button>
                <button type="button" className="sv-buy" onClick={openSheet}>Mua ngay</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {sku && (
        <button type="button" className="sv-strip" onClick={openSheet} aria-label="Xem sản phẩm trong video">
          <span className="sv-strip-ic"><Glyph name="bag" /></span>
          <span className="sv-strip-sep" />
          <span className="od-truncate od-fill">{sku.item_name}</span>
          <Glyph name="chevD" />
        </button>
      )}
      <div className="sv-cap">
        <p className="sv-user">{handle}</p>
        <Caption caption={caption} hashtags={hashtags} onEdit={onEdit} className="js-cap" more />
        <p className="sv-sound">
          <Glyph name="music" />
          <span className="sv-strip-sep" />
          {music ?? <span className="od-truncate">Âm thanh - {handle}</span>}
          <Glyph name="chevR" />
        </p>
      </div>
      <nav className="sv-nav" aria-hidden="true">
        <span><Glyph name="home" /><em>Trang chủ</em></span>
        <span><Glyph name="flame" /><em>Xu hướng</em></span>
        <span className="is-on"><Glyph name="playSq" /><em>Live &amp; Video</em></span>
        <span><Glyph name="bell" /><em>Thông báo</em></span>
        <span><Glyph name="user" /><em>Tôi</em></span>
      </nav>
    </div>
  )
}

function FacebookFeed({ sku, caption, hashtags, shopName, music, onEdit, openSheet }) {
  return (
    <div className="pf pf-fb">
      <div className="fb-top">
        <span><Glyph name="back" /></span>
        <span className="fb-top-r"><Glyph name="search" /><Glyph name="camera" /><span className="fb-me" /></span>
      </div>
      <div className="pf-rail fb-rail">
        <RailItem glyph="thumb" label="Thích" />
        <RailItem glyph="chat" label="Bình luận" />
        <RailItem glyph="share" label="Chia sẻ" />
        <RailItem glyph="gift" label="Tặng" />
        <RailItem glyph="dots" />
      </div>
      <div className={sku ? 'fb-meta has-shop' : 'fb-meta'}>
        <p className="fb-user"><span className="fb-av">{initial(shopName)}</span><b>{shopName}</b><span className="fb-follow">· Theo dõi</span></p>
        <Caption caption={caption} hashtags={hashtags} onEdit={onEdit} />
        <p className="fb-chips">
          <span><Glyph name="music" />{music ?? 'Âm thanh gốc'}</span>
          <span>Quan hệ đối tác có trả phí</span>
        </p>
      </div>
      {sku && (
        <button type="button" className="fb-shop" onClick={openSheet} aria-label="Xem sản phẩm trong video">
          <Thumb sku={sku} className="pf-thumb fb-thumb" />
          <span className="fb-shop-txt">
            <b>Mua ngay</b>
            <span className="od-truncate">{sku.item_name}</span>
            <span className="fb-shop-link"><Glyph name="link" />shopee.vn · link liên kết</span>
          </span>
          <span className="fb-x"><Glyph name="close" /></span>
        </button>
      )}
      <div className="fb-comment">Thêm bình luận…</div>
    </div>
  )
}

function InstagramFeed({ sku, caption, hashtags, handle, shopName, music, onEdit, openSheet }) {
  return (
    <div className="pf pf-ig">
      <div className="ig-top"><b>Reels</b><Glyph name="chevD" /><span className="ig-top-r"><Glyph name="camera" /></span></div>
      <div className="pf-rail ig-rail">
        <RailItem glyph="heart" />
        <RailItem glyph="chat" />
        <RailItem glyph="send" />
        <RailItem glyph="dots" />
        <span className="ig-audio" />
      </div>
      <div className="ig-meta">
        {sku && (
          <button type="button" className="ig-tag" onClick={openSheet} aria-label="Xem sản phẩm trong video">
            <Glyph name="bag" /><span className="od-truncate">{sku.item_name}</span>
          </button>
        )}
        <p className="ig-user">
          <span className="ig-av">{initial(shopName)}</span><b>{handle}</b><span className="ig-verified" aria-label="Đã xác minh" /><span className="ig-follow">Theo dõi</span>
        </p>
        <p className="ig-audio-line"><Glyph name="music" /><span className="od-truncate">{music ?? `${handle} · Âm thanh gốc`}</span></p>
        <Caption caption={caption} hashtags={hashtags} onEdit={onEdit} />
      </div>
      <nav className="ig-nav" aria-hidden="true">
        <span><Glyph name="home" /></span>
        <span className="is-on"><Glyph name="reels" /></span>
        <span><Glyph name="send" /></span>
        <span><Glyph name="search" /></span>
        <span><i className="ig-me" /></span>
      </nav>
    </div>
  )
}

/** TikTok For You feed. `ads` swaps the gold product anchor for the in-feed ad CTA bar and marks the sponsor. */
function TikTokFeed({ sku, caption, hashtags, handle, shopName, music, ads, onEdit, openSheet }) {
  return (
    <div className={ads ? 'pf pf-tiktok pf-tiktok-ads' : 'pf pf-tiktok'}>
      <div className="tt-top">
        <span className="tt-live">LIVE</span>
        <span className="tt-tabs"><span>Đang theo dõi</span><span className="is-on">Dành cho bạn</span></span>
        <span className="tt-top-r"><Glyph name="search" /></span>
      </div>
      <div className="pf-rail tt-rail">
        <span className="tt-avatar"><span>{initial(shopName)}</span><i><Glyph name="plus" /></i></span>
        <RailItem glyph="filledHeart" label="Thích" />
        <RailItem glyph="filledChat" label="Bình luận" />
        <RailItem glyph="bookmark" label="Lưu" />
        <RailItem glyph="reply" label="Chia sẻ" />
        <span className="tt-disc" aria-hidden="true"><Glyph name="music" /></span>
      </div>
      {sku && !ads && (
        <button type="button" className="tt-anchor" onClick={openSheet} aria-label="Xem giỏ hàng gắn với video">
          <Glyph name="bagFill" /><span className="od-truncate od-fill">{sku.item_name}</span><Glyph name="chevR" />
        </button>
      )}
      <div className="tt-cap">
        {ads && <span className="tt-sponsor">Được tài trợ</span>}
        <p className="tt-user">{handle}</p>
        <Caption caption={caption} hashtags={hashtags} onEdit={onEdit} className="tt-text" more />
        <p className="tt-sound">
          <Glyph name="music" />
          {music ?? <span className="od-truncate">Âm thanh gốc - {handle}</span>}
        </p>
      </div>
      {sku && ads && (
        <div className="tt-cta">
          <span className="tt-cta-txt"><b>{shopName}</b><span className="od-truncate">{sku.item_name}</span></span>
          <button type="button" className="tt-cta-btn" onClick={openSheet}>Mua ngay</button>
        </div>
      )}
      <nav className="tt-nav" aria-hidden="true">
        <span className="is-on"><Glyph name="home" /><em>Trang chủ</em></span>
        <span><Glyph name="bag" /><em>Shop</em></span>
        <span className="tt-plus-cell"><span className="tt-plus"><b>+</b></span></span>
        <span><Glyph name="chat" /><em>Hộp thư</em></span>
        <span><Glyph name="user" /><em>Hồ sơ</em></span>
      </nav>
    </div>
  )
}

/** Per-platform product sheet, opened by tapping the product in the feed. */
function ProductSheet({ skin, sku, handle, shopName, onClose, onEditProduct, onOpenSku }) {
  const name = sku.item_name
  const price = money(sku.price_vnd)
  const close = <button type="button" className="ps-x" onClick={onClose} aria-label="Đóng"><Glyph name="close" /></button>
  let body
  if (skin === 'shopee') {
    body = (
      <>
        <div className="ps-head"><b>Xem sản phẩm (1)</b><span className="ps-head-r"><Glyph name="cart" />{close}</span></div>
        <div className="ps-list">
          <div className="ps-row">
            <Thumb sku={sku} className="pf-thumb ps-thumb" />
            <div className="ps-info">
              <p className="od-clamp-2">{name}</p>
              <div className="ps-buy-row"><span className="sv-price">{price}</span><span className="sv-actions"><span className="sv-cart"><Glyph name="cart" /></span><span className="sv-buy">Mua ngay</span></span></div>
            </div>
          </div>
        </div>
        <p className="ps-note">Giỏ hàng gốc của Shopee Video: người xem mua ngay không rời video.</p>
      </>
    )
  } else if (skin === 'fb') {
    body = (
      <>
        <div className="ps-head"><b>Bạn sắp rời Facebook</b>{close}</div>
        <div className="ps-list">
          <div className="ps-row">
            <Thumb sku={sku} className="pf-thumb ps-thumb ps-thumb-sm" />
            <div className="ps-info"><p className="od-clamp-2">{name}</p><p className="ps-link"><Glyph name="link" />shopee.vn</p></div>
          </div>
        </div>
        <span className="ps-btn ps-btn-fb">Mở liên kết</span>
        <p className="ps-note">Facebook Reels không có giỏ hàng gốc: người xem phải mở link affiliate sang Shopee.</p>
      </>
    )
  } else if (skin === 'ig') {
    body = (
      <>
        <span className="ps-grab" aria-hidden="true" />
        <div className="ps-head ps-head-c"><b>1 sản phẩm</b>{close}</div>
        <div className="ps-ig-grid">
          <div className="ps-ig-card">
            <Thumb sku={sku} className="pf-thumb ps-ig-thumb" />
            <div className="ps-ig-row">
              <span className="od-stack od-fill" style={{ '--od-gap': 0 }}>
                <span className="od-truncate ps-ig-name">{name}</span>
                <span className="ps-ig-shop">{handle}</span>
                <span className="ps-ig-price">{price}</span>
              </span>
              <Glyph name="bag" />
            </div>
          </div>
        </div>
        <p className="ps-note">Instagram tại Việt Nam không có thanh toán trong app: chạm sản phẩm → mở website.</p>
      </>
    )
  } else {
    const ads = skin === 'tiktok-ads'
    body = (
      <>
        <div className="ps-head"><b>{ads ? 'Quảng cáo · sản phẩm' : 'Sản phẩm trong video (1)'}</b>{close}</div>
        <div className="ps-list">
          <div className="ps-row">
            <Thumb sku={sku} className="pf-thumb ps-thumb" />
            <div className="ps-info"><p className="od-clamp-2">{name}</p><span className="tt-sheet-price">{price}</span></div>
          </div>
        </div>
        <span className="ps-btn ps-btn-tt">Mua ngay</span>
        <p className="ps-note">{ads ? 'Quảng cáo trả phí: người xem mua trong app qua nút Mua ngay.' : 'Giỏ hàng TikTok Shop: người xem mua ngay trong app, không rời video.'}</p>
      </>
    )
  }
  return (
    <>
      <div className="pf-scrim" onClick={onClose} aria-hidden="true" />
      <div className="pf-sheet" role="dialog" aria-label={`Sản phẩm trong video · ${shopName ?? ''}`}>
        {body}
        <div className="ps-foot">
          <button type="button" className="link-btn tiny" onClick={onEditProduct}>Sửa sản phẩm</button>
          <button type="button" className="link-btn tiny" onClick={onOpenSku}>Xem trên thị trường</button>
        </div>
      </div>
    </>
  )
}

/**
 * The feed for one preview skin, drawn over the video. Remount it (key by skin) to reset the open card and sheet.
 */
export function PhoneFeed({ skin, sku, caption, hashtags, handle, shopName, music, onEditCaption, onEditProduct, onOpenSku }) {
  const [sheet, setSheet] = useState(false)
  const openSheet = () => setSheet(true)
  const common = { sku, caption, hashtags, handle, shopName, music, onEdit: onEditCaption, openSheet }
  let feed
  if (skin === 'fb') feed = <FacebookFeed {...common} />
  else if (skin === 'ig') feed = <InstagramFeed {...common} />
  else if (skin === 'tiktok' || skin === 'tiktok-ads') feed = <TikTokFeed {...common} ads={skin === 'tiktok-ads'} />
  else feed = <ShopeeFeed {...common} />
  return (
    <>
      {feed}
      {sheet && sku && (
        <ProductSheet skin={skin} sku={sku} handle={handle} shopName={shopName} onClose={() => setSheet(false)} onEditProduct={onEditProduct} onOpenSku={onOpenSku} />
      )}
    </>
  )
}
