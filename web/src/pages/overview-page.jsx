import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Flame,
  Play,
  Plus,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  TrendingUp,
  Upload,
  Video,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { ErrorAlert, Loading, StatusBadge, TagBadge } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { useFetch } from '@/hooks/use-fetch'
import { compactVnd, db, vnd } from '@/lib/api'
import { cn } from '@/lib/utils'

const chartConfig = {
  gmv: { label: 'GMV 30 ngày', color: '#ee4d2d' },
  ads: { label: 'Chi phí Ads', color: '#f97316' },
}

async function loadOverview() {
  const [shops, videos, skus, analyses] = await Promise.all([
    db('/shops'),
    db('/videos'),
    db('/skus'),
    db('/analyses?_sort=createdAt&_order=desc'),
  ])
  return { shops, videos, skus, analyses, measured: await loadMeasuredDurations(videos) }
}

// Duration read from the file for the uploaded videos listed here (null when not extracted yet).
async function loadMeasuredDurations(videos) {
  const shown = videos.filter((v) => (!v.shop_id || v.stage === 'prepublish') && v.local_file).slice(0, 5)
  const entries = await Promise.all(shown.map(async (v) => {
    const res = await fetch(`/py/videos/${encodeURIComponent(v.id)}/features`)
    const body = res.ok ? await res.json() : null
    return [v.id, body?.features?.['video.duration_sec']?.value ?? null]
  }))
  return Object.fromEntries(entries)
}

