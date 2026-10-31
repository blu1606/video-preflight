// Display names only. Groups, criteria and scores come from the backend result as-is; this table never
// changes how anything is grouped or computed. Unknown keys fall back to the backend name.

export const GROUP_LABELS = {
  viral_potential: 'Viral',
  conversion_potential: 'Conversion',
  sku_market: 'SKU & thị trường',
  policy_compliance: 'Policy',
  post_publish_performance: 'Hiệu suất thực',
  shop_health: 'Tình hình shop',
}

export const GROUP_HINTS = {
  viral_potential: 'Video có giữ chân và lan truyền được không',
  conversion_potential: 'Video có khiến người xem bấm mua không',
  sku_market: 'SKU, giá và listing so với thị trường',
  policy_compliance: 'Rủi ro chính sách thấp nhất trên các nền tảng đã chọn',
  post_publish_performance: 'Số đo sau khi đăng (xem, bấm, mua). Không tính vào điểm tổng',
  shop_health: 'Bối cảnh shop, không tính vào điểm video',
}

// Decisions question domains (backend `question.domain`).
export const DOMAIN_LABELS = {
  viral: 'Viral',
  conversion: 'Conversion',
  sku: 'SKU & listing',
  shop: 'Tình hình shop',
  policy: 'Policy',
  video: 'Video (điều phối)',
  orchestration: 'Điều phối',
}

// Which result group a Decisions domain feeds (rubric v2, core/rubric.py V2_GROUPS).
export const DOMAIN_GROUP = {
  viral: 'viral_potential',
  conversion: 'conversion_potential',
  sku: 'sku_market',
  shop: 'shop_health',
}

export const DIMENSION_LABELS = {
  hook_immediacy: 'Hook mở đầu',
  hook_specificity: 'Hook cụ thể',
  story_coherence: 'Mạch kể chuyện',
  visual_pacing: 'Nhịp hình ảnh',
  curiosity_payoff: 'Gợi tò mò và trả lời',
  emotional_relevance: 'Cảm xúc liên quan',
  share_save_utility: 'Đáng chia sẻ / lưu',
  first_frame_clarity: 'Khung hình đầu rõ',
  product_identification: 'Nhận ra sản phẩm',
  problem_solution_fit: 'Vấn đề và giải pháp',
  demonstration_clarity: 'Demo rõ ràng',
  benefit_specificity: 'Lợi ích cụ thể',
  differentiation: 'Khác biệt',
  trust_evidence: 'Bằng chứng tin cậy',
  offer_communication: 'Nêu ưu đãi',
  cta_clarity: 'CTA rõ ràng',
  claim_listing_consistency: 'Claim khớp listing',
  purchase_friction: 'Rào cản mua',
  listing_completeness: 'Listing đầy đủ',
  review_quality: 'Chất lượng đánh giá',
  price_positioning: 'Định vị giá',
  availability_reliability: 'Tồn kho và giao hàng',
  demand_relevance: 'Nhu cầu thị trường',
  catalog_health: 'Sức khỏe danh mục',
  fulfillment_health: 'Vận hành đơn',
  traffic_monetization: 'Chuyển traffic thành đơn',
  ad_efficiency: 'Hiệu quả quảng cáo',
  review_service_health: 'Đánh giá và dịch vụ',
  candidate_match: 'Khớp sản phẩm',
  creative_format: 'Định dạng creative',
  root_cause: 'Nguyên nhân gốc',
  policy_risk_category: 'Nhóm rủi ro policy',
  potentially_misleading_claim: 'Claim dễ gây hiểu nhầm',
  unverified_before_after: 'Before/after chưa kiểm chứng',
  commercial_disclosure_missing: 'Thiếu nhãn quảng cáo',
  video_listing_contradiction: 'Video mâu thuẫn listing',
  next_best_action: 'Việc nên làm trước',
  verification_route: 'Cách kiểm chứng',
  request_intent: 'Ý định câu hỏi',
}

export const PLATFORM_LABELS = {
  tiktok_shop_video: 'TikTok Shop video',
  tiktok_ads: 'TikTok Ads',
  shopee_listing: 'Shopee',
  meta_ads: 'Meta Ads',
}

export const LANE_LABELS = { policy: 'Policy', conversion: 'Conversion', viral: 'Viral', structure: 'Cấu trúc' }

