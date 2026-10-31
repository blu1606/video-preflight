import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useAnalysisRun } from '../hooks/use-analysis-run'
import { useFetch } from '../hooks/use-fetch'
import { DEFAULT_OPTIONS } from '../lib/analysis-options'
import { db, dbPatch, py, uploadVideo } from '../lib/api'
import { AppBar } from '../studio/app-bar'
import { DataAtlas } from '../studio/data-atlas'
import { DecisionsDialog } from '../studio/decisions-dialog'
import { EditPanel } from '../studio/edit-panels'
import { FixesColumn } from '../studio/fixes-column'
import { FlowDiagram } from '../studio/flow-diagram'
import { ColumnResizer } from '../studio/column-resizer'
import { criterionTarget } from '../studio/insight-cites'
import { Icon } from '../studio/icon'
import { LeftColumn } from '../studio/left-column'
import { PhoneStage } from '../studio/phone-stage'
import { defaultSkin } from '../studio/platform-skins'
import { RightColumn } from '../studio/right-column'
import { RunDialog } from '../studio/run-dialog'
import { ShopProfile } from '../studio/shop-profile'
import { SkuMarketSheet } from '../studio/sku-market'
import { missingPostInfo, provisionalOverall, questionSegments, revealOrder } from '../studio/studio-model'
import { UpdateNote } from '../studio/update-note'
import { useRightWidth } from '../studio/use-right-width'
import '../studio/mockup-v2.css'
import '../studio/studio.css'

const REVEAL_MS = 140
const historyUrl = (id) => `/analyses?targetId=${encodeURIComponent(id)}&kind=video_run&_sort=id&_order=desc`

async function loadExtraction(id) {
  const res = await fetch(`/py/videos/${encodeURIComponent(id)}/features`)
  if (res.status === 404) return { state: 'missing' }
  if (!res.ok) throw new Error(`${res.status}`)
  const body = await res.json()
  return { state: body.extraction_status?.state ?? null, duration: body.features?.['video.duration_sec']?.value ?? null }
}

/** The Decisions question bank (axes of the radar before any run) and the overall-score weights. */
const loadBank = () =>
  py('/questions')
    .then((b) => ({ questions: b.questions ?? b, scoring: b.scoring ?? null }))
    .catch(() => ({ questions: [], scoring: null }))

const NOTHING = new Set()

/**
 * The batched Decisions answer of a live run, revealed one question at a time. The reveal outlives the run
 * (a cached answer arrives just before the run ends) and stops once every answer is shown. Returns the
 * revealed id set (null = show everything) and the id revealed last.
 */
function useReveal(liveQuestions) {
  const [state, setState] = useState({ batch: null, shown: null, last: null })
  useEffect(() => {
    if (!liveQuestions) return undefined
    const order = revealOrder(liveQuestions)
    const shown = new Set()
    let i = 0
    const timer = setInterval(() => {
      if (i >= order.length) {
        clearInterval(timer)
        setState({ batch: liveQuestions, shown: null, last: null })
        return
      }
      shown.add(order[i])
      setState({ batch: liveQuestions, shown: new Set(shown), last: order[i] })
      i += 1
    }, REVEAL_MS)
    return () => clearInterval(timer)
  }, [liveQuestions])
  if (!liveQuestions) return [null, null]
  if (state.batch !== liveQuestions) return [NOTHING, null] // just arrived, first tick pending
  return [state.shown, state.last]
}

