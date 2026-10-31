"""Shop Optimization Agent (rule-based): root cause -> priority -> recommended action.

diagnose_shop reads shop.* through FeatureView, so evidence mode refuses mock data.
diagnose_video compares one video's funnel with its featured SKU to decide whether
the problem sits in the video or in the shop/SKU.
Thresholds come from fixtures/calibration_v0.json (shop_diagnosis.*): placeholders for the synthetic seed,
not calibrated business rules.
"""

from dataclasses import asdict, dataclass, field

from core.schema import FeatureMap, Mode, SourceStatus
from core.score_engine import FeatureUnavailable, FeatureView
from sources import calibration as cal


def _limit(name: str):
    return cal.value(f"shop_diagnosis.{name}")


# Data confidence
MIN_ORDERS_30D = _limit("min_orders_30d")
MIN_RATING_COUNT = _limit("min_rating_count")
MIN_SHOP_AGE_DAYS = _limit("min_shop_age_days")
# Shop rules
LATE_LIMIT = _limit("late_limit")
CANCEL_LIMIT = _limit("cancel_limit")
RETURN_LIMIT = _limit("return_limit")
LOST_DEMAND_LIMIT = _limit("lost_demand_limit")
MIN_CONTRIBUTION = _limit("min_contribution")
THIN_CONTRIBUTION = _limit("thin_contribution")
ADS_SHARE_LIMIT = _limit("ads_share_limit")
MIN_ROAS = _limit("min_roas")
LOW_VISIT_CVR = _limit("low_visit_cvr")
GOOD_VISIT_CVR = _limit("good_visit_cvr")
LOW_TRAFFIC_30D = _limit("low_traffic_30d")
VIRAL_VIDEO_VIEWS = _limit("viral_video_views")
# Video rules
MIN_VIDEO_VIEWS = _limit("min_video_views")
MIN_COMPLETION = _limit("min_completion")
MIN_VIDEO_CTR = _limit("min_video_ctr")
MIN_VIDEO_CVR = _limit("min_video_cvr")
WEAK_SKU_RATING = _limit("weak_sku_rating")
WEAK_SKU_POSITIVE = _limit("weak_sku_positive")
# Provenance of the limits above, attached to every diagnosis so the UI can show they are not calibrated.
_SUMMARY = cal.summarize([k for k in cal.load()["constants"] if k.startswith("shop_diagnosis.")], [])
CALIBRATION = {"status": _SUMMARY["status"], "source": _SUMMARY["source"]}

SHOP_KEYS = [
    "orders_30d", "visits_30d", "visit_to_order_cvr", "cancellation_rate", "return_rate",
    "late_shipment_rate", "rating_count", "age_days", "ads_gmv_share", "roas",
    "contribution_margin_rate", "stockout_sku_ratio", "lost_demand_share", "lost_gmv_estimate_vnd",
    "sku_positive_ratio_avg", "negative_topics", "video_views_30d", "video_ctr",
]


@dataclass
class Finding:
    area: str
    severity: float          # >= 1 means the rule threshold is breached
    root_cause: str
    evidence: list[str]
    action: str
    priority: str = field(init=False)

    def __post_init__(self):
        self.severity = round(self.severity, 2)
        self.priority = "P1" if self.severity >= 1.5 else "P2" if self.severity >= 1 else "P3"


def pct(x: float) -> str:
    return f"{x:.1%}"


