"""Clipcat video benchmark: reported outcomes of 24 real TikTok Shop videos (fixtures/clipcat_benchmark).

Clipcat numbers are third-party platform metrics nobody verified, so they are REAL (collected
from a real source) with their review_flag kept as evidence. They live in bench.* and are never
mixed into perf.* (the seed funnel): `sales` is units over an unknown attribution window, not
orders, and GMV is in USD. Rows are assigned to the seed shop whose main_category fits the
product, and each shop's rows are paired, in CSV order, with the seed videos SHOPxxx-VID01..03
as a synthetic association; the real video does not belong to that shop. A row with no shop
(more videos of a category than seed slots) has no seed video.

Views barely track sales in this set, so sales is the primary outcome label. Rows whose
GMV/sales (USD per unit) falls outside the category's plausible price band are flagged
AOV_OUT_OF_BAND and, like ANOMALY_REVIEW, left out of rank agreement.

public_product_candidates.csv holds Shopee listings that match a video's brand/product, taken
from search snippets (fetched_at unknown; shopee.vn blocks direct HTTP checks). They are REAL
listings but candidates, never attribution: the TikTok creator is not verified to sell through
that shop, and Shopee units are never added to Clipcat's.

Usage (from the repo root):
    uv run python -m sources.benchmark               # model scores vs reported outcomes for videos already extracted
    uv run python -m sources.benchmark --download    # fetch missing benchmark videos into data/<shop_id>/<clipcat_id>.mp4
    uv run python -m sources.benchmark --labels      # write fixtures/clipcat_benchmark/video_labels.json
"""

import csv
import json
import math
import re
import sys
import time
import urllib.request
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

import pandas as pd
from tabulate import tabulate

from core.schema import Feature, FeatureMap, GroupScore, SourceStatus
from sources import media

DEMO = Path(__file__).resolve().parents[1]
BENCH_DIR = DEMO / "fixtures" / "clipcat_benchmark"
BENCH_CSV = BENCH_DIR / "clipcat_video_benchmark_24.csv"
CANDIDATES_CSV = BENCH_DIR / "public_product_candidates.csv"
SYNTHETIC_CSV = BENCH_DIR / "synthetic_product_listings.csv"  # MOCK, from build_synthetic_listings.py
ALIASES = BENCH_DIR / "video_files.json"
DATA_DIR = media.DATA_DIR
NUMERIC = ["views_reported", "sales_reported", "gmv_usd_reported", "likes_reported", "shares_reported",
           "saves_reported"]
MIN_ROWS_FOR_CORRELATION = 5
EXCLUDED_FLAGS = {"ANOMALY_REVIEW", "AOV_OUT_OF_BAND"}
# Plausible USD per unit sold on VN TikTok Shop, per benchmark category. Judgment, not market data:
# wide enough for combos and cheap promos, narrow enough to catch GMV/sales that cannot be one unit.
AOV_BAND_USD = {
    "beauty": (1, 25), "phones": (0.5, 30), "fashion": (2, 30), "kitchenware": (1, 40), "home": (0.5, 40),
    "sports": (1, 25), "home_appliance": (4, 80), "health": (2, 40), "food": (1, 15), "baby": (1, 40),
}  # home allows combo packs (the attached Downy product is 2 x 3.2L)
USD_VND = 26000  # assumption for comparing Clipcat USD with Shopee VND listing prices


def aov_check(category: str, aov_usd: float) -> str:
    low, high = AOV_BAND_USD[category]
    return "IN_BAND" if low <= aov_usd <= high else "AOV_OUT_OF_BAND"


