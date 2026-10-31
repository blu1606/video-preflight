import { fmtTime } from '../lib/timeline.js'
import { DATASETS } from './data-atlas-model.js'

/** Title of a Data Atlas dataset, or its id when the atlas does not know it. */
export const datasetTitle = (id) => DATASETS.find((d) => d.id === id)?.title ?? id

/**
 * The chip under an AI insight for one citation: its label, a title for hover, and the action a click runs
 * (see studio-page). Null for a citation kind the studio does not know.
 */
export function citeChip(cite) {
  switch (cite?.kind) {
    case 'criterion':
      return { key: `criterion:${cite.id}`, label: `Câu ${cite.id}`, title: 'Mở câu hỏi chấm và bằng chứng', action: { type: 'criterion', id: cite.id } }
    case 'policy':
      return { key: `policy:${cite.id}`, label: `Rule ${cite.id}`, title: 'Mở bằng chứng policy', action: { type: 'policy', id: cite.id } }
    case 'fix':
      return { key: 'fix', label: 'Việc cần sửa', title: 'Mở tab Sửa & so sánh', action: { type: 'fix', id: cite.id } }
    case 'time':
      return { key: `time:${cite.t}`, label: fmtTime(cite.t), title: 'Tua video tới thời điểm này', action: { type: 'time', t: cite.t } }
    case 'claims':
      return { key: 'claims', label: 'Claim trong video', title: 'Mở claim đối chiếu với listing', action: { type: 'claims' } }
    case 'metric':
      return {
        key: `dataset:${cite.dataset}`, label: `Số liệu · ${datasetTitle(cite.dataset)}`,
        title: `${cite.field} = ${cite.value}${cite.source ? ` (${cite.source})` : ''}`,
        action: { type: 'dataset', dataset: cite.dataset },
      }
    case 'dataset':
      return { key: `dataset:${cite.dataset}`, label: `Kho dữ liệu · ${datasetTitle(cite.dataset)}`, title: 'Mở kho dữ liệu', action: { type: 'dataset', dataset: cite.dataset } }
    default:
      return null
  }
}

/** Chips for a list of citations, unknown kinds left out and the same source shown once. */
export function citeChips(cites) {
  const chips = new Map()
  for (const cite of cites ?? []) {
    const chip = citeChip(cite)
    if (chip && !chips.has(chip.key)) chips.set(chip.key, chip)
  }
  return [...chips.values()]
}

/** Where a criterion citation opens: its Decisions question when the batch answered it, else the fix list. */
export function criterionTarget(id, questionIds) {
  return questionIds.has(id) ? { open: 'question', id } : { open: 'fix' }
}
