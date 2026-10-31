import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { analysisRunReducer, initialRunState, replayEvents } from './analysis-run-reducer.js'
import { analysisQuery, streamAnalysis } from './analysis-stream.js'
import { groupSteps, stageOf, summarizeStep } from './run-stages.js'

const run = JSON.parse(readFileSync(new URL('./fixtures/shop001-vid01-run.json', import.meta.url), 'utf-8'))

const reduce = (events) => events.reduce((s, [type, data]) => analysisRunReducer(s, { type, data }), analysisRunReducer(initialRunState, { type: 'start' }))

test('reducer pairs step_started/step_finished and fills partial results', () => {
  let s = reduce([['step_started', { name: 'check_policy', kind: 'functional', agent: 'policy_guard', started_ms: 10 }]])
  assert.equal(s.steps[0].status, 'running')
  s = analysisRunReducer(s, { type: 'step_finished', data: { name: 'check_policy', status: 'ok', duration_s: 0.02, output: { targets: { tiktok_ads: { verdict: 'needs_review' } } } } })
  assert.equal(s.steps.length, 1)
  assert.equal(s.steps[0].status, 'ok')
  assert.equal(s.partial.policy.targets.tiktok_ads.verdict, 'needs_review')
  s = analysisRunReducer(s, { type: 'step_finished', data: { name: 'ask_decisions_api', status: 'skipped', output: { reason: 'x' } } })
  assert.equal(s.partial.decisions, null) // a skipped step fills nothing
})

test('replayed POST result reaches the same final state as a stream', () => {
  const s = reduce(replayEvents(run))
  assert.equal(s.status, 'done')
  assert.equal(s.result.id, run.id)
  assert.equal(s.steps.length, run.result.trace.length)
  assert.ok(s.partial.scores.conversion_potential)
})

test('error marks running steps as failed', () => {
  const s = reduce([['step_started', { name: 'extract_video_content' }], ['error', { message: '404 Video not found' }]])
  assert.equal(s.status, 'error')
  assert.equal(s.error, '404 Video not found')
  assert.equal(s.steps[0].status, 'error')
})

test('analysisQuery keeps only backend params', () => {
  assert.equal(analysisQuery({ rubric: 'v2', extract: 'auto', localize: false, foo: 1 }), 'rubric=v2&extract=auto&localize=false')
})

class FakeEventSource {
  static last = null
  constructor(url) {
    this.url = url
    this.listeners = {}
    this.closed = false
    FakeEventSource.last = this
  }
  addEventListener(type, fn) {
    ;(this.listeners[type] = this.listeners[type] ?? []).push(fn)
  }
  fire(type, data) {
    for (const fn of this.listeners[type] ?? []) fn(data === undefined ? {} : { data: JSON.stringify(data) })
  }
  close() {
    this.closed = true
  }
}

test('SSE events are forwarded and the source closes on done', () => {
  const got = []
  streamAnalysis('SHOP001-VID01', { rubric: 'v2' }, { onEvent: (t, d) => got.push([t, d]) }, { EventSource: FakeEventSource })
  const es = FakeEventSource.last
  assert.match(es.url, /^\/py\/videos\/SHOP001-VID01\/analyze\/stream\?rubric=v2/)
  es.fire('step_started', { name: 'get_video' })
  es.fire('done', { analysis: { id: 1 } })
  es.fire('error') // the connection closing after done is not an error
  assert.deepEqual(got.map(([t]) => t), ['step_started', 'done'])
  assert.equal(es.closed, true)
})

test('a stream that never opens falls back to POST and replays the trace', async () => {
  const got = []
  const fetch = async (url, opts) => {
    assert.equal(opts.method, 'POST')
    assert.match(url, /\/analyze\?/)
    return { ok: true, status: 200, text: async () => JSON.stringify(run) }
  }
  streamAnalysis('SHOP001-VID01', {}, { onEvent: (t, d) => got.push([t, d]) }, { EventSource: FakeEventSource, fetch })
  FakeEventSource.last.fire('error')
  await new Promise((r) => setImmediate(r))
  assert.equal(FakeEventSource.last.closed, true)
  assert.equal(got[0][0], 'fallback')
  assert.equal(got.at(-1)[0], 'done')
  assert.equal(got.filter(([t]) => t === 'step_finished').length, run.result.trace.length)
})

test('a server error event ends the run with its message; a mid-stream drop does not re-run', async () => {
  const got = []
  let posted = 0
  const fetch = async () => {
    posted += 1
    return { ok: false, status: 500, text: async () => '{}' }
  }
  streamAnalysis('X', {}, { onEvent: (t, d) => got.push([t, d]) }, { EventSource: FakeEventSource, fetch })
  FakeEventSource.last.fire('error', { message: 'Video X not found', status: 404 })
  assert.deepEqual(got, [['error', { message: 'Video X not found', status: 404 }]])

  got.length = 0
  streamAnalysis('Y', {}, { onEvent: (t, d) => got.push([t, d]) }, { EventSource: FakeEventSource, fetch })
  FakeEventSource.last.fire('step_started', { name: 'get_video' })
  FakeEventSource.last.fire('error')
  await new Promise((r) => setImmediate(r))
  assert.equal(posted, 0)
  assert.equal(got.at(-1)[0], 'error')
})

test('stages: 7 stages, unknown steps routed, summaries readable', () => {
  const stages = groupSteps(run.result.trace)
  assert.equal(stages.length, 7)
  assert.ok(stages.every((s) => s.status === 'done' || s.status === 'skipped'))
  assert.equal(stageOf('load_something_new'), 'gather')
  assert.match(summarizeStep({ name: 'ask_decisions_api', status: 'ok', output: { source: 'cache', questions: [{ status: 'INFERRED' }, { status: 'MISSING' }] } }), /^1 lần gọi · cache · 1\/2/)
  assert.equal(summarizeStep({ name: 'x', status: 'running' }), 'đang chạy…')
})

test('step_progress lands on the running step only and never adds a step', () => {
  let s = analysisRunReducer(initialRunState, { type: 'start' })
  s = analysisRunReducer(s, { type: 'step_started', data: { name: 'extract_video_content', started_ms: 0 } })
  s = analysisRunReducer(s, { type: 'step_progress', data: { name: 'extract_video_content', phase: 'frames', label: 'Lấy frame', done: 12, total: 38 } })
  assert.equal(s.steps.length, 1)
  assert.deepEqual([s.steps[0].progress.done, s.steps[0].progress.total], [12, 38])
  s = analysisRunReducer(s, { type: 'step_progress', data: { name: 'unknown_step', phase: 'x' } })
  assert.equal(s.steps.length, 1)
  s = analysisRunReducer(s, { type: 'step_finished', data: { name: 'extract_video_content', status: 'ok', duration_s: 40 } })
  assert.equal(s.steps[0].status, 'ok')
})
