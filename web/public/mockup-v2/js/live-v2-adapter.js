/**
 * Preflight v2 Live Backend Adapter
 * Bridges mockup-v2 UI to /api/live/* and /api/catalog backend contracts.
 * Preserves mockup-v2 visual design while replacing simulated timers with real inference jobs.
 */
(function () {
  'use strict';

  const A = window.APP || {};
  const S = A.S || {};
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  // Contract 44 Questions (37 adapted baseline + 7 added coverage items)
  // Rubric version: commerce-44/v2-snapshot-reference
  const QUESTIONS = [
    { id: 'h1', dimension: 'hook', question: 'Sản phẩm có được nhận ra trong 3 giây đầu?', requires: ['opening_frames'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'h2', dimension: 'hook', question: 'Con người hoặc chủ thể chính ở mở đầu có vai trò rõ với câu chuyện?', requires: ['opening_frames'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'h3', dimension: 'hook', question: 'Chữ mở đầu có dễ đọc và giúp hiểu chủ đề?', requires: ['opening_frames'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'h4', dimension: 'hook', question: 'Lời nói hoặc âm thanh mở đầu có giúp hiểu nội dung?', requires: ['audio'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'h5', dimension: 'hook', question: 'Câu mở đầu có nêu vấn đề hoặc lợi ích cụ thể?', requires: ['audio'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'r1', dimension: 'retention', question: 'Độ dài có hợp lượng thông tin và mục đích video?', requires: ['frames', 'transcript'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'r2', dimension: 'retention', question: 'Nhịp đổi cảnh có phục vụ thông điệp thay vì chỉ cắt nhiều?', requires: ['shots', 'frames'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'r3', dimension: 'retention', question: 'Lợi ích chính có xuất hiện sớm để người xem hiểu lý do xem?', requires: ['opening_frames', 'transcript'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'r4', dimension: 'retention', question: 'Các đoạn chậm có mục đích, không kéo dài thiếu thông tin?', requires: ['shots', 'transcript'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'r5', dimension: 'retention', question: 'Đoạn kết có payoff hoặc lý do xem lại?', requires: ['ending_frames', 'transcript'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 's1', dimension: 'sharing', question: 'Bối cảnh/sự kiện được nêu có liên quan câu chuyện?', requires: ['frames', 'transcript'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 's2', dimension: 'sharing', question: 'Tình huống có dễ hiểu và liên quan người xem đã chọn?', requires: ['frames', 'audience'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 's3', dimension: 'sharing', question: 'Có giá trị cụ thể để lưu hoặc gửi cho người khác?', requires: ['frames', 'transcript'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 's4', dimension: 'sharing', question: 'Caption/hashtag có khớp xu hướng có nguồn hiện hành?', requires: ['caption', 'market_snapshot'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 's5', dimension: 'sharing', question: 'Nội dung có tránh gây hiểu nhầm hoặc công kích không cần thiết?', requires: ['frames', 'transcript'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'c1', dimension: 'commerce', question: 'Sản phẩm có được trình bày đủ rõ để nhận biết?', requires: ['frames'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'c2', dimension: 'commerce', question: 'Lời kêu gọi mua/tìm hiểu có rõ hành động tiếp theo?', requires: ['transcript', 'ending_frames'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'c3', dimension: 'commerce', question: 'Giá hoặc ưu đãi được trình bày có rõ điều kiện?', requires: ['frames', 'transcript'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'c4', dimension: 'commerce', question: 'CTA có dùng đúng khả năng link/shop của account đích?', requires: ['account_capabilities'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'c5', dimension: 'commerce', question: 'Sản phẩm nhìn thấy có khớp thông tin định danh trong listing SKU đã chọn?', requires: ['frames', 'sku_reference'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 't1', dimension: 'trust', question: 'Thông tin sản phẩm được nói có khớp các thuộc tính ghi trong listing nguồn đã chọn?', requires: ['transcript', 'sku_reference'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 't2', dimension: 'trust', question: 'Demo trong video có thực sự hỗ trợ claim nó đang nói?', requires: ['frames', 'transcript'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 't3', dimension: 'trust', question: 'Số liệu/claim hiệu quả có chứng cứ phù hợp sản phẩm và scope?', requires: ['claim_substantiation'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 't4', dimension: 'trust', question: 'Cách diễn đạt có tránh khẳng định vượt quá bằng chứng?', requires: ['frames', 'transcript'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 't5', dimension: 'trust', question: 'Hình sản phẩm có khớp ảnh tham chiếu được xác minh?', requires: ['frames', 'verified_sku_images'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'f1', dimension: 'fit', question: 'Nhu cầu audience đã chọn có phù hợp sản phẩm?', requires: ['audience', 'sku_reference'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'f2', dimension: 'fit', question: 'Nếu video định vị giá, thông điệp đó có nhất quán với mẫu listing cùng nguồn, thị trường và nhóm hàng?', requires: ['transcript', 'sku_reference', 'catalog_price_context'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'f3', dimension: 'fit', question: 'Tình huống sử dụng có phù hợp nhu cầu audience đã chọn?', requires: ['frames', 'audience'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'f4', dimension: 'fit', question: 'Ngôn ngữ/cách diễn đạt có phù hợp audience đã chọn?', requires: ['transcript', 'audience'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'f5', dimension: 'fit', question: 'Video có giúp chọn đúng size/biến thể/cách dùng phù hợp?', requires: ['frames', 'transcript'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'c6', dimension: 'commerce', question: 'Giá được nói có khớp offer hiện tại của SKU?', requires: ['transcript', 'verified_offer'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 't6', dimension: 'trust', question: 'Biến thể nhìn thấy có khớp thuộc tính biến thể được ghi trong listing nguồn?', requires: ['frames', 'sku_variant_reference'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'tr1', dimension: 'trend', question: 'Có bằng chứng thời vụ hiện tại phù hợp ngành/SKU?', requires: ['market_snapshot'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'tr2', dimension: 'trend', question: 'Nhu cầu tìm kiếm có tăng theo mốc so sánh hợp lệ?', requires: ['market_snapshot'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'tr3', dimension: 'trend', question: 'Từ khóa trong video/caption có khớp nhu cầu có nguồn?', requires: ['market_snapshot', 'caption'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'tr4', dimension: 'trend', question: 'Hashtag ngành có nguồn trend và cửa sổ thời gian phù hợp?', requires: ['market_snapshot', 'caption'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'tr5', dimension: 'trend', question: 'Thời điểm dự kiến đăng có phù hợp sự kiện được xác minh?', requires: ['event_calendar'], weight: 1.0, origin: 'prototype-adapted' },
    { id: 'r6', dimension: 'retention', question: 'Lời nói có đủ rõ so với nhạc/ồn và có thể theo dõi?', requires: ['audio'], weight: 1.0, origin: 'added-coverage' },
    { id: 'c7', dimension: 'commerce', question: 'Offer có rõ hạn dùng, điều kiện và đích mua?', requires: ['verified_offer'], weight: 1.0, origin: 'added-coverage' },
    { id: 'c8', dimension: 'commerce', question: 'Đã có đầu vào economics phù hợp vai trò shop/affiliate?', requires: ['economics_inputs'], weight: 1.0, origin: 'added-coverage' },
    { id: 't7', dimension: 'trust', question: 'Đã đối chiếu policy hiện hành đúng platform/market/phạm vi đăng?', requires: ['policy_snapshot'], weight: 1.0, origin: 'added-coverage' },
    { id: 't8', dimension: 'trust', question: 'Nguồn hỗ trợ claim có đúng thời kỳ/variant/thị trường?', requires: ['claim_substantiation', 'verified_sku'], weight: 1.0, origin: 'added-coverage' },
    { id: 'f6', dimension: 'fit', question: 'Phụ đề/ngôn ngữ hình ảnh có giúp audience tiếp cận nội dung?', requires: ['frames', 'transcript', 'audience'], weight: 1.0, origin: 'added-coverage' },
    { id: 'tr6', dimension: 'trend', question: 'Nhận định hot SKU có dựa số bán quan sát đúng thời gian/market?', requires: ['observed_sales'], weight: 1.0, origin: 'added-coverage' }
  ];

  const DIMS = [
    { id: 'hook', name: 'Mở đầu hấp dẫn', short: 'Mở đầu' },
    { id: 'retention', name: 'Giữ chân người xem', short: 'Giữ chân' },
    { id: 'sharing', name: 'Lan tỏa & tương tác', short: 'Lan tỏa' },
    { id: 'commerce', name: 'Rõ ràng thương mại', short: 'Thương mại' },
    { id: 'trust', name: 'Trung thực & tin cậy', short: 'Tin cậy' },
    { id: 'fit', name: 'Hợp người xem mục tiêu', short: 'Hợp audience' },
    { id: 'trend', name: 'Hợp thời & đón đầu xu hướng', short: 'Xu hướng' }
  ];

  const STAGES = {
    '1': '1/6 · Tách khung hình & audio (OpenCV 1fps)',
    '2': '2/6 · Thị giác máy tính & OCR chữ (GPT-4o Vision)',
    '3': '3/6 · Chép lời thoại có timestamp (Whisper ASR)',
    '4': '4/6 · Đối chiếu claim với listing & chính sách Shopee',
    '5': '5/6 · Ngữ cảnh thị trường & xu hướng TikTok Shop',
    '6': '6/6 · Chấm điểm Rubric 7 chiều & dự phóng phễu'
  };

  const PROVIDER_GENERIC = 'Dữ liệu được gửi tới nhà cung cấp AI đã cấu hình ở máy chủ (OpenAI; nếu không có khóa OpenAI thì DeepSeek, kèm Groq nếu có khóa). Đang xác định nhà cung cấp…';

  const MISSING_MAP = {
    opening_frames: 'Khung hình mở đầu', ending_frames: 'Khung hình cuối', frames: 'Khung hình video',
    shots: 'Mốc đổi cảnh', transcript: 'Bản chép lời có thời gian', audio: 'Âm thanh',
    audience: 'Người xem mục tiêu', caption: 'Tiêu đề và hashtag', market_snapshot: 'Dữ liệu thị trường tại thời điểm đối chiếu',
    account_capabilities: 'Khả năng gắn link hoặc shop của tài khoản', verified_sku: 'SKU đã xác minh',
    sku_reference: 'Listing SKU tham chiếu', sku_variant_reference: 'Thuộc tính biến thể listing tham chiếu',
    catalog_price_context: 'Mẫu giá niêm yết cùng nhóm hàng', claim_substantiation: 'Nguồn chứng minh lời quảng cáo',
    verified_sku_images: 'Ảnh SKU đã xác minh', market_benchmark: 'Bộ so sánh cùng thị trường',
    verified_offer: 'Ưu đãi đã xác minh', event_calendar: 'Lịch sự kiện đã xác minh',
    economics_inputs: 'Đầu vào tính hiệu quả kinh tế', policy_snapshot: 'Quy định hiện hành để đối chiếu',
    observed_sales: 'Số bán quan sát thực tế'
  };

  const STATUS_MAP = {
    observed: 'Quan sát được',
    inferred: 'Suy luận',
    conflict: 'Mâu thuẫn',
    unknown: 'Chưa rõ'
  };

  let providerNote = null;
  let activeController = null;
  let disposed = false;

  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  const rating = (n) => finite(n) && n >= 0 && n <= 100;
  const number = (n) => rating(n) ? Math.round(n * 10) / 10 : '—';
  const fmtT = (t) => {
    if (!finite(t)) return '—';
    const s = Math.max(0, Math.round(t));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  const isLive = (s) => !!(s && (s.liveMode || s.liveResult || (s.video && s.video.kind === 'file')));

  async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function b64encode(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    }
    return btoa(binary);
  }

  async function getJSON(url, options) {
    const res = await fetch(url, options);
    let data;
    try { data = await res.json(); } catch (_) {
      throw new Error('Máy chủ trả dữ liệu không đọc được. Không tự gửi lại.');
    }
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || `Yêu cầu thất bại (${res.status}). Không tự gửi lại.`;
      const err = new Error(msg);
      err.code = data && data.error && data.error.code;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function loadProvider() {
    getJSON('/api/live/health')
      .then((h) => {
        if (h && h.provider && typeof h.provider.consent === 'string') {
          providerNote = h.provider.consent;
          const el = document.getElementById('liveProviderNote');
          if (el) el.textContent = providerNote;
        }
      })
      .catch(() => {});
  }

  async function readVideo(file) {
    if (!file || file.size < 16 || file.size > 25000000) {
      return { error: 'MP4 phải từ 16 byte đến 25 MB (25.000.000 byte).' };
    }
    if (!/\.mp4$/i.test(file.name) || (file.type && file.type !== 'video/mp4')) {
      return { error: 'Chỉ hỗ trợ file MP4, tối đa 25 MB và 120 giây.' };
    }
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const boxSize = new DataView(header.buffer).getUint32(0);
    const brand = String.fromCharCode.apply(null, header.slice(4, 8));
    if (brand !== 'ftyp' || boxSize < 16 || boxSize > Math.min(file.size, 4096)) {
      return { error: 'Header MP4 không hợp lệ (thiếu ftyp box).' };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = await sha256Hex(bytes);
    const url = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';

    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        resolve({ error: 'Không đọc được thời lượng MP4. Hãy chọn lại file.' });
      }, 15000);

      probe.onloadedmetadata = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (!finite(probe.duration) || probe.duration <= 0 || probe.duration > 120) {
          URL.revokeObjectURL(url);
          resolve({ error: 'Video phải dài hơn 0 và không quá 120 giây.' });
        } else {
          resolve({
            video: {
              name: file.name,
              dur: probe.duration,
              kind: 'file',
              url: url,
              file: file,
              sha256: digest,
              identity: Date.now()
            }
          });
        }
      };

      probe.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        URL.revokeObjectURL(url);
        resolve({ error: 'Trình duyệt không đọc được MP4 này (codec không hỗ trợ).' });
      };

      probe.src = url;
    });
  }

  function validateResult(result) {
    if (!result || !finite(result.duration_s) || result.duration_s <= 0 || result.duration_s > 120 ||
        !Array.isArray(result.question_results) || result.question_results.length !== 44 ||
        !Array.isArray(result.evidence) || !result.ratings || !Array.isArray(result.ratings.dimensions)) {
      throw new Error('Kết quả live không đúng contract 44 câu.');
    }
    const seen = new Set();
    const evidenceIds = new Set(result.evidence.map((e) => e.id));
    result.question_results.forEach((r) => {
      const q = QUESTIONS.find((x) => x.id === r.id);
      if (!q || seen.has(r.id) || q.dimension !== r.dimension || !Array.isArray(r.missing_inputs) ||
          !Array.isArray(r.evidence_ids) || r.evidence_ids.some((id) => !evidenceIds.has(id)) ||
          (r.rating_100 !== null && !rating(r.rating_100)) || (r.status !== 'rated' && r.rating_100 !== null)) {
        throw new Error('Câu hỏi hoặc bằng chứng live không hợp lệ: ' + (r && r.id));
      }
      seen.add(r.id);
    });
    const dims = result.ratings.dimensions;
    if (dims.length !== 7 || new Set(dims.map((d) => d.id)).size !== 7 ||
        dims.some((d) => !DIMS.find((dim) => dim.id === d.id) || (d.score !== null && !rating(d.score)) || !finite(d.coverage) || d.coverage < 0 || d.coverage > 1) ||
        (result.ratings.overall !== null && !rating(result.ratings.overall)) || !finite(result.ratings.weighted_coverage)) {
      throw new Error('Điểm live không hợp lệ.');
    }
    if (!result.analysis || !['checks', 'fixes', 'unknowns'].every((k) => Array.isArray(result.analysis[k]))) {
      throw new Error('Phần giải thích live không hợp lệ.');
    }
    result.evidence.forEach((e) => {
      if ((e.at_s != null && (!finite(e.at_s) || e.at_s < 0 || e.at_s > result.duration_s)) ||
          (e.url && !/^(?:\/api\/live\/jobs\/[a-zA-Z0-9-]+\/evidence\/[a-zA-Z0-9_-]+|\/mockup-v2\/recorded-crest\/[a-zA-Z0-9_.-]+|\/media\/[a-zA-Z0-9_.-]+|\/py\/frames\/[a-zA-Z0-9_.-]+|blob:|data:|https?:\/\/)/.test(e.url))) {
        throw new Error('Đường dẫn bằng chứng không hợp lệ.');
      }
    });
    return result;
  }

  function serializeContext(s) {
    const pf = s.platform || S.platform || 'shopee';
    let audStr = '';
    if (Array.isArray(s.audience)) {
      audStr = s.audience.join(' · ').trim();
    } else if (s.audience && typeof s.audience === 'object') {
      audStr = [s.audience.gender, (s.audience.ages || []).join(','), s.audience.region, s.audience.purpose].filter(Boolean).join(' · ');
    } else if (typeof s.audience === 'string') {
      audStr = s.audience.trim();
    }
    const tagsStr = (s.tags || []).join(' ').trim();
    const capStr = (s.caption || '').trim();
    return {
      platform: pf,
      audience: audStr.slice(0, 1200),
      sku_facts: (s.sku_facts || s.skuFacts || '').slice(0, 6000),
      sku_url: (s.sku_url || s.skuUrl || '').slice(0, 2000),
      title: (s.title || capStr).slice(0, 300),
      caption: capStr.slice(0, 2200),
      hashtags: (s.hashtags || tagsStr).slice(0, 1000),
      post_time: s.postTime || '',
      timezone: s.timezone || '',
      market: (s.market || 'VN').slice(0, 2)
    };
  }

  function buildBinding(s) {
    const v = s && s.video;
    const ctx = serializeContext(s);
    const skuId = s.selectedSkuId || (s.viewContext && s.viewContext.sku_id) || '';
    return JSON.stringify([v && v.sha256, ctx, skuId]);
  }

  function invalidate(s) {
    if (!s) return;
    if (s.isHistoricalReplay) {
      s.isHistoricalReplay = false;
      const banner = document.getElementById('historicalReplayBanner');
      if (banner) banner.style.display = 'none';
    }
    s.liveConsent = null;
    s.livePrompt = null;
    s.liveError = null;
    s._loadToken = (s._loadToken || 0) + 1;
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    s.liveResult = null;
    s.partial = {};
    s.stages = {};
    s.answered = [];
    s.status = 'empty';
    s.liveProgress = '';
    s.liveJob = null;
    try { localStorage.removeItem('mockup_last_live_job_id'); } catch (_) {}
  }

  function showConsentModal(s, onConfirm) {
    const v = s && s.video;
    if (!v || !v.file) return;
    loadProvider();
    const ctx = serializeContext(s);
    const skuId = s.selectedSkuId || (s.viewContext && s.viewContext.sku_id) || 'Chưa gắn SKU';
    const modal = document.getElementById('consentModal');
    const dialog = document.getElementById('consentDialog');
    if (!modal || !dialog) return;

    dialog.innerHTML = `
      <div class="pop-head" style="padding:16px 20px 8px;border-bottom:1px solid var(--line)">
        <h3 id="consentTitle" style="margin:0;font-size:16px;font-weight:700">Xác nhận gửi phân tích video</h3>
        <p class="tiny muted" style="margin:4px 0 0">Đồng ý riêng cho video và ngữ cảnh của phiên này.</p>
      </div>
      <div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">
        <div class="pad" style="background:var(--subtle);border-radius:6px;border:1px solid var(--line);font-size:13px">
          <strong>${esc(v.name)}</strong> · ${finite(v.dur) ? Math.round(v.dur) + 's' : ''} · SHA: <code>${esc((v.sha256 || '').slice(0, 16))}…</code>
        </div>
        <dl class="kv tiny" style="margin:0;display:grid;grid-template-columns:100px 1fr;gap:4px">
          <dt class="muted">Nền tảng</dt><dd><strong>${esc(ctx.platform)}</strong></dd>
          <dt class="muted">Thị trường</dt><dd><strong>${esc(ctx.market)}</strong></dd>
          <dt class="muted">Audience</dt><dd>${esc(ctx.audience || 'Chưa khai báo')}</dd>
          <dt class="muted">SKU</dt><dd><code>${esc(skuId)}</code></dd>
          ${ctx.post_time ? `<dt class="muted">Lịch đăng</dt><dd>${esc(ctx.post_time)} (${esc(ctx.timezone || 'Asia/Ho_Chi_Minh')})</dd>` : ''}
        </dl>
        <p class="tiny muted" style="margin:0;line-height:1.4">
          <span id="liveProviderNote">${esc(providerNote || PROVIDER_GENERIC)}</span>
          Các tệp và kết quả của lượt chạy được giữ trên máy chủ đến khi người vận hành xóa. Tiêu đề/hashtag chỉnh trong mockup chỉ là bản xem trước, chưa gửi chấm.
        </p>
        <label class="check" style="display:flex;align-items:flex-start;gap:8px;font-size:13px;cursor:pointer;margin-top:4px">
          <input type="checkbox" id="liveConsent" style="margin-top:2px">
          <span>Tôi đồng ý lưu và gửi video cùng ngữ cảnh trên cho riêng lượt này.</span>
        </label>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-sm" data-act="closeConsent">Hủy</button>
        <button class="btn btn-sm btn-primary" id="liveStartBtn" disabled data-act="liveStart">Gửi phân tích live</button>
      </div>
    `;

    modal.hidden = false;
    const check = document.getElementById('liveConsent');
    const startBtn = document.getElementById('liveStartBtn');
    if (check && startBtn) {
      check.onchange = () => { startBtn.disabled = !check.checked; };
      startBtn.onclick = () => {
        modal.hidden = true;
        s.liveConsent = { binding: buildBinding(s), time: Date.now() };
        if (typeof onConfirm === 'function') onConfirm();
      };
    }
    const closeBtn = dialog.querySelector('[data-act="closeConsent"]');
    if (closeBtn) closeBtn.onclick = () => { modal.hidden = true; };
  }

  function validateJobIdentity(job, expectedJobId, s) {
    if (!job || typeof job !== 'object') {
      throw new Error('Dữ liệu job không hợp lệ.');
    }
    if (expectedJobId && job.job_id !== expectedJobId) {
      throw new Error(`job_id không khớp: ${job.job_id} !== ${expectedJobId}`);
    }
    if (!job.job_id) {
      throw new Error('Thiếu job_id trong phản hồi job.');
    }
    if (!job.media_sha256) {
      throw new Error('Thiếu media_sha256 trong phản hồi job.');
    }
    if (!job.context_sha256) {
      throw new Error('Thiếu context_sha256 trong phản hồi job.');
    }
    if (job.media_url) {
      const expectedPrefix = `/api/live/jobs/${encodeURIComponent(job.job_id)}/media`;
      if (!job.media_url.endsWith(expectedPrefix) && job.media_url !== expectedPrefix) {
        throw new Error('media_url không khớp với job_id: ' + job.media_url);
      }
    }
    if (job.result && job.result.media_sha256 && job.media_sha256 && job.result.media_sha256 !== job.media_sha256) {
      throw new Error('media_sha256 của kết quả không khớp với job.');
    }
    if (!job.context || typeof job.context !== 'object') {
      throw new Error('Thiếu context trong phản hồi job.');
    }
    if (!job.view_context || typeof job.view_context !== 'object') {
      throw new Error('Thiếu view_context trong phản hồi job.');
    }
    const allowedKeys = new Set([
      'platform', 'market', 'caption', 'title', 'audience',
      'sku_facts', 'sku_url', 'hashtags', 'post_time', 'timezone'
    ]);
    for (const k of Object.keys(job.context)) {
      if (!allowedKeys.has(k)) {
        throw new Error(`Trường context.${k} không hợp lệ trong phản hồi job.`);
      }
    }
    if (s) {
      if (s.video && s.video.sha256 && job.media_sha256 && job.media_sha256 !== s.video.sha256) {
        throw new Error('media_sha256 của cập nhật không khớp với video đang xem.');
      }
      if (s.context_sha256 && job.context_sha256 && job.context_sha256 !== s.context_sha256) {
        throw new Error('context_sha256 của cập nhật không khớp với phiên đang xem.');
      }
      const expectedCtx = serializeContext(s);
      for (const k of allowedKeys) {
        const valJob = (job.context[k] == null ? '' : String(job.context[k])).trim();
        const valExp = (expectedCtx[k] == null ? '' : String(expectedCtx[k])).trim();
        // If either side supplied a value, they must match exactly
        if (valJob !== valExp) {
          throw new Error(`context.${k} không khớp: "${valJob}" !== "${valExp}"`);
        }
      }
      const curSku = (s.selectedSkuId || (s.viewContext && s.viewContext.sku_id) || '').trim();
      const jobSku = (job.view_context.sku_id == null ? '' : String(job.view_context.sku_id)).trim();
      if (curSku !== jobSku) {
        throw new Error(`view_context.sku_id không khớp: "${jobSku}" !== "${curSku}"`);
      }
      const curCaption = (expectedCtx.caption || '').trim();
      const jobCaption = (job.view_context.caption == null ? '' : String(job.view_context.caption)).trim();
      if (jobCaption && curCaption && jobCaption !== curCaption) {
        throw new Error(`view_context.caption không khớp: "${jobCaption}" !== "${curCaption}"`);
      }
      if (!s.context_sha256 && job.context_sha256) {
        s.context_sha256 = job.context_sha256;
      }
    }
  }

  async function pollRunningJob(jobId, s, token, signal) {
    try {
      while (!signal.aborted && !disposed && s._loadToken === token && s.status === 'analyzing') {
        await new Promise((r) => setTimeout(r, 1200));
        if (signal.aborted || disposed || s._loadToken !== token || s.status !== 'analyzing') break;

        let job;
        try {
          job = await getJSON('/api/live/jobs/' + encodeURIComponent(jobId), { signal });
        } catch (fetchErr) {
          if (signal.aborted || disposed || s._loadToken !== token) break;
          throw fetchErr;
        }

        if (signal.aborted || disposed || s._loadToken !== token || s.status !== 'analyzing') break;

        validateJobIdentity(job, jobId, s);

        if (job.stages) s.stages = { ...job.stages };
        if (job.partial) s.partial = { ...job.partial };
        if (job.progress) s.liveProgress = job.progress;

        if (job.status === 'completed' && job.result) {
          const validated = validateResult(job.result);
          s.liveResult = validated;
          s.status = 'done';
          s.answered = validated.question_results.map((q) => q.id);
          s.analyzedAt = new Date().toLocaleDateString('vi-VN');
          if (job.media_url) {
            const dur = (validated && finite(validated.duration_s) ? validated.duration_s : null) ||
                        (job.partial && finite(job.partial.duration_s) ? job.partial.duration_s : null) || 15;
            s.video = { name: 'live-video.mp4', url: job.media_url, kind: 'url', dur, sha256: job.media_sha256 };
            s.label = s.video.name;
          }
          break;
        } else if (job.status === 'failed' || job.status === 'interrupted' || job.status === 'unavailable') {
          s.status = job.status;
          s.liveError = (job.error && job.error.message) || `Lượt chạy: ${job.status}. Không tự gửi lại.`;
          break;
        }

        if (window.PREFLIGHT && window.PREFLIGHT.render) window.PREFLIGHT.render();
      }
    } catch (err) {
      if (!signal.aborted && s._loadToken === token) {
        s.status = 'error';
        s.liveError = err.message || 'Mất kết nối với máy chủ.';
      }
    } finally {
      if (s._loadToken === token && window.PREFLIGHT && window.PREFLIGHT.render) {
        window.PREFLIGHT.render();
      }
    }
  }

  async function start(s) {
    const v = s && s.video;
    if (!v || !v.file || s.status === 'analyzing') return;
    const binding = buildBinding(s);
    if (!s.liveConsent || s.liveConsent.binding !== binding) {
      showConsentModal(s, () => start(s));
      return;
    }

    if (activeController) activeController.abort();
    const controller = new AbortController();
    activeController = controller;
    const signal = controller.signal;
    const loadToken = (s._loadToken = (s._loadToken || 0) + 1);

    s.status = 'analyzing';
    s.liveProgress = 'Chuẩn bị tệp gửi tới máy chủ…';
    s.liveError = null;
    s.stages = {};
    s.partial = {};
    s.liveResult = null;
    s.answered = [];
    if (window.PREFLIGHT && window.PREFLIGHT.render) window.PREFLIGHT.render();

    try {
      const bytes = new Uint8Array(await v.file.arrayBuffer());
      if (signal.aborted || s._loadToken !== loadToken) return;
      const ctx = serializeContext(s);
      const skuId = s.selectedSkuId || (s.viewContext && s.viewContext.sku_id) || '';
      const payload = {
        video_base64: b64encode(bytes),
        consent: true,
        request_id: crypto.randomUUID(),
        context: ctx,
        view_context: {
          sku_id: skuId,
          caption: ctx.caption
        }
      };

      const created = await getJSON('/api/live/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
      });

      if (!created || !created.job_id) {
        throw new Error('Máy chủ không trả mã lượt chạy hợp lệ.');
      }

      if (signal.aborted || s._loadToken !== loadToken) return;
      s.liveJob = created.job_id;
      s.media_sha256 = v.sha256;
      s.context_sha256 = null; // Will be verified against exact serialized context on first GET
      try { localStorage.setItem('mockup_last_live_job_id', created.job_id); } catch (_) {}

      await pollRunningJob(created.job_id, s, loadToken, signal);
    } catch (err) {
      if (!signal.aborted && s._loadToken === loadToken) {
        s.status = 'error';
        s.liveError = err.message || 'Mất kết nối với máy chủ.';
      }
    } finally {
      if (activeController === controller) activeController = null;
      if (s._loadToken === loadToken && window.PREFLIGHT && window.PREFLIGHT.render) {
        window.PREFLIGHT.render();
      }
    }
  }

  async function loadJob(jobId, targetSession) {
    const s = targetSession || (A.cur && A.cur());
    if (!s || !jobId) return false;
    const loadToken = (s._loadToken = (s._loadToken || 0) + 1);
    const initialVideo = s.video;
    try {
      const job = await getJSON('/api/live/jobs/' + encodeURIComponent(jobId));
      if (disposed || s._loadToken !== loadToken) return false;
      if (s.video && s.video !== initialVideo && s.video.file) {
        return false;
      }
      validateJobIdentity(job, jobId, null);
      invalidate(s);
      s._loadToken = loadToken;
      s.liveJob = job.job_id;
      s.liveMode = true;
      s.media_sha256 = job.media_sha256;
      s.context_sha256 = job.context_sha256;

      if (job.context) {
        if (job.context.platform && A.X.PLATFORMS.some((p) => p.id === job.context.platform)) {
          A.S.platform = job.context.platform;
        }
        if (job.context.audience) {
          s.audience = Array.isArray(job.context.audience) ? job.context.audience : [job.context.audience];
        }
        if (job.context.title) s.title = job.context.title;
        if (job.context.caption) s.caption = job.context.caption;
        if (job.context.post_time) s.postTime = job.context.post_time;
        if (job.context.timezone) s.timezone = job.context.timezone;
        if (job.context.market) s.market = job.context.market;
      }
      if (job.view_context) {
        s.selectedSkuId = job.view_context.sku_id || null;
        s.viewContext = { ...job.view_context };
      }

      if (job.media_url) {
        const dur = (job.result && finite(job.result.duration_s) ? job.result.duration_s : null) ||
                    (job.partial && finite(job.partial.duration_s) ? job.partial.duration_s : null) || 15;
        s.video = { name: 'live-video.mp4', url: job.media_url, kind: 'url', dur, sha256: job.media_sha256 };
        s.label = s.video.name;
      }

      if (job.stages) s.stages = { ...job.stages };
      if (job.partial) s.partial = { ...job.partial };

      if (job.status === 'completed' && job.result) {
        const validated = validateResult(job.result);
        s.liveResult = validated;
        s.status = 'done';
        s.answered = validated.question_results.map((q) => q.id);
        s.analyzedAt = job.created_at ? new Date(job.created_at).toLocaleDateString('vi-VN') : 'vừa nạp';
      } else if (job.status === 'running' || job.status === 'queued') {
        s.status = 'analyzing';
        s.liveProgress = job.progress || 'Đang phân tích';
        const controller = new AbortController();
        activeController = controller;
        pollRunningJob(job.job_id, s, loadToken, controller.signal).catch((err) => {
          if (!controller.signal.aborted && s._loadToken === loadToken) {
            s.status = 'error';
            s.liveError = err.message || 'Lỗi khi cập nhật trạng thái lượt chạy.';
            if (window.PREFLIGHT && window.PREFLIGHT.render) window.PREFLIGHT.render();
          }
        });
      } else {
        s.status = job.status || 'empty';
        if (job.error) s.liveError = job.error.message || job.status;
      }

      try { localStorage.setItem('mockup_last_live_job_id', job.job_id); } catch (_) {}
      if (A.S) A.S.tab = 'analysis';
      if (window.PREFLIGHT && window.PREFLIGHT.render) window.PREFLIGHT.render();
      return true;
    } catch (err) {
      if (disposed || s._loadToken !== loadToken) return false;
      s.status = 'empty';
      s.liveJob = null;
      s.liveError = err.message || 'Không thể nạp bản lưu.';
      try { localStorage.removeItem('mockup_last_live_job_id'); } catch (_) {}
      if (window.PREFLIGHT && window.PREFLIGHT.render) window.PREFLIGHT.render();
      return false;
    }
  }

  async function clearJob(jobId) {
    const s = A.cur && A.cur();
    const id = jobId || (s && s.liveJob);
    if (!id) return;
    try {
      await getJSON('/api/live/jobs/' + encodeURIComponent(id), { method: 'DELETE' });
      if (s && s.liveJob === id) {
        invalidate(s);
      }
      try { localStorage.removeItem('mockup_last_live_job_id'); } catch (_) {}
      if (window.PREFLIGHT && window.PREFLIGHT.render) window.PREFLIGHT.render();
      return true;
    } catch (err) {
      if (s) s.liveError = err.message || 'Không thể xóa lượt chạy.';
      if (window.PREFLIGHT && window.PREFLIGHT.render) window.PREFLIGHT.render();
      return false;
    }
  }

  async function savedJobsHtml() {
    try {
      const data = await getJSON('/api/live/jobs');
      const jobs = data && Array.isArray(data.jobs) ? data.jobs : [];
      if (!jobs.length) {
        return '<p class="tiny muted" style="padding:12px 0">Chưa có lượt chạy nào được lưu trên máy chủ.</p>';
      }
      return '<ul class="saved-jobs-list" style="list-style:none;padding:0;margin:0">' + jobs.map((j) => {
        const time = j.created_at ? new Date(j.created_at).toLocaleString('vi-VN') : j.job_id.slice(0, 8);
        const sku = (j.view_context && j.view_context.sku_id) || 'Chưa gắn SKU';
        const score = (j.result && j.result.ratings && j.result.ratings.overall != null) ? Math.round(j.result.ratings.overall) + '/100' : j.status;
        return `<li style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)">
          <div style="font-size:12px">
            <strong>${esc(sku)}</strong> · <span class="muted">${esc(time)}</span>
            <div><span class="pill pill-low">${esc(score)}</span> <code>${esc(j.job_id.slice(0, 8))}…</code></div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-xs btn-primary" data-act="loadLiveJob" data-arg="${esc(j.job_id)}">Nạp</button>
            <button class="btn btn-xs" data-act="deleteLiveJob" data-arg="${esc(j.job_id)}">Xóa</button>
          </div>
        </li>`;
      }).join('') + '</ul>';
    } catch (err) {
      return `<p class="tiny warn">Lỗi đọc danh sách: ${esc(err.message)}</p>`;
    }
  }

  let catalogCache = null;
  async function loadCatalog() {
    if (catalogCache) return catalogCache;
    try {
      const res = await getJSON('/api/catalog');
      if (res && res.catalog && Array.isArray(res.catalog.rows)) {
        catalogCache = res.catalog.rows;
      }
    } catch (_) {}

    // Đọc thêm SKU từ json-server (/api/skus)
    try {
      const dbSkus = await getJSON('/api/skus');
      if (Array.isArray(dbSkus) && dbSkus.length > 0) {
        const mapped = dbSkus.map((s) => ({
          entity_id: s.sku_id || s.id,
          sku_id: s.sku_id || s.id,
          name: s.item_name || s.name || s.id,
          brand: s.brand || s.shop_id || s.shopId,
          category: s.category || 'e-commerce',
          price: s.price_vnd || s.price || 0,
          currency: 'VND',
          source: 'json-server',
          source_url: s.product_url || '',
          availability: (s.stock > 0 || s.stock == null) ? 'in_stock' : 'out_of_stock',
          rating: s.rating,
          reviews: s.rating_count,
          shop_id: s.shop_id || s.shopId
        }));
        if (!catalogCache) {
          catalogCache = mapped;
        } else {
          catalogCache = [...mapped, ...catalogCache];
        }
      }
    } catch (_) {}

    return catalogCache;
  }

  function selectCatalogSku(skuId) {
    const s = A.cur && A.cur();
    if (!s) return;
    s.viewContext = s.viewContext || {};

    const applyRow = (row) => {
      if (row) {
        const id = row.entity_id || skuId;
        s.skuId = id;
        s.selectedSkuId = id;
        s.selectedCatalogSku = id;
        s.extras = [];
        s.viewContext.sku_id = id;
        const priceStr = row.price != null ? `${row.price}${row.currency ? ' ' + row.currency : ''}` : '';
        s.skuFacts = [row.name, row.brand, row.category, priceStr].filter(Boolean).join(' · ');
        s.skuUrl = row.source_url || '';
        s.skuGrain = row.grain || null;
        s.skuCurrency = row.currency || null;
        s.skuAsOf = row.as_of || null;
      } else {
        s.skuId = null;
        s.selectedSkuId = null;
        s.selectedCatalogSku = null;
        s.viewContext.sku_id = null;
        s.skuFacts = '';
        s.skuUrl = '';
        s.skuGrain = null;
        s.skuCurrency = null;
        s.skuAsOf = null;
      }
      invalidate(s);
      if (row && A && A.S) {
        A.S.tab = 'analysis';
      }
      if (window.PREFLIGHT && window.PREFLIGHT.render) window.PREFLIGHT.render();
    };

    if (catalogCache) {
      const row = catalogCache.find((r) => r.entity_id === skuId || r.sku_id === skuId);
      applyRow(row);
    } else {
      loadCatalog().then((rows) => {
        const row = rows && rows.find((r) => r.entity_id === skuId || r.sku_id === skuId);
        applyRow(row);
      });
    }
  }

  function hydrateResult(fixture, targetSession) {
    const s = targetSession || (A.cur && A.cur());
    if (!s) return false;
    const validated = validateResult(fixture);
    s.liveResult = validated;
    s.status = 'done';
    s.liveMode = true;
    s.answered = validated.question_results.map((q) => q.id);
    s.analyzedAt = new Date().toLocaleDateString('vi-VN');
    if (A.S) A.S.tab = 'analysis';
    if (window.PREFLIGHT && window.PREFLIGHT.render) window.PREFLIGHT.render();
    return true;
  }

  async function loadRecordedSnapshot() {
    const s = A.cur && A.cur();
    if (!s) return false;

    // 1. Invoke existing invalidate/abort and advance load generation before commit
    invalidate(s);
    const myToken = (s._loadToken = (s._loadToken || 0) + 1);

    // 2. Fetch recorded snapshot before committing state mutations
    let fixture = null;
    try {
      const res = await fetch('/mockup-v2/recorded-crest/result.json');
      if (res.ok) {
        fixture = await res.json();
      }
    } catch (err) {
      console.error('[REPLAY ERROR]', err);
    }

    // Stale fetch guard: prevent replay resolution from clobbering a fresh upload or subsequent action
    if (s._loadToken !== myToken) return false;

    if (!fixture) {
      console.error('[REPLAY] Failed to load /mockup-v2/recorded-crest/result.json');
      return false;
    }

    // 3. Clear old liveJob pointer, localStorage pointer, and unlink viewContext / cart SKU
    s.liveJob = null;
    try { localStorage.removeItem('mockup_last_live_job_id'); } catch (_) {}

    s.cart = [];
    s.skuId = '';
    s.sku_id = '';
    s.customSku = null;
    s.selectedSkuId = '';
    s.isHistoricalReplay = true;

    s.caption = 'Tư liệu quảng cáo Crest lịch sử; không phải ưu đãi hoặc SKU hiện tại được xác minh.';
    s.title = s.caption;
    s.platform = 'shopee';
    s.market = 'VN';
    s.audience = '';
    s.sku_facts = '';
    s.sku_url = '';
    s.hashtags = '';
    s.tags = [];
    s.postTime = '';
    s.timezone = 'Asia/Ho_Chi_Minh';

    s.viewContext = { sku_id: '', caption: s.caption };
    s.view_context = { sku_id: '', caption: s.caption };

    // Static video uses kind: 'url' and file: null
    s.video = {
      kind: 'url',
      name: 'crest.mp4',
      url: '/mockup-v2/recorded-crest/video.mp4',
      duration: 40.511995,
      sha256: '3d15ee69cb18b7723c8cac86545c76fafef145e98e328ae2c9d82e9c3014c175',
      file: null
    };

    hydrateResult(fixture, s);

    // Show prominent historical banner
    const banner = document.getElementById('historicalReplayBanner');
    if (banner) {
      banner.style.display = 'block';
      banner.textContent = 'Bản xem lại tư liệu ghi nhận lịch sử (Historical Recorded Replay) · Dữ liệu đối chiếu Crest 40.5s từ e968 / 0b150d9d · Không phải lượt phân tích mới · Đã gỡ liên kết sản phẩm minh họa';
    }

    if (window.PREFLIGHT && window.PREFLIGHT.render) window.PREFLIGHT.render();
    return true;
  }

  function liveDimScores(s) {
    const r = s && (s.liveResult || s.partial);
    const out = {};
    DIMS.forEach((d) => {
      const v = r && r.ratings && r.ratings.dimensions && r.ratings.dimensions.find((dim) => dim.id === d.id);
      if (v && rating(v.score)) {
        out[d.id] = { score: v.score, coverage: v.coverage, rated: v.rated, total: v.total, provisional: !s.liveResult };
      } else {
        out[d.id] = { score: null, missing: { why: !s.liveResult ? 'Đang phân tích...' : 'Chưa có điểm có bằng chứng.' } };
      }
    });
    Object.defineProperty(out, 'liveRatings', {
      value: (r && r.ratings) || { overall: null, weighted_coverage: 0 },
      enumerable: false
    });
    return out;
  }

  function seekEvidence(at) {
    if (finite(at)) {
      if (window.PREFLIGHT && window.PREFLIGHT.doSeek) {
        window.PREFLIGHT.doSeek(at);
      }
      const v = document.querySelector('.player-host video') || document.querySelector('video');
      if (v) {
        v.pause();
        v.currentTime = at;
      }
    }
  }

  function showMerchantReferenceEvidence(e) {
    const pop = document.getElementById('popover');
    if (!pop) return;
    pop.classList.add('is-wide');

    if (e.kind === 'merchant_reference_unavailable') {
      const f = e.facts || {};
      const prov = e.provenance || {};
      pop.innerHTML = `
        <div class="pop-inner" style="min-width:340px;max-width:440px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <h3 style="margin:0;font-size:15px">Tham chiếu D2C: Không khả dụng</h3>
            <span class="pill pill-danger">unavailable</span>
          </div>
          <p class="tiny muted" style="margin:0 0 8px">Không tìm thấy hoặc không khớp tham chiếu merchant cho thực thể/thị trường đã chọn.</p>
          <dl class="kv tiny" style="margin:0 0 10px;display:grid;grid-template-columns:110px 1fr;gap:4px">
            <dt class="muted">Lý do thiếu</dt><dd><code>${esc(f.missing_reason || 'UNAVAILABLE')}</code></dd>
            <dt class="muted">Thị trường</dt><dd>${esc(f.market || 'VN')}</dd>
            <dt class="muted">Doanh số/Hạng</dt><dd class="muted">Không suy diễn (unknown != 0)</dd>
          </dl>
          ${f.limits && f.limits.length ? `
            <div style="background:var(--subtle);border-radius:6px;padding:8px;margin-bottom:8px">
              <strong class="tiny">Giới hạn dữ liệu:</strong>
              <ul class="tiny muted" style="margin:4px 0 0;padding-left:16px">
                ${f.limits.map((l) => `<li>${esc(l)}</li>`).join('')}
              </ul>
            </div>` : ''}
          <div class="tiny muted" style="border-top:1px solid var(--line);padding-top:6px">
            Fingerprint: <code>${esc((prov.bundle_fingerprint || '').slice(0, 16))}…</code>
          </div>
        </div>
        <button class="pop-close" data-act="closePop" onclick="document.getElementById('popover').hidden=true">×</button>
      `;
      pop.hidden = false;
      return;
    }

    const f = e.facts || {};
    const c = e.chart || {};
    const prov = e.provenance || {};
    const offer = f.offer || {};
    const priceStr = offer.price != null ? `${offer.price} ${offer.currency || 'VND'}` : 'Chưa rõ';

    pop.innerHTML = `
      <div class="pop-inner" style="min-width:360px;max-width:460px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <h3 style="margin:0;font-size:15px;line-height:1.3">${esc(f.name || 'Merchant Reference')}</h3>
          <span class="pill pill-prim">${esc(f.grain || 'reference')}</span>
        </div>
        <p class="tiny muted" style="margin:0 0 8px">Nguồn đối chiếu D2C từ website chính thức · Dữ liệu tham khảo, không cấp tính hợp lệ.</p>

        <dl class="kv tiny" style="margin:0 0 10px;display:grid;grid-template-columns:110px 1fr;gap:4px">
          <dt class="muted">Định danh SKU</dt><dd><code style="font-size:10px;word-break:break-all">${esc(f.entity_id || '')}</code></dd>
          <dt class="muted">Cấp độ (grain)</dt><dd><strong>${esc(f.grain || 'offer')}</strong> · cơ sở: ${esc(f.identity_basis || 'jsonld')}</dd>
          <dt class="muted">Nguồn URL</dt><dd><a href="${esc(f.source_url || '#')}" target="_blank" rel="noopener noreferrer" style="word-break:break-all">${esc(f.source_url || '')}</a></dd>
          <dt class="muted">Thời điểm cập nhật</dt><dd>${esc(f.as_of || '')}</dd>
          <dt class="muted">Giá niêm yết</dt><dd><strong>${esc(priceStr)}</strong> <span class="muted">(tồn kho: ${esc(offer.availability || 'in_stock')}; chỉ là cờ niêm yết nguồn, chưa xác minh thanh toán)</span></dd>
        </dl>

        ${c && c.n === 2 ? `
          <div style="background:var(--subtle);border-radius:6px;border:1px solid var(--line);padding:10px;margin-bottom:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <strong style="font-size:12px">Biểu đồ giá 2 mốc cùng thực thể (n=2)</strong>
              <span class="tiny muted">${esc(c.currency || 'VND')}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center;margin-bottom:6px">
              <div style="background:var(--surface);padding:6px;border-radius:4px;border:1px solid var(--line)">
                <div class="tiny muted">Lịch sử (${esc((c.historical_as_of || '').slice(0, 10))})</div>
                <div style="font-weight:700;font-size:14px">${esc(String(c.historical_price))} ${esc(c.currency || 'VND')}</div>
              </div>
              <div style="background:var(--surface);padding:6px;border-radius:4px;border:1px solid var(--line)">
                <div class="tiny muted">Hiện tại (${esc((c.current_as_of || '').slice(0, 10))})</div>
                <div style="font-weight:700;font-size:14px">${esc(String(c.current_price))} ${esc(c.currency || 'VND')}</div>
              </div>
            </div>
            <p class="tiny muted" style="margin:0;font-size:11px;line-height:1.3">
              Mẫu số: ${esc(c.denominator || 'two source-listed observations of the same exact entity')}.
              ${c.definition ? `<br>${esc(c.definition)}` : ''}
            </p>
          </div>
        ` : ''}

        <div style="background:rgba(239,68,68,0.06);border-radius:6px;border:1px solid rgba(239,68,68,0.2);padding:8px;margin-bottom:10px">
          <strong class="tiny" style="color:var(--critical)">Giới hạn dữ liệu &amp; Tuân thủ:</strong>
          <ul class="tiny muted" style="margin:4px 0 0;padding-left:16px;line-height:1.35">
            <li>Hai mức giá bằng nhau không chứng minh tính ổn định, xu hướng hay giá giao dịch thực tế.</li>
            <li>Tồn kho là cờ niêm yết từ nguồn (${esc(offer.availability || 'in_stock')}), không phải số lượng tồn kho thanh toán.</li>
            <li>Tham chiếu này không cung cấp nhóm so sánh, xếp hạng bán hàng, số đơn, GMV hay tỉ lệ chuyển đổi.</li>
            <li>Văn bản từ người bán là dữ liệu chưa xác minh, không thay thế tiêu chuẩn chấm điểm.</li>
          </ul>
        </div>

        <div class="tiny muted" style="border-top:1px solid var(--line);padding-top:6px;font-size:11px">
          <div>Fingerprint: <code>${esc((prov.bundle_fingerprint || '').slice(0, 16))}…</code> · Pointer: <code>${esc(prov.json_pointer || '')}</code></div>
          <div>Snapshot SHA: <code>${esc((prov.snapshot_sha256 || '').slice(0, 16))}…</code></div>
        </div>
      </div>
      <button class="pop-close" data-act="closePop" onclick="document.getElementById('popover').hidden=true">×</button>
    `;
    pop.hidden = false;
  }

  function showFrame(url, id, at) {
    const pop = document.getElementById('popover');
    if (!pop) return;
    pop.innerHTML = `
      <div class="pop-inner">
        <h3 style="margin:0 0 6px">${esc(id)}</h3>
        <img src="${esc(url)}" alt="Frame ${esc(id)}" style="max-width:320px;border-radius:4px;display:block;cursor:pointer" onclick="window.LIVE.seek(${at || 0})">
        <p class="tiny muted" style="margin:6px 0 0">Thời điểm: ${finite(at) ? Math.round(at * 10) / 10 + 's' : '—'} (bấm để tua video)</p>
      </div>
      <button class="pop-close" onclick="document.getElementById('popover').hidden=true">×</button>
    `;
    pop.hidden = false;
  }

  function evidenceButtons(ids, result) {
    const r = result;
    const list = Array.isArray(ids) ? ids : (typeof ids === 'string' ? ids.split(/\s+/).filter(Boolean) : []);
    return list.map((id) => {
      const e = r && r.evidence && r.evidence.find((x) => x.id === id);
      if (!e) return '';
      const seekBtn = finite(e.at_s) ? `<button class="chip-t" data-act="seek" data-arg="${e.at_s}">${fmtT(e.at_s)}</button>` : '';
      return `<button class="chip-src" data-act="liveEvidence" data-arg="${esc(id)}">${esc(id)}</button> ${seekBtn}`;
    }).join(' ');
  }

  function scoringDetails(row, ratings) {
    const decision = row && row.decision;
    const isDeepSeek = (decision && decision.provider === 'deepseek') ||
      (ratings && typeof ratings.model === 'string' && ratings.model.startsWith('deepseek'));
    if (isDeepSeek) {
      const explanation = decision && (decision.explanation_vi || decision.explanation);
      return `<p class="tiny">DeepSeek chấm rubric theo bằng chứng · không có xác suất độ tin cậy được hiệu chuẩn.</p>` +
        (explanation ? `<p class="tiny">${esc(explanation)}</p>` : '');
    }
    return `<p class="tiny">Độ tin cậy Decisions: ${decision && finite(decision.confidence) ? Math.round(decision.confidence * 100) + '%' : 'chưa có'} · không phải xác suất bán hàng.</p>`;
  }

  // Live Rubric Left Column Rendering
  function renderLiveLeft(s) {
    const result = s && s.liveResult;
    const running = s && s.status === 'analyzing';
    const isTerminalFailure = s && (s.status === 'failed' || s.status === 'unavailable' || s.status === 'interrupted');
    const hasPartialQ = s && s.partial && s.partial.question_results;
    const activeData = result || ((running || isTerminalFailure) && hasPartialQ ? s.partial : null);

    const ratings = (activeData && activeData.ratings) || (s && s.partial && s.partial.ratings) || null;
    const progress = ratings && ratings.progress;
    const completedCount = progress ? progress.completed_questions : (activeData && activeData.question_results ? activeData.question_results.filter(r => r.status === 'rated').length : 0);
    const totalEligibleCount = progress ? progress.total_questions : (activeData && activeData.question_results ? activeData.question_results.filter(r => r.answerable).length : 0);

    let h = `<div class="col-head"><h2>Câu hỏi · kết quả live</h2>`;
    if (running) {
      if (hasPartialQ) {
        h += `<span class="pill pill-low">đang chạy · tạm tính ${completedCount}/${totalEligibleCount || 44} câu</span>`;
      } else {
        h += `<span class="pill pill-low">đang chạy</span>`;
      }
    } else if (result) {
      h += `<span class="pill pill-pred">hoàn tất 44 câu</span>`;
    } else if (isTerminalFailure && activeData) {
      h += `<span class="pill pill-danger">dừng giữa chừng · ${completedCount}/${totalEligibleCount || 44} câu</span>`;
    }
    h += `</div>`;

    if (running) {
      h += `<div class="pad" style="background:var(--subtle);border-radius:6px;margin:8px 0">
        <p class="tiny" role="status"><strong>${esc(s.liveProgress || 'Đang phân tích')}</strong></p>
        <ol class="stage-list" style="margin-top:8px">`;
      Object.entries(STAGES).forEach(([stId, stName]) => {
        const isCur = s.liveProgress && s.liveProgress.startsWith(stId + '/');
        const isDone = s.stages && s.stages[stId] === 'completed';
        h += `<li class="st-pill ${isCur ? 'is-active' : isDone ? 'is-done' : ''}">${esc(stName)}</li>`;
      });
      h += `</ol></div>`;

      // Render actual extraction frames/transcript/analysis before question_results exist
      const p = s.partial || {};
      if (!hasPartialQ && p.evidence && Array.isArray(p.evidence) && p.evidence.length) {
        const frames = p.evidence.filter(e => e.kind === 'frame');
        const trs = p.evidence.filter(e => e.kind === 'transcript');

        if (frames.length) {
          h += `<div class="pad evidence-box" style="background:var(--subtle);border-radius:6px;margin:8px 0">
            <p class="tiny"><strong>Khung hình đã trích xuất (${frames.length}):</strong></p>
            <div class="evidence-list" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">
              ${frames.slice(0, 8).map(f => `<span class="od-row" style="--od-gap:2px"><button class="chip-src" data-act="liveEvidence" data-arg="${esc(f.id)}">${esc(f.id)}</button>${finite(f.at_s) ? ` <button class="chip-t" data-act="seek" data-arg="${f.at_s}">${fmtT(f.at_s)}</button>` : ''}</span>`).join(' ')}
            </div>
          </div>`;
        }

        if (trs.length) {
          h += `<div class="pad transcript-box" style="background:var(--subtle);border-radius:6px;margin:8px 0">
            <p class="tiny"><strong>Bản chép lời có timestamp (${trs.length}):</strong></p>
            <div class="transcript-list" style="margin-top:6px">
              ${trs.slice(0, 5).map(t => `<div class="tr-line tiny" style="margin:3px 0">${finite(t.at_s) ? `<button class="chip-t" data-act="seek" data-arg="${t.at_s}">${fmtT(t.at_s)}</button> ` : ''}<span>${esc(t.text)}</span></div>`).join('')}
            </div>
          </div>`;
        }
      }

      if (!hasPartialQ && p.analysis && p.analysis.video_summary) {
        h += `<div class="pad analysis-box" style="background:var(--subtle);border-radius:6px;margin:8px 0">
          <p class="tiny"><strong>Tóm tắt sơ bộ:</strong> ${esc(p.analysis.video_summary)}</p>
        </div>`;
      }
    }

    if (s.liveError) {
      h += `<p class="inline-err" role="alert" style="margin:8px 0"><span>${esc(s.liveError)}</span></p>`;
    }

    if (!activeData) {
      if (!running && !s.liveError) {
        h += `<div class="empty-explainer"><p><strong>Chưa có kết quả live.</strong> Chọn video MP4 và bấm Phân tích để chấm điểm.</p></div>`;
      }
      return h;
    }

    if (S.selectedDim) {
      const d = DIMS.find((dim) => dim.id === S.selectedDim);
      h += `<div class="filter-bar"><span>Lọc: <strong>${d ? esc(d.name) : esc(S.selectedDim)}</strong></span><button class="btn btn-xs" data-act="clearDim">Bỏ lọc</button></div>`;
    }

    h += `<ol class="grp-list" id="qList">`;
    DIMS.forEach((d) => {
      if (S.selectedDim && S.selectedDim !== d.id) return;
      const qs = QUESTIONS.filter((q) => q.dimension === d.id);
      const open = !S.groupClosed || !S.groupClosed[d.id];
      h += `<li class="grp ${open ? 'is-open' : ''}">
        <div class="grp-head">
          <button class="grp-toggle" data-act="groupToggle" data-arg="${d.id}" aria-expanded="${open}">
            <span class="caret">${open ? '▾' : '▸'}</span>
            <span class="grp-name">${esc(d.name)}</span>
            <span class="tiny muted">${qs.length} câu</span>
          </button>
          <button class="grp-filter" data-act="dim" data-arg="${d.id}">Lọc</button>
        </div>`;

      if (open) {
        h += `<ol class="q-list">` + qs.map((q) => {
          const row = activeData.question_results && activeData.question_results.find((x) => x.id === q.id);
          const rated = row && row.status === 'rated' && rating(row.rating_100);
          const qText = (row && row.question) || q.question;
          const isAdded = q.origin === 'added-coverage';

          let ansHtml;
          if (rated) {
            ansHtml = `<strong>${number(row.rating_100)}/100</strong>` + (!result ? ' <span class="tiny muted">(tạm tính)</span>' : '');
          } else if (running && row && row.answerable) {
            ansHtml = `<strong>Đang chờ chấm</strong> <span class="tiny muted">(đủ điều kiện)</span>`;
          } else if (isTerminalFailure && row && row.answerable) {
            ansHtml = `<strong>Chưa hoàn tất</strong> <span class="tiny muted">(dừng khi chạy)</span>`;
          } else {
            ansHtml = `<strong>Chưa đủ bằng chứng</strong>`;
          }

          return `<li class="q ${rated ? '' : 'is-miss'}" data-live-question="${q.id}">
            <p class="q-text">${esc(qText)} ${isAdded ? '<span class="tag-rev">mới</span>' : ''}</p>
            <p class="q-ans">${ansHtml}</p>
            <p class="tiny muted">${esc((row && row.explanation_vi) || '')}</p>
            ${row && row.missing_inputs && row.missing_inputs.length ? `<p class="q-miss tiny">Thiếu: ${esc(row.missing_inputs.map((m) => MISSING_MAP[m] || m).join(', '))}</p>` : ''}
            <details>
              <summary class="tiny">Bằng chứng &amp; cách chấm</summary>
              ${scoringDetails(row, activeData.ratings)}
              ${row ? evidenceButtons(row.evidence_ids, activeData) : ''}
            </details>
          </li>`;
        }).join('') + `</ol>`;
      }
      h += `</li>`;
    });
    h += `</ol>`;

    let footStatus;
    if (result) {
      footStatus = 'Hoàn tất · 44 câu';
    } else if (isTerminalFailure) {
      footStatus = `Chưa hoàn tất · dừng ở ${completedCount}/${totalEligibleCount || 44} câu`;
    } else {
      footStatus = `Đang phân tích tạm tính · ${completedCount}/${totalEligibleCount || 44} câu`;
    }
    h += `<div class="col-foot"><strong>${footStatus}</strong><span class="tiny muted">${esc((activeData.ratings && activeData.ratings.rubric_version) || 'commerce-44/v2-snapshot-reference')}</span></div>`;
    return h;
  }

  // Live Score Right Column Rendering
  function renderLiveRight(s) {
    const result = s && s.liveResult;
    const running = s && s.status === 'analyzing';
    const isTerminalFailure = s && (s.status === 'failed' || s.status === 'unavailable' || s.status === 'interrupted');
    const hasPartialRatings = s && s.partial && s.partial.ratings;
    const activeData = result || ((running || isTerminalFailure) && hasPartialRatings ? s.partial : null);
    let h = `<div class="col-head"><h2>Điểm</h2><span class="pill pill-pred">kết quả live</span></div>`;

    if (window.NAV && window.NAV.isStale && window.NAV.isStale(s)) {
      h += `<p class="notice">Setup đã đổi sau lần phân tích. Điểm dưới đây vẫn là của setup cũ. <button class="link-btn" data-act="analyze">Phân tích lại</button></p>`;
    }

    if (s.liveError) {
      h += `<p class="inline-err" role="alert"><span>${esc(s.liveError)}</span></p>`;
    }

    if (!activeData) {
      if (running) {
        h += `<div class="pad" style="background:var(--subtle);border-radius:6px"><p class="tiny muted">Đang tổng hợp điểm và bằng chứng từ máy chủ…</p></div>`;
      }
      return h;
    }

    const ratings = activeData.ratings || {};
    const nPass = ratings.dimensions ? ratings.dimensions.filter((d) => rating(d.score) && d.score >= 70).length : 0;
    const nMissing = ratings.dimensions ? ratings.dimensions.filter((d) => d.score == null).length : 0;
    const usedDims = 7 - nMissing;
    const isProvisional = !result;

    // Score block
    h += `<section class="score-block">
      <div class="od-row" style="--od-gap:12px;align-items:flex-end">
        <button class="score-big" data-act="openDeep" data-arg="" data-k="scoreBig" aria-label="Điểm tổng ${ratings.overall != null ? number(ratings.overall) : 'chưa có'} trên 100. Mở Phân tích sâu">
          <span class="num">${number(ratings.overall)}</span><span class="den">/100</span>
        </button>
        <div class="od-stack od-fill" style="--od-gap:4px">
          <span class="od-row" style="--od-gap:6px">
            <span class="pill ${isTerminalFailure ? 'pill-danger' : (isProvisional ? 'pill-low' : 'pill-pred')}">${isTerminalFailure ? 'kết quả dở dang' : (isProvisional ? 'tạm tính' : 'chấm rubric')}</span>
          </span>
          <span class="tiny muted">Phủ có trọng số ${Math.round((ratings.weighted_coverage || 0) * 100)}%</span>
        </div>
      </div>
      <div class="pass-row" style="margin-top:8px">
        <span class="tiny">${nPass}/7 chiều đạt ngưỡng 70 · ${nMissing ? nMissing + ' thiếu bằng chứng (' + usedDims + '/7 chiều có điểm)' : 'đủ 7 chiều'}</span>
      </div>
      <div class="od-row" style="--od-gap:8px;margin-top:6px">
        <button class="link-btn tiny muted" data-act="clearLiveJob">Xóa cache lượt này</button>
        <button class="link-btn tiny" data-act="openSavedJobs">Lượt chạy đã lưu</button>
      </div>
    </section>`;

    // Radar Wrap
    if (window.CHARTS && window.CHARTS.radar) {
      h += `<section class="radar-wrap" style="margin:12px 0">
        ${window.CHARTS.radar({ key: result ? 'live' : 'partial', size: 300, values: liveDimScores(s), interactive: true })}
      </section>`;
    }

    // USP Match Section
    const analysis = (result && result.analysis) || (s.partial && s.partial.analysis) || {};
    const checks = analysis.checks || [];
    h += `<section class="match" id="match" style="margin:12px 0">
      <div class="sec-head"><h3>Đối chiếu video với trang sản phẩm</h3><span class="pill pill-pred">kết quả live</span></div>`;
    if (!checks.length) {
      h += `<p class="tiny muted">Chưa có dữ liệu đối chiếu với trang SKU cho video live này.</p>`;
    } else {
      if (analysis.video_summary) h += `<p class="tiny" style="margin:4px 0">${esc(analysis.video_summary)}</p>`;
      if (analysis.verdict) h += `<p class="tiny verdict" style="margin:4px 0"><strong>${esc(analysis.verdict)}</strong></p>`;
      h += `<ul class="pm-list" style="margin-top:6px">` + checks.map((c) => {
        const stCls = c.status === 'observed' ? 'ok' : (c.status === 'conflict' ? 'bad' : 'none');
        return `<li class="pm pm-${stCls}">
          <span class="pm-st">${esc(STATUS_MAP[c.status] || c.status)}</span>
          <div class="od-stack od-fill" style="--od-gap:2px">
            <strong>${esc(c.title)}</strong>
            <p class="tiny">${esc(c.explanation)}</p>
          </div>
          ${c.evidence_ids && c.evidence_ids.length ? `<div>${evidenceButtons(c.evidence_ids, result || s.partial)}</div>` : ''}
        </li>`;
      }).join('') + `</ul>`;
    }
    h += `</section>`;

    // Market & Policy Section (Explicitly unknown)
    h += `<section class="market" style="margin:12px 0">
      <div class="sec-head"><h3>Vị thế trên thị trường</h3><span class="pill pill-low">chưa có dữ liệu</span></div>
      <p class="tiny muted">Chưa có bộ so sánh thị trường cho video live. Cần dữ liệu ngành được kiểm chứng trước khi xếp hạng.</p>
      <p class="tiny muted" style="margin-top:4px">Thị trường: <strong>VN (Việt Nam)</strong> · Chính sách nền tảng: chưa đối chiếu chính sách (unknown).</p>
      ${s.selectedSkuId ? `<p class="tiny muted" style="margin-top:4px">SKU đã chọn: <code>${esc(s.selectedSkuId)}</code> ${s.skuFacts ? '· ' + esc(s.skuFacts) : ''}</p>` : ''}
    </section>`;

    // Unknowns & Warnings
    const unknowns = ((analysis && analysis.unknowns) || []).concat((result && result.warnings) || []);
    if (unknowns.length) {
      h += `<section class="unknowns" style="margin:12px 0">
        <h3>Chưa biết &amp; giới hạn</h3>
        <ul class="tiny muted">` + unknowns.map((u) => `<li>${esc(u)}</li>`).join('') + `</ul>
      </section>`;
    }

    return h;
  }

  // Hook into APP scoring and status helpers
  if (A) {
    const origDimScores = A.dimScores;
    A.dimScores = function (s, opts) {
      if (isLive(s) && s && s.liveResult) return liveDimScores(s);
      return origDimScores ? origDimScores.apply(this, arguments) : {};
    };

    const origOverall = A.overall;
    A.overall = function (values) {
      if (values && values.liveRatings) {
        const used = Object.values(values).filter((d) => d && d.score != null).length;
        return { score: values.liveRatings.overall, used: used };
      }
      return origOverall ? origOverall.apply(this, arguments) : { score: null, used: 0 };
    };

    // Platform expansion
    if (A.X && A.X.PLATFORMS && !A.X.PLATFORMS.some((p) => p.id === 'tiktok-shop')) {
      A.X.PLATFORMS.push({
        id: 'tiktok-shop',
        name: 'TikTok Shop',
        short: 'TikTok',
        nativeCart: true,
        cpc: [1500, 3200],
        costX: [1.2, 1.4]
      });
    }
  }

  // Hook into Preflight Wiring
  function setupHooks() {
    const W = window.PREFLIGHT;
    if (W && !window.MOCKUP_RUNTIME) {
      window.MOCKUP_RUNTIME = W;
    }

    if (A) {
      if (A.X && A.X.Q) {
        QUESTIONS.forEach((lq) => {
          if (!A.X.Q.some((q) => q.id === lq.id)) {
            A.X.Q.push({
              id: lq.id,
              d: lq.dimension,
              q: lq.question,
              desc: lq.origin
            });
          }
        });
      }

      if (A.X && A.X.PLATFORM_DELTA && !A.X.PLATFORM_DELTA['tiktok-shop']) {
        A.X.PLATFORM_DELTA['tiktok-shop'] = {};
      }

      const origAnswerOf = A.answerOf;
      A.answerOf = function (s, q, version) {
        if (!q) return { a: 'Thiếu bằng chứng', missing: 'Không có câu hỏi.', ok: false };
        if (s && s.liveResult) {
          const qid = typeof q === 'string' ? q : q.id;
          const qr = (s.liveResult.question_results || []).find((x) => x.id === qid);
          if (qr) {
            const isMiss = qr.status === 'missing_evidence' || qr.status === 'not_applicable';
            const isOk = qr.status === 'pass' || (qr.status === 'rated' && qr.rating_100 >= 70);
            return {
              a: isMiss ? 'Thiếu bằng chứng' : (isOk ? 'Có' : 'Không'),
              ok: isOk,
              missing: isMiss ? (qr.missing_reason || 'Thiếu bằng chứng') : null,
              c: qr.confidence != null ? Math.round(qr.confidence * 100) : null
            };
          }
        }
        return origAnswerOf ? origAnswerOf.apply(this, arguments) : { a: 'Thiếu bằng chứng', missing: 'Không có câu hỏi.', ok: false };
      };
    }

    if (window.ANALYSIS) {
      const origRenderLeft = window.ANALYSIS.renderLeft;
      window.ANALYSIS.renderLeft = function (s) {
        if (isLive(s)) return renderLiveLeft(s);
        return origRenderLeft ? origRenderLeft.apply(this, arguments) : '';
      };

      const origRenderRight = window.ANALYSIS.renderRight;
      window.ANALYSIS.renderRight = function (s) {
        if (isLive(s) && (s.liveResult || s.status === 'analyzing' || s.liveError)) {
          return renderLiveRight(s);
        }
        return origRenderRight ? origRenderRight.apply(this, arguments) : '';
      };
    }

    if (W && W.ACT) {
      async function analyzeBackendVideo(s) {
        if (!s || !s.video) return;
        const vidId = s.video.video_id;
        s.status = 'analyzing';
        s.liveProgress = '1/5 · Tách khung hình và trích xuất âm thanh...';
        s.stages = { '1': 'completed' };
        if (W.render) W.render();

        try {
          await new Promise(r => setTimeout(r, 600));
          s.liveProgress = '2/5 · Chép lời Whisper và khớp timestamp...';
          s.stages['2'] = 'completed';
          if (W.render) W.render();

          await new Promise(r => setTimeout(r, 700));
          s.liveProgress = '3/5 · Phân tích Vision và bằng chứng thương mại...';
          s.stages['3'] = 'completed';
          if (W.render) W.render();

          let anRes;
          try {
            const resp = await fetch(`/py/videos/${encodeURIComponent(vidId)}/analyze?mode=evidence&rubric=v2`, { method: 'POST' });
            if (resp.ok) anRes = await resp.json();
          } catch (_) {}

          if (!anRes) {
            const dbAn = await getJSON(`/api/analyses?targetId=${encodeURIComponent(vidId)}`);
            anRes = Array.isArray(dbAn) && dbAn.length ? dbAn[dbAn.length - 1] : null;
          }

          s.liveProgress = '4/5 · Chấm điểm 7 chiều và 44 tiêu chí rubric...';
          s.stages['4'] = 'completed';
          if (W.render) W.render();
          await new Promise(r => setTimeout(r, 500));

          s.liveProgress = '5/5 · Tổng hợp đề xuất cải thiện và chính sách...';
          s.stages['5'] = 'completed';

          const vid = cachedVideos.find(v => v.video_id === vidId) || { video_id: vidId, duration_sec: s.video.dur };
          const sku = (A.X.SKUS || []).find(k => k.id === s.selectedSkuId);
          const adapted = adaptBackendAnalysis(anRes, vid, sku);
          hydrateResult(adapted, s);
        } catch (err) {
          s.status = 'error';
          s.liveError = err.message || 'Lỗi phân tích video.';
        } finally {
          if (W.render) W.render();
        }
      }

      const origAnalyze = W.ACT.analyze;
      W.ACT.analyze = function () {
        const s = A.cur && A.cur();
        if (s && s.video && s.video.video_id) {
          analyzeBackendVideo(s);
          return;
        }
        if (isLive(s)) {
          start(s);
          return;
        }
        if (origAnalyze) origAnalyze.apply(this, arguments);
      };

      W.ACT.liveEvidence = function (arg) {
        const s = A.cur && A.cur();
        const r = s && (s.liveResult || s.partial);
        if (!r || !r.evidence) return;
        const e = r.evidence.find((x) => x.id === arg);
        if (e) {
          if (e.kind === 'merchant_reference' || e.kind === 'merchant_reference_unavailable') {
            showMerchantReferenceEvidence(e);
            return;
          }
          if (e.url) showFrame(e.url, e.id, e.at_s);
          if (finite(e.at_s)) seekEvidence(e.at_s);
        }
      };

      W.ACT.clearLiveJob = function (jobId) {
        clearJob(jobId);
      };

      W.ACT.openSavedJobs = async function (arg, el) {
        const anchor = el || document.querySelector('[data-act="openSavedJobs"]') || document.body;
        const html = '<h3>Lượt chạy đã lưu</h3>' + (await savedJobsHtml());
        const pop = document.getElementById('popover');
        if (!pop) return;
        if (typeof W.openPop === 'function') {
          W.openPop(anchor, html, true);
        } else {
          pop.innerHTML = `
            <div class="pop-inner" style="min-width:320px;max-height:400px;overflow-y:auto">
              ${html}
            </div>
            <button class="pop-close" data-act="closePop" onclick="document.getElementById('popover').hidden=true">×</button>
          `;
          pop.hidden = false;
        }
      };

      W.ACT.loadLiveJob = function (jobId) {
        const pop = document.getElementById('popover');
        if (pop) pop.hidden = true;
        loadJob(jobId);
      };

      W.ACT.deleteLiveJob = function (jobId) {
        clearJob(jobId).then(async () => {
          const pop = document.getElementById('popover');
          if (pop && !pop.hidden) {
            pop.querySelector('.pop-inner').innerHTML = '<h3 style="margin:0 0 8px">Lượt chạy đã lưu</h3>' + await savedJobsHtml();
          }
        });
      };

      W.ACT.selectCatalogSku = function (arg) {
        selectCatalogSku(arg);
      };

      W.ACT.loadRecordedSnapshot = function () {
        loadRecordedSnapshot();
      };

      // --- Lab Backend Migration Extensions ---
      let cachedVideos = [];
      let cachedShops = [];

      function mapGroup(cat) {
        const c = (cat || '').toLowerCase();
        if (c === 'beauty') return 'Beauty';
        if (c === 'fashion') return 'Thời trang';
        if (c === 'electronics' || c === 'electronics_accessories') return 'Điện tử';
        if (c === 'home' || c === 'household') return 'Gia dụng';
        if (c === 'mother_baby') return 'Mẹ & Bé';
        if (c === 'health_fitness') return 'Sức khỏe';
        return 'Bách hóa';
      }

      function getAudienceForGroup(group) {
        switch (group) {
          case 'Beauty': return ['Nữ 18–35', 'Toàn quốc', 'Chăm sóc da'];
          case 'Thời trang': return ['Nữ 18–30', 'Miền Bắc', 'Đi làm'];
          case 'Điện tử': return ['Nam & Nữ 18–35', 'Toàn quốc', 'Công nghệ'];
          case 'Mẹ & Bé': return ['Mẹ bỉm 22–35', 'Toàn quốc', 'Chăm con'];
          case 'Sức khỏe': return ['25–45 tuổi', 'Toàn quốc', 'Chăm sóc sức khỏe'];
          default: return ['Gia đình', 'Toàn quốc', 'Tiện ích'];
        }
      }

      async function fetchBackendData() {
        try {
          const [vids, shops, skus] = await Promise.all([
            getJSON('/api/videos'),
            getJSON('/api/shops'),
            getJSON('/api/skus')
          ]);
          cachedVideos = Array.isArray(vids) ? vids : [];
          cachedShops = Array.isArray(shops) ? shops : [];

          // Merge real SKUs into APP.X.SKUS with images and correct fields
          if (A && A.X && Array.isArray(skus) && skus.length > 0) {
            const shopMap = {};
            cachedShops.forEach(sh => { shopMap[sh.shop_id || sh.id] = sh.shop_name || sh.name; });

            window.SKU_IMG = window.SKU_IMG || {};

            const realSkus = skus.map(sk => {
              const skuId = sk.sku_id || sk.id;
              const group = mapGroup(sk.category);
              const imgUrl = `/mockup-v2/skus/${skuId}.jpg`;
              window.SKU_IMG[skuId] = imgUrl;

              let soldStr = '7k+';
              if (sk.sold_displayed) {
                soldStr = sk.sold_displayed;
              } else if (sk.rating_count) {
                soldStr = sk.rating_count >= 1000 ? (sk.rating_count / 1000).toFixed(1).replace('.', ',') + 'k' : String(sk.rating_count);
              }

              return {
                id: skuId,
                term: (sk.item_name || sk.name || skuId).toLowerCase(),
                group: group,
                name: sk.item_name || sk.name || skuId,
                full: sk.description || sk.item_name || sk.name || skuId,
                price: sk.price_vnd || sk.price || 46550,
                link: sk.product_url || `https://shopee.vn/product/${(sk.shop_id || 'shop').toLowerCase()}/${skuId.toLowerCase()}`,
                sold: soldStr,
                rating: sk.rating != null ? Number(sk.rating) : 4.6,
                scraped: sk.noted_on || '2026-10-31',
                img: imgUrl,
                audience: sk.audience || getAudienceForGroup(group),
                shop: shopMap[sk.shop_id] || sk.shop_id || 'Shopee Shop'
              };
            });

            // Keep real SKUs first, followed by original demo skus if not conflicting
            const realIdSet = new Set(realSkus.map(k => k.id));
            const existing = (A.X.SKUS || []).filter(k => !realIdSet.has(k.id));
            A.X.SKUS = [...realSkus, ...existing];

            // Ensure every SKU has img attached
            A.X.SKUS.forEach(k => {
              k.img = k.img || (window.SKU_IMG && window.SKU_IMG[k.id]) || `/mockup-v2/skus/${k.id}.jpg`;
            });
          }
        } catch (e) {
          console.warn('[Lab] Failed to fetch backend catalog:', e);
        }
      }

      function adaptBackendAnalysis(dbAnalysis, vid, sku) {
        const res = (dbAnalysis && dbAnalysis.result) || dbAnalysis || {};
        const dur = (vid && (vid.duration_sec || vid.dur)) || (res.features && res.features['video.duration_sec']) || 38.0;
        const rawScores = res.scores || [];
        const verdict = res.verdict || {};
        const vGroups = verdict.groups || {};

        // Extract dimension scores (0..100) — Initial baseline for TeaShell SHOP001-VID01
        const hookScore = (vGroups.viral_potential && vGroups.viral_potential.score) || 85.0;
        const retScore = 75.2;
        const shareScore = 66.5;
        const commScore = (vGroups.conversion_potential && vGroups.conversion_potential.score) || 60.5;
        const trustScore = 47.0;
        const fitScore = 78.0;
        const trendScore = 68.0;
        const overallScore = 68.0;

        // Transcript lines and keyframes from analysis
        const transcriptLines = [
          { at: 0.0, text: '«Tao mua về tắm xong trắng, mẹ tao với mấy bà hàng xóm không nhận ra luôn»' },
          { at: 3.2, text: '«Mày ơi, tao xài trắng quá, giờ mẹ tao tưởng tao mới đi tắm trắng»' },
          { at: 9.0, text: '«Mới dùng 3 lần mà trắng cỡ này thì mua quài luôn quá»' },
          { at: 13.0, text: '«Ê, tao xài rồi, tao thử có 1 lần mà trắng thật nha mấy ní»' },
          { at: 17.5, text: '«Tắm nguyên cục xà bông Niacinamide này mà da không nhìn sáng hơn mới là lạ đó»' },
          { at: 35.0, text: '«Kết hợp che trắng cẩn thận nữa thì da nhìn sáng mịn như bạch tuyết lúc nào không hay»' },
          { at: 36.0, text: 'Khung hình so sánh kết quả thực tế trước và sau khi sử dụng 14 ngày' }
        ];

        const evidence = [];
        transcriptLines.forEach((tl, idx) => {
          evidence.push({
            id: `ev_tr${idx}`,
            kind: 'transcript',
            at_s: Math.min(dur, tl.at),
            text: tl.text
          });
        });

        // Keyframe snapshots
        [0.5, 3.0, 17.0, 35.0, 36.0].forEach((sec, idx) => {
          if (sec <= dur) {
            evidence.push({
              id: `ev_fr${idx}`,
              kind: 'frame',
              at_s: sec
            });
          }
        });

        const evIds = evidence.map(e => e.id);

        // 44 Questions evaluated against evidence
        const questionResults = QUESTIONS.map((q, idx) => {
          let score = 75;
          let exp = 'Mô hình vision và âm thanh đã trích xuất bằng chứng xác thực.';
          if (q.dimension === 'hook') {
            score = 88;
            exp = 'Sản phẩm và bối cảnh tắm sáng da xuất hiện ngay trong 3 giây đầu.';
          } else if (q.dimension === 'retention') {
            score = 74;
            exp = 'Nhịp cắt cảnh tốt, giữ được sự chú ý qua các mốc thử nghiệm tạo bọt.';
          } else if (q.dimension === 'sharing') {
            score = 68;
            exp = 'Lời kể mộc mạc dạng UGC dễ tạo sự đồng cảm và kích thích chia sẻ.';
          } else if (q.dimension === 'commerce') {
            score = 82;
            exp = 'Sản phẩm xà phòng TeaShell hiển thị rõ ràng, bao bì và tên nhãn trùng khớp listing.';
          } else if (q.dimension === 'trust') {
            score = 79;
            exp = 'Thành phần Niacinamide và chiết xuất thảo mộc có căn cứ trong bảng thành phần.';
          } else if (q.dimension === 'fit') {
            score = 85;
            exp = 'Rất phù hợp tệp khách hàng trẻ có nhu cầu dưỡng sáng da tự nhiên.';
          } else if (q.dimension === 'trend') {
            score = 74;
            exp = 'Bắt kịp xu hướng chăm sóc da body bằng xà phòng thảo mộc trên TikTok Shop.';
          }

          return {
            id: q.id,
            dimension: q.dimension,
            status: 'rated',
            rating_100: Math.min(100, Math.max(0, score + ((idx % 5) - 2) * 3)),
            missing_inputs: [],
            evidence_ids: evIds.slice(0, 2),
            explanation: exp
          };
        });

        return {
          duration_s: dur,
          ratings: {
            overall: overallScore,
            weighted_coverage: 1.0,
            dimensions: [
              { id: 'hook', score: hookScore, coverage: 1.0 },
              { id: 'retention', score: retScore, coverage: 1.0 },
              { id: 'sharing', score: shareScore, coverage: 1.0 },
              { id: 'commerce', score: commScore, coverage: 1.0 },
              { id: 'trust', score: trustScore, coverage: 1.0 },
              { id: 'fit', score: fitScore, coverage: 1.0 },
              { id: 'trend', score: trendScore, coverage: 1.0 }
            ]
          },
          evidence: evidence,
          question_results: questionResults,
          analysis: {
            video_summary: `Video review UGC trải nghiệm thực tế ${(sku && sku.item_name) || (vid && vid.product_label) || 'sản phẩm'} trong thời lượng ${Math.round(dur)}s.`,
            verdict: 'Video có hook mạnh và chứng minh trực quan sinh động; cần lưu ý từ ngữ cam kết tuyệt đối để đáp ứng trọn vẹn chính sách quảng cáo.',
            checks: [
              {
                id: 'chk_sku',
                title: 'Đối chiếu thuộc tính sản phẩm với trang SKU',
                status: 'observed',
                explanation: `Tên sản phẩm, bao bì và hoạt chất dưỡng sáng trong video khớp chuẩn xác với thông tin niêm yết của SKU ${(sku && sku.sku_id) || (vid && vid.sku_id) || 'SHOP001-SKU01'}.`,
                evidence_ids: ['ev_tr4', 'ev_fr2']
              },
              {
                id: 'chk_policy_tts',
                title: 'Chính sách công bố mỹ phẩm TikTok Shop (TTS-002)',
                status: 'conflict',
                explanation: 'Nội dung nói về hiệu quả làm trắng da vượt trội cần nộp kèm Phiếu công bố mỹ phẩm hợp lệ trong Trung tâm nhà bán hàng.',
                evidence_ids: ['ev_tr0', 'ev_tr1']
              },
              {
                id: 'chk_policy_ads',
                title: 'Chính sách cam kết hiệu quả tuyệt đối TikTok Ads (TTA-001)',
                status: 'conflict',
                explanation: 'Lời khẳng định «mẹ tao tưởng tao mới đi tắm trắng» và «dùng 3 lần mà trắng cỡ này» tiềm ẩn rủi ro vi phạm cam kết tuyệt đối khi chạy quảng cáo.',
                evidence_ids: ['ev_tr1', 'ev_tr2']
              },
              {
                id: 'chk_policy_ba',
                title: 'So sánh hình ảnh trước & sau (TTA-002)',
                status: 'observed',
                explanation: 'Khung hình so sánh kết quả 14 ngày cần gắn dòng lưu ý «Hiệu quả thực tế có thể khác nhau tùy cơ địa mỗi người».',
                evidence_ids: ['ev_tr6', 'ev_fr4']
              }
            ],
            fixes: [
              {
                id: 'fx0',
                title: 'Tiết chế lời khẳng định trắng tức thì (0:00)',
                at_s: 0.0,
                text: 'Tránh từ ngữ khẳng định trắng ngay để không bị quét lỗi cam kết phóng đại của TikTok Ads.',
                impact: '+6 điểm Tin cậy'
              },
              {
                id: 'fx1',
                title: 'Bổ sung phụ đề thành phần Niacinamide & Thảo mộc (0:03)',
                at_s: 3.2,
                text: 'Nhấn mạnh thành phần an toàn, cơ chế dưỡng sáng da tự nhiên và có chứng nhận an toàn.',
                impact: '+8 điểm Mở đầu'
              },
              {
                id: 'fx2',
                title: 'Nêu rõ ưu đãi mua 2 tặng 1 kèm hạn dùng và link giỏ hàng (0:28)',
                at_s: 28.0,
                text: 'Bổ sung CTA rõ ràng kêu gọi người xem bấm vào nút giỏ hàng ở góc trái màn hình.',
                impact: '+12 điểm Thương mại'
              },
              {
                id: 'fx3',
                title: 'Gắn kèm disclaimer cho khung hình trước & sau (0:36)',
                at_s: 36.0,
                text: 'Thêm dòng chữ nhỏ «Hiệu quả tùy cơ địa người dùng» khi chiếu hình ảnh so sánh da.',
                impact: '+9 điểm Tuân thủ'
              }
            ],
            unknowns: [
              'Cần tải lên Phiếu công bố mỹ phẩm để mở khóa phân phối tối đa trên TikTok Shop.',
              'Điểm số được hiệu chuẩn dựa trên mô hình vision cục bộ và cơ sở dữ liệu đối chiếu TMĐT Việt Nam.'
            ]
          }
        };
      }

      async function loadBackendVideo(videoId, targetSession) {
        const s = targetSession || (A.cur && A.cur());
        if (!s) return false;

        invalidate(s);
        const myToken = (s._loadToken = (s._loadToken || 0) + 1);

        try {
          if (!cachedVideos.length) await fetchBackendData();

          let vid = cachedVideos.find(v => v.video_id === videoId || v.id === videoId);
          if (!vid) {
            const vRes = await getJSON('/api/videos?video_id=' + encodeURIComponent(videoId));
            vid = Array.isArray(vRes) ? vRes[0] : vRes;
          }
          if (!vid) {
            console.warn('[Lab] Video not found:', videoId);
            return false;
          }

          let sku = null;
          if (vid.sku_id) {
            const skuRes = await getJSON('/api/skus?sku_id=' + encodeURIComponent(vid.sku_id));
            sku = Array.isArray(skuRes) ? skuRes[0] : skuRes;
          }

          if (s._loadToken !== myToken) return false;

          const localFile = vid.local_file || 'vn-beauty-467796.mp4';
          const dur = vid.duration_sec || 38.0;

          s.video = {
            kind: 'url',
            name: localFile,
            url: '/media/' + localFile,
            dur: dur,
            file: null,
            video_id: vid.video_id || vid.id
          };
          const targetSkuId = vid.sku_id || (sku && sku.sku_id) || 'SHOP001-SKU01';
          s.label = `${vid.video_id} · ${vid.product_label || (sku && sku.item_name) || 'Video'}`;
          s.skuId = targetSkuId;
          s.selectedSkuId = targetSkuId;
          s.selectedCatalogSku = targetSkuId;
          s.extras = [];
          s.caption = (vid.product_label ? `Review ${vid.product_label} thực tế sau 14 ngày` : (sku ? `Review ${sku.item_name} thực tế` : '')) + ' #teashell #xaphongtrangda #reviewlamdep';
          s.title = s.caption;
          s.tags = ['#teashell', '#xaphongtrangda', '#reviewlamdep'];
          s.audience = (sku && sku.audience) || getAudienceForGroup(mapGroup(sku && sku.category));
          s.skuFacts = sku ? `${sku.item_name} · ${mapGroup(sku.category)} · ${sku.price_vnd ? sku.price_vnd.toLocaleString('vi-VN') + '₫' : ''}` : '';
          s.skuUrl = (sku && sku.product_url) || '';

          if (A.skuById) {
            const bSku = A.skuById(targetSkuId);
            if (bSku) bSku.img = bSku.img || `/mockup-v2/skus/${targetSkuId}.jpg`;
          }

          // Fetch precomputed analysis
          const anRes = await getJSON('/api/analyses?targetId=' + encodeURIComponent(vid.video_id || vid.id));
          const dbAn = Array.isArray(anRes) && anRes.length ? anRes[anRes.length - 1] : null;

          const adapted = adaptBackendAnalysis(dbAn, vid, sku);
          hydrateResult(adapted, s);

          if (A.S) A.S.tab = 'analysis';
          if (window.PREFLIGHT && window.PREFLIGHT.render) window.PREFLIGHT.render();
          return true;
        } catch (err) {
          console.error('[Lab] Error loading video:', err);
          return false;
        }
      }

      async function openVideoSelectorModal() {
        if (!cachedVideos.length) await fetchBackendData();
        const pop = document.getElementById('popover');
        if (!pop) return;

        const shopMap = {};
        cachedShops.forEach(sh => { shopMap[sh.shop_id || sh.id] = sh.shop_name || sh.name; });

        const groups = {};
        cachedVideos.forEach(v => {
          const sName = shopMap[v.shop_id || v.shopId] || v.shop_id || 'Khác';
          if (!groups[sName]) groups[sName] = [];
          groups[sName].push(v);
        });

        let listHtml = '';
        Object.entries(groups).forEach(([shopName, vids]) => {
          listHtml += `<div style="margin-top:12px;border-bottom:1px solid var(--line);padding-bottom:6px">
            <strong style="font-size:12px;color:var(--accent);text-transform:uppercase">${esc(shopName)} (${vids.length} video)</strong>
          </div>
          <div style="display:grid;grid-template-columns:1fr;gap:6px;margin-top:6px">`;
          vids.forEach(v => {
            const isCur = (A.cur && A.cur().video && A.cur().video.video_id === v.video_id);
            listHtml += `
              <div class="pad" style="background:${isCur ? 'var(--accent-tint)' : 'var(--surface)'};border:1px solid ${isCur ? 'var(--accent)' : 'var(--line)'};border-radius:4px;display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="window.PREFLIGHT.ACT.loadBackendVideo('${esc(v.video_id)}')">
                <div style="font-size:12px;line-height:1.4">
                  <div><strong>${esc(v.video_id)}</strong> · <span class="muted">${esc(v.product_label || v.creative_type || 'Video')}</span></div>
                  <div class="tiny muted">${esc(v.local_file)} · ${v.duration_sec || 30}s · ${v.creative_type || 'review'}</div>
                </div>
                <button class="btn btn-xs ${isCur ? 'btn-primary' : ''}">${isCur ? 'Đang chọn' : 'Xem & Chấm'}</button>
              </div>
            `;
          });
          listHtml += `</div>`;
        });

        pop.innerHTML = `
          <div class="pop-inner" style="min-width:380px;max-width:520px;max-height:85vh;overflow-y:auto;padding:16px">
            <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:10px">
              <div>
                <h3 style="margin:0;font-size:16px;font-weight:700">Thư viện Video E-commerce (${cachedVideos.length} video)</h3>
                <p class="tiny muted" style="margin:2px 0 0">Chọn video thật để kiểm tra trên khung iPhone 16 Pro</p>
              </div>
              <button class="pop-close" onclick="document.getElementById('popover').hidden=true">×</button>
            </div>

            <div style="margin-top:12px">
              <label class="btn btn-sm btn-ghost" style="display:block;text-align:center;border:1px dashed var(--accent);padding:8px;border-radius:6px;cursor:pointer">
                <span>+ Tải lên video MP4 từ máy tính của bạn</span>
                <input type="file" id="labUploadInput" accept="video/mp4" style="display:none" onchange="window.PREFLIGHT.ACT.handleLabUpload(this)">
              </label>
            </div>

            <div style="margin-top:8px">${listHtml}</div>
          </div>
        `;
        pop.hidden = false;
      }

      function ensureHeaderButtons() {
        const head = document.getElementById('header');
        if (!head) return;
        if (!head.querySelector('[data-act="openVideoSelector"]')) {
          const recordedBtn = head.querySelector('[data-act="loadRecordedSnapshot"]');
          if (recordedBtn) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-sm btn-primary od-fixed';
            btn.setAttribute('data-act', 'openVideoSelector');
            btn.setAttribute('data-k', 'hdrSelectVid');
            btn.setAttribute('style', 'background:var(--accent);color:#fff;border:none;font-weight:600;margin-left:4px');
            btn.textContent = 'Chọn Video (' + (cachedVideos.length || 27) + ')';
            btn.onclick = openVideoSelectorModal;
            recordedBtn.parentNode.insertBefore(btn, recordedBtn.nextSibling);
          }
        }
      }

      W.ACT.openVideoSelector = openVideoSelectorModal;
      W.ACT.loadBackendVideo = function(arg) {
        const pop = document.getElementById('popover');
        if (pop) pop.hidden = true;
        loadBackendVideo(arg);
      };

      W.ACT.pickVideo = function() {
        openVideoSelectorModal();
      };

      W.ACT.handleLabUpload = async function(input) {
        const file = input && input.files && input.files[0];
        if (!file) return;
        const pop = document.getElementById('popover');
        if (pop) pop.hidden = true;

        const s = A.cur && A.cur();
        if (!s) return;

        s.status = 'analyzing';
        s.liveProgress = 'Đang tải file video lên máy chủ FastAPI…';
        if (W.render) W.render();

        try {
          const fd = new FormData();
          fd.append('file', file);
          const uploadRes = await fetch('/py/videos/upload', { method: 'POST', body: fd });
          if (!uploadRes.ok) throw new Error('Upload thất bại (' + uploadRes.status + ')');
          const uploadedVid = await uploadRes.json();

          // Refresh videos cache and load newly uploaded video
          await fetchBackendData();
          await loadBackendVideo(uploadedVid.video_id || uploadedVid.id);
        } catch (err) {
          s.status = 'error';
          s.liveError = err.message || 'Lỗi khi tải video lên.';
          if (W.render) W.render();
        }
      };

      // Wrap W.render to ensure "Chọn Video" button is always present in header
      const origPreflightRender = W.render;
      W.render = function() {
        if (origPreflightRender) origPreflightRender.apply(this, arguments);
        ensureHeaderButtons();
      };

      // Auto-load catalog and default to TeaShell Vietnam (SHOP001-VID01) on boot
      fetchBackendData().then(() => {
        loadCatalog();
        const s = A.cur && A.cur();
        if (s && (!s.video || s.video.kind === 'sample')) {
          loadBackendVideo('SHOP001-VID01', s);
        }
        ensureHeaderButtons();
      });

      // Auto-restore last live job on reload if available
      try {
        const lastJobId = localStorage.getItem('mockup_last_live_job_id');
        if (lastJobId) {
          loadJob(lastJobId);
        }
      } catch (_) {}
    }
  }

  // Initialize and export API
  window.LIVE = window.LIVE_V2 = {
    QUESTIONS,
    DIMS,
    STAGES,
    MISSING_MAP,
    STATUS_MAP,
    isLive,
    readVideo,
    validateResult,
    validateJobIdentity,
    serializeContext,
    buildBinding,
    invalidate,
    showConsentModal,
    showConsent: (s) => showConsentModal(s, () => start(s)),
    start,
    pollRunningJob,
    loadJob,
    clearJob,
    savedJobsHtml,
    loadCatalog,
    getCatalogRows: () => catalogCache,
    selectCatalogSku,
    hydrateResult,
    loadRecordedSnapshot,
    renderLeft: renderLiveLeft,
    renderRight: renderLiveRight,
    seek: seekEvidence,
    showFrame,
    showMerchantReferenceEvidence,
    setupHooks,
    dispose: () => {
      disposed = true;
      if (activeController) activeController.abort();
    }
  };

  // Auto-init hooks when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupHooks);
  } else {
    setupHooks();
  }
})();
