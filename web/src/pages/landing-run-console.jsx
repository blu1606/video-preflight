import { useEffect, useRef, useState } from 'react'
import './landing-run-console.css'

// ---------- how it works: the demo run (#46) replayed as a run console ----------

// one colour per kind of work; every box, log line and bar uses the same key
const LANES = {
  video: { label: 'đọc video' },
  data: { label: 'số liệu & thị trường' },
  decide: { label: 'Decisions chấm' },
  policy: { label: 'policy' },
  write: { label: 'tổng hợp' },
}
// real trace lines of run #46, with the cumulative time they finished at
const RUN_LOG = [
  { t: 0.37, lane: 'write', agent: 'orchestrator', text: 'lấy thông tin video và shop' },
  { t: 0.72, lane: 'video', agent: 'video_analyst', text: 'trích xuất lời nói, cảnh, chữ trên hình' },
  { t: 3.53, lane: 'data', agent: 'metrics_analyst', text: 'nạp số liệu shop 30 ngày' },
  { t: 3.55, lane: 'data', agent: 'product_scout', text: 'nạp listing và snapshot thị trường' },
  { t: 3.55, lane: 'video', agent: 'video_analyst', text: 'nhận diện nhạc nền' },
  { t: 4.01, lane: 'data', agent: 'product_scout', text: 'đối chiếu claim với listing' },
  { t: 8.07, lane: 'decide', agent: 'decision_scorer', text: '36 câu, một lần gọi · 12.844 token' },
  { t: 8.08, lane: 'policy', agent: 'policy_guard', text: 'rule + reviewer, trích nguyên văn' },
  { t: 8.09, lane: 'decide', agent: 'auditor', text: 'kiểm chéo các câu điểm thấp' },
  { t: 8.09, lane: 'write', agent: 'orchestrator', text: 'ghép điểm 54,7 và 5 việc cần sửa' },
  { t: 30.14, lane: 'video', agent: 'video_analyst', text: 'khoanh vùng lỗi trên khung hình · 22,0s' },
  { t: 44.52, lane: 'write', agent: 'insight_writer', text: 'viết tóm tắt dễ hiểu · xong' },
]
const LANE_TOTAL = RUN_LOG.reduce((m, l) => ({ ...m, [l.lane]: (m[l.lane] ?? 0) + 1 }), {})
const fmtSec = (t) => `${t.toFixed(2).replace('.', ',')}s`

// ---------- the pipeline map beside the console: same lanes, lit by the replay's state ----------

const MAP_IN = [
  { id: 'video', lane: 'video', title: 'Video' },
  { id: 'listing', lane: 'data', title: 'Listing' },
  { id: 'shop', lane: 'data', title: 'Shop' },
  { id: 'market', lane: 'data', title: 'Thị trường' },
  { id: 'rules', lane: 'policy', title: 'Quy tắc' },
].map((n, i) => ({ ...n, x: 4 + i * 83, y: 30, w: 76, h: 40 }))
const MAP_AGENTS = [
  { id: 'read', lane: 'video', title: 'Đọc video', sub: 'lời nói, cảnh' },
  { id: 'match', lane: 'data', title: 'Đối chiếu', sub: 'SKU, thị trường' },
  { id: 'guard', lane: 'policy', title: 'Policy', sub: 'rule + reviewer' },
].map((n, i) => ({ ...n, x: 4 + i * 142, y: 128, w: 128, h: 52 }))
const MAP_DECIDE = { id: 'decide', lane: 'decide', x: 104, y: 236, w: 212, h: 74 }
const MAP_OUT = [
  { id: 'score', x: 4, y: 374, w: 128, h: 104 },
  { id: 'radar', x: 146, y: 374, w: 128, h: 104 },
  { id: 'fixes', x: 288, y: 374, w: 128, h: 104 },
]
const mid = (n) => n.x + n.w / 2
const vcurve = (a, b, bx = mid(b)) => {
  const y1 = a.y + a.h
  const y2 = b.y
  const my = (y1 + y2) / 2
  return `M${mid(a)},${y1} C${mid(a)},${my} ${bx},${my} ${bx},${y2}`
}
const byId = (list, id) => list.find((n) => n.id === id)
const MAP_EDGES = [
  { lane: 'video', d: vcurve(byId(MAP_IN, 'video'), byId(MAP_AGENTS, 'read')) },
  { lane: 'data', d: vcurve(byId(MAP_IN, 'listing'), byId(MAP_AGENTS, 'match'), 196) },
  { lane: 'data', d: vcurve(byId(MAP_IN, 'shop'), byId(MAP_AGENTS, 'match')) },
  { lane: 'data', d: vcurve(byId(MAP_IN, 'market'), byId(MAP_AGENTS, 'match'), 240) },
  { lane: 'policy', d: vcurve(byId(MAP_IN, 'rules'), byId(MAP_AGENTS, 'guard')) },
  { lane: 'video', d: vcurve(byId(MAP_AGENTS, 'read'), MAP_DECIDE, 160) },
  { lane: 'data', d: vcurve(byId(MAP_AGENTS, 'match'), MAP_DECIDE) },
  { lane: 'policy', d: vcurve(byId(MAP_AGENTS, 'guard'), MAP_DECIDE, 260) },
  { lane: 'decide', d: vcurve(MAP_DECIDE, MAP_OUT[0]) },
  { lane: 'decide', d: vcurve(MAP_DECIDE, MAP_OUT[1]) },
  { lane: 'decide', d: vcurve(MAP_DECIDE, MAP_OUT[2], 330) },
  // a rule hit goes straight to the fix list: it is reported, never scored away
  { lane: 'policy', bypass: true, d: `M${mid(MAP_AGENTS[2]) + 40},180 C 412,250 412,320 400,374` },
]
const RADAR = [92, 47, 76, 10, 44, 50] // the demo run's six radar answers

