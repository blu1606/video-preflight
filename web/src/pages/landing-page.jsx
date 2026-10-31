/* Brand reviewer landing. The sample is precomputed; playback never starts an analysis. */
import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, Check, ChevronDown, Pause, Play, ScanLine, Volume2, VolumeX } from 'lucide-react'

import './landing.css'
import RunConsole from './landing-run-console'

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

/** A real, precomputed sample. Playback never triggers a paid analysis. */
function EditBay() {
  const videoRef = useRef(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [mediaError, setMediaError] = useState(false)
  const [playError, setPlayError] = useState(false)
  const [ready, setReady] = useState(false)
  const active = activeAt(currentTime)
  const note = DEMO.notes[active]

  useEffect(() => {
    const video = videoRef.current
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pauseForPreference = () => { if (preference.matches) video.pause() }
    const pauseWhenHidden = () => { if (document.hidden) video.pause() }
    preference.addEventListener('change', pauseForPreference)
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () => {
      preference.removeEventListener('change', pauseForPreference)
      document.removeEventListener('visibilitychange', pauseWhenHidden)
    }
  }, [])

  const seek = (t) => {
    if (!mediaError && !ready) return
    if (!mediaError) videoRef.current.currentTime = t
    setCurrentTime(t)
  }
  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video.paused) { video.pause(); return }
    setPlayError(false)
    try { await video.play() } catch { setPlayError(true) }
  }

  return (
    <div className="lp-bay">
      <div className="lp-bay-bar">
        <span className="lp-bay-label"><ScanLine aria-hidden="true" /> Bàn duyệt video</span>
        <span className="lp-bay-file">TeaShell soap <span> / </span> Video mẫu</span>
        <span className="lp-status"><span /> Kết quả có sẵn</span>
      </div>
      <div className="lp-bay-content">
        <div className="lp-video-column">
          <div className="lp-bay-video">
            <video ref={videoRef} src="/landing/demo.mp4" poster="/landing/demo-poster.jpg"
              muted={muted} loop playsInline preload="auto"
              onLoadedData={() => setReady(true)} onCanPlay={() => setReady(true)}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
              onError={() => { setMediaError(true); setPlaying(false) }}
              aria-label="Video mẫu TeaShell soap; nhận xét và trích lời nằm bên cạnh" />
            {!playing && !mediaError && <button className="lp-video-play" type="button" onClick={togglePlayback} disabled={!ready} aria-label={ready ? 'Phát video mẫu' : 'Đang tải video'}><Play aria-hidden="true" /></button>}
            <span className="lp-video-stamp">VIDEO MẪU · 00:38</span>
          </div>
          <div className="lp-player-controls">
            <button type="button" onClick={togglePlayback} disabled={mediaError || !ready} aria-label={playing ? 'Tạm dừng video' : 'Phát video'}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>
            <span className="lp-tc">{timecode(currentTime)} / {timecode(DEMO.duration)}</span>
            <button type="button" onClick={() => setMuted(!muted)} disabled={mediaError} aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'} aria-pressed={!muted}>{muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}</button>
          </div>
          {mediaError && <p className="lp-media-message" role="alert">Không tải được video. Bạn vẫn có thể đọc nhận xét mẫu bên cạnh.</p>}
          {playError && <p className="lp-media-message" role="alert">Chưa phát được video. Bấm phát để thử lại.</p>}
        </div>
        <div className="lp-bay-side">
          <div className="lp-bay-score">
            <div className="lp-score-number"><span className={`lp-bay-num is-${band(DEMO.score, DEMO.ready)}`}>{DEMO.score}</span><span>/100</span></div>
            <div className="lp-bay-verdict"><span className="lp-kicker">KẾT LUẬN MẪU</span><strong>{DEMO.verdict}</strong><small>Ngưỡng điểm tham khảo: {DEMO.ready}</small></div>
            <ul className="lp-bay-groups" aria-label="Điểm theo nhóm">
              {DEMO.groups.map((g) => <li key={g.label} className={`is-${band(g.value, DEMO.ready)}`}><span>{g.label}</span><i style={{ '--v': `${g.value}%` }} aria-hidden="true" /><b>{g.value}</b></li>)}
            </ul>
          </div>
          <div className={`lp-bay-now is-${note.tone}`}>
            <div className="lp-note-label"><span className="lp-tc">{timecode(note.t)}</span><span>{note.tone === 'bad' ? 'CẦN XEM LẠI' : note.tone === 'warn' ? 'GỢI Ý CẢI THIỆN' : 'NỘI DUNG VIDEO'}</span></div>
            <h3>{note.title}</h3>
            {note.quote ? <q>{note.quote}</q> : <p>{note.meta}</p>}
            {note.quote && <small>{note.meta}</small>}
          </div>
          <div className="lp-note-picker">
            <div className="lp-picker-head"><span>Khám phá từng mốc</span><span>{String(active + 1).padStart(2, '0')} / {DEMO.notes.length}</span></div>
            <ol className="lp-bay-list">
              {DEMO.notes.map((n, i) => <li key={n.t}><button type="button" className={`is-${n.tone}`} aria-current={i === active ? 'true' : undefined} disabled={!ready && !mediaError} onClick={() => seek(n.t)}><span className="lp-tc">{timecode(n.t)}</span><span>{n.title}</span><ArrowRight aria-hidden="true" /></button></li>)}
            </ol>
          </div>
        </div>
      </div>
      <div className="lp-bay-track" style={{ '--at': `${currentTime / DEMO.duration * 100}%` }}>
        <div className="lp-bay-film" aria-hidden="true">
          {DEMO.notes.map((n) => <span key={n.t} className={`lp-film-mark is-${n.tone}`} style={{ left: `${n.t / DEMO.duration * 100}%` }} />)}
          <span className="lp-bay-head" />
        </div>
        <input type="range" min="0" max={DEMO.duration} step="0.1" value={currentTime} onChange={(event) => seek(Number(event.target.value))} disabled={!ready || mediaError} aria-label="Tua video mẫu" aria-valuetext={`${timecode(currentTime)} — ${note.title}`} />
        <div className="lp-track-caption"><span>Mỗi mốc là một nhận xét có căn cứ.</span><span>00:00 — {timecode(DEMO.duration)}</span></div>
      </div>
    </div>
  )
}