def _shop_findings(s: dict) -> list[Finding]:
    found = []
    ops = max(s["late_shipment_rate"] / LATE_LIMIT, s["cancellation_rate"] / CANCEL_LIMIT)
    if ops >= 1:
        found.append(Finding(
            "operations", ops, "Giao hàng trễ và/hoặc hủy đơn vượt ngưỡng, làm tổn hại sức khỏe tài khoản.",
            [f"giao trễ {pct(s['late_shipment_rate'])} (ngưỡng {pct(LATE_LIMIT)})",
             f"hủy đơn {pct(s['cancellation_rate'])} (ngưỡng {pct(CANCEL_LIMIT)})",
             f"chủ đề review tiêu cực: {', '.join(s['negative_topics']) or '-'}"],
            "Ưu tiên vận hành: rà quy trình đóng gói, đổi đơn vị vận chuyển, đồng bộ tồn kho để giảm hủy; "
            "chưa nên tăng traffic khi chưa xử lý xong."))
    if s["return_rate"] / RETURN_LIMIT >= 1:
        found.append(Finding(
            "returns_trust", s["return_rate"] / RETURN_LIMIT,
            "Tỷ lệ trả hàng cao: sản phẩm không khớp kỳ vọng hoặc chất lượng có vấn đề.",
            [f"trả hàng {pct(s['return_rate'])} (ngưỡng {pct(RETURN_LIMIT)})",
             f"review tích cực trung bình {pct(s['sku_positive_ratio_avg'])}",
             f"chủ đề review tiêu cực: {', '.join(s['negative_topics']) or '-'}"],
            "Đối chiếu claim trong listing/video với sản phẩm thật, bỏ claim quá đà, kiểm tra lô hàng, "
            "phản hồi review tiêu cực."))
    if s["lost_demand_share"] / LOST_DEMAND_LIMIT >= 1:
        found.append(Finding(
            "inventory", s["lost_demand_share"] / LOST_DEMAND_LIMIT,
            "SKU hết hàng trong khi vẫn có người xem: doanh thu bị mất do thiếu hàng, không phải do thiếu cầu.",
            [f"{pct(s['stockout_sku_ratio'])} SKU đang hết hàng",
             f"{pct(s['lost_demand_share'])} lượt xem sản phẩm rơi vào lúc hết hàng",
             f"GMV ước tính bị mất {s['lost_gmv_estimate_vnd']:,.0f} đ"],
            "Nhập hàng ngay cho SKU hết, đặt cảnh báo tồn kho theo số ngày bán; tạm dừng ads/video đang trỏ vào "
            "SKU hết và chuyển sang SKU thay thế."))
    margin = s["contribution_margin_rate"]
    if margin < THIN_CONTRIBUTION:
        found.append(Finding(
            "profitability", (THIN_CONTRIBUTION - margin) / (THIN_CONTRIBUTION - MIN_CONTRIBUTION),
            "Biên đóng góp mỏng hoặc âm: bán nhiều nhưng sau giá vốn, phí sàn, voucher và ads không còn lãi.",
            [f"biên đóng góp {pct(margin)} (tối thiểu {pct(MIN_CONTRIBUTION)})",
             f"{s['orders_30d']:,} đơn/30 ngày"],
            "Xem lại giá vốn và mức giảm giá/voucher, ngừng đẩy SKU lỗ, tính giá sàn theo biên mục tiêu."))
    if s["ads_gmv_share"] > ADS_SHARE_LIMIT and s["roas"] < MIN_ROAS:
        found.append(Finding(
            "ads_efficiency", max(s["ads_gmv_share"] / ADS_SHARE_LIMIT, MIN_ROAS / s["roas"]),
            "Doanh thu phụ thuộc quảng cáo với ROAS thấp: chi phí mua khách ăn mòn lợi nhuận.",
            [f"{pct(s['ads_gmv_share'])} GMV đến từ ads (ngưỡng {pct(ADS_SHARE_LIMIT)})",
             f"ROAS {s['roas']} (tối thiểu {MIN_ROAS})"],
            "Cắt nhóm quảng cáo ROAS thấp, dồn ngân sách vào SKU/keyword hiệu quả, đầu tư kênh tự nhiên "
            "(video, SEO listing) để giảm phụ thuộc."))
    if s["visit_to_order_cvr"] < LOW_VISIT_CVR:
        viral = s["video_views_30d"] >= VIRAL_VIDEO_VIEWS and s["video_ctr"] < MIN_VIDEO_CTR
        found.append(Finding(
            "conversion", LOW_VISIT_CVR / max(s["visit_to_order_cvr"], 1e-6),
            ("Video viral nhưng ít người bấm vào sản phẩm, và khách vào shop cũng ít mua."
             if viral else "Nhiều lượt vào shop nhưng tỷ lệ mua thấp."),
            [f"visit -> order {pct(s['visit_to_order_cvr'])} (ngưỡng {pct(LOW_VISIT_CVR)})",
             f"video {s['video_views_30d']:,} views, CTR sang sản phẩm {pct(s['video_ctr'])}",
             f"review tích cực trung bình {pct(s['sku_positive_ratio_avg'])}"],
            "Kiểm tra SKU (ảnh, mô tả, rating), offer (giá, voucher), trust (review, claim) và đường mua "
            "(link giỏ hàng, biến thể); chưa cần thêm traffic."))
    if s["visit_to_order_cvr"] >= GOOD_VISIT_CVR and s["visits_30d"] < LOW_TRAFFIC_30D:
        found.append(Finding(
            "traffic", LOW_TRAFFIC_30D / s["visits_30d"],
            "Shop chuyển đổi tốt nhưng ít người biết tới: nút thắt là tiếp cận, không phải sản phẩm.",
            [f"visit -> order {pct(s['visit_to_order_cvr'])} (tốt từ {pct(GOOD_VISIT_CVR)})",
             f"{s['visits_30d']:,} lượt vào/30 ngày (thấp dưới {LOW_TRAFFIC_30D:,})"],
            "Tăng tiếp cận: thêm video/livestream, ads cho SKU chuyển đổi tốt nhất, tham gia campaign sàn; "
            "không cần sửa sản phẩm."))
    return sorted(found, key=lambda f: f.severity, reverse=True)


