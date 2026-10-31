import { ArrowLeft, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useFetch } from '../hooks/use-fetch'
import { db } from '../lib/api'
import { BrandMark, SimulationBar } from './operate-shell'

const DEMO_ACCOUNT = 'seller.demo@preflight.test'

const SCOPES = [
  'Xem thông tin shop và danh sách SKU',
  'Xem số liệu shop 30 ngày gần nhất (dữ liệu mô phỏng)',
  'Tải video lên và gắn video vào SKU',
]

/** Simulated Shopee Open Platform authorization: no password field, nothing is sent anywhere. */
export default function LoginPage() {
  const navigate = useNavigate()
  const shops = useFetch(() => db('/shops'), [])
  const names = shops.data?.map((s) => s.shop_name).join(' · ')

  return (
    <div className="op">
      <header className="op-head">
        <div className="op-head-inner">
          <BrandMark />
        </div>
      </header>
      <SimulationBar>
        Màn hình cấp quyền mô phỏng, không phải trang đăng nhập của Shopee. Không có mật khẩu thật nào được nhập hay gửi đi.
      </SimulationBar>

      <main className="op-main">
        <a href="/" className="op-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Trang chủ
        </a>

        <section className="op-auth" aria-labelledby="auth-title">
          <div className="op-auth-head">
            <span className="op-tag">Mô phỏng</span>
            <h1 id="auth-title" className="op-auth-title">Cho phép Preflight truy cập shop của bạn</h1>
          </div>

          <div className="op-auth-body">
            <div>
              <p className="op-auth-section-title">Tài khoản đăng nhập</p>
              <div className="op-account">
                <span className="op-avatar" aria-hidden="true">D</span>
                <div>
                  <p className="op-account-name">{DEMO_ACCOUNT}</p>
                  <p className="op-account-sub">Tài khoản demo, đã điền sẵn. Bản này không yêu cầu mật khẩu.</p>
                </div>
              </div>
            </div>

            <div>
              <p className="op-auth-section-title">Preflight sẽ được phép</p>
              <ul className="op-scope-list">
                {SCOPES.map((scope) => (
                  <li key={scope}>
                    <Check size={16} aria-hidden="true" />
                    <span>{scope}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="op-auth-section-title">Shop được cấp quyền cùng lúc</p>
              {shops.loading && <p className="op-auth-shops">Đang tải danh sách shop…</p>}
              {shops.error && (
                <p className="op-auth-shops">
                  Chưa tải được danh sách shop. Bạn vẫn có thể cho phép, và trang chọn shop sẽ báo lỗi cụ thể.
                </p>
              )}
              {names && (
                <p className="op-auth-shops">
                  {shops.data.length} shop mô phỏng: {names}
                </p>
              )}
            </div>

            <div className="op-auth-actions">
              <a href="/" className="op-btn op-btn--ghost">Hủy</a>
              <button type="button" className="op-btn op-btn--primary" onClick={() => navigate('/shops/select')}>
                Cho phép
              </button>
            </div>
            <p className="op-auth-foot">Bước tiếp theo: chọn shop đã được cấp quyền.</p>
          </div>
        </section>
      </main>
    </div>
  )
}
