"""Scoring rubric: one function per criterion, each returns a 0-100 score.

A criterion reads features through `v[...]`; if any input is unavailable the
engine marks the criterion as not_scored instead of scoring it 0.
Thresholds and benchmarks live in fixtures/calibration_v0.json (sources.calibration). A criterion reads
them through `v.const(key)` so its score reports which ones it relied on and whether they are placeholders.
Where crawled market data is deep enough, a category percentile replaces the fixed benchmark (`v.get`).
"""

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from sources import calibration as cal


class FeatureUnavailable(Exception):
    """An input is missing (or mock in evidence mode) or too thin to score on: the criterion is not_scored."""


# Module-level aliases of the calibration values (imported by other modules and tests).
BENCH_COMPLETION_RATE = cal.value("rubric.bench_completion_rate")
BENCH_PRODUCT_CTR = cal.value("rubric.bench_product_ctr")
BENCH_CLICK_TO_ORDER_CVR = cal.value("rubric.bench_click_to_order_cvr")
BENCH_GROSS_MARGIN_RATE = cal.value("rubric.bench_gross_margin_rate")
SATURATION_VIDEOS_FOR_ZERO = cal.value("rubric.saturation_videos_for_zero")
AUTHENTICITY_SCORE = cal.value("rubric.authenticity_score")
# Average shot length inside the ideal band scores 100; it falls linearly to 0 at PACING_FRANTIC_SEC
# (too frantic) or PACING_SLOW_SEC (too slow).
PACING_IDEAL_SHOT_SEC = cal.value("rubric.pacing_ideal_shot_sec")
PACING_FRANTIC_SEC = cal.value("rubric.pacing_frantic_sec")
PACING_SLOW_SEC = cal.value("rubric.pacing_slow_sec")
RATING_ZERO_STARS = cal.value("rubric.rating_zero_stars")
RATING_FULL_STARS = cal.value("rubric.rating_full_stars")

# v2 is the scoring source for judgement aspects; v1 stays selectable for comparison and cross-checks.
RUBRIC_STATUS = {
    "v1": "legacy",   # scores VLM self-ratings (hook, storytelling, emotion, shareability, clarity) directly
    "v2": "current",  # judgement via the Decisions question bank; VLM self-ratings are evidence only
}


def clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def rating_to_score(rating: float, zero: float = RATING_ZERO_STARS, full: float = RATING_FULL_STARS) -> float:
    # 3.0 stars -> 0, 5.0 stars -> 100 with the default scale
    return clamp((rating - zero) / (full - zero) * 100)


def stars(v, rating: float) -> float:
    """rating_to_score with the scale read through the view, so the criterion reports it."""
    return rating_to_score(rating, v.const("rubric.rating_zero_stars"), v.const("rubric.rating_full_stars"))


@dataclass(frozen=True)
class Criterion:
    id: str
    name: str
    weight: float
    fn: Callable


# ---------- Viral potential ----------

def hook(v):
    return v["video.hook_strength"] * 10


def storytelling(v):
    return clamp(v["video.storytelling"] * 10)


def pacing_score(avg_shot_sec: float, ideal: tuple[float, float] = PACING_IDEAL_SHOT_SEC,
                 frantic: float = PACING_FRANTIC_SEC, slow: float = PACING_SLOW_SEC) -> float:
    lo, hi = ideal
    if avg_shot_sec < lo:
        return clamp((avg_shot_sec - frantic) / (lo - frantic) * 100)
    if avg_shot_sec > hi:
        return clamp((slow - avg_shot_sec) / (slow - hi) * 100)
    return 100.0


def pacing(v):
    return pacing_score(v["video.pacing_avg_shot_sec"], v.const("rubric.pacing_ideal_shot_sec"),
                        v.const("rubric.pacing_frantic_sec"), v.const("rubric.pacing_slow_sec"))


def emotion(v):
    return clamp(v["video.emotion"] * 10)


def trend(v):
    return v["market.trend_score"]


def shareability(v):
    return clamp(v["video.shareability"] * 10)


def retention(v):
    return clamp(v["perf.completion_rate"] / v.const("rubric.bench_completion_rate") * 100)


def product_speed(v):
    # Seconds until the product is first clearly visible: 100 up to the full-marks second, linear to 0.
    sec = v["video.product_first_clear_sec"]
    full, zero = v.const("rubric.v9_full_marks_sec"), v.const("rubric.v9_zero_sec")
    return clamp((zero - sec) / (zero - full) * 100)