def diagnose_shop(features: FeatureMap, mode: Mode) -> dict:
    view = FeatureView(features, mode)
    try:
        s = {k: view[f"shop.{k}"] for k in SHOP_KEYS}
    except FeatureUnavailable as e:
        return {"status": "not_scored", "reason": str(e)}
    status = "simulation" if any(f.is_mock_based for f in view.used.values()) else "estimate"
    findings = _shop_findings(s)

    gaps = [msg for ok, msg in [
        (s["orders_30d"] >= MIN_ORDERS_30D, f"{s['orders_30d']} đơn/30 ngày (< {MIN_ORDERS_30D})"),
        (s["rating_count"] >= MIN_RATING_COUNT, f"{s['rating_count']} đánh giá (< {MIN_RATING_COUNT})"),
        (s["age_days"] >= MIN_SHOP_AGE_DAYS, f"shop {s['age_days']} ngày tuổi (< {MIN_SHOP_AGE_DAYS})"),
    ] if not ok]
    if gaps:
        low = Finding("low_confidence", 1.0, "Chưa đủ lịch sử để chấm chắc chắn; không kết luận shop yếu.", gaps,
                      "Thu thập thêm dữ liệu (tối thiểu 30 ngày và 100 đơn) trước khi tối ưu; "
                      "theo dõi các tín hiệu sơ bộ.")
        return {"status": status, "calibration": CALIBRATION, "confidence": "low", "primary_issue": "low_confidence",
                "findings": [asdict(low)], "tentative": [asdict(f) for f in findings]}

    if not findings or findings[0].severity < 1:
        findings.insert(0, Finding(
            "growth", 0.0, "Không có nút thắt vượt ngưỡng: shop đang vận hành tốt.",
            [f"visit -> order {pct(s['visit_to_order_cvr'])}", f"biên đóng góp {pct(s['contribution_margin_rate'])}"],
            "Nhân rộng cái đang hiệu quả: tăng ngân sách cho SKU/video tốt nhất, mở rộng SKU cùng nhóm, "
            "thử bundle để tăng giá trị đơn."))
    return {"status": status, "calibration": CALIBRATION, "confidence": "high", "primary_issue": findings[0].area,
            "findings": [asdict(f) for f in findings], "tentative": []}


