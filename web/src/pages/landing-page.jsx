import { ArrowRight } from 'lucide-react'
import { useEffect, useRef } from 'react'

import './landing.css'
import './flow-glass.css'

const LOGIN_HREF = '/login'
const CTA_LABEL = 'Đăng nhập bằng Shopee'

const STEPS = [
  { art: 'step-upload', title: 'Chọn video và SKU', text: 'Gắn video với sản phẩm sẽ bán.' },
  { art: 'step-agents', title: 'Agent kiểm tra', text: 'Đọc video, đối chiếu SKU, thị trường, policy.' },
  { art: 'step-fixes', title: 'Sửa theo từng giây', text: 'Điểm, lý do và việc cần sửa gắn với mốc thời gian.' },
]

const PROVENANCE = [
  { status: 'REAL', tone: 'pass', text: 'Có nguồn, có ngày' },
  { status: 'MOCK', tone: 'amber', text: 'Mô phỏng, luôn gắn nhãn' },
  { status: 'INFERRED', tone: 'info', text: 'Suy ra, ghi căn cứ' },
  { status: 'MISSING', tone: 'ghost', text: 'Chưa chấm, không phải 0' },
]

const POLICY_STATES = ['Cần xem lại', 'Không phát hiện vi phạm', 'Chưa đủ dữ liệu']

function LoginButton() {
  return (
    <a href={LOGIN_HREF} className="landing-cta">
      {CTA_LABEL}
      <ArrowRight size={20} aria-hidden="true" />
    </a>
  )
}

function Logo() {
  return (
    <span className="landing-brand">
      <img src="/brand/preflight-mark.svg" alt="" width="30" height="30" />
      Preflight
    </span>
  )
}

/**
 * The page's two motions: the Studio capture tilts a few degrees toward the pointer (fine pointers only), and each
 * section rises once as it scrolls in. Both are skipped under reduced motion; without JS everything just shows.
 */
function useLandingMotion(rootRef) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    const sections = root.querySelectorAll('.landing-section, .landing-final-wrap')
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return
        e.target.classList.add('is-in')
        io.unobserve(e.target)
      }),
      { rootMargin: '0px 0px -12% 0px' },
    )
    sections.forEach((el) => {
      el.classList.add('landing-reveal')
      io.observe(el)
    })

    const hero = root.querySelector('.landing-hero')
    const stage = root.querySelector('.landing-stage')
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const move = (e) => {
      const r = stage.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      stage.classList.add('is-tilting')
      stage.style.setProperty('--ry', `${(x * 7).toFixed(2)}deg`)
      stage.style.setProperty('--rx', `${(-y * 5).toFixed(2)}deg`)
    }
    const reset = () => {
      stage.classList.remove('is-tilting')
      stage.style.setProperty('--ry', '0deg')
      stage.style.setProperty('--rx', '0deg')
    }
    if (fine && hero && stage) {
      hero.addEventListener('pointermove', move)
      hero.addEventListener('pointerleave', reset)
    }
    return () => {
      io.disconnect()
      if (fine && hero && stage) {
        hero.removeEventListener('pointermove', move)
        hero.removeEventListener('pointerleave', reset)
      }
    }
  }, [rootRef])
}

export default function LandingPage() {
  const rootRef = useRef(null)
  useLandingMotion(rootRef)
  return (
    <div className="landing" ref={rootRef}>
      <header className="landing-head">
        <a href="/" aria-label="Preflight, trang chủ">
          <Logo />
        </a>
        <nav aria-label="Mục trang" className="landing-nav">
          <a href="#cach-hoat-dong" className="landing-link landing-link--wide">Cách hoạt động</a>
          <a href="#khac-biet" className="landing-link landing-link--wide">Dữ liệu</a>
          <a href={LOGIN_HREF} className="landing-link landing-head-cta">Đăng nhập</a>
        </nav>
      </header>

      <main>
        <section aria-labelledby="hero-title" className="landing-hero">
          <div className="landing-rise">
            <span className="landing-pill">Bản demo · dữ liệu mô phỏng</span>
            <h1 id="hero-title" className="landing-h1">
              Biết video yếu <em>trước khi đăng</em>.
            </h1>
            <p className="landing-lede">Chấm Hook, CTA, chuyển đổi và policy cho video TikTok Shop, Shopee. Chỉ ra đúng giây cần sửa.</p>
            <div className="landing-cta-row">
              <LoginButton />
            </div>
          </div>

          <figure className="landing-stage landing-rise">
            <img
              src="/landing/studio-preview.webp"
              width="2104"
              height="1200"
              alt="Studio của Preflight: video mẫu được 43/100, điểm theo Viral, Chuyển đổi, SKU và danh sách việc cần sửa theo mốc thời gian."
            />
          </figure>
        </section>

        <section id="cach-hoat-dong" aria-labelledby="steps-title" className="landing-section">
          <div className="landing-wrap">
            <h2 id="steps-title" className="landing-h2">Ba bước, một danh sách việc cần sửa.</h2>
            <ol className="landing-steps">
              {STEPS.map((step, i) => (
                <li key={step.title} className="landing-step">
                  <img className="landing-step-art" src={`/illustrations/${step.art}.webp`} alt="" width="800" height="800" loading="lazy" />
                  <span className="landing-step-no">{i + 1}</span>
                  <h3 className="landing-step-title">{step.title}</h3>
                  <p className="landing-step-text">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="khac-biet" aria-labelledby="proof-title" className="landing-section">
          <div className="landing-wrap landing-trust">
            <h2 id="proof-title" className="landing-h2">Không bịa số.</h2>
            <ul className="landing-chips" aria-label="Trạng thái của từng số">
              {PROVENANCE.map((item) => (
                <li key={item.status} className="landing-chip">
                  <span className={`landing-status landing-status--${item.tone}`}>{item.status}</span>
                  {item.text}
                </li>
              ))}
            </ul>
            <div className="landing-policy">
              <span className="landing-policy-label">Policy không bao giờ báo “đạt”</span>
              <ul className="landing-policy-states">
                {POLICY_STATES.map((label) => <li key={label}>{label}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="final-title" className="landing-final-wrap">
          <div className="landing-final">
            <h2 id="final-title" className="landing-h2 landing-final-title">Kiểm video trước lần đăng tiếp theo.</h2>
            <LoginButton />
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-wrap">
          Bản demo: shop và SKU mô phỏng, snapshot thị trường từ FastMoss và Google Shopping. Không liên kết với Shopee hay TikTok.
        </div>
      </footer>
    </div>
  )
}
