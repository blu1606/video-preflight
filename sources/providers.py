"""Data providers. Each returns a FeatureMap with namespaced keys (video.*, sku.*, market.*, perf.*).

Swapping a mock provider for a real one (web search, marketplace API, analytics CSV)
must not require any change in the scoring engine.
"""

import json
import math
import re
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Protocol

import cv2

from core.schema import Feature, FeatureMap, SourceStatus
from sources import calibration as cal
from sources import pacing
from sources.extractor import clean_transcript

DEMO = Path(__file__).resolve().parents[1]


class Provider(Protocol):
    def load(self) -> FeatureMap: ...


def _fmt_ts(sec: float) -> str:
    return f"{int(sec // 60):02d}:{int(sec % 60):02d}"


NOT_EXTRACTED = "not in cached extraction; re-extract with the current prompt"
# decision_evidence keys (extractor schema 3) exposed as video.<key>
DECISION_EVIDENCE = ("problem", "value_propositions", "on_screen_text", "offer", "product_visibility",
                     "trust_signals", "product_mentions", "inferred_target_audience", "disclosure_signals")
# narrative_and_emotion sub-section -> (list of timestamped items, label field of each item)
NARRATIVE_ITEMS = {
    "storytelling": ("beats", "beat"),
    "emotion": ("triggers", "trigger"),
    "shareability": ("share_drivers", "driver"),
}


def _narrative_feature(section: dict | None, name: str, source: str) -> Feature:
    """1-10 score with reason and timestamped items as evidence; MISSING for old caches or bad values."""
    if section is None:
        return Feature.missing(f"{name}: {NOT_EXTRACTED}")
    item = section.get(name)
    if not isinstance(item, dict):
        return Feature.missing(f"{name}: {NOT_EXTRACTED}")
    score = item.get("score_1_to_10")
    if isinstance(score, bool) or not isinstance(score, (int, float)) or not 1 <= score <= 10:
        return Feature.missing(f"{name}: extractor returned invalid score {score!r}")
    list_key, label_key = NARRATIVE_ITEMS[name]
    evidence = [f"{k}: {item[k]}" for k in ("arc_type", "dominant_emotion", "reason") if item.get(k)]
    for row in item.get(list_key) or []:
        if isinstance(row, dict) and isinstance(row.get("timestamp_sec"), (int, float)):
            evidence.append(f"{_fmt_ts(row['timestamp_sec'])} {row.get(label_key, '')}: {row.get('description', '')}")
    return Feature(float(score), SourceStatus.REAL, source, evidence)


def _video_path(video_file: str | None) -> Path | None:
    """The cached video file; relative paths are relative to the repo root. None when it is not there."""
    video = Path(video_file) if video_file else None
    if video is not None and not video.is_absolute():
        video = DEMO / video
    return video if video is not None and video.is_file() else None


def _file_features(video_file: str | None) -> FeatureMap:
    """Frame size (OpenCV) and file size / container (file system) for the platform fit check; no API call."""
    keys = ("video.width_px", "video.height_px", "video.file_size_bytes", "video.container")
    video = _video_path(video_file)
    if video is None:
        return {k: Feature.missing(f"video file not available for platform fit: {video_file or 'unknown'}") for k in keys}
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        return {k: Feature.missing(f"cannot open video for frame size: {video.name}") for k in keys}
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    size, container = video.stat().st_size, video.suffix.lstrip(".").lower()
    return {
        "video.width_px": Feature(width, SourceStatus.REAL, "opencv", [f"frame width {width} px as stored"]),
        "video.height_px": Feature(height, SourceStatus.REAL, "opencv", [f"frame height {height} px as stored"]),
        "video.file_size_bytes": Feature(size, SourceStatus.REAL, "file", [f"{size:,} bytes on disk"]),
        "video.container": Feature(container, SourceStatus.REAL, "file", [f"file extension .{container}"]),
    }


def _pacing_features(video_file: str | None, cache_dir: Path) -> FeatureMap:
    """Shot-cut pacing from the video file (OpenCV, cached); MISSING when the file is unavailable."""
    keys = ("video.pacing_avg_shot_sec", "video.pacing_shot_count",
            "video.pacing_cuts_per_10s", "video.pacing_cut_timestamps")
    video = _video_path(video_file)
    if video is None:
        return {k: Feature.missing(f"video file not available for cut detection: {video_file or 'unknown'}") for k in keys}
    try:
        p = pacing.analyze_pacing(video, cache_dir)
    except (OSError, ValueError) as e:
        return {k: Feature.missing(f"cut detection failed: {e}") for k in keys}
    ev = [f"cuts at {', '.join(_fmt_ts(t) for t in p['cut_timestamps_sec']) or 'none'}",
          f"HSV-histogram cut threshold {p['params']['cut_threshold']}"]
    values = (p["avg_shot_sec"], p["shot_count"], p["cuts_per_10s"], p["cut_timestamps_sec"])
    return {k: Feature(v, SourceStatus.REAL, "opencv", ev) for k, v in zip(keys, values)}


