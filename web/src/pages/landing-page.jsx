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
  notes: [
    { t: 0, tone: 'good', title: 'Hook mở đầu giữ người xem', meta: '92 / 100' },
    { t: 3, tone: 'bad', title: 'Lời hứa tuyệt đối', quote: 'Tao xài trắng quá, giờ mẹ tao tưởng tao mới đi tắm trắng', meta: 'Policy' },
    { t: 9.4, tone: 'bad', title: 'So sánh trước / sau', quote: 'Mới dùng 3 lần mà trắng cỡ này', meta: 'Policy' },
    { t: 17, tone: 'bad', title: 'Lời hứa phóng đại', quote: 'Da không nhìn sáng hơn mới là lạ đó', meta: 'Policy' },
    { t: 35.7, tone: 'warn', title: 'Chưa có lời kêu gọi mua', meta: '+3,2 điểm nếu thêm' },
  ],
}

// each step shows the real screen it happens on (captures of the demo shop)
const STEPS = [
  { title: 'Chọn shop, SKU, video', text: 'Video gắn với sản phẩm sẽ bán.', shot: '/landing/step-shop.webp', ratio: '4 / 3' },
  { title: 'Agent xem và đối chiếu', text: 'Lời nói, khung hình, listing, thị trường, policy.', shot: '/landing/step-agents.webp', ratio: '4 / 3' },
  { title: 'Điểm và việc cần sửa', text: 'Radar từng câu hỏi, mỗi việc có mốc thời gian.', shot: '/landing/step-score.webp', ratio: '4 / 3' },
]

const PROVENANCE = [
  { tag: 'REAL', tone: 'real', text: 'có nguồn, có ngày' },
  { tag: 'MOCK', tone: 'mock', text: 'luôn gắn nhãn' },
  { tag: 'INFERRED', tone: 'inferred', text: 'ghi căn cứ' },
  { tag: 'MISSING', tone: 'missing', text: 'chưa chấm, không phải 0' },
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

        <section className="lp-steps" aria-labelledby="steps-title">
          <h2 id="steps-title">Cách hoạt động</h2>
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <figure className="lp-shot" style={{ aspectRatio: s.ratio }}>
                  <img src={s.shot} alt="" loading="lazy" />
                </figure>
                <span className="lp-tc">0{i + 1}</span>
                <strong>{s.title}</strong>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-trust" aria-labelledby="trust-title">
          <h2 id="trust-title">Không bịa số.</h2>
          <ul>
            {PROVENANCE.map((p) => (
              <li key={p.tag}>
                <span className={`lp-tag is-${p.tone}`}>{p.tag}</span>
                {p.text}
              </li>
            ))}
          </ul>
          <p>Policy không bao giờ báo “đạt”: chỉ cần xem lại, không phát hiện vi phạm, hoặc chưa đủ dữ liệu.</p>
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
