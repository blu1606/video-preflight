import { useLayoutEffect, useRef, useState } from 'react'

import { markerTitle } from '../lib/labels'
import { activeRegions, fmtTime, isRangeMarker, issueHint, safeZoneWarning } from '../lib/timeline'
import { Icon } from './icon'
import { PHONE_STATUS } from './icons-data'
import { PANELS } from './edit-panels'
import { BrandMark, PhoneFeed } from './phone-feeds'
import { skinById } from './platform-skins'

const PHONE_H = 920 // bezel artwork height at zoom 1

/** The edit rail; like mockup-v2, the platform button wears the brand mark of the platform in view. */
function Rail({ panel, onPanel, video, skin }) {
  const badge = { products: video?.sku_id ? 1 : 0 }
  const missing = { caption: !video?.post?.caption }
  const brand = skinById(skin)?.brand
  return (
    <nav className="edit-rail" aria-label="Chỉnh sửa video và thiết lập">
      <ul>
        {PANELS.map((p) => (
          <li key={p.id}>
            <button type="button" className={`rail-btn${panel === p.id ? ' is-on' : ''}`} aria-pressed={panel === p.id} title={p.title} onClick={() => onPanel(panel === p.id ? null : p.id)}>
              <span className="rail-ic">
                {p.id === 'platform' && brand ? <BrandMark id={brand} size={20} /> : <Icon name={p.icon} className="" />}
                {badge[p.id] > 0 && <i className="rail-badge">{badge[p.id]}</i>}
                {missing[p.id] && <i className="rail-dot" aria-label="còn trống" />}
              </span>
              <span className="rail-lab">{p.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Timeline under the phone: real markers only (issues red, strong answers green, missing-element hints hollow). */
function Timeline({ duration, current, issues, strengths, onSeek }) {
  const trackRef = useRef(null)
  const pos = (t) => `${Math.min(100, Math.max(0, (t / (duration || 1)) * 100))}%`
  const seekFromClick = (e) => {
    const r = trackRef.current.getBoundingClientRect()
    onSeek(((e.clientX - r.left) / r.width) * duration)
  }
  return (
    <div className="tl-wrap">
      <div
        ref={trackRef}
        className="timeline"
        role="slider"
        tabIndex={0}
        aria-label="Thanh thời gian video"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration || 0)}
        aria-valuenow={Math.round(current)}
        onClick={seekFromClick}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onSeek(Math.min(duration, current + 1))
          if (e.key === 'ArrowLeft') onSeek(Math.max(0, current - 1))
        }}
      >
        <div className="tl-track" />
        <div className="tl-playhead" style={{ left: pos(current) }} />
        {strengths.map((m) => (
          <button key={`ok-${m.id}`} type="button" className="mk is-ok" style={{ left: pos(m.t) }} aria-label={`${m.label} điểm mạnh ở ${fmtTime(m.t)}`} title={`${m.label} · ${Math.round(m.value)}`} onClick={(e) => { e.stopPropagation(); onSeek(m.t) }}>
            <span className="mk-shape" aria-hidden="true" />
          </button>
        ))}
        {issues.map((m, i) => {
          const hint = issueHint(m)
          const range = isRangeMarker(m)
          const width = range ? `${Math.max(1, ((m.t_end - m.t_start) / (duration || 1)) * 100)}%` : undefined
          const ghostHint = m.kind === 'ghost' ? ' (gợi ý vị trí)' : ''
          return (
            <button key={`${m.id}-${i}`} type="button" className={`mk ${m.kind === 'ghost' ? 'is-ghost' : 'is-bad'}${range ? ' is-range' : ''}`} style={{ left: pos(m.t_start), width }} aria-label={`${hint} ở ${fmtTime(m.t_start)}`} title={`${hint}${ghostHint}`} onClick={(e) => { e.stopPropagation(); onSeek(m.t_start) }}>
              <span className="mk-shape" aria-hidden="true">{m.kind === 'ghost' || range ? '' : '!'}</span>
            </button>
          )
        })}
      </div>
      <p className="tl-legend tiny">
        <span><i className="lg-bad">!</i>cần sửa</span>
        <span><i className="lg-ok" />điểm mạnh</span>
        <span><i className="lg-ghost" />gợi ý vị trí (video đang thiếu)</span>
      </p>
    </div>
  )
}

/** Background song under the caption (ShazamIO match, an unofficial API). */
function MusicChip({ music }) {
  const track = music?.status === 'REAL' ? music.value : null
  if (!track) return <span className="studio-music-chip is-empty">♪ chưa nhận diện được nhạc</span>
  return <span className="studio-music-chip">♪ {track.title}{track.artist ? ` · ${track.artist}` : ''}</span>
}

/**
 * Middle column: tool rail beside an iPhone 16 Pro running the real video under the feed chrome of the platform in
 * view (Shopee Video, TikTok Shop, TikTok Ads, Facebook or Instagram Reels), the play bar and the marker timeline.
 * Clicking the caption on the phone opens the caption panel; tapping the product opens its platform sheet.
 */
export function PhoneStage({ video, shop, sku, onOpenSku, panel, onPanel, videoRef, onSeek, issues, strengths, fallbackDuration, music, skin }) {
  const [showRegions, setShowRegions] = useState(true)
  const [openRegion, setOpenRegion] = useState(null)
  const stageRef = useRef(null)
  const [zoom, setZoom] = useState(0.7)
  const [time, setTime] = useState({ current: 0, duration: 0, playing: false })
  const duration = time.duration || fallbackDuration || 0
  const boxed = issues.filter((m) => m.region?.box)
  const regions = showRegions ? activeRegions(boxed, time.current) : []

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return undefined
    const fit = () => setZoom(Math.max(0.42, Math.min(0.9, (el.clientHeight - 8) / PHONE_H)))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const toggle = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  const caption = video?.post?.caption ?? ''
  const hashtags = (video?.post?.hashtags ?? []).map((t) => `#${t}`)
  const shopName = shop?.shop_name ?? 'Shop'
  const handle = `@${shopName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')}`

  return (
    <section className="col col-mid studio-mid" aria-label="Video và thiết lập bài đăng" style={{ '--pz': zoom }}>
      <div className="mid">
        <Rail panel={panel} onPanel={onPanel} video={video} skin={skin} />
        <div className="mid-main">
          <div className="phone-stage" ref={stageRef}>
            <div className={`iphone${video?.local_file ? '' : ' is-empty'}`}>
              <section className="ip-screen is-dark">
                <div className="ip-content">
                  <div className="ip-video">
                    {video?.local_file ? (
                      <video
                        ref={videoRef}
                        className="studio-video"
                        src={`/media/${video.local_file}`}
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={(e) => {
                          const d = e.currentTarget.duration
                          setTime((t) => ({ ...t, duration: d || t.duration }))
                        }}
                        onTimeUpdate={(e) => {
                          const c = e.currentTarget.currentTime
                          setTime((t) => ({ ...t, current: c }))
                        }}
                        onPlay={() => setTime((t) => ({ ...t, playing: true }))}
                        onPause={() => setTime((t) => ({ ...t, playing: false }))}
                      />
                    ) : (
                      <div className="studio-novideo">
                        <Icon name="video-slash" />
                        <p>{video ? 'Video này chưa có file để phát. Chọn video khác hoặc tải video mới.' : 'Chọn video ở nút Video bên trái.'}</p>
                      </div>
                    )}
                    {/* boxes are fractions of the video frame, so they sit in the video's own box, not the whole screen */}
                    {regions.length > 0 && (
                      <div className="studio-regions" aria-live="polite">
                        {regions.map((m) => {
                          const [x, y, w, h] = m.region.box
                          const open = openRegion === m.id
                          const warning = safeZoneWarning(m.region)
                          return (
                            <button key={m.id} type="button" aria-expanded={open} onClick={() => setOpenRegion(open ? null : m.id)} className={`studio-region is-${m.severity}${open ? ' is-open' : ''}${y > 0.55 ? ' is-up' : ''}`} style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}>
                              <span className="studio-region-tag">{m.region.label || markerTitle(m)} · AI ước lượng</span>
                              <span className="studio-region-card">
                                {m.region.observation && <b>{m.region.observation}</b>}
                                {m.region.fix_here && <span>{m.region.fix_here}</span>}
                                {warning && <span className="studio-region-warn">{warning} · ước lượng theo khung app</span>}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <button type="button" className="ip-tap" onClick={toggle} aria-label="Phát hoặc tạm dừng video" />
                  <PhoneFeed
                    key={skin}
                    skin={skin}
                    sku={sku}
                    caption={caption}
                    hashtags={hashtags}
                    handle={handle}
                    shopName={shopName}
                    music={music !== undefined ? <MusicChip music={music} /> : null}
                    onEditCaption={() => onPanel('caption')}
                    onEditProduct={() => onPanel('products')}
                    onOpenSku={onOpenSku}
                  />
                  {boxed.length > 0 && (
                    <button type="button" className="ph-ovl" aria-pressed={showRegions} onClick={() => setShowRegions((s) => !s)}>
                      Lớp phủ: {showRegions ? 'bật' : 'tắt'}
                    </button>
                  )}
                </div>
                <div dangerouslySetInnerHTML={{ __html: PHONE_STATUS }} className="studio-chrome" />
              </section>
            </div>
          </div>
          <div className="player-bar">
            <button type="button" className="btn-icon" onClick={toggle} aria-label={time.playing ? 'Tạm dừng' : 'Phát'} disabled={!video?.local_file}>
              <Icon name="play" />
            </button>
            <span className="mono">{fmtTime(time.current)} / {fmtTime(duration)}</span>
            <span className="tiny muted od-fill od-truncate">{video?.local_file ?? 'không có file'}</span>
          </div>
          <Timeline duration={duration} current={time.current} issues={issues} strengths={strengths} onSeek={onSeek} />
        </div>
      </div>
    </section>
  )
}
