import { Gauge, ListChecks, Loader2, ScanEye, ScrollText, VideoOff } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { AnalysisHistory, ScoreGroups, VideoVerdict } from '@/components/analysis'
import { ErrorAlert, Loading, StatusBadge, TagBadge } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFetch } from '@/hooks/use-fetch'
import { db, num, pct, ratio, runAnalysis, vnd } from '@/lib/api'

// Uploaded videos have no shop SKU (sku_id null); their product comes from video.listing.
async function loadVideo(id) {
  const video = await db(`/videos/${id}`)
  const [sku, bench, listings] = await Promise.all([
    video.sku_id ? db(`/skus/${video.sku_id}`) : null,
    video.benchmark_id ? db(`/benchmarkVideos/${video.benchmark_id}`) : null,
    video.benchmark_id ? db(`/shopeeListings?benchmarkId=${video.benchmark_id}`) : [],
  ])
  const measured = video.local_file ? await loadMeasuredDuration(video.id) : null
  return { video, sku, bench, listings, measured }
}

// Duration read from the file once it was extracted; null when there is no extraction yet.
async function loadMeasuredDuration(id) {
  const res = await fetch(`/py/videos/${encodeURIComponent(id)}/features`)
  if (!res.ok) return null
  const body = await res.json()
  return body.features?.['video.duration_sec']?.value ?? null
}