export default function StudioPage() {
  const [params, setParams] = useSearchParams()
  const shops = useFetch(() => db('/shops'), [])
  const shopId = params.get('shop') ?? shops.data?.[0]?.id ?? null
  const shop = shops.data?.find((s) => s.id === shopId) ?? null
  const videos = useFetch(() => (shopId ? db(`/videos?shopId=${encodeURIComponent(shopId)}`) : Promise.resolve([])), [shopId])
  const skus = useFetch(() => (shopId ? db(`/skus?shopId=${encodeURIComponent(shopId)}`) : Promise.resolve([])), [shopId])
  const firstPlayable = videos.data?.find((v) => v.local_file) ?? videos.data?.[0]
  const videoId = params.get('video') ?? firstPlayable?.id ?? null
  const videoRec = useFetch(() => (videoId ? db(`/videos/${encodeURIComponent(videoId)}`) : Promise.resolve(null)), [videoId])
  const [videoOverride, setVideoOverride] = useState(null)
  const video = videoOverride?.id === videoId ? videoOverride : videoRec.data
  // Platform in view for the phone preview: per video, defaulting to the video's first posting platform.
  const [previewSkin, setPreviewSkin] = useState(null)
  const skin = previewSkin?.videoId === videoId ? previewSkin.skin : defaultSkin(video?.post?.platforms)
  const setSkin = (id) => setPreviewSkin({ videoId, skin: id })
  const sku = skus.data?.find((s) => s.sku_id === video?.sku_id) ?? null
  const audience = useFetch(() => (sku ? db(`/skuAudience/${encodeURIComponent(sku.sku_id)}`).catch(() => null) : Promise.resolve(null)), [sku?.sku_id])
  const extraction = useFetch(() => (videoId ? loadExtraction(videoId).catch(() => ({ state: 'missing' })) : Promise.resolve(null)), [videoId])
  const history = useFetch(() => (videoId ? db(historyUrl(videoId)) : Promise.resolve([])), [videoId])
  const [cacheTick, setCacheTick] = useState(0)
  const frames = useFetch(() => (videoId ? py(`/videos/${encodeURIComponent(videoId)}/frames`).then((f) => f.frames ?? []).catch(() => []) : Promise.resolve([])), [videoId])
  const bank = useFetch(loadBank, [])

  const run = useAnalysisRun()
  const [selectedRunId, setSelectedRunId] = useState(null)
  const [tab, setTab] = useState('check')
  const [sideTab, setSideTab] = useState('platform')
  const [resizing, setResizing] = useState(false)
  const [panel, setPanel] = useState(null)
  const [profileOpen, setProfileOpen] = useState(false)
  // Three columns from 1024 to 1279 px leave the phone stage too narrow: the question list opens folded to its rail
  // there (one click opens it). Wider screens show it; narrower ones stack the columns instead.
  const [leftCollapsed, setLeftCollapsed] = useState(() => window.innerWidth >= 1024 && window.innerWidth < 1280)
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  // what a run would reuse; computed server-side in a few seconds, so fetched ahead of the run dialog
  const cacheStatus = useFetch(
    () => (videoId ? py(`/videos/${encodeURIComponent(videoId)}/cache-status?rubric=${options.rubric}`) : Promise.resolve(null)),
    [videoId, options.rubric, cacheTick],
  )
  const [selectedQ, setSelectedQ] = useState(null)
  const [decisionsOpen, setDecisionsOpen] = useState(false)
  const [runDialog, setRunDialog] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [updateNote, setUpdateNote] = useState(null) // 'upload' | 'run' while the reminder is open
  const [skuOpen, setSkuOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [atlasOpen, setAtlasOpen] = useState(false)
  const [atlasDataset, setAtlasDataset] = useState('shops')
  const videoRef = useRef(null)

  const running = run.status === 'running'
  const runs = history.data ?? []
  const saved = runs.find((a) => a.id === selectedRunId) ?? runs[0] ?? null
  const analysis = run.status === 'done' ? run.result : running ? null : saved
  const result = analysis?.result ?? null
  const liveQuestions = run.partial?.decisions?.questions ?? null
  const questions = (running ? liveQuestions : result?.decisions?.questions) ?? bank.data?.questions ?? []
  const [revealed, lastRevealed] = useReveal(liveQuestions)
  // Before the Decisions step answers, every axis of a running analysis waits ("…").
  const radarRevealed = running && !liveQuestions ? NOTHING : revealed

  // While answers are revealed the score climbs with them (an estimate until the backend's final overall).
  const weights = bank.data?.scoring?.group_weights ?? saved?.result?.overall?.weights ?? null
  const provisional = revealed && lastRevealed ? provisionalOverall(questions, revealed, weights) : null

  // A finished run becomes the selected saved run. useFetch hands out a new reload() every render, so it is
  // read through a ref: depending on it would re-run this effect forever.
  const reloadHistory = useRef(history.reload)
  reloadHistory.current = history.reload
  const finishedId = run.status === 'done' ? run.result?.id : null
  useEffect(() => {
    if (finishedId == null) return
    setSelectedRunId(finishedId)
    reloadHistory.current()
    setCacheTick((n) => n + 1)
  }, [finishedId])

  const resetForVideo = useCallback(() => {
    run.reset()
    setSelectedRunId(null)
    setSelectedQ(null)
    setTab('check')
  }, [run])

  const selectShop = (id) => {
    resetForVideo()
    setParams({ shop: id })
  }
  const selectVideo = (id) => {
    resetForVideo()
    setPanel(null)
    setParams({ shop: shopId, video: id })
  }

  const seek = useCallback((t) => {
    const v = videoRef.current
    if (!v || t == null) return
    v.currentTime = Math.max(0, t)
    v.play().catch(() => {})
  }, [])

  // Every run goes through the run dialog: cache or fresh, and the cost of each paid step. An uploaded video
  // with missing caption / hashtags / a default SKU first gets the update reminder.
  const missingInfo = missingPostInfo(video)
  const analyze = () => {
    if (!videoId) return
    if (missingInfo.length) setUpdateNote('run')
    else setRunDialog(true)
  }
  const startRun = (opts) => {
    setRunDialog(false)
    setSelectedQ(null)
    setTab('check')
    setLeftCollapsed(false)
    run.start(videoId, opts)
  }

  useEffect(() => {
    if (!mapOpen) return undefined
    const onKey = (e) => e.key === 'Escape' && setMapOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mapOpen])

  const openQuestion = (id) => {
    setSelectedQ(id)
    setDecisionsOpen(true)
  }

  // A chip under an AI insight: a criterion opens its Decisions question (or the fix list when none answered it),
  // a fix opens the fix list, a moment seeks the video, a dataset opens the Data Atlas at that dataset.
  const onCite = (action) => {
    if (action.type === 'time') seek(action.t)
    else if (action.type === 'criterion') {
      const answered = new Set((result?.decisions?.questions ?? []).map((q) => q.id))
      if (criterionTarget(action.id, answered).open === 'question') openQuestion(action.id)
      else setTab('fix')
    } else if (action.type === 'fix') setTab('fix')
    else if (action.type === 'dataset') {
      setAtlasDataset(action.dataset)
      setAtlasOpen(true)
    }
  }

  // Direct upload from the app bar: attached to the SKU in view (changeable later in the products panel).
  const upload = async (file) => {
    if (!file || !shop) return
    const form = new FormData()
    form.append('file', file)
    form.append('shop_id', shop.shop_id)
    if (sku) form.append('sku_id', sku.sku_id)
    for (const pf of video?.post?.platforms ?? ['tiktok_shop_video', 'shopee_listing']) form.append('platforms', pf)
    form.append('sponsorship', video?.post?.sponsorship ?? 'own_shop')
    setUploading(0)
    try {
      let created = await uploadVideo(form, setUploading)
      // the SKU in view is only a default until the seller picks or confirms it in the products panel
      if (created.sku_id) created = await dbPatch(`/videos/${encodeURIComponent(created.id)}`, { sku_auto: true })
      videos.reload()
      selectVideo(created.id)
      setVideoOverride(created)
      setUpdateNote('upload')
    } catch (e) {
      window.alert(`Tải video lỗi: ${e.message}`)
    } finally {
      setUploading(null)
    }
  }

  const duration = extraction.data?.duration ?? video?.duration_sec ?? null
  const issueMarkers = useMemo(() => (result?.markers ?? []).filter((m) => m.kind === 'issue' || m.kind === 'ghost'), [result])
  const strengths = useMemo(
    () => (result ? questionSegments(result, duration).flatMap((s) => s.items).filter((r) => r.state === 'ok' && r.value >= 75 && r.t != null) : []),
    [result, duration],
  )

  const lastStep = [...run.steps].reverse().find((s) => s.status === 'running') ?? run.steps.at(-1)
  const runLabel = lastStep ? `Đang chạy · ${lastStep.name}` : 'Đang khởi động…'
  const canAnalyze = !!video && !running
  const analyzeHint = !video ? 'Chọn video trước.' : extraction.data?.state === 'missing' ? 'Video chưa trích xuất: lần chạy đầu sẽ trích xuất (có tính phí, hỏi trước).' : null
  const fixTab = tab === 'fix' && result
  const leftWidth = leftCollapsed || fixTab ? 52 : 320
  const rightCol = useRightWidth(leftWidth)

  return (
    <div className="pf-root studio-root" data-tab="analysis">
      <AppBar
        shops={shops.data ?? []}
        shop={shop}
        onShop={selectShop}
        onShopProfile={() => setProfileOpen(true)}
        videos={videos.data ?? []}
        video={video}
        sku={sku}
        skus={skus.data ?? []}
        onSelectVideo={selectVideo}
        onUpload={upload}
        uploading={uploading}
        onOpenAtlas={() => setAtlasOpen(true)}
        tab={fixTab ? 'fix' : 'check'}
        onTab={setTab}
        canFix={!!result && !running}
        running={running}
        runLabel={runLabel}
        history={runs}
        selectedRunId={analysis?.id}
        onRun={(id) => { run.reset(); setSelectedRunId(id); setSelectedQ(null) }}
        options={options}
        onOptions={setOptions}
        extractionState={extraction.data?.state}
      />
      <main className="main studio-main">
        <section
          className={`analysis${leftCollapsed || fixTab ? ' studio-left-collapsed' : ''}${resizing ? ' is-resizing' : ''}`}
          style={{ '--col-left': `${leftWidth}px`, '--col-right': `${rightCol.width}px` }}
          aria-label="Kiểm tra video"
        >
          {leftCollapsed || fixTab ? (
            <button type="button" className="studio-left-rail" onClick={() => { setLeftCollapsed(false); setTab('check') }} aria-label="Mở cột câu hỏi">
              <Icon name="arrow-right-2" />
              <span className="studio-left-rail-lab">Câu hỏi chấm</span>
            </button>
          ) : (
            <LeftColumn
              running={running}
              steps={running || run.status === 'done' ? run.steps : (result?.trace ?? [])}
              result={result}
              savedRun={!running && run.status !== 'done' ? saved : null}
              duration={duration}
              onSeek={seek}
              onOpenQuestion={(row) => openQuestion(row.id)}
              selectedId={selectedQ}
              onCollapse={() => setLeftCollapsed(true)}
              onOpenMap={() => setMapOpen(true)}
            />
          )}
          <PhoneStage
            key={videoId ?? 'none'}
            video={video}
            shop={shop}
            sku={sku}
            onOpenSku={() => setSkuOpen(true)}
            panel={panel}
            onPanel={setPanel}
            videoRef={videoRef}
            onSeek={seek}
            issues={issueMarkers}
            strengths={strengths}
            fallbackDuration={duration}
            music={result?.features && 'video.music' in result.features ? result.features['video.music'] : undefined}
            skin={skin}
          />
          {fixTab ? (
            <FixesColumn key={analysis.id} result={result} onSeek={seek} onOpenSku={() => setSkuOpen(true)} />
          ) : (
            <RightColumn
              run={run}
              result={result}
              questions={questions}
              revealed={radarRevealed}
              provisional={provisional}
              selectedId={selectedQ}
              onOpenQuestion={openQuestion}
              onOpenAll={() => setDecisionsOpen(true)}
              onSeek={seek}
              onCite={onCite}
              onAnalyze={analyze}
              canAnalyze={canAnalyze}
              analyzeHint={analyzeHint}
              sku={sku}
              onOpenSku={() => setSkuOpen(true)}
              onOpenFixes={() => setTab('fix')}
              sideTab={sideTab}
              onSideTab={setSideTab}
            />
          )}
          <ColumnResizer
            width={rightCol.width}
            bounds={rightCol.bounds}
            onResize={rightCol.setWidth}
            onReset={rightCol.reset}
            onDragging={setResizing}
          />
          {panel && shop && (
            <EditPanel
              panel={panel}
              onClose={() => setPanel(null)}
              shop={shop}
              videos={videos.data ?? []}
              video={video}
              result={result}
              skin={skin}
              onSkin={setSkin}
              skus={skus.data ?? []}
              audience={audience.data}
              extracted={extraction.data?.state && extraction.data.state !== 'missing'}
              onSelectVideo={selectVideo}
              onSaved={(updated) => { setVideoOverride(updated); videos.reload() }}
            />
          )}
        </section>
        {run.status === 'error' && (
          <p className="studio-error" role="alert">
            <Icon name="danger" /> {run.error}
          </p>
        )}
      </main>
      {profileOpen && shop && <ShopProfile shop={shop} onClose={() => setProfileOpen(false)} />}
      {decisionsOpen && result && (
        <DecisionsDialog
          open
          onClose={() => setDecisionsOpen(false)}
          result={result}
          frames={frames.data ?? []}
          initialQuestionId={selectedQ}
          onSeek={(t) => { setDecisionsOpen(false); seek(t) }}
        />
      )}
      {mapOpen && (
        <div className="deep-modal">
          <div className="deep-scrim" onClick={() => setMapOpen(false)} />
          <section className="deep-dialog studio-map-dialog" role="dialog" aria-modal="true" aria-label="Agent map">
            <header className="ep-head">
              <h2>Agent map</h2>
              <button type="button" className="ep-x" onClick={() => setMapOpen(false)} aria-label="Đóng"><Icon name="close" /></button>
            </header>
            <FlowDiagram
              steps={running || run.status === 'done' ? run.steps : (result?.trace ?? [])}
              running={running}
              variant="map"
              title={`Phân tích ${videoId ?? ''}`}
            />
          </section>
        </div>
      )}
      {skuOpen && sku && (
        <SkuMarketSheet sku={sku} result={result} onClose={() => setSkuOpen(false)} onOpenQuestion={(id) => { setSkuOpen(false); openQuestion(id) }} />
      )}
      <DataAtlas key={atlasDataset} open={atlasOpen} initialId={atlasDataset} onClose={() => setAtlasOpen(false)} shopId={shopId} videoId={videoId} skuId={video?.sku_id} onSeek={seek} />
      {updateNote && missingInfo.length > 0 && (
        <UpdateNote
          items={missingInfo}
          reason={updateNote}
          onOpenPanel={(p) => { setUpdateNote(null); setPanel(p) }}
          onContinue={() => { const next = updateNote; setUpdateNote(null); if (next === 'run') setRunDialog(true) }}
          onClose={() => setUpdateNote(null)}
        />
      )}
      {runDialog && videoId && <RunDialog options={options} cache={cacheStatus} onClose={() => setRunDialog(false)} onRun={startRun} />}
    </div>
  )
}
