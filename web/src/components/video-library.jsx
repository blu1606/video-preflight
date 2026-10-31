import { FileVideo, VideoOff } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ErrorAlert } from '@/components/common'
import { SkeletonBlock, Tag } from '@/components/score-visuals'
import { useFetch } from '@/hooks/use-fetch'
import { db } from '@/lib/api'

async function loadLibrary() {
  const [videos, shops] = await Promise.all([db('/videos'), db('/shops')])
  const shopName = Object.fromEntries(shops.map((s) => [s.id, s.shop_name]))
  const uploads = videos.filter((v) => String(v.id).startsWith('UPL-')).reverse()
  const seeds = videos.filter((v) => !String(v.id).startsWith('UPL-'))
  return { rows: [...uploads, ...seeds], shopName }
}

/** "Xem video đã có": uploaded videos first, then seed videos; each opens its result page. */
export function VideoLibrary({ limit }) {
  const { data, loading, error, reload } = useFetch(loadLibrary, [])
  if (loading) return <div className="space-y-2">{[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-10" />)}</div>
  if (error) return <ErrorAlert error={error} onRetry={reload} />
  const rows = limit ? data.rows.slice(0, limit) : data.rows
  if (!rows.length) return <p className="text-sm text-muted-foreground">Chưa có video nào.</p>
  return (
    <ul className="divide-y divide-line">
      {rows.map((v) => (
        <li key={v.id}>
          <Link to={`/analyze?video=${encodeURIComponent(v.id)}`} className="flex items-center gap-3 px-1 py-2 text-sm hover:bg-subtle">
            {v.local_file ? <FileVideo className="size-4 text-brand" /> : <VideoOff className="size-4 text-faint" />}
            <span className="font-mono text-xs">{v.id}</span>
            <span className="truncate text-ink-2">{v.product_label ?? v.local_file ?? ''}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {v.shop_id && <span className="hidden text-xs text-muted-foreground md:inline">{data.shopName[v.shop_id]}</span>}
              <Tag tone={v.stage === 'prepublish' ? 'accent' : 'muted'}>{v.stage === 'prepublish' ? 'chưa đăng' : 'đã đăng'}</Tag>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
