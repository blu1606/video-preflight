export async function request(path, options = {}) {
  const response = await fetch(`/py${path}`, {
    ...options,
    headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : Array.isArray(data.detail)
      ? data.detail.map((item) => `${item.loc?.slice(1).join('.')}: ${item.msg}`).join('; ') : `API lỗi (${response.status})`;
    throw new Error(detail);
  }
  return data;
}

export function uploadVideo(file, context, onProgress) {
  return new Promise((resolve, reject) => {
    const data = new FormData();
    data.append('file', file);
    data.append('context', JSON.stringify(context));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/py/videos/upload');
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onerror = () => reject(new Error('Không kết nối được API upload.'));
    xhr.onload = () => {
      let payload;
      try { payload = JSON.parse(xhr.responseText); } catch { reject(new Error('API không trả JSON hợp lệ.')); return; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
      else reject(new Error(typeof payload.detail === 'string' ? payload.detail : 'Thông tin upload không hợp lệ.'));
    };
    xhr.send(data);
  });
}