def opening_signals(v):
    # Share of three measurable openers: speech, on-screen text and a hard cut early enough (None = absent).
    s = v["video.opening_signals"]
    limits = {"speech_sec": v.const("rubric.v10_speech_within_sec"),
              "text_sec": v.const("rubric.v10_text_within_sec"),
              "cut_sec": v.const("rubric.v10_cut_within_sec")}
    hits = sum(s[k] is not None and s[k] <= limit for k, limit in limits.items())
    return 100 * hits / len(limits)


# ---------- Conversion potential ----------

def product_clarity(v):
    return v["video.clarity_score"] * 10


def demo_proof(v):
    if not v["video.demo_present"]:
        return 0.0
    before_after = 25 if v["video.before_after_shown"] else 0
    sensory = min(25, 5 * len(v["video.sensory_details"]))
    return 50 + before_after + sensory


def value_proposition(v):
    # 0-100 share of video claims backed by the listing (sources.claims).
    return v["video.claims_sku_match"]


def trust(v):
    return (v.const("rubric.authenticity_score")[v["video.authenticity_level"]] + stars(v, v["sku.rating"])) / 2


def offer(v):
    discount = 1 - v["sku.price_vnd"] / v["sku.list_price_vnd"]
    full = v.const("rubric.offer_full_marks_discount")
    return clamp(discount / full * 100 + (20 if v["sku.has_voucher"] else 0))


def cta(v):
    # Spoken/visual CTA only. Purchase path (cart link) is scored in purchase_friction.
    if not v["video.has_cta"]:
        return 0.0
    return 60 + (40 if v["video.cta_urgency"] else 0)


def purchase_friction(v):
    score = 100.0
    if not v["sku.has_product_link"]:
        score -= 40
    if not v["sku.in_stock"]:
        score -= 50
    score -= 10 * max(0, v["sku.shipping_days"] - v.const("rubric.shipping_days_free"))
    return clamp(score)


def conversion_performance(v):
    ctr = min(1, v["perf.product_ctr"] / v.const("rubric.bench_product_ctr"))
    cvr = min(1, v["perf.click_to_order_cvr"] / v.const("rubric.bench_click_to_order_cvr"))
    return 50 * ctr + 50 * cvr


# ---------- SKU & market ----------

def category_fit(v):
    return v["sku.category_fit"]


def price_competitiveness(v):
    # Share of like-for-like rivals priced above the SKU; too few rivals is not a ranking.
    price = v["sku.price_vnd"]
    rivals = v["market.competitor_prices_vnd"]
    min_n = cal.value("market.price_rank_min_n")
    if len(rivals) < min_n:
        raise FeatureUnavailable(f"market.competitor_prices_vnd has {len(rivals)} like-for-like listings (< {min_n})")
    return 100 * sum(p > price for p in rivals) / len(rivals)


def product_rating(v):
    # Fixed star scale, not a category percentile: the crawled pool holds only best-sellers on another
    # platform's rating scale, so ranking any SKU against it would be biased low.
    full_conf = v.const("rubric.review_count_full_confidence")
    confidence = min(1.0, math.log10(max(1, v["sku.review_count"])) / math.log10(full_conf))
    return stars(v, v["sku.rating"]) * confidence


def review_sentiment(v):
    return v["market.review_positive_ratio"] * 100


def market_demand(v):
    # Category percentile of the niche's typical 28-day sales; fallback: log-scaled demand index.
    pct = v.get("market.demand_percentile")
    return pct if pct is not None else v["market.demand_index"]


def competitive_saturation(v):
    # Fewer videos per rival than the category's best-sellers = less saturated; fallback: fixed video count.
    pct = v.get("market.saturation_percentile")
    if pct is not None:
        return 100 - pct
    return clamp(100 - v["market.similar_video_count"] / v.const("rubric.saturation_videos_for_zero") * 100)


def seller_reliability(v):
    return (stars(v, v["sku.shop_rating"]) + v["sku.shop_on_time_rate"] * 100) / 2


def margin(v):
    rate = v["sku.unit_margin_vnd"] / v["sku.price_vnd"]
    return clamp(rate / v.const("rubric.bench_gross_margin_rate") * 100)


# ---------- Policy compliance ----------

def policy_compliance(v):
    # Lowest per-target score from core.policy_check (100 = no counted rule needs review).
    return v["policy.score"]


POST_PUBLISH_GROUP = "post_publish_performance"