class VideoFeatureProvider:
    """Adapts the VLM extractor output (features.json from sandbox.ipynb) to the contract."""

    SOURCE = "video_vlm"

    def __init__(self, features_path: Path):
        self.path = features_path

    def load(self) -> FeatureMap:
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        f = raw["features"]
        hook = f.get("hook_analysis", {})
        demo = f.get("demo_and_product_experience", {})
        proof = f.get("social_proof_and_claims", {})
        cta = f.get("call_to_action", {})
        policy = f.get("policy_signals", {})  # absent in caches extracted before the policy prompt
        narrative = f.get("narrative_and_emotion")  # absent in caches extracted before the narrative prompt
        decision_ev = f.get("decision_evidence")  # schema_version >= 3; observations judged by sources.decision_scorer

        def real(value, evidence=None, source=self.SOURCE, structural=False) -> Feature:
            if value is None:
                return Feature.missing("extractor returned null")
            return Feature(value, SourceStatus.REAL, source, evidence or [], structural=structural)

        # The opening window is the first seconds by definition; a demo that is absent (or has no times) is 00:00-00:00.
        hook_ev = [f"00:00-{_fmt_ts(hook.get('hook_duration_sec', 3.0))}"]
        demo_ev = [f"{_fmt_ts(demo.get('demo_start_sec', 0))}-{_fmt_ts(demo.get('demo_end_sec', 0))}"]
        demo_structural = not demo.get("demo_present") or demo.get("demo_start_sec") is None
        cta_ev = [_fmt_ts(cta["cta_timestamp_sec"])] if cta.get("has_cta") else []

        transcript, segments = clean_transcript(raw.get("transcript"), raw.get("transcript_segments"))
        has_transcript = raw.get("transcript") is not None
        out = {
            "video.duration_sec": real(raw.get("video_duration_sec"), source="opencv"),
            "video.transcript": real(transcript if has_transcript else None, source="whisper"),
            # Timed Whisper segments [{start, end, text}] for timestamped quotes and opening-speech timing.
            "video.transcript_segments": real(segments if raw.get("transcript_segments") is not None else None,
                                              source="whisper"),
            "video.product_name": real(f.get("product", {}).get("name")),
            "video.product_category": real(f.get("product", {}).get("category")),
            "video.hook_type": real(hook.get("hook_type"), hook_ev, structural=True),
            "video.hook_verbal": real(hook.get("verbal_hook"), hook_ev, structural=True),
            "video.hook_strength": real(hook.get("hook_strength_1_to_10"), hook_ev, structural=True),
            "video.demo_present": real(demo.get("demo_present"), demo_ev, structural=demo_structural),
            "video.before_after_shown": real(demo.get("before_after_shown"), demo_ev, structural=demo_structural),
            "video.sensory_details": real(demo.get("sensory_details"), demo_ev, structural=demo_structural),
            "video.clarity_score": real(demo.get("clarity_score_1_to_10"), demo_ev, structural=demo_structural),
            "video.key_claims": real(proof.get("key_claims")),
            "video.authenticity_level": real(proof.get("authenticity_level")),
            "video.has_cta": real(cta.get("has_cta"), cta_ev),
            "video.cta_urgency": real(cta.get("urgency_expressed"), cta_ev),
            "video.policy_absolute_claims": real(policy.get("absolute_claims")),
            "video.policy_before_after": real(policy.get("before_after")),
            "video.policy_ui_overlays": real(policy.get("ui_overlays")),
            "video.policy_realistic_ai_media": real(policy.get("realistic_ai_media")),
            # 1-10 VLM scores with timestamped evidence (MISSING for caches extracted before this prompt).
            **{f"video.{name}": _narrative_feature(narrative, name, self.SOURCE) for name in NARRATIVE_ITEMS},
            # Shot-cut pacing computed locally from the video file (no API call).
            **_pacing_features(raw.get("video_file"), self.path.parent),
            **_file_features(raw.get("video_file")),
            **{f"video.{key}": (real(decision_ev.get(key)) if decision_ev is not None
                                else Feature.missing(f"{key}: {NOT_EXTRACTED}"))
               for key in DECISION_EVIDENCE},
        }
        out["video.product_first_clear_sec"] = _product_first_clear(out["video.product_visibility"])
        out["video.opening_signals"] = _opening_signals(out)
        return out


def _onset(sec) -> bool:
    return not isinstance(sec, bool) and isinstance(sec, (int, float)) and sec >= 0