export default function OverviewPage() {
  const { data, loading, error } = useFetch(loadOverview, [])

  if (loading) return <Loading />
  if (error) return <ErrorAlert error={error} />

  const { shops, videos, skus, analyses, measured } = data
  const chartData = shops.map((s) => ({
    shop: s.id,
    name: s.shop_name,
    gmv: s.gmv_30d_vnd,
    ads: s.ads_spend_30d_vnd,
  }))

  const uploadedVideos = videos.filter((v) => !v.shop_id || v.stage === 'prepublish')

  return (
    <div className="space-y-6">
      {/* 1. Hero Summary Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600 p-6 text-white shadow-md">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <Badge className="bg-white/20 text-white backdrop-blur-xs font-semibold">
                Commerce Preflight v2
              </Badge>
              <span className="text-xs text-orange-100">Cơ chế thẩm định video trước khi xuất bản</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Video Intelligence Lab · Shopee Preflight
            </h1>
            <p className="text-sm text-orange-100 leading-relaxed">
              Kiểm tra tỷ lệ chuyển đổi, lực hút 3 giây đầu (Hook), và đối chiếu chéo chính sách các sàn thương mại điện tử bằng AI đa phương thức.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <Button asChild size="lg" className="bg-white text-orange-600 font-bold hover:bg-orange-50 shadow-md">
              <Link to="/studio">
                <Upload className="mr-2 size-4" /> Upload video mới
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/40 bg-white/10 text-white hover:bg-white/20">
              <Link to="/analyze">
                <Play className="mr-2 size-4" /> Mở phân tích
              </Link>
            </Button>
          </div>
        </div>

        {/* Quick KPI stats */}
        <div className="grid grid-cols-2 gap-3 pt-6 sm:grid-cols-4 border-t border-white/20 mt-6 text-white">
          <div>
            <span className="text-xs text-orange-200">Gian hàng theo dõi</span>
            <div className="text-2xl font-black">{shops.length} shop</div>
          </div>
          <div>
            <span className="text-xs text-orange-200">SKU sản phẩm</span>
            <div className="text-2xl font-black">{skus.length} SKU</div>
          </div>
          <div>
            <span className="text-xs text-orange-200">Video đã xử lý</span>
            <div className="text-2xl font-black">{videos.length} video</div>
          </div>
          <div>
            <span className="text-xs text-orange-200">Lượt kiểm tra (Runs)</span>
            <div className="text-2xl font-black">{analyses.length} lượt</div>
          </div>
        </div>
      </div>

      {/* 2. Uploaded / Preflight Videos Section */}
      {uploadedVideos.length > 0 && (
        <Card className="border-orange-200 shadow-sm">
          <CardHeader className="bg-orange-50/30 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base text-stone-900 flex items-center gap-2">
                  <Video className="size-4 text-orange-600" />
                  Video chờ đăng & Upload gần đây ({uploadedVideos.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Các video được gắn SKU chuẩn bị lên sóng. Bấm "Phân tích ngay" để kiểm tra điểm.
                </CardDescription>
              </div>
              <Button asChild size="xs" variant="outline">
                <Link to="/studio">
                  <Plus className="mr-1 size-3" /> Thêm video
                </Link>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0 divide-y">
            {uploadedVideos.slice(0, 5).map((v) => (
              <div key={v.id} className="flex items-center justify-between p-4 transition hover:bg-stone-50">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600 font-bold text-xs">
                    <Video className="size-5" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-stone-900">
                        {v.product_label || v.creative_type || v.local_file}
                      </span>
                      <span className="font-mono text-xs text-stone-400">({v.id})</span>
                      <StatusBadge status={v.source_status} />
                    </div>
                    <p className="text-xs text-stone-500">
                      Gắn SKU: <strong className="text-stone-700">{v.sku_id || 'Chưa gắn'}</strong> · Thời lượng: {(measured[v.id] ?? v.duration_sec) ? `${measured[v.id] ?? v.duration_sec}s` : '–'}
                    </p>
                  </div>
                </div>

                <Button asChild size="sm" className="bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs">
                  <Link to={`/analyze?video=${v.id}`}>
                    <Play className="mr-1.5 size-3.5" /> Phân tích ngay
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 3. Performance & GMV Distribution Chart */}
      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-base text-stone-900 flex items-center gap-2">
            <BarChart3 className="size-4 text-orange-500" />
            Doanh thu GMV và Chi phí Ads 30 ngày theo Shop
          </CardTitle>
          <CardDescription className="text-xs">
            Đối sánh chi phí quảng cáo và hiệu quả doanh số thực tế của từng kịch bản gian hàng.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4">
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <BarChart data={chartData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.5} />
              <XAxis dataKey="shop" tickLine={false} axisLine={false} textAnchor="end" />
              <YAxis tickFormatter={compactVnd} width={75} tickLine={false} axisLine={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(v, n) => `${chartConfig[n].label}: ${compactVnd(v)}`}
                  />
                }
              />
              <Bar dataKey="gmv" fill="#ee4d2d" radius={[4, 4, 0, 0]} />
              <Bar dataKey="ads" fill="#f97316" radius={[4, 4, 0, 0]} opacity={0.8} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* 4. Shops Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Danh sách gian hàng đối sánh ({shops.length})</h2>
            <p className="text-xs text-stone-500">
              Các kịch bản thực nghiệm với dữ liệu sản phẩm, doanh số và video tương ứng.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shops.map((s) => {
            const shopVideos = videos.filter((v) => v.shop_id === s.id)
            const shopSkus = skus.filter((sk) => sk.shop_id === s.id)

            return (
              <Card key={s.id} className="transition hover:shadow-md hover:border-orange-300">
                <CardHeader className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-stone-500">{s.id}</span>
                    <TagBadge value={s.scenario} />
                  </div>
                  <CardTitle className="text-base text-stone-900 line-clamp-1">{s.shop_name}</CardTitle>
                </CardHeader>

                <CardContent className="p-4 pt-0 space-y-3">
                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-stone-50 p-2 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[10px]">GMV 30 ngày:</span>
                      <strong className="text-stone-800">{compactVnd(s.gmv_30d_vnd)}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Đơn hàng:</span>
                      <strong className="text-stone-800">{s.orders_30d?.toLocaleString('vi-VN')} đơn</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span>{shopSkus.length} SKU sản phẩm</span>
                    <span>{shopVideos.length} video</span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button asChild size="xs" variant="outline" className="flex-1 text-xs">
                      <Link to={`/shops/${s.id}/profile`}>Xem chi tiết</Link>
                    </Button>
                    {shopVideos.length > 0 && (
                      <Button asChild size="xs" className="bg-orange-600 hover:bg-orange-700 text-white text-xs">
                        <Link to={`/analyze?video=${shopVideos[0].id}`}>
                          <Play className="mr-1 size-3" /> Chấm video
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
