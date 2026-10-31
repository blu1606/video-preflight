import { CLAIM_LABEL, FIX_KIND_LABELS, platformLabel, rulePlain } from '../lib/labels'
import { fmtTime } from '../lib/timeline'
import { Icon } from './icon'
import { useCountUp } from './motion'
import { citeChips } from './insight-cites'
import { PlatformTable } from './platform-table'
import { Radar } from './radar'
import { SkuTeaser } from './sku-market'
import { questionCounts } from './flow-model'
import { fixMoment, groupPolicyByRule, metricsView, topFixes } from './studio-model'

const SKU_REF = /^(S\d|C09)/ // criteria read from the SKU listing and its market
const SIDE_TABS = [
  { id: 'platform', label: 'Nền tảng' },
  { id: 'evidence', label: 'Bằng chứng' },
  { id: 'perf', label: 'Hiệu suất' },
]
const CHIPS_PER_INSIGHT = 3
const vnd = (v) => (v == null ? '–' : `${Math.round(v).toLocaleString('vi-VN')}₫`)
const num = (v) => (v == null ? '–' : Number(v).toLocaleString('vi-VN'))

/** Overall score with its label, provisional while the Decisions answers are still arriving, and the policy gate. */
function ScoreHead({ overall, provisional, gate, onPolicy }) {
  const estimate = overall?.score == null && provisional != null
  const shown = overall?.score ?? provisional
  const counted = useCountUp(shown)
  const rules = groupPolicyByRule(gate?.blockers).length
  const review = gate?.status === 'review'
  return (
    <div className="studio-score">
      <span className="score-big" aria-label={overall?.score != null ? `Điểm tổng ${Math.round(overall.score)} trên 100` : 'Chưa có điểm tổng'}>
        <span className={`num${estimate ? ' studio-provisional' : ''}`}>{counted == null ? '—' : Math.round(counted)}</span>
        <span className="den">/100</span>
      </span>
      <span className="studio-score-meta">
        {estimate && <span className="pill-est">tạm tính</span>}
        {overall?.label_vi && (
          <span className={`studio-label is-${overall.label}${overall.coverage < 0.5 ? ' is-weak' : ''}`}>{overall.label_vi}</span>
        )}
        {overall && <span className="tiny muted">coverage {Math.round((overall.coverage ?? 0) * 100)}%</span>}
      </span>
      {gate && (
        <button
          type="button"
          className={`chip studio-policy-chip ${review ? 'studio-chip-critical' : 'chip-neutral'}`}
          title="Rule engine bản baseline, không phải duyệt chính thức của sàn"
          onClick={onPolicy}
        >
          <Icon name={review ? 'shield-cross' : 'shield-tick'} />
          {review ? `Policy: ${rules} cần xem lại` : gate.status === 'clear' ? 'Policy: không phát hiện vi phạm' : 'Policy: chưa đủ dữ liệu'}
        </button>
      )}
    </div>
  )
}

