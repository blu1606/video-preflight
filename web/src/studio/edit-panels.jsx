import { useEffect, useRef, useState } from 'react'

import { dbPatch, py, uploadVideo } from '../lib/api'
import { Icon } from './icon'
import { SkinOptions } from './platform-picker'
import { platformView } from './studio-model'

export const PANELS = [
  { id: 'video', label: 'Video', icon: 'rail-video', title: 'Video' },
  { id: 'caption', label: 'Tiêu đề', icon: 'rail-caption', title: 'Tiêu đề & hashtag' },
  { id: 'products', label: 'Sản phẩm', icon: 'rail-products', title: 'Sản phẩm gắn với video' },
  { id: 'audience', label: 'Audience', icon: 'rail-audience', title: 'Audience & người đăng' },
  { id: 'platform', label: 'Nền tảng', icon: 'rail-platform', title: 'Nền tảng đăng' },
]

const SPONSORSHIP = [
  ['own_shop', 'Shop tự đăng'],
  ['affiliate', 'Affiliate / KOC'],
  ['sponsored', 'Được tài trợ'],
]
const GOALS = [
  ['', 'Chưa chọn'],
  ['sales', 'Ra đơn'],
  ['awareness', 'Nhận diện'],
  ['launch', 'Ra mắt sản phẩm'],
]

const errText = (e) => String(e?.message ?? e).replace(/^\d{3} /, '')
const parseTags = (text) => [...new Set(text.split(/[\s,]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean))]

function Saved({ state }) {
  if (state === 'saving') return <span className="tiny muted">Đang lưu…</span>
  if (state === 'saved') return <span className="tiny studio-ok">Đã lưu</span>
  if (state?.error) return <span className="tiny studio-err" role="alert">{state.error}</span>
  return null
}

/** Saves a post patch through the API (seed and uploaded videos alike). */
function usePostSave(video, onSaved) {
  const [state, setState] = useState(null)
  const save = async (patch) => {
    setState('saving')
    try {
      const updated = await py(`/videos/${encodeURIComponent(video.id)}/post`, { method: 'PATCH', body: patch })
      setState('saved')
      onSaved(updated)
    } catch (e) {
      setState({ error: errText(e) })
    }
  }
  return [state, save]
}

