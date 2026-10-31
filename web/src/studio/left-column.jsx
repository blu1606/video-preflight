import { useState } from 'react'

import { fmtTime } from '../lib/timeline'
import { groupSteps, runSeconds, summarizeStep } from '../lib/run-stages'
import { FlowDiagram } from './flow-diagram'
import { Icon } from './icon'
import { questionSegments } from './studio-model'

const STEP_STATE = { running: 'đang chạy', ok: 'xong', done: 'xong', skipped: 'bỏ qua', error: 'lỗi', pending: 'chờ' }
const KIND_LABEL = { tool: 'tool', functional: 'luật', reasoning: 'AI' }

function JsonBlock({ value }) {
  return <pre className="studio-json">{JSON.stringify(value ?? null, null, 2)}</pre>
}

/** One trace step: agent, tool, status, time and its one-line result; opens to its real input/output. */
function StepRow({ step }) {
  const [open, setOpen] = useState(false)
  return (
    <li className={`studio-step is-${step.status}`}>
      <button type="button" className="studio-step-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="stage-ic">
          {step.status === 'running' ? <span className="spin" /> : <Icon name={step.status === 'error' ? 'danger' : step.status === 'skipped' ? 'arrow-right-2' : 'tick-circle'} />}
        </span>
        <span className="od-fill">
          <span className="studio-step-name">{step.name}</span>
          <span className="tiny muted studio-step-meta">
            {step.agent} · {KIND_LABEL[step.kind] ?? step.kind}
            {step.tool ? ` · ${step.tool}` : ''}
          </span>
          {step.status !== 'running' && <span className="tiny studio-step-sum">{summarizeStep(step)}</span>}
        </span>
        <span className="tiny studio-step-time">{step.duration_s != null ? `${step.duration_s.toFixed(2)}s` : STEP_STATE[step.status]}</span>
      </button>
      {open && (
        <div className="studio-step-io">
          <p className="tiny muted">input</p>
          <JsonBlock value={step.input} />
          <p className="tiny muted">output</p>
          <JsonBlock value={step.output} />
        </div>
      )}
    </li>
  )
}

/** The agent pipeline: 7 stages, each with its real trace steps (live while streaming). */
export function AgentFlow({ steps, running }) {
  const stages = groupSteps(steps, running ? 'running' : 'done')
  return (
    <ol className="studio-flow" aria-live="polite" aria-label="Các bước agent">
      {stages.map((st) => (
        <li key={st.id} className={`studio-stage is-${st.status}`}>
          <p className="studio-stage-head">
            <span className="studio-stage-title">{st.title}</span>
            <span className="tiny muted">{STEP_STATE[st.status] ?? st.status}</span>
          </p>
          {st.steps.length > 0 && (
            <ol className="studio-steps">
              {st.steps.map((s, i) => <StepRow key={`${s.name}-${i}`} step={s} />)}
            </ol>
          )}
        </li>
      ))}
    </ol>
  )
}

function QuestionRow({ row, onSeek, onOpen, selected }) {
  const cls = row.state === 'bad' ? 'is-bad' : row.state === 'ok' ? 'is-ok' : ''
  return (
    <li className={`q${row.state === 'bad' ? ' is-issue' : ''}${row.state === 'miss' ? ' is-miss' : ''}${selected ? ' is-sel' : ''}`}>
      {row.state === 'miss' ? (
        <>
          <button type="button" className="studio-q-btn q-text" onClick={() => onOpen(row)}>{row.label}</button>
          <p className="q-miss"><span className="hatch-chip">Chưa chấm</span></p>
          {row.reason && <p className="tiny muted">{row.reason}</p>}
        </>
      ) : (
        <>
          <p className={`q-ans ${cls}`}>
            <span className="ans-ic"><Icon name={row.state === 'ok' ? 'tick-circle' : 'danger'} /></span>
            <button type="button" className={`studio-q-btn od-fill ${row.state === 'bad' ? 'q-find' : 'q-text'}`} onClick={() => onOpen(row)}>
              {row.label}
            </button>
            <span className="studio-q-score">{Math.round(row.value)}</span>
          </p>
          <p className="q-meta">
            {row.t != null && (
              <button type="button" className="chip-t" onClick={() => onSeek(row.t)} aria-label={`Phát từ ${fmtTime(row.t)}`}>
                {fmtTime(row.t)}
              </button>
            )}
            <span className="q-dim">{row.groupLabel}</span>
            <span className="q-conf tiny">{row.id}</span>
          </p>
        </>
      )}
    </li>
  )
}

