/*
 * Seller landing (route /).
 *
 * Content and task: a seller who posts short sales videos decides whether Preflight is worth a login. The page
 * answers by showing the product working, not by describing it: one real video from the demo shop plays while
 * the notes of its real run (run #46, SHOP001-VID01) light up at the second they refer to. Everything else is
 * short and secondary: three steps, how numbers are labelled, one more call to log in.
 *
 * Look: white page, ink type, one dark "edit bay" panel as the only heavy object. Display face Bricolage Grotesque
 * for headings, Be Vietnam Pro for text, JetBrains Mono for timecodes (the product speaks in seconds).
 */
import { useEffect, useRef, useState } from 'react'

import './landing.css'

const LOGIN_HREF = '/login'
const STUDIO_HREF = '/studio?shop=SHOP001&video=SHOP001-VID01'

// The demo run: SHOP001-VID01 "TeaShell soap", run #46 — scores, flagged lines and fixes as the API returned them.
const DEMO = {
  duration: 38.7,
  score: 55,
  ready: 75,
  verdict: 'Sửa rồi đăng',
  groups: [
    { label: 'Viral', value: 64 },
    { label: 'Chuyển đổi', value: 43 },
    { label: 'SKU & thị trường', value: 63 },
  ],
  // every note is a marker of that run (beats of the story in blue, policy hits in red, suggestions in amber)
  notes: [
    { t: 0, tone: 'good', title: 'Hook mở đầu giữ người xem', meta: '92 / 100' },
    { t: 3, tone: 'bad', title: 'Lời hứa tuyệt đối', quote: 'Tao xài trắng quá, giờ mẹ tao tưởng tao mới đi tắm trắng', meta: 'Policy' },
    { t: 5, tone: 'info', title: 'Nêu vấn đề của người xem', meta: 'Mạch kể: mong muốn da sáng hơn' },
    { t: 9.4, tone: 'bad', title: 'So sánh trước / sau', quote: 'Mới dùng 3 lần mà trắng cỡ này', meta: 'Policy · Tay sau khi rửa' },
    { t: 12, tone: 'bad', title: 'Hai bàn tay đối chiếu', quote: 'Tao thử có 1 lần mà trắng thật nha', meta: 'Policy · cảnh trước / sau' },
    { t: 16, tone: 'info', title: 'Sản phẩm vào khung hình', meta: 'Mạch kể: giới thiệu hộp TeaShell' },
    { t: 17, tone: 'bad', title: 'Lời hứa phóng đại', quote: 'Da không nhìn sáng hơn mới là lạ đó', meta: 'Policy' },
    { t: 25, tone: 'info', title: 'Minh hoạ cách dùng', meta: 'Mạch kể: tạo bọt, rửa trên da' },
    { t: 28.5, tone: 'bad', title: 'Lợi ích chưa có căn cứ', quote: 'Hỗ trợ cải thiện sắc tố, giúp da nhìn sáng và đều màu hơn', meta: 'Policy' },
    { t: 32.7, tone: 'warn', title: 'Chưa nêu ưu đãi', meta: 'Gợi ý: nói giá hoặc ưu đãi trước lời kêu gọi' },
    { t: 35.7, tone: 'warn', title: 'Chưa có lời kêu gọi mua', meta: '+3,2 điểm nếu thêm' },
  ],
}

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
  { t: 8.09, lane: 'write', agent: 'orchestrator', text: 'ghép điểm 55 và 5 việc cần sửa' },
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
function RunConsole() {
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
    <div className="lp-con" ref={ref} role="img" aria-label="Lượt chấm #46 của video mẫu: 26 bước trong 44,5 giây, ba nhóm agent chạy song song, Decisions chấm 36 câu trong một lần gọi, policy đi riêng, kết quả là điểm 55 và 5 việc cần sửa.">
      <div className="lp-con-title">
        <span className="lp-con-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>preflight — SHOP001-VID01 — lượt #46</span>
      </div>
      <p className="lp-con-banner">
        <b>Preflight run</b> · <span className="is-decide">Decisions 36 câu</span> · <span className="is-video">3 nhóm agent song song</span>
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

        <div className={`lp-con-box is-out lp-con-result${finished ? ' is-live' : ''}`}>
          <p className="lp-con-box-head"><strong>Kết quả</strong><span>[ {finished ? 'sẵn sàng' : '…'} ]</span></p>
          <p className="lp-con-kv"><span>điểm</span><b>{finished ? 55 : '—'}</b><span>mốc</span><b>{finished ? 11 : '—'}</b><span>việc cần sửa</span><b>{finished ? 5 : '—'}</b></p>
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
        <span><b>$</b> preflight analyze SHOP001-VID01 --decisions</span>
        <span>bước <b>{steps}/26</b> · {fmtSec(elapsed)}<span className="lp-con-tokens"> · token mới <b>22.384</b> · cache 22.364</span></span>
      </p>
    </div>
  )
}