// Result group whose markers light up when that group is opened.
export const GROUP_LANE = {
  viral_potential: 'viral',
  conversion_potential: 'conversion',
  policy_compliance: 'policy',
}

export const SEVERITY_LABELS = { critical: 'nghiêm trọng', high: 'cao', medium: 'trung bình', low: 'thấp', info: 'thông tin' }

export const BEAT_LABELS = {
  hook: 'Hook',
  problem: 'Vấn đề',
  solution: 'Giải pháp',
  proof: 'Bằng chứng',
  offer: 'Ưu đãi',
  cta: 'CTA',
}

const SCENARIO_LABELS = {
  high_performer: 'Shop bán tốt',
  viral_low_conversion: 'Viral nhưng ít chuyển đổi',
  high_conversion_low_traffic: 'Chuyển đổi tốt, ít traffic',
  operations_risk: 'Rủi ro vận hành',
  ads_dependent: 'Phụ thuộc Ads',
  new_shop_sparse: 'Shop mới, ít dữ liệu',
  stockout_risk: 'Rủi ro hết hàng',
  returns_and_trust: 'Hoàn hàng và uy tín',
  high_volume_low_margin: 'Bán nhiều, biên thấp',
}

export const scenarioLabel = (s) => SCENARIO_LABELS[s] ?? s

// Policy is never "passed": the baseline rule engine finding nothing is not an approval.
const POLICY_VERDICT_LABELS = { needs_review: 'Cần xem lại', no_issue_detected: 'Không phát hiện vi phạm' }
export const policyVerdictLabel = (verdict) => POLICY_VERDICT_LABELS[verdict] ?? 'Chưa đủ dữ liệu'

export const POLICY_ENGINE_NOTE = 'Rule engine bản baseline (sẽ cải tiến), không phải duyệt chính thức của sàn'

export const OUTCOME_LABELS = {
  needs_review: 'cần xem lại',
  unknown: 'chưa đủ dữ liệu',
  not_triggered: 'không dính',
}

// Verdict of a video claim checked against the SKU listing.
export const CLAIM_LABEL = { supported: 'có trong listing', not_in_listing: 'không có trong listing', contradicts: 'mâu thuẫn listing' }

// Kind of a fix: policy, content criterion or missing data.
export const FIX_KIND_LABELS = { policy: 'Policy', criterion: 'Nội dung', data: 'Dữ liệu' }

export const groupLabel = (name) => GROUP_LABELS[name] ?? name
// Provenance chip text: the seed rows are the lab's own shop data, not a stand-in for real numbers.
export const sourceLabel = (status) => (status === 'MOCK' ? 'nội bộ' : status)
export const domainLabel = (name) => DOMAIN_LABELS[name] ?? name
export const platformLabel = (name) => PLATFORM_LABELS[name] ?? name
export const dimensionLabel = (dimension, fallback) => DIMENSION_LABELS[dimension] ?? fallback ?? dimension

