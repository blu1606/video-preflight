import { ArrowLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { GlobalTooltip } from '../studio/tooltip.jsx'

import './operate.css'
import './flow-glass.css'

const FLOW_STEPS = ['Đăng nhập', 'Chọn shop', 'Chọn sản phẩm', 'Chọn video', 'Studio']

export function BrandMark() {
  return (
    <Link to="/" className="op-brand" aria-label="Preflight, trang chủ">
      <img src="/brand/preflight-mark.svg" alt="" width="30" height="30" />
      Preflight
    </Link>
  )
}

const SIM_NOTE = 'Dữ liệu demo: tài khoản, shop, SKU và video đều mô phỏng.'

/** Way back one step: a router link, or a plain href for pages outside the router flow. */
function BackLink({ back }) {
  const body = (
    <>
      <ArrowLeft size={16} aria-hidden="true" />
      <span className="op-back-label">{back.label}</span>
    </>
  )
  return back.href ? (
    <a href={back.href} className="op-back" aria-label={back.label}>{body}</a>
  ) : (
    <Link to={back.to} className="op-back" aria-label={back.label}>{body}</Link>
  )
}

/**
 * One header row for every Operate screen: brand, the way back, the flow position and the simulation tag. The tag
 * carries the full note as its tooltip, so the simulated-data warning stays visible without a band of its own.
 * `step` is the index into FLOW_STEPS of the current screen.
 */
export function OperateHeader({ step, back, sim = SIM_NOTE }) {
  return (
    <header className="op-head">
      <div className="op-head-inner">
        <BrandMark />
        {back && <BackLink back={back} />}
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
        <span className="op-tag" role="note" tabIndex={0} title={sim}>
          Mô phỏng
        </span>
      </div>
    </header>
  )
}

/** `fit` pages lay out to the viewport height (no page scroll) instead of growing with their content. */
export function OperatePage({ step, back, sim, fit = false, children }) {
  return (
    <div className={`op${fit ? ' op--fit' : ''}`}>
      <OperateHeader step={step} back={back} sim={sim} />
      <main className="op-main">{children}</main>
      <GlobalTooltip />
    </div>
  )
}

/** Plain-state block for loading, empty and error results. */
export function StateBlock({ tone = 'neutral', title, text, action }) {
  return (
    <div className={`op-state op-state--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'neutral' && <img className="op-state-art" src="/illustrations/empty-shop.webp" alt="" width="1000" height="800" />}
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
