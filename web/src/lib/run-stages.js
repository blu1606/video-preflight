// The 7 workflow stages of an analysis run and a one-line summary per trace step.
// Shared by the live step list (result page) and the agent flow tab (report dialog).

export const STAGES = [
  { id: 'request', title: 'Request', steps: ['get_video', 'get_shop'] },
  {
    id: 'gather',
    title: 'Gather data',
    steps: ['extract_video_content', 'get_video_features', 'load_shop_data', 'load_video_features', 'load_real_metrics',
      'load_product_listings', 'load_user_listing', 'load_shop_and_sku', 'load_market_snapshot', 'load_post_context',
      'load_fixture', 'identify_music'],
  },
  // main.py asks Decisions before the policy check: decision-backed policy rules read its answers.
  // check_claims_vs_listing runs just before Decisions but needs nothing from it (no AI, ~0 s).
  { id: 'decisions', title: 'Decisions API', steps: ['ask_decisions_api'] },
  { id: 'checks', title: 'Checks', steps: ['check_claims_vs_listing', 'check_policy', 'check_platform_fit'] },
  { id: 'crosscheck', title: 'Cross-check', steps: ['cross_check_low_answers'] },
  { id: 'scoring', title: 'Scoring', steps: ['score_rubric', 'quality_gate', 'compare_real_outcome', 'diagnose_shop', 'localize_issues'] },
  { id: 'verdict', title: 'Verdict', steps: ['compose_verdict', 'summarize_insights'] },
]

/** Stage id of a step; unknown `load_*` steps belong to data gathering, anything else to scoring. */
export function stageOf(name) {
  const st = STAGES.find((s) => s.steps.includes(name))
  if (st) return st.id
  return name?.startsWith('load_') || name?.startsWith('get_') ? 'gather' : 'scoring'
}

/** Steps grouped by stage, with a stage status: pending | running | done | error. */
export function groupSteps(steps, runStatus = 'done') {
  return STAGES.map((stage) => {
    const own = (steps ?? []).filter((s) => stageOf(s.name) === stage.id)
    let status = 'pending'
    if (own.some((s) => s.status === 'error')) status = 'error'
    else if (own.some((s) => s.status === 'running')) status = 'running'
    else if (own.length) status = 'done'
    if (status === 'pending' && runStatus === 'done') status = 'skipped'
    return { ...stage, steps: own, status }
  })
}

function statusCounts(digest) {
  const counts = {}
  for (const f of Object.values(digest ?? {})) {
    if (f && typeof f === 'object' && f.status) counts[f.status] = (counts[f.status] ?? 0) + 1
  }
  return Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(' · ')
}

/** One line saying what the step brought back. */
export function summarizeStep(step) {
  if (!step) return ''
  const o = step.output ?? {}
  if (step.status === 'running') return 'đang chạy…'
  if (step.status === 'error') return o.error ?? 'lỗi'
  if (step.status === 'skipped' && o.reason) return o.reason
  switch (step.name) {
    case 'get_video':
      return `${o.id ?? ''} · file ${o.local_file ?? 'không có'}`
    case 'get_shop':
      return o.shop_name ? `${o.shop_name} (${o.scenario})` : ''
    case 'get_video_features':
      return o.features_file ?? 'chưa có cache'
    case 'load_shop_data': {
      const n = Object.values(o).filter((v) => typeof v === 'number')
      return `${n.reduce((a, b) => a + b, 0)} dòng từ ${n.length} collection`
    }
    case 'extract_video_content':
      return o.source === 'live extraction'
        ? `trích xuất mới · ${o.token_usage?.total_tokens ?? '?'} token`
        : [o.source, o.reason].filter(Boolean).join(': ')
    case 'identify_music': {
      if (o.match !== 'matched') return o.reason ?? 'chưa nhận diện được nhạc'
      return `♪ ${o.title}${o.artist ? ` · ${o.artist}` : ''}`
    }
    case 'check_claims_vs_listing': {
      const v = o['video.claims_sku_match']
      return v ? `claims khớp listing: ${v.value ?? '–'} (${v.status})` : statusCounts(o)
    }
    case 'check_policy':
      return Object.entries(o.targets ?? {}).map(([t, v]) => `${t}: ${v.verdict}`).join(' · ')
    case 'check_platform_fit':
      return o.summary ? `${o.summary.pass} đạt · ${o.summary.fail + o.summary.tip} cần sửa · ${o.summary.unverified} chưa xác minh` : ''
    case 'ask_decisions_api': {
      const answered = (o.questions ?? []).filter((q) => q.status !== 'MISSING').length
      return `1 lần gọi · ${o.source ?? 'không rõ nguồn'} · ${answered}/${(o.questions ?? []).length} câu có trả lời`
    }
    case 'cross_check_low_answers': {
      const rows = Object.entries(o)
      if (!rows.length) return 'không có câu dưới ngưỡng'
      const conflicts = rows.filter(([, r]) => r?.verdict === 'conflict').map(([id]) => id)
      return `${rows.length} câu thấp · ${conflicts.length} mâu thuẫn${conflicts.length ? `: ${conflicts.join(', ')}` : ''}`
    }
    case 'score_rubric':
      return Object.entries(o).map(([g, v]) => `${g.split('_')[0]} ${v?.score ?? '–'}`).join(' · ')
    case 'quality_gate':
      return `${o.status} · ${o.flags?.length ?? 0} cảnh báo`
    case 'compare_real_outcome':
      return o.benchmark ? `${o.benchmark.label}: ${o.benchmark.sales_per_1k_views} sales/1K views` : 'chưa có số liệu hiệu suất cho video này'
    case 'diagnose_shop':
      return `vấn đề chính: ${o.diagnosis?.primary_issue ?? o.diagnosis?.status ?? '–'}`
    case 'localize_issues':
      return Array.isArray(o.boxes)
        ? `${o.boxes.length} vùng định vị · ${Object.keys(o.no_box ?? {}).length} không có box · ${o.source}`
        : (o.source ?? '')
    case 'summarize_insights': {
      const dropped = o.dropped?.length ? ` · loại ${o.dropped.length} ý không có căn cứ` : ''
      return `AI tóm tắt · ${o.kept?.insights ?? 0} ý, ${o.kept?.fixes ?? 0} việc · ${o.source ?? ''}${dropped}`
    }
    case 'compose_verdict':
      return `yếu nhất: ${(o.weakest ?? []).map((c) => c.id).join(', ')}`
    default:
      return statusCounts(o)
  }
}

/** Total run time in seconds from step timings. */
export function runSeconds(steps) {
  if (!steps?.length) return 0
  return Math.max(...steps.map((s) => (s.started_ms ?? 0) + (s.duration_s ?? 0) * 1000)) / 1000
}