const STEPS = [
  { title: 'Chọn đúng ngữ cảnh', text: 'Chọn shop, SKU và video KOC cần duyệt. Thông tin sản phẩm đi cùng video ngay từ đầu.', label: 'Shop + SKU + video' },
  { title: 'Đối chiếu từng chi tiết', text: 'Agent đọc lời nói, khung hình; đối chiếu sản phẩm, thị trường và quy tắc nền tảng.', label: 'Video + dữ liệu + Policy' },
  { title: 'Biết cần sửa ở đâu', text: 'Xem điểm, lý do và danh sách việc cần sửa theo giây. Bạn quyết định bước tiếp theo với creator.', label: 'Điểm + bằng chứng + gợi ý' },
]
const FAQS = [
  { q: 'Preflight dành cho ai?', a: 'Dành cho brand/shop làm việc với KOC, KOL và creator affiliate, đặc biệt ở ngành mỹ phẩm, sức khỏe, mẹ & bé. Người duyệt nội dung kiểm tra video trước khi đăng; creator cũng có thể tự kiểm trước khi gửi brand.' },
  { q: 'Điểm cao có nghĩa là video chắc chắn bán tốt?', a: 'Không. Điểm giúp xác định phần mạnh, yếu theo tiêu chí và dữ liệu hiện có; không cam kết lượt xem hay doanh số. Policy được xem riêng, không dùng điểm cao để bỏ qua một cảnh báo.' },
  { q: '“Không phát hiện vi phạm” có phải được sàn duyệt?', a: 'Không. Đây là kết quả đối chiếu trong phạm vi dữ liệu hiện có, không phải xác nhận từ Shopee hay TikTok Shop. Người duyệt vẫn cần xem bằng chứng và tự quyết định trước khi đăng.' },
  { q: 'Bản demo có kết nối tài khoản Shopee thật không?', a: 'Chưa. Đăng nhập, shop và SKU được mô phỏng để trải nghiệm luồng sản phẩm. Không cần nhập mật khẩu Shopee. Video mẫu và snapshot thị trường có nguồn được ghi rõ; dữ liệu thiếu hoặc suy luận có nhãn riêng.' },
]