// ---------- provenance: real figures from the demo, each with the label it carries in Studio ----------

const LEDGER = [
  { value: '32.333₫', what: 'Giá trung vị đối thủ', tag: 'REAL', tone: 'real', source: 'Google Shopping · cào 27/10' },
  { value: '3.100', what: 'Đơn 30 ngày của shop', tag: 'MOCK', tone: 'mock', source: 'Shop mô phỏng để thử' },
  { value: '≈ 3 đơn', what: 'Đơn ước tính của video', tag: 'INFERRED', tone: 'inferred', source: 'Suy từ video mẫu cùng sản phẩm' },
  { value: null, what: 'Policy Meta Ads', tag: 'MISSING', tone: 'missing', source: 'Chưa đủ dữ liệu, không tính 0' },
]
const POLICY_STATES = [
  { label: 'Cần xem lại', tone: 'bad' },
  { label: 'Không phát hiện vi phạm', tone: 'neutral' },
  { label: 'Chưa đủ dữ liệu', tone: 'missing' },
]

const timecode = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const band = (v, ready) => (v >= ready ? 'good' : v >= 50 ? 'warn' : 'bad')

/** The note a playhead at `t` is on: the last one that has started, held until the next begins. */
const activeAt = (t) => DEMO.notes.reduce((on, n, i) => (t >= n.t ? i : on), 0)

/**
 * The edit bay: the video plays muted on a loop; a playhead runs along the timeline and the note for the current
 * second takes the stage. Clicking a note or a marker seeks there. The playhead is moved through a CSS variable
 * each frame; React only re-renders when the active note changes.
 */