// Plain-language reading of each Decisions score question (display only; the English original sent to the
// API is shown next to it as the source text).
export const QUESTION_PLAIN = {
  hook_immediacy: '3 giây đầu có cho người xem lý do rõ ràng để xem tiếp không?',
  hook_specificity: 'Lời hứa ở phần mở đầu có cụ thể và đáng tin với đúng người mua không?',
  story_coherence: 'Video có dẫn dắt mạch lạc từ vấn đề tới kết quả không?',
  visual_pacing: 'Nhịp hình ảnh có giúp người xem theo kịp và giữ chú ý không?',
  curiosity_payoff: 'Video có gợi tò mò rồi trả lời trọn vẹn không?',
  emotional_relevance: 'Cảm xúc của video có hợp với người mua và sản phẩm không?',
  share_save_utility: 'Nội dung có giá trị để người xem lưu lại hoặc gửi cho bạn bè không?',
  first_frame_clarity: 'Hình hoặc chữ đầu tiên có cho biết ngay video nói về sản phẩm gì không?',
  product_identification: 'Người mua có nhận ra đúng sản phẩm và công dụng không?',
  problem_solution_fit: 'Sản phẩm có được gắn với một vấn đề cụ thể của người mua không?',
  demonstration_clarity: 'Video có cho thấy rõ cách dùng sản phẩm thật không?',
  benefit_specificity: 'Lợi ích nêu ra có cụ thể và có căn cứ không?',
  differentiation: 'Video có cho thấy sản phẩm khác gì so với lựa chọn khác không?',
  trust_evidence: 'Bằng chứng thuyết phục có đáng tin, tránh lời hứa không căn cứ không?',
  offer_communication: 'Ưu đãi mua hàng có được nói rõ và đúng không?',
  cta_clarity: 'Lời kêu gọi mua có chỉ rõ người xem cần làm gì tiếp không?',
  claim_listing_consistency: 'Lời nói, biến thể và hình ảnh có khớp với trang sản phẩm không?',
  purchase_friction: 'Mua có dễ không, xét tồn kho, giá, giao hàng và đường dẫn mua?',
  listing_completeness: 'Trang sản phẩm có đủ và nhất quán (tiêu đề, thuộc tính, ảnh, biến thể) không?',
  review_quality: 'Đánh giá của người mua có thuyết phục và đáng tin không?',
  price_positioning: 'Giá có cạnh tranh so với sản phẩm tương đương cùng quy cách không?',
  availability_reliability: 'Tồn kho hiện có đủ cho nhu cầu sắp tới không?',
  demand_relevance: 'Sản phẩm có đúng nhu cầu thị trường đã kiểm chứng (không chỉ lượt xem) không?',
  catalog_health: 'Danh mục của shop có khỏe không (SKU đang bán, thông tin thiếu, còn hàng)?',
  fulfillment_health: 'Shop giao hàng có tốt không (huỷ đơn, giao trễ, khiếu nại)?',
  traffic_monetization: 'Shop có biến lượt vào thành đơn tốt so với shop tương tự không?',
  ad_efficiency: 'Quảng cáo trả phí có hiệu quả không, xét chi phí, doanh thu và biên lời?',
  review_service_health: 'Uy tín người bán và xử lý sau bán có tốt không?',
}

// Decisions score levels, same order as the bank's 0-4 scale.
const LEVEL_PLAIN = ['Không có', 'Yếu', 'Tạm được', 'Tốt', 'Xuất sắc']
export const levelPlain = (label) => {
  const i = Number.parseInt(String(label), 10)
  return Number.isInteger(i) && LEVEL_PLAIN[i] ? `${i} · ${LEVEL_PLAIN[i]}` : label
}

// Plain-language summary of each baseline policy rule (fixtures/policy_baseline_v01/rules.json `summary_en`).
export const RULE_PLAIN = {
  'TTS-001': 'Sản phẩm thuộc nhóm cấm hoặc hạn chế bán trên TikTok Shop',
  'TTS-002': 'Công dụng hoặc lời hứa không có căn cứ trong thông tin sản phẩm',
  'TTS-003': 'Mỹ phẩm thiếu giấy công bố hoặc nhãn bắt buộc',
  'TTA-001': 'Quảng cáo hứa hẹn kết quả tuyệt đối hoặc phóng đại',
  'TTA-002': 'So sánh trước/sau dễ gây hiểu nhầm về công dụng',
  'TTA-003': 'Có nút giả hoặc yếu tố tương tác gây hiểu nhầm',
  'TTC-001': 'Người hoặc cảnh dựng bằng AI mà không gắn nhãn',
  'TTC-002': 'Nội dung quảng bá thương mại mà không bật nhãn quảng cáo',
  'SHP-001': 'Tiêu đề, ảnh, giá và mô tả không nhất quán',
  'SHP-002': 'Thiếu ảnh chụp sản phẩm thật đạt chuẩn',
  'SHP-003': 'Tiêu đề chứa từ khuyến mãi hoặc từ bị hạn chế',
  'SHP-004': 'Mỹ phẩm thiếu thông tin nguồn gốc, công bố hoặc hạn dùng',
  'SHP-005': 'Mô tả chứa liên hệ hoặc kéo người mua ra ngoài sàn',
  'META-001': 'Quảng cáo có thể dùng lời hứa thương mại không căn cứ',
  'META-002': 'Quảng cáo nói thẳng về tình trạng cá nhân nhạy cảm của người xem',
  'META-003': 'Nhóm sản phẩm có thể bị hạn chế bán trên Meta',
}
export const rulePlain = (ruleId, fallback) => RULE_PLAIN[ruleId] ?? fallback
