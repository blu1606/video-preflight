import assert from 'node:assert/strict'
import { test } from 'node:test'

import { groupSteps } from '../lib/run-stages.js'
import {
  answerText,
  answerTone,
  chipStatus,
  connectorState,
  decisionRows,
  decisionsCall,
  frameMarks,
  keyframeSecs,
  progressView,
  questionCountLabel,
  questionCounts,
  questionKeyframes,
  rowOf,
  runTotals,
  stageHandoff,
  stepTokens,
  transcriptSegments,
} from './flow-model.js'

const score = (id, group, domain, value, extra = {}) => ({ id, group, domain, type: 'score', status: value == null ? 'MISSING' : 'INFERRED', value, inputs: [], required_features: [], ...extra })

const result = {
  features: {
    'video.hook_verbal': { status: 'REAL', value: 'x', evidence: ['00:00-00:03'] },
    'shop.rating': { status: 'MOCK', value: 4.9, evidence: [] },
    'video.transcript_segments': { status: 'REAL', value: [{ start: 0, end: 2, text: 'xin chào' }] },
  },
  scores: [{ name: 'viral_potential', score: 45.7, coverage: 1 }],
  decisions: {
    calls: [{ model: 'gpt-x', usage: { input_tokens: 11949, input_tokens_details: { cached_tokens: 0 } }, questions: ['V01', 'P02'] }],
    questions: [
      score('V01', 'viral_potential', 'viral', 64, { inputs: ['video.hook_verbal'], required_features: ['video.hook'] }),
      score('H01', 'shop_health', 'shop', null, { required_features: ['shop.rating'] }),
      { id: 'P02', domain: 'policy', type: 'predicate', status: 'INFERRED', value: 0.13, inputs: [] },
      { id: 'M01', domain: 'sku', type: 'choice', status: 'INFERRED', value: 'unknown', inputs: [] },
    ],
  },
  markers: [{ kind: 'issue', t_start: 4, title: 'Hook chung chung' }, { kind: 'cut', t_start: 9 }],
}
const frames = { frames: [0, 1, 2, 3, 4, 5].map((sec) => ({ sec, url: `/py/frames/v/${sec}.jpg` })) }

test('rows: score by group, policy by domain, choices are meta', () => {
  assert.equal(rowOf(result.decisions.questions[0]), 'viral')
  assert.equal(rowOf(result.decisions.questions[2]), 'policy')
  assert.equal(rowOf(result.decisions.questions[3]), 'meta')
  const rows = decisionRows(result)
  assert.deepEqual(rows.map((r) => r.id), ['viral', 'shop', 'policy', 'meta'])
  assert.deepEqual(rows[0].chips, [{ name: 'video.hook_verbal', status: 'REAL' }, { name: 'video.hook', status: 'MISSING' }])
  assert.deepEqual(rows[0].score, { score: 45.7, coverage: 1 })
  assert.equal(rows[1].score, null) // no shop_health score in this result: not 0
})

test('answers: score, predicate %, choice label, dash when missing', () => {
  const [v, h, p, m] = result.decisions.questions
  assert.equal(answerText(v), '64')
  assert.equal(answerText(h), '–')
  assert.equal(answerText(p), '13%')
  assert.equal(answerText(m), 'unknown')
  assert.equal(answerTone(v), 'ok')
  assert.equal(answerTone(h), 'missing')
  assert.equal(answerTone({ ...v, value: 30 }), 'bad')
  assert.equal(chipStatus('keyframes:hook', {}), 'REAL')
})

test('call header reads the single batch call', () => {
  assert.deepEqual(decisionsCall(result), { model: 'gpt-x', inputTokens: 11949, cachedTokens: 0, questionCount: 2 })
  assert.equal(decisionsCall({}), null)
})

test('keyframes: recorded batch grouped by segment, fallback on 1-fps frames, none on old runs', () => {
  const q = result.decisions.questions[0]
  assert.equal(questionKeyframes(q, result, frames).state, 'none')
  const fb = questionKeyframes({ ...q, keyframes_used: [2.2] }, result, frames)
  assert.equal(fb.state, 'fallback')
  assert.equal(fb.items[0].url, '/py/frames/v/2.jpg')
  const rec = {
    ...result,
    decisions: { ...result.decisions, keyframes_scope: 'batch', keyframes: [{ sec: 4.5, url: '/k/cta_4.5.jpg', segment: 'cta' }, { sec: 0.5, url: '/k/hook_0.5.jpg', segment: 'hook' }] },
  }
  const r = questionKeyframes({ ...q, keyframes_used: [0.5, 4.5] }, rec, frames)
  assert.equal(r.state, 'recorded')
  assert.equal(r.scope, 'batch')
  assert.deepEqual(r.groups.map((g) => g.id), ['hook', 'cta'])
  assert.deepEqual([...keyframeSecs(rec, frames)].sort(), [0, 4])
})

