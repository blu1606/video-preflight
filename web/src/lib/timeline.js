// Pure time and marker helpers for the player, timeline lanes, region overlay, coach mode and transcript.

import { markerTitle } from './labels.js'

export const REGION_WINDOW_S = 0.75
export const DOT_LANES = ['policy', 'conversion', 'viral']
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

/** 75.4 -> "01:15" */
export function fmtTime(sec) {
  if (sec == null || Number.isNaN(Number(sec))) return '–'
  const s = Math.max(0, Math.floor(Number(sec)))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Marker time as "MM:SS" or "MM:SS–MM:SS". */
export function fmtRange(m) {
  return m.t_end != null && m.t_end !== m.t_start ? `${fmtTime(m.t_start)}–${fmtTime(m.t_end)}` : fmtTime(m.t_start)
}

/** Leading "MM:SS" or "MM:SS-MM:SS" of an evidence string -> {start, end|null}; anything else -> null. */
export function parseTimestamp(text) {
  if (typeof text !== 'string') return null
  const m = text.trim().match(/^(\d{1,2}):(\d{2})(?:\s*[-–]\s*(\d{1,2}):(\d{2}))?/)
  if (!m) return null
  const start = Number(m[1]) * 60 + Number(m[2])
  const end = m[3] != null ? Number(m[3]) * 60 + Number(m[4]) : null
  return { start, end }
}

export const severityRank = (s) => SEVERITY_RANK[s] ?? 5

export function sortBySeverity(markers) {
  return [...markers].sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.t_start - b.t_start)
}

/** Markers split for rendering: dot lanes, structure beats and cut ticks. Tolerates a missing list. */
export function splitLanes(markers) {
  const lanes = Object.fromEntries(DOT_LANES.map((l) => [l, []]))
  const beats = []
  const cuts = []
  for (const m of markers ?? []) {
    if (m?.t_start == null) continue
    if (m.lane === 'structure') {
      if (m.kind === 'beat') beats.push(m)
      else if (m.kind === 'cut') cuts.push(m)
    } else if (lanes[m.lane]) {
      lanes[m.lane].push(m)
    }
  }
  return { lanes, beats, cuts }
}

/** Fraction 0..1 of the timeline for a time, clamped. */
export function position(t, duration) {
  if (!duration || duration <= 0 || t == null) return 0
  return Math.min(1, Math.max(0, t / duration))
}

/** Time (s) under a click at clientX on a track with the given bounding rect. */
export function seekTimeFromClick(clientX, rect, duration) {
  if (!rect?.width || !duration) return 0
  return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration))
}

/** An issue whose time is a window (the opening, the whole video), not one measured moment: drawn as a bar. */
export function isRangeMarker(m) {
  return m?.kind === 'issue' && m.precise === false && m.t_end != null && m.t_end > m.t_start
}

/** Hover text of an issue: its title, the range it covers, and the transcript line it is about. */
export function issueHint(m) {
  const quote = m.quote?.text ? `“${m.quote.text}” ${fmtTime(m.quote.t)}` : null
  return [markerTitle(m), m.time_label, quote].filter(Boolean).join(' · ')
}

/** "có thể bị che bởi …" when the box sits under an app overlay (estimate); '' when clear. */
export function safeZoneWarning(region) {
  const zones = region?.covered_by ?? []
  return zones.length ? `có thể bị che bởi ${zones.join(', ')} khi đăng` : ''
}

/** Markers whose estimated region box should show at time `t` (within ±window of the frame it came from). */
export function activeRegions(markers, t, windowS = REGION_WINDOW_S) {
  return (markers ?? []).filter((m) => {
    const r = m.region
    return r?.box && Array.isArray(r.box) && r.box.length === 4 && r.frame_sec != null && Math.abs(t - r.frame_sec) <= windowS
  })
}

/**
 * Coach mode: issue/ghost markers whose start was crossed while playing normally from `prev` to `cur`.
 * A jump (seek) larger than `maxStep` seconds does not count as playing through.
 */
export function crossedMarkers(markers, prev, cur, maxStep = 1.5) {
  if (prev == null || cur == null || cur <= prev || cur - prev > maxStep) return []
  return (markers ?? []).filter(
    (m) => (m.kind === 'issue' || m.kind === 'ghost') && m.lane !== 'structure' && m.t_start > prev && m.t_start <= cur,
  )
}

/** Index of the transcript segment playing at `t`, or -1. */
export function activeSegmentIndex(segments, t) {
  return (segments ?? []).findIndex((s) => t >= s.start && t < s.end)
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Splits a transcript line into parts, flagging the parts that are absolute claims.
 * A claim inside the line is underlined as a substring; a line that is itself part of a longer claim is
 * flagged whole. Returns [{text, claim}].
 */
export function highlightClaims(text, claims) {
  if (!text) return []
  const line = norm(text)
  const list = (claims ?? []).map((c) => (typeof c === 'string' ? c : c?.text)).filter(Boolean).map(norm)
  if (list.some((c) => line.length > 3 && c.includes(line))) return [{ text, claim: true }]
  const lower = text.toLowerCase()
  const ranges = []
  for (const c of list) {
    const i = lower.indexOf(c)
    if (c && i >= 0) ranges.push([i, i + c.length])
  }
  if (!ranges.length) return [{ text, claim: false }]
  ranges.sort((a, b) => a[0] - b[0])
  const parts = []
  let at = 0
  for (const [s, e] of ranges) {
    if (s < at) continue
    if (s > at) parts.push({ text: text.slice(at, s), claim: false })
    parts.push({ text: text.slice(s, e), claim: true })
    at = e
  }
  if (at < text.length) parts.push({ text: text.slice(at), claim: false })
  return parts
}

/**
 * Point issues that sit at the same moment (within `window` seconds) as one marker each: several findings at 00:08
 * would otherwise draw on top of each other and only the top one could be clicked. Ranges and ghosts stay apart.
 */
export function clusterPointIssues(markers, window = 0.5) {
  const groups = []
  for (const m of [...markers].sort((a, b) => a.t_start - b.t_start)) {
    const last = groups.at(-1)
    if (last && m.t_start - last.t <= window) last.items.push(m)
    else groups.push({ t: m.t_start, items: [m] })
  }
  return groups
}