/**
 * Left column. While a run streams: the agent flow. After it: the Decisions questions grouped by where they
 * sit in the video (Cần sửa / Tất cả), with the agent flow one tab away.
 */
export function LeftColumn({ running, steps, result, duration, onSeek, onOpenQuestion, selectedId, onCollapse, onOpenMap }) {
  const [view, setView] = useState('questions')
  const [filter, setFilter] = useState('issues')
  const [closed, setClosed] = useState({})
  const segments = result ? questionSegments(result, duration) : []
  const total = segments.reduce((a, s) => a + s.items.length, 0)
  const issues = segments.reduce((a, s) => a + s.issues, 0)
  const showFlow = running || !result || view === 'flow'

  return (
    <aside className="col col-left studio-left" aria-label="Câu hỏi chấm và agent">
      <div className="col-head">
        <h2>{showFlow && !result ? 'Agent đang chạy' : 'Câu hỏi'}</h2>
        {result && !running && (
          <div className="seg-switch" role="group" aria-label="Xem">
            <button type="button" aria-pressed={view === 'questions'} onClick={() => setView('questions')}>Câu hỏi</button>
            <button type="button" aria-pressed={view === 'flow'} onClick={() => setView('flow')}>Agent</button>
          </div>
        )}
        {steps.length > 0 && (
          <button type="button" className="btn btn-sm btn-ghost studio-map-btn" onClick={onOpenMap}>
            <Icon name="layer" /> Agent map
          </button>
        )}
        <button type="button" className="btn-ghost-ic" onClick={onCollapse} aria-label="Thu gọn cột" title="Thu gọn">
          <Icon name="sidebar-left" />
        </button>
      </div>

      {showFlow ? (
        steps.length ? (
          <FlowDiagram steps={steps} running={running} variant="compact" />
        ) : (
          <p className="studio-empty tiny muted">Chưa chạy. Dựng bài đăng bằng thanh công cụ cạnh điện thoại rồi bấm Phân tích.</p>
        )
      ) : (
        <>
          <div className="rb-tabs studio-filter" role="group" aria-label="Lọc câu hỏi">
            <button type="button" className="rb-tab" aria-pressed={filter === 'issues'} onClick={() => setFilter('issues')}>
              Cần sửa <span className="rb-n">{issues}</span>
            </button>
            <button type="button" className="rb-tab" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              Tất cả <span className="rb-n">{total}</span>
            </button>
          </div>
          {total > 0 && segments.every((s) => s.items.every((r) => r.state === 'miss')) && (
            <p className="studio-empty pn-note">
              Lần chạy này chưa có câu trả lời Decisions nên 28 tiêu chí phán đoán chưa được chấm (không tính 0). Bật "Gọi Decisions API" trong
              tuỳ chọn (có tính phí, khoảng 10k token) rồi chạy lại.
            </p>
          )}
          {filter === 'issues' && issues === 0 && segments.some((s) => s.items.some((r) => r.state !== 'miss')) && (
            <p className="studio-empty tiny muted">Không có câu nào dưới 50 điểm.</p>
          )}
          <ol className="grp-list">
            {segments.map((s) => {
              const items = filter === 'issues' ? s.items.filter((r) => r.state === 'bad') : s.items
              if (!items.length) return null
              const open = !closed[s.id]
              return (
                <li key={s.id} className={`grp grp-time${open ? ' is-open' : ''}`}>
                  <div className="grp-head">
                    <button type="button" className="grp-toggle" aria-expanded={open} onClick={() => setClosed({ ...closed, [s.id]: open })}>
                      <span className="caret"><Icon name={open ? 'arrow-down-1' : 'arrow-right-2'} /></span>
                      <span className="grp-name">{s.label}</span>
                      {s.issues ? <span className="grp-issues">{s.issues} cần sửa</span> : <span className="grp-ok">đạt hết</span>}
                    </button>
                  </div>
                  {open && (
                    <ol className="q-list">
                      {items.map((r) => (
                        <QuestionRow key={r.id} row={r} onSeek={onSeek} onOpen={onOpenQuestion} selected={r.id === selectedId} />
                      ))}
                    </ol>
                  )}
                </li>
              )
            })}
          </ol>
        </>
      )}
      <div className="col-foot">
        <span>{running ? 'Đang chạy' : result ? 'Hoàn tất' : 'Chưa chạy'}{steps.length ? ` · ${steps.length} bước · ${runSeconds(steps).toFixed(1)}s` : ''}</span>
      </div>
    </aside>
  )
}
