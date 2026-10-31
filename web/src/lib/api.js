// /api -> json-server (data), /py -> FastAPI (analysis). Both proxied by Vite.

async function http(url, options) {
  const res = await fetch(url, options)
  if (!res.ok) {
    let message = await res.text()
    try {
      const detail = JSON.parse(message).detail ?? message
      message = detail?.message ?? detail // some endpoints send {message, ...} as the detail
    } catch {
      // plain-text error body
    }
    if (typeof message !== 'string') message = JSON.stringify(message)
    if (!message.trim() || message.trim() === '{}') {
      message = res.status === 404 ? `Không tìm thấy ${url.replace(/^\/api/, '')}` : res.statusText || 'Lỗi không rõ'
    }
    throw new Error(`${res.status} ${message}`)
  }
  return res
}

export async function db(path) {
  return (await http(`/api${path}`)).json()
}

export async function dbPatch(path, body) {
  const res = await http(`/api${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

/** JSON request to FastAPI: py('/videos/X/post', {method: 'PATCH', body}) */
export async function py(path, { method = 'GET', body } = {}) {
  const res = await http(`/py${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

export async function dbPage(collection, page, limit) {
  const res = await http(`/api/${collection}?_page=${page}&_limit=${limit}`)
  return { rows: await res.json(), total: Number(res.headers.get('X-Total-Count') ?? 0) }
}

/** Crawled market snapshot of a SKU; null when none was crawled (404). */
export async function marketSnapshot(skuId) {
  try {
    return await db(`/marketSnapshots/${encodeURIComponent(skuId)}`)
  } catch (e) {
    if (String(e.message).startsWith('404')) return null
    throw e
  }
}

export async function runAnalysis(path, params) {
  const res = await http(`/py${path}?${new URLSearchParams(params)}`, { method: 'POST' })
  return res.json()
}

// XHR instead of fetch: fetch has no upload progress. onProgress gets 0-100.
export function uploadVideo(form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/py/videos/upload')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => {
      let body = xhr.responseText
      try {
        body = JSON.parse(body)
      } catch {
        // plain-text error body
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body)
      const detail = body?.detail ?? body
      reject(new Error(`${xhr.status} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`))
    }
    xhr.onerror = () => reject(new Error('Không kết nối được FastAPI (8100)'))
    xhr.send(form)
  })
}

const nf = new Intl.NumberFormat('vi-VN')
const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 })

// A missing value is "–", never 0 (Intl.NumberFormat formats null as "0").
export const num = (n) => (n == null || Number.isNaN(Number(n)) ? '–' : nf.format(n))
export const vnd = (n) => (n == null || Number.isNaN(Number(n)) ? '–' : `${nf.format(Math.round(n))} đ`)
export const compactNum = (n) => (n == null || Number.isNaN(Number(n)) ? '–' : compact.format(n))
export const compactVnd = (n) => (n == null || Number.isNaN(Number(n)) ? '–' : `${compact.format(n)} đ`)
export const pct = (x, digits = 1) => (x == null ? '–' : `${(x * 100).toFixed(digits)}%`)
export const ratio = (a, b) => (b ? a / b : 0)

/** Short display of any JSON value (feature values, inputs). */
export const showValue = (v, max = 140) => {
  if (v === null || v === undefined) return 'null'
  const t = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
