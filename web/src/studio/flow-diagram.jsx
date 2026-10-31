import { useEffect, useState } from 'react'

import { groupSteps, summarizeStep } from '../lib/run-stages'
import { connectorState, progressView, runTotals, stageHandoff, stageSeconds, stepTokens } from './flow-model'
import { Icon } from './icon'
import './dialog.css'

const STATE = { running: 'đang chạy', ok: 'xong', done: 'xong', skipped: 'bỏ qua', error: 'lỗi', pending: 'chờ' }
const KIND = { tool: 'tool', functional: 'luật', reasoning: 'AI' }
const fmtInt = (n) => (n == null ? '–' : Number(n).toLocaleString('vi-VN'))
const fmtSec = (s) => (s == null ? '–' : `${Number(s).toFixed(1)}s`)
const stepKey = (s, i) => `${s.name}-${s.started_ms ?? i}`

/** Seconds since `active` turned on, ticking once a second (local clock: the stream carries no wall time). */
function useElapsed(active) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const start = Date.now()
    const id = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [active])
  return active ? elapsed : 0
}

function Progress({ progress }) {
  const p = progressView(progress)
  const detail = p?.detail == null ? null : typeof p.detail === 'string' ? p.detail : JSON.stringify(p.detail)
  return (
    <div className="fd-progress">
      {p?.label && (
        <p className="fd-progress-line">
          <span className="od-fill">{p.label}</span>
          {p.count && <span className="fd-num">{p.count}</span>}
        </p>
      )}
      <span
        className={`fd-bar${p?.pct == null ? ' is-indet' : ''}`}
        role="progressbar"
        aria-label={p?.label || 'Tiến độ'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p?.pct ?? undefined}
      >
        <span style={p?.pct != null ? { width: `${p.pct}%` } : undefined} />
      </span>
      {detail && <p className="fd-detail">{detail}</p>}
    </div>
  )
}

/** Second line of a node: time and tokens, or that the step made no AI call. */
function nodeMeta(step, elapsed) {
  if (step.status === 'running') return `${elapsed}s · đang chạy`
  if (step.status === 'pending') return 'chờ'
  const tk = stepTokens(step)
  const time = step.duration_s != null ? fmtSec(step.duration_s) : STATE[step.status] ?? step.status
  return `${time} · ${tk ? `${fmtInt(tk.total)} tokens` : noTokens(step)}`
}

/** snake_case names carry no spaces; a <wbr> after "·" and every "_" lets the card wrap at a word seam. */
const breakable = (text) =>
  text.split(/(?<=[_·])/).flatMap((part, i) => (i ? [<wbr key={`w${i}`} />, part] : [part]))

// A reasoning step without recorded usage did call a model; only tool/functional steps make no AI call.
const noTokens = (step) => (step.kind === 'reasoning' ? 'token chưa ghi' : 'không gọi AI')

/** Compact card of one step: status dot, "agent · step", time and tokens; progress while it runs. */
function Node({ step, selected, onSelect, controls }) {
  const running = step.status === 'running'
  const elapsed = useElapsed(running)
  const name = `${step.agent ?? '–'} · ${step.name}`
  return (
    <div className={`fd-node is-${step.status}${selected ? ' is-sel' : ''}`}>
      <button type="button" className="fd-node-btn" aria-expanded={controls ? selected : undefined} aria-pressed={controls ? undefined : selected} onClick={onSelect} title={name}>
        <span className="fd-dot" aria-hidden="true" />
        <span className="od-fill">
          <span className="fd-node-name">{breakable(name)}</span>
          <span className="fd-node-meta">{nodeMeta(step, elapsed)}</span>
        </span>
      </button>
      {running && <Progress progress={step.progress} />}
    </div>
  )
}

function TokenRows({ tk }) {
  const rows = [['input', tk.input], ['output', tk.output], ['cached', tk.cached], ['reasoning', tk.reasoning], ['tổng', tk.total]].filter(([, v]) => v != null)
  return (
    <dl className="fd-kv fd-tokens">
      {rows.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{fmtInt(v)}</dd></div>
      ))}
    </dl>
  )
}

/** Everything the trace knows about one step: who ran it, how long, tokens, progress and the real I/O. */
function StepDetail({ step }) {
  const tk = stepTokens(step)
  return (
    <div className="fd-detail-body">
      <dl className="fd-kv">
        <div><dt>agent</dt><dd>{step.agent ?? '–'}</dd></div>
        <div><dt>tool</dt><dd>{step.tool ?? '–'}</dd></div>
        <div><dt>loại</dt><dd>{KIND[step.kind] ?? step.kind ?? '–'}</dd></div>
        <div><dt>trạng thái</dt><dd>{STATE[step.status] ?? step.status}</dd></div>
        <div><dt>bắt đầu</dt><dd>{step.started_ms != null ? fmtSec(step.started_ms / 1000) : '–'}</dd></div>
        <div><dt>thời gian</dt><dd>{fmtSec(step.duration_s)}</dd></div>
      </dl>
      {tk ? (
        <TokenRows tk={tk} />
      ) : (
        <p className="fd-note">{step.kind === 'reasoning' ? 'Bước này có gọi AI nhưng trace chưa ghi token.' : 'Không gọi AI ở bước này.'}</p>
      )}
      {step.status === 'running' ? <Progress progress={step.progress} /> : <p className="fd-sum">{summarizeStep(step)}</p>}
      <p className="fd-io-lab">input</p>
      <pre className="studio-json">{JSON.stringify(step.input ?? null, null, 2)}</pre>
      <p className="fd-io-lab">output</p>
      <pre className="studio-json">{step.status === 'running' ? 'đang chạy…' : JSON.stringify(step.output ?? null, null, 2)}</pre>
    </div>
  )
}

