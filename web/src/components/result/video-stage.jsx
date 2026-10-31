import { Crosshair, GraduationCap, VideoOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { CoachCard } from '@/components/result/coach-card'
import { RegionOverlay } from '@/components/result/region-overlay'
import { TimelineLanes } from '@/components/result/timeline-lanes'
import { TranscriptFollow } from '@/components/result/transcript-follow'
import { crossedMarkers } from '@/lib/timeline'
import { cn } from '@/lib/utils'

function Toggle({ on, onChange, icon: Icon, children, title }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={() => onChange(!on)}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition',
        on ? 'border-on-stage bg-on-stage text-stage' : 'border-on-stage-line text-on-stage-2 hover:text-on-stage',
      )}
    >
      <Icon className="size-3.5" /> {children}
    </button>
  )
}

/**
 * Dark stage: the video in a phone frame with the estimated-region overlay, coach mode, the multi-lane
 * marker timeline and the transcript that follows playback. A video without a local file has no
 * player and no timeline.
 */
export function VideoStage({ video, videoRef, markers, hasMarkers, pending, fallbackDuration, highlightIds, focusLane, segments, claims, onHoverMarker, onWhy }) {
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(fallbackDuration ?? 0)
  const [aspect, setAspect] = useState(9 / 16)
  const [regionsOn, setRegionsOn] = useState(true)
  const [coachOn, setCoachOn] = useState(false)
  const [coachMarker, setCoachMarker] = useState(null)
  const [failed, setFailed] = useState(false)
  const prev = useRef(0)
  const raf = useRef(0)
  // read by the animation-frame loop, which outlives the render that started it
  const live = useRef({ coachOn, markers })
  useEffect(() => {
    live.current = { coachOn, markers }
  }, [coachOn, markers])

  // Follow playback every frame while playing (smooth playhead), plus on seeks via `timeupdate`.
  function tick() {
    const v = videoRef.current
    if (!v) return
    const cur = v.currentTime
    if (live.current.coachOn && !v.paused) {
      const hit = crossedMarkers(live.current.markers, prev.current, cur)
      if (hit.length) {
        v.pause()
        setCoachMarker(hit[0])
      }
    }
    prev.current = cur
    setTime(cur)
  }

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const loop = () => {
    tick()
    if (videoRef.current && !videoRef.current.paused) raf.current = requestAnimationFrame(loop)
  }

  const seek = (t) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, t)
    prev.current = v.currentTime
    setTime(v.currentTime)
    setCoachMarker(null)
  }

  if (!video?.local_file) {
    return (
      <div className="grid min-h-60 place-items-center rounded-2xl bg-stage p-6 text-center text-on-stage-2">
        <div className="space-y-2">
          <VideoOff className="mx-auto size-8" />
          <p className="text-sm">Video này không có file trong máy, nên không có player và timeline. Kết quả phân tích vẫn hiện bên phải.</p>
        </div>
      </div>
    )
  }

  const total = duration || fallbackDuration || 0

  return (
    <div className="space-y-3 rounded-2xl bg-stage p-4 text-on-stage">
      <div className="flex flex-wrap items-center gap-2">
        <Toggle on={regionsOn} onChange={setRegionsOn} icon={Crosshair} title="Khung AI ước lượng vị trí cần sửa trên khung hình">
          Hiện vùng cần sửa
        </Toggle>
        <Toggle on={coachOn} onChange={(on) => { setCoachOn(on); setCoachMarker(null) }} icon={GraduationCap} title="Tự dừng video ở từng marker">
          Coach mode
        </Toggle>
      </div>

      <div className="mx-auto w-full max-w-[300px] rounded-[34px] border-[6px] border-[#2a2d35] bg-black p-1 shadow-raise">
        <div className="relative overflow-hidden rounded-[26px] bg-black" style={{ aspectRatio: aspect }}>
          {failed ? (
            <div className="grid h-full place-items-center p-6 text-center text-xs text-on-stage-2">
              Không tải được file video ({video.local_file}).
            </div>
          ) : (
            <video
              ref={videoRef}
              src={`/media/${encodeURIComponent(video.local_file)}`}
              controls
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full object-contain"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget
                if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight)
                if (Number.isFinite(v.duration)) setDuration(v.duration)
              }}
              onPlay={() => {
                setCoachMarker(null)
                cancelAnimationFrame(raf.current)
                raf.current = requestAnimationFrame(loop)
              }}
              onTimeUpdate={tick}
              onSeeked={() => {
                prev.current = videoRef.current?.currentTime ?? 0
              }}
              onError={() => setFailed(true)}
            />
          )}
          {regionsOn && !failed && <RegionOverlay markers={markers} currentTime={time} />}
          {coachMarker && (
            <CoachCard
              marker={coachMarker}
              onWhy={onWhy}
              onContinue={() => {
                setCoachMarker(null)
                videoRef.current?.play().catch(() => {})
              }}
            />
          )}
        </div>
      </div>

      {!failed &&
        (hasMarkers ? (
          <TimelineLanes
            markers={markers}
            duration={total}
            currentTime={time}
            highlightIds={highlightIds}
            focusLane={focusLane}
            onSeek={seek}
            onHoverMarker={onHoverMarker}
            onWhy={onWhy}
          />
        ) : pending ? (
          <p className="text-xs text-on-stage-2">Marker hiện trên timeline khi phân tích xong.</p>
        ) : (
          <p className="text-xs text-on-stage-2">Lần chạy này chưa có marker trên timeline (chạy trước khi có tính năng này). Danh sách việc cần sửa vẫn ở bên phải.</p>
        ))}

      <div className="space-y-1">
        <div className="text-[11px] font-semibold tracking-wide text-on-stage-2 uppercase">Lời thoại</div>
        <TranscriptFollow segments={segments} claims={claims} currentTime={time} onSeek={seek} />
      </div>
    </div>
  )
}