function MapRadar({ cx, cy, r, lit }) {
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / RADAR.length
    return [cx + Math.cos(a) * r * v, cy + Math.sin(a) * r * v]
  }
  const ring = (v) => RADAR.map((_, i) => pt(i, v).join(',')).join(' ')
  return (
    <g className="lp-map-radar">
      <polygon points={ring(1)} className="ring" />
      <polygon points={ring(0.5)} className="ring" />
      {lit && <polygon points={RADAR.map((v, i) => pt(i, v / 100).join(',')).join(' ')} className="shape" />}
    </g>
  )
}

/**
 * Vertical map of the run: inputs → three agent lanes → Decisions → what the seller gets. Each node and edge takes
 * its lane's state from the replay (idle dim, live glowing with pulses on its edges, done solid).
 */
function RunMap({ laneState, finished }) {
  const st = (lane) => laneState[lane] ?? 'idle'
  const out = finished ? 'done' : 'idle'
  return (
    <svg className="lp-map" viewBox="0 0 420 484" aria-hidden="true">
      <text x="4" y="18" className="lp-map-col">bạn chọn</text>
      <text x="4" y="116" className="lp-map-col">agent chạy song song</text>
      <text x="4" y="226" className="lp-map-col">Decisions chấm</text>
      <text x="4" y="362" className="lp-map-col">bạn nhận</text>
      {MAP_EDGES.map((e, i) => (
        <g key={i} className={`lp-map-edge is-${e.lane} is-${e.lane === 'decide' ? out : st(e.lane)}${e.bypass ? ' is-bypass' : ''}`}>
          <path d={e.d} />
          {st(e.lane) === 'live' && (
            <circle r="3">
              <animateMotion dur="1.1s" repeatCount="indefinite" path={e.d} />
            </circle>
          )}
        </g>
      ))}
      {MAP_IN.map((n) => (
        <g key={n.id} className={`lp-map-node is-${n.lane} is-${st(n.lane)}`}>
          <rect x={n.x} y={n.y} width={n.w} height={n.h} />
          <text x={mid(n)} y={n.y + 25} textAnchor="middle">{n.title}</text>
        </g>
      ))}
      {MAP_AGENTS.map((n) => (
        <g key={n.id} className={`lp-map-node is-${n.lane} is-${st(n.lane)}`}>
          <rect x={n.x} y={n.y} width={n.w} height={n.h} />
          <text x={n.x + 12} y={n.y + 22} className="t">{n.title}</text>
          <text x={n.x + 12} y={n.y + 40} className="s">{n.sub}</text>
        </g>
      ))}
      <g className={`lp-map-node is-decide is-${st('decide')}`}>
        <rect x={MAP_DECIDE.x} y={MAP_DECIDE.y} width={MAP_DECIDE.w} height={MAP_DECIDE.h} />
        <text x={MAP_DECIDE.x + 14} y={MAP_DECIDE.y + 24} className="t">Decisions</text>
        <text x={MAP_DECIDE.x + 14} y={MAP_DECIDE.y + 56} className="big">36</text>
        <text x={MAP_DECIDE.x + 56} y={MAP_DECIDE.y + 56} className="s">câu · rubric 5 mức</text>
      </g>
      <g className={`lp-map-node is-out is-${out}`}>
        <rect x={MAP_OUT[0].x} y={MAP_OUT[0].y} width={MAP_OUT[0].w} height={MAP_OUT[0].h} />
        <circle cx={mid(MAP_OUT[0])} cy={MAP_OUT[0].y + 44} r="24" className="ring-bg" />
        {finished && <circle cx={mid(MAP_OUT[0])} cy={MAP_OUT[0].y + 44} r="24" className="ring" strokeDasharray={`${0.55 * 2 * Math.PI * 24} 999`} transform={`rotate(-90 ${mid(MAP_OUT[0])} ${MAP_OUT[0].y + 44})`} />}
        <text x={mid(MAP_OUT[0])} y={MAP_OUT[0].y + 50} textAnchor="middle" className="num">{finished ? 55 : '—'}</text>
        <text x={mid(MAP_OUT[0])} y={MAP_OUT[0].y + 92} textAnchor="middle" className="s">điểm</text>
      </g>
      <g className={`lp-map-node is-out is-${out}`}>
        <rect x={MAP_OUT[1].x} y={MAP_OUT[1].y} width={MAP_OUT[1].w} height={MAP_OUT[1].h} />
        <MapRadar cx={mid(MAP_OUT[1])} cy={MAP_OUT[1].y + 44} r={30} lit={finished} />
        <text x={mid(MAP_OUT[1])} y={MAP_OUT[1].y + 92} textAnchor="middle" className="s">radar 36 câu</text>
      </g>
      <g className={`lp-map-node is-out is-${finished || st('policy') === 'done' ? 'done' : 'idle'}`}>
        <rect x={MAP_OUT[2].x} y={MAP_OUT[2].y} width={MAP_OUT[2].w} height={MAP_OUT[2].h} />
        {[['00:09', 'is-bad'], ['00:17', 'is-bad'], ['00:35', 'is-warn']].map(([t, c], i) => (
          <g key={t}>
            <rect x={MAP_OUT[2].x + 12} y={MAP_OUT[2].y + 12 + i * 22} width="44" height="16" className={`tc ${c}`} />
            <text x={MAP_OUT[2].x + 34} y={MAP_OUT[2].y + 24 + i * 22} textAnchor="middle" className="tct">{t}</text>
          </g>
        ))}
        <text x={mid(MAP_OUT[2])} y={MAP_OUT[2].y + 92} textAnchor="middle" className="s">việc cần sửa</text>
      </g>
      <text x="416" y="356" textAnchor="end" className="lp-map-note">policy đi thẳng ↓</text>
    </svg>
  )
}

