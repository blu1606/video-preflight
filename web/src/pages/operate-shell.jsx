import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import './operate.css'

const FLOW_STEPS =['Đăng nhập', 'Chọn shop', 'Chọn sản phẩm', 'Chọn video', 'Studio']

export function BrandMark() {
  return (
    <Link to="/" className="op-brand" aria-label="Preflight, trang chủ">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#ee4d2d" />
        <path d="M12 9.5v13l10.5-6.5z" fill="#ffffff" />
      </svg>
      Preflight
    </Link>
  )
}

/** Header with the flow position. `step` is the index into FLOW_STEPS of the current screen. */
export function OperateHeader({ step }) {
  return (
    <header className="op-head">
      <div className="op-head-inner">
        <BrandMark />
        <nav aria-label="Các bước" className="op-steps">
          {FLOW_STEPS.map((label, i) => (
            <span
              key={label}
              className="op-step"
              aria-current={i === step ? 'step' : undefined}
              data-done={i < step ? '' : undefined}
            >
              {i > 0 && <ChevronRight size={14} aria-hidden="true" />}
              {label}
            </span>
          ))}
        </nav>
      </div>
    </header>
  )
}

/** Shown on every Operate screen: the whole flow runs on synthetic data and a simulated login. */
export function SimulationBar({ children }) {
  return (
    <div className="op-sim" role="note">
      <div className="op-sim-inner">
        <span className="op-tag">Mô phỏng</span>
        <span>{children ?? 'Đăng nhập, shop, SKU và video trong bản này là dữ liệu test, không phải tài khoản hay số liệu thật.'}</span>
      </div>
    </div>
  )
}

export function OperatePage({ step, children }) {
  return (
    <div className="op">
      <OperateHeader step={step} />
      <SimulationBar />
      <main className="op-main">{children}</main>
    </div>
  )
}

/** Plain-state block for loading, empty and error results. */
export function StateBlock({ tone = 'neutral', title, text, action }) {
  return (
    <div className={`op-state op-state--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <p className="op-state-title">{title}</p>
      {text && <p className="op-state-text">{text}</p>}
      {action}
    </div>
  )
}

export function Skeleton({ count = 3 }) {
  return (
    <div className="op-skeleton-list" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="op-skeleton" />
      ))}
    </div>
  )
}
