import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

import { dimensionLabel, levelPlain, QUESTION_PLAIN } from '../lib/labels'
import { fmtTime, parseTimestamp } from '../lib/timeline'
import {
  answerText,
  answerTone,
  crossCheckById,
  decisionRows,
  decisionsCall,
  frameList,
  frameMarks,
  isAnswered,
  keyframeSecs,
  questionFeatureNames,
  questionKeyframes,
  showValue,
  transcriptSegments,
} from './flow-model'
import { Icon } from './icon'
import { sourceLabel } from '../lib/labels'
import { answerLevels, questionFeatures } from './studio-model'
import './dialog.css'

const STATUS_HINT = {
  REAL: 'dữ liệu thật',
  INFERRED: 'suy ra từ dữ liệu thật',
  MOCK: 'dữ liệu shop nội bộ',
  MISSING: 'chưa có',
}
const TYPE_LABEL = { score: 'score 0-100', predicate: 'predicate (xác suất có)', choice: 'choice' }
const VERDICT = { conflict: 'mâu thuẫn', agree: 'đồng ý', unverified: 'chưa kiểm chứng' }
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
const fmtInt = (n) => (n == null ? '–' : Number(n).toLocaleString('vi-VN'))

function StatusTag({ status }) {
  return <span className={`dd-status is-${String(status).toLowerCase()}`} title={STATUS_HINT[status]}>{sourceLabel(status)}</span>
}

function Seek({ sec, onSeek, children }) {
  return (
    <button type="button" className="chip-t" onClick={() => onSeek?.(sec)} aria-label={`Tua tới ${fmtTime(sec)}`}>
      {children ?? fmtTime(sec)}
    </button>
  )
}

/** One evidence line: a leading "MM:SS" becomes a seek button, the rest stays text. */
function Evidence({ text, onSeek }) {
  const t = parseTimestamp(text)
  if (!t) return <li>{text}</li>
  const rest = String(text).replace(/^\s*\d{1,2}:\d{2}(?:\s*[-–]\s*\d{1,2}:\d{2})?/, '').trim()
  return (
    <li>
      <Seek sec={t.start} onSeek={onSeek}>{t.end != null ? `${fmtTime(t.start)}–${fmtTime(t.end)}` : fmtTime(t.start)}</Seek>
      {rest && <span>{rest}</span>}
    </li>
  )
}

function Tile({ q, check, selected, onSelect, tileRef }) {
  const tone = answerTone(q)
  return (
    <button
      type="button"
      ref={tileRef}
      className={`dd-tile is-${tone}${selected ? ' is-sel' : ''}`}
      aria-pressed={selected}
      onClick={() => onSelect(q.id)}
      title={QUESTION_PLAIN[q.dimension] ?? q.instructions}
    >
      <span className="dd-tile-top">
        <span className="dd-qid">{q.id}</span>
        {check?.verdict === 'conflict' && <span className="dd-check is-conflict" title="Rule hoặc agent không đồng ý"><Icon name="danger" /></span>}
        {check?.verdict === 'agree' && <span className="dd-check is-agree" title="Rule hoặc agent đồng ý"><Icon name="tick-circle" /></span>}
        <span className="dd-tile-val">{answerText(q)}</span>
      </span>
      <span className="dd-tile-name">{dimensionLabel(q.dimension, q.id)}</span>
    </button>
  )
}

