"""Crawl market snapshots for seed SKUs with SerpAPI Google Shopping (Vietnam) -> market_snapshots.json.

One paid search per SKU. Raw responses are kept in raw/serpapi/<sku_id>.json and never re-requested,
so a rerun only bills SKUs that were not crawled yet. Keys are read from an env file and never printed.

Only observed values are written: price, store, rating, review count, link. Google Shopping shows no
"sold" count, so sold_count stays null. like_for_like is a heuristic (keyword tokens in the title and a
price within PRICE_BAND of ours) and is labelled as such.

Usage (from video_understanding/demo):
    uv run python fixtures/market/crawl_market.py --env <path/.env> --skus SHOP001-SKU01,SHOP002-SKU03
    uv run python fixtures/market/crawl_market.py --env <path/.env> --all
"""

import argparse
import json
import re
import unicodedata
from datetime import date
from pathlib import Path

import httpx
from dotenv import dotenv_values

HERE = Path(__file__).resolve().parent
SEED = HERE.parent / "shopee_seed" / "seed.json"
RAW = HERE / "raw" / "serpapi"
OUT = HERE / "market_snapshots.json"
PRICE_BAND = (0.4, 2.5)          # competitor price / our price accepted as comparable
MIN_TOKEN_SHARE = 0.5            # share of keyword tokens that must appear in the title
STOPWORDS = {"cho", "va", "kem", "loai", "phan", "bo", "co", "nu", "nam"}


def fold(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower()).replace("đ", "d")
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


def tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", fold(text)) if len(t) > 1 and t not in STOPWORDS}


def keyword(sku: dict) -> str:
    # Drop variant suffixes like "- phân loại A" so the search finds the product, not the variant.
    return re.split(r"\s+-\s+|\(", sku["item_name"])[0].strip()


def search(api_key: str, q: str) -> dict:
    params = {"engine": "google_shopping", "q": q, "gl": "vn", "hl": "vi", "location": "Vietnam",
              "google_domain": "google.com.vn", "api_key": api_key}
    r = httpx.get("https://serpapi.com/search.json", params=params, timeout=60)
    if api_key in r.text:
        raise RuntimeError("credential reflected in response; not saved")
    r.raise_for_status()
    return r.json()


def normalize(sku: dict, kw: str, raw: dict, crawled_at: str) -> dict:
    own, kw_tokens = sku["price_vnd"], tokens(kw)
    competitors = []
    for item in raw.get("shopping_results", [])[:20]:
        price = item.get("extracted_price")
        title = item.get("title", "")
        share = len(kw_tokens & tokens(title)) / len(kw_tokens) if kw_tokens else 0
        in_band = bool(price) and PRICE_BAND[0] <= price / own <= PRICE_BAND[1]
        competitors.append({
            "platform": item.get("source"), "title": title, "shop": item.get("source"),
            "price_vnd": int(price) if price else None, "size_or_spec": None,
            "sold_count": None, "sold_display": None,  # not shown by Google Shopping
            "rating": item.get("rating"), "review_count": item.get("reviews"),
            "like_for_like": share >= MIN_TOKEN_SHARE and in_band,
            "like_for_like_method": f"keyword tokens {share:.0%} + price ratio in {PRICE_BAND}",
            "url": item.get("product_link") or item.get("link"),
            "provenance": {"provider": "SerpAPI (Google Shopping, Vietnam)", "tool": "google_shopping",
                           "endpoint": "https://serpapi.com/search.json",
                           "arguments": {"q": kw, "gl": "vn", "hl": "vi", "location": "Vietnam"},
                           "captured_at": crawled_at, "search_id": raw.get("search_metadata", {}).get("id"),
                           "raw_file": f"fixtures/market/raw/serpapi/{sku['sku_id']}.json"},
        })
    return {"sku_id": sku["sku_id"], "keyword": kw, "crawled_at": crawled_at, "competitors": competitors,
            "tiktok": None, "source": "serpapi:google_shopping gl=vn",
            "notes": f"{len(competitors)} results, {sum(c['like_for_like'] for c in competitors)} like-for-like"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", required=True, help="env file with SERPAPI_API_KEY")
    parser.add_argument("--skus", help="comma-separated sku_ids")
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()
    api_key = (dotenv_values(args.env).get("SERPAPI_API_KEY") or "").strip()
    if not api_key:
        raise SystemExit("SERPAPI_API_KEY missing")

    skus = json.loads(SEED.read_text(encoding="utf-8"))["skus"]
    wanted = set(args.skus.split(",")) if args.skus else None
    skus = [s for s in skus if args.all or s["sku_id"] in wanted]
    RAW.mkdir(parents=True, exist_ok=True)
    snapshots = {s["sku_id"]: s for s in json.loads(OUT.read_text(encoding="utf-8"))} if OUT.exists() else {}
    # Merge with FastMoss rows already in the file: replace only this crawler's (non-TikTok) competitors.

    calls = 0
    for sku in skus:
        raw_path = RAW / f"{sku['sku_id']}.json"
        kw = keyword(sku)
        if raw_path.exists():
            raw = json.loads(raw_path.read_text(encoding="utf-8"))
        else:
            raw = search(api_key, kw)
            raw_path.write_text(json.dumps(raw, ensure_ascii=False, indent=1), encoding="utf-8")
            calls += 1
        crawled = raw.get("search_metadata", {}).get("created_at", str(date.today()))[:10].replace(" ", "")
        snap = normalize(sku, kw, raw, crawled if re.match(r"\d{4}-\d{2}-\d{2}", crawled) else str(date.today()))
        old = snapshots.get(sku["sku_id"], {})
        tiktok_rows = [c for c in old.get("competitors", []) if c.get("platform") == "tiktok_shop"]
        snapshots[sku["sku_id"]] = {**old, **{k: v for k, v in snap.items() if k != "tiktok"},
                                    "competitors": snap["competitors"] + tiktok_rows,
                                    "tiktok": old.get("tiktok"), "notes": snap["notes"]}
        print(f"{sku['sku_id']:15} '{kw}': {snap['notes']}")
    OUT.write_text(json.dumps(list(snapshots.values()), ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"paid searches this run: {calls}; wrote {OUT} ({len(snapshots)} SKUs)")


if __name__ == "__main__":
    main()
