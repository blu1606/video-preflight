import { useState } from 'react'

import { ErrorAlert } from '@/components/common'
import { SkeletonBlock, Tag, TimeChip } from '@/components/score-visuals'
import { SEV_BORDER } from '@/lib/score-style'
import { useFetch } from '@/hooks/use-fetch'
import { fmtTime, sortBySeverity } from '@/lib/timeline'
import { cn } from '@/lib/utils'

async function getJson(url, emptyOn = []) {
  const res = await fetch(url)
  if (emptyOn.includes(res.status)) return null
  if (!res.ok) {
    let detail = await res.text()
    try {
      detail = JSON.parse(detail).detail ?? detail
    } catch {
      // plain text
    }
    throw new Error(`${res.status} ${detail}`)
  }
  return res.json()
}

async function loadExtraction(videoId, hasFile) {
  const [features, frames] = await Promise.all([
    getJson(`/py/videos/${encodeURIComponent(videoId)}/features`, [404]),
    hasFile ? getJson(`/py/videos/${encodeURIComponent(videoId)}/frames`, [400, 404]) : Promise.resolve(null),
  ])
  return { features, frames: frames?.frames ?? [] }
}

function Meta({ label, value }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-xs break-all">{value ?? '–'}</div>
    </div>
  )
}

/** Frame thumbnail with the severity border of the markers at that second and their estimated boxes. */
function Frame({ frame, markers, onClick, selected }) {
  const top = sortBySeverity(markers)[0]
  const boxes = markers.filter((m) => m.region?.box && Math.abs(m.region.frame_sec - frame.sec) < 0.5)
  return (
    <button
      type="button"
      onClick={onClick}
      title={markers.map((m) => m.title).join('\n') || undefined}
      className={cn('overflow-hidden rounded-md border-2 bg-surface text-left', top ? SEV_BORDER[top.severity] : 'border-transparent', selected && 'ring-2 ring-ink')}
    >
      <div className="relative">
        <img src={frame.url} alt={`frame ${fmtTime(frame.sec)}`} loading="lazy" className="aspect-[9/16] w-full object-cover" />
        {boxes.map((m) => {
          const [x, y, w, h] = m.region.box
          return <span key={m.id} className={cn('absolute border-2', SEV_BORDER[m.severity])} style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }} />
        })}
      </div>
      <div className="flex items-center justify-between bg-subtle px-1 font-mono text-[10px]">
        {fmtTime(frame.sec)}
        {markers.length > 0 && <span className="text-critical">{markers.length}</span>}
      </div>
    </button>
  )
}

/** What the AI saw: 1 fps frames (marker frames bordered), transcript with timestamps, cuts, model/cache. */
export function TabAiSaw({ videoId, hasFile, markers, cutTimes, extractStep, onSeek }) {
  const { data, loading, error, reload } = useFetch(() => loadExtraction(videoId, hasFile), [videoId, hasFile])
  const [zoom, setZoom] = useState(null)
  if (loading) return <div className="grid grid-cols-8 gap-2">{Array.from({ length: 16 }, (_, i) => <SkeletonBlock key={i} className="aspect-[9/16]" />)}</div>
  if (error) return <ErrorAlert error={error} onRetry={reload} />
  const { features, frames } = data
  if (!features) return <p className="text-sm text-muted-foreground">Video chưa được trích xuất (chưa có cache features). Chạy phân tích với extract=auto để trích xuất.</p>

  const status = features.extraction_status ?? {}
  const segments = features.transcript_segments ?? []
  const cuts = cutTimes?.length ? cutTimes : markers.filter((m) => m.kind === 'cut').map((m) => m.t_start)
  const issue = markers.filter((m) => m.kind === 'issue' || m.kind === 'ghost')
  const at = (sec) => issue.filter((m) => Math.round(m.region?.frame_sec ?? m.t_start) === Math.round(sec))
  const zoomMarkers = zoom ? at(zoom.sec) : []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface p-3 shadow-sheet md:grid-cols-5">
        <Meta label="Vision model" value={features.vision_model} />
        <Meta label="Token" value={features.token_usage?.total_tokens} />
        <Meta
          label="Thời gian (frames / audio / VLM)"
          value={features.benchmark_latency && `${features.benchmark_latency.frame_extraction_sec}s / ${features.benchmark_latency.audio_transcription_sec}s / ${features.benchmark_latency.vision_inference_sec}s`}
        />
        <Meta label="Cache" value={`${status.state ?? '–'} · ${extractStep?.output?.source ?? 'cache'}`} />
        <Meta label="Schema · fingerprint" value={`v${features.schema_version ?? '?'} · ${features.video_fingerprint?.slice(0, 12) ?? '–'}`} />
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          Frames 1 fps ({frames.length}) <span className="text-xs font-normal text-muted-foreground">· đúng các ảnh gửi cho VLM; viền màu = frame có marker, khung = vùng AI ước lượng</span>
        </h3>
        {frames.length ? (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10">
            {frames.map((f) => (
              <Frame key={f.url} frame={f} markers={at(f.sec)} selected={zoom?.url === f.url} onClick={() => setZoom(zoom?.url === f.url ? null : f)} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Không có frame (video chưa có file).</p>
        )}
        {zoom && (
          <div className="flex flex-wrap gap-3 rounded-xl bg-surface p-3 shadow-sheet">
            <img src={zoom.url} alt="frame" className="max-h-80 rounded" />
            <div className="min-w-0 flex-1 space-y-1 text-xs">
              <TimeChip sec={zoom.sec} onSeek={onSeek} />
              {zoomMarkers.map((m) => (
                <div key={m.id}>
                  <b>{m.title}</b>
                  {m.region?.box && <Tag tone="accent" className="ml-1">AI ước lượng · confidence {m.region.confidence}</Tag>}
                  <div className="text-muted-foreground">{m.comment}</div>
                </div>
              ))}
              {(features.features?.key_moments ?? [])
                .filter((k) => Math.abs(k.timestamp_sec - zoom.sec) < 1.5)
                .map((k) => (
                  <div key={k.timestamp_sec}>
                    <b>{k.event}</b>: {k.description}
                  </div>
                ))}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Lời thoại</h3>
        {segments.length ? (
          <ol className="space-y-1 rounded-xl bg-surface p-3 text-sm shadow-sheet">
            {segments.map((s, i) => (
              <li key={`${s.start}-${i}`} className="flex gap-2">
                <TimeChip sec={s.start} onSeek={onSeek} />
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm">{features.transcript || '(không có lời thoại)'}</p>
        )}
      </section>

      {cuts?.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Mốc cắt cảnh ({cuts.length})</h3>
          <div className="flex flex-wrap gap-1">
            {cuts.map((t) => (
              <TimeChip key={t} sec={t} onSeek={onSeek} />
            ))}
          </div>
        </section>
      )}

      <details className="rounded-xl bg-surface p-3 shadow-sheet">
        <summary className="cursor-pointer text-sm font-semibold">JSON features do VLM trả về</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded bg-stage p-2 text-[11px] text-on-stage">{JSON.stringify(features.features ?? {}, null, 2)}</pre>
      </details>
    </div>
  )
}
