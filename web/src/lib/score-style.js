// Tone and severity class maps shared by score visuals, timeline and report (mockup-v2 colour roles).

export const scoreTone = (v) => (v == null ? 'muted' : v < 40 ? 'critical' : v < 70 ? 'amber' : 'pass')

export const TONE_TEXT = { critical: 'text-critical', amber: 'text-amber-ink', pass: 'text-pass', muted: 'text-faint', accent: 'text-brand' }
export const TONE_BG = { critical: 'bg-critical', amber: 'bg-amber-ink', pass: 'bg-pass', muted: 'bg-faint', accent: 'bg-brand', ink: 'bg-ink-2' }
export const TONE_TAG = {
  critical: 'bg-critical-tint text-critical',
  amber: 'bg-amber-tint text-amber-ink',
  pass: 'bg-pass-tint text-pass',
  accent: 'bg-brand-tint text-brand-ink',
  muted: 'bg-subtle text-muted-foreground',
  info: 'bg-[rgba(29,78,216,.08)] text-info',
}
export const SEV_BG = { critical: 'bg-sev-high', high: 'bg-sev-high', medium: 'bg-sev-medium', low: 'bg-sev-low', info: 'bg-sev-info' }
export const SEV_TEXT = { critical: 'text-sev-high', high: 'text-sev-high', medium: 'text-sev-medium', low: 'text-sev-low', info: 'text-sev-info' }
export const SEV_BORDER = { critical: 'border-sev-high', high: 'border-sev-high', medium: 'border-sev-medium', low: 'border-sev-low', info: 'border-sev-info' }

export const fmtScore = (v) => (v == null ? '–' : Number.isInteger(v) ? String(v) : v.toFixed(1))
