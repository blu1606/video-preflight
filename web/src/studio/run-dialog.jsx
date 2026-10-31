import { useEffect, useRef, useState } from 'react'

import { FREE_OPTIONS, PAID_OPTIONS } from '../lib/analysis-options'
import { Icon } from './icon'

// Every paid step off: the run reuses whatever is cached (extraction, Decisions answers, policy review,
// boxes, AI summary) and pays for nothing.
const CACHE_ONLY = { extract: 'auto', decisions: false, cross_check_agent: false, claims_llm: false, localize: false, insights: false, policy_llm: false }
// From scratch: every paid step on, cache bypassed where the backend allows it.
const FRESH = { extract: 'force', decisions: true, cross_check_agent: true, claims_llm: true, localize: true, insights: true, policy_llm: true }

/** What is missing from the cache, as the paid options a run needs to fill it. */
export function neededOptions(status) {
  return {
    extract: 'auto', // auto extracts only when the cache is missing or the file changed
    decisions: status?.decisions?.cached === false,
    localize: status?.localize?.cached !== true,
    insights: status?.insights?.cached !== true,
    policy_llm: status?.policy_review?.cached !== true,
    cross_check_agent: false,
    claims_llm: false,
  }
}

const fullyCached = (s) =>
  s && !['missing', 'changed'].includes(s.extraction?.state) && s.decisions?.cached === true

/**
 * Asks before every run: reuse the cache for free, or pay to run again; when something is not cached yet the
 * steps that fill it come pre-ticked with their cost. Nothing paid starts without this confirmation.
 */
export function RunDialog({ options, cache, onClose, onRun }) {
  const ref = useRef(null)
  // cache-status is prefetched by the page when a video is selected (it takes a few seconds to compute)
  const status = cache.loading ? { loading: true } : cache.error ? { error: String(cache.error.message ?? cache.error) } : cache.data ?? { loading: true }
  const [edits, setEdits] = useState(null)
  const picked = status.loading ? null : (edits ?? { ...options, ...(status.error ? {} : neededOptions(status)) })

  useEffect(() => {
    ref.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const cached = fullyCached(status)
  const paid = picked ? PAID_OPTIONS.filter((p) => picked[p.key] === p.on) : []
  const extractPaid = ['missing', 'changed'].includes(status?.extraction?.state)
  const toggle = (p) => setEdits({ ...picked, [p.key]: picked[p.key] === p.on ? (p.key === 'extract' ? 'auto' : false) : p.on })

  return (
    <div className="deep-modal studio-run-modal">
      <div className="deep-scrim" onClick={onClose} />
      <section ref={ref} className="deep-dialog studio-run-dialog" role="dialog" aria-modal="true" aria-labelledby="runTitle" tabIndex={-1}>
        <header className="ep-head">
          <h2 id="runTitle">Chạy phân tích</h2>
          <button type="button" className="ep-x" onClick={onClose} aria-label="Đóng"><Icon name="close" /></button>
        </header>
        <div className="studio-run-body">
          {status.loading && <p className="tiny muted">Đang kiểm tra cache của video này…</p>}
          {status.error && <p className="tiny studio-err">Không đọc được trạng thái cache ({status.error}). Chọn bước cần chạy bên dưới.</p>}
          {!status.loading && (
            <ul className="studio-cache-list">
              <li className={extractPaid ? 'is-miss' : 'is-hit'}>Trích xuất video (frames, Whisper, VLM): {extractPaid ? 'chưa có' : 'có cache'}</li>
              <li className={status.decisions?.cached ? 'is-hit' : 'is-miss'}>
                Câu trả lời Decisions: {status.decisions?.cached ? `có cache (${status.decisions.answered}/${status.decisions.eligible} câu)` : 'chưa có cho bằng chứng hiện tại'}
              </li>
              <li className={status.localize?.cached ? 'is-hit' : 'is-miss'}>Khoanh vùng trên khung hình: {status.localize?.cached ? 'có cache' : status.localize?.cached === false ? 'chưa có' : 'biết sau khi chấm'}</li>
              <li className={status.policy_review?.cached ? 'is-hit' : 'is-miss'}>Agent kiểm tra policy: {status.policy_review?.cached ? 'có cache' : status.policy_review?.cached === false ? 'chưa có' : 'biết sau khi chấm'}</li>
              <li className={status.insights?.cached ? 'is-hit' : 'is-miss'}>AI tóm tắt: {status.insights?.cached ? 'có cache' : 'biết sau khi chấm (cache theo kết quả)'}</li>
            </ul>
          )}
          {cached && (
            <div className="studio-run-choice">
              <button type="button" className="btn btn-primary" onClick={() => onRun({ ...options, ...CACHE_ONLY })}>
                <Icon name="refresh-2" /> Dùng cache · miễn phí, vài giây
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => onRun({ ...options, ...FRESH })}>
                Chạy lại từ đầu · tính phí
              </button>
              <p className="tiny muted">Chạy lại từ đầu trích xuất lại video và hỏi lại AI mọi bước: khoảng 14k + 10k + 3 × 5k token.</p>
            </div>
          )}
          {!cached && picked && !status.loading && (
            <>
              <p className="tiny">Những bước cần chạy để có kết quả đầy đủ đã được tick sẵn. Bỏ tick nếu không muốn trả phí bước đó.</p>
              {extractPaid && (
                <p className="pn-note tiny">Video chưa trích xuất: bước trích xuất (frames + Whisper + VLM, khoảng 14k token) luôn chạy ở lần đầu.</p>
              )}
              <ul className="studio-paid-list">
                {FREE_OPTIONS.map((p) => (
                  <li key={p.key}>
                    <label className="studio-check">
                      <input type="checkbox" checked={picked[p.key] === true} onChange={() => setEdits({ ...picked, [p.key]: !picked[p.key] })} />
                      <span>
                        <strong>{p.label}</strong>
                        <span className="tiny muted"> · {p.cost}</span>
                      </span>
                    </label>
                  </li>
                ))}
                {PAID_OPTIONS.filter((p) => p.key !== 'extract').map((p) => (
                  <li key={p.key}>
                    <label className="studio-check">
                      <input type="checkbox" checked={picked[p.key] === p.on} onChange={() => toggle(p)} />
                      <span>
                        <strong>{p.label}</strong>
                        <span className="tiny muted"> · {p.cost}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-primary studio-analyze" onClick={() => onRun(picked)}>
                <Icon name="magicpen" /> Chạy{paid.length || extractPaid ? ' · có tính phí' : ' · miễn phí'}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
