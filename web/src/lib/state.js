export const platformNames = {
  tiktok_shop_video: 'TikTok Shop', tiktok_ads: 'TikTok Ads', shopee_listing: 'Shopee', meta_ads: 'Meta Ads',
};

export function contextFrom(video = {}) {
  return {
    shop_id: video.shop_id || null, sku_id: video.sku_id || null,
    caption: video.caption || '', hashtags: video.hashtags || [], audience: video.audience || '',
    platforms: video.platforms || ['tiktok_shop_video'], published: video.published || false,
    outcome: video.outcome || null,
  };
}

export function stepState(steps, event, data) {
  const previous = steps[data.id] || {};
  return { ...steps, [data.id]: { ...previous, ...data, status: event === 'step_started' ? 'running' : data.status || previous.status } };
}

export function timeLabel(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

export function metric(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
}