VERDICTS = {
    "healthy": ("Video và SKU đều ổn.",
                "Giữ creative, tăng phân phối cho video này."),
    "weak_video": ("Lỗi ở video: người xem bỏ sớm và hầu như không bấm vào sản phẩm, trong khi SKU vẫn bán được.",
                   "Làm lại 3 giây đầu, đưa sản phẩm và lợi ích lên sớm, rút ngắn video."),
    "views_without_clicks": ("Video giữ được người xem nhưng không dẫn tới sản phẩm.",
                             "Thêm CTA và ghim giỏ hàng rõ ràng, kiểm tra sản phẩm trong video khớp listing, "
                             "thêm offer."),
    "weak_sku": ("Video kéo được click nhưng SKU không chốt được đơn (rating/review yếu).",
                 "Không cần sửa video; sửa trang SKU (ảnh, mô tả, review tiêu cực) hoặc đổi sang SKU mạnh hơn."),
    "offer_or_purchase_path": ("Có click nhưng ít mua dù SKU ổn.",
                               "Kiểm tra giá, voucher, phí ship, biến thể và các bước thanh toán."),
    "stockout_sku": ("Video đang dẫn khách vào SKU hết hàng.",
                     "Nhập hàng hoặc đổi link sang SKU thay thế; tạm dừng đẩy video."),
    "insufficient_data": ("Chưa đủ lượt xem để kết luận.",
                          "Tiếp tục chạy để thu thập dữ liệu trước khi đánh giá."),
}


def _video_verdict(v: dict) -> str:
    if v["views"] < MIN_VIDEO_VIEWS:
        return "insufficient_data"
    if not v["sku_in_stock"]:
        return "stockout_sku"
    if v["completion_rate"] < MIN_COMPLETION and v["product_ctr"] < MIN_VIDEO_CTR:
        return "weak_video"
    if v["product_ctr"] < MIN_VIDEO_CTR:
        return "views_without_clicks"
    if v["click_to_order_cvr"] < MIN_VIDEO_CVR:
        weak = v["sku_rating"] < WEAK_SKU_RATING or v["sku_positive_ratio"] < WEAK_SKU_POSITIVE
        return "weak_sku" if weak else "offer_or_purchase_path"
    return "healthy"


def _content_notes(verdict: str, content: dict) -> list[str]:
    """Cross-check what the VLM saw in the video against how the video actually performed."""
    notes = []
    hook = content.get("video.hook_strength")
    if hook is not None:
        if verdict == "weak_video" and hook >= 7:
            notes.append(f"VLM chấm hook {hook}/10 nhưng người xem bỏ sớm: hook có thể không hợp tệp khán giả.")
        elif verdict in ("healthy", "weak_sku") and hook < 5:
            notes.append(f"VLM chấm hook {hook}/10 nhưng video vẫn kéo click: hiệu suất thực tế đáng tin hơn.")
    if verdict == "views_without_clicks" and content.get("video.has_cta") is False:
        notes.append("VLM không thấy CTA trong video: khớp với CTR thấp, nên thêm CTA giỏ hàng.")
    if verdict == "weak_sku" and content.get("video.key_claims"):
        notes.append("Đối chiếu claim trong video với listing: " + "; ".join(content["video.key_claims"][:3]))
    return notes


def diagnose_video(row: dict, content: FeatureMap | None = None) -> dict:
    """row: one item of shop.videos; content: REAL video.* features from the VLM extractor, if attached."""
    verdict = _video_verdict(row)
    reason, action = VERDICTS[verdict]
    real = {k: f.value for k, f in (content or {}).items()
            if k.startswith("video.") and f.status == SourceStatus.REAL}
    return {
        "video_id": row["video_id"],
        "sku": f"{row['sku_id']} · {row['item_name']}",
        "verdict": verdict,
        "reason": reason,
        "action": action,
        "evidence": (f"views {row['views']:,} · completion {pct(row['completion_rate'])} · "
                     f"CTR {pct(row['product_ctr'])} · CVR {pct(row['click_to_order_cvr'])} · "
                     f"SKU rating {row['sku_rating']}, review+ {pct(row['sku_positive_ratio'])}"
                     + ("" if row["sku_in_stock"] else f" · hết hàng từ {row['sku_stockout_date']}")),
        "content_notes": _content_notes(verdict, real),
    }
