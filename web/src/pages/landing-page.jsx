import { ArrowRight } from 'lucide-react'

import './landing.css'

const LOGIN_HREF = '/login'
const CTA_LABEL = 'Đăng nhập bằng Shopee'

const PROBLEM_ROWS = [
  {
    label: 'Hook',
    text: 'Đoạn mở đầu không giữ được người xem. Bạn chỉ biết khi lượt xem đã thấp.',
  },
  {
    label: 'CTA',
    text: 'Video hay nhưng không nói người xem nên bấm mua ở đâu, hoặc lời kêu gọi đến quá muộn.',
  },
  {
    label: 'Policy',
    text: 'Một câu trong video hoặc caption có thể cần xem lại theo chính sách nền tảng, và bạn chỉ biết sau khi đăng.',
  },
]

const STEPS = [
  {
    title: 'Chọn shop, video và SKU',
    text: 'Chọn shop đã cấp quyền, chọn video và gắn với SKU sẽ bán. Mô tả và hashtag có thể được AI gợi ý, bạn vẫn sửa được.',
  },
  {
    title: 'Các agent chạy từng bước',
    text: 'Agent đọc video, đối chiếu listing SKU, dữ liệu shop và snapshot thị trường, rồi kiểm tra chính sách. Decisions API chấm theo rubric 5 mức trong một lần gọi. Mỗi bước hiện đầu vào, đầu ra, trạng thái và thời gian.',
  },
  {
    title: 'Nhận điểm, lý do và việc cần sửa',
    text: 'Điểm đi kèm coverage. Tiêu chí thiếu dữ liệu ghi "chưa chấm" thay vì 0. Mỗi việc cần sửa gắn với mốc thời gian trong video.',
  },
]

const PROVENANCE = [
  {
    status: 'REAL',
    tone: 'pass',
    text: 'Lấy từ dữ liệu thật: video, transcript, snapshot thị trường có ngày crawl và nguồn.',
  },
  {
    status: 'MOCK',
    tone: 'amber',
    text: 'Dữ liệu mô phỏng hoặc nội bộ của bản thử nghiệm. Luôn có nhãn, không trình bày như số thật.',
  },
  {
    status: 'INFERRED',
    tone: 'info',
    text: 'Suy ra từ dữ liệu khác. Ghi rõ suy từ đâu và dựa trên bằng chứng nào.',
  },
  {
    status: 'MISSING',
    tone: 'ghost',
    text: 'Thiếu dữ liệu. Hiển thị "chưa chấm", không bao giờ là 0.',
  },
]

const POLICY_STATES = [
  { label: 'Cần xem lại', text: 'Có câu chạm quy định. Kèm trích dẫn nguyên văn để bạn tự đối chiếu.' },
  { label: 'Không phát hiện vi phạm', text: 'Rule engine không thấy vi phạm trong bộ quy tắc hiện có. Đây không phải duyệt của sàn.' },
  { label: 'Chưa đủ dữ liệu', text: 'Thiếu thông tin để kết luận. Chưa có căn cứ để nói có hay không.' },
]

