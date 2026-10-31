// Streams one analysis run over SSE (GET /py/videos/{id}/analyze/stream). When the stream cannot be opened
// at all (endpoint missing, proxy refuses), falls back to POST /py/videos/{id}/analyze and replays the saved
// trace as the same events, so the UI has a single render path.

import { replayEvents } from './analysis-run-reducer.js'

const EVENTS = ['step_started', 'step_progress', 'step_finished', 'done']

/** Only the analysis params the backend accepts; booleans as "true"/"false". */
export function analysisQuery(params = {}) {
  const q = new URLSearchParams()
  for (const key of ['rubric', 'extract']) if (params[key]) q.set(key, params[key])
  for (const key of ['decisions', 'claims_llm', 'cross_check_agent', 'localize', 'insights', 'policy_llm', 'music']) {
    if (params[key] != null) q.set(key, params[key] ? 'true' : 'false')
  }
  return q.toString()
}

async function postAnalysis(videoId, query, fetchImpl) {
  const res = await fetchImpl(`/py/videos/${encodeURIComponent(videoId)}/analyze?${query}`, { method: 'POST' })
  const text = await res.text()
  let body = text
  try {
    body = JSON.parse(text)
  } catch {
    // plain-text error body
  }
  if (!res.ok) {
    const detail = body?.detail ?? body
    throw new Error(`${res.status} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
  }
  return body
}

/**
 * handlers.onEvent(type, data) gets step_started | step_finished | done | error | fallback.
 * Returns {close()}; closing stops listening (the server still finishes and saves the run).
 */
export function streamAnalysis(videoId, params, handlers, deps = {}) {
  const ES = deps.EventSource ?? globalThis.EventSource
  const fetchImpl = deps.fetch ?? globalThis.fetch?.bind(globalThis)
  const emit = (type, data) => handlers.onEvent(type, data)
  const query = analysisQuery(params)
  let closed = false
  let received = 0
  let finished = false
  let source = null

  const finish = () => {
    finished = true
    source?.close()
  }

  async function fallback() {
    emit('fallback', null)
    try {
      const analysis = await postAnalysis(videoId, query, fetchImpl)
      if (closed) return
      for (const [type, data] of replayEvents(analysis)) emit(type, data)
    } catch (e) {
      if (!closed) emit('error', { message: e.message })
    }
  }

  if (!ES) {
    fallback()
    return { close: () => { closed = true } }
  }

  source = new ES(`/py/videos/${encodeURIComponent(videoId)}/analyze/stream?${query}`)
  for (const type of EVENTS) {
    source.addEventListener(type, (e) => {
      if (closed || finished) return
      received += 1
      let data = null
      try {
        data = JSON.parse(e.data)
      } catch {
        data = null
      }
      if (type === 'done') finish()
      emit(type, data)
    })
  }
  // Named server event "error" carries data; a connection failure is a plain Event without data.
  source.addEventListener('error', (e) => {
    if (closed || finished) return
    if (e?.data) {
      let data = { message: String(e.data) }
      try {
        data = JSON.parse(e.data)
      } catch {
        // keep the raw text
      }
      finish()
      emit('error', data)
      return
    }
    finish() // never let EventSource auto-reconnect: a reconnect would start a second run
    if (received === 0) fallback()
    // the run keeps going on the server and is saved there: never start another one from here
    else emit('error', { lost: true, message: 'Mất kết nối stream giữa chừng. Phân tích vẫn chạy và được lưu ở server.' })
  })

  return {
    close() {
      closed = true
      source?.close()
    },
  }
}