@lru_cache(maxsize=1)
def load_benchmark() -> tuple[dict, ...]:
    with BENCH_CSV.open(encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    slot: dict[str, int] = defaultdict(int)
    for r in rows:
        for key in NUMERIC:
            r[key] = float(r[key])
        r["clipcat_id"] = r["clipcat_url"].rstrip("/").rsplit("/", 1)[-1]
        r["aov_usd"] = round(r["gmv_usd_reported"] / r["sales_reported"], 2)
        r["aov_check"] = aov_check(r["category"], r["aov_usd"])
        shop = r["synthetic_shop_id_analogy"]
        slot[shop] += 1
        r["seed_video_id"] = f"{shop}-VID{slot[shop]:02d}" if shop else None
    return tuple(rows)


@lru_cache(maxsize=1)
def load_listings() -> dict[str, list[dict]]:
    """Shopee listings per clipcat_id: real ones first (REAL, search snippets, not attribution), then
    synthetic ones (MOCK) for videos without a real listing.

    match_type: same_product_candidate (brand/title match), bundle_or_related, or competitor_candidate
    (same category only). The first same_product_candidate of a video is its primary listing. A real
    listing may carry MOCK attributes/image_count/review_count, named in its `mock_fields`.
    """
    def parse(r: dict, status: SourceStatus) -> dict:
        row = {**r, "price_vnd": int(r["price_vnd"]), "rating": float(r["rating"]) if r["rating"] else None,
               "sold_displayed": r["sold_displayed"] or None, "note": r["note"] or None, "source_status": status.value}
        return {**row, **_synthetic_extras(r)} if "attributes" in r else row

    listings: dict[str, list[dict]] = defaultdict(list)
    with CANDIDATES_CSV.open(encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            listings[r.pop("clipcat_id")].append(parse(r, SourceStatus.REAL))
    with SYNTHETIC_CSV.open(encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            cid = r.pop("clipcat_id")
            if r["match_type"] == "attributes_only":
                # MOCK fields a real listing lacks; the real listing's own fields stay REAL
                real = next(x for x in listings[cid] if x["sku_title"] == r["sku_title"])
                real.update({**_synthetic_extras(r), "mock_fields": ["attributes", "image_count", "review_count"]})
            else:
                listings[cid].append(parse(r, SourceStatus.MOCK))
    return dict(listings)


def _synthetic_extras(r: dict) -> dict:
    return {"attributes": json.loads(r["attributes"]), "image_count": int(r["image_count"]),
            "review_count": int(r["review_count"])}


def primary_listing(clipcat_id: str) -> dict | None:
    return next((x for x in load_listings().get(clipcat_id, []) if x["match_type"] == "same_product_candidate"), None)


class ListingCandidatesProvider:
    """listing.* (the product attached to the video + its primary Shopee listing) and
    market.comparable_listings (the other Shopee listings).

    - listing.title / listing.tiktok_product_id: the TikTok Shop product attached to the video (REAL, Clipcat).
    - listing.price_vnd: the real Shopee price when there is one, else the benchmark unit price derived from
      Clipcat GMV/sales (INFERRED).
    - rating, sold, attributes, images, reviews, shop: the primary Shopee listing; a real listing's fields are
      REAL except its `mock_fields`, a synthetic listing's are MOCK.
    Kept apart from sku.* so a real listing never mixes with the seed SKU's MOCK list price / funnel.
    """

    def __init__(self, clipcat_id: str):
        self.clipcat_id = clipcat_id

    def load(self) -> FeatureMap:
        rows = load_listings().get(self.clipcat_id, [])
        primary = primary_listing(self.clipcat_id)
        bench = next((r for r in load_benchmark() if r["clipcat_id"] == self.clipcat_id), None)
        if primary is None or bench is None:
            return {k: Feature.missing("no listing for this video") for k in
                    ("listing.title", "listing.price_vnd", "market.comparable_listings")}
        real_primary = primary["source_status"] == SourceStatus.REAL.value
        source = "shopee_search_snippet" if real_primary else "synthetic_listing"

        def field(key):
            value = primary.get(key)
            if value in (None, ""):
                return Feature.missing(f"listing has no {key}")
            mock = not real_primary or key in primary.get("mock_fields", [])
            return Feature(value, SourceStatus.MOCK if mock else SourceStatus.REAL, source, [primary["shopee_url"]])

        out = {f"listing.{k}": field(k) for k in ("rating", "sold_displayed", "attributes", "image_count",
                                                  "review_count", "shop_name")}
        attached = "clipcat_tiktok_product"
        out["listing.title"] = (Feature(bench["tiktok_product_title"], SourceStatus.REAL, attached,
                                        [f"TikTok Shop product {bench['tiktok_product_id']}"])
                                if bench["tiktok_product_title"] else field("sku_title"))
        out["listing.tiktok_product_id"] = (Feature(bench["tiktok_product_id"], SourceStatus.REAL, attached)
                                            if bench["tiktok_product_id"] else Feature.missing("no attached product"))
        out["listing.price_vnd"] = (field("price_vnd") if real_primary else
                                    Feature(int(bench["unit_price_vnd"]), SourceStatus.INFERRED, "clipcat_aov",
                                            ["Clipcat GMV/sales per unit, see clipcat_video_benchmark_24.csv"],
                                            input_sources=["bench.gmv_usd", "bench.sales"]))
        others = [{k: r.get(k) for k in ("sku_title", "price_vnd", "rating", "match_type", "source_status")}
                  for r in rows if r is not primary]
        mock = any(r["source_status"] == SourceStatus.MOCK.value for r in others)
        out["market.comparable_listings"] = (
            Feature(others, SourceStatus.MOCK if mock else SourceStatus.REAL, "shopee_listings")
            if others else Feature.missing("no other listings"))
        return out


def excluded(row: dict) -> bool:
    return row["review_flag"] in EXCLUDED_FLAGS or row["aov_check"] in EXCLUDED_FLAGS


def find_row(video_file: str | Path) -> dict | None:
    """Benchmark row of a local video: by alias (video_files.json) or by a file named <clipcat_id>.*"""
    name = Path(video_file).name
    aliases = json.loads(ALIASES.read_text(encoding="utf-8"))
    clipcat_id = aliases.get(name, Path(name).stem)
    return next((r for r in load_benchmark() if r["clipcat_id"] == clipcat_id), None)


class BenchmarkProvider:
    SOURCE = "clipcat (unverified)"

    def __init__(self, row: dict):
        self.row = row

    def load(self) -> FeatureMap:
        r = self.row
        views = r["views_reported"]
        values = {
            "label": r["video_label"],
            "category": r["category"],
            "url": r["clipcat_url"],
            "views": int(views),
            "sales": int(r["sales_reported"]),
            "gmv_usd": r["gmv_usd_reported"],
            "sales_per_1k_views": round(r["sales_reported"] / views * 1000, 4),
            "gmv_usd_per_1k_views": round(r["gmv_usd_reported"] / views * 1000, 4),
            "engagement_rate": round((r["likes_reported"] + r["shares_reported"] + r["saves_reported"]) / views, 4),
            "video_type": r["video_type"],
            "hook_type": r["hook_type"],
            "review_flag": r["review_flag"],
            "aov_usd": r["aov_usd"],
            "aov_check": r["aov_check"],
            "seed_video_id": r["seed_video_id"],
        }
        return {f"bench.{k}": Feature(v, SourceStatus.REAL, self.SOURCE, [r["review_flag"]]) for k, v in values.items()}


def compare(scores: list[GroupScore], features: FeatureMap) -> dict:
    """One row of the evaluation table: model scores next to the reported outcome."""
    by_name = {g.name: g for g in scores}
    bench = {k.removeprefix("bench."): f.value for k, f in features.items() if k.startswith("bench.")}
    return {
        "label": bench["label"],
        "model_viral_score": by_name["viral_potential"].score,
        "viral_coverage": by_name["viral_potential"].coverage,
        "model_conversion_score": by_name["conversion_potential"].score,
        "conversion_coverage": by_name["conversion_potential"].coverage,
        "views": bench["views"],
        "sales": bench["sales"],
        "sales_per_1k_views": bench["sales_per_1k_views"],
        "gmv_usd_per_1k_views": bench["gmv_usd_per_1k_views"],
        "source_quality_flag": bench["review_flag"],
        "aov_check": bench["aov_check"],
    }


def local_videos() -> dict[str, Path]:
    found = {}
    for p in media.iter_videos(DATA_DIR):  # data/<shop_id>/ folders and data/ itself
        row = find_row(p)
        if row:
            found[row["clipcat_id"]] = p
    return found


def evaluate() -> pd.DataFrame:
    """Score every benchmark video that has a local file and cached features (video content only)."""
    from sources.extractor import find_cached
    from sources.providers import VideoFeatureProvider, load_all
    from core.schema import Mode
    from core.score_engine import score_all

    videos = local_videos()
    rows = []
    for r in load_benchmark():
        video = videos.get(r["clipcat_id"])
        cached = find_cached(video) if video else None
        base = {"shop": r["synthetic_shop_id_analogy"], "clipcat_id": r["clipcat_id"],
                "status": "scored" if cached else ("not_extracted" if video else "no_video_file")}
        features = load_all([BenchmarkProvider(r)] + ([VideoFeatureProvider(cached)] if cached else []))
        scores = score_all(features, Mode.EVIDENCE) if cached else []
        row = compare(scores, features) if cached else {
            "label": r["video_label"], "views": int(r["views_reported"]), "sales": int(r["sales_reported"]),
            "sales_per_1k_views": round(r["sales_reported"] / r["views_reported"] * 1000, 4),
            "source_quality_flag": r["review_flag"], "aov_check": r["aov_check"]}
        rows.append({**base, **row})
    return pd.DataFrame(rows)


def rank_agreement(df: pd.DataFrame) -> dict:
    """Spearman between model scores and reported outcomes, excluding ANOMALY_REVIEW and AOV_OUT_OF_BAND rows."""
    ok = df[(df.status == "scored") & ~df.source_quality_flag.isin(EXCLUDED_FLAGS) & ~df.aov_check.isin(EXCLUDED_FLAGS)]
    if len(ok) < MIN_ROWS_FOR_CORRELATION:
        return {"status": "not_enough_videos", "scored": len(ok), "needed": MIN_ROWS_FOR_CORRELATION}
    return {
        "status": "ok",
        "scored": len(ok),
        "conversion_vs_sales": round(ok.model_conversion_score.corr(ok.sales, method="spearman"), 3),
        "conversion_vs_sales_per_1k": round(ok.model_conversion_score.corr(ok.sales_per_1k_views, method="spearman"), 3),
        "viral_vs_log_views": round(ok.model_viral_score.corr(ok.views.map(math.log10), method="spearman"), 3),
    }


def clipcat_video_url(page_url: str) -> str:
    """The page's og:image cover is named after the TikTok video id; the mp4 shares that id."""
    html = _get(page_url).decode("utf-8", errors="replace")
    match = re.search(r'og:image" content="https://static\.clipcat\.ai/viral-prompt/cover/(\d+)\.jpg', html)
    if not match:
        raise ValueError(f"no cover image on {page_url}")
    return f"https://static.clipcat.ai/viral-prompt/video/{match.group(1)}.mp4"


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def download_videos() -> None:
    """Download every benchmark video not yet available locally to data/<shop_id>/<clipcat_id>.mp4."""
    DATA_DIR.mkdir(exist_ok=True)
    have = local_videos()
    for r in load_benchmark():
        if r["clipcat_id"] in have:
            print(f"skip  {r['clipcat_id']:24} already at {have[r['clipcat_id']].name}")
            continue
        try:
            data = _get(clipcat_video_url(r["clipcat_url"]))
        except (OSError, ValueError) as e:
            print(f"FAIL  {r['clipcat_id']:24} {e}")
            continue
        folder = media.shop_dir(r["synthetic_shop_id_analogy"] or None, DATA_DIR)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{r['clipcat_id']}.mp4").write_bytes(data)
        print(f"ok    {r['clipcat_id']:24} {len(data) / 1e6:.1f} MB  {r['video_label']}")
        time.sleep(1)  # be polite to the host


def _rank(rows: list[dict], key: str) -> dict[str, int]:
    """1 = highest value among the benchmark videos."""
    ordered = sorted(rows, key=lambda r: r[key], reverse=True)
    return {r["clipcat_id"]: i + 1 for i, r in enumerate(ordered)}


def write_labels() -> Path:
    """Reference outcomes per local video file, to compare against what the algorithm predicts.

    Values are Clipcat-reported (unverified); ranks are over the 24 benchmark videos.
    """
    videos = local_videos()
    rows = []
    for r in load_benchmark():
        views = r["views_reported"]
        primary = primary_listing(r["clipcat_id"])
        # synthetic prices are derived from the Clipcat AOV, so the ratio is only meaningful for real ones
        primary = primary if primary and primary["source_status"] == SourceStatus.REAL.value else None
        rows.append({
            "clipcat_id": r["clipcat_id"],
            "video_file": videos[r["clipcat_id"]].name if r["clipcat_id"] in videos else None,
            "video_label": r["video_label"],
            "category": r["category"],
            "product_group": r["product_group"] or None,
            "seed_video_id": r["seed_video_id"],
            "clipcat_url": r["clipcat_url"],
            "views": int(views),
            "sales": int(r["sales_reported"]),
            "gmv_usd": r["gmv_usd_reported"],
            "likes": int(r["likes_reported"]),
            "shares": int(r["shares_reported"]),
            "saves": int(r["saves_reported"]),
            "sales_per_1k_views": round(r["sales_reported"] / views * 1000, 4),
            "gmv_usd_per_1k_views": round(r["gmv_usd_reported"] / views * 1000, 4),
            "engagement_rate": round((r["likes_reported"] + r["shares_reported"] + r["saves_reported"]) / views, 4),
            "video_type": r["video_type"],
            "hook_type": r["hook_type"],
            "source_quality_flag": r["review_flag"],
            "aov_usd": r["aov_usd"],
            "aov_check": r["aov_check"],
            "exclude_from_agreement": excluded(r),
            "aov_to_primary_listing_price": primary and round(r["aov_usd"] * USD_VND / primary["price_vnd"], 2),
            "shopee_listings": load_listings().get(r["clipcat_id"], []),
        })
    for key in ("sales", "views", "gmv_usd", "sales_per_1k_views", "gmv_usd_per_1k_views", "engagement_rate"):
        ranks = _rank(rows, key)
        for row in rows:
            row.setdefault("rank", {})[key] = ranks[row["clipcat_id"]]
    by_category = defaultdict(list)
    for row in rows:
        by_category[row["category"]].append(row)
    for group in by_category.values():
        ranks = _rank(group, "sales")
        for row in group:
            row["rank"]["sales_in_category"] = f"{ranks[row['clipcat_id']]}/{len(group)}"
    out = BENCH_DIR / "video_labels.json"
    out.write_text(json.dumps({
        "_note": "Reference labels for algorithm comparison. Numbers are reported by Clipcat, not verified "
                 "against TikTok Shop; 'sales' are units, GMV in USD, attribution window unknown. "
                 "Primary outcome is sales (views barely track sales here). rank: 1 = highest among these "
                 "videos. Skip rows with exclude_from_agreement=true (ANOMALY_REVIEW or AOV_OUT_OF_BAND) "
                 "when measuring agreement. product_group marks videos of the same product (execution-only "
                 "comparison). shopee_listings are real Shopee listings matched by brand/title (or, for "
                 "competitor_candidate, by category) from search snippets, not attribution; "
                 "aov_to_primary_listing_price compares Clipcat AOV with the first same_product_candidate "
                 f"price at {USD_VND} VND/USD. Generated by "
                 f"`python -m sources.benchmark --labels` from {BENCH_CSV.name} and {CANDIDATES_CSV.name}; do not edit by hand.",
        "videos": rows,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    return out


def main() -> None:
    if "--download" in sys.argv:
        download_videos()
        return
    if "--labels" in sys.argv:
        print(f"Saved: {write_labels()}")
        return
    df = evaluate()
    out = DEMO / "output" / "benchmark_eval.csv"
    out.parent.mkdir(exist_ok=True)
    df.to_csv(out, index=False, encoding="utf-8-sig")
    print(tabulate(df.fillna("-"), headers="keys", tablefmt="simple", showindex=False))
    print("\nstatus:", df.status.value_counts().to_dict())
    print("rank agreement:", rank_agreement(df))
    print(f"Saved: {out}")
    missing = df[df.status == "no_video_file"]
    if len(missing):
        print(f"\n{len(missing)} video chưa có file: tải về {DATA_DIR}/<shop_id>/ và đặt tên <clipcat_id>.mp4 "
              f"(ví dụ {missing.clipcat_id.iloc[0]}.mp4), hoặc khai báo tên file trong {ALIASES.name}.")


if __name__ == "__main__":
    main()
