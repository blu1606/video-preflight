import { Check, ImageOff, Search } from 'lucide-react'
import { useState } from 'react'

import { Tag } from '@/components/score-visuals'
import { compactNum, num, vnd } from '@/lib/api'
import { cn } from '@/lib/utils'


function SkuImage({ skuId, name }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="grid aspect-square w-full place-items-center rounded-md bg-subtle text-faint">
        <ImageOff className="size-5" />
      </div>
    )
  }
  return (
    <img
      src={`/skus/${encodeURIComponent(skuId)}.jpg`}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="aspect-square w-full rounded-md bg-subtle object-cover"
    />
  )
}

/**
 * SKU cards of the selected shop with image, price and a small market chip (units sold in 28 days on
 * TikTok Shop for the SKU's keyword, FastMoss) when a crawled snapshot exists.
 */
export function SkuPicker({ skus, snapshots, value, onChange }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q ? skus.filter((s) => s.item_name.toLowerCase().includes(q) || s.sku_id.toLowerCase().includes(q)) : skus

  return (
    <div className="space-y-2">
      <label className="flex h-9 items-center gap-2 rounded-lg border border-line-2 bg-surface px-3 focus-within:border-ink">
        <Search className="size-4 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên sản phẩm"
          className="h-full flex-1 bg-transparent text-sm outline-none"
        />
      </label>
      {shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Không có SKU nào khớp “{query}”.</p>
      ) : (
        <div role="radiogroup" aria-label="Sản phẩm gắn giỏ" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((s) => {
            const selected = s.sku_id === value
            const market = snapshots?.[s.sku_id]?.tiktok
            return (
              <button
                key={s.sku_id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(s.sku_id)}
                className={cn(
                  'relative flex flex-col gap-1.5 rounded-xl border bg-surface p-2 text-left transition',
                  selected ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:border-line-2 hover:shadow-sheet',
                )}
              >
                {selected && (
                  <span className="absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-brand text-white">
                    <Check className="size-3.5" />
                  </span>
                )}
                <SkuImage skuId={s.sku_id} name={s.item_name} />
                <span className="line-clamp-2 text-xs font-medium leading-snug">{s.item_name}</span>
                <span className="text-sm font-semibold tabular-nums">{vnd(s.price_vnd)}</span>
                <span className="text-[11px] text-muted-foreground">
                  ★ {s.rating} ({num(s.rating_count)}) · kho {num(s.stock)}
                </span>
                {market?.units_28d != null && (
                  <Tag tone="info" className="h-auto whitespace-normal py-0.5 leading-tight" title={`FastMoss · TikTok Shop VN · từ khóa “${market.keyword}”`}>
                    Thị trường {compactNum(market.units_28d)} bán/28 ngày
                  </Tag>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