export default function VideoPage() {
  const { id } = useParams()
  const { data, loading, error } = useFetch(() => loadVideo(id), [id])
  const analyses = useFetch(() => db(`/analyses?targetId=${id}&kind=video_score&_sort=createdAt&_order=desc`), [id])
  const [rubric, setRubric] = useState('v1')
  const [running, setRunning] = useState(null)
  const [runError, setRunError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const player = useRef(null)

  function seek(sec) {
    const el = player.current
    if (!el) return
    el.currentTime = sec
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.play().catch(() => {}) // autoplay may be blocked; the seek still applies
  }

  if (loading) return <Loading />
  if (error) return <ErrorAlert error={error} />
  const { video, sku, bench, listings, measured } = data
  const list = analyses.data ?? []
  const selected = list.find((a) => a.id === selectedId) ?? list[0]

  async function run(action) {
    if (CONFIRM[action] && !window.confirm(CONFIRM[action])) return
    setRunning(action)
    setRunError(null)
    try {
      const params = {
        score: { rubric },
        claims: { rubric, claims_llm: true },
        decisions: { rubric: 'v2', decisions: true },
      }[action]
      const saved = await runAnalysis(`/videos/${id}/${params ? 'score' : action}`, params ?? {})
      setSelectedId(saved.id)
      analyses.reload()
    } catch (e) {
      setRunError(e)
    } finally {
      setRunning(null)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-muted-foreground font-mono text-xs">
            <Link to="/shops" className="hover:underline">
              Shops
            </Link>{' '}
            /{' '}
            {video.shop_id ? (
              <Link to={`/shops/${video.shop_id}`} className="hover:underline">
                {video.shop_id}
              </Link>
            ) : (
              'Video đã upload'
            )}{' '}
            / {video.id}
          </p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {video.product_label ?? sku?.item_name ?? video.id}
            <StatusBadge status={video.product_label || !sku ? 'REAL' : sku.source_status} />
          </h1>
          {video.product_label && sku && (
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              Ghép với SKU {sku.item_name} <StatusBadge status={sku.source_status} />
            </p>
          )}
        </div>
        {video.expected_verdict && (
          <span className="text-muted-foreground text-sm">
            verdict kỳ vọng: <TagBadge value={video.expected_verdict} />
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardContent>
            {video.local_file ? (
              <video ref={player} src={`/media/${video.local_file}`} controls className="w-full rounded-lg bg-black" />
            ) : (
              <div className="text-muted-foreground flex aspect-[9/16] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center text-sm">
                <VideoOff />
                Video chưa có file.
                <br />
                Chỉ chấm được phần dựa trên số liệu.
              </div>
            )}
            <p className="text-muted-foreground mt-2 text-xs">
              {video.shop_id
                ? `${video.creative_type} · ${measured ?? video.duration_sec}s · đăng ${video.posted_at} (${video.days_live} ngày)`
                : `upload ${(video.uploaded_at ?? video.posted_at ?? "").slice(0, 10)}`}
              {video.local_file && ` · file ${video.local_file}`}
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {video.shop_id ? <SeedFunnel video={video} /> : <ProductListing listing={video.listing} />}
          {bench && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Benchmark Clipcat <StatusBadge status="REAL" />
                </CardTitle>
                <CardDescription>
                  {bench.video_label} · {bench.review_flag} ·{' '}
                  <a href={bench.clipcat_url} target="_blank" rel="noreferrer" className="underline">
                    nguồn
                  </a>
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 text-sm">
                <div>Views {num(bench.views_reported)}</div>
                <div>Sales {num(bench.sales_reported)}</div>
                <div>GMV ${num(bench.gmv_usd_reported)}</div>
                <div>Hook {bench.hook_type}</div>
                <div>Loại {bench.video_type}</div>
              </CardContent>
            </Card>
          )}

          {bench && <ShopeeListings listings={listings} />}

          <Card>
            <CardContent className="flex flex-wrap items-center gap-3">
              <select
                value={rubric}
                onChange={(e) => setRubric(e.target.value)}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
                title="v1: công thức trên features đã trích xuất · v2: bộ câu hỏi Decisions API"
              >
                <option value="v1">Rubric v1</option>
                <option value="v2">Rubric v2 (Decisions)</option>
              </select>
              <Button onClick={() => run('score')} disabled={!!running}>
                {running === 'score' ? <Loader2 className="animate-spin" /> : <Gauge />} Chấm điểm
              </Button>
              {video.local_file && (
                <Button variant="outline" onClick={() => run('extract')} disabled={!!running}>
                  {running === 'extract' ? <Loader2 className="animate-spin" /> : <ScanEye />} Trích xuất bằng VLM
                </Button>
              )}
              {video.local_file && (
                <Button variant="outline" onClick={() => run('claims')} disabled={!!running}>
                  {running === 'claims' ? <Loader2 className="animate-spin" /> : <ScrollText />} So claim với listing
                </Button>
              )}
              {video.local_file && (
                <Button variant="outline" onClick={() => run('decisions')} disabled={!!running}>
                  {running === 'decisions' ? <Loader2 className="animate-spin" /> : <ListChecks />} Chấm bằng Decisions
                </Button>
              )}
              <span className="text-muted-foreground text-xs">
                Chấm điểm dùng features đã cache; trích xuất và so claim (C3) gọi OpenAI. So claim cần trích xuất trước.
              </span>
            </CardContent>
          </Card>
        </div>
      </div>

      {runError && <ErrorAlert error={runError} />}
      <AnalysisHistory analyses={list} selectedId={selected?.id} onSelect={setSelectedId} />
      {selected && (
        <VideoResult result={selected.result} uploaded={!video.shop_id} onSeek={video.local_file ? seek : null} />
      )}
    </>
  )
}

const CONFIRM = {
  extract: 'Trích xuất gọi OpenAI (Whisper + VLM) và tốn token. Tiếp tục?',
  claims: 'So claim với listing gọi LLM của OpenAI (1 lần, tốn token) nếu chưa có kết quả cache. Tiếp tục?',
  decisions: 'Chấm bằng Decisions API gọi OpenAI (1 lần cho các câu đủ dữ liệu, tốn token) nếu chưa có cache. Tiếp tục?',
}

function SeedFunnel({ video }) {
  const funnel = [
    { label: 'Views', value: video.video_views },
    { label: 'Click sản phẩm', value: video.product_clicks },
    { label: 'Đơn attributed', value: video.attributed_orders },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Funnel video</CardTitle>
        <CardDescription>
          Xem hết {pct(video.completion_rate)} · xem TB {video.avg_watch_time_sec}s · GMV attributed{' '}
          {vnd(video.attributed_gmv_vnd)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {funnel.map((f, i) => (
          <div key={f.label} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{f.label}</span>
              <span className="tabular-nums">
                {num(f.value)}
                {i > 0 && <span className="text-muted-foreground"> · {pct(ratio(f.value, funnel[i - 1].value))} bước trước</span>}
              </span>
            </div>
            {/* log scale so orders stay visible next to views */}
            <Progress value={(Math.log10(f.value + 1) / Math.log10(funnel[0].value + 1)) * 100} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ProductListing({ listing }) {
  if (!listing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Listing sản phẩm</CardTitle>
          <CardDescription>
            Video này được upload khi chưa có form listing, nên các tiêu chí dựa trên SKU là not_scored.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  const rows = [
    { label: 'Tiêu đề', value: listing.title ?? (listing.name && `${listing.name} (dùng tên sản phẩm)`) },
    { label: 'Giá bán', value: listing.price_vnd ? vnd(listing.price_vnd) : null },
    { label: 'Giá gốc', value: listing.list_price_vnd ? vnd(listing.list_price_vnd) : null },
    {
      label: 'Link',
      value: listing.url && (
        <a href={listing.url} target="_blank" rel="noreferrer" className="truncate text-sky-700 hover:underline">
          {listing.url}
        </a>
      ),
    },
    { label: 'Mô tả', value: listing.description && <p className="whitespace-pre-line">{listing.description}</p> },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Listing sản phẩm <StatusBadge status="REAL" />
        </CardTitle>
        <CardDescription>
          Do bạn nhập khi upload (nguồn {listing.source}), chưa đối chiếu với sàn. Rating, tồn kho, phí ship, biên lợi
          nhuận không có trong listing nên giữ MISSING và không được chấm.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex min-w-0 gap-2">
            <span className="text-muted-foreground w-20 shrink-0">{label}</span>
            {value || <StatusBadge status="MISSING" />}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

const CLAIM_VERDICT_STYLE = {
  supported: 'bg-emerald-100 text-emerald-800',
  not_in_listing: 'bg-slate-100 text-slate-700',
  contradicts: 'bg-rose-100 text-rose-800',
}

// Per-claim LLM verdicts from the cached claims check behind C3 (sources/claims.py).
function ClaimVerdicts({ verdicts, c3 }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Claim trong video so với listing (C3) <StatusBadge status={c3.status} />
        </CardTitle>
        <CardDescription>
          Điểm khớp {c3.value}/100 · {c3.source} · supported = 100, not_in_listing = 50, contradicts = 0.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>claim</TableHead>
              <TableHead>kết luận</TableHead>
              <TableHead>bằng chứng trong listing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {verdicts.map((v, i) => (
              <TableRow key={i}>
                <TableCell className="max-w-md text-xs whitespace-normal">{v.claim}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`font-mono text-[11px] ${CLAIM_VERDICT_STYLE[v.verdict] ?? ''}`}>
                    {v.verdict}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-md text-xs whitespace-normal">
                  {v.listing_evidence || '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

const MATCH_LABEL = {
  same_product_candidate: 'cùng sản phẩm',
  bundle_or_related: 'combo / liên quan',
  competitor_candidate: 'đối thủ cùng loại',
}

function ShopeeListings({ listings }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Listing Shopee <StatusBadge status="REAL" />
        </CardTitle>
        <CardDescription>
          Ghép theo thương hiệu/tên từ kết quả tìm kiếm, chưa xác minh là SKU gắn giỏ của video; shopee.vn chặn kiểm tra
          trực tiếp.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {listings.length === 0 ? (
          <p className="text-muted-foreground text-sm">Chưa tìm được listing cho sản phẩm này.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Listing</TableHead>
                <TableHead>Shop</TableHead>
                <TableHead className="text-right">Giá</TableHead>
                <TableHead className="text-right">Rating</TableHead>
                <TableHead className="text-right">Đã bán</TableHead>
                <TableHead>Khớp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listings.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="max-w-56">
                    <a href={l.shopee_url} target="_blank" rel="noreferrer" className="block truncate text-sky-700 hover:underline">
                      {l.sku_title}
                    </a>
                    {l.url_kind === 'shop_page' && <div className="text-muted-foreground text-xs">link trang shop</div>}
                    {l.note && <div className="text-xs text-orange-700">{l.note}</div>}
                  </TableCell>
                  <TableCell className="text-xs">{l.shop_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{vnd(l.price_vnd)}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.rating ?? '-'}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.sold_displayed ?? '-'}</TableCell>
                  <TableCell className="text-xs">{MATCH_LABEL[l.match_type] ?? l.match_type}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function VideoResult({ result, uploaded, onSeek }) {
  const funnel = result.revenue_funnel
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Nội dung video (VLM):{' '}
        {result.content_source ? (
          <code>{result.content_source}</code>
        ) : (
          'chưa có features, nên các tiêu chí nội dung là not_scored. Video có file thì bấm "Trích xuất bằng VLM".'
        )}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {result.video_diagnosis ? (
          <VideoVerdict v={result.video_diagnosis} />
        ) : (
          <Card size="sm">
            <CardHeader>
              <CardDescription>Chẩn đoán video</CardDescription>
              <CardTitle className="text-xl">not_scored</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-xs">
              {uploaded
                ? 'Video upload chưa gắn shop nên không có funnel hiệu suất để chẩn đoán.'
                : 'Chưa có funnel hiệu suất để chẩn đoán video này.'}
            </CardContent>
          </Card>
        )}
        <Card size="sm">
          <CardHeader>
            <CardDescription>Revenue funnel ({funnel.status})</CardDescription>
            <CardTitle className="text-xl">
              {funnel.status === 'not_scored' ? 'not_scored' : vnd(funnel.expected_gmv_vnd)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {funnel.status === 'not_scored'
              ? funnel.reason
              : `${num(funnel.views)} views × CTR × CVR → ${funnel.orders} đơn × ${vnd(funnel.aov_vnd)}`}
          </CardContent>
        </Card>
      </div>
      <ScoreGroups groups={result.scores} />
      {result.claims_verdicts && <ClaimVerdicts verdicts={result.claims_verdicts} c3={result.features['video.claims_sku_match']} />}
      {result.policy && <PolicyFindings policy={result.policy} onSeek={onSeek} />}
      {result.quality_gate && <QualityGate gate={result.quality_gate} />}
      <DecisionAnswers features={result.features} />
      <FeatureTable features={result.features} />
    </div>
  )
}

const TARGET_LABEL = {
  tiktok_shop_video: 'TikTok Shop video',
  tiktok_ads: 'TikTok Ads',
  shopee_listing: 'Shopee (listing sản phẩm)',
  meta_ads: 'Facebook / Instagram Ads (rule provisional)',
}
const OUTCOME_STYLE = {
  needs_review: 'bg-orange-100 text-orange-800',
  unknown: 'bg-slate-100 text-slate-700',
  not_triggered: 'bg-emerald-100 text-emerald-800',
}

export function QualityGate({ gate }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Quality gate <TagBadge value={gate.status === 'ok' ? 'healthy' : 'needs_attention'} />
        </CardTitle>
        <CardDescription>Kiểm tra bằng code: thiếu dữ liệu, cache cũ, mâu thuẫn giữa các nguồn.</CardDescription>
      </CardHeader>
      {gate.flags.length > 0 && (
        <CardContent className="space-y-2 text-sm">
          {gate.flags.map((f, i) => (
            <div key={i}>
              <span className="font-mono text-xs text-orange-700">{f.code}</span> {f.detail}
              <div className="text-muted-foreground text-xs">→ {f.next_step}</div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  )
}

// decision.<QID> features: score questions are also in the v2 groups; choice/predicate answers only show here.
function DecisionAnswers({ features }) {
  const rows = Object.entries(features)
    .filter(([k, f]) => k.startsWith('decision.') && f.status !== 'MISSING')
    .map(([k, f]) => ({ id: k.slice(9), ...f }))
  if (rows.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Câu trả lời Decisions API <StatusBadge status="INFERRED" />
        </CardTitle>
        <CardDescription>
          Điểm score là mức rubric (0-4) quy về 0-100, không phải xác suất bán được. Predicate là xác suất nhận định
          đúng; choice là nhãn được chọn.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>câu</TableHead>
              <TableHead>kết quả</TableHead>
              <TableHead>chi tiết</TableHead>
              <TableHead>đầu vào</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.id}</TableCell>
                <TableCell className="tabular-nums">{String(r.value)}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{r.evidence[0]}</TableCell>
                <TableCell className="text-muted-foreground max-w-md text-xs whitespace-normal">
                  {r.input_sources.join(', ')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// Evidence from VLM signals starts with "MM:SS " (see core/policy_check.py _ts).
const TIMESTAMP = /^(\d{2}):(\d{2}) (.*)$/s

function Evidence({ text, onSeek }) {
  const m = TIMESTAMP.exec(text)
  if (!m || !onSeek) return <div>{text}</div>
  return (
    <div>
      <button
        type="button"
        onClick={() => onSeek(Number(m[1]) * 60 + Number(m[2]))}
        className="mr-1 rounded bg-sky-100 px-1 font-mono text-sky-800 hover:bg-sky-200"
        title="Tua video đến mốc này"
      >
        {m[1]}:{m[2]}
      </button>
      {m[3]}
    </div>
  )
}

export function PolicyFindings({ policy, onSeek }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Policy nền tảng (baseline v{policy.baseline_version})</CardTitle>
        <CardDescription>
          Bộ rule rút gọn, diễn giải lại từ trang chính sách chính thức. Kết quả là cần xem lại hoặc chưa đủ dữ liệu,
          không phải nền tảng phê duyệt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(policy.targets).map(([target, t]) => (
          <div key={target} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              {TARGET_LABEL[target] ?? target}
              <TagBadge value={t.verdict} />
              <span className="text-muted-foreground tabular-nums">{t.score ?? 'not_scored'}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>rule</TableHead>
                  <TableHead>mức</TableHead>
                  <TableHead>kết quả</TableHead>
                  <TableHead>bằng chứng</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.findings.map((f) => (
                  <TableRow key={f.rule_id}>
                    <TableCell className="text-xs">
                      <a href={f.source_url} target="_blank" rel="noreferrer" className="font-mono text-sky-700 hover:underline">
                        {f.rule_id}
                      </a>
                      <div className="text-muted-foreground max-w-56 whitespace-normal">{f.summary}</div>
                      {!f.counted && <div className="text-orange-700">provisional, không tính điểm</div>}
                    </TableCell>
                    <TableCell className="text-xs">{f.severity}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`font-mono text-[11px] ${OUTCOME_STYLE[f.outcome] ?? ''}`}>
                        {f.outcome}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xl text-xs whitespace-normal">
                      {f.evidence.map((e, i) => (
                        <Evidence key={i} text={e} onSeek={onSeek} />
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function FeatureTable({ features }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nguồn dữ liệu ({Object.keys(features).length} features)</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>feature</TableHead>
              <TableHead>status</TableHead>
              <TableHead>source</TableHead>
              <TableHead>value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(features).map(([name, f]) => (
              <TableRow key={name}>
                <TableCell className="font-mono text-xs">{name}</TableCell>
                <TableCell>
                  <StatusBadge status={f.status} />
                </TableCell>
                <TableCell className="text-xs">{f.source ?? '-'}</TableCell>
                <TableCell className="max-w-md truncate text-xs" title={JSON.stringify(f.value)}>
                  {typeof f.value === 'string' ? f.value : JSON.stringify(f.value)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
