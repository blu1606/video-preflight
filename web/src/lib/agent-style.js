// 0-100 score -> red (<40) / amber (<70) / green; grey when not scored.
export const scoreColor = (v) =>
  v == null
    ? 'bg-slate-100 text-slate-500'
    : v < 40
      ? 'bg-rose-100 text-rose-800'
      : v < 70
        ? 'bg-amber-100 text-amber-800'
        : 'bg-emerald-100 text-emerald-800'

// Badge colors per agent, shared by the step log and the agent flow diagram.
export const AGENT_STYLE = {
  orchestrator: 'bg-zinc-800 text-white',
  video_analyst: 'bg-rose-100 text-rose-800',
  product_scout: 'bg-amber-100 text-amber-800',
  metrics_analyst: 'bg-emerald-100 text-emerald-800',
  policy_guard: 'bg-orange-100 text-orange-800',
  decision_scorer: 'bg-violet-100 text-violet-800',
  scorer: 'bg-sky-100 text-sky-800',
  auditor: 'bg-rose-200 text-rose-900',
}
