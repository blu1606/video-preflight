import { FileText, Loader2, RefreshCw, Sparkles, WifiOff } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'

import { ErrorAlert } from '@/components/common'
import { ErrorBoundary } from '@/components/error-boundary'
import { ReportDialog } from '@/components/report/report-dialog'
import { GroupScores } from '@/components/result/group-scores'
import { InsightSummary } from '@/components/result/insight-summary'
import { MarketCharts } from '@/components/result/market-charts'
import { PolicyTargets } from '@/components/result/policy-targets'
import { RunHistory } from '@/components/result/run-history'
import { RunSteps } from '@/components/result/run-steps'
import { ScoreSummary } from '@/components/result/score-summary'
import { ShopSituation } from '@/components/result/shop-situation'
import { TopFixes } from '@/components/result/top-fixes'
import { VideoStage } from '@/components/result/video-stage'
import { Sheet, SkeletonBlock, Tag } from '@/components/score-visuals'
import { Button } from '@/components/ui/button'
import { VideoLibrary } from '@/components/video-library'
import { useAnalysisRun } from '@/hooks/use-analysis-run'
import { useFetch } from '@/hooks/use-fetch'
import { optionsFromSearch, paidConfirmText, paidWarnings } from '@/lib/analysis-options'
import { buildViewModel, refTarget, reportTarget } from '@/lib/analysis-view-model'
import { db } from '@/lib/api'
import { GROUP_LANE, platformLabel } from '@/lib/labels'
import { waitForNewRun } from '@/lib/latest-run'

async function loadVideo(id) {
  const video = await db(`/videos/${encodeURIComponent(id)}`)
  const [shop, sku] = await Promise.all([
    video.shop_id ? db(`/shops/${encodeURIComponent(video.shop_id)}`).catch(() => null) : null,
    video.sku_id ? db(`/skus/${encodeURIComponent(video.sku_id)}`).catch(() => null) : null,
  ])
  return { video, shop, sku }
}

/**
 * Extraction cache of the video: transcript segments and its state (missing | changed | stale | current).
 * 404 means "not extracted yet": no transcript, and extract=auto would run a paid extraction.
 */
async function loadExtraction(id) {
  const res = await fetch(`/py/videos/${encodeURIComponent(id)}/features`)
  if (res.status === 404) return { segments: [], state: 'missing' }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const body = await res.json()
  return { segments: body.transcript_segments ?? [], state: body.extraction_status?.state ?? null }
}

const historyUrl = (id) => `/analyses?targetId=${encodeURIComponent(id)}&kind=video_run&_sort=id&_order=desc`

function PageSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(300px,420px)_minmax(0,1fr)]">
      <SkeletonBlock className="h-[620px] rounded-2xl" />
      <div className="space-y-4">
        <SkeletonBlock className="h-10" />
        <SkeletonBlock className="h-36 rounded-2xl" />
        <SkeletonBlock className="h-64 rounded-2xl" />
      </div>
    </div>
  )
}

export default function AnalyzePage() {
  const [params, setParams] = useSearchParams()
  const videoId = params.get('video')
  if (!videoId) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-xl font-bold">Lịch sử: chọn video để xem kết quả</h1>
        <Sheet bodyClassName="p-2">
          <VideoLibrary />
        </Sheet>
      </div>
    )
  }
  return (
    <ErrorBoundary key={videoId} name="analyze-page" title="Trang kết quả gặp lỗi khi hiển thị">
      <AnalyzeVideo videoId={videoId} params={params} setParams={setParams} />
    </ErrorBoundary>
  )
}

