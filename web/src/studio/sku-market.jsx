import { useEffect, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'

import { useFetch } from '../hooks/use-fetch'
import { compactVnd, db, marketSnapshot, num } from '../lib/api'
import { CLAIM_LABEL, dimensionLabel } from '../lib/labels'
import { Icon } from './icon'
import { MARKET_CHANNELS, skuMarketView } from './studio-model'

const vnd = (v) => (v == null ? '–' : `${Math.round(v).toLocaleString('vi-VN')}₫`)
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`)
const CHANNEL_COLOR = { tiktok: '#1f2329', shopee: '#ee4d2d', web: '#1f5fbf' }
const SKU_CRITERIA = /^S\d/

/** Price strip: every crawled listing as a dot on one price axis per channel, the SKU's own price as a line. */
function PriceStrip({ view, ownPrice, compact = false }) {
  if (!view?.priceRange) return null
  const [lo, hi] = view.priceRange
  const W = compact ? 360 : 640
  const pad = 12
  const x = (p) => pad + ((p - lo) / Math.max(1, hi - lo)) * (W - 2 * pad)
  const channels = compact ? [{ id: 'all', label: '' }] : MARKET_CHANNELS
  const rowH = compact ? 30 : 34
  const H = channels.length * rowH + 18
  return (
    <svg className="studio-strip" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Giá SKU ${vnd(ownPrice)} so với ${view.rows.length} listing đã cào`}>
      {channels.map((c, i) => {
        const y = i * rowH + rowH / 2
        const dots = view.rows.filter((r) => r.price != null && (c.id === 'all' || r.channel === c.id))
        return (
          <g key={c.id}>
            <line x1={pad} x2={W - pad} y1={y} y2={y} className="studio-strip-axis" />
            {!compact && <text x={pad} y={y - 9} className="studio-strip-lab">{c.label}</text>}
            {dots.map((r, k) => (
              <circle key={k} cx={x(r.price)} cy={y} r={r.likeForLike ? 5 : 4} fill={r.likeForLike ? CHANNEL_COLOR[r.channel] : 'none'} stroke={CHANNEL_COLOR[r.channel]} strokeWidth="1.5" opacity={r.likeForLike ? 0.85 : 0.6}>
                <title>{`${r.title} · ${vnd(r.price)}${r.likeForLike ? '' : ' · không cùng loại'}`}</title>
              </circle>
            ))}
          </g>
        )
      })}
      {ownPrice != null && (
        <g>
          <line x1={x(ownPrice)} x2={x(ownPrice)} y1="2" y2={H - 14} className="studio-strip-own" />
          <text x={x(ownPrice)} y={H - 2} textAnchor="middle" className="studio-strip-own-lab">SKU {vnd(ownPrice)}</text>
        </g>
      )}
    </svg>
  )
}

/** Teaser in the result column: the strip itself invites the click into the full SKU view. */
export function SkuTeaser({ sku, onOpen }) {
  const snap = useFetch(() => (sku ? marketSnapshot(sku.sku_id) : Promise.resolve(null)), [sku?.sku_id])
  if (!sku) return null
  const view = skuMarketView(snap.data, sku.price_vnd)
  return (
    <section className="studio-sku-teaser" aria-label="SKU trên thị trường">
      <button type="button" className="studio-sku-teaser-btn" onClick={onOpen}>
        <span className="studio-sku-teaser-head">
          <img src={`/skus/${sku.sku_id}.jpg`} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
          <span className="od-fill">
            <strong className="od-truncate">SKU trên thị trường</strong>
            <span className="tiny muted od-truncate">{sku.item_name}</span>
          </span>
          <span className="link-btn tiny">Xem phân tích <Icon name="arrow-right" /></span>
        </span>
        {view ? (
          <>
            <PriceStrip view={view} ownPrice={sku.price_vnd} compact />
            <span className="tiny">
              Rẻ hơn <b>{pct(view.pricierShare)}</b> listing cùng loại ({view.comparable}) · <Icon name="star" className="ic studio-star" label="rating" /> {sku.rating} · {num(sku.rating_count)} đánh giá
            </span>
          </>
        ) : (
          <span className="tiny muted">{snap.loading ? 'Đang tải dữ liệu thị trường…' : 'SKU này chưa có dữ liệu thị trường đã cào.'}</span>
        )}
      </button>
    </section>
  )
}

