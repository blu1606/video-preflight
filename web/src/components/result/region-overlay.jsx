import { SEV_BORDER } from '@/lib/score-style'
import { activeRegions } from '@/lib/timeline'
import { cn } from '@/lib/utils'

const SEV_LABEL_BG = { critical: 'bg-sev-high', high: 'bg-sev-high', medium: 'bg-sev-medium', low: 'bg-sev-low', info: 'bg-sev-info' }

/**
 * Boxes drawn over the video frame while the playhead is within ±0.75s of the frame the box was
 * estimated on. Boxes come from the VLM (`localize_issues`) and are always labelled "AI ước lượng".
 * Must sit in a container with exactly the video's displayed aspect ratio.
 */
export function RegionOverlay({ markers, currentTime }) {
  const shown = activeRegions(markers, currentTime)
  if (!shown.length) return null
  return (
    <div className="pointer-events-none absolute inset-0">
      {shown.map((m) => {
        const [x, y, w, h] = m.region.box
        return (
          <div
            key={m.id}
            className={cn('absolute rounded-sm border-2', SEV_BORDER[m.severity])}
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}
          >
            <span className={cn('absolute top-0 left-0 max-w-full truncate rounded-br-sm px-1 text-[10px] leading-4 font-semibold text-white', SEV_LABEL_BG[m.severity])}>
              {m.region.label || m.title} · AI ước lượng
            </span>
          </div>
        )
      })}
    </div>
  )
}