test('question counts split score questions from policy / choice ones, like the radar and the left list', () => {
  const qs = [
    score('V01', 'viral_potential', 'viral', 80),
    score('V02', 'viral_potential', 'viral', null),
    { id: 'P01', type: 'predicate', domain: 'policy', value: 0.2, status: 'INFERRED' },
    { id: 'M01', type: 'choice', domain: 'meta', value: null, status: 'MISSING' },
  ]
  assert.deepEqual(questionCounts(qs), { score: 2, scoreAnswered: 1, other: 2, otherAnswered: 1 })
  assert.equal(questionCountLabel(qs), '1/2 câu chấm điểm có trả lời · +2 câu policy/phân loại (1 có trả lời)')
  assert.equal(questionCountLabel(qs.slice(0, 3).map((q) => ({ ...q, value: q.value ?? 50, status: 'INFERRED' }))), '2/2 câu chấm điểm có trả lời · +1 câu policy/phân loại')
  assert.equal(questionCountLabel(null), '0/0 câu chấm điểm có trả lời')
})

test('scoring handoff rounds the overall score like the right column', () => {
  const stages = groupSteps([{ name: 'compose_overall', status: 'ok', output: { score: 45.6, label_vi: 'Cần sửa' } }], 'done')
  const st = stages.find((s) => s.id === 'scoring')
  assert.equal(stageHandoff(st), 'điểm 46 · Cần sửa')
})

test('frame marks collect evidence and markers, skip cuts', () => {
  const marks = frameMarks(result, frames)
  assert.deepEqual(marks.get(0), ['video.hook_verbal'])
  assert.deepEqual(marks.get(4), ['Hook chung chung'])
  assert.equal(marks.has(9), false)
  assert.equal(transcriptSegments(result).length, 1)
})

test('flow: handoff labels, connector state and progress', () => {
  const steps = [
    { name: 'get_video', status: 'ok', output: { id: 'VID03' } },
    { name: 'get_shop', status: 'ok', output: { shop_name: 'Shop A' } },
    { name: 'load_video_features', status: 'ok', output: { a: { status: 'REAL' }, b: { status: 'REAL' }, c: { status: 'MOCK' } } },
    // main.py order: Decisions answers first, the policy check reads them after
    { name: 'ask_decisions_api', status: 'ok', output: { questions: [{ value: 0.8 }, { value: null, status: 'MISSING' }] } },
    { name: 'check_policy', status: 'running', progress: { label: 'đang rà rule', done: null, total: null } },
  ]
  const stages = groupSteps(steps, 'running')
  assert.deepEqual(stages.slice(0, 4).map((s) => s.id), ['request', 'gather', 'decisions', 'checks'])
  assert.equal(stageHandoff(stages[0]), 'VID03 · Shop A')
  assert.equal(stageHandoff(stages[1]), '3 features: 2 REAL · 1 nội bộ')
  assert.equal(stageHandoff(stages[2]), '1/2 câu chấm điểm có trả lời')
  assert.equal(stageHandoff(stages[3]), null) // still running
  const policyDone = groupSteps([...steps.slice(0, 4), { name: 'check_policy', status: 'ok', output: { targets: { t: { findings: [{ rule_id: 'R1', outcome: 'needs_review' }, { rule_id: 'R2', outcome: 'not_triggered' }] } } } }], 'done')
  assert.equal(stageHandoff(policyDone[3]), '1 rule cần xem lại')
  assert.equal(connectorState(stages, 2), 'flowing')
  assert.equal(connectorState(stages, 0), 'done')
  assert.equal(connectorState(stages, 4), 'idle')
  assert.deepEqual(progressView({ label: 'frames', done: 12, total: 28 }), { label: 'frames', detail: null, pct: 43, count: '12/28' })
  assert.equal(progressView({ phase: 'vlm', done: null, total: null }).pct, null)
  assert.equal(progressView(null), null)
})

test('tokens: normalized field first, then provider usage shapes, null without an AI call', () => {
  assert.deepEqual(stepTokens({ tokens: { input: 10, output: 5, total: 15 } }), { input: 10, output: 5, total: 15, cached: null, reasoning: null })
  assert.equal(stepTokens({ output: { token_usage: { prompt_tokens: 1899, completion_tokens: 848 } } }).total, 2747)
  const dec = stepTokens({ output: { calls: [{ usage: { input_tokens: 11949, output_tokens: 0, total_tokens: 11949, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } }] } })
  assert.deepEqual(dec, { input: 11949, output: 0, total: 11949, cached: 0, reasoning: 0 })
  assert.equal(stepTokens({ output: { reviewer: { token_usage: { prompt_tokens: 3, completion_tokens: 2 } } } }).total, 5)
  assert.equal(stepTokens({ output: { id: 'x' } }), null)
  assert.deepEqual(
    runTotals([{ started_ms: 0, duration_s: 2, tokens: { total: 7 } }, { started_ms: 1500, duration_s: 1 }]),
    { seconds: 2.5, tokens: 7 },
  )
})