RUBRICS: dict[str, list[Criterion]] = {
    "viral_potential": [
        Criterion("V1", "Hook", 0.25, hook),
        Criterion("V2", "Storytelling", 0.15, storytelling),
        Criterion("V3", "Pacing", 0.10, pacing),
        Criterion("V4", "Emotion", 0.15, emotion),
        Criterion("V5", "Trend relevance", 0.10, trend),
        Criterion("V6", "Shareability", 0.10, shareability),
    ],
    "conversion_potential": [
        Criterion("C1", "Product clarity", 0.15, product_clarity),
        Criterion("C2", "Demo / proof", 0.15, demo_proof),
        Criterion("C3", "Value proposition", 0.15, value_proposition),
        Criterion("C4", "Trust / credibility", 0.15, trust),
        Criterion("C5", "Offer attractiveness", 0.10, offer),
        Criterion("C6", "CTA", 0.10, cta),
        Criterion("C7", "Purchase friction", 0.10, purchase_friction),
    ],
    "sku_market": [
        Criterion("S1", "Category fit", 0.10, category_fit),
        Criterion("S2", "Price competitiveness", 0.15, price_competitiveness),
        Criterion("S3", "Product rating", 0.15, product_rating),
        Criterion("S4", "Review sentiment", 0.15, review_sentiment),
        Criterion("S5", "Market demand", 0.15, market_demand),
        Criterion("S6", "Competitive saturation", 0.10, competitive_saturation),
        Criterion("S7", "Seller reliability", 0.10, seller_reliability),
        Criterion("S8", "Margin / commission", 0.10, margin),
    ],
    # Measured after publishing: shown on its own, never counted in the pre-publish video score.
    POST_PUBLISH_GROUP: [
        Criterion("V7", "Retention performance", 1.0, retention),
        Criterion("C8", "Conversion performance", 1.0, conversion_performance),
    ],
    # Own group so a policy risk is never averaged away by strong conversion criteria.
    "policy_compliance": [
        Criterion("R1", "Policy compliance", 1.0, policy_compliance),
    ],
}


# ---------- Rubric v2: Decisions API question bank + v1's quantitative criteria ----------

QUESTION_BANK = Path(__file__).resolve().parents[1] / "fixtures" / "decisions_v1" / "decision_question_bank.json"
V2_GROUPS = {"V": "viral_potential", "C": "conversion_potential", "S": "sku_market", "H": "shop_health"}
# Measured outcomes / formulas the bank does not ask about; weights on the bank's scale (~1).
# V9 / V10 measure the opening (content only, so they stay in prepublish scoring); the bank's V01 / V08
# still judge whether the opening is good.
V2_QUANTITATIVE = {
    "viral_potential": [Criterion("V9", "Tốc độ vào sản phẩm", 0.7, product_speed),
                        Criterion("V10", "Tín hiệu mở đầu", 0.7, opening_signals)],
    "sku_market": [Criterion("S2", "Price competitiveness", 1.0, price_competitiveness),
                   Criterion("S8", "Margin / commission", 1.0, margin)],
    POST_PUBLISH_GROUP: [Criterion("V7", "Retention performance", 1.0, retention),
                         Criterion("C8", "Conversion performance", 1.0, conversion_performance)],
}


def decision_criterion(qid: str):
    def fn(v):
        # 0-100 normalized Decisions score (sources.decision_scorer); MISSING when not eligible or not asked
        return v[f"decision.{qid}"]
    fn.__name__ = f"decision_{qid}"
    return fn


def _rubrics_v2() -> dict[str, list[Criterion]]:
    bank = json.loads(QUESTION_BANK.read_text(encoding="utf-8"))["questions"]
    groups: dict[str, list[Criterion]] = {name: [] for name in [*V2_GROUPS.values(), POST_PUBLISH_GROUP]}
    for q in bank:
        if q["question"]["type"] == "score":  # choice / predicate answers are never averaged into a score
            name = q["dimension"].replace("_", " ").capitalize()
            groups[V2_GROUPS[q["id"][0]]].append(Criterion(q["id"], name, float(q["weight"]), decision_criterion(q["id"])))
    for group, criteria in V2_QUANTITATIVE.items():
        groups[group] += criteria
    groups["policy_compliance"] = RUBRICS["policy_compliance"]
    return groups


RUBRICS_V2 = _rubrics_v2()
RUBRIC_VERSIONS = {"v1": RUBRICS, "v2": RUBRICS_V2}
