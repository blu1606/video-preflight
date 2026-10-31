import { ExternalLink } from 'lucide-react'

import { ErrorAlert, StatusBadge } from '@/components/common'
import { ScoreText, SkeletonBlock, Tag } from '@/components/score-visuals'
import { useFetch } from '@/hooks/use-fetch'
import { marketSnapshot, num, vnd } from '@/lib/api'
import { groupLabel } from '@/lib/labels'
import { fmtDate, isFastMoss } from '@/lib/market-view'

function Check({ label, tone, value, children }) {
  return (
    <div className="space-y-1 rounded-xl bg-surface p-3 shadow-sheet">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold">{label}</span>
        {value != null && <Tag tone={tone} className="ml-auto">{value}</Tag>}
      </div>
      <div className="text-xs text-ink-2">{children}</div>
    </div>
  )
}


function CompetitorTable({ skuId }) {
  const { data: snap, loading, error, reload } = useFetch(() => (skuId ? marketSnapshot(skuId) : Promise.resolve(null)), [skuId])
  if (!skuId) return <p className="text-xs text-muted-foreground">Video không gắn SKU nên không có dữ liệu đối thủ.</p>
  if (loading) return <SkeletonBlock className="h-40" />
  if (error) return <ErrorAlert error={error} onRetry={reload} />
  if (!snap) return <p className="text-xs text-muted-foreground">Chưa có dữ liệu thị trường đã cào cho {skuId}.</p>
  return (
    <div className="overflow-x-auto rounded-xl bg-surface shadow-sheet">
      <table className="w-full text-xs">
        <thead className="text-left text-[11px] text-muted-foreground">
          <tr className="border-b border-line">
            <th className="p-2 font-medium">nguồn</th>
            <th className="font-medium">sản phẩm</th>
            <th className="text-right font-medium">giá</th>
            <th className="text-right font-medium">bán 28 ngày</th>
            <th className="text-right font-medium">video · creator</th>
            <th className="font-medium">cùng loại</th>
            <th className="font-medium">kiểm tra</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {snap.competitors.map((c, i) => (
            <tr key={i} className="align-top">
              <td className="p-2 whitespace-nowrap">{isFastMoss(c) ? 'FastMoss · TikTok Shop' : `Google Shopping · ${c.platform}`}</td>
              <td className="max-w-80 py-2">
                {c.title}
                {c.shop && <div className="text-muted-foreground">{c.shop}</div>}
              </td>
              <td className="py-2 text-right tabular-nums">{vnd(c.price_vnd)}</td>
              <td className="py-2 text-right tabular-nums">{c.sold_count == null ? '–' : num(c.sold_count)}</td>
              <td className="py-2 text-right tabular-nums">
                {c.linked_video_count == null ? '–' : `${num(c.linked_video_count)} · ${num(c.linked_creator_count)}`}
              </td>
              <td className="py-2" title={c.like_for_like_method}>{c.like_for_like ? 'có' : 'không'}</td>
              <td className="py-2">
                <span className="flex flex-wrap gap-1.5">
                  {[
                    ['FastMoss', c.fastmoss_url],
                    ['TikTok', c.tiktok_url],
                    ['Google', isFastMoss(c) ? null : c.url],
                  ]
                    .filter(([, href]) => href)
                    .map(([label, href]) => (
                      <a key={label} href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-info hover:underline">
                        {label} <ExternalLink className="size-3" />
                      </a>
                    ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-line p-2 text-[11px] text-muted-foreground">
        Cào {fmtDate(snap.crawled_at)} ·{' '}
        {[snap.tiktok?.provenance, snap.competitors.find((c) => !isFastMoss(c))?.provenance]
          .filter(Boolean)
          .map((p) => `${p.provider} · ${p.tool} · ${p.raw_file}`)
          .join(' | ')}
      </div>
    </div>
  )
}

/** "Có tin được không": quality gate, data sources, coverage, conflicts, benchmark/funnel, competitors. */
export function TabTrust({ result, skuId, extractStep }) {
  const features = Object.values(result.features ?? {})
  const counts = {}
  for (const f of features) counts[f.status] = (counts[f.status] ?? 0) + 1
  const gate = result.quality_gate ?? {}
  const conflicts = (result.cross_check ?? []).filter((c) => c.verdict === 'conflict')
  const funnel = result.revenue_funnel
  const bench = result.benchmark

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Check label="Quality gate" value={gate.status ?? '–'} tone={gate.status === 'ok' ? 'pass' : 'amber'}>
          {(gate.flags ?? []).length ? (
            <ul className="space-y-1">
              {gate.flags.map((f, i) => (
                <li key={i}>
                  <span className="font-mono">{f.code}</span>: {f.detail}
                  {f.next_step && <div className="text-muted-foreground">→ {f.next_step}</div>}
                </li>
              ))}
            </ul>
          ) : (
            'Không có cảnh báo.'
          )}
        </Check>
        <Check label="Nguồn dữ liệu của features" value={`${features.length} features`} tone="muted">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(counts).map(([s, n]) => (
              <span key={s} className="inline-flex items-center gap-1">
                <StatusBadge status={s} /> {n}
              </span>
            ))}
          </div>
          <div className="mt-1">
            trích xuất: {extractStep?.output?.source ?? extractStep?.status ?? '–'}
          </div>
        </Check>
        <Check label="Câu mâu thuẫn (cross-check)" value={`${conflicts.length}/${(result.cross_check ?? []).length}`} tone={conflicts.length ? 'critical' : 'pass'}>
          {conflicts.length ? conflicts.map((c) => c.id).join(', ') : 'Không có câu dưới ngưỡng bị rule/agent phản bác.'}
        </Check>
        <Check label="Coverage theo nhóm" value={null}>
          <ul className="space-y-0.5">
            {(result.scores ?? []).map((g) => (
              <li key={g.name} className="flex items-center gap-2">
                <span className="flex-1">{groupLabel(g.name)}</span>
                <span className="text-muted-foreground">{Math.round((g.coverage ?? 0) * 100)}%</span>
                <ScoreText value={g.score} />
              </li>
            ))}
          </ul>
        </Check>
        <Check label="Revenue funnel" value={funnel && funnel.status !== 'not_scored' ? 'ước tính' : '–'} tone="muted">
          {funnel && funnel.status !== 'not_scored' ? (
            <>
              {num(funnel.views)} views × CTR → {num(funnel.product_clicks)} click → {num(funnel.orders)} đơn × {vnd(funnel.aov_vnd)} ≈ <b>{vnd(funnel.expected_gmv_vnd)}</b>
              <div className="text-muted-foreground">Phễu đơn giản, không phải GMV đã ghi nhận.</div>
            </>
          ) : (
            funnel?.reason ?? 'Không tính được.'
          )}
        </Check>
        <Check label="Benchmark video thật" value={bench?.source_quality_flag ? 'chưa kiểm chứng' : null} tone="amber">
          {bench ? (
            <>
              {bench.label}: {num(bench.views)} views · {num(bench.sales)} bán · {bench.sales_per_1k_views} bán/1K views. Model chấm Viral{' '}
              {bench.model_viral_score} · Conversion {bench.model_conversion_score}.
              <div className="text-muted-foreground">{bench.source_quality_flag} · AOV {bench.aov_check}</div>
            </>
          ) : (
            'Video này chưa có chỉ số để so.'
          )}
        </Check>
      </div>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Đối thủ đã cào (đầy đủ)</h3>
        <CompetitorTable skuId={skuId} />
      </section>
    </div>
  )
}
