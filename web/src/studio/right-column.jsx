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

const GROUP_PARTS = [
  { id: 'viral_potential', label: 'Viral', hint: 'Giữ chân và lan toả: hook, mạch kể, cảm xúc, đáng chia sẻ' },
  { id: 'conversion_potential', label: 'Chuyển đổi', hint: 'Khiến người xem mua: nhận ra sản phẩm, bằng chứng, ưu đãi, CTA' },
  { id: 'sku_market', label: 'SKU & thị trường', hint: 'Listing, đánh giá, giá và nhu cầu của sản phẩm gắn với video' },
]
const band = (v, ready, fix) => (v == null ? 'missing' : v >= ready ? 'ready' : v >= fix ? 'fix' : 'rework')

/** Score ring: the arc fills to the score, coloured by band, with a tick where "ready" starts. */
function ScoreRing({ value, ready, fix, estimate, scanning = false }) {
  const r = 46
  const c = 2 * Math.PI * r
  const shown = value == null ? 0 : Math.max(0, Math.min(100, value))
  const tick = (ready / 100) * 2 * Math.PI - Math.PI / 2
  return (
    <span className={`studio-ring is-${band(value, ready, fix)}${estimate ? ' is-estimate' : ''}${scanning ? ' is-scanning' : ''}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="ring-track" cx="60" cy="60" r={r} />
        <circle className="ring-fill" cx="60" cy="60" r={r} strokeDasharray={`${(shown / 100) * c} ${c}`} transform="rotate(-90 60 60)" />
        {/* while scoring: a short arc runs round the track until the first estimate lands */}
        {scanning && <circle className="ring-spin" cx="60" cy="60" r={r} strokeDasharray={`${c * 0.18} ${c}`} />}
        <line className="ring-tick" x1={60 + Math.cos(tick) * (r - 6)} y1={60 + Math.sin(tick) * (r - 6)} x2={60 + Math.cos(tick) * (r + 7)} y2={60 + Math.sin(tick) * (r + 7)} />
      </svg>
      <span className="ring-num">{value == null ? '—' : Math.round(value)}<small>/100</small></span>
    </span>
  )
}

/**
 * The answer first: score ring, the decision in words, the AI's one-line reading, then the policy gate as its own
 * row (it blocks posting whatever the score says). Provisional while Decisions answers are still arriving.
 */
function ScoreHero({ overall, provisional, gate, headline, onPolicy, running = false }) {
  const estimate = overall?.score == null && provisional != null
  const counted = useCountUp(overall?.score ?? provisional)
  const ready = overall?.thresholds?.ready ?? 75
  const fix = overall?.thresholds?.fix ?? 50
  const rules = groupPolicyByRule(gate?.blockers).length
  const review = gate?.status === 'review'
  return (
    <div className="studio-hero">
      <div className="studio-hero-top" aria-label={overall?.score != null ? `Điểm tổng ${Math.round(overall.score)} trên 100` : 'Chưa có điểm tổng'}>
        <ScoreRing value={counted} ready={ready} fix={fix} estimate={estimate} scanning={running && counted == null} />
        <div className="studio-hero-text">
          {estimate || (running && overall?.score == null) ? (
            <p className="studio-hero-verdict is-estimate">Đang chấm<span className="studio-dots" aria-hidden="true"><i /><i /><i /></span></p>
          ) : (
            overall?.label_vi && <p className={`studio-hero-verdict is-${overall.label}`}>{overall.label_vi}</p>
          )}
          {estimate && <p className="tiny muted">Tạm tính, điểm chốt khi chạy xong.</p>}
          {!estimate && headline && <p className="studio-hero-line">{headline}</p>}
          {overall && (
            <p className="studio-hero-meta" title="Phần trọng số điểm tổng đã có câu trả lời; phần thiếu không bị tính 0">
              Dữ liệu đủ {Math.round((overall.coverage ?? 0) * 100)}% · ngưỡng đăng {ready}
            </p>
          )}
        </div>
      </div>
      {gate && (
        <button type="button" className={`studio-gate-row is-${review ? 'review' : gate.status}`} onClick={onPolicy} title="Rule engine bản baseline, không phải duyệt chính thức của sàn">
          <Icon name={review ? 'shield-cross' : 'shield-tick'} />
          <span>
            {review
              ? <><strong>{rules} rule policy</strong> cần xem lại trước khi đăng</>
              : gate.status === 'clear' ? 'Policy: không phát hiện vi phạm' : 'Policy: chưa đủ dữ liệu để kiểm tra'}
          </span>
          <Icon name="arrow-right-2" />
        </button>
      )}
    </div>
  )
}

/** How the overall score is made: the three weighted groups, each a bar with the "ready" tick. */
function ScoreParts({ result }) {
  const overall = result?.overall
  const ready = overall?.thresholds?.ready ?? 75
  const fix = overall?.thresholds?.fix ?? 50
  const weights = overall?.weights ?? {}
  const scores = Object.fromEntries((result?.scores ?? []).map((g) => [g.name, g.score]))
  return (
    <section className="studio-parts" aria-label="Điểm thành phần">
      <ul>
        {GROUP_PARTS.map((g) => {
          const v = scores[g.id]
          return (
            <li key={g.id} className={`studio-part is-${band(v, ready, fix)}`} title={g.hint}>
              <span className="studio-part-name">{g.label}{weights[g.id] != null && <em>{Math.round(weights[g.id] * 100)}%</em>}</span>
              <span className="studio-part-bar" aria-hidden="true">
                <span className="fill" style={{ width: `${v == null ? 0 : Math.max(2, Math.min(100, v))}%` }} />
                <span className="tick" style={{ left: `${ready}%` }} />
              </span>
              <strong className="studio-part-num">{v == null ? '–' : Math.round(v)}</strong>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The three fixes to make first, in the backend's order: what, where in the video, and what it is worth. */
function TopFixes({ fixes, total, onSeek, onAll }) {
  const top = topFixes(fixes)
  if (!top.length) return null
  return (
    <section className="studio-top-fixes" aria-label="Việc nên sửa trước">
      <div className="studio-top-head">
        <h3 className="studio-sub">Sửa trước</h3>
        <button type="button" className="link-btn tiny" onClick={onAll}>Xem cả {total}</button>
      </div>
      <ol className="studio-top-list">
        {top.map((f, i) => {
          const t = fixMoment(f)
          return (
            <li key={f.id}>
              <span className="studio-top-n" aria-hidden="true">{i + 1}</span>
              <span className="studio-top-body">
                <span className="studio-top-title">{f.title}</span>
                <span className="studio-top-meta">
                  <span className={`studio-kind is-${f.kind}`}>{FIX_KIND_LABELS[f.kind] ?? f.kind}</span>
                  {t != null && <button type="button" className="chip-t" onClick={() => onSeek(t)} aria-label={`Tua đến ${fmtTime(t)}`}>{fmtTime(t)}</button>}
                  {f.expected_gain != null && <span className="studio-gain">+{f.expected_gain} điểm</span>}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/**
 * Estimated performance as a funnel: each stage's bar is its share of views on a log scale (orders are a fraction of
 * a percent, a linear bar would vanish), with the step rate between stages. The sample video of the same product
 * sits underneath on the one rate that compares fairly: orders per 1K views.
 */
function Forecast({ result }) {
  const { funnel, funnelReason, benchmark } = metricsView(result)
  const rate = (a, b) => (a != null && b ? `${((a / b) * 100).toFixed(a / b < 0.01 ? 2 : 1)}%` : null)
  const share = (v) => (funnel?.views > 1 && v > 0 ? Math.max(4, (Math.log10(v) / Math.log10(funnel.views)) * 100) : 0)
  const per1k = funnel?.views ? (funnel.orders / funnel.views) * 1000 : null
  const benchPer1k = benchmark?.sales_per_1k_views != null ? Number(benchmark.sales_per_1k_views) : null
  const top = Math.max(per1k ?? 0, benchPer1k ?? 0) || 1
  const stages = funnel
    ? [
        { id: 'views', label: 'Views', value: funnel.views },
        { id: 'clicks', label: 'Click SP', value: funnel.clicks, rate: rate(funnel.clicks, funnel.views) },
        { id: 'orders', label: 'Đơn', value: funnel.orders, rate: rate(funnel.orders, funnel.clicks) },
      ]
    : []
  return (
    <section className="studio-forecast" aria-label="Hiệu suất video">
      <div className="studio-forecast-head">
        <h3 className="studio-forecast-title">Hiệu suất ước tính</h3>
        {funnel && <span className="studio-forecast-gmv" title="GMV ước tính"><small>GMV</small>{vnd(funnel.gmv)}</span>}
      </div>
      {!funnel && <p className="studio-forecast-missing" title={funnelReason ?? undefined}>Chưa đủ dữ liệu để ước tính views → đơn → GMV.</p>}
      {funnel && (
        <ol className="studio-funnel">
          {stages.map((st) => (
            <li key={st.id} className={`is-${st.id}`}>
              <span className="studio-funnel-label">{st.label}</span>
              <span className="studio-funnel-bar"><span style={{ width: `${share(st.value)}%` }} /></span>
              <strong>{num(st.value)}</strong>
              {st.rate && <em title="So với bước trước">{st.rate}</em>}
            </li>
          ))}
        </ol>
      )}
      {funnel && benchPer1k != null && (
        <div className="studio-bench-compare" title={`Video mẫu: ${num(benchmark.views)} views · ${num(benchmark.sales)} đơn`}>
          <span className="studio-bench-title">Đơn / 1K views</span>
          <div className="studio-bench-row is-you">
            <span>Video này</span>
            <span className="studio-funnel-bar"><span style={{ width: `${((per1k ?? 0) / top) * 100}%` }} /></span>
            <strong>{per1k == null ? '–' : per1k.toFixed(per1k < 1 ? 3 : 2)}</strong>
          </div>
          <div className="studio-bench-row is-bench">
            <span>Video mẫu</span>
            <span className="studio-funnel-bar"><span style={{ width: `${(benchPer1k / top) * 100}%` }} /></span>
            <strong>{benchPer1k.toFixed(benchPer1k < 1 ? 3 : 2)}</strong>
          </div>
        </div>
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

/** Right column: the score and its policy gate, the Decisions radar (main picture), group bars, top fixes, three tabs. */
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
          <ScoreHero
            overall={running ? null : overall}
            provisional={provisional}
            gate={running ? null : overall?.policy_gate}
            headline={running ? null : verdict}
            onPolicy={() => onSideTab('evidence')}
            running={running}
          />
          {!running && (overall?.warnings ?? []).map((w) => <p key={w} className="tiny studio-warn">{w}</p>)}
        </section>
      )}
      {/* the radar is the score's main picture: it fills axis by axis while a run streams and stays as the summary
          after it; the weighted groups below it say how the axes add up to the score */}
      {questions.length > 0 && (running || result) && (
        <Radar questions={questions} revealed={revealed} selectedId={selectedId} onSelect={onOpenQuestion} onOpenAll={onOpenAll}
          threshold={threshold} answered={answered} total={scoreQs.length} otherCount={otherCount} scanning={running} />
      )}
      {result && !running && <ScoreParts result={result} />}
      {result && !running && scoreQs.every((q) => q.value == null) && (
        <p className="tiny studio-batch-note">
          Chưa có câu trả lời Decisions cho lần chạy này. Bật "Gọi Decisions API" trong tuỳ chọn để chấm (có tính phí).
        </p>
      )}
      {result && !running && <TopFixes fixes={result.fixes} total={(result.fixes ?? []).length} onSeek={onSeek} onAll={onOpenFixes} />}
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