/** Lane box: what the lane does, a progress bar of its own lines, and its state at this point of the replay. */
function LaneBox({ lane, title, items, done, live }) {
  const total = LANE_TOTAL[lane]
  const state = done >= total ? 'xong' : live ? 'đang chạy' : done ? 'chờ' : 'chưa'
  return (
    <div className={`lp-con-box is-${lane}${live ? ' is-live' : ''}`}>
      <p className="lp-con-box-head">
        <strong>{title}</strong>
        <span>[ {state} ]</span>
      </p>
      <p className="lp-con-bar"><i style={{ '--p': done / total }} /><em>{Math.round((done / total) * 100)}%</em></p>
      <ul>
        {items.map((it) => <li key={it}>{it}</li>)}
      </ul>
    </div>
  )
}

/**
 * The run console: the demo run replayed line by line while the section is on screen. The log streams at the
 * bottom, each lane's box fills as its lines land, the status line counts. Under reduced motion it shows the
 * finished run.
 */
export default function RunConsole() {
  const ref = useRef(null)
  const [tick, setTick] = useState(RUN_LOG.length)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    let timer = 0
    const step = (n) => {
      setTick(n)
      timer = window.setTimeout(() => step(n >= RUN_LOG.length ? 0 : n + 1), n >= RUN_LOG.length ? 3600 : 620)
    }
    const io = new IntersectionObserver(([e]) => {
      window.clearTimeout(timer)
      if (e.isIntersecting) step(0)
    }, { threshold: 0.35 })
    io.observe(el)
    return () => {
      io.disconnect()
      window.clearTimeout(timer)
    }
  }, [])

  const shown = RUN_LOG.slice(0, tick)
  const doneIn = (lane) => shown.filter((l) => l.lane === lane).length
  const live = tick < RUN_LOG.length ? RUN_LOG[tick]?.lane : null
  const elapsed = shown.length ? shown[shown.length - 1].t : 0
  const finished = tick >= RUN_LOG.length
  const steps = finished ? 26 : Math.min(26, Math.round((tick / RUN_LOG.length) * 26))
  const laneState = Object.fromEntries(
    Object.keys(LANES).map((id) => [id, live === id ? 'live' : doneIn(id) >= LANE_TOTAL[id] ? 'done' : doneIn(id) ? 'live' : 'idle']),
  )
  return (
    <div className="lp-con" ref={ref} role="img" aria-label="Lượt chấm #46 của video mẫu: 26 bước trong 44,5 giây, ba nhóm agent chạy song song, Decisions chấm 36 câu trong một lần gọi, policy đi riêng, kết quả là điểm 54,7 và 5 việc cần sửa.">
      <div className="lp-con-title">
        <span className="lp-con-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>soi — SHOP001-VID01 — lượt #46</span>
      </div>
      <p className="lp-con-banner">
        <b>SOI run</b> · <span className="is-decide">Decisions 36 câu</span> · <span className="is-video">3 nhóm agent song song</span>
      </p>
      <p className="lp-con-legend">
        {Object.entries(LANES).map(([id, l]) => <span key={id} className={`is-${id}`}><i />{l.label}</span>)}
      </p>

      <div className="lp-con-grid">
        <div className="lp-con-mapwrap">
          <RunMap laneState={laneState} finished={finished} />
        </div>

        <div className="lp-con-right">
          <div className="lp-con-lanes">
            <LaneBox lane="video" title="Đọc video" items={['lời nói, cảnh, chữ', 'nhạc nền', 'khoanh vùng lỗi']} done={doneIn('video')} live={live === 'video'} />
            <LaneBox lane="data" title="Shop & thị trường" items={['shop 30 ngày', 'listing, giá đối thủ', 'claim ↔ listing']} done={doneIn('data')} live={live === 'data'} />
            <LaneBox lane="policy" title="Policy" items={['4 nền tảng đăng', 'rule + reviewer', 'trích nguyên văn']} done={doneIn('policy')} live={live === 'policy'} />
          </div>

          <p className="lp-con-split" aria-hidden="true">gom về Decisions · chấm một lần</p>

          <div className={`lp-con-box is-decide lp-con-decide${live === 'decide' ? ' is-live' : ''}`}>
            <p className="lp-con-box-head"><strong>Decisions · chấm theo rubric</strong><span>[ {doneIn('decide') ? 'xong' : live === 'decide' ? 'đang chấm' : 'chờ'} ]</span></p>
            <p className="lp-con-kv"><span>câu hỏi</span><b>36</b><span>mức</span><b>5</b><span>lần gọi</span><b>1</b></p>
            <p className="lp-con-bar"><i style={{ '--p': doneIn('decide') ? 1 : 0 }} /><em>{doneIn('decide') ? '36/36' : '0/36'}</em></p>
          </div>
        </div>
      </div>

      <div className="lp-con-log">
        <p className="lp-con-log-head">nhật ký lượt chạy <span>[ {finished ? 'xong' : 'live'} ]</span></p>
        <ol>
          {shown.slice(-5).map((l) => (
            <li key={`${l.t}-${l.text}`} className={`is-${l.lane}`}>
              <span className="lp-con-t">+{fmtSec(l.t)}</span>
              <span className="lp-con-agent">{l.agent}</span>
              <span>{l.text}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="lp-con-status">
        <span><b>$</b> soi analyze SHOP001-VID01 --decisions</span>
        <span>bước <b>{steps}/26</b> · {fmtSec(elapsed)}<span className="lp-con-tokens"> · token mới <b>22.384</b> · cache 22.364</span></span>
      </p>
    </div>
  )
}