/** Full SKU view: market position, demand, reviews, sales, claims vs listing, and the criteria they feed. */
export function SkuMarketSheet({ sku, result, onClose, onOpenQuestion }) {
  const ref = useRef(null)
  const [onlyLike, setOnlyLike] = useState(true)
  const snap = useFetch(() => marketSnapshot(sku.sku_id), [sku.sku_id])
  const reviews = useFetch(() => db(`/skuReviews/${encodeURIComponent(sku.sku_id)}`).catch(() => null), [sku.sku_id])
  const daily = useFetch(() => db(`/skuDailyMetrics?sku_id=${encodeURIComponent(sku.sku_id)}&_sort=date&_order=asc`), [sku.sku_id])

  useEffect(() => {
    ref.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const view = skuMarketView(snap.data, sku.price_vnd)
  const rows = (view?.rows ?? []).filter((r) => !onlyLike || r.likeForLike)
  const scatter = rows.filter((r) => r.price != null && r.sold != null)
  const questions = (result?.decisions?.questions ?? []).filter((q) => SKU_CRITERIA.test(q.id) && q.type === 'score')
  const quantitative = (result?.scores ?? []).find((g) => g.name === 'sku_market')?.criteria?.filter((c) => !/^S0/.test(c.id)) ?? []
  const claims = result?.claims_verdicts ?? []
  const rev = reviews.data
  const topics = (() => {
    try {
      return Array.isArray(rev?.negative_topics) ? rev.negative_topics : JSON.parse(rev?.negative_topics ?? '[]')
    } catch {
      return []
    }
  })()

  return (
    <div className="deep-modal">
      <div className="deep-scrim" onClick={onClose} />
      <section ref={ref} className="deep-dialog studio-sku-sheet" role="dialog" aria-modal="true" aria-labelledby="skuTitle" tabIndex={-1}>
        <header className="ep-head studio-sku-sheet-head">
          <img src={`/skus/${sku.sku_id}.jpg`} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
          <div className="od-fill">
            <h2 id="skuTitle">{sku.item_name}</h2>
            <p className="tiny muted">
              {sku.sku_id} · {vnd(sku.price_vnd)} (gốc {vnd(sku.original_price_vnd)}) · ngành {sku.category} · tồn kho {num(sku.stock)}
            </p>
          </div>
          <button type="button" className="ep-x" onClick={onClose} aria-label="Đóng"><Icon name="close" /></button>
        </header>

        <div className="studio-sku-grid">
          <section className="studio-sku-card is-wide">
            <h3 className="studio-sub">Vị trí giá trên thị trường</h3>
            {view ? (
              <>
                <p>
                  SKU giá <b>{vnd(sku.price_vnd)}</b>, rẻ hơn <b>{pct(view.pricierShare)}</b> trong {view.comparable} listing cùng loại · trung vị {vnd(view.median)}.
                </p>
                <PriceStrip view={view} ownPrice={sku.price_vnd} />
                <p className="tiny muted">
                  Chấm đặc = cùng loại (like-for-like), chấm rỗng = khác loại. Từ khoá «{view.keyword}» · cào {view.crawledAt} · {typeof view.source === 'string' ? view.source : 'nhiều nguồn'}. Dữ liệu cào thật.
                </p>
              </>
            ) : (
              <p className="tiny muted">{snap.loading ? 'Đang tải…' : 'SKU này chưa có dữ liệu thị trường đã cào.'}</p>
            )}
          </section>

          {view && (
            <section className="studio-sku-card">
              <h3 className="studio-sub">Nhu cầu trên TikTok Shop (FastMoss)</h3>
              <dl className="studio-kpis">
                <div><dt>Video liên quan</dt><dd>{num(view.tiktok.videoCount)}</dd></div>
                <div><dt>Bán 28 ngày</dt><dd>{num(view.tiktok.units28d)}</dd></div>
                <div><dt>Bán 7 ngày</dt><dd>{num(view.tiktok.units7d)}</dd></div>
                <div><dt>Đà 7 ngày / 28 ngày</dt><dd>{view.tiktok.momentum ?? '–'}×</dd></div>
              </dl>
              <p className="tiny muted">Theo từ khoá, toàn ngành trên TikTok Shop VN. Cần xin phép FastMoss trước khi trình chiếu công khai.</p>
            </section>
          )}

          {scatter.length > 0 && (
            <section className="studio-sku-card">
              <h3 className="studio-sub">Giá và số đã bán của đối thủ</h3>
              <div className="studio-chart">
                <ResponsiveContainer width="100%" height={220}>
                  <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                    <CartesianGrid stroke="#eceef1" />
                    <XAxis type="number" dataKey="price" name="Giá" tickFormatter={compactVnd} tick={{ fontSize: 12 }} />
                    <YAxis type="number" dataKey="sold" name="Đã bán" tick={{ fontSize: 12 }} width={56} />
                    <ZAxis range={[60, 60]} />
                    <Tooltip formatter={(v, n) => (n === 'Giá' ? vnd(v) : num(v))} labelFormatter={() => ''} />
                    <Scatter data={scatter} fill="#ee4d2d" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="tiny muted">Chỉ các listing có số đã bán (chủ yếu TikTok Shop).</p>
            </section>
          )}

          <section className="studio-sku-card">
            <h3 className="studio-sub">Đánh giá của người mua</h3>
            {rev ? (
              <>
                <dl className="studio-kpis">
                  <div><dt>Rating</dt><dd><Icon name="star" className="ic studio-star" label="rating" /> {sku.rating}</dd></div>
                  <div><dt>Số đánh giá</dt><dd>{num(rev.review_count)}</dd></div>
                </dl>
                <div className="studio-ratio" aria-label={`Tích cực ${pct(rev.positive_ratio)}`}>
                  <span style={{ width: pct(rev.positive_ratio) }} />
                </div>
                <p className="tiny">Tích cực {pct(rev.positive_ratio)} · chủ đề tiêu cực: {topics.length ? topics.join(', ') : 'không có'}</p>
              </>
            ) : (
              <p className="tiny muted">Chưa có dữ liệu đánh giá.</p>
            )}
          </section>

          <section className="studio-sku-card">
            <h3 className="studio-sub">Bán theo ngày (30 ngày)</h3>
            {daily.data?.length ? (
              <div className="studio-chart">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={daily.data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                    <CartesianGrid stroke="#eceef1" />
                    <XAxis dataKey="date" tickFormatter={(d) => String(d).slice(5)} tick={{ fontSize: 12 }} minTickGap={24} />
                    <YAxis tick={{ fontSize: 12 }} width={40} />
                    <Tooltip />
                    <Line type="monotone" dataKey="units_ordered" name="Đơn vị bán" stroke="#ee4d2d" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="product_page_views" name="Lượt xem trang" stroke="#9aa1ab" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="tiny muted">Chưa có số liệu theo ngày.</p>
            )}
          </section>

          <section className="studio-sku-card is-wide">
            <h3 className="studio-sub">Claim trong video so với listing</h3>
            {claims.length ? (
              <ul className="studio-claims">
                {claims.map((c, i) => (
                  <li key={i}>
                    <p>
                      «{c.claim}» <span className={`studio-status is-${c.verdict === 'supported' ? 'real' : c.verdict === 'contradicts' ? 'missing' : 'mock'}`}>{CLAIM_LABEL[c.verdict] ?? c.verdict}</span>
                    </p>
                    {c.listing_evidence && <p className="tiny muted">Listing ghi: {c.listing_evidence}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tiny muted">Lần chạy này chưa đối chiếu claim với listing (bật "LLM đối chiếu claim" trong tuỳ chọn).</p>
            )}
          </section>

          <section className="studio-sku-card is-wide">
            <h3 className="studio-sub">Tiêu chí dùng dữ liệu này</h3>
            <ul className="studio-sku-crit">
              {questions.map((q) => (
                <li key={q.id}>
                  <button type="button" className="studio-sku-crit-btn" onClick={() => onOpenQuestion(q.id)}>
                    <span className="studio-qid">{q.id}</span> {dimensionLabel(q.dimension, q.id)}
                    <strong>{q.value == null ? '–' : Math.round(q.value)}</strong>
                  </button>
                </li>
              ))}
              {quantitative.map((c) => (
                <li key={c.id}>
                  <span className="studio-sku-crit-btn is-static">
                    <span className="studio-qid">{c.id}</span> {c.name}
                    {c.calibration?.status && <span className="tiny muted"> · mốc {c.calibration.status}</span>}
                    <strong>{c.score == null ? '–' : Math.round(c.score)}</strong>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {view && (
            <section className="studio-sku-card is-wide">
              <div className="studio-sku-table-head">
                <h3 className="studio-sub">Listing đã cào ({rows.length})</h3>
                <label className="studio-check tiny">
                  <input type="checkbox" checked={onlyLike} onChange={(e) => setOnlyLike(e.target.checked)} /> Chỉ cùng loại
                </label>
              </div>
              <div className="studio-table-wrap">
                <table className="studio-table">
                  <thead>
                    <tr><th>Sản phẩm</th><th>Kênh</th><th className="is-num">Giá</th><th className="is-num">Đã bán</th><th className="is-num">Rating</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> : r.title}</td>
                        <td>{r.platform}</td>
                        <td className="is-num">{vnd(r.price)}</td>
                        <td className="is-num">{r.sold != null ? num(r.sold) : (r.soldDisplay ?? '–')}</td>
                        <td className="is-num">{r.rating ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  )
}
