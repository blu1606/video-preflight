"""Shop-level rubric: Shop Health -> SKU Quality -> Sales Efficiency -> Video Conversion.

Same contract as rubric.py (one 0-100 function per criterion, missing input -> not_scored).
Benchmarks come from fixtures/calibration_v0.json; all are placeholders tuned to the synthetic seed,
not calibrated on real shops, and each criterion reports that in its `calibration` block.
"""

from core.rubric import Criterion, clamp, stars
from sources import calibration as cal

# Module-level aliases of the calibration values (kept for importers).
WORST_LATE_RATE = cal.value("shop_rubric.worst_late_rate")        # rate at which a criterion reaches 0 points
WORST_CANCEL_RATE = cal.value("shop_rubric.worst_cancel_rate")
WORST_RETURN_RATE = cal.value("shop_rubric.worst_return_rate")
WORST_LOST_DEMAND = cal.value("shop_rubric.worst_lost_demand")
BENCH_VISIT_TO_ORDER_CVR = cal.value("shop_rubric.bench_visit_to_order_cvr")
BENCH_VISITS_30D = cal.value("shop_rubric.bench_visits_30d")
BENCH_ROAS = cal.value("shop_rubric.bench_roas")
BENCH_CONTRIBUTION_MARGIN = cal.value("shop_rubric.bench_contribution_margin")


def inverse(rate: float, worst: float) -> float:
    return clamp(100 * (1 - rate / worst))


def share_of(value: float, bench: float) -> float:
    return clamp(value / bench * 100)


RUBRICS: dict[str, list[Criterion]] = {
    "shop_health": [
        Criterion("H1", "On-time shipping", 0.30,
                  lambda v: inverse(v["shop.late_shipment_rate"], v.const("shop_rubric.worst_late_rate"))),
        Criterion("H2", "Low cancellation", 0.25,
                  lambda v: inverse(v["shop.cancellation_rate"], v.const("shop_rubric.worst_cancel_rate"))),
        Criterion("H3", "Low returns", 0.25,
                  lambda v: inverse(v["shop.return_rate"], v.const("shop_rubric.worst_return_rate"))),
        Criterion("H4", "Shop rating", 0.20, lambda v: stars(v, v["shop.rating"])),
    ],
    "sku_quality": [
        Criterion("Q1", "SKU rating (demand-weighted)", 0.30, lambda v: stars(v, v["shop.sku_rating_avg"])),
        Criterion("Q2", "Review sentiment", 0.30, lambda v: v["shop.sku_positive_ratio_avg"] * 100),
        Criterion("Q3", "Listing completeness", 0.15, lambda v: v["shop.listing_completeness"] * 100),
        Criterion("Q4", "Stock availability", 0.25,
                  lambda v: inverse(v["shop.lost_demand_share"], v.const("shop_rubric.worst_lost_demand"))),
    ],
    "sales_efficiency": [
        Criterion("E1", "Visit -> order CVR", 0.30,
                  lambda v: share_of(v["shop.visit_to_order_cvr"], v.const("shop_rubric.bench_visit_to_order_cvr"))),
        Criterion("E2", "Traffic volume", 0.20,
                  lambda v: share_of(v["shop.visits_30d"], v.const("shop_rubric.bench_visits_30d"))),
        Criterion("E3", "Ads efficiency", 0.20,
                  lambda v: 50 * min(1, v["shop.roas"] / v.const("shop_rubric.bench_roas"))
                  + 50 * (1 - v["shop.ads_gmv_share"])),
        Criterion("E4", "Contribution margin", 0.30,
                  lambda v: share_of(v["shop.contribution_margin_rate"],
                                     v.const("shop_rubric.bench_contribution_margin"))),
    ],
    "video_conversion": [
        Criterion("VC1", "Video -> product CTR", 0.35,
                  lambda v: share_of(v["shop.video_ctr"], v.const("rubric.bench_product_ctr"))),
        Criterion("VC2", "Video click -> order CVR", 0.35,
                  lambda v: share_of(v["shop.video_cvr"], v.const("rubric.bench_click_to_order_cvr"))),
        Criterion("VC3", "Video completion", 0.30,
                  lambda v: share_of(v["shop.video_completion_rate"], v.const("rubric.bench_completion_rate"))),
    ],
}
