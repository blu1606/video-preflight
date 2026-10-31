import { platformLabel, policyVerdictLabel, rulePlain } from '../lib/labels'
import { FIT_STATUS_LABEL, platformView, scoreBand } from './studio-model'

/** Heat cell coloured by need-to-fix on our thresholds: pass tone when ready, accent to fix, critical to rework. */
const heatClass = (v, ready, fix) => `studio-heat-cell is-${scoreBand(v, ready, fix)}`
const CART = { native: 'Giỏ hàng trong app', link: 'Phải bấm link ra shop' }
const KIND = { organic: 'Đăng tự nhiên', ads: 'Quảng cáo', listing: 'Trang sản phẩm' }

// misses first, then passes; checks we could not judge go last
const FIT_ORDER = ['fail', 'tip', 'pass', 'unmeasured', 'unverified']

/** Spec checklist of one platform: each check's status, the official spec, our measurement and its source chips. */
function FitChecks({ fit }) {
  return (
    <>
      <p className="tiny"><strong>Hợp nền tảng</strong> <span className="muted">· thông số chính thức, không tính vào điểm. Chưa xác minh là chưa có số để đối chiếu, không phải lỗi.</span></p>
      <ul className="studio-fit-list">
        {fit.checks.toSorted((a, b) => FIT_ORDER.indexOf(a.status) - FIT_ORDER.indexOf(b.status)).map((c) => (
          <li key={c.id} className={`studio-fit-row is-${c.status}`}>
            <span className={`studio-fit-badge is-${c.status}`}>{FIT_STATUS_LABEL[c.status]}</span>
            <span className="studio-fit-main">
              <strong>{c.label}</strong>
              <span className="tiny muted"> · {c.kind === 'hard' ? 'bắt buộc' : 'khuyến nghị'}</span>
              <span className="tiny">Chuẩn: {c.spec}{c.measured ? ` · Video: ${c.measured}` : ''}</span>
              {c.note && <span className="tiny muted">{c.note}</span>}
              {c.sources.length > 0 && (
                <span className="studio-fit-srcs">
                  {c.sources.map((s, i) => (
                    // two quotes can come from the same page
                    <a key={`${s.url}#${i}`} className="studio-fit-src" href={s.url} target="_blank" rel="noopener noreferrer" title={s.quote ?? s.url}>{s.title ?? 'Nguồn'}</a>
                  ))}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Where to post and whether to run ads: the two scores in one table (content and policy per platform); each
 * platform's decision line opens its reasons, cart, policy issues and spec checklist.
 */
export function PlatformTable({ result }) {
  const view = platformView(result)
  if (!view?.rows.length) return null
  const { rows, bestId, ready, fix } = view
  return (
    <section className="studio-platforms" aria-label="So sánh theo nền tảng">
      <div className="heat-wrap">
        <table className="heat studio-heat">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Tiêu chí</span></th>
              {rows.map((r) => (
                <th key={r.id} scope="col" className={r.id === bestId ? 'is-cur' : undefined}>
                  <span className="studio-heat-pf">{platformLabel(r.id)}</span>
                  {r.id === bestId && <span className="tag-best">Ưu tiên</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Nội dung</th>
              {rows.map((r) => (
                <td key={r.id} className={heatClass(r.content, ready, fix)} title={r.kind === 'listing' ? 'Trang sản phẩm chấm theo nhóm SKU & thị trường' : 'Cùng một video trên mọi nền tảng'}>
                  {r.content == null ? <span className="tiny">chưa chấm</span> : Math.round(r.content)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Policy</th>
              {rows.map((r) => (
                <td key={r.id} className={heatClass(r.policyScore, ready, fix)} title={policyVerdictLabel(r.verdict)}>
                  {r.policyScore == null ? <span className="tiny">chưa đủ dữ liệu</span> : Math.round(r.policyScore)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="legend studio-heat-legend">
        <span><i className="studio-heat-sw is-ready" />≥ {ready}</span>
        <span><i className="studio-heat-sw is-fix" />{fix}–{ready - 1}</span>
        <span><i className="studio-heat-sw is-rework" />&lt; {fix}</span>
      </p>
      <ul className="studio-pf-list">
        {rows.map((r) => (
          <li key={r.id}>
            <details>
              <summary>
                <span className={`al-dot is-${r.decision.tone}`} aria-hidden="true" />
                <span className="studio-pf-name">
                  <strong>{platformLabel(r.id)}</strong>
                  <span className="tiny muted"> · {KIND[r.kind]}{r.selected ? ' · đã chọn đăng' : ''}</span>
                </span>
                <span className={`studio-pf-decision is-${r.decision.tone}`}>{r.decision.text}</span>
              </summary>
              <div className="studio-pf-body">
                {r.decision.why.length > 0 && <p className="tiny">Vì: {r.decision.why.join('; ')}.</p>}
                <p className="tiny muted">{CART[r.cart]}{r.cart === 'link' ? ': người xem rời app để mua nên cùng lượt xem ra ít đơn hơn.' : '.'}</p>
                {r.issues.length > 0 ? (
                  <>
                    <p className="tiny"><strong>Cần chỉnh cho nền tảng này</strong></p>
                    <ul className="studio-pf-issues">
                      {r.issues.map((i) => (
                        <li key={i.rule}>
                          <span className={`studio-sev is-${i.severity}`}>{i.rule}</span> {rulePlain(i.rule, i.summary)}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : r.verdict === 'pass' ? (
                  <p className="tiny">Không có rule policy nào cần xem lại.</p>
                ) : null}
                {r.fit && <FitChecks fit={r.fit} />}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}
