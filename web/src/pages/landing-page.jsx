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

// ---------- how it works: one pipeline drawn in its own units (viewBox), so it scales as a whole ----------

const FLOW_COLS = [
  { x: 0, label: 'Bạn chọn' },
  { x: 300, label: 'Agent chạy' },
  { x: 620, label: 'Decisions chấm' },
  { x: 900, label: 'Bạn nhận' },
]
const INPUTS = [
  { id: 'video', title: 'Video', sub: 'lời nói + khung hình' },
  { id: 'sku', title: 'Listing SKU', sub: 'giá, mô tả, đánh giá' },
  { id: 'shop', title: 'Số liệu shop', sub: '30 ngày gần nhất' },
  { id: 'market', title: 'Thị trường', sub: 'FastMoss, Google Shopping' },
  { id: 'policy', title: 'Quy tắc sàn', sub: 'TikTok Shop, Shopee, Ads' },
].map((n, i) => ({ ...n, x: 0, y: 46 + i * 76, w: 200, h: 56 }))
const AGENTS = [
  { id: 'read', title: 'Đọc video', sub: 'transcript, cảnh, chữ trên hình' },
  { id: 'match', title: 'Đối chiếu', sub: 'SKU, shop, thị trường' },
  { id: 'rules', title: 'Kiểm policy', sub: 'trích nguyên văn câu vi phạm' },
].map((n, i) => ({ ...n, x: 300, y: 88 + i * 108, w: 220, h: 64 }))
const DECIDE = { id: 'decide', x: 620, y: 150, w: 180, h: 156 }
const OUT = {
  score: { x: 900, y: 46, w: 236, h: 84 },
  radar: { x: 900, y: 156, w: 236, h: 144 },
  fixes: { x: 900, y: 326, w: 236, h: 86 },
}
const node = (list, id) => list.find((n) => n.id === id)
const right = (n) => [n.x + n.w, n.y + n.h / 2]
const left = (n, dy = 0) => [n.x, n.y + n.h / 2 + dy]
const curve = ([x1, y1], [x2, y2]) => {
  const mx = (x1 + x2) / 2
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
}
const FLOW_EDGES = [
  curve(right(node(INPUTS, 'video')), left(node(AGENTS, 'read'))),
  curve(right(node(INPUTS, 'sku')), left(node(AGENTS, 'match'), -14)),
  curve(right(node(INPUTS, 'shop')), left(node(AGENTS, 'match'))),
  curve(right(node(INPUTS, 'market')), left(node(AGENTS, 'match'), 14)),
  curve(right(node(INPUTS, 'policy')), left(node(AGENTS, 'rules'))),
  curve(right(node(AGENTS, 'read')), left(DECIDE, -40)),
  curve(right(node(AGENTS, 'match')), left(DECIDE)),
  curve(right(node(AGENTS, 'rules')), left(DECIDE, 40)),
  curve(right(DECIDE), left(OUT.score)),
  curve(right(DECIDE), left(OUT.radar)),
  curve(right(DECIDE), left(OUT.fixes, -12)),
  // policy findings go straight to the fix list: a rule hit is reported, never scored away
  `M${right(node(AGENTS, 'rules')).join(',')} C 600,${348 + 40} 820,${OUT.fixes.y + 58} ${OUT.fixes.x},${OUT.fixes.y + 58}`,
]
// the demo run's six radar answers, in the radar's axis order
const RADAR = [92, 47, 76, 10, 44, 50]

function FlowNode({ n }) {
  return (
    <g className="lp-flow-node">
      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="14" />
      <text x={n.x + 16} y={n.y + n.h / 2 - 3} className="lp-flow-title">{n.title}</text>
      <text x={n.x + 16} y={n.y + n.h / 2 + 15} className="lp-flow-sub">{n.sub}</text>
    </g>
  )
}

function MiniRadar({ cx, cy, r }) {
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / RADAR.length
    return [cx + Math.cos(a) * r * v, cy + Math.sin(a) * r * v]
  }
  const ring = (v) => RADAR.map((_, i) => pt(i, v).join(',')).join(' ')
  return (
    <g className="lp-flow-radar">
      <polygon points={ring(1)} className="ring" />
      <polygon points={ring(0.5)} className="ring" />
      <polygon points={ring(0.75)} className="thr" />
      <polygon points={RADAR.map((v, i) => pt(i, v / 100).join(',')).join(' ')} className="shape" />
      {RADAR.map((v, i) => {
        const [x, y] = pt(i, v / 100)
        return <circle key={i} cx={x} cy={y} r="3" className={v >= 75 ? 'good' : v >= 50 ? 'warn' : 'bad'} />
      })}
    </g>
  )
}

/**
 * The pipeline from what the seller picks to what they get back. Light pulses travel the edges (SMIL motion along
 * each path), staggered so the picture reads left to right; under reduced motion only the static graph shows.
 */