function AnalyzeVideo({ videoId, params, setParams }) {
  const info = useFetch(() => loadVideo(videoId), [videoId])
  const location = useLocation()
  const runs = useFetch(() => db(historyUrl(videoId)), [videoId])
  const extraction = useFetch(() => loadExtraction(videoId), [videoId])
  const run = useAnalysisRun()
  const startRun = run.start
  const [selectedId, setSelectedId] = useState(null)
  const [options, setOptions] = useState(() => optionsFromSearch(params))
  const [openGroup, setOpenGroup] = useState(null)
  const [hoverFix, setHoverFix] = useState(null)
  const [hoverMarker, setHoverMarker] = useState(null)
  const [report, setReport] = useState({ open: false, tab: 'agent', anchor: null })
  const videoRef = useRef(null)
  const autorunDone = useRef(null)
  const knownMaxId = useRef(0) // newest saved run id when the current run started
  const [latest, setLatest] = useState({ loading: false, missing: false, error: null })
  // an unknown extraction state (endpoint failed) counts as "would extract", so the cost is never hidden
  const extractionState = extraction.error ? 'missing' : (extraction.data?.state ?? null)

  // ?autorun=1 starts once, then the flag is dropped so a reload does not re-run. Paid steps need a
  // confirmation unless the upload page already confirmed them in this navigation (router state, never
  // the URL, so a shared link cannot skip it). No paid steps: starts right away.
  const extractionReady = !extraction.loading
  const confirmedByUpload = location.state?.confirmedRun === videoId
  useEffect(() => {
    if (params.get('autorun') !== '1' || autorunDone.current === videoId || !extractionReady) return
    autorunDone.current = videoId
    const opts = optionsFromSearch(params)
    const text = paidConfirmText(paidWarnings(opts, extractionState))
    const next = new URLSearchParams(params)
    next.delete('autorun')
    setParams(next, { replace: true }) // also drops the router state
    if (text && !confirmedByUpload && !window.confirm(text)) return
    knownMaxId.current = Math.max(0, ...(runs.data ?? []).map((a) => Number(a.id)))
    startRun(videoId, opts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, videoId, startRun, setParams, extractionReady])

  // A finished run becomes the selected history entry.
  const finishedId = run.status === 'done' ? run.result?.id : null
  const reloadRuns = runs.reload
  const reloadExtraction = extraction.reload
  useEffect(() => {
    if (finishedId == null) return
    setSelectedId(finishedId)
    reloadRuns()
    reloadExtraction() // the run may have extracted the video: transcript and cache state change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedId])
  // An extraction finishing mid-run already provides the transcript, before the run is done.
  const extractedLive = run.steps.some(
    (s) => s.name === 'extract_video_content' && s.status === 'ok' && s.output?.source === 'live extraction',
  )
  useEffect(() => {
    if (extractedLive) reloadExtraction()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractedLive])

  const live = run.status === 'running' || run.status === 'error'
  const history = runs.data ?? []
  const selected = run.status === 'done' ? run.result : (history.find((a) => a.id === selectedId) ?? history[0] ?? null)
  const result = live ? null : (selected?.result ?? null)
  const vm = useMemo(() => buildViewModel(result, live ? run.partial : null), [result, live, run.partial])

  const highlightIds = useMemo(() => {
    const ids = new Set(hoverFix?.markerIds ?? [])
    if (hoverMarker) ids.add(hoverMarker)
    const lane = GROUP_LANE[openGroup]
    if (lane) for (const m of vm.markers) if (m.lane === lane && m.kind !== 'cut' && m.kind !== 'beat') ids.add(m.id)
    return ids
  }, [hoverFix, hoverMarker, openGroup, vm.markers])

  if (info.loading) return <PageSkeleton />
  if (info.error) return <ErrorAlert error={info.error} onRetry={info.reload} />
  const { video, shop, sku } = info.data

  const seek = (t) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, t)
    v.play().catch(() => {})
  }
  const openReport = (tab, anchor = null) => setReport({ open: true, tab, anchor })
  const why = (item) => {
    const target = reportTarget(item, result)
    openReport(target.tab, target.anchor)
  }
  // Every user-started run goes through the same paid-step confirmation.
  const requestRun = (opts) => {
    const text = paidConfirmText(paidWarnings(opts, extractionState))
    if (text && !window.confirm(text)) return
    knownMaxId.current = Math.max(0, ...history.map((a) => Number(a.id)))
    setLatest({ loading: false, missing: false, error: null })
    setSelectedId(null)
    run.start(videoId, opts)
  }
  // After a dropped stream: fetch the run the server saved instead of starting another one.
  const loadLatest = async () => {
    setLatest({ loading: true, missing: false, error: null })
    try {
      const found = await waitForNewRun(() => db(historyUrl(videoId)), knownMaxId.current)
      if (!found) {
        setLatest({ loading: false, missing: true, error: null })
        return
      }
      run.reset()
      setSelectedId(found.id)
      setLatest({ loading: false, missing: false, error: null })
      runs.reload()
      extraction.reload()
    } catch (e) {
      setLatest({ loading: false, missing: false, error: e })
    }
  }
  const steps = live || run.status === 'done' ? run.steps : (result?.trace ?? [])
  const insightStep = steps.find((s) => s.name === 'summarize_insights') ?? null
  const openRef = (ref) => {
    const target = refTarget(ref, result)
    openReport(target.tab, target.anchor)
  }
  const platforms = video.post?.platforms ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight">{video.product_label ?? sku?.item_name ?? video.id}</h1>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono">{video.id}</span>
            {shop && <span>· {shop.shop_name}</span>}
            {sku && <span>· SKU {sku.sku_id}</span>}
            {platforms.map((p) => (
              <Tag key={p} tone="muted">{platformLabel(p)}</Tag>
            ))}
            {video.stage === 'prepublish' && <Tag tone="accent">chưa đăng</Tag>}
          </div>
        </div>
        <Button className="ml-auto h-10 px-5 font-semibold" disabled={!result} onClick={() => openReport('agent')}>
          <FileText /> Xem báo cáo đầy đủ
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(300px,420px)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-24">
          <ErrorBoundary name="video-stage" title="Không hiển thị được video">
            <VideoStage
              video={video}
              videoRef={videoRef}
              markers={vm.markers}
              hasMarkers={vm.hasMarkers}
              pending={live || (runs.loading && !result)}
              fallbackDuration={result?.features?.['video.duration_sec']?.value ?? video.duration_sec}
              highlightIds={highlightIds}
              focusLane={GROUP_LANE[openGroup] ?? null}
              segments={extraction.data?.segments ?? []}
              claims={vm.absoluteClaims}
              onHoverMarker={setHoverMarker}
              onWhy={why}
            />
          </ErrorBoundary>
        </div>

        <div className="min-w-0 space-y-4">
          <RunHistory
            runs={history}
            selectedId={selected?.id}
            onSelect={(id) => {
              run.reset()
              setSelectedId(id)
            }}
            options={options}
            onOptionsChange={setOptions}
            onRerun={() => requestRun(options)}
            running={run.status === 'running'}
            extractionState={extractionState}
          />
          {runs.error && <ErrorAlert error={runs.error} onRetry={runs.reload} />}
          {run.status === 'error' && run.lost && (
            <div role="alert" className="space-y-2 rounded-xl border border-amber-ink/30 bg-amber-tint p-3 text-sm">
              <div className="flex items-center gap-2 font-semibold text-amber-ink">
                <WifiOff className="size-4" /> {run.error}
              </div>
              <p className="text-xs text-ink-2">Không cần chạy lại: tải kết quả server đã lưu cho lần chạy này.</p>
              <Button size="sm" onClick={loadLatest} disabled={latest.loading}>
                {latest.loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Tải kết quả mới nhất
              </Button>
              {latest.missing && (
                <p className="text-xs text-ink-2">
                  Chưa thấy kết quả mới sau khoảng 30 giây; phân tích có thể vẫn đang chạy. Bấm lại sau ít phút.
                </p>
              )}
              {latest.error && <ErrorAlert error={latest.error} />}
            </div>
          )}
          {run.status === 'error' && !run.lost && (
            <ErrorAlert error={new Error(run.error)} onRetry={() => requestRun(options)} />
          )}

          {(steps.length > 0 || run.status === 'running') && (
            <RunSteps steps={steps} runStatus={run.status === 'running' ? 'running' : 'done'} source={run.source} onOpenTrace={() => openReport('agent')} />
          )}

          {runs.loading && !live ? (
            <SkeletonBlock className="h-40 rounded-2xl" />
          ) : vm.stage === 'empty' && !live ? (
            <Sheet>
              <div className="space-y-3 py-6 text-center">
                <Sparkles className="mx-auto size-8 text-brand" />
                <p className="text-sm font-semibold">Video này chưa có lần phân tích nào.</p>
                <p className="text-xs text-muted-foreground">
                  {['missing', 'changed'].includes(extractionState)
                    ? 'Video chưa có cache trích xuất: lần chạy đầu sẽ trích xuất (frames + Whisper + VLM, khoảng 14k token) và hỏi xác nhận trước.'
                    : 'Đã có cache trích xuất: chạy với tùy chọn mặc định không gọi API tính phí.'}
                </p>
                <Button variant="outline" onClick={() => requestRun(options)}>Chạy phân tích</Button>
              </div>
            </Sheet>
          ) : (
            <>
              <ScoreSummary vm={vm} running={run.status === 'running'} video={video} analysisId={selected?.id} onApproved={info.reload} />
              <InsightSummary insights={vm.insights} running={run.status === 'running'} step={result ? insightStep : null} onOpenRef={openRef} />
              <TopFixes fixes={vm.fixes} hoveredMarkerId={hoverMarker} onHoverFix={setHoverFix} onSeek={video.local_file ? seek : undefined} onWhy={why} hasMarkers={vm.hasMarkers} />
              <PolicyTargets targets={vm.policy} onOpenRule={(ruleId) => openReport('policy', `rule-${ruleId}`)} />
              <GroupScores groups={vm.videoGroups} provisional={vm.stage === 'provisional'} notes={vm.insights?.groups} openGroup={openGroup} onOpenGroup={setOpenGroup} onWhyCriterion={why} />
            </>
          )}

          {!live && result && (
            <ShopSituation shop={shop} shopHealth={vm.shopHealth} diagnosis={result.video_diagnosis} />
          )}
          {!result && !live && shop && <ShopSituation shop={shop} shopHealth={null} diagnosis={null} />}

          <ErrorBoundary name="market" title="Không hiển thị được dữ liệu thị trường">
            <MarketCharts skuId={video.sku_id} ownPrice={result?.features?.['sku.price_vnd']?.value ?? sku?.price_vnd ?? video.listing?.price_vnd ?? null} />
          </ErrorBoundary>

          <p className="text-[11px] text-muted-foreground">
            Mọi số trên trang đọc từ kết quả backend (run #{selected?.id ?? '–'}). <Link to="/" className="underline">Kiểm tra video khác</Link>
          </p>
        </div>
      </div>

      <ErrorBoundary name="report" title="Không mở được báo cáo">
        <ReportDialog
          open={report.open}
          tab={report.tab}
          anchor={report.anchor}
          onOpenChange={(open) => setReport((r) => ({ ...r, open }))}
          onTabChange={(tab) => setReport((r) => ({ ...r, tab, anchor: null }))}
          analysis={live ? null : selected}
          video={video}
          onSeek={seek}
        />
      </ErrorBoundary>
    </div>
  )
}

