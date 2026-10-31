import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { ErrorAlert, Loading, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFetch } from '@/hooks/use-fetch'
import { dbPage } from '@/lib/api'

const COLLECTIONS = [
  'shops',
  'skus',
  'skuReviews',
  'shopDailyMetrics',
  'skuDailyMetrics',
  'videos',
  'benchmarkVideos',
  'shopeeListings',
  'marketSnapshots',
  'skuAudience',
  'policyRules',
  'analyses',
]
const LIMIT = 20

function Cell({ name, value }) {
  if (name === 'source_status') return <StatusBadge status={value} />
  if (value === null || value === undefined) return <span className="text-muted-foreground">null</span>
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return (
    <span className="block max-w-56 truncate" title={text}>
      {text}
    </span>
  )
}

export default function DataExplorerPage() {
  const [collection, setCollection] = useState('shops')
  const [page, setPage] = useState(1)
  const { data, loading, error } = useFetch(() => dbPage(collection, page, LIMIT), [collection, page])

  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1
  const columns = data?.rows.length ? Object.keys(data.rows[0]) : []

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Data Explorer</h1>
        <Select
          value={collection}
          onValueChange={(c) => {
            setCollection(c)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COLLECTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <code className="text-muted-foreground text-xs">GET /api/{collection}</code>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft />
          </Button>
          {page} / {pages} · {data?.total ?? 0} dòng
          <Button size="icon" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      {error && <ErrorAlert error={error} />}
      {loading && <Loading />}
      {data && !loading && (
        <Card>
          <CardContent className="overflow-x-auto">
            {data.rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">Collection trống.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((c) => (
                      <TableHead key={c} className="font-mono text-xs">
                        {c}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.id}>
                      {columns.map((c) => (
                        <TableCell key={c} className="text-xs">
                          <Cell name={c} value={row[c]} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
