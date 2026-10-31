// Analysis options shared by the upload screen and "Chạy lại": defaults, cost notes and URL round-trip.
// Paid steps are off by default (docs/uiux-requirements.md §6.2), except the plain-language summary: it is the
// main reading layer of the simple view, and the policy reviewer the backend runs by default; both are cached
// and still confirmed like every paid step.

export const DEFAULT_OPTIONS = {
  rubric: 'v2',
  extract: 'auto',
  decisions: false,
  cross_check_agent: false,
  claims_llm: false,
  localize: false,
  insights: true,
  policy_llm: true,
  music: true,
}

// Free steps: shown with the options, never confirmed as paid.
export const FREE_OPTIONS = [
  { key: 'music', label: 'Nhận diện nhạc nền (ShazamIO)', cost: 'miễn phí, cần mạng; kết quả cache theo video' },
]

export const PAID_OPTIONS = [
  { key: 'extract', on: 'force', label: 'Trích xuất lại từ đầu (bỏ cache)', cost: 'frames + Whisper + VLM, khoảng 14k token' },
  { key: 'decisions', on: true, label: 'Gọi Decisions API cho câu chưa có cache', cost: '1 lần gọi, khoảng 10k token' },
  { key: 'cross_check_agent', on: true, label: 'Agent LLM đối chiếu chéo câu bị chấm thấp', cost: 'mỗi câu dưới 40 điểm 1 lần gọi nhỏ' },
  { key: 'claims_llm', on: true, label: 'LLM đối chiếu claim trong video với listing', cost: '1 lần gọi' },
  { key: 'localize', on: true, label: 'AI định vị vùng cần sửa trên khung hình', cost: '1 lần gọi VLM, tối đa 8 ảnh; dùng cache nếu đã có' },
  { key: 'policy_llm', on: true, label: 'Agent LLM kiểm tra policy (trích dẫn nguyên văn)', cost: '1 lần gọi, khoảng 5k token; dùng cache nếu bằng chứng không đổi' },
  { key: 'insights', on: true, label: 'AI tóm tắt kết quả thành lời dễ hiểu', cost: '1 lần gọi, khoảng 5k token, ~25 giây; dùng cache nếu kết quả không đổi' },
]

const BOOL_KEYS = ['decisions', 'cross_check_agent', 'claims_llm', 'localize', 'insights', 'policy_llm', 'music']

/** Options -> query entries, only what differs from the defaults. */
export function optionsToSearch(options) {
  const out = {}
  for (const [k, v] of Object.entries({ ...DEFAULT_OPTIONS, ...options })) {
    if (!(k in DEFAULT_OPTIONS) || v === DEFAULT_OPTIONS[k]) continue
    out[k] = BOOL_KEYS.includes(k) ? (v ? '1' : '0') : String(v)
  }
  return out
}

/** URLSearchParams -> options, validated against the allowed values. */
export function optionsFromSearch(params) {
  const get = (k) => params.get(k)
  const pick = (k, allowed) => (allowed.includes(get(k)) ? get(k) : DEFAULT_OPTIONS[k])
  const out = {
    rubric: pick('rubric', ['v2', 'v1']),
    extract: pick('extract', ['auto', 'force', 'never']),
  }
  for (const k of BOOL_KEYS) out[k] = get(k) == null ? DEFAULT_OPTIONS[k] : ['1', 'true'].includes(get(k))
  return out
}

export const paidSelected = (options) => PAID_OPTIONS.filter((p) => options[p.key] === p.on)

export const FIRST_EXTRACTION = {
  key: 'extract_auto',
  label: 'Trích xuất video (chưa có cache hoặc file đã đổi)',
  cost: 'frames + Whisper + VLM, khoảng 14k token',
}

/**
 * Every paid step a run with these options will trigger. `extractionState` is the
 * /py/videos/{id}/features `extraction_status.state` ("missing" when not extracted yet); with
 * extract=auto a missing or changed cache means a paid extraction too.
 */
export function paidWarnings(options, extractionState) {
  const out = paidSelected(options)
  if (options.extract === 'auto' && ['missing', 'changed'].includes(extractionState)) out.unshift(FIRST_EXTRACTION)
  return out
}

/** One confirmation text for every paid run, or null when the run is free. */
export function paidConfirmText(warnings) {
  if (!warnings.length) return null
  const lines = warnings.map((p) => `- ${p.label} (${p.cost})`)
  return ['Các bước sau gọi OpenAI có tính phí:', ...lines, 'Tiếp tục?'].join('\n')
}