function VideoPanel({ shop, videos, video, skus, onSelectVideo }) {
  const fileRef = useRef(null)
  const [upload, setUpload] = useState(null)
  const mapped = video?.sku_id ?? skus[0]?.sku_id ?? ''
  const [skuId, setSkuId] = useState(mapped)

  const send = async (file) => {
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    form.append('shop_id', shop.shop_id)
    if (skuId) form.append('sku_id', skuId)
    for (const p of video?.post?.platforms ?? ['tiktok_shop_video', 'shopee_listing']) form.append('platforms', p)
    form.append('sponsorship', video?.post?.sponsorship ?? 'own_shop')
    setUpload({ progress: 0 })
    try {
      const created = await uploadVideo(form, (progress) => setUpload({ progress }))
      setUpload(null)
      onSelectVideo(created.id)
    } catch (e) {
      setUpload({ error: errText(e) })
    }
  }

  return (
    <>
      <p className="tiny muted">Video của {shop.shop_name}. Chọn một video có sẵn hoặc tải video mới để kiểm tra trước khi đăng.</p>
      <ul className="studio-vid-list">
        {videos.map((v) => (
          <li key={v.id}>
            <button type="button" className={`studio-vid${v.id === video?.id ? ' is-on' : ''}`} onClick={() => onSelectVideo(v.id)} aria-pressed={v.id === video?.id}>
              <Icon name={v.local_file ? 'video-tick' : 'video-slash'} />
              <span className="od-fill">
                <strong className="od-truncate">{v.product_label ?? v.id}</strong>
                <span className="tiny muted od-truncate">
                  {v.id} · {v.stage === 'prepublish' ? 'chưa đăng' : 'đã đăng'}{v.local_file ? '' : ' · không có file'}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="pn-field">
        <label className="tiny" htmlFor="upl-sku">SKU gắn với video mới</label>
        <select id="upl-sku" className="studio-select" value={skuId} onChange={(e) => setSkuId(e.target.value)}>
          {skus.map((s) => <option key={s.sku_id} value={s.sku_id}>{s.item_name}</option>)}
        </select>
      </div>
      <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska" hidden onChange={(e) => send(e.target.files?.[0])} />
      <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={!!upload && !upload.error}>
        <Icon name="video-add" /> {upload && !upload.error ? `Đang tải ${upload.progress}%` : 'Tải video mới'}
      </button>
      {upload?.error && <p className="tiny studio-err" role="alert">{upload.error}</p>}
    </>
  )
}

function CaptionPanel({ video, onSaved, extracted }) {
  const [caption, setCaption] = useState(video.post?.caption ?? '')
  const [tags, setTags] = useState((video.post?.hashtags ?? []).map((t) => `#${t}`).join(' '))
  const [suggest, setSuggest] = useState(null)
  const [state, save] = usePostSave(video, onSaved)

  const quickFill = async () => {
    if (!window.confirm('AI gợi ý caption và hashtag gọi OpenAI có tính phí (1 lần gọi nhỏ; có cache). Tiếp tục?')) return
    setSuggest({ loading: true })
    try {
      const s = await py(`/videos/${encodeURIComponent(video.id)}/caption-suggest`, { method: 'POST' })
      setCaption(s.caption ?? '')
      setTags((s.hashtags ?? []).map((t) => `#${String(t).replace(/^#/, '')}`).join(' '))
      setSuggest(s)
    } catch (e) {
      setSuggest({ error: errText(e) })
    }
  }

  return (
    <>
      <div className="pn-field">
        <label className="tiny" htmlFor="cap">Mô tả bài đăng</label>
        <textarea id="cap" className="studio-textarea" rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Viết caption như khi đăng thật…" />
      </div>
      <div className="pn-field">
        <label className="tiny" htmlFor="tags">Hashtag</label>
        <input id="tags" className="studio-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#tensanpham #congdung" />
      </div>
      <button type="button" className="btn btn-secondary" onClick={quickFill} disabled={!extracted || suggest?.loading}>
        <Icon name="magicpen" /> {suggest?.loading ? 'AI đang viết…' : 'AI gợi ý từ video và SKU'}
      </button>
      {!extracted && <p className="tiny muted">Cần trích xuất video trước (chạy phân tích một lần) thì AI mới đọc được nội dung.</p>}
      {suggest?.error && <p className="tiny studio-err" role="alert">{suggest.error}</p>}
      {suggest?.rationale && <p className="pn-note tiny">{suggest.rationale}</p>}
      {suggest?.policy_flags?.length > 0 && (
        <p className="tiny studio-err">Gợi ý có câu cần xem lại: {suggest.policy_flags.map((f) => f.rule_id ?? f).join(', ')}</p>
      )}
      <p className="tiny muted">Caption và hashtag được đưa vào phân tích: Decisions, kiểm tra policy (claim tuyệt đối, liên hệ ngoài sàn) và việc cần sửa.</p>
      <div className="studio-panel-actions">
        <button type="button" className="btn btn-primary" onClick={() => save({ caption, hashtags: parseTags(tags) })}>Lưu</button>
        <Saved state={state} />
      </div>
    </>
  )
}

function ProductsPanel({ video, skus, onSaved }) {
  const [url, setUrl] = useState('')
  const [resolved, setResolved] = useState(null)
  const [state, setState] = useState(null)
  const editable = video.stage === 'prepublish'
  const ordered = [...skus.filter((s) => s.sku_id === video.sku_id), ...skus.filter((s) => s.sku_id !== video.sku_id)]

  const choose = async (patch) => {
    setState('saving')
    try {
      onSaved(await dbPatch(`/videos/${encodeURIComponent(video.id)}`, patch))
      setState('saved')
    } catch (e) {
      setState({ error: errText(e) })
    }
  }

  const resolve = async () => {
    setResolved({ loading: true })
    try {
      setResolved(await py('/listings/resolve', { method: 'POST', body: { url: url.trim() } }))
    } catch (e) {
      setResolved({ error: errText(e) })
    }
  }

  return (
    <>
      <ul className="studio-sku-list">
        {ordered.map((s) => {
          const on = s.sku_id === video.sku_id
          return (
            <li key={s.sku_id}>
              <button
                type="button"
                className={`studio-sku${on ? ' is-on' : ''}`}
                aria-pressed={on}
                disabled={!editable && !on}
                title={!editable && !on ? 'Video đã đăng gắn cố định với SKU của nó; tải video mới để gắn SKU khác' : undefined}
                onClick={() => !on && choose({ sku_id: s.sku_id, sku_auto: false })}
              >
                <img src={`/skus/${s.sku_id}.jpg`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                <span className="od-fill">
                  <strong className="od-clamp-2">{s.item_name}</strong>
                  <span className="tiny muted">{s.price_vnd?.toLocaleString('vi-VN')}₫ · <Icon name="star" className="ic studio-star" label="rating" /> {s.rating ?? '–'}{on ? ' · đang gắn với video' : ''}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {video.sku_auto && (
        <p className="tiny studio-inline">
          <span className="od-fill">SKU này được gắn mặc định lúc tải video lên.</span>
          <button type="button" className="btn" onClick={() => choose({ sku_auto: false })}>Giữ SKU này</button>
        </p>
      )}
      <Saved state={state} />
      <div className="pn-field">
        <label className="tiny" htmlFor="shopee-url">Hoặc dán link sản phẩm Shopee</label>
        <div className="studio-inline">
          <input id="shopee-url" className="studio-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://shopee.vn/...-i.123.456" />
          <button type="button" className="btn btn-secondary" onClick={resolve} disabled={!url.trim() || resolved?.loading}>
            {resolved?.loading ? 'Đang lấy…' : 'Lấy thông tin'}
          </button>
        </div>
      </div>
      {resolved?.error && <p className="tiny studio-err" role="alert">{resolved.error}</p>}
      {resolved?.listing && (
        <div className="pn-note studio-resolved">
          <p><strong>{resolved.listing.title}</strong></p>
          <p className="tiny">{resolved.listing.price_vnd?.toLocaleString('vi-VN')}₫ · <Icon name="star" className="ic studio-star" label="rating" /> {resolved.listing.rating ?? '–'} · đã bán {resolved.listing.sold_display ?? resolved.listing.sold ?? '–'}</p>
          <p className="tiny muted">
            Nguồn: {resolved.source === 'live' ? 'cào trực tiếp' : 'dữ liệu đã cào'} · {resolved.fetched_at ?? resolved.crawled_at ?? ''}
          </p>
          {editable ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => choose({ listing: { name: resolved.listing.title, title: resolved.listing.title, url: resolved.listing.url, description: resolved.listing.description, price_vnd: resolved.listing.price_vnd, list_price_vnd: resolved.listing.list_price_vnd } })}
            >
              Dùng listing này cho video
            </button>
          ) : (
            <p className="tiny muted">Chỉ gắn được listing cho video tải lên (chưa đăng).</p>
          )}
        </div>
      )}
    </>
  )
}

function AudiencePanel({ video, audience, onSaved }) {
  const [sponsorship, setSponsorship] = useState(video.post?.sponsorship ?? 'own_shop')
  const [disclosure, setDisclosure] = useState(!!video.post?.disclosure_enabled)
  const [goal, setGoal] = useState(video.post?.goal ?? '')
  const [state, save] = usePostSave(video, onSaved)
  const pct = (x) => `${Math.round(x * 100)}%`
  return (
    <>
      {audience ? (
        <div className="studio-audience">
          <p className="tiny muted">Audience của SKU</p>
          <dl className="studio-kpis">
            {/* the larger share reads at a glance: "Nam 85%" for a men's product, not "Nữ 15%" */}
            {(audience.gender_split?.male ?? 0) > (audience.gender_split?.female ?? 0)
              ? <div><dt>Nam</dt><dd>{pct(audience.gender_split.male)}</dd></div>
              : <div><dt>Nữ</dt><dd>{pct(audience.gender_split?.female ?? 0)}</dd></div>}
            <div><dt>Tuổi chính</dt><dd>{Object.entries(audience.age_bands ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '–'}</dd></div>
            <div><dt>Khu vực</dt><dd>{Object.entries(audience.regions ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '–'}</dd></div>
          </dl>
          <p className="tiny">Quan tâm: {(audience.interests ?? []).join(', ') || '–'}</p>
        </div>
      ) : (
        <p className="tiny muted">SKU này chưa có dữ liệu audience.</p>
      )}
      <fieldset className="pn-field studio-fieldset">
        <legend className="tiny">Ai đăng video</legend>
        {SPONSORSHIP.map(([v, l]) => (
          <label key={v} className="studio-check">
            <input type="radio" name="sp" value={v} checked={sponsorship === v} onChange={() => setSponsorship(v)} /> {l}
          </label>
        ))}
      </fieldset>
      <label className="studio-check">
        <input type="checkbox" checked={disclosure} onChange={(e) => setDisclosure(e.target.checked)} /> Bật nhãn quảng cáo / hợp tác có trả phí
      </label>
      <div className="pn-field">
        <label className="tiny" htmlFor="goal">Mục tiêu</label>
        <select id="goal" className="studio-select" value={goal} onChange={(e) => setGoal(e.target.value)}>
          {GOALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="studio-panel-actions">
        <button type="button" className="btn btn-primary" onClick={() => save({ sponsorship, disclosure_enabled: disclosure, goal: goal || null })}>Lưu</button>
        <Saved state={state} />
      </div>
    </>
  )
}

/** mockup-v2's platform panel: pick the platform the phone shows; every platform is scored in the same run. */
function PlatformPanel({ result, skin, onSkin }) {
  return (
    <>
      <SkinOptions skin={skin} rows={platformView(result)?.rows ?? []} onPick={onSkin} />
      <p className="tiny muted">
        {result ? 'Điểm từng nền tảng đã được chấm sẵn trong lần phân tích. Đổi nền tảng chỉ đổi cách xem, không chấm lại.' : 'Điểm theo từng nền tảng có sau khi phân tích.'}
      </p>
    </>
  )
}

/** The floating panel mockup-v2 lays over the left column; one at a time, opened from the rail. */
export function EditPanel({ panel, onClose, ...props }) {
  const def = PANELS.find((p) => p.id === panel)
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel, onClose])
  if (!def) return null
  const { video } = props
  return (
    <section ref={ref} className="edit-panel" role="dialog" aria-modal="false" aria-labelledby="editPanelTitle" tabIndex={-1}>
      <div className="ep-head">
        <h2 id="editPanelTitle">{def.title}</h2>
        <button type="button" className="ep-x" onClick={onClose} aria-label="Đóng"><Icon name="close" /></button>
      </div>
      <div className="ep-body">
        {panel === 'video' && <VideoPanel key={video?.id ?? 'none'} {...props} />}
        {panel !== 'video' && !video && <p className="tiny muted">Chọn hoặc tải video trước.</p>}
        {panel === 'caption' && video && <CaptionPanel key={video.id} {...props} />}
        {panel === 'products' && video && <ProductsPanel key={video.id} {...props} />}
        {panel === 'audience' && video && <AudiencePanel key={video.id} {...props} />}
        {panel === 'platform' && video && <PlatformPanel key={video.id} {...props} />}
      </div>
    </section>
  )
}
