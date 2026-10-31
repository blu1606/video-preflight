import { ChevronDown, FileVideo, Library, Loader2, PenLine, ScanSearch, UploadCloud, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AnalysisOptionsPanel } from '@/components/analysis-options-panel'
import { ErrorAlert } from '@/components/common'
import { Sheet, SkeletonBlock } from '@/components/score-visuals'
import { ShopContextCard } from '@/components/shop-context-card'
import { SkuPicker } from '@/components/sku-picker'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { VideoLibrary } from '@/components/video-library'
import { useFetch } from '@/hooks/use-fetch'
import { DEFAULT_OPTIONS, optionsToSearch, paidConfirmText, paidWarnings } from '@/lib/analysis-options'
import { db, uploadVideo } from '@/lib/api'
import { PLATFORM_LABELS } from '@/lib/labels'
import { cn } from '@/lib/utils'

const VIDEO_EXT = ['.mp4', '.mov', '.webm', '.mkv']
const INPUT = 'h-9 w-full rounded-lg border border-line-2 bg-surface px-3 text-sm outline-none focus:border-ink'
const SPONSORSHIP = [
  ['own_shop', 'Shop tự đăng'],
  ['affiliate', 'Affiliate (KOC nhận hoa hồng)'],
  ['sponsored', 'Được tài trợ (booking KOL)'],
]
const GOALS = ['Tăng đơn hàng', 'Tăng nhận diện', 'Xả hàng tồn', 'Ra mắt sản phẩm mới']
const QUESTIONS = ['Có nên đăng video này không?', 'Cần sửa gì để tăng chuyển đổi?', 'Video có rủi ro policy nào không?']
const LISTING_FIELDS = [
  ['name', 'Tên sản phẩm *', 'text'],
  ['url', 'Link sản phẩm (https://…)', 'url'],
  ['title', 'Tiêu đề listing', 'text'],
  ['description', 'Mô tả', 'text'],
  ['price_vnd', 'Giá bán (VND)', 'number'],
  ['list_price_vnd', 'Giá gốc (VND)', 'number'],
]

async function loadCatalog() {
  const [shops, skus] = await Promise.all([db('/shops'), db('/skus')])
  return { shops, skus }
}

function Block({ step, title, hint, children }) {
  return (
    <Sheet
      title={
        <span className="flex items-center gap-2">
          <span className="grid size-5 place-items-center rounded-full bg-brand-tint text-[11px] font-bold text-brand">{step}</span>
          {title}
        </span>
      }
      aside={hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    >
      {children}
    </Sheet>
  )
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-ink-2">{label}</span>
      {children}
    </label>
  )
}

