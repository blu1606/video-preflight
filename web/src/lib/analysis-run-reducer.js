// State of one analysis run fed by stream events (SSE, or a POST result replayed in the same shape).
// step_started -> step_finished pairs build the step list; some finished steps fill the partial result
// (policy after check_policy, Decisions after ask_decisions_api, scores after score_rubric).

export const initialRunState = {
  status: 'idle', // idle | running | done | error
  source: null, // sse | replay
  steps: [],
  partial: { policy: null, decisions: null, scores: null },
  result: null, // the saved analysis record {id, kind, targetId, result, ...}
  error: null,
  lost: false, // the stream dropped mid-run: the server still finishes and saves it
}

const PARTIAL_OF = { check_policy: 'policy', ask_decisions_api: 'decisions', score_rubric: 'scores' }

export function analysisRunReducer(state, action) {
  switch (action.type) {
    case 'start':
      return { ...initialRunState, status: 'running', source: 'sse' }
    case 'fallback':
      return { ...state, source: 'replay' }
    case 'step_started': {
      const d = action.data ?? {}
      const step = { name: d.name, kind: d.kind, agent: d.agent, tool: d.tool, started_ms: d.started_ms ?? 0, status: 'running', duration_s: null }
      return { ...state, steps: [...state.steps, step] }
    }
    case 'step_progress': {
      // latest progress of a step still running: {phase, label, done, total, detail}
      const d = action.data ?? {}
      const steps = state.steps.map((s) => (s.name === d.name && s.status === 'running' ? { ...s, progress: d } : s))
      return { ...state, steps }
    }
    case 'step_finished': {
      const d = action.data ?? {}
      const steps = [...state.steps]
      // the newest still-running step with this name (a step may in theory repeat)
      let i = -1
      for (let k = steps.length - 1; k >= 0; k--) {
        if (steps[k].name === d.name && steps[k].status === 'running') {
          i = k
          break
        }
      }
      const done = { ...(i >= 0 ? steps[i] : {}), ...d, status: d.status ?? 'ok' }
      if (i >= 0) steps[i] = done
      else steps.push(done)
      const key = PARTIAL_OF[d.name]
      const partial = key && done.status === 'ok' ? { ...state.partial, [key]: d.output ?? null } : state.partial
      return { ...state, steps, partial }
    }
    case 'done': {
      const analysis = action.data?.analysis ?? null
      // the saved trace is authoritative (covers any event the client missed)
      const steps = analysis?.result?.trace?.length ? analysis.result.trace : state.steps
      return { ...state, status: 'done', result: analysis, steps }
    }
    case 'error':
      return {
        ...state,
        status: 'error',
        error: action.data?.message ?? 'Lỗi không rõ',
        lost: !!action.data?.lost,
        steps: state.steps.map((s) => (s.status === 'running' ? { ...s, status: 'error' } : s)),
      }
    case 'reset':
      return initialRunState
    default:
      return state
  }
}

/** A saved analysis replayed as stream events, ordered by step start time. */
export function replayEvents(analysis) {
  const trace = [...(analysis?.result?.trace ?? [])].sort((a, b) => (a.started_ms ?? 0) - (b.started_ms ?? 0))
  const events = []
  for (const s of trace) {
    events.push(['step_started', { name: s.name, kind: s.kind, agent: s.agent, tool: s.tool, started_ms: s.started_ms }])
    events.push(['step_finished', s])
  }
  events.push(['done', { analysis }])
  return events
}
