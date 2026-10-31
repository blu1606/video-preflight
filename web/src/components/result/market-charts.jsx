import { ExternalLink } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ErrorAlert } from '@/components/common'
import { Sheet, SkeletonBlock, Tag } from '@/components/score-visuals'
import { useFetch } from '@/hooks/use-fetch'
import { compactNum, compactVnd, marketSnapshot, num, vnd } from '@/lib/api'
import { fmtDate, marketView } from '@/lib/market-view'

// ResponsiveContainer measures after mount; start at 1x1 instead of -1 to avoid Recharts' size warning
const CHART_INIT = { width: 1, height: 1 }



function RowTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="max-w-64 rounded-md bg-surface p-2 text-xs shadow-pop">
      <div className="font-medium">{r.title}</div>
      {r.price != null && <div>{vnd(r.price)} · {r.source}</div>}
      {r.sold != null && <div>{num(r.sold)} bán / 28 ngày{r.units7d != null ? ` · ${num(r.units7d)} / 7 ngày` : ''}</div>}
      {r.videos != null && <div>{num(r.videos)} video · {num(r.creators)} creator</div>}
    </div>
  )
}

/**
 * Market evidence for the SKU from crawled data: competitor prices (FastMoss + Google Shopping) against our
 * price, 28-day units sold (FastMoss only), video/creator counts, with source, crawl date and links.
 */
export function MarketCharts({ skuId, ownPrice }) {
  const { data, loading, error, reload } = useFetch(() => (skuId ? marketSnapshot(skuId) : Promise.resolve(null)), [skuId])
  if (!skuId) return null
  if (loading) return <SkeletonBlock className="h-72 rounded-2xl" />
  if (error) return <ErrorAlert error={error} onRetry={reload} />
  const v = marketView(data)
  if (!v || !v.priceRows.length) {
    return (
      <Sheet title="Thị trường">
        <p className="text-sm text-muted-foreground">Chưa có dữ liệu thị trường đã cào cho SKU {skuId}.</p>
      </Sheet>
    )
  }
  const priceDomain = [0, Math.max(...v.priceRows.map((r) => r.price), ownPrice ?? 0) * 1.1]

  return (
    <Sheet
      id="market"
      title="Thị trường"
      aside={<span className="text-xs text-muted-foreground">từ khóa “{v.keyword}” · {v.likeCount}/{v.total} listing cùng loại</span>}
      bodyClassName="space-y-4"
    >
      {v.market && (
        <div className="flex flex-wrap gap-1.5">
          <Tag tone="info">{compactNum(v.market.units28d)} bán / 28 ngày</Tag>
          <Tag tone="info">{compactNum(v.market.units7d)} bán / 7 ngày</Tag>
          <Tag tone="info">{num(v.market.videoCount)} video đang bán</Tag>
          {v.own && (
            <Tag tone="muted" title={v.own.title}>
              Sản phẩm của brand: {num(v.own.linked_video_count)} video · {num(v.own.linked_creator_count)} creator
            </Tag>
          )}
        </div>
      )}

      <figure className="space-y-1">
        <figcaption className="text-xs font-semibold">
          Giá đối thủ cùng loại{ownPrice != null && <span className="font-normal text-muted-foreground"> · đường cam là giá của bạn ({vnd(ownPrice)})</span>}
        </figcaption>
        <div className="h-56">
          <ResponsiveContainer initialDimension={CHART_INIT}>
            <BarChart data={v.priceRows} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--mk-line)" vertical={false} />
              <XAxis dataKey="name" tick={false} height={8} />
              <YAxis tickFormatter={(x) => compactVnd(x)} tick={{ fontSize: 11 }} width={64} domain={priceDomain} />
              <Tooltip content={<RowTooltip />} cursor={{ fill: 'var(--mk-subtle)' }} />
              <Bar dataKey="price" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                {v.priceRows.map((r) => (
                  <Cell key={r.key} fill={r.source === 'FastMoss' ? '#30343b' : '#b8bcc4'} />
                ))}
              </Bar>
              {ownPrice != null && (
                <ReferenceLine y={ownPrice} stroke="var(--mk-accent)" strokeWidth={2} label={{ value: 'Giá của bạn', position: 'insideTopRight', fontSize: 11, fill: 'var(--mk-accent)' }} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><i className="size-2 rounded-sm bg-[#30343b]" /> FastMoss · TikTok Shop</span>
          <span className="inline-flex items-center gap-1"><i className="size-2 rounded-sm bg-[#b8bcc4]" /> Google Shopping (chỉ có giá)</span>
        </div>
      </figure>

      {v.soldRows.length > 0 && (
        <figure className="space-y-1">
          <figcaption className="text-xs font-semibold">Số bán 28 ngày của đối thủ (FastMoss)</figcaption>
          <div style={{ height: Math.max(120, v.soldRows.length * 26 + 20) }}>
            <ResponsiveContainer initialDimension={CHART_INIT}>
              <BarChart data={v.soldRows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                <XAxis type="number" tickFormatter={(x) => compactNum(x)} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 10.5 }} />
                <Tooltip content={<RowTooltip />} cursor={{ fill: 'var(--mk-subtle)' }} />
                <Bar dataKey="sold" fill="var(--mk-accent)" isAnimationActive={false} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Link kiểm tra từng dòng ({v.soldRows.length})</summary>
            <ul className="mt-1 space-y-0.5">
              {v.soldRows.map((r) => (
                <li key={r.key} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate" title={r.title}>{r.title}</span>
                  {r.fastmoss_url && (
                    <a href={r.fastmoss_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-info hover:underline">
                      FastMoss <ExternalLink className="size-3" />
                    </a>
                  )}
                  {r.tiktok_url && (
                    <a href={r.tiktok_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-info hover:underline">
                      TikTok <ExternalLink className="size-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </figure>
      )}

      <footer className="border-t border-line pt-2 text-[11px] text-muted-foreground">
        {v.hasFastMoss && <>FastMoss · TikTok Shop VN · cào {fmtDate(v.crawledAt)}</>}
        {v.hasFastMoss && v.hasSerp && ' · '}
        {v.hasSerp && <>Google Shopping (SerpAPI) · cào {fmtDate(v.crawledAt)}</>}
        <span className="block">Số liệu FastMoss có điều khoản hạn chế hiển thị công khai (docs/market-data-provenance.md).</span>
      </footer>
    </Sheet>
  )
}