function LevelBars({ q }) {
  const probs = q.answer?.probabilities ?? []
  if (!probs.length) return null
  if (q.type === 'score') {
    const { levels, best } = answerLevels(q)
    return (
      <ol className="dd-levels">
        {levels.map((l) => (
          <li key={l.label} className={best?.label === l.label ? 'is-best' : ''}>
            <span className="dd-level-name">{levelPlain(l.label)}</span>
            <span className="dd-level-bar"><span style={{ width: `${(l.probability ?? 0) * 100}%` }} /></span>
            <span className="dd-level-p">{l.probability == null ? '–' : `${Math.round(l.probability * 100)}%`}</span>
            <span className="dd-level-desc">{l.description}</span>
          </li>
        ))}
      </ol>
    )
  }
  const top = Math.max(...probs.map((p) => p.probability))
  return (
    <ol className="dd-levels">
      {probs.map((p) => (
        <li key={p.label} className={p.probability === top ? 'is-best' : ''}>
          <span className="dd-level-name">{p.label}</span>
          <span className="dd-level-bar"><span style={{ width: `${p.probability * 100}%` }} /></span>
          <span className="dd-level-p">{Math.round(p.probability * 100)}%</span>
        </li>
      ))}
    </ol>
  )
}

function Keyframes({ q, result, frames, onSeek }) {
  const kf = questionKeyframes(q, result, frames)
  if (kf.state === 'none') {
    return <p className="dd-note">Lần chạy này chưa ghi keyframe đã gửi cho Decisions API.</p>
  }
  return (
    <>
      <p className="dd-note">
        {kf.state === 'fallback'
          ? 'Lần chạy này chỉ ghi mốc giây; ảnh dưới đây là frame 1 giây gần nhất, không phải đúng file đã gửi.'
          : kf.scope === 'batch'
            ? 'Một lần gọi batch: mọi câu được trả lời đều nhận cùng bộ keyframe này.'
            : 'Keyframe gửi kèm câu này.'}
        {' '}Bấm ảnh để tua video.
      </p>
      <div className="dd-kf-groups">
        {kf.groups.map((g) => (
          <div key={g.id} className="dd-kf-group">
            <p className="dd-kf-lab">{g.label}</p>
            <div className="dd-kf-row">
              {g.items.map((k) => (
                <button key={`${k.url}-${k.sec}`} type="button" className="dd-thumb" onClick={() => onSeek?.(k.sec)} aria-label={`${g.label} ${fmtTime(k.sec)}, tua tới đây`}>
                  <img src={k.url} alt="" loading="lazy" />
                  <span>{fmtTime(k.sec)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function QuestionDetail({ q, result, frames, check, onSeek }) {
  const plain = QUESTION_PLAIN[q.dimension]
  const feats = questionFeatures(q, result)
  const conf = q.answer?.confidence
  return (
    <article className="dd-detail" aria-label={`Chi tiết ${q.id}`}>
      <header className="dd-detail-head">
        <div className="od-fill">
          <p className="dd-detail-id">
            <span className="dd-qid">{q.id}</span>
            <span className="chip chip-neutral">{TYPE_LABEL[q.type] ?? q.type}</span>
          </p>
          <h3>{dimensionLabel(q.dimension, q.id)}</h3>
        </div>
        <p className={`dd-detail-val is-${answerTone(q)}`}>
          {answerText(q)}
          {q.type === 'score' && isAnswered(q) && <span>/100</span>}
        </p>
      </header>
      {plain && <p className="dd-plain">{plain}</p>}
      <div className="dd-source">
        <span className="dd-source-lab">nguyên văn</span>
        <p lang="en">{q.instructions}</p>
      </div>

      {isAnswered(q) ? (
        <>
          <p className="dd-facts">
            {conf != null && <span>confidence <b>{conf.toFixed(2)}</b></span>}
            {q.weight != null && <span>trọng số <b>{q.weight}</b></span>}
          </p>
          <LevelBars q={q} />
          {q.type === 'score' && (
            <p className="dd-note">Điểm 0-100 = level kỳ vọng (Σ level × xác suất) chia level cao nhất. Đây là mức rubric, không phải xác suất bán được.</p>
          )}
        </>
      ) : (
        <p className="dd-missing">Không chấm câu này{q.reason ? `: ${q.reason}` : ''}. Không tính là 0.</p>
      )}

      {check && (
        <section className={`dd-cross is-${check.verdict}`}>
          <h4>Đối chiếu chéo: {VERDICT[check.verdict] ?? check.verdict}</h4>
          <p>
            Decisions <b>{check.decision_score ?? '–'}</b> · Rule <b>{check.rule?.score ?? '–'}</b> · Agent{' '}
            <b>{check.agent?.score ?? check.agent?.status ?? '–'}</b>
          </p>
          {check.agent?.rationale && <p className="dd-cross-why">{check.agent.rationale}</p>}
        </section>
      )}

      <section className="dd-sec">
        <h4>Dữ liệu đầu vào ({feats.filter((f) => f.sent).length} đã gửi / {feats.length})</h4>
        <ul className="dd-inputs">
          {feats.map((f) => {
            const v = showValue(f.value)
            return (
              <li key={f.name} className={f.sent ? '' : 'is-unsent'}>
                <p className="dd-input-head">
                  <span className="dd-fname">{f.name}</span>
                  <StatusTag status={f.status} />
                  {!f.sent && <span className="dd-unsent">không gửi</span>}
                </p>
                <p className="dd-input-val" title={v.full}>{f.name.startsWith('keyframes:') ? 'ảnh keyframe' : v.text}</p>
                {f.source && <p className="dd-input-src">nguồn: {f.source}</p>}
                {f.evidence.length > 0 && (
                  <ul className="dd-evidence">
                    {f.evidence.map((e, i) => <Evidence key={i} text={e} onSeek={onSeek} />)}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="dd-sec">
        <h4>Keyframe đã gửi cho AI</h4>
        <Keyframes q={q} result={result} frames={frames} onSeek={onSeek} />
      </section>
    </article>
  )
}

function MapView({ result, frames, selected, onSelect, onSeek }) {
  const rows = useMemo(() => decisionRows(result), [result])
  const checks = useMemo(() => crossCheckById(result), [result])
  const tiles = useRef(new Map())
  const order = rows.flatMap((r) => r.questions.map((q) => q.id))
  const active = rows.flatMap((r) => r.questions).find((q) => q.id === selected) ?? null
  const lit = active ? new Set(questionFeatureNames(active)) : null

  useEffect(() => {
    if (selected) tiles.current.get(selected)?.scrollIntoView?.({ block: 'nearest' })
  }, [selected])

  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (!step || !(e.target instanceof HTMLElement) || !e.target.classList.contains('dd-tile')) return
    e.preventDefault()
    const i = order.indexOf(selected ?? e.target.querySelector('.dd-qid')?.textContent)
    const next = order[Math.max(0, Math.min(order.length - 1, (i < 0 ? 0 : i + step)))]
    onSelect(next)
    tiles.current.get(next)?.focus()
  }

  if (!rows.length) return <p className="dd-empty">Không có câu hỏi Decisions trong lần chạy này.</p>
  return (
    <div className="dd-split">
      <div className="dd-map" onKeyDown={onKeyDown}>
        <div className="dd-map-legend" aria-hidden="true">
          <span>Dữ liệu schema</span>
          <span>Câu hỏi Decisions</span>
          <span>Điểm nhóm</span>
        </div>
        {rows.map((row) => (
          <section key={row.id} className={`dd-row${active && row.questions.includes(active) ? ' is-active' : ''}`} aria-label={row.title}>
            <div className="dd-chips">
              {row.chips.length ? row.chips.map((c) => (
                <span
                  key={c.name}
                  className={`dd-chip is-${c.status.toLowerCase()}${lit ? (lit.has(c.name) ? ' is-lit' : ' is-dim') : ''}`}
                  title={`${c.name} · ${c.status}: ${showValue(result?.features?.[c.name]?.value, 120).text}`}
                >
                  {c.name}
                </span>
              )) : <span className="dd-note">chưa có dữ liệu đầu vào</span>}
            </div>
            <span className="dd-arrow"><Icon name="arrow-right" /></span>
            <div className="dd-qs">
              <h3 className="dd-row-title">{row.title}</h3>
              <div className="dd-tiles">
                {row.questions.map((q) => (
                  <Tile
                    key={q.id}
                    q={q}
                    check={checks[q.id]}
                    selected={q.id === selected}
                    onSelect={(id) => onSelect(id === selected ? null : id)}
                    tileRef={(el) => (el ? tiles.current.set(q.id, el) : tiles.current.delete(q.id))}
                  />
                ))}
              </div>
            </div>
            <span className="dd-arrow"><Icon name="arrow-right" /></span>
            <div className={`dd-score${row.score?.score != null ? (row.score.score >= 50 ? ' is-ok' : ' is-bad') : ''}`}>
              {row.score ? (
                <>
                  <strong>{row.score.score == null ? '–' : Math.round(row.score.score)}</strong>
                  <span>coverage {row.score.coverage == null ? '–' : `${Math.round(row.score.coverage * 100)}%`}</span>
                </>
              ) : (
                <span>không tính điểm{row.group ? '' : ' (choice)'}</span>
              )}
            </div>
          </section>
        ))}
      </div>
      <div className="dd-side">
        {active ? (
          <QuestionDetail q={active} result={result} frames={frames} check={checks[active.id]} onSeek={onSeek} />
        ) : (
          <div className="dd-hint">
            <h3>Đọc sơ đồ thế nào</h3>
            <p>Mỗi hàng: các khối dữ liệu schema (màu theo nguồn dữ liệu) đi vào các câu hỏi Decisions, câu trả lời gộp thành điểm nhóm.</p>
            <p>Bấm một câu để sáng các schema nó dùng, xem xác suất từng level, giá trị từng input và keyframe đã gửi cho AI. Phím mũi tên chuyển giữa các câu.</p>
            <p>Ô viền đứt là câu chưa chấm. Biểu tượng cảnh báo: rule hoặc agent đối chiếu không đồng ý.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function VideoView({ result, frames, onSeek }) {
  const list = frameList(frames)
  const marks = useMemo(() => frameMarks(result, frames), [result, frames])
  const sent = useMemo(() => keyframeSecs(result, frames), [result, frames])
  const segs = transcriptSegments(result)
  const [focus, setFocus] = useState(null)
  const focusLabels = focus != null ? marks.get(Math.round(focus)) ?? [] : []
  return (
    <div className="dd-split">
      <div className="dd-video">
        <p className="dd-note">
          Video lấy mẫu 1 frame/giây cho VLM. Viền cam: frame có evidence hoặc marker; nhãn Decisions: gần keyframe đã gửi cho Decisions API. Bấm frame để tua.
        </p>
        {list.length ? (
          <div className="dd-grid">
            {list.map((f) => {
              const key = Math.round(f.sec)
              const labels = marks.get(key)
              return (
                <button
                  key={f.url}
                  type="button"
                  className={`dd-frame${labels ? ' is-marked' : ''}${focus === f.sec ? ' is-sel' : ''}`}
                  onClick={() => {
                    setFocus(f.sec)
                    onSeek?.(f.sec)
                  }}
                  title={labels?.join('\n')}
                  aria-label={`Frame ${fmtTime(f.sec)}${labels ? `, ${labels.length} mốc` : ''}`}
                >
                  <img src={f.url} alt="" loading="lazy" />
                  <span className="dd-frame-t">{fmtTime(f.sec)}</span>
                  {sent.has(key) && <span className="dd-frame-tag">Decisions</span>}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="dd-empty">Chưa có frame cho video này (chưa trích xuất).</p>
        )}
      </div>
      <div className="dd-side">
        {focus != null && (
          <section className="dd-sec">
            <h4>Mốc {fmtTime(focus)}</h4>
            {focusLabels.length ? (
              <ul className="dd-marks">{focusLabels.map((l) => <li key={l}>{l}</li>)}</ul>
            ) : (
              <p className="dd-note">Không có evidence hay marker nào trỏ vào giây này.</p>
            )}
          </section>
        )}
        <section className="dd-sec">
          <h4>Lời thoại (Whisper)</h4>
          {segs.length ? (
            <ol className="dd-transcript">
              {segs.map((s) => (
                <li key={`${s.start}-${s.text.slice(0, 12)}`}>
                  <Seek sec={s.start} onSeek={onSeek} />
                  <span>{s.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="dd-note">Lần chạy này không có lời thoại theo mốc giờ.</p>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * Decisions API map as a modal: schema evidence -> questions -> group score, one row per question family, with
 * a detail panel (levels, inputs, keyframes) and an "AI xem video" tab (1-fps frames + transcript).
 */
export function DecisionsDialog({ open, onClose, result, frames, initialQuestionId, onSeek }) {
  const [selected, setSelected] = useState(initialQuestionId ?? null)
  const [tab, setTab] = useState('map')
  const [seed, setSeed] = useState({ open, initialQuestionId })
  if (seed.open !== open || seed.initialQuestionId !== initialQuestionId) {
    setSeed({ open, initialQuestionId })
    if (open) {
      setSelected(initialQuestionId ?? null)
      setTab('map')
    }
  }

  const dialog = useRef(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  // focus in on open, trapped while open, back to the opener on close
  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    dialog.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !dialog.current) return
      const items = [...dialog.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [open])

  if (!open) return null
  const call = decisionsCall(result)
  const nQuestions = result?.decisions?.questions?.length ?? 0
  const nFrames = frameList(frames).length
  const seek = (sec) => onSeek?.(sec)

  return (
    <div className="deep-modal dd-modal">
      <div className="deep-scrim" onClick={onClose} aria-hidden="true" />
      <div className="deep-dialog dd-dialog" role="dialog" aria-modal="true" aria-labelledby="dd-title" tabIndex={-1} ref={dialog}>
        <header className="deep-head dd-head">
          <div className="od-fill">
            <h2 id="dd-title">Decisions API: câu hỏi và câu trả lời</h2>
            <p className="dd-sub">
              {call ? (
                <>
                  {call.model ?? 'model không rõ'} · {fmtInt(call.inputTokens)} input token
                  {call.cachedTokens ? ` (${fmtInt(call.cachedTokens)} cached)` : ''} · 1 lần gọi batch cho mọi câu
                  {call.questionCount ? ` (gửi ${call.questionCount}/${nQuestions} câu${call.questionCount < nQuestions ? '; câu còn lại không nằm trong lần gọi này' : ''})` : ''}. Hiện từng câu chỉ là cách trình bày câu trả lời của lần gọi đó.
                </>
              ) : (
                'Lần chạy này không gọi Decisions API (không có call nào được ghi).'
              )}
            </p>
          </div>
          <p className="dd-legend" aria-label="Chú giải nguồn dữ liệu">
            {['REAL', 'INFERRED', 'MOCK', 'MISSING'].map((s) => (
              <Fragment key={s}><StatusTag status={s} /></Fragment>
            ))}
          </p>
          <button type="button" className="btn-ghost-ic" onClick={onClose} aria-label="Đóng">
            <Icon name="close" />
          </button>
        </header>
        <div className="rb-tabs dd-tabs" role="group" aria-label="Chế độ xem">
          <button type="button" className="rb-tab" aria-pressed={tab === 'map'} onClick={() => setTab('map')}>
            Sơ đồ câu hỏi <span>{result?.decisions?.questions?.length ?? 0}</span>
          </button>
          <button type="button" className="rb-tab" aria-pressed={tab === 'video'} onClick={() => setTab('video')}>
            AI xem video <span>{nFrames}</span>
          </button>
        </div>
        <div className="dd-body">
          {tab === 'map' ? (
            <MapView result={result} frames={frames} selected={selected} onSelect={setSelected} onSeek={seek} />
          ) : (
            <VideoView result={result} frames={frames} onSeek={seek} />
          )}
        </div>
      </div>
    </div>
  )
}
