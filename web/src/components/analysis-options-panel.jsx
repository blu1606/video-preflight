import { Coins } from 'lucide-react'

import { FREE_OPTIONS, PAID_OPTIONS } from '@/lib/analysis-options'
import { cn } from '@/lib/utils'

function Segmented({ label, hint, value, options, onChange }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-ink-2">{label}</div>
      <div className="inline-flex overflow-hidden rounded-lg border border-line bg-surface" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cn(
              'h-8 px-3 text-xs whitespace-nowrap [&+&]:border-l [&+&]:border-line',
              value === v ? 'bg-brand-tint font-semibold text-brand shadow-[inset_0_-2px_0_var(--mk-accent)]' : 'text-ink-2 hover:bg-subtle',
            )}
          >
            {text}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

/** Rubric toggle and the paid steps (off by default), shared by upload and "Chạy lại". */
export function AnalysisOptionsPanel({ options, onChange, extractionState }) {
  const set = (patch) => onChange({ ...options, ...patch })
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">

        <Segmented
          label="Rubric"
          value={options.rubric}
          onChange={(rubric) => set({ rubric })}
          options={[['v2', 'v2 · câu Decisions'], ['v1', 'v1 · công thức']]}
          hint="v2 chấm bằng các câu hỏi Decisions API; v1 chấm bằng công thức rule trên features."
        />
      </div>
      <div className="space-y-1.5">
        {FREE_OPTIONS.map((p) => (
          <label key={p.key} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-xs hover:bg-subtle">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--mk-accent)]"
              checked={options[p.key] === true}
              onChange={(e) => set({ [p.key]: e.target.checked })}
            />
            <span>
              <span className="font-medium text-ink">{p.label}</span>
              <span className="text-muted-foreground"> · {p.cost}</span>
            </span>
          </label>
        ))}
        <div className="flex items-center gap-1.5 pt-1 text-xs font-semibold text-ink-2">
          <Coins className="size-3.5" /> Bước gọi OpenAI có tính phí (mặc định tắt, trừ AI tóm tắt)
        </div>
        {PAID_OPTIONS.map((p) => (
          <label key={p.key} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-xs hover:bg-subtle">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--mk-accent)]"
              checked={options[p.key] === p.on}
              onChange={(e) => set({ [p.key]: e.target.checked ? p.on : p.key === 'extract' ? 'auto' : false })}
            />
            <span>
              <span className="font-medium text-ink">{p.label}</span>
              <span className="text-muted-foreground"> · {p.cost}</span>
            </span>
          </label>
        ))}
        <p className="text-[11px] text-muted-foreground">
          Không tick gì vẫn có thể tốn phí một lần: trích xuất (frames + Whisper + VLM, khoảng 14k token) chạy khi video chưa có cache hoặc file đã đổi (extract=auto). Mọi bước tính phí đều hỏi xác nhận trước khi chạy; câu trả lời đã cache vẫn được dùng miễn phí.
        </p>
        {['missing', 'changed'].includes(extractionState) && options.extract === 'auto' && (
          <p className="rounded-md bg-amber-tint px-2 py-1 text-[11px] text-amber-ink">
            Video này {extractionState === 'missing' ? 'chưa được trích xuất' : 'đã đổi file so với lần trích xuất trước'}: lần chạy tới sẽ trích xuất (khoảng 14k token).
          </p>
        )}
      </div>
    </div>
  )
}
