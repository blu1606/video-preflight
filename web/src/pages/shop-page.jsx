import { Film, Loader2, Stethoscope } from 'lucide-react'
import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { AnalysisHistory, FindingCard, ScoreGroups, VideoVerdict } from '@/components/analysis'
import { ErrorAlert, KpiCard, Loading, StatusBadge, TagBadge } from '@/components/common'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useFetch } from '@/hooks/use-fetch'
import { compactVnd, db, num, pct, ratio, runAnalysis, vnd } from '@/lib/api'

const salesConfig = {
  gmv_vnd: { label: 'GMV', color: 'var(--chart-1)' },
  paid_orders: { label: 'Đơn', color: 'var(--chart-3)' },
}
const trafficConfig = {
  visits_organic: { label: 'Organic', color: 'var(--chart-2)' },
  visits_video: { label: 'Video', color: 'var(--chart-3)' },
  visits_ads: { label: 'Ads', color: 'var(--chart-5)' },
}

async function loadShop(id) {
  const q = `shopId=${id}`
  const [shop, daily, skus, reviews, videos] = await Promise.all([
    db(`/shops/${id}`),
    db(`/shopDailyMetrics?${q}&_sort=date`),
    db(`/skus?${q}`),
    db(`/skuReviews?${q}`),
    db(`/videos?${q}`),
  ])
  const reviewBySku = Object.fromEntries(reviews.map((r) => [r.sku_id, r]))
  return { shop, daily, skus: skus.map((s) => ({ ...s, review: reviewBySku[s.sku_id] })), videos }
}

