import { useState } from 'react'

import { FIX_KIND_LABELS, platformLabel, rulePlain } from '../lib/labels'
import { fmtTime } from '../lib/timeline'
import { Icon } from './icon'
import { estimateAfterFixes } from './studio-model'

const SKU_REF = /^(S\d|C09)/ // criteria read from the SKU listing and its market

function FixRow({ fix, on, onToggle, onSeek, onOpenSku }) {
  const [open, setOpen] = useState(false)
  // backend: [{start, end, label, text}], text = the quoted line at that moment when there is one
  const moments = (fix.timestamps ?? []).filter((m) => m?.start != null)
  const times = [...new Set(moments.map((m) => m.start))]
  return (
    <li className="fix studio-fix">
      <div className="studio-fix-head">
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={on}
          aria-label={`Tính "${fix.title}" vào ước tính`}
          title={fix.expected_gain == null ? 'Việc này không cộng điểm (policy hoặc dữ liệu)' : 'Tính vào ước tính'}
          onClick={onToggle}
          disabled={fix.expected_gain == null}
        >
          <span aria-hidden="true" />
        </button>
        <div className="od-fill">
          <p className="studio-fix-title">{fix.title}</p>
          <p className="tiny">
            <span className={`studio-kind is-${fix.kind}`}>{FIX_KIND_LABELS[fix.kind] ?? fix.kind}</span>
            {fix.expected_gain != null && <span className="studio-gain"> +{fix.expected_gain} điểm tổng</span>}
            {SKU_REF.test(fix.ref ?? '') && onOpenSku && (
              <button type="button" className="studio-sku-chip" onClick={onOpenSku}><Icon name="chart-2" /> SKU trên thị trường</button>
            )}
            {times.slice(0, 3).map((t) => (
              <button key={t} type="button" className="chip-t" onClick={() => onSeek(t)}>{fmtTime(t)}</button>
            ))}
            {fix.suggested_at != null && !times.length && (
              <button type="button" className="chip-t studio-chip-ghost" onClick={() => onSeek(fix.suggested_at)} title="Gợi ý vị trí: video đang thiếu phần này">
                gợi ý {fmtTime(fix.suggested_at)}
              </button>
            )}
          </p>
        </div>
      </div>
      <button type="button" className="link-btn tiny studio-fix-how" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={open ? 'arrow-down-1' : 'arrow-right-2'} /> Cách sửa
      </button>
      {open && (
        <div className="studio-fix-body">
          <p>{fix.action}</p>
          {fix.why && <p className="tiny muted">Vì sao: {fix.why}</p>}
          {moments.some((m) => m.text) && (
            <ul className="studio-evidence">
              {moments.filter((m) => m.text).slice(0, 6).map((m, i) => (
                <li key={`${m.start}-${i}`}>
                  <button type="button" className="chip-t" onClick={() => onSeek(m.start)}>{fmtTime(m.start)}</button>
                  <span>«{m.text}»</span>
                </li>
              ))}
            </ul>
          )}
          {fix.target_desc && <p className="tiny muted">Đích cần đạt: {fix.target_desc}</p>}
          {fix.current != null && fix.target != null && <p className="tiny muted">Tiêu chí {fix.ref}: {Math.round(fix.current)} → {fix.target}</p>}
          {fix.gain_note && <p className="tiny muted">{fix.gain_note}</p>}
        </div>
      )}
    </li>
  )
}

/** "Sửa & so sánh": policy blockers on top, then the backend's ranked fixes with an additive estimate. */
export function FixesColumn({ result, onSeek, onOpenSku }) {
  const fixes = result?.fixes ?? []
  const overall = result?.overall
  const [selected, setSelected] = useState(() => new Set(fixes.filter((f) => f.expected_gain != null).map((f) => f.id)))
  const blockers = overall?.policy_gate?.blockers ?? []
  const scoring = fixes.filter((f) => f.expected_gain != null)
  const gated = fixes.filter((f) => f.expected_gain == null)
  const est = estimateAfterFixes(overall?.score, fixes, selected)
  const toggle = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <section className="col col-right studio-right" aria-label="Sửa và so sánh">
      <div className="col-head">
        <h2>Sửa &amp; so sánh</h2>
      </div>
      {blockers.length > 0 && (
        <section className="studio-gate" aria-label="Policy cần xem lại">
          <p className="studio-gate-title">
            <Icon name="danger" /> Cần xem lại trước khi đăng · {blockers.length} rule
            <span className="tiny muted studio-gate-note">rule engine baseline, không phải duyệt của sàn</span>
          </p>
          <ul>
            {blockers.map((b) => {
              const t = b.quotes?.find((q) => q.t != null)?.t
              return (
                <li key={`${b.target}-${b.rule_id}`} title={b.summary}>
                  <span className="studio-gate-rule">{b.rule_id}</span>
                  <span className="od-fill od-truncate">{rulePlain(b.rule_id, b.summary)}</span>
                  <span className="tiny muted">{platformLabel(b.target)}</span>
                  {t != null && <button type="button" className="chip-t" onClick={() => onSeek(t)}>{fmtTime(t)}</button>}
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {overall?.score != null && (
        <section className="score-block">
          <div className="od-row" style={{ '--od-gap': '12px', alignItems: 'flex-end' }}>
            <span className="score-big"><span className="num">{Math.round(est ?? overall.score)}</span><span className="den">/100</span></span>
            <div className="od-stack od-fill" style={{ '--od-gap': '4px' }}>
              <span className="tiny">
                <span className="pill-est">ước tính</span> {Math.round(overall.score)} → {Math.round(est)}
                {est > overall.score && <span className="studio-gain"> ▲{Math.round((est - overall.score) * 10) / 10}</span>}
              </span>
              <span className="tiny muted">Cộng dồn mức tăng của các việc đang bật; là ước tính theo công thức điểm, không phải dự báo doanh số.</span>
            </div>
          </div>
        </section>
      )}
      <section className="fixes">
        <h3 className="studio-sub">Việc nên sửa ({fixes.length})</h3>
        {!fixes.length && <p className="tiny muted">Lần chạy này chưa có danh sách việc cần sửa.</p>}
        {scoring.length > 0 && (
          <ol className="studio-fixes">
            {scoring.map((f) => <FixRow key={f.id} fix={f} on={selected.has(f.id)} onToggle={() => toggle(f.id)} onSeek={onSeek} onOpenSku={onOpenSku} />)}
          </ol>
        )}
        {gated.length > 0 && (
          <>
            <h4 className="studio-sub">Việc policy và dữ liệu (không cộng điểm, cần làm trước khi đăng)</h4>
            <ol className="studio-fixes">
              {gated.map((f) => <FixRow key={f.id} fix={f} on={false} onToggle={() => {}} onSeek={onSeek} onOpenSku={onOpenSku} />)}
            </ol>
          </>
        )}
      </section>
    </section>
  )
}