function Flow() {
  const s = OUT.score
  const rd = OUT.radar
  const fx = OUT.fixes
  return (
    <div className="lp-flow-scroll">
      <svg className="lp-flow" viewBox="0 0 1136 420" role="img" aria-label="Video, listing SKU, số liệu shop, thị trường và quy tắc sàn đi qua ba agent, được Decisions chấm 36 câu, ra điểm, radar và danh sách việc cần sửa theo mốc thời gian.">
        <defs>
          <filter id="lpLift" x="-20%" y="-30%" width="140%" height="180%">
            <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#111214" floodOpacity=".12" />
          </filter>
          <linearGradient id="lpEdge" x1="0" x2="1">
            <stop offset="0" stopColor="#ee4d2d" stopOpacity=".15" />
            <stop offset="1" stopColor="#ee4d2d" stopOpacity=".45" />
          </linearGradient>
        </defs>
        {FLOW_COLS.map((c) => (
          <text key={c.label} x={c.x} y="18" className="lp-flow-col">{c.label}</text>
        ))}
        {FLOW_EDGES.map((d, i) => (
          <g key={i}>
            <path d={d} className="lp-flow-edge" />
            <circle r="3.5" className="lp-flow-pulse">
              <animateMotion dur="2.6s" begin={`${(i % 5) * 0.45 + (i >= 5 ? 0.9 : 0) + (i >= 8 ? 0.9 : 0)}s`} repeatCount="indefinite" path={d} />
            </circle>
          </g>
        ))}
        <g filter="url(#lpLift)">
          {INPUTS.map((n) => <FlowNode key={n.id} n={n} />)}
          {AGENTS.map((n) => <FlowNode key={n.id} n={n} />)}
          <g className="lp-flow-node is-decide">
            <rect x={DECIDE.x} y={DECIDE.y} width={DECIDE.w} height={DECIDE.h} rx="18" />
            <text x={DECIDE.x + 18} y={DECIDE.y + 34} className="lp-flow-title">Decisions</text>
            <text x={DECIDE.x + 18} y={DECIDE.y + 84} className="lp-flow-big">36</text>
            <text x={DECIDE.x + 18} y={DECIDE.y + 108} className="lp-flow-sub">câu hỏi, rubric 5 mức</text>
            <text x={DECIDE.x + 18} y={DECIDE.y + 130} className="lp-flow-sub">một lần gọi</text>
          </g>
          <g className="lp-flow-node">
            <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="14" />
            <circle cx={s.x + 42} cy={s.y + s.h / 2} r="24" className="lp-flow-ring-bg" />
            <circle
              cx={s.x + 42}
              cy={s.y + s.h / 2}
              r="24"
              className="lp-flow-ring"
              strokeDasharray={`${(55 / 100) * 2 * Math.PI * 24} ${2 * Math.PI * 24}`}
              transform={`rotate(-90 ${s.x + 42} ${s.y + s.h / 2})`}
            />
            <text x={s.x + 42} y={s.y + s.h / 2 + 6} textAnchor="middle" className="lp-flow-ringnum">55</text>
            <text x={s.x + 80} y={s.y + s.h / 2 - 3} className="lp-flow-title">Sửa rồi đăng</text>
            <text x={s.x + 80} y={s.y + s.h / 2 + 15} className="lp-flow-sub">điểm / ngưỡng 75</text>
          </g>
          <g className="lp-flow-node">
            <rect x={rd.x} y={rd.y} width={rd.w} height={rd.h} rx="14" />
            <MiniRadar cx={rd.x + 66} cy={rd.y + rd.h / 2} r={50} />
            <text x={rd.x + 134} y={rd.y + rd.h / 2 - 3} className="lp-flow-title">Radar</text>
            <text x={rd.x + 134} y={rd.y + rd.h / 2 + 15} className="lp-flow-sub">từng câu hỏi</text>
          </g>
          <g className="lp-flow-node">
            <rect x={fx.x} y={fx.y} width={fx.w} height={fx.h} rx="14" />
            <rect x={fx.x + 14} y={fx.y + 16} width="48" height="22" rx="6" className="lp-flow-tc is-bad" />
            <text x={fx.x + 38} y={fx.y + 31} textAnchor="middle" className="lp-flow-tctext">00:09</text>
            <text x={fx.x + 72} y={fx.y + 32} className="lp-flow-fix">Cảnh trước / sau</text>
            <rect x={fx.x + 14} y={fx.y + 48} width="48" height="22" rx="6" className="lp-flow-tc is-warn" />
            <text x={fx.x + 38} y={fx.y + 63} textAnchor="middle" className="lp-flow-tctext">00:35</text>
            <text x={fx.x + 72} y={fx.y + 64} className="lp-flow-fix">Thêm lời kêu gọi mua</text>
          </g>
        </g>
      </svg>
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
          <Flow />
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
