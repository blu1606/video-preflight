"""Build db/db.json (json-server) from the fixtures: Shopee seed + ground truth + Clipcat benchmark
+ Shopee listing candidates of the benchmark products.

Every row gets an `id` and a `shopId` (json-server needs them for /shops/:id/videos etc.)
and keeps its `source_status`. Existing `analyses` are preserved unless --reset is passed.

Usage (from video_understanding/demo):
    uv run python db/build_db.py [--reset]
"""

import argparse
import json
import sys
from pathlib import Path

DB_DIR = Path(__file__).resolve().parent
DEMO = DB_DIR.parent
sys.path.insert(0, str(DEMO))

from core.policy_check import load_baseline  # noqa: E402
from sources import benchmark  # noqa: E402
from sources.providers import load_seed  # noqa: E402

SEED_DIR = DEMO / "fixtures" / "shopee_seed"
DB_PATH = DB_DIR / "db.json"
AUDIENCE = DEMO / "fixtures" / "sku_audience" / "sku_audience.json"  # synthetic buyer profiles (MOCK)
MARKET_DIR = DEMO / "fixtures" / "market"  # crawled market snapshots (REAL), optional


def with_ids(rows: list[dict], id_of) -> list[dict]:
    return [{"id": id_of(r), "shopId": r.get("shop_id"), **r} for r in rows]


def build() -> dict:
    seed = load_seed(SEED_DIR / "seed.json")
    truth = json.loads((SEED_DIR / "ground_truth.json").read_text(encoding="utf-8"))
    shop_truth = {r["shop_id"]: r for r in truth["shops"]}
    video_truth = {r["video_id"]: r["expected_verdict"] for r in truth["videos"]}

    local = benchmark.local_videos()  # clipcat_id -> local file in ../data
    bench_rows = []
    by_seed_video = {}
    for r in benchmark.load_benchmark():
        file = local.get(r["clipcat_id"])
        row = {"id": r["clipcat_id"], "shopId": r["synthetic_shop_id_analogy"],
               **{k: v for k, v in r.items()}, "local_file": file.name if file else None,
               "source_status": "REAL"}
        bench_rows.append(row)
        by_seed_video[r["seed_video_id"]] = row

    videos = []
    for v in seed["videos"]:
        bench = by_seed_video.get(v["video_id"])
        videos.append({
            "id": v["video_id"], "shopId": v["shop_id"], **v,
            "expected_verdict": video_truth.get(v["video_id"]),
            "benchmark_id": bench["id"] if bench else None,
            "local_file": bench["local_file"] if bench else None,
            # the real product shown in the paired Clipcat video; sku_id stays the mock seed SKU
            "product_label": bench["video_label"] if bench else None,
        })

    listings = [{"id": f"{cid}-L{i + 1}", "benchmarkId": cid, **x}
                for cid, rows in benchmark.load_listings().items() for i, x in enumerate(rows)]

    return {
        "meta": seed["metadata"],
        "shops": [{"id": s["shop_id"], **s, **{k: v for k, v in shop_truth.get(s["shop_id"], {}).items()
                                              if k != "shop_id"}} for s in seed["shops"]],
        "skus": with_ids(seed["skus"], lambda r: r["sku_id"]),
        "skuReviews": with_ids(seed["sku_reviews_summary"], lambda r: r["sku_id"]),
        "shopDailyMetrics": with_ids(seed["shop_daily_metrics"], lambda r: f"{r['shop_id']}-{r['date']}"),
        "skuDailyMetrics": with_ids(seed["sku_daily_metrics"], lambda r: f"{r['sku_id']}-{r['date']}"),
        "videos": videos,
        "benchmarkVideos": bench_rows,
        "shopeeListings": listings,
        "policyRules": [{"id": r["rule_id"], **r} for r in load_baseline()["rules"]],
        "skuAudience": _json_rows(AUDIENCE),
        # Crawled market data (fixtures/market/*.json, see the crawl prompt); REAL, empty until crawled.
        "marketSnapshots": [{"id": s["sku_id"], "shopId": s["sku_id"].split("-")[0], **s, "source_status": "REAL"}
                            for path in sorted(MARKET_DIR.glob("*.json")) for s in _json_rows(path)],
        "analyses": [],
    }


def _json_rows(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="drop saved analyses")
    args = parser.parse_args()
    db = build()
    if DB_PATH.exists() and not args.reset:
        old = json.loads(DB_PATH.read_text(encoding="utf-8"))
        db["analyses"] = old.get("analyses", [])
        # Uploaded videos live only in the db (their files are in ../data): keep them across rebuilds.
        db["videos"] += [v for v in old.get("videos", []) if str(v.get("id", "")).startswith("UPL-")]
    DB_PATH.write_text(json.dumps(db, ensure_ascii=False, indent=1), encoding="utf-8")
    counts = {k: len(v) for k, v in db.items() if isinstance(v, list)}
    print(f"Wrote {DB_PATH}: {counts}")


if __name__ == "__main__":
    main()