/** The three fixes to make first, in the backend's order; each with its moment in the video and its gain. */
function TopFixes({ fixes, onSeek, onAll }) {
  const top = topFixes(fixes)
  if (!top.length) return null
  return (
    <section className="studio-top-fixes" aria-label="Việc nên sửa trước">
      <div className="studio-top-head">
        <h3 className="studio-sub">3 việc nên sửa trước</h3>
        <button type="button" className="link-btn tiny" onClick={onAll}>Xem tất cả</button>
      </div>
      <ol className="studio-top-list">
        {top.map((f) => {
          const t = fixMoment(f)
          return (
            <li key={f.id}>
              <span className="studio-top-title" title={f.title}>{f.title}</span>
              {t != null && <button type="button" className="chip-t" onClick={() => onSeek(t)}>{fmtTime(t)}</button>}
              {f.expected_gain != null
                ? <span className="studio-gain">+{f.expected_gain} điểm</span>
                : <span className={`studio-kind is-${f.kind}`}>{FIX_KIND_LABELS[f.kind] ?? f.kind}</span>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Estimated performance: views → clicks → orders → GMV, then the real video it is read against. */
function Forecast({ result }) {
  const { funnel, funnelReason, benchmark } = metricsView(result)
  const rate = (a, b) => (a != null && b ? `${((a / b) * 100).toFixed(a / b < 0.01 ? 2 : 1)}%` : null)
  return (
    <section className="studio-forecast" aria-label="Hiệu suất video">
      <h3 className="studio-forecast-title">Hiệu suất video</h3>
      {!funnel && <p className="studio-forecast-missing" title={funnelReason ?? undefined}>Chưa đủ dữ liệu để ước tính views → đơn → GMV cho video này.</p>}
      {funnel && (
        <ol className="studio-forecast-row">
          <li><span>Views</span><strong>{num(funnel.views)}</strong></li>
          <li><span>Click SP</span><strong>{num(funnel.clicks)}</strong><em>{rate(funnel.clicks, funnel.views)}</em></li>
          <li><span>Đơn</span><strong>{num(funnel.orders)}</strong><em>{rate(funnel.orders, funnel.clicks)}</em></li>
          <li className="is-gmv"><span>GMV</span><strong>{vnd(funnel.gmv)}</strong></li>
        </ol>
      )}
      {benchmark && (
        <p className="tiny muted studio-bench">
          Video mẫu cùng sản phẩm: {num(benchmark.views)} views · {num(benchmark.sales)} đơn · {benchmark.sales_per_1k_views} đơn/1K views
        </p>
      )}
    </section>
  )
}

/**
 * The AI's reading and its evidence: insights with at most three chips each (the source behind each), policy
 * evidence once per rule, and the claims of the video checked against the listing.
 */
function Evidence({ result, onSeek, onCite, onOpenSku }) {
  const insights = result?.insights?.insights ?? []
  const rules = groupPolicyByRule(result?.overall?.policy_gate?.blockers)
  const claims = result?.claims_verdicts ?? []
  return (
    <>
      {insights.length > 0 ? (
        <ul className="studio-insights">
          {insights.map((it, i) => {
            const chips = []
            if (onOpenSku && it.refs?.some((r) => SKU_REF.test(r))) {
              chips.push(<button key="sku" type="button" className="studio-sku-chip" onClick={onOpenSku}><Icon name="chart-2" /> SKU trên thị trường</button>)
            }
            for (const c of citeChips(it.cites)) {
              chips.push(<button key={c.key} type="button" className="studio-cite" title={c.title} onClick={() => onCite(c.action)}>{c.label}</button>)
            }
            return (
              <li key={i} className={`is-${it.tone}`}>
                <span>{it.text}</span>
                {chips.length > 0 && <span className="studio-insight-links">{chips.slice(0, CHIPS_PER_INSIGHT)}</span>}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="tiny muted">Lần chạy này chưa có đánh giá AI.</p>
      )}
      {rules.length > 0 && (
        <section className="studio-evidence-block">
          <h3 className="studio-sub">Policy theo rule · {rules.length}</h3>
          <ul className="studio-rules">
            {rules.map((r) => (
              <li key={r.rule_id} className="studio-rule">
                <p><span className="studio-rule-id">{r.rule_id}</span> {rulePlain(r.rule_id, r.summary)}</p>
                <p className="tiny muted">{r.targets.map((t) => platformLabel(t)).join(' · ')}</p>
                <details>
                  <summary className="tiny">Nguyên văn</summary>
                  <p className="tiny" lang="en">{r.summary}</p>
                  {r.quotes.slice(0, 3).map((q, i) => (
                    <p key={i} className="studio-quote">
                      {q.t != null && <button type="button" className="chip-t" onClick={() => onSeek(q.t)}>{fmtTime(q.t)}</button>}
                      «{q.text}»
                    </p>
                  ))}
                  {!r.quotes.length && r.evidence.slice(0, 2).map((e, i) => <p key={i} className="studio-quote">{e}</p>)}
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
      {claims.length > 0 && (
        <section className="studio-evidence-block">
          <h3 className="studio-sub">Claim trong video so với listing</h3>
          <ul className="studio-claims">
            {claims.map((c, i) => (
              <li key={i}>
                <p>«{c.claim}» <span className={`studio-status is-${c.verdict === 'supported' ? 'real' : c.verdict === 'contradicts' ? 'missing' : 'mock'}`}>{CLAIM_LABEL[c.verdict] ?? c.verdict}</span></p>
                {c.listing_evidence && <p className="tiny muted">Listing: {c.listing_evidence}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** Right column: the score and its policy gate, the Decisions radar, the AI's verdict and top fixes, then three tabs. */
export function RightColumn({
  run, result, questions, revealed, provisional, selectedId, onOpenQuestion, onOpenAll, onSeek, onCite, onAnalyze, canAnalyze, analyzeHint,
  sku, onOpenSku, onOpenFixes, sideTab, onSideTab,
}) {
  const running = run.status === 'running'
  const overall = result?.overall ?? null
  const threshold = overall?.thresholds?.ready ?? 75
  const scoreQs = questions.filter((q) => q.type === 'score')
  const answered = scoreQs.filter((q) => q.value != null && (!revealed || revealed.has(q.id))).length
  const otherCount = questionCounts(questions).other // policy / choice questions of the same Decisions batch
  const verdict = result?.insights?.headline
  // the policy tab and the claims are read in the evidence tab; any other citation goes to its own place
  const cite = (action) => (action.type === 'policy' || action.type === 'claims' ? onSideTab('evidence') : onCite?.(action))
  const panel = sideTab === 'evidence' ? 'evidence' : sideTab === 'perf' ? 'perf' : 'platform'

  return (
    <section className="col col-right studio-right" aria-label="Điểm">
      <div className="col-head">
        <h2>Điểm</h2>
        {result && !running && (
          <button type="button" className="btn btn-sm btn-secondary studio-rerun-head" onClick={onAnalyze} disabled={!canAnalyze}>
            <Icon name="refresh-2" /> Phân tích lại
          </button>
        )}
      </div>
      {!result && !running ? (
        <section className="score-block studio-start">
          <img className="studio-start-art" src="/illustrations/no-analysis.webp" alt="" width="800" height="600" />
          <h3>Video này chưa được phân tích</h3>
          <p className="tiny muted">Chạy một lần để có điểm, việc cần sửa và kết quả policy cho từng nền tảng.</p>
          <button type="button" className="btn btn-primary studio-analyze" onClick={onAnalyze} disabled={!canAnalyze}>
            <Icon name="magicpen" /> Phân tích video
          </button>
          {analyzeHint && <p className="tiny muted">{analyzeHint}</p>}
        </section>
      ) : (
        <section className="score-block">
          <ScoreHead
            overall={running ? null : overall}
            provisional={provisional}
            gate={running ? null : overall?.policy_gate}
            onPolicy={() => onSideTab('evidence')}
          />
          {running && (
            <p className="tiny muted">{provisional != null ? 'Tạm tính, điểm chốt khi chạy xong.' : 'Đang chấm…'}</p>
          )}
          {!running && (overall?.warnings ?? []).map((w) => <p key={w} className="tiny studio-warn">{w}</p>)}
        </section>
      )}
      {/* before the first run the empty state is the one focus; an all-dash radar would only repeat "chưa chấm" */}
      {((questions.length > 0 && result) || running) && (
        <Radar
          questions={questions}
          revealed={revealed}
          selectedId={selectedId}
          onSelect={onOpenQuestion}
          onOpenAll={onOpenAll}
          threshold={threshold}
          answered={answered}
          total={scoreQs.length}
          otherCount={otherCount}
        />
      )}
      {running && revealed && <p className="tiny muted studio-batch-note">Decisions là một lần gọi batch; radar hiện lần lượt.</p>}
      {result && !running && scoreQs.every((q) => q.value == null) && (
        <p className="tiny studio-batch-note">
          Chưa có câu trả lời Decisions cho lần chạy này. Bật "Gọi Decisions API" trong tuỳ chọn để chấm (có tính phí).
        </p>
      )}
      {result && !running && verdict && <p className="studio-headline">{verdict}</p>}
      {result && !running && <TopFixes fixes={result.fixes} onSeek={onSeek} onAll={onOpenFixes} />}
      {result && !running && (
        <>
          <div className="tabs studio-side-tabs" role="tablist" aria-label="Chi tiết kết quả">
            {SIDE_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`side-tab-${t.id}`}
                aria-selected={panel === t.id}
                aria-controls="side-panel"
                onClick={() => onSideTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <section className="studio-side-panel" role="tabpanel" id="side-panel" aria-labelledby={`side-tab-${panel}`}>
            {panel === 'evidence' && <Evidence result={result} onSeek={onSeek} onCite={cite} onOpenSku={onOpenSku} />}
            {panel === 'perf' && (
              <>
                <Forecast result={result} />
                {sku && <SkuTeaser sku={sku} onOpen={onOpenSku} />}
              </>
            )}
            {panel === 'platform' && <PlatformTable result={result} />}
          </section>
        </>
      )}
    </section>
  )
}
