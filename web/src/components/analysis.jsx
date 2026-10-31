import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { TagBadge } from './common'

const title = (name) => name.replaceAll('_', ' ')

function ScoreBar({ score }) {
  if (score == null) return <span className="text-muted-foreground font-mono text-xs">not_scored</span>
  return (
    <div className="flex items-center gap-2">
      <Progress value={score} className="w-24" />
      <span className="tabular-nums text-xs">{score}</span>
    </div>
  )
}

// One card per score group (score, coverage) + criteria table.
export function ScoreGroups({ groups }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((g) => (
        <Card key={g.name}>
          <CardHeader>
            <CardDescription className="capitalize">{title(g.name)}</CardDescription>
            <CardTitle className="flex items-baseline gap-2 text-2xl tabular-nums">
              {g.score ?? 'not_scored'}
              {g.score != null && <span className="text-muted-foreground text-sm">/100</span>}

            </CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <Progress value={g.coverage * 100} className="h-1.5" />
              <span className="text-muted-foreground whitespace-nowrap">coverage {Math.round(g.coverage * 100)}%</span>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>id</TableHead>
                  <TableHead>criterion</TableHead>
                  <TableHead>w</TableHead>
                  <TableHead>score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.criteria.map((c) => (
                  <TableRow key={c.id} title={c.reason || c.inputs.join(', ')}>
                    <TableCell className="font-mono text-xs">{c.id}</TableCell>
                    <TableCell>
                      {c.name}
                      {c.reason && <div className="text-muted-foreground text-[11px]">{c.reason}</div>}
                    </TableCell>
                    <TableCell className="tabular-nums">{c.weight}</TableCell>
                    <TableCell>
                      <ScoreBar score={c.score} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function FindingCard({ finding, tentative }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={finding.priority === 'P1' ? 'destructive' : 'secondary'}>{finding.priority}</Badge>
          <TagBadge value={finding.area} />
          {tentative && <Badge variant="outline">sơ bộ</Badge>}
          <span className="text-muted-foreground ml-auto text-xs">severity {finding.severity}</span>
        </CardTitle>
        <CardDescription className="text-foreground">{finding.root_cause}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <ul className="text-muted-foreground list-disc pl-5">
          {finding.evidence.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        <p>
          <span className="font-medium">Hành động: </span>
          {finding.action}
        </p>
      </CardContent>
    </Card>
  )
}

export function VideoVerdict({ v }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="font-mono">{v.video_id}</span>
          <TagBadge value={v.verdict} />
        </CardTitle>
        <CardDescription className="text-foreground">{v.reason}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p className="text-muted-foreground text-xs">{v.evidence}</p>
        <p>
          <span className="font-medium">Hành động: </span>
          {v.action}
        </p>
        {v.content_notes.map((n) => (
          <p key={n} className="text-sky-700">
            • {n}
          </p>
        ))}
      </CardContent>
    </Card>
  )
}

// Saved analyses for a target; the selected one is shown by the caller.
export function AnalysisHistory({ analyses, selectedId, onSelect }) {
  if (!analyses.length) return <p className="text-muted-foreground text-sm">Chưa có lần phân tích nào.</p>
  return (
    <div className="flex flex-wrap gap-2">
      {analyses.map((a) => (
        <Button
          key={a.id}
          size="sm"
          variant={a.id === selectedId ? 'default' : 'outline'}
          onClick={() => onSelect(a.id)}
        >
          {new Date(a.createdAt).toLocaleString('vi-VN')}
        </Button>
      ))}
    </div>
  )
}
