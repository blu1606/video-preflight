import { AlertCircle } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { sourceLabel } from '@/lib/labels'
import { cn } from '@/lib/utils'

const STATUS_STYLE = {
  REAL: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  MOCK: 'bg-amber-100 text-amber-800 border-amber-200',
  MISSING: 'bg-rose-100 text-rose-800 border-rose-200',
  INFERRED: 'bg-sky-100 text-sky-800 border-sky-200',
}

export function StatusBadge({ status }) {
  return (
    <Badge variant="outline" className={cn('font-mono text-[11px]', STATUS_STYLE[status])}>
      {sourceLabel(status)}
    </Badge>
  )
}

const VERDICT_STYLE = {
  healthy: 'bg-emerald-100 text-emerald-800',
  growth: 'bg-emerald-100 text-emerald-800',
  high_performer: 'bg-emerald-100 text-emerald-800',
  no_issue_detected: 'bg-slate-100 text-slate-700', // the rule engine found nothing: not a pass
  unknown: 'bg-slate-100 text-slate-700',
  insufficient_data: 'bg-slate-100 text-slate-700',
  low_confidence: 'bg-slate-100 text-slate-700',
}

// Verdicts, scenarios and finding areas: green for healthy ones, orange otherwise.
export function TagBadge({ value }) {
  if (!value) return <span className="text-muted-foreground">-</span>
  return (
    <Badge variant="outline" className={cn('font-mono text-[11px]', VERDICT_STYLE[value] ?? 'bg-orange-100 text-orange-800')}>
      {value}
    </Badge>
  )
}

export function KpiCard({ label, value, hint }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="text-muted-foreground -mt-2 text-xs">{hint}</CardContent>}
    </Card>
  )
}

export function Loading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export function ErrorAlert({ error, onRetry }) {
  const message = String(error?.message ?? error ?? 'Lỗi không rõ')
  const unreachable = /Failed to fetch|NetworkError|ECONNREFUSED|^50[24] /.test(message)
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>Lỗi</AlertTitle>
      <AlertDescription>
        <span className="break-words">{message}</span>
        {unreachable && (
          <span className="block text-xs">Kiểm tra lab (json-server + FastAPI) của trang này ({window.location.host}) còn chạy.</span>
        )}
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-2 rounded-md border border-current px-2 py-0.5 text-xs font-medium">
            Thử lại
          </button>
        )}
      </AlertDescription>
    </Alert>
  )
}


