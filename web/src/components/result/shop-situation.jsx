import { ErrorAlert } from '@/components/common'
import { Meter, ScoreText, Sheet, Signal, SkeletonBlock, Tag } from '@/components/score-visuals'
import { GmvOrdersChart, TrafficChart } from '@/components/shop-context-card'
import { useShopDaily } from '@/hooks/use-shop-daily'
import { compactVnd, num } from '@/lib/api'
import { scenarioLabel } from '@/lib/labels'

const DIAG_TONE = { healthy: 'pass', fix_video: 'amber', fix_sku: 'amber', fix_both: 'critical' }

/**
 * "Tình hình shop": the shop's own health (H01–H05), the diagnosis of this video inside the shop, and the
 * shop's GMV/orders and traffic charts. Context only: never part of the video score.
 */
export function ShopSituation({ shop, shopHealth, diagnosis }) {
  const daily = useShopDaily(shop?.id)
  if (!shop) return null
  const notScored = !shopHealth || shopHealth.score == null

  return (
    <Sheet
      id="shop-situation"
      title="Tình hình shop"
      aside={
        <>
          <Tag tone="muted">Bối cảnh shop · không tính vào điểm video</Tag>
        </>
      }
      bodyClassName="space-y-4"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <span className="text-sm font-semibold">{shop.shop_name}</span>
        <Tag tone="muted">{scenarioLabel(shop.scenario)}</Tag>
        <span>GMV 30 ngày <b className="tabular-nums">{compactVnd(shop.gmv_30d_vnd)}</b></span>
        <span>Đơn <b className="tabular-nums">{num(shop.orders_30d)}</b></span>
        <span>Rating <b>{shop.shop_rating}</b></span>
      </div>

      <div className="space-y-2 rounded-xl border border-line p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(80px,140px)_48px] items-center gap-3">
          <span className="text-sm font-semibold">Điểm shop health</span>
          <Meter value={shopHealth?.score ?? null} />
          <ScoreText value={shopHealth?.score ?? null} className="text-right text-lg" />
        </div>
        {notScored ? (
          <p className="text-xs text-ink-2">Chưa chấm được shop health trong lần chạy này.</p>
        ) : null}
        {shopHealth?.criteria?.length > 0 && (
          <ul className="grid gap-1 sm:grid-cols-2">
            {shopHealth.criteria.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-xs">
                <span className="pt-0.5">
                  <Signal value={c.score} />
                </span>
                <span className="min-w-0 flex-1">
                  {c.name} <span className="font-mono text-[10.5px] text-muted-foreground">{c.id}</span>
                  {c.score == null && <span className="block truncate text-[11px] text-muted-foreground" title={c.notScoredReason}>{c.notScoredReason}</span>}
                </span>
                <ScoreText value={c.score} reason={c.notScoredReason} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {diagnosis && (
        <div className="space-y-1 rounded-xl bg-subtle p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Chẩn đoán video trong shop</span>
            <Tag tone={DIAG_TONE[diagnosis.verdict] ?? 'muted'}>{diagnosis.verdict}</Tag>
          </div>
          <p>{diagnosis.reason}</p>
          {diagnosis.action && <p className="font-medium">{diagnosis.action}</p>}
          {diagnosis.evidence && <p className="font-mono text-[11px] text-muted-foreground">{diagnosis.evidence}</p>}
        </div>
      )}

      {daily.loading ? (
        <SkeletonBlock className="h-52" />
      ) : daily.error ? (
        <ErrorAlert error={daily.error} onRetry={daily.reload} />
      ) : daily.data?.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <figure className="space-y-1">
            <figcaption className="text-xs font-semibold">GMV và đơn theo ngày ({daily.data.length} ngày)</figcaption>
            <GmvOrdersChart rows={daily.data} />
          </figure>
          <figure className="space-y-1">
            <figcaption className="text-xs font-semibold">Lượt vào shop theo nguồn</figcaption>
            <TrafficChart rows={daily.data} />
          </figure>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Không có số liệu theo ngày của shop này.</p>
      )}
    </Sheet>
  )
}