def _product_first_clear(visibility: Feature) -> Feature:
    """Second at which the VLM first sees the product clearly (decision_evidence.product_visibility)."""
    if visibility.status == SourceStatus.MISSING:
        return Feature.missing(f"product_visibility unavailable: {visibility.evidence[0] if visibility.evidence else ''}")
    v = visibility.value if isinstance(visibility.value, dict) else {}
    sec = v.get("first_clear_sec")
    if not _onset(sec):
        return Feature.missing(f"product_visibility.first_clear_sec is {sec!r}")
    ev = [f"{_fmt_ts(sec)} product first clearly visible ({sec:g} s, VLM on sampled frames)"]
    if v.get("share_of_frames") is not None:
        ev.append(f"visible in {v['share_of_frames']:.0%} of sampled frames")
    return Feature(float(sec), SourceStatus.REAL, VideoFeatureProvider.SOURCE, ev)


def _opening_signals(f: FeatureMap) -> Feature:
    """Onsets of speech, on-screen text and the first hard cut ({speech_sec, text_sec, cut_sec}; None = absent).

    MISSING unless all three sources were observed, so an unrun detector is never read as "no signal".
    """
    inputs = ("video.transcript_segments", "video.on_screen_text", "video.pacing_cut_timestamps")
    missing = [k for k in inputs if f[k].status == SourceStatus.MISSING]
    if missing:
        return Feature.missing("opening signals need " + ", ".join(
            f"{k} ({f[k].evidence[0] if f[k].evidence else 'missing'})" for k in missing))
    segments, texts, cuts = (f[k].value for k in inputs)
    if not all(isinstance(x, list) for x in (segments, texts, cuts)):
        return Feature.missing("opening signals: transcript segments, on-screen text or cuts are not lists")
    speech = next((s for s in sorted((s for s in segments if isinstance(s, dict) and _onset(s.get("start"))),
                                     key=lambda s: s["start"]) if str(s.get("text") or "").strip()), None)
    text = min((t for t in texts if isinstance(t, dict) and _onset(t.get("timestamp_sec"))
                and str(t.get("text") or "").strip()), key=lambda t: t["timestamp_sec"], default=None)
    cut = min((c for c in cuts if _onset(c)), default=None)
    value = {"speech_sec": speech["start"] if speech else None,
             "text_sec": text["timestamp_sec"] if text else None,
             "cut_sec": cut}
    ev = [f"{_fmt_ts(speech['start'])} first speech: {str(speech['text']).strip()[:80]}" if speech else "no speech in transcript",
          f"{_fmt_ts(text['timestamp_sec'])} first on-screen text: {str(text['text']).strip()[:80]}" if text
          else "no on-screen text",
          f"{_fmt_ts(cut)} first hard cut ({cut:g} s)" if cut is not None else "no hard cut detected"]
    return Feature(value, SourceStatus.INFERRED, "rule", ev, input_sources=list(inputs))


class FixtureProvider:
    """Wraps a JSON fixture: every non-null value becomes MOCK, null becomes MISSING."""

    def __init__(self, namespace: str, fixture_path: Path):
        self.namespace = namespace
        self.path = fixture_path

    def load(self) -> FeatureMap:
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        source = f"fixture:{self.path.parent.name}/{self.path.name}"
        out: FeatureMap = {}
        for key, value in raw.items():
            if key.startswith("_"):
                continue
            name = f"{self.namespace}.{key}"
            out[name] = (
                Feature.missing(f"null in {source}")
                if value is None
                else Feature(value, SourceStatus.MOCK, source)
            )
        return out