function StageState({ st }) {
  const secs = stageSeconds(st)
  return <span className="fd-stage-state">{st.status === 'done' && secs ? fmtSec(secs) : STATE[st.status] ?? st.status}</span>
}

/** Narrow column (320px): stage blocks stacked, data lines between them, a step opens in place. */
function CompactFlow({ stages }) {
  const [open, setOpen] = useState(null)
  return (
    <ol className="fd fd-compact" aria-label="Luồng agent">
      {stages.map((st, i) => (
        <li key={st.id} className={`fd-stage is-${st.status}`}>
          <section className="fd-block" aria-label={st.title}>
            <header className="fd-block-head">
              <h3>{st.title}</h3>
              <StageState st={st} />
            </header>
            {st.steps.length > 0 && (
              <ol className="fd-steps">
                {st.steps.map((s, k) => {
                  const key = stepKey(s, k)
                  return (
                    <li key={key}>
                      <Node step={s} selected={open === key} controls onSelect={() => setOpen(open === key ? null : key)} />
                      {open === key && <StepDetail step={s} />}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
          {i < stages.length - 1 && <Connector label={stageHandoff(st)} state={connectorState(stages, i)} />}
        </li>
      ))}
    </ol>
  )
}

function Connector({ label, state }) {
  return (
    <div className={`fd-link is-${state}`}>
      <span className="fd-line" aria-hidden="true" />
      {label && <span className="fd-payload">{label}</span>}
    </div>
  )
}

/** Wide "Agent map": the run as a root node, an elbow branch per stage, step cards, detail panel on the right. */
function MapFlow({ stages, steps, title, running }) {
  const [sel, setSel] = useState(null)
  const all = stages.flatMap((st) => st.steps.map((s, k) => ({ key: stepKey(s, k), step: s })))
  const picked = all.find((x) => x.key === sel)?.step ?? null
  const totals = runTotals(steps)
  const videoId = steps.find((s) => s.name === 'get_video')?.output?.id
  const rootTitle = title ?? (videoId ? `Phân tích ${videoId}` : 'Lượt phân tích')
  return (
    <div className="fm">
      <div className={`fm-root${running ? ' is-running' : ''}`}>
        <span className="fd-dot" aria-hidden="true" />
        <div className="od-fill">
          <p className="fm-root-title" title={rootTitle}>{rootTitle}</p>
          <p className="fd-node-meta">
            orchestrator · {fmtSec(totals.seconds)} · {totals.tokens ? `${fmtInt(totals.tokens)} tokens` : 'chưa gọi AI'}
          </p>
        </div>
      </div>
      <ol className="fm-tree" aria-label="Agent map">
        {stages.map((st, i) => {
          const handoff = stageHandoff(st)
          const link = i < stages.length - 1 ? connectorState(stages, i) : 'idle'
          return (
            <li key={st.id} className={`fm-branch is-${st.status}`}>
              <header className="fm-branch-head">
                <h3>{st.title}</h3>
                <StageState st={st} />
                {handoff && (
                  <span className={`fm-handoff is-${link}`}>
                    <Icon name="arrow-right" />
                    {handoff}
                  </span>
                )}
              </header>
              {st.steps.length > 0 ? (
                <ol className="fm-nodes">
                  {st.steps.map((s, k) => {
                    const key = stepKey(s, k)
                    return (
                      <li key={key}>
                        <Node step={s} selected={sel === key} onSelect={() => setSel(sel === key ? null : key)} />
                      </li>
                    )
                  })}
                </ol>
              ) : (
                <p className="fd-note">{st.status === 'skipped' ? 'Bỏ qua trong lần chạy này.' : 'Chưa tới chặng này.'}</p>
              )}
            </li>
          )
        })}
      </ol>
      <aside className="fm-side" aria-label="Chi tiết bước">
        {picked ? (
          <>
            <h3 className="fm-side-title">{picked.agent ?? '–'} · {picked.name}</h3>
            <StepDetail step={picked} />
          </>
        ) : (
          <div className="fd-note">
            <p>Bấm một bước để xem agent, tool, thời gian, token và input/output thật của bước đó.</p>
            <p>Mũi tên cạnh tên chặng ghi dữ liệu chặng đó chuyển sang chặng sau.</p>
          </div>
        )}
      </aside>
    </div>
  )
}

/**
 * The agent pipeline from the trace (or the live stream). `compact` fits the 320px left column; `map` is the wide
 * "Agent map" for a popup. Data lines name what each finished stage handed on and animate while the next one runs.
 */
export function FlowDiagram({ steps, running, variant = 'compact', title }) {
  const list = steps ?? []
  const stages = groupSteps(list, running ? 'running' : 'done')
  return (
    <div className="fd-root" aria-busy={running ? 'true' : 'false'}>
      {variant === 'map' ? <MapFlow stages={stages} steps={list} title={title} running={running} /> : <CompactFlow stages={stages} />}
    </div>
  )
}

