import { Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useFetch } from '../hooks/use-fetch'
import { db } from '../lib/api'
import { OperatePage } from './operate-shell'

const DEMO_ACCOUNT = 'seller.demo@preflight.test'

const SCOPES = [
  'Xem thông tin shop và danh sách SKU',
  'Xem số liệu shop 30 ngày',
  'Tải video lên và gắn video vào SKU',
]

/** Simulated Shopee Open Platform authorization: no password field, nothing is sent anywhere. */
export default function LoginPage() {
  const navigate = useNavigate()
  const shops = useFetch(() => db('/shops'), [])
  const names = shops.data?.map((s) => s.shop_name).join(' · ')

  return (
    <OperatePage
      step={0}
      fit
      back={{ href: '/', label: 'Trang chủ' }}
      sim="Cấp quyền mô phỏng, không phải trang của Shopee. Không nhập mật khẩu."
    >

      <section className="op-auth" aria-labelledby="auth-title">
        <div className="op-auth-head">
          <img className="op-auth-art" src="/illustrations/login-shield.webp" alt="" width="1200" height="1200" />
          <h1 id="auth-title" className="op-auth-title">Cho phép SOI truy cập shop của bạn</h1>
        </div>

        <div className="op-auth-body">
          <div>
            <div className="op-account">
              <span className="op-avatar" aria-hidden="true">D</span>
              <div>
                <p className="op-account-name">{DEMO_ACCOUNT}</p>
                <p className="op-account-sub" title={names}>
                  Tài khoản demo{shops.data ? ` · ${shops.data.length} shop` : ''}
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="op-auth-section-title">SOI sẽ được phép</p>
            <ul className="op-scope-list">
              {SCOPES.map((scope) => (
                <li key={scope}>
                  <Check size={16} aria-hidden="true" />
                  <span>{scope}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="op-auth-actions">
            <a href="/" className="op-btn op-btn--ghost">Hủy</a>
            <button type="button" className="op-btn op-btn--primary" onClick={() => navigate('/shops/select')}>
              Cho phép
            </button>
          </div>
        </div>
      </section>
    </OperatePage>
  )
}