export default function ShopPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()  // ?tab= keeps the open tab linkable
  const { data, loading, error } = useFetch(() => loadShop(id), [id])
  const analyses = useFetch(
    () => db(`/analyses?shopId=${id}&kind=shop_diagnosis&_sort=createdAt&_order=desc`),
    [id],
  )

  if (loading) return <Loading />
  if (error) return <ErrorAlert error={error} />
  const { shop, daily, skus, videos } = data

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-muted-foreground font-mono text-xs">
            <Link to="/shops" className="hover:underline">
              Shops
            </Link>{' '}
            / {shop.id}
          </p>
          <h1 className="text-2xl font-semibold">{shop.shop_name}</h1>
        </div>
        <TagBadge value={shop.scenario} />
        <span className="text-muted-foreground text-sm">
          vấn đề kỳ vọng: <TagBadge value={shop.expected_primary_issue} />
        </span>
        <StatusBadge status={shop.source_status} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <KpiCard label="GMV 30 ngày" value={compactVnd(shop.gmv_30d_vnd)} />
        <KpiCard label="Đơn" value={num(shop.orders_30d)} />
        <KpiCard label="Lượt vào shop" value={num(shop.shop_visits_30d)} hint={`CVR ${pct(ratio(shop.orders_30d, shop.shop_visits_30d))}`} />
        <KpiCard label="Ads spend" value={compactVnd(shop.ads_spend_30d_vnd)} />
        <KpiCard label="Rating" value={shop.shop_rating} hint={`${num(shop.shop_rating_count)} đánh giá · ${shop.shop_age_days} ngày tuổi`} />
        <KpiCard
          label="Hủy / Trả / Trễ"
          value={`${pct(shop.cancellation_rate_30d)} · ${pct(shop.return_rate_30d)}`}
          hint={`giao trễ ${pct(shop.late_shipment_rate_30d)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>GMV và đơn theo ngày</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={salesConfig} className="h-64 w-full">
              <LineChart data={daily}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tickLine={false} axisLine={false} />
                <YAxis yAxisId="gmv" tickFormatter={compactVnd} width={70} tickLine={false} axisLine={false} />
                <YAxis yAxisId="orders" orientation="right" width={40} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line yAxisId="gmv" dataKey="gmv_vnd" stroke="var(--color-gmv_vnd)" dot={false} strokeWidth={2} />
                <Line yAxisId="orders" dataKey="paid_orders" stroke="var(--color-paid_orders)" dot={false} strokeWidth={2} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lượt vào shop theo nguồn</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trafficConfig} className="h-64 w-full">
              <AreaChart data={daily}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tickLine={false} axisLine={false} />
                <YAxis width={50} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                {Object.keys(trafficConfig).map((k) => (
                  <Area key={k} dataKey={k} stackId="t" type="monotone" fill={`var(--color-${k})`} stroke={`var(--color-${k})`} fillOpacity={0.5} />
                ))}
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Tabs value={params.get('tab') ?? 'videos'} onValueChange={(tab) => setParams({ tab }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="videos">Video ({videos.length})</TabsTrigger>
          <TabsTrigger value="skus">SKU ({skus.length})</TabsTrigger>
          <TabsTrigger value="diagnosis">Chẩn đoán</TabsTrigger>
        </TabsList>
        <TabsContent value="videos">
          <VideoTable videos={videos} skus={skus} />
        </TabsContent>
        <TabsContent value="skus">
          <SkuTable skus={skus} />
        </TabsContent>
        <TabsContent value="diagnosis">
          <Diagnosis shopId={id} analyses={analyses} />
        </TabsContent>
      </Tabs>
    </>
  )
}

function VideoTable({ videos, skus }) {
  const skuName = Object.fromEntries(skus.map((s) => [s.sku_id, s.item_name]))
  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Video</TableHead>
              <TableHead>Sản phẩm</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead className="text-right">Views</TableHead>
              <TableHead className="text-right">Xem hết</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">CVR</TableHead>
              <TableHead className="text-right">Đơn</TableHead>
              <TableHead>Verdict kỳ vọng</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {videos.map((v) => (
              <TableRow key={v.id}>
                <TableCell>
                  <Link to={`/videos/${v.id}`} className="flex items-center gap-1 font-mono text-xs text-sky-700 hover:underline">
                    {v.id}
                    {v.local_file && <Film className="size-3.5" title={v.local_file} />}
                  </Link>
                </TableCell>
                <TableCell className="max-w-48 truncate">
                  {v.product_label ?? skuName[v.sku_id]}
                  {v.product_label && (
                    <div className="text-muted-foreground truncate text-xs">SKU: {skuName[v.sku_id]}</div>
                  )}
                </TableCell>
                <TableCell className="text-xs">{v.creative_type}</TableCell>
                <TableCell className="text-right tabular-nums">{num(v.video_views)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(v.completion_rate)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(ratio(v.product_clicks, v.video_views))}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(ratio(v.attributed_orders, v.product_clicks))}</TableCell>
                <TableCell className="text-right tabular-nums">{num(v.attributed_orders)}</TableCell>
                <TableCell>
                  <TagBadge value={v.expected_verdict} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function SkuTable({ skus }) {
  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Giá</TableHead>
              <TableHead className="text-right">Giá vốn</TableHead>
              <TableHead className="text-right">Tồn kho</TableHead>
              <TableHead className="text-right">Rating</TableHead>
              <TableHead className="text-right">Review +</TableHead>
              <TableHead>Chủ đề tiêu cực</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {skus.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="font-mono text-xs">{s.sku_id}</div>
                  <div className="max-w-64 truncate">{s.item_name}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{vnd(s.price_vnd)}</TableCell>
                <TableCell className="text-right tabular-nums">{vnd(s.cost_vnd)}</TableCell>
                <TableCell className="text-right">
                  {s.stock > 0 ? num(s.stock) : <Badge variant="destructive">hết từ {s.stockout_date}</Badge>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.rating} <span className="text-muted-foreground text-xs">({num(s.rating_count)})</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{pct(s.review?.positive_ratio)}</TableCell>
                <TableCell className="text-xs">{JSON.parse(s.review?.negative_topics ?? '[]').join(', ') || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function Diagnosis({ shopId, analyses }) {
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)

  const list = analyses.data ?? []
  const selected = list.find((a) => a.id === selectedId) ?? list[0]

  async function run() {
    setRunning(true)
    setRunError(null)
    try {
      const saved = await runAnalysis(`/shops/${shopId}/diagnose`)
      setSelectedId(saved.id)
      analyses.reload()
    } catch (e) {
      setRunError(e)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={run} disabled={running}>
            {running ? <Loader2 className="animate-spin" /> : <Stethoscope />} Chẩn đoán shop
          </Button>
          <span className="text-muted-foreground text-xs">Gọi FastAPI → shop_diagnosis.py, kết quả lưu vào /analyses.</span>
        </CardContent>
      </Card>
      {runError && <ErrorAlert error={runError} />}
      <AnalysisHistory analyses={list} selectedId={selected?.id} onSelect={setSelectedId} />
      {selected && <DiagnosisResult result={selected.result} />}
    </div>
  )
}

function DiagnosisResult({ result }) {
  const d = result.diagnosis
  return (
    <div className="space-y-4">
      <ScoreGroups groups={result.scores} />
      {d.status === 'not_scored' ? (
        <Alert>
          <AlertDescription>not_scored: {d.reason}</AlertDescription>
        </Alert>
      ) : (
        <>
          <h3 className="flex items-center gap-2 font-semibold">
            Vấn đề chính: <TagBadge value={d.primary_issue} />
            <span className="text-muted-foreground text-sm font-normal">
              confidence {d.confidence} · {d.status}
            </span>
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {d.findings.map((f) => (
              <FindingCard key={f.area} finding={f} />
            ))}
            {d.tentative.map((f) => (
              <FindingCard key={`t-${f.area}`} finding={f} tentative />
            ))}
          </div>
        </>
      )}
      {result.videos.length > 0 && (
        <>
          <h3 className="font-semibold">Video vs shop</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {result.videos.map((v) => (
              <VideoVerdict key={v.video_id} v={v} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
