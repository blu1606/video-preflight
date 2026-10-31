import { Star } from 'lucide-react'
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { SkeletonBlock, Tag } from '@/components/score-visuals'
import { useShopDaily } from '@/hooks/use-shop-daily'
import { compactVnd, num } from '@/lib/api'
import { scenarioLabel } from '@/lib/labels'

// ResponsiveContainer measures after mount; start at 1x1 instead of -1 to avoid Recharts' size warning
const CHART_INIT = { width: 1, height: 1 }

const shortDate = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '')

export function GmvSparkline({ rows }) {
  if (!rows?.length) return null
  return (
    <div className="h-12 w-full" aria-label="GMV theo ngày, 30 ngày">
      <ResponsiveContainer initialDimension={CHART_INIT}>
        <AreaChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <Area type="monotone" dataKey="gmv_vnd" stroke="var(--mk-accent)" fill="var(--mk-accent-tint-2)" strokeWidth={1.5} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function GmvOrdersChart({ rows }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer initialDimension={CHART_INIT}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--mk-line)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} minTickGap={16} />
          <YAxis yAxisId="gmv" tickFormatter={(v) => compactVnd(v)} tick={{ fontSize: 11 }} width={64} />
          <YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 11 }} width={36} />
          <Tooltip formatter={(v, name) => (name === 'GMV' ? compactVnd(v) : num(v))} labelFormatter={shortDate} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="orders" dataKey="paid_orders" name="Đơn" fill="var(--mk-line-2)" isAnimationActive={false} />
          <Line yAxisId="gmv" type="monotone" dataKey="gmv_vnd" name="GMV" stroke="var(--mk-accent)" dot={false} strokeWidth={2} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TrafficChart({ rows }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer initialDimension={CHART_INIT}>
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--mk-line)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} minTickGap={16} />
          <YAxis tick={{ fontSize: 11 }} width={44} />
          <Tooltip formatter={(v) => num(v)} labelFormatter={shortDate} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area stackId="v" type="monotone" dataKey="visits_organic" name="Tự nhiên" stroke="#17803d" fill="rgba(23,128,61,.18)" isAnimationActive={false} />
          <Area stackId="v" type="monotone" dataKey="visits_video" name="Video" stroke="#ee4d2d" fill="rgba(238,77,45,.18)" isAnimationActive={false} />
          <Area stackId="v" type="monotone" dataKey="visits_ads" name="Ads" stroke="#1d4ed8" fill="rgba(29,78,216,.15)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function Kpi({ label, value }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  )
}

/** Shop status card on the upload screen: why the video is checked against this shop. */
export function ShopContextCard({ shop }) {
  const daily = useShopDaily(shop?.id)
  if (!shop) return null
  return (
    <div className="space-y-3 rounded-xl border border-line bg-subtle p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{shop.shop_name}</span>
        <Tag tone="muted">{scenarioLabel(shop.scenario)}</Tag>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="GMV 30 ngày" value={compactVnd(shop.gmv_30d_vnd)} />
        <Kpi label="Đơn 30 ngày" value={num(shop.orders_30d)} />
        <Kpi
          label="Rating"
          value={
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5 fill-amber-400 text-amber-400" /> {shop.shop_rating} ({num(shop.shop_rating_count)})
            </span>
          }
        />
      </div>
      {daily.loading ? <SkeletonBlock className="h-12" /> : daily.error ? null : <GmvSparkline rows={daily.data} />}
      <p className="text-xs text-muted-foreground">
        Điểm video có tính dữ liệu shop/SKU này (giá, đánh giá, tồn kho); tình hình shop được chấm riêng.
      </p>
    </div>
  )
}
