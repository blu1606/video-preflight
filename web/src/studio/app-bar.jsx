import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { AnalysisOptionsPanel } from '../components/analysis-options-panel'
import { Icon } from './icon'

/** Small anchored menu that closes on outside click or Escape. */
function Menu({ label, className, buttonContent, children, align = 'start' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="studio-menu" ref={ref}>
      <button type="button" className={className} aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}>
        {buttonContent}
      </button>
      {open && (
        <div className={`studio-pop is-${align}`} role="menu">
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  )
}

/**
 * mockup-v2's single app bar: brand, shop picker (with its profile), the video and SKU under test, the two
 * views, run status, saved runs and the analysis options.
 */
export function AppBar({ shops, shop, onShop, onShopProfile, videos, video, sku, skus = [], onSelectVideo, onUpload, uploading, onOpenAtlas, tab, onTab, canFix, running, runLabel, history, selectedRunId, onRun, options, onOptions, extractionState }) {
  const fileRef = useRef(null)
  return (
    <header className="hdr" aria-label="Thanh điều hướng">
      <div className="nav-row app-bar">
        <Link className="brand" to="/" aria-label="Preflight">Preflight</Link>
        <span className="bar-sep" aria-hidden="true" />

        <Menu
          label="Chọn shop"
          className="ctx-sku studio-shop-btn"
          buttonContent={
            <>
              <span className="od-stack" style={{ '--od-gap': 0 }}>
                <span className="tiny muted">Shop</span>
                <strong className="od-truncate">{shop?.shop_name ?? 'Chọn shop'}</strong>
              </span>
              <span aria-hidden="true" className="ctx-caret">▾</span>
            </>
          }
        >
          {(close) => (
            <ul className="studio-menu-list">
              {shops.map((s) => (
                <li key={s.id}>
                  <button type="button" role="menuitemradio" aria-checked={s.id === shop?.id} onClick={() => { onShop(s.id); close() }}>
                    <strong>{s.shop_name}</strong>
                    <span className="tiny muted">{s.shop_id} · {s.main_category}</span>
                  </button>
                </li>
              ))}

            </ul>
          )}
        </Menu>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onShopProfile} disabled={!shop}>
          Hồ sơ shop
        </button>

        <span className="bar-sep" aria-hidden="true" />
        <Menu
          label="Chọn video"
          className="ctx-sku studio-ctx"
          buttonContent={
            <>
              <span className="sku-thumb has-img ctx-thumb" aria-hidden="true">
                {sku && <img src={`/skus/${sku.sku_id}.jpg`} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />}
              </span>
              <span className="od-stack" style={{ '--od-gap': 0 }}>
                <strong className="od-truncate">{sku?.item_name ?? video?.product_label ?? 'Chọn video'}</strong>
                <span className="tiny muted od-truncate">{video ? `${video.id} · ${video.stage === 'prepublish' ? 'chưa đăng' : 'đã đăng'}` : `${videos.length} video của shop`}</span>
              </span>
              <span aria-hidden="true" className="ctx-caret">▾</span>
            </>
          }
        >
          {(close) => (
            <ul className="studio-menu-list">
              {videos.map((v) => (
                <li key={v.id}>
                  <button type="button" role="menuitemradio" aria-checked={v.id === video?.id} onClick={() => { onSelectVideo(v.id); close() }}>
                    <strong>{skus.find((s) => s.sku_id === v.sku_id)?.item_name ?? v.product_label ?? v.id}</strong>
                    <span className="tiny muted">
                      {v.id} · {v.stage === 'prepublish' ? 'chưa đăng' : 'đã đăng'}{v.local_file ? '' : ' · không có file'}
                    </span>
                  </button>
                </li>
              ))}
              {videos.length === 0 && <li className="tiny muted studio-menu-note">Shop này chưa có video.</li>}
            </ul>
          )}
        </Menu>
        <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska" hidden onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = '' }} />
        <button type="button" className="btn btn-sm btn-secondary studio-upload" onClick={() => fileRef.current?.click()} disabled={!shop || uploading != null}>
          <Icon name="document-upload" /> {uploading != null ? `Đang tải ${uploading}%` : 'Tải video lên'}
        </button>
        <button type="button" className="btn btn-sm btn-secondary studio-upload" onClick={onOpenAtlas}>
          <Icon name="chart-2" /> Kho dữ liệu
        </button>

        <div className="view-tabs" role="tablist" aria-label="Chế độ xem">
          <button type="button" role="tab" aria-selected={tab === 'check'} onClick={() => onTab('check')}>Kiểm tra</button>
          <button type="button" role="tab" aria-selected={tab === 'fix'} onClick={() => onTab('fix')} disabled={!canFix} title={canFix ? undefined : 'Cần phân tích video trước'}>
            Sửa &amp; so sánh
          </button>
        </div>
        <span className="hdr-spacer" />
        {running && (
          <span className="bar-status od-fixed" role="status">
            <span className="spin" aria-hidden="true" />
            <span>{runLabel}</span>
          </span>
        )}
        <Menu label="Lượt chạy đã lưu" className="btn btn-sm btn-ghost od-fixed" buttonContent="Lượt chạy" align="end">
          {(close) => (
            <ul className="studio-menu-list">
              {history.length === 0 && <li className="tiny muted studio-menu-note">Video này chưa có lượt chạy nào.</li>}
              {history.slice(0, 12).map((a) => (
                <li key={a.id}>
                  <button type="button" role="menuitemradio" aria-checked={a.id === selectedRunId} onClick={() => { onRun(a.id); close() }}>
                    <strong>#{a.id} · {a.result?.overall?.score != null ? `${Math.round(a.result.overall.score)}/100` : 'chưa có điểm tổng'}</strong>
                    <span className="tiny muted">{new Date(a.createdAt).toLocaleString('vi-VN')} · {a.result?.rubric}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Menu>
        <Menu label="Tuỳ chọn phân tích" className="more-btn" buttonContent={<Icon name="setting-4" />} align="end">
          <div className="studio-options">
            <AnalysisOptionsPanel options={options} onChange={onOptions} extractionState={extractionState} />
          </div>
        </Menu>
      </div>
    </header>
  )
}