const DATA_SOURCES = [
  'Shop và SKU Shopee: 9 shop mô phỏng, chỉ để thử. Không phải dữ liệu shop thật.',
  'Snapshot thị trường: FastMoss và Google Shopping (qua SerpAPI), có ngày crawl và nguồn đi kèm.',
  'Video mẫu: 24 video TikTok Shop có kết quả do Clipcat báo cáo, chưa được xác minh.',
  'Chính sách: bản diễn giải từ trang quy định chính thức của sàn, kèm URL nguồn.',
  'Đăng nhập Shopee trong bản này là mô phỏng. Không thu thập mật khẩu, không kết nối tài khoản thật.',
]

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
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#ee4d2d" />
        <path d="M12 9.5v13l10.5-6.5z" fill="#ffffff" />
      </svg>
      Preflight
    </span>
  )
}

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-head">
        <a href="/" aria-label="Preflight, trang chủ">
          <Logo />
        </a>
        <nav aria-label="Mục trang" className="landing-nav">
          <a href="#cach-hoat-dong" className="landing-link landing-link--wide">Cách hoạt động</a>
          <a href="#khac-biet" className="landing-link landing-link--wide">Điểm khác biệt</a>
          <a href="#nguon-du-lieu" className="landing-link">Nguồn dữ liệu</a>
        </nav>
      </header>

      <main>
        <section aria-labelledby="hero-title" className="landing-hero">
          <div className="landing-rise">
            <h1 id="hero-title" className="landing-h1">
              Biết video yếu trước khi đăng, không phải sau khi đăng.
            </h1>
            <p className="landing-lede">
              Preflight chấm video bán hàng cho TikTok Shop và Shopee theo Hook, CTA, Conversion và Viral, đối chiếu với SKU, dữ liệu shop và thị trường. Mỗi việc cần sửa chỉ ra đúng mốc thời gian trong video.
            </p>
            <div className="landing-cta-row">
              <LoginButton />
              <p className="landing-note">Bản thử nghiệm: đăng nhập là mô phỏng, shop và SKU là dữ liệu test.</p>
            </div>
          </div>

          <figure className="landing-stage landing-rise">
            <img
              src="/landing/studio-preview.webp"
              width="1578"
              height="900"
              alt="Màn hình Studio của Preflight: video mẫu có điểm 55/100, radar các tiêu chí Viral, Conversion, Shop và SKU, và danh sách việc cần sửa theo mốc thời gian."
            />
            <figcaption>
              Ảnh chụp Studio thật. Shop Lá Mộc Beauty là dữ liệu mô phỏng để thử, video SHOP001-VID01.
            </figcaption>
          </figure>
        </section>

        <section aria-labelledby="problem-title" className="landing-section landing-section--surface">
          <div className="landing-wrap">
            <div className="landing-split">
              <div>
                <h2 id="problem-title" className="landing-h2">
                  Đăng xong mới biết video yếu thì đã muộn.
                </h2>
                <p className="landing-prose">
                  Video bán hàng thường được kiểm bằng cảm giác rồi đăng. Đến khi có số liệu, video đã lên và bạn chỉ còn đoán nguyên nhân.
                </p>
              </div>
              <ul className="landing-rows">
                {PROBLEM_ROWS.map((row) => (
                  <li key={row.label} className="landing-row">
                    <span className="landing-row-label">{row.label}</span>
                    <span className="landing-row-text">{row.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="cach-hoat-dong" aria-labelledby="steps-title" className="landing-section">
          <div className="landing-wrap">
            <h2 id="steps-title" className="landing-h2 landing-h2--narrow">
              Ba bước từ video chưa đăng đến danh sách việc cần sửa.
            </h2>
            <ol className="landing-steps">
              {STEPS.map((step, i) => (
                <li key={step.title} className="landing-step">
                  <span className="landing-step-no">Bước {i + 1}</span>
                  <h3 className="landing-step-title">{step.title}</h3>
                  <p className="landing-step-text">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="khac-biet" aria-labelledby="proof-title" className="landing-section landing-section--surface">
          <div className="landing-wrap">
            <h2 id="proof-title" className="landing-h2 landing-h2--wide">
              Mỗi con số truy được nguồn. Policy không bao giờ được báo là đạt.
            </h2>
            <div className="landing-proof">
              <div>
                <h3 className="landing-h3">Trạng thái của từng số</h3>
                <ul className="landing-list">
                  {PROVENANCE.map((item) => (
                    <li key={item.status} className="landing-list-item">
                      <span className={`landing-status landing-status--${item.tone}`}>{item.status}</span>
                      <span className="landing-list-text">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="landing-h3">Policy chỉ có ba trạng thái</h3>
                <ul className="landing-list">
                  {POLICY_STATES.map((item) => (
                    <li key={item.label} className="landing-list-item landing-list-item--stack">
                      <span className="landing-policy-label">{item.label}</span>
                      <span className="landing-list-text">{item.text}</span>
                    </li>
                  ))}
                </ul>
                <p className="landing-note-line">
                  Bản này không có trạng thái "đạt". Rule engine hiện là bản baseline, sẽ được cải tiến, và không thay thế duyệt chính thức của sàn.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="nguon-du-lieu" aria-labelledby="sources-title" className="landing-section">
          <div className="landing-wrap landing-sources">
            <h2 id="sources-title" className="landing-h2">
              Bản thử nghiệm đang dùng dữ liệu gì.
            </h2>
            <ul className="landing-rows">
              {DATA_SOURCES.map((line) => (
                <li key={line} className="landing-source-item">{line}</li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="final-title" className="landing-final-wrap">
          <div className="landing-final">
            <h2 id="final-title" className="landing-h2 landing-final-title">
              Kiểm video trước lần đăng tiếp theo.
            </h2>
            <div className="landing-cta-row">
              <LoginButton />
              <p className="landing-note landing-note--on-stage">Bản thử nghiệm: đăng nhập là mô phỏng.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-wrap">
          Preflight là bản thử nghiệm. Shopee và TikTok Shop chỉ được nhắc đến theo tên nền tảng. Preflight không thuộc, và không được Shopee hay TikTok xác nhận.
        </div>
      </footer>
    </div>
  )
}
