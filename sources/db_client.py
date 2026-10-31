"""Single read/write path to the lab database (json-server over db/db.json).

Used by api.py today and meant to back AI agent tools later, so every consumer
sees the same data the React lab shows.
"""

import os
from datetime import datetime, timezone

import httpx

DB_URL = os.getenv("LAB_DB_URL", "http://localhost:3101")

# json-server collection -> key expected by ShopSeedProvider (seed.json layout)
SEED_COLLECTIONS = {
    "shops": "shops",
    "skus": "skus",
    "sku_reviews_summary": "skuReviews",
    "shop_daily_metrics": "shopDailyMetrics",
    "sku_daily_metrics": "skuDailyMetrics",
    "videos": "videos",
    "sku_audience": "skuAudience",
    "market_snapshots": "marketSnapshots",
}


class NotFound(Exception):
    pass


def get(path: str, **params):
    r = httpx.get(f"{DB_URL}{path}", params=params, timeout=30)
    if r.status_code == 404:
        raise NotFound(path)
    r.raise_for_status()
    return r.json()


def post(path: str, body: dict) -> dict:
    r = httpx.post(f"{DB_URL}{path}", json=body, timeout=30)
    r.raise_for_status()
    return r.json()


def patch(path: str, body: dict) -> dict:
    """Partial update (json-server merges top-level keys)."""
    r = httpx.patch(f"{DB_URL}{path}", json=body, timeout=30)
    if r.status_code == 404:
        raise NotFound(path)
    r.raise_for_status()
    return r.json()


def load_seed() -> dict:
    return {key: get(f"/{collection}") for key, collection in SEED_COLLECTIONS.items()}


def save_analysis(kind: str, target_id: str, shop_id: str, mode: str, result: dict) -> dict:
    return post("/analyses", {
        "kind": kind,
        "targetId": target_id,
        "shopId": shop_id,
        "mode": mode,
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "result": result,
    })