export default function LandingPage() {
  return (
    <div className="lp">
      <a className="lp-skip" href="#main-content">Đến nội dung chính</a>
      <header className="lp-head">
        <a href="/" className="lp-brand" aria-label="Preflight, trang chủ"><img src="/brand/preflight-mark.svg" alt="" width="30" height="30" />Preflight<span className="lp-brand-dot">.</span></a>
        <nav aria-label="Điều hướng trang giới thiệu"><a href="#demo">Xem demo</a><a href="#how-it-works">Cách hoạt động</a><a href="#faq">Hỏi đáp</a></nav>
        <a href={LOGIN_HREF} className="lp-head-login">Đăng nhập <ArrowRight aria-hidden="true" /></a>
      </header>
      <main id="main-content">
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-hero-copy">
            <div className="lp-platform">
              <span>Cho video bán hàng trên</span>
              <ul className="lp-platform-logos" aria-label="Nền tảng nội dung">
                <li><img className="lp-logo-shopee" src="/brand/shopee-logo.png" alt="Shopee" width="1280" height="410" /></li>
                <li><span className="lp-logo-tiktok"><img src="/brand/tiktok-logo.png" alt="" width="1215" height="1295" /><span>TikTok</span></span></li>
                <li><img className="lp-logo-meta" src="/brand/meta-logo.png" alt="Meta" width="2172" height="724" /></li>
              </ul>
            </div>
            <h1 id="hero-title">Video sắp đăng.<br />Đã <span>đáng duyệt?</span></h1>
          </div>
          <div className="lp-hero-side"><p>Đừng chỉ xem. Hãy biết <strong>đúng giây cần sửa.</strong></p><p className="lp-hero-description">Preflight đối chiếu video KOC với sản phẩm và Policy, giúp bạn phản hồi có căn cứ trước khi bấm duyệt.</p><div className="lp-actions"><a href={LOGIN_HREF} className="lp-btn">Đăng nhập bằng Shopee <ArrowRight aria-hidden="true" /></a><a href="#demo" className="lp-link">Xem video mẫu <ArrowDown aria-hidden="true" /></a></div><small className="lp-disclosure">Bản demo · Đăng nhập mô phỏng, không cần mật khẩu.</small></div>
        </section>
        <section id="demo" className="lp-bay-wrap" aria-labelledby="demo-title">
          <div className="lp-section-meta"><h2 id="demo-title">Một video. Những điểm cần nhìn kỹ.</h2><span>NHẤN PHÁT ĐỂ KHÁM PHÁ <ArrowDown aria-hidden="true" /></span></div>
          <EditBay />
          <div className="lp-caption"><p>Video thật, kết quả từ lượt chấm mẫu có sẵn. Chọn một mốc để xem nhận xét.</p><a href={STUDIO_HREF}>Mở trong Studio <ArrowRight aria-hidden="true" /></a></div>
        </section>
        <section className="lp-benefits" aria-labelledby="benefits-title">
          <div className="lp-section-heading"><p className="lp-eyebrow">TỪ “CHƯA ỔN” ĐẾN “SỬA CHỖ NÀY”</p><h2 id="benefits-title">Feedback rõ.<br />Creator dễ sửa.</h2><p>Một điểm số là chưa đủ. Người duyệt cần biết vì sao — và chỉ cho creator thấy ngay trong video.</p></div>
          <div className="lp-benefit-list">
            <article><span className="lp-item-number">01</span><div><h3>Chỉ đúng câu cần xem lại</h3><p>Lời hứa tuyệt đối, so sánh trước/sau, công dụng chưa có căn cứ: xem trích dẫn và mốc thời gian cùng nhau.</p><span className="lp-inline-proof"><span>00:09</span> “Mới dùng 3 lần mà trắng cỡ này”</span></div></article>
            <article><span className="lp-item-number">02</span><div><h3>Đặt video cạnh đúng sản phẩm</h3><p>Đối chiếu lời nói với listing SKU và ngữ cảnh thị trường. Phân biệt dữ liệu có nguồn với phần còn thiếu.</p></div></article>
            <article><span className="lp-item-number">03</span><div><h3>Nhìn ra phần còn thiếu để bán hàng</h3><p>Từ Hook đến CTA: giữ phần tốt, xem gợi ý bổ sung ưu đãi và lời kêu gọi mua ở đúng đoạn.</p></div></article>
          </div>
        </section>
        <section id="how-it-works" className="lp-how" aria-labelledby="steps-title">
          <div className="lp-section-heading lp-heading-row"><div><p className="lp-eyebrow">TRƯỚC KHI VIDEO LÊN SÓNG</p><h2 id="steps-title">Một lượt kiểm.<br />Đủ ngữ cảnh để quyết định.</h2></div><a href={LOGIN_HREF} className="lp-link">Thử quy trình <ArrowRight aria-hidden="true" /></a></div>
          <ol className="lp-steps">{STEPS.map((step, i) => <li key={step.title}><div className="lp-step-top"><span>0{i + 1}</span>{i < 2 ? <ArrowRight aria-hidden="true" /> : <Check aria-hidden="true" />}</div><h3>{step.title}</h3><p>{step.text}</p><span className="lp-step-label">{step.label}</span></li>)}</ol>
          <details className="lp-method"><summary>Xem bên trong: agent phân tích như thế nào? <ChevronDown aria-hidden="true" /></summary><div className="lp-method-body"><RunConsole /><p><strong>Đọc video → Đối chiếu → Kiểm Policy → Decisions → Kết quả.</strong></p><p>Đầu vào gồm lời nói, khung hình, listing SKU, số liệu shop, snapshot thị trường và quy tắc nền tảng. Decisions chấm theo rubric 5 mức trong một lần gọi theo lô. Các cảnh báo Policy đi vào danh sách cần xem lại, tách khỏi điểm nội dung.</p><a className="lp-link" href={STUDIO_HREF}>Khám phá agent trong Studio <ArrowRight aria-hidden="true" /></a></div></details>
        </section>
        <section className="lp-trust" aria-labelledby="trust-title">
          <div className="lp-section-heading"><p className="lp-eyebrow">CÓ CĂN CỨ. CÓ GIỚI HẠN.</p><h2 id="trust-title">Số nào,<br />nguồn đó.</h2><p>Dữ liệu thật, mô phỏng hay suy luận đều được ghi rõ. Thiếu dữ liệu thì để trống, không biến thành điểm 0.</p><div className="lp-trust-note"><ScanLine aria-hidden="true" /><span>Policy là một lớp kiểm tra riêng.<br /><strong>Điểm cao không xóa cảnh báo.</strong></span></div></div>
          <div className="lp-ledger"><div className="lp-ledger-heading"><span>Nguồn dữ liệu</span><span>VÍ DỤ TRONG BẢN DEMO</span></div><ul>{LEDGER.map((r) => <li key={r.tag}><div className="lp-ledger-source"><span className={`lp-tag is-${r.tone}`}>{r.tag}</span><strong>{r.what}</strong><small>{r.source}</small></div><span className={`lp-ledger-value${r.value == null ? ' is-empty' : ''}`}>{r.value ?? '—'}</span></li>)}</ul><div className="lp-policy"><p>Cách đọc kết quả Policy</p>{POLICY_STATES.map((st) => <span key={st.label} className={`lp-state is-${st.tone}`}>{st.label}</span>)}</div></div>
        </section>
        <section id="faq" className="lp-faq" aria-labelledby="faq-title"><div className="lp-section-heading"><p className="lp-eyebrow">TRƯỚC KHI BẮT ĐẦU</p><h2 id="faq-title">Bạn có thể<br />đang thắc mắc.</h2></div><div className="lp-faq-list">{FAQS.map((faq) => <details key={faq.q}><summary>{faq.q}<ChevronDown aria-hidden="true" /></summary><p>{faq.a}</p></details>)}</div></section>
        <section className="lp-final" aria-labelledby="final-title"><div className="lp-final-film" aria-hidden="true" /><div className="lp-final-copy"><p className="lp-eyebrow">ĐỂ LẦN PHẢN HỒI TIẾP THEO RÕ RÀNG HƠN</p><h2 id="final-title">Xem kỹ hôm nay.<br />Tự tin hơn khi duyệt.</h2><p>Bắt đầu với một video mẫu trong Preflight.</p></div><div className="lp-final-action"><a href={LOGIN_HREF} className="lp-btn lp-btn--light">Đăng nhập bằng Shopee <ArrowRight aria-hidden="true" /></a><span>Trải nghiệm demo · Không cần mật khẩu</span></div></section>
      </main>
      <footer className="lp-foot"><div><a href="/" className="lp-brand"><img src="/brand/preflight-mark.svg" alt="" width="24" height="24" />Preflight.</a><span>Trước khi đăng, có căn cứ.</span></div><p>Bản demo: shop và SKU mô phỏng; snapshot thị trường từ FastMoss và Google Shopping. Preflight không liên kết với Shopee, TikTok hay Meta.</p><a href="#main-content" className="lp-back-top">Về đầu trang ↑</a></footer>
    </div>
  )
}
