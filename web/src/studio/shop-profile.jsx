import { useEffect, useRef, useState } from 'react'

import { GmvOrdersChart, TrafficChart } from '../components/shop-context-card'
import { useFetch } from '../hooks/use-fetch'
import { useShopDaily } from '../hooks/use-shop-daily'
import { compactVnd, db, num, runAnalysis } from '../lib/api'
import { CONFIDENCE_LABELS, DIAGNOSIS_AREA_LABELS, scenarioLabel } from '../lib/labels'
import { Icon } from './icon'

const SHOP_GROUPS = { shop_health: 'Sức khoẻ shop', sku_quality: 'Chất lượng SKU', sales_efficiency: 'Hiệu quả bán', video_conversion: 'Video ra đơn' }
const pct = (x) => (x == null ? '–' : `${(x * 100).toFixed(1)}%`)

const latestDiagnosis = (shopId) =>
  db(`/analyses?kind=shop_diagnosis&targetId=${encodeURIComponent(shopId)}&_sort=id&_order=desc&_limit=1`).then((rows) => rows[0] ?? null)

/**
 * Shop profile sheet: the shop's figures, its rule-based health and diagnosis, GMV/orders and traffic.
 */
export function ShopProfile({ shop, onClose }) {
  const ref = useRef(null)
  const daily = useShopDaily(shop.id)
  const saved = useFetch(() => latestDiagnosis(shop.id), [shop.id])
  const [running, setRunning] = useState(null)

  useEffect(() => {
    ref.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const diagnose = async () => {
    setRunning('running')
    try {
      await runAnalysis(`/shops/${encodeURIComponent(shop.id)}/diagnose`)
      setRunning(null)
      saved.reload()
    } catch (e) {
      setRunning({ error: String(e.message) })
    }
  }

  const analysis = saved.data
  const groups = analysis?.result?.scores ?? []
  const diag = analysis?.result?.diagnosis

  return (
    <div className="studio-sheet-wrap" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section ref={ref} className="studio-sheet" role="dialog" aria-modal="true" aria-labelledby="shopTitle" tabIndex={-1}>
        <header className="ep-head">
          <div>
            <h2 id="shopTitle">{shop.shop_name}</h2>
            <p className="tiny muted">{shop.shop_id} · {scenarioLabel(shop.scenario)} · ngành {shop.main_category}</p>
          </div>
          <button type="button" className="ep-x" onClick={onClose} aria-label="Đóng hồ sơ shop"><Icon name="close" /></button>
        </header>
        <div className="studio-sheet-body">

          <dl className="studio-kpis is-4">
            <div><dt>GMV 30 ngày</dt><dd>{compactVnd(shop.gmv_30d_vnd)}</dd></div>
            <div><dt>Đơn 30 ngày</dt><dd>{num(shop.orders_30d)}</dd></div>
            <div><dt>Rating shop</dt><dd><Icon name="star" className="ic studio-star" label="rating" /> {shop.shop_rating}</dd></div>
            <div><dt>Lượt vào shop</dt><dd>{num(shop.shop_visits_30d)}</dd></div>
            <div><dt>Giao trễ</dt><dd>{pct(shop.late_shipment_rate_30d)}</dd></div>
            <div><dt>Huỷ đơn</dt><dd>{pct(shop.cancellation_rate_30d)}</dd></div>
            <div><dt>Trả hàng</dt><dd>{pct(shop.return_rate_30d)}</dd></div>
            <div><dt>Tuổi shop</dt><dd>{num(shop.shop_age_days)} ngày</dd></div>
          </dl>

          <h3 className="studio-sub">Sức khoẻ shop theo luật</h3>
          {saved.loading ? (
            <p className="tiny muted">Đang tải…</p>
          ) : analysis ? (
            <>
              <ul className="studio-shop-groups">
                {groups.map((g) => (
                  <li key={g.name}>
                    <span>{SHOP_GROUPS[g.name] ?? g.name}</span>
                    <span className="meter studio-meter" aria-hidden="true"><span style={{ width: `${g.score ?? 0}%` }} /></span>
                    <strong>{g.score == null ? '–' : Math.round(g.score)}</strong>
                  </li>
                ))}
              </ul>
              {diag && (
                <div className="pn-note">
                  <p><strong>Chẩn đoán:</strong> {DIAGNOSIS_AREA_LABELS[diag.primary_issue] ?? diag.primary_issue ?? diag.status}{diag.confidence ? ` · độ tin cậy ${CONFIDENCE_LABELS[diag.confidence] ?? diag.confidence}` : ''}</p>
                  {(diag.findings ?? []).slice(0, 3).map((f) => (
                    <p key={f.area} className="tiny">• {f.root_cause} → {f.action}</p>
                  ))}
                </div>
              )}
              <p className="tiny muted">Lần chẩn đoán #{analysis.id}. Sức khoẻ shop là bối cảnh của shop, không tính vào điểm tổng của video.</p>
            </>
          ) : (
            <p className="tiny muted">Shop này chưa được chẩn đoán.</p>
          )}
          <button type="button" className="btn btn-secondary" onClick={diagnose} disabled={running === 'running'}>
            <Icon name="refresh-2" /> {running === 'running' ? 'Đang chẩn đoán…' : 'Chẩn đoán lại (miễn phí, theo luật)'}
          </button>
          {running?.error && <p className="tiny studio-err">{running.error}</p>}

          <h3 className="studio-sub">GMV và đơn theo ngày</h3>
          {daily.data?.length ? <GmvOrdersChart rows={daily.data} /> : <p className="tiny muted">Chưa có số liệu theo ngày.</p>}
          <h3 className="studio-sub">Lượt vào shop theo nguồn</h3>
          {daily.data?.length ? <TrafficChart rows={daily.data} /> : null}
        </div>
      </section>
    </div>
  )
}