@lru_cache(maxsize=4)
def load_seed(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def seed_data(seed: Path | dict) -> dict:
    return seed if isinstance(seed, dict) else load_seed(seed)


def _ratio(num: float, den: float) -> float:
    return num / den if den else 0.0


class ShopSeedProvider:
    """Shop / SKU / video performance from the synthetic Shopee seed (fixtures/shopee_seed).

    Emits shop.* (30-day shop KPIs and per-video rows for diagnosis) and, when a seed
    video is selected, the sku.* / perf.* / market.* keys the video rubric already reads.
    Every value is MOCK because the seed itself is synthetic.
    """

    def __init__(self, seed: Path | dict, shop_id: str, video_id: str | None = None, sku_id: str | None = None):
        self.seed = seed  # seed.json path, or the same collections already loaded (e.g. from json-server)
        self.shop_id = shop_id
        self.video_id = video_id
        self.sku_id = sku_id  # an uploaded (not yet posted) video linked to one of the shop's SKUs

    def load(self) -> FeatureMap:
        seed = seed_data(self.seed)
        sid = self.shop_id
        shop = next(s for s in seed["shops"] if s["shop_id"] == sid)
        days = [r for r in seed["shop_daily_metrics"] if r["shop_id"] == sid]
        skus = {s["sku_id"]: s for s in seed["skus"] if s["shop_id"] == sid}
        reviews = {r["sku_id"]: r for r in seed["sku_reviews_summary"] if r["shop_id"] == sid}
        sku_days = [r for r in seed["sku_daily_metrics"] if r["shop_id"] == sid]
        # Posted seed videos only: uploaded videos share the collection but have no performance yet.
        videos = [v for v in seed["videos"] if v["shop_id"] == sid and "video_views" in v]
        source = "db:json-server" if isinstance(self.seed, dict) else f"seed:{self.seed.parent.name}/{self.seed.name}"

        def total(rows, key):
            return sum(r[key] for r in rows)

        paid, gmv = total(days, "paid_orders"), total(days, "gmv_vnd")
        page_views = total(sku_days, "product_page_views")
        ads_spend = total(days, "ads_spend_vnd")

        # Contribution margin on delivered revenue: GMV less cancellations/returns, COGS, fee, voucher, ads.
        kept = 1 - _ratio(total(days, "canceled_orders") + total(days, "returned_orders"), paid)
        net_revenue = gmv * kept
        cogs = sum(r["units_ordered"] * skus[r["sku_id"]]["cost_vnd"] for r in sku_days) * kept
        contribution = (net_revenue * (1 - shop["platform_fee_rate"]) - cogs
                        - total(days, "voucher_cost_vnd") - ads_spend)

        # Demand lost to stockouts: page views while out of stock x the SKU's in-stock conversion.
        lost_views, lost_gmv = 0, 0.0
        sku_cvr: dict[str, float] = {}
        for sku_id, sku in skus.items():
            rows = [r for r in sku_days if r["sku_id"] == sku_id]
            in_stock = [r for r in rows if r["in_stock"]]
            sku_cvr[sku_id] = _ratio(total(in_stock, "units_ordered"), total(in_stock, "product_page_views"))
            oos_views = total([r for r in rows if not r["in_stock"]], "product_page_views")
            lost_views += oos_views
            lost_gmv += oos_views * sku_cvr[sku_id] * sku["price_vnd"]

        views_by_sku = {k: total([r for r in sku_days if r["sku_id"] == k], "product_page_views") for k in skus}

        def demand_weighted(values: dict[str, float]) -> float:
            return _ratio(sum(values[k] * views_by_sku[k] for k in skus), page_views)

        video_rows = [{
            "video_id": v["video_id"],
            "sku_id": v["sku_id"],
            "item_name": skus[v["sku_id"]]["item_name"],
            "views": v["video_views"],
            "completion_rate": v["completion_rate"],
            "product_ctr": round(_ratio(v["product_clicks"], v["video_views"]), 4),
            "click_to_order_cvr": round(_ratio(v["attributed_orders"], v["product_clicks"]), 4),
            "product_clicks": v["product_clicks"],
            "attributed_orders": v["attributed_orders"],
            "sku_rating": skus[v["sku_id"]]["rating"],
            "sku_positive_ratio": reviews[v["sku_id"]]["positive_ratio"],
            "sku_view_cvr": round(sku_cvr[v["sku_id"]], 4),
            "sku_in_stock": skus[v["sku_id"]]["stock"] > 0,
            "sku_stockout_date": skus[v["sku_id"]]["stockout_date"] or None,
        } for v in videos]
        v_views, v_clicks = total(videos, "video_views"), total(videos, "product_clicks")

        shop_values = {
            "name": shop["shop_name"],
            "category": shop["main_category"],
            "orders_30d": paid,
            "gmv_30d_vnd": gmv,
            "visits_30d": total(days, "shop_visits"),
            "visit_to_order_cvr": round(_ratio(paid, total(days, "shop_visits")), 4),
            "cancellation_rate": shop["cancellation_rate_30d"],
            "return_rate": shop["return_rate_30d"],
            "late_shipment_rate": shop["late_shipment_rate_30d"],
            "rating": shop["shop_rating"],
            "rating_count": shop["shop_rating_count"],
            "age_days": shop["shop_age_days"],
            "ads_gmv_share": round(_ratio(total(days, "ads_gmv_vnd"), gmv), 4),
            "roas": round(_ratio(total(days, "ads_gmv_vnd"), ads_spend), 2),
            "contribution_margin_rate": round(_ratio(contribution, net_revenue), 4),
            "stockout_sku_ratio": round(_ratio(sum(s["stock"] == 0 for s in skus.values()), len(skus)), 2),
            "lost_demand_share": round(_ratio(lost_views, page_views), 4),
            "lost_gmv_estimate_vnd": round(lost_gmv, -3),
            "sku_rating_avg": round(demand_weighted({k: s["rating"] for k, s in skus.items()}), 2),
            "sku_positive_ratio_avg": round(demand_weighted({k: r["positive_ratio"] for k, r in reviews.items()}), 3),
            "listing_completeness": round(sum(
                0.5 * min(1, s["image_count"] / 7) + 0.5 * min(1, s["description_length_chars"] / 1000)
                for s in skus.values()) / len(skus), 3),
            "negative_topics": sorted({t for r in reviews.values() for t in json.loads(r["negative_topics"])}),
            "video_views_30d": v_views,
            "video_ctr": round(_ratio(v_clicks, v_views), 4),
            "video_cvr": round(_ratio(total(videos, "attributed_orders"), v_clicks), 4),
            "video_completion_rate": round(_ratio(sum(v["completion_rate"] * v["video_views"] for v in videos), v_views), 3),
            "videos": video_rows,
        }
        out: FeatureMap = {f"shop.{k}": Feature(v, SourceStatus.MOCK, source) for k, v in shop_values.items()}
        if self.video_id or self.sku_id:
            out.update(self._video_features(seed, shop, skus, reviews, sku_days, source))
        return out

    def _video_features(self, seed, shop, skus, reviews, sku_days, source) -> FeatureMap:
        video = next((v for v in seed["videos"] if v["video_id"] == self.video_id and "video_views" in v), None)
        sku_id = self.sku_id or video["sku_id"]
        sku, review = skus[sku_id], reviews[sku_id]
        has_voucher = any(r["voucher_cost_vnd"] > 0 for r in seed["shop_daily_metrics"] if r["shop_id"] == self.shop_id)
        values = {
            "sku.sku_id": sku["sku_id"],
            "sku.title": sku["item_name"],
            "sku.category": sku["category"],
            "sku.price_vnd": sku["price_vnd"],
            "sku.list_price_vnd": sku["original_price_vnd"],
            "sku.has_voucher": has_voucher,
            "sku.rating": sku["rating"],
            "sku.review_count": sku["rating_count"],
            "sku.in_stock": sku["stock"] > 0,
            "sku.shipping_days": sku["shipping_days"],
            "sku.has_product_link": True,  # every seed video is linked to its featured SKU
            "sku.shop_rating": shop["shop_rating"],
            "sku.shop_on_time_rate": round(1 - shop["late_shipment_rate_30d"], 4),
            "sku.unit_margin_vnd": sku["price_vnd"] - sku["cost_vnd"],
            "sku.stock_history": [{"date": r["date"], "in_stock": r["in_stock"]}
                                  for r in sorted(sku_days, key=lambda r: r["date"]) if r["sku_id"] == sku_id],
            "market.review_positive_ratio": review["positive_ratio"],
            "market.top_complaints": json.loads(review["negative_topics"]),
        }
        if video:
            values.update({
                "perf.views": video["video_views"],
                "perf.avg_watch_time_sec": video["avg_watch_time_sec"],
                "perf.completion_rate": video["completion_rate"],
                "perf.product_ctr": round(_ratio(video["product_clicks"], video["video_views"]), 4),
                "perf.click_to_order_cvr": round(_ratio(video["attributed_orders"], video["product_clicks"]), 4),
                "perf.actual_gmv_vnd": video["attributed_gmv_vnd"],
            })
        audience = next((a for a in seed.get("sku_audience", []) if a["sku_id"] == sku_id), None)
        if audience:
            values["context.target_audience"] = {k: audience[k] for k in ("age_bands", "gender_split", "regions", "interests")}
        out = {k: Feature(v, SourceStatus.MOCK, source) for k, v in values.items()}
        if not audience:
            out["context.target_audience"] = Feature.missing("no buyer profile for this SKU (skuAudience)")
        if not video:
            out.update({k: Feature.missing("video not posted yet: no performance data")
                        for k in ("perf.views", "perf.avg_watch_time_sec", "perf.completion_rate", "perf.product_ctr",
                                  "perf.click_to_order_cvr", "perf.actual_gmv_vnd")})
        for key in ("sku.category_fit", "market.competitor_prices_vnd", "market.demand_index",
                    "market.trend_score", "market.similar_video_count"):
            out[key] = Feature.missing("not in shop seed (needs market research source)")
        return out


def _positive(value) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and value > 0


class ListingProvider:
    """Product listing typed in at upload (`video.listing`). REAL user input, not verified against a marketplace.

    Fills only the sku.* keys a listing form can answer; shop/stock/reviews/margin stay MISSING.
    """

    SOURCE = "user_input"
    NOT_IN_LISTING = ("sku.has_voucher", "sku.rating", "sku.review_count", "sku.in_stock", "sku.shipping_days",
                      "sku.shop_rating", "sku.shop_on_time_rate", "sku.unit_margin_vnd", "sku.category_fit")

    def __init__(self, listing: dict):
        self.listing = listing

    def load(self) -> FeatureMap:
        l = self.listing

        def text(key: str) -> str | None:
            value = l.get(key)
            return (value.strip() or None) if isinstance(value, str) else None

        def real(value, evidence=None) -> Feature:
            return Feature(value, SourceStatus.REAL, self.SOURCE, evidence or [])

        title, url, description = text("title") or text("name"), text("url"), text("description")
        out: FeatureMap = {
            "sku.title": real(title) if title else Feature.missing("listing has no title or product name"),
            "sku.description": real(description) if description else Feature.missing("listing description not provided"),
            # A given URL shows the video links a product; no URL is unknown, not proof of no link.
            "sku.has_product_link": real(True, [url]) if url else Feature.missing("listing URL not provided"),
        }
        for key, field_name in (("sku.price_vnd", "price_vnd"), ("sku.list_price_vnd", "list_price_vnd")):
            value = l.get(field_name)
            out[key] = real(value) if _positive(value) else Feature.missing(f"listing {field_name} not provided")
        out.update({k: Feature.missing("not in user-entered listing") for k in self.NOT_IN_LISTING})
        return out


DEFAULT_QUESTION = "Có nên đăng video này không, và cần sửa gì để bán tốt hơn?"


class PostContextProvider:
    """How the seller plans to post an uploaded video (`video.post`, typed at upload) and what they ask.

    post.is_commercial is INFERRED: attaching a SKU or being paid to post makes it commercial content.
    """

    SOURCE = "user_input"

    def __init__(self, post: dict | None, sku_linked: bool):
        self.post = post or {}
        self.sku_linked = sku_linked

    def load(self) -> FeatureMap:
        p = self.post

        def given(key: str, missing: str) -> Feature:
            value = p.get(key)
            empty = value is None or (isinstance(value, str) and not value.strip())
            return Feature.missing(missing) if empty else Feature(value, SourceStatus.REAL, self.SOURCE)

        sponsorship = p.get("sponsorship")
        paid = sponsorship in ("affiliate", "sponsored")
        constraints = {k: p[k] for k in ("goal", "budget_vnd", "campaign") if p.get(k) not in (None, "")}
        query = (p.get("user_query") or "").strip()
        return {
            "post.shopping_link": (Feature(True, SourceStatus.REAL, self.SOURCE, ["SKU attached at upload"])
                                   if self.sku_linked else Feature.missing("no SKU attached at upload")),
            "post.sponsorship": given("sponsorship", "who posts (own shop / affiliate / sponsored) not given"),
            "post.is_commercial": Feature(
                self.sku_linked or paid, SourceStatus.INFERRED, "rule",
                [f"shopping link: {self.sku_linked}", f"sponsorship: {sponsorship or 'not given'}"],
                input_sources=["post.shopping_link", "post.sponsorship"]),
            "post.disclosure_enabled": given("disclosure_enabled", "commercial-content label setting not given"),
            "context.business_constraints": (Feature(constraints, SourceStatus.REAL, self.SOURCE) if constraints
                                             else Feature.missing("business goal not given")),
            "request.user_query": (Feature(query, SourceStatus.REAL, self.SOURCE) if query
                                   else Feature(DEFAULT_QUESTION, SourceStatus.INFERRED, "default", ["no question typed"])),
        }


POST_CONTEXT_KEYS = ("sponsorship", "disclosure_enabled", "goal", "budget_vnd", "campaign", "user_query")


def has_post_context(post: dict | None) -> bool:
    """True when the seller set at least one posting-context field (not just caption / platforms)."""
    return any((post or {}).get(k) not in (None, "") for k in POST_CONTEXT_KEYS)


def clean_hashtags(raw) -> list[str]:
    """Hashtags without '#', whitespace or duplicates (case-insensitive), in the order given.

    Accepts a list of strings or one string separated by commas / spaces ("#a, b #c").
    """
    items = raw if isinstance(raw, list) else re.split(r"[,\s]+", raw) if isinstance(raw, str) else []
    out, seen = [], set()
    for item in items:
        if not isinstance(item, str):
            continue
        for tag in re.split(r"[,\s]+", item):
            tag = tag.strip().lstrip("#").strip()
            if tag and tag.casefold() not in seen:
                seen.add(tag.casefold())
                out.append(tag)
    return out


class PostCopyProvider:
    """Caption and hashtags the seller writes for the post (`video.post`), for seed and uploaded videos alike.

    REAL seller input: it is what viewers read next to the video, not something seen or heard in it.
    """

    SOURCE = "seller"
    NOTE = "seller-written post copy (shown with the video, not spoken or shown in it)"

    def __init__(self, post: dict | None):
        self.post = post or {}

    def load(self) -> FeatureMap:
        caption = self.post.get("caption")
        caption = caption.strip() if isinstance(caption, str) else ""
        tags = clean_hashtags(self.post.get("hashtags"))
        return {
            "post.caption": (Feature(caption, SourceStatus.REAL, self.SOURCE, [self.NOTE]) if caption
                             else Feature.missing("caption not given")),
            "post.hashtags": (Feature(tags, SourceStatus.REAL, self.SOURCE, [self.NOTE]) if tags
                              else Feature.missing("hashtags not given")),
        }


class MusicProvider:
    """Background music of the video (sources/music.py record): `video.music` is the ShazamIO match (REAL, an
    automatic match with no rights check)."""

    def __init__(self, record: dict | None):
        self.record = record or {}

    def load(self) -> FeatureMap:
        r = self.record
        if r.get("status") == "matched":
            music = Feature({"title": r["title"], "artist": r.get("artist"), "shazam_url": r.get("shazam_url"),
                             "matched_window": r.get("matched_window")}, SourceStatus.REAL, "shazamio",
                            [r.get("tool") or "ShazamIO"])
        else:
            music = Feature.missing(r.get("reason") or "không nhận diện được nhạc")
        return {"video.music": music}


def _percentile(values: list[float], q: float) -> float:
    s = sorted(values)
    return s[min(len(s) - 1, int(round(q * (len(s) - 1))))]


MARKET_SNAPSHOTS = DEMO / "fixtures" / "market" / "market_snapshots.json"


@lru_cache(maxsize=2)
def _fixture_snapshots(path: Path = MARKET_SNAPSHOTS) -> tuple:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ()  # no peer data: category percentiles become MISSING and criteria fall back
    return tuple(data) if isinstance(data, list) else ()


def snapshot_category(snapshot: dict) -> str | None:
    """FastMoss level-1 category of the SKU's keyword search (market_category_analysis), if crawled."""
    metrics = (((snapshot.get("tiktok") or {}).get("category") or {}).get("metrics") or {})
    return (metrics.get("category") or {}).get("category_name")


def category_pool(snapshots, category: str) -> list[dict]:
    """Crawled TikTok Shop products FastMoss files under `category` (level 1), de-duplicated by product id.

    The crawl kept the top 10 products by 28-day sales per keyword search, so the pool describes the
    category's best-sellers across every SKU's searches, not the whole category.
    """
    pool: dict[str, dict] = {}
    for snap in snapshots:
        for c in snap.get("competitors") or []:
            if (c.get("platform") == "tiktok_shop" and (c.get("category_l1") or {}).get("name") == category
                    and c.get("product_id")):
                pool.setdefault(c["product_id"], c)
    return list(pool.values())


def _numbers(rows: list[dict], key: str) -> list[float]:
    return [r[key] for r in rows if not isinstance(r.get(key), bool) and isinstance(r.get(key), (int, float))]


class MarketProvider:
    """Crawled market snapshot for one SKU (db collection marketSnapshots, filled from fixtures/market/*.json).

    Observed values (competitor prices, video counts) are REAL; indexes derived from them are INFERRED with
    their formula as evidence. A snapshot older than STALE_DAYS stays usable but says so in its evidence.

    `peers` (every crawled snapshot; defaults to fixtures/market/market_snapshots.json) gives the category
    pool for percentile benchmarks. A percentile is only emitted when the pool and the SKU's own
    comparables are deep enough (calibration market.*_min_n); otherwise it is MISSING with the reason.
    """

    STALE_DAYS = cal.value("market.stale_days")

    def __init__(self, snapshot: dict, today: str | None = None, peers: list[dict] | None = None):
        self.s = snapshot
        self.today = today
        self.peers = peers

    @staticmethod
    def _cite(prov: dict | None) -> str:
        """'<provider> <tool> q=<query> @<date> raw=<file>': the evidence line behind a crawled number."""
        if not prov:
            return "provenance not recorded"
        args = prov.get("arguments") or {}
        query = args.get("keywords") or args.get("q") or (args.get("filter") or {}).get("category_id")
        return f"{prov['provider']} {prov['tool']} q={query!r} @{prov.get('captured_at')} raw={prov.get('raw_file')}"

    def load(self) -> FeatureMap:
        s = self.s
        age = (date.fromisoformat(self.today) if self.today else date.today()) - date.fromisoformat(s["crawled_at"][:10])
        note = [f"snapshot {age.days} days old" + (" (stale)" if age.days > self.STALE_DAYS else "")]
        comps = [c for c in s.get("competitors", []) if c.get("like_for_like") and c.get("price_vnd")]
        prices = [c["price_vnd"] for c in comps]
        sold = [c["sold_count"] for c in comps if isinstance(c.get("sold_count"), int)]
        ratings = [c["rating"] for c in comps if isinstance(c.get("rating"), (int, float))]
        by_platform = {}
        for c in comps:
            by_platform.setdefault(c.get("platform") or "?", c)
        cites = sorted({self._cite(c.get("provenance")) for c in comps})
        platforms = sorted({c.get("platform") or "?" for c in comps})
        source = "crawl:" + "+".join(sorted({(c.get("provenance") or {}).get("provider", "?").split(" ")[0] for c in comps}) or ["?"])
        tiktok = s.get("tiktok") or {}
        tk_cite = [self._cite(tiktok.get("provenance"))]
        out: FeatureMap = {}
        if prices:
            out["market.competitor_prices_vnd"] = Feature(
                prices, SourceStatus.REAL, source,
                note + [f"{len(prices)} like-for-like listings from {', '.join(platforms)}"] + cites)
            category = tiktok.get("category") or {}
            metrics = category.get("metrics") or {}
            out["market.category_benchmark"] = Feature({
                "n": len(prices), "median_price_vnd": _percentile(prices, 0.5),
                "p25_price_vnd": _percentile(prices, 0.25), "p75_price_vnd": _percentile(prices, 0.75),
                "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
                "median_sold_28d": _percentile(sold, 0.5) if sold else None,
                "tiktok_category": (metrics.get("category") or {}).get("category_name"),
                "tiktok_category_scale": metrics.get("scale_metrics"),
                "tiktok_category_growth": metrics.get("growth_metrics"),
            }, SourceStatus.INFERRED, source, note + cites[:3] + [self._cite(category.get("provenance"))],
                input_sources=["market.competitor_prices_vnd"])
        if sold:
            total = sum(sold)
            scale = cal.value("market.demand_full_scale_log10_units")
            out["market.demand_index"] = Feature(
                round(min(100.0, math.log10(total + 1) / scale * 100), 1), SourceStatus.INFERRED, "crawl:FastMoss",
                note + [f"log10(28-day units sold {total} across {len(sold)} TikTok Shop comparables + 1) / {scale} x 100"]
                + tk_cite)
        if isinstance(tiktok.get("video_count"), int):
            out["market.similar_video_count"] = Feature(
                tiktok["video_count"], SourceStatus.REAL, "crawl:FastMoss",
                note + ["videos linked to the like-for-like TikTok Shop products (FastMoss linked_video_count)"] + tk_cite)
        if isinstance(tiktok.get("momentum_7d_vs_28d"), (int, float)):
            m = tiktok["momentum_7d_vs_28d"]
            per_unit = 100 / cal.value("market.trend_full_scale_momentum")
            out["market.trend_score"] = Feature(
                round(min(100.0, per_unit * m), 1), SourceStatus.INFERRED, "crawl:FastMoss",
                note + [f"{per_unit:g} x (7-day units x 4 / 28-day units) = {per_unit:g} x {m}; 50 = flat, >50 rising"]
                + tk_cite)
        own = tiktok.get("own_product")
        if own:
            out["market.own_product_tiktok"] = Feature(
                {k: own.get(k) for k in ("title", "shop", "price_vnd", "sold_count", "gmv_28d_vnd", "units_7d",
                                         "linked_video_count", "linked_creator_count", "rating", "url")},
                SourceStatus.REAL, "crawl:FastMoss",
                note + ["best-selling TikTok Shop listing found for this SKU's brand"] + [self._cite(tiktok.get("own_provenance"))])
        if comps:  # no comparables at all: nothing to rank, criteria report the missing base features
            percentiles, context = self._category_percentiles(comps, note + tk_cite)
            out.update(percentiles)
            if "market.category_benchmark" in out:  # also evidence for the Decisions questions
                out["market.category_benchmark"].value.update(context)
        return out

    def _category_percentiles(self, comps: list[dict], base_ev: list[str]) -> tuple[FeatureMap, dict]:
        """Category percentiles of the SKU's niche (median of its like-for-like TikTok comparables).

        Returns the percentile features and a summary for market.category_benchmark (None where unavailable).
        """
        keys = ("market.demand_percentile", "market.saturation_percentile")
        category = snapshot_category(self.s)
        if not category:
            missing = {k: Feature.missing("FastMoss category of this SKU not crawled") for k in keys}
            return missing, {"category_pool_n": None, "demand_percentile": None, "saturation_percentile": None}
        pool = category_pool(self.peers if self.peers is not None else _fixture_snapshots(), category)
        min_pool, min_niche = cal.value("market.category_percentile_min_n"), cal.value("market.niche_percentile_min_n")
        niche = [c for c in comps if c.get("platform") == "tiktok_shop"]
        out: FeatureMap = {}
        for key, field, label in (("market.demand_percentile", "sold_count", "28-day units sold"),
                                  ("market.saturation_percentile", "linked_video_count", "linked videos")):
            ref, own = _numbers(pool, field), _numbers(niche, field)
            if len(ref) < min_pool:
                out[key] = Feature.missing(f"{category}: {len(ref)} crawled products with {label} (< {min_pool})")
            elif len(own) < min_niche:
                out[key] = Feature.missing(f"{len(own)} like-for-like TikTok comparables with {label} (< {min_niche})")
            else:
                median = _percentile(own, 0.5)
                out[key] = Feature(
                    cal.percentile_rank(ref, median), SourceStatus.INFERRED, "crawl:FastMoss",
                    base_ev + [f"median {label} of {len(own)} like-for-like comparables = {median:,}; "
                               f"percentile among n={len(ref)} crawled '{category}' TikTok Shop best-sellers"],
                    input_sources=["market.competitor_prices_vnd"])
        ratings = _numbers(pool, "rating")
        context = {
            "category_pool_n": len(pool),
            "category_median_rating": _percentile(ratings, 0.5) if len(ratings) >= min_pool else None,
            **{k.removeprefix("market."): (f.value if f.status != SourceStatus.MISSING else None) for k, f in out.items()},
        }
        return out, context


def load_all(providers: list[Provider]) -> FeatureMap:
    features: FeatureMap = {}
    for provider in providers:
        features.update(provider.load())
    return features