function EditBay() {
  const videoRef = useRef(null)
  const trackRef = useRef(null)
  const glowRef = useRef(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduced) video.play().catch(() => {})
    // ambient light: the current frame, drawn tiny and blurred behind the bay, a few times a second
    const glow = glowRef.current?.getContext('2d')
    let lastGlow = 0
    let frame = requestAnimationFrame(function tick(now) {
      const t = video.currentTime || 0
      if (glow && video.readyState >= 2 && now - lastGlow > 250) {
        glow.drawImage(video, 0, 0, glow.canvas.width, glow.canvas.height)
        lastGlow = now
      }
      trackRef.current?.style.setProperty('--at', String(Math.min(1, t / DEMO.duration)))
      setActive((prev) => {
        const next = activeAt(t)
        return next === prev ? prev : next
      })
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const seek = (t) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = t + 0.05
    video.play().catch(() => {})
  }

  const note = DEMO.notes[active]
  return (
    <div className="lp-bay-stage">
      {/* ambient light sits behind the panel, outside it: the video's colours spill onto the page */}
      <canvas ref={glowRef} className="lp-bay-glow" width="16" height="9" aria-hidden="true" />
      <div className="lp-bay">
        <div className="lp-bay-video">
          <video
            ref={videoRef}
            src="/landing/demo.mp4"
            poster="/landing/demo-poster.jpg"
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="Video mẫu TeaShell soap của shop demo"
          />
        </div>

        <div className="lp-bay-side">
          <div className="lp-bay-score">
            <span className={`lp-bay-num is-${band(DEMO.score, DEMO.ready)}`}>{DEMO.score}</span>
            <span className="lp-bay-verdict">
              <strong>{DEMO.verdict}</strong>
              <small>ngưỡng đăng {DEMO.ready}</small>
            </span>
            <ul className="lp-bay-groups" aria-label="Điểm theo nhóm">
              {DEMO.groups.map((g) => (
                <li key={g.label} className={`is-${band(g.value, DEMO.ready)}`}>
                  <span>{g.label}</span>
                  <i style={{ '--v': g.value }} />
                  <b>{g.value}</b>
                </li>
              ))}
            </ul>
          </div>

          {/* key on the note so each change replays the entrance */}
          <div key={active} className={`lp-bay-now is-${note.tone}`} aria-live="polite">
            <span className="lp-tc">{timecode(note.t)}</span>
            <strong>{note.title}</strong>
            {note.quote && <q>{note.quote}</q>}
            <small>{note.meta}</small>
          </div>

          <ol className="lp-bay-list">
            {DEMO.notes.map((n, i) => (
              <li key={n.t}>
                <button type="button" className={`is-${n.tone}`} aria-current={i === active ? 'true' : undefined} onClick={() => seek(n.t)}>
                  <span className="lp-tc">{timecode(n.t)}</span>
                  {n.title}
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="lp-bay-track" ref={trackRef} style={{ '--at': 0 }}>
          <span className="lp-bay-film" aria-hidden="true" />
          <span className="lp-bay-rail" aria-hidden="true" />
          {DEMO.notes.map((n, i) => (
            <button
              key={n.t}
              type="button"
              className={`lp-bay-mark is-${n.tone}`}
              style={{ '--x': n.t / DEMO.duration }}
              aria-current={i === active ? 'true' : undefined}
              aria-label={`${timecode(n.t)} ${n.title}`}
              title={`${timecode(n.t)} · ${n.title}`}
              onClick={() => seek(n.t)}
            />
          ))}
          <span className="lp-bay-head" aria-hidden="true" />
          <span className="lp-bay-ends" aria-hidden="true">
            <span>00:00</span>
            <span>{timecode(DEMO.duration)}</span>
          </span>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="lp">
      <header className="lp-head">
        <a href="/" className="lp-brand" aria-label="Preflight, trang chủ">
          <img src="/brand/preflight-mark.svg" alt="" width="28" height="28" />
          Preflight
        </a>
        <span className="lp-demo-note">Bản demo · dữ liệu mô phỏng</span>
        <a href={LOGIN_HREF} className="lp-head-login">Đăng nhập</a>
      </header>

      <main>
        <section className="lp-hero" aria-labelledby="hero-title">
          <h1 id="hero-title">Biết video yếu trước khi đăng.</h1>
          <div className="lp-hero-side">
            <p>Preflight xem video như người mua, rồi chỉ ra đúng giây cần sửa.</p>
            <div className="lp-actions">
              <a href={LOGIN_HREF} className="lp-btn">Đăng nhập bằng Shopee</a>
              <a href={STUDIO_HREF} className="lp-link">Mở Studio mẫu →</a>
            </div>
          </div>
        </section>

        <section className="lp-bay-wrap" aria-label="Một lượt chấm thật">
          <EditBay />
          <p className="lp-caption">Lượt chấm thật của video mẫu. Bấm một mốc để tua tới đó.</p>
        </section>

        <section className="lp-how" aria-labelledby="steps-title">
          <h2 id="steps-title">Cách hoạt động</h2>
          <RunConsole />
        </section>

        <section className="lp-trust" aria-labelledby="trust-title">
          <div className="lp-trust-head">
            <h2 id="trust-title">Không bịa số.</h2>
            <p>Mỗi con số mang nhãn nguồn. Thiếu dữ liệu thì để trống, không ghi 0.</p>
          </div>
          <div className="lp-ledger">
            <table>
              <caption className="lp-ledger-cap">Ví dụ trong lượt chấm mẫu</caption>
              <tbody>
                {LEDGER.map((r) => (
                  <tr key={r.tag}>
                    <td className={`lp-ledger-value${r.value == null ? ' is-empty' : ''}`}>{r.value ?? '—'}</td>
                    <td>
                      <strong>{r.what}</strong>
                      <small>{r.source}</small>
                    </td>
                    <td><span className={`lp-tag is-${r.tone}`}>{r.tag}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="lp-policy">
              <span className="lp-policy-label">Policy chỉ có</span>
              {POLICY_STATES.map((st) => (
                <span key={st.label} className={`lp-state is-${st.tone}`}>{st.label}</span>
              ))}
              <span className="lp-state is-never" title="Preflight không bao giờ báo một video là đạt policy">Đạt</span>
            </div>
          </div>
        </section>

        <section className="lp-final" aria-labelledby="final-title">
          {/* frames of the demo shops' own videos: what the next check will be run on */}
          <div className="lp-final-film" aria-hidden="true" />
          <h2 id="final-title">Kiểm video trước lần đăng tiếp theo.</h2>
          <a href={LOGIN_HREF} className="lp-btn lp-btn--light">Đăng nhập bằng Shopee</a>
        </section>
      </main>

      <footer className="lp-foot">
        Bản demo: shop và SKU mô phỏng, snapshot thị trường từ FastMoss và Google Shopping. Không liên kết với Shopee hay TikTok.
      </footer>
    </div>
  )
}