export default function UploadPage() {
  const navigate = useNavigate()
  const catalog = useFetch(loadCatalog, [])
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [shopId, setShopId] = useState('')
  const [skuId, setSkuId] = useState('')
  const [manual, setManual] = useState(false)
  const [listing, setListing] = useState({ name: '', url: '', title: '', description: '', price_vnd: '', list_price_vnd: '' })
  const [platforms, setPlatforms] = useState(['tiktok_shop_video'])
  const [post, setPost] = useState({ sponsorship: 'own_shop', disclosure_enabled: false, goal: '', budget_vnd: '', campaign: '', user_query: '' })
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  const [advanced, setAdvanced] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [progress, setProgress] = useState(null)
  const [invalid, setInvalid] = useState(null)
  const [error, setError] = useState(null)

  const snapshots = useFetch(
    () => (shopId ? db(`/marketSnapshots?shopId=${encodeURIComponent(shopId)}`) : Promise.resolve([])),
    [shopId],
  )

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  function pickFile(f) {
    if (!f) return
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    if (!VIDEO_EXT.includes(ext)) {
      setInvalid(`File ${f.name} không phải video hỗ trợ (${VIDEO_EXT.join(', ')}).`)
      return
    }
    setInvalid(null)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  function validate() {
    if (!file) return 'Chọn file video cần kiểm tra.'
    if (manual) {
      if (!listing.name.trim()) return 'Nhập tên sản phẩm cho listing.'
      if (listing.url && !/^https?:\/\//i.test(listing.url.trim())) return 'Link sản phẩm phải bắt đầu bằng http:// hoặc https://'
      for (const k of ['price_vnd', 'list_price_vnd']) if (listing[k] && !(Number(listing[k]) > 0)) return 'Giá phải là số dương.'
    } else if (!skuId) return 'Chọn shop và sản phẩm gắn giỏ.'
    if (!platforms.length) return 'Chọn ít nhất một nơi sẽ đăng.'
    if (post.budget_vnd && !(Number(post.budget_vnd) > 0)) return 'Ngân sách phải là số dương.'
    return null
  }

  async function submit(e) {
    e.preventDefault()
    const problem = validate()
    setInvalid(problem)
    if (problem) return
    // a freshly uploaded file has no extraction cache, so extract=auto is a paid extraction too
    const confirmText = paidConfirmText(paidWarnings(options, 'missing'))
    if (confirmText && !window.confirm(confirmText)) return
    const form = new FormData()
    form.append('file', file)
    if (manual) {
      for (const [k, v] of Object.entries(listing)) if (String(v).trim()) form.append(k, String(v).trim())
    } else {
      form.append('shop_id', shopId)
      form.append('sku_id', skuId)
    }
    for (const p of platforms) form.append('platforms', p)
    form.append('sponsorship', post.sponsorship)
    form.append('disclosure_enabled', post.disclosure_enabled ? 'true' : 'false')
    for (const k of ['goal', 'budget_vnd', 'campaign', 'user_query']) if (String(post[k]).trim()) form.append(k, String(post[k]).trim())

    setError(null)
    setProgress(0)
    try {
      const video = await uploadVideo(form, setProgress)
      // the paid steps were confirmed here; tell the result page through router state, never the URL
      navigate(`/analyze?${new URLSearchParams({ video: video.id, autorun: '1', ...optionsToSearch(options) })}`, {
        state: { confirmedRun: video.id },
      })
    } catch (err) {
      setError(err)
      setProgress(null)
    }
  }

  if (catalog.loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <SkeletonBlock className="h-10 w-80" />
        <SkeletonBlock className="h-48" />
        <SkeletonBlock className="h-64" />
      </div>
    )
  }
  if (catalog.error) return <ErrorAlert error={catalog.error} onRetry={catalog.reload} />

  const { shops, skus } = catalog.data
  const shop = shops.find((s) => s.id === shopId)
  const shopSkus = skus.filter((s) => s.shop_id === shopId)
  const snapBySku = Object.fromEntries((snapshots.data ?? []).map((s) => [s.sku_id, s]))
  const uploading = progress != null

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-4" noValidate>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Kiểm tra video trước khi đăng</h1>
        <p className="text-sm text-muted-foreground">
          Tải video, chọn sản phẩm gắn giỏ và nơi đăng. AI xem video, đối chiếu SKU, thị trường và Policy rồi chấm điểm.
        </p>
      </div>

      <Block step={1} title="Video" hint="mp4 · mov · webm · mkv">
        {!file ? (
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              pickFile(e.dataTransfer.files?.[0])
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition',
              dragging ? 'border-brand bg-brand-tint' : 'border-line-2 hover:bg-subtle',
            )}
          >
            <UploadCloud className="size-9 text-brand" />
            <span className="text-sm font-semibold">Kéo thả video vào đây hoặc chọn từ máy</span>
            <input type="file" accept={VIDEO_EXT.join(',')} className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
        ) : (
          <div className="flex items-center gap-4">
            <video src={preview} className="h-36 w-20 rounded-lg bg-stage object-cover" muted playsInline controls={false} />
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <FileVideo className="size-4 text-brand" /> <span className="truncate">{file.name}</span>
              </div>
              <div className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => setFile(null)}>
                <X /> Đổi file
              </Button>
            </div>
          </div>
        )}
      </Block>

      <Block step={2} title={manual ? 'Sản phẩm (nhập listing)' : 'Shop và sản phẩm gắn giỏ'}>
        {manual ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {LISTING_FIELDS.map(([k, label, type]) => (
                <Field key={k} label={label}>
                  <input
                    className={INPUT}
                    type={type}
                    min={type === 'number' ? 1 : undefined}
                    value={listing[k]}
                    onChange={(e) => setListing({ ...listing, [k]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
            <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => setManual(false)}>
              Chọn SKU trong shop thay vì nhập tay
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <Field label="Shop">
                <select
                  className={INPUT}
                  value={shopId}
                  onChange={(e) => {
                    setShopId(e.target.value)
                    setSkuId('')
                  }}
                >
                  <option value="">Chọn shop…</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shop_name} ({s.id})
                    </option>
                  ))}
                </select>
              </Field>
              <ShopContextCard shop={shop} />
            </div>
            {shop && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-ink-2">Sản phẩm gắn giỏ</div>
                <SkuPicker skus={shopSkus} snapshots={snapBySku} value={skuId} onChange={setSkuId} />
              </div>
            )}
            <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline" onClick={() => setManual(true)}>
              <PenLine className="size-3.5" /> Không có trong shop? Nhập listing
            </button>
          </div>
        )}
      </Block>

      <Block step={3} title="Đăng ở đâu" hint="Policy được kiểm theo từng nền tảng đã chọn">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Nền tảng">
          {Object.entries(PLATFORM_LABELS).map(([id, label]) => {
            const on = platforms.includes(id)
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => setPlatforms(on ? platforms.filter((p) => p !== id) : [...platforms, id])}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs font-medium transition',
                  on ? 'border-ink bg-ink text-white' : 'border-line-2 bg-surface text-ink-2 hover:border-ink',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      </Block>

      <section className="rounded-2xl bg-surface shadow-sheet">
        <button
          type="button"
          aria-expanded={advanced}
          onClick={() => setAdvanced(!advanced)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold"
        >
          Tùy chọn nâng cao
          <span className="text-xs font-normal text-muted-foreground">
            người đăng, mục tiêu, câu hỏi · rubric {options.rubric}
          </span>
          <ChevronDown className={cn('ml-auto size-4 transition', advanced && 'rotate-180')} />
        </button>
        {advanced && (
          <div className="space-y-5 border-t border-line p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Người đăng">
                <select className={INPUT} value={post.sponsorship} onChange={(e) => setPost({ ...post, sponsorship: e.target.value })}>
                  {SPONSORSHIP.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 pt-5 text-xs">
                <input
                  type="checkbox"
                  className="accent-[var(--mk-accent)]"
                  checked={post.disclosure_enabled}
                  onChange={(e) => setPost({ ...post, disclosure_enabled: e.target.checked })}
                />
                Sẽ bật nhãn quảng cáo / paid partnership khi đăng
              </label>
              <Field label="Mục tiêu (goal)">
                <select className={INPUT} value={post.goal} onChange={(e) => setPost({ ...post, goal: e.target.value })}>
                  <option value="">Không chọn</option>
                  {GOALS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </Field>
              <Field label="Ngân sách (VND)">
                <input className={INPUT} type="number" min={1} value={post.budget_vnd} onChange={(e) => setPost({ ...post, budget_vnd: e.target.value })} />
              </Field>
              <Field label="Campaign">
                <input className={INPUT} value={post.campaign} onChange={(e) => setPost({ ...post, campaign: e.target.value })} />
              </Field>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-ink-2">Bạn muốn hỏi gì?</div>
              <div className="flex flex-wrap gap-1.5">
                {QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setPost({ ...post, user_query: q })}
                    className={cn(
                      'h-7 rounded-full border border-dashed px-2.5 text-xs',
                      post.user_query === q ? 'border-brand bg-brand-tint text-brand-ink' : 'border-faint hover:bg-subtle',
                    )}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <input
                className={INPUT}
                placeholder="Hoặc tự gõ câu hỏi"
                value={post.user_query}
                onChange={(e) => setPost({ ...post, user_query: e.target.value })}
              />
            </div>
            <AnalysisOptionsPanel options={options} onChange={setOptions} />
          </div>
        )}
      </section>

      {invalid && <p role="alert" className="rounded-lg bg-critical-tint px-3 py-2 text-sm text-critical">{invalid}</p>}
      {error && <ErrorAlert error={error} />}
      {uploading && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-ink-2">
            <span>Đang tải video lên…</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={uploading} className="h-11 px-6 text-sm font-semibold">
          {uploading ? <Loader2 className="animate-spin" /> : <ScanSearch />} Kiểm tra video
        </Button>
        <span className="text-xs text-muted-foreground">
          Tải lên xong, phân tích tự chạy và hiện từng bước. Video mới cần trích xuất lần đầu (frames + Whisper + VLM, khoảng 14k token), sẽ hỏi xác nhận.
        </span>
      </div>

      <section className="rounded-2xl bg-surface shadow-sheet">
        <button
          type="button"
          aria-expanded={showLibrary}
          onClick={() => setShowLibrary(!showLibrary)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold"
        >
          <Library className="size-4" /> Xem video đã có
          <ChevronDown className={cn('ml-auto size-4 transition', showLibrary && 'rotate-180')} />
        </button>
        {showLibrary && (
          <div className="border-t border-line px-3 py-2">
            <VideoLibrary />
          </div>
        )}
      </section>
    </form>
  )
}
