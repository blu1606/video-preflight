"""Tool registry for the multi-agent layer: agent -> tool -> HTTP API.

Tools never import scoring code; they call json-server (data, LAB_DB_URL) and FastAPI
(analysis, LAB_API_URL), so any agent framework or an MCP server can reuse them.
Errors are returned as {"error": ...} so the calling LLM can recover instead of crashing.

Usage (from the repo root, with `pnpm lab` running):
    uv run python -m agents.tools                                  # list tools
    uv run python -m agents.tools get_real_video_metrics '{"video_id": "SHOP001-VID01"}'
"""

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import httpx

from sources import db_client as db

API_URL = os.getenv("LAB_API_URL", "http://localhost:8100")
EXCLUDED_FLAGS = {"ANOMALY_REVIEW", "AOV_OUT_OF_BAND"}  # same rule as sources.benchmark
METRICS = ["views_reported", "sales_reported", "gmv_usd_reported", "sales_per_1000_views_proxy"]


class ToolError(Exception):
    pass


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    properties: dict
    required: tuple[str, ...]
    handler: Callable[..., object]
    effect: str = "read"  # read | write | paid (spends OpenAI tokens)

    def schema(self) -> dict:
        """OpenAI function-calling format (also maps 1:1 to an MCP tool input schema)."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": self.properties,
                    "required": list(self.required),
                    "additionalProperties": False,
                },
            },
        }


def _api(method: str, path: str, **kwargs):
    r = httpx.request(method, f"{API_URL}{path}", timeout=600, **kwargs)
    if r.status_code >= 400:
        raise ToolError(f"{r.status_code} {r.json().get('detail', r.text) if r.content else ''}")
    return r.json()


def _db(path: str, **params):
    try:
        return db.get(path, **params)
    except db.NotFound:
        raise ToolError(f"{path} not found")


def percentile(value: float, values: list[float]) -> float:
    """Share of `values` at or below `value` (0-1)."""
    return round(sum(v <= value for v in values) / len(values), 2) if values else 0.0


def _score_summary(analysis: dict) -> dict:
    """Drop the per-feature dump; keep what an agent needs to reason and cite."""
    r = analysis["result"]
    return {
        "analysis_id": analysis["id"],
        "mode": analysis["mode"],
        "content_source": r.get("content_source"),
        "scores": [{
            "group": g["name"], "score": g["score"], "coverage": g["coverage"],
            "mock_dependency": g["mock_dependency"],
            "criteria": [{"id": c["id"], "name": c["name"], "score": c["score"], "reason": c["reason"]}
                         for c in g["criteria"]],
        } for g in r["scores"]],
        "revenue_funnel": r.get("revenue_funnel"),
        "video_diagnosis": r.get("video_diagnosis"),
    }


# ---------- data (json-server) ----------

def list_shops() -> list[dict]:
    keys = ["id", "shop_name", "main_category", "scenario", "gmv_30d_vnd", "orders_30d", "shop_rating", "source_status"]
    return [{k: s.get(k) for k in keys} for s in _db("/shops")]


def get_shop(shop_id: str) -> dict:
    shop = _db(f"/shops/{shop_id}")
    skus = _db("/skus", shopId=shop_id)
    videos = _db("/videos", shopId=shop_id)
    return {**shop, "skus": [{k: s[k] for k in ("sku_id", "item_name", "price_vnd", "stock", "rating")} for s in skus],
            "video_ids": [v["id"] for v in videos]}


def list_videos(shop_id: str | None = None, only_uploads: bool = False) -> list[dict]:
    rows = _db("/videos", shopId=shop_id) if shop_id else _db("/videos")
    if only_uploads:
        rows = [v for v in rows if v["shop_id"] is None]
    keys = ["id", "shop_id", "product_label", "local_file", "benchmark_id", "source_status"]
    return [{k: v.get(k) for k in keys} for v in rows]


def get_video(video_id: str) -> dict:
    video = _db(f"/videos/{video_id}")
    sku = _db(f"/skus/{video['sku_id']}") if video.get("sku_id") else None
    return {"video": video, "sku": sku}


def get_real_video_metrics(video_id: str) -> dict:
    video = _db(f"/videos/{video_id}")
    if not video.get("benchmark_id"):
        return {"status": "MISSING", "reason": "No real outcome linked to this video (not a Clipcat benchmark video)."}
    row = _db(f"/benchmarkVideos/{video['benchmark_id']}")
    peers = [r for r in _db("/benchmarkVideos") if not {r["review_flag"], r["aov_check"]} & EXCLUDED_FLAGS]
    views, sales = row["views_reported"], row["sales_reported"]
    return {
        "status": "REAL",
        "source": "clipcat (third-party, unverified; sales = units, GMV in USD, attribution window unknown)",
        "label": row["video_label"],
        "url": row["clipcat_url"],
        "metrics": {
            "views": views, "sales": sales, "gmv_usd": row["gmv_usd_reported"],
            "likes": row["likes_reported"], "shares": row["shares_reported"], "saves": row["saves_reported"],
            "sales_per_1k_views": round(sales / views * 1000, 4),
            "engagement_rate": round((row["likes_reported"] + row["shares_reported"] + row["saves_reported"]) / views, 4),
        },
        "percentile_vs_benchmark": {m: percentile(row[m], [r[m] for r in peers]) for m in METRICS},
        "benchmark_size": len(peers),
        "quality_flags": {"review_flag": row["review_flag"], "aov_check": row["aov_check"],
                          "excluded_from_comparison": bool({row["review_flag"], row["aov_check"]} & EXCLUDED_FLAGS)},
    }


def find_product_listings(video_id: str) -> list[dict]:
    bench_id = _db(f"/videos/{video_id}").get("benchmark_id")
    # Filter here: json-server ignores a query on a field that older rows do not have.
    return [r for r in _db("/shopeeListings")
            if r.get("videoId") == video_id or (bench_id and r.get("benchmarkId") == bench_id)]


def save_product_listing(video_id: str, sku_title: str, shopee_url: str, source: str,
                         price_vnd: int | None = None, rating: float | None = None,
                         sold_displayed: str | None = None, shop_name: str | None = None,
                         match_type: str = "same_product_candidate") -> dict:
    video = _db(f"/videos/{video_id}")
    return db.post("/shopeeListings", {
        "videoId": video_id, "benchmarkId": video.get("benchmark_id"), "sku_title": sku_title,
        "shop_name": shop_name, "shopee_url": shopee_url, "price_vnd": price_vnd, "rating": rating,
        "sold_displayed": sold_displayed, "match_type": match_type, "source": source,
        "source_status": "REAL",
    })


def get_analysis_history(target_id: str, kind: str | None = None) -> list[dict]:
    params = {"targetId": target_id, "_sort": "createdAt", "_order": "desc"}
    if kind:
        params["kind"] = kind
    return [{"analysis_id": a["id"], "kind": a["kind"], "mode": a["mode"], "createdAt": a["createdAt"]}
            for a in _db("/analyses", **params)]


# ---------- analysis (FastAPI) ----------

def upload_video(file_path: str, label: str | None = None) -> dict:
    path = Path(file_path)
    if not path.is_file():
        raise ToolError(f"File not found: {file_path}")
    with path.open("rb") as f:
        return _api("POST", "/py/videos/upload", files={"file": (path.name, f)},
                    data={"label": label} if label else {})


def extract_video_content(video_id: str, model: str | None = None) -> dict:
    params = {"model": model} if model else {}
    return _score_summary(_api("POST", f"/py/videos/{video_id}/extract", params=params))


def get_video_features(video_id: str) -> dict:
    raw = _api("GET", f"/py/videos/{video_id}/features")
    return {"duration_sec": raw.get("video_duration_sec"), "transcript": raw.get("transcript"),
            "vision_model": raw.get("vision_model"), "features": raw.get("features")}


def score_video(video_id: str, rubric: str = "v1") -> dict:
    # Agents only reuse cached Decisions answers; a paid Decisions call stays a user action in the lab.
    return _score_summary(_api("POST", f"/py/videos/{video_id}/score", params={"rubric": rubric}))


def scrape_product_page(url: str) -> dict:
    # One live fetch of the Shopee product, else the crawled copy in the db; `source` says which was used.
    return _api("POST", "/py/listings/resolve", json={"url": url})


def diagnose_shop(shop_id: str) -> dict:
    a = _api("POST", f"/py/shops/{shop_id}/diagnose")
    r = a["result"]
    return {"analysis_id": a["id"], "mode": a["mode"], "diagnosis": r["diagnosis"],
            "scores": [{"group": g["name"], "score": g["score"], "coverage": g["coverage"]} for g in r["scores"]],
            "videos": r["videos"]}


# ---------- registry ----------

STR = {"type": "string"}
VIDEO_ID = {"type": "string", "description": "Video id, e.g. SHOP001-VID01 or UPL-1a2b3c4d"}
SHOP_ID = {"type": "string", "description": "Shop id, e.g. SHOP001"}

TOOLS: dict[str, Tool] = {t.name: t for t in [
    Tool("list_shops", "List all shops with 30-day KPIs and scenario. Seed shops are MOCK data.",
         {}, (), list_shops),
    Tool("get_shop", "Get one shop: KPIs, rates, its SKUs and video ids.",
         {"shop_id": SHOP_ID}, ("shop_id",), get_shop),
    Tool("list_videos", "List videos (id, shop, label, local file, benchmark link). Filter by shop or uploads only.",
         {"shop_id": SHOP_ID, "only_uploads": {"type": "boolean"}}, (), list_videos),
    Tool("get_video", "Get a video record and its linked SKU (if any).",
         {"video_id": VIDEO_ID}, ("video_id",), get_video),
    Tool("get_real_video_metrics",
         "Get the REAL reported outcome of a video (views, sales, GMV, engagement) and its percentile vs the "
         "benchmark set. Returns status MISSING when the video has no real outcome linked.",
         {"video_id": VIDEO_ID}, ("video_id",), get_real_video_metrics),
    Tool("find_product_listings", "Find Shopee listings (price, rating, sold) linked to the video's product.",
         {"video_id": VIDEO_ID}, ("video_id",), find_product_listings),
    Tool("save_product_listing",
         "Store a product listing found by crawling/search and link it to a video. Use only for data actually "
         "observed on the source page; never invent prices or ratings.",
         {"video_id": VIDEO_ID, "sku_title": STR, "shopee_url": STR,
          "source": {"type": "string", "description": "Where it was observed, e.g. 'shopee_page' or 'search_snippet'"},
          "price_vnd": {"type": "integer"}, "rating": {"type": "number"}, "sold_displayed": STR, "shop_name": STR,
          "match_type": {"type": "string", "enum": ["same_product_candidate", "bundle_or_related", "competitor_candidate"]}},
         ("video_id", "sku_title", "shopee_url", "source"), save_product_listing, "write"),
    Tool("scrape_product_page",
         "Read a Shopee product link: title, price, list price, rating, sold, description, images. Tries one live "
         "fetch, then the already crawled listings; `source` (live|crawled) and `attempts` say which was used. "
         "An error means neither had it: ask the user to type the listing, never guess.",
         {"url": {"type": "string", "description": "Shopee product URL (...-i.<shop>.<item>) or shp.ee shortlink"}},
         ("url",), scrape_product_page),
    Tool("get_analysis_history", "List saved analyses for a video or shop, newest first.",
         {"target_id": STR, "kind": {"type": "string", "enum": ["video_score", "shop_diagnosis"]}},
         ("target_id",), get_analysis_history),
    Tool("upload_video", "Upload a local video file so it can be analyzed. Returns the new video id (UPL-...).",
         {"file_path": STR, "label": {"type": "string", "description": "Product name shown in the video, if known"}},
         ("file_path",), upload_video, "write"),
    Tool("extract_video_content",
         "Run frames + Whisper + VLM on the video and score it. Spends OpenAI tokens: call get_video_features "
         "first and only extract when it reports no features.",
         {"video_id": VIDEO_ID, "model": STR}, ("video_id",), extract_video_content, "paid"),
    Tool("get_video_features",
         "Get what the VLM extracted from the video: hook, demo, claims, CTA, key moments, transcript.",
         {"video_id": VIDEO_ID}, ("video_id",), get_video_features),
    Tool("score_video",
         "Score the video on Viral / Conversion / SKU-market / policy rubrics with coverage. Saves the analysis. "
         "rubric v1 = formulas over extracted features; v2 = Decisions API question bank (cached answers only).",
         {"video_id": VIDEO_ID, "rubric": {"type": "string", "enum": ["v1", "v2"]}},
         ("video_id",), score_video, "write"),
    Tool("diagnose_shop", "Diagnose a shop: root cause, priority findings, per-video verdicts. Saves the analysis.",
         {"shop_id": SHOP_ID}, ("shop_id",), diagnose_shop, "write"),
]}


def call_tool(name: str, arguments: dict | str | None = None) -> dict | list:
    """Execute a tool call coming from an LLM (arguments may be the raw JSON string)."""
    tool = TOOLS.get(name)
    if not tool:
        return {"error": f"Unknown tool '{name}'"}
    args = json.loads(arguments) if isinstance(arguments, str) else (arguments or {})
    try:
        return tool.handler(**args)
    except (ToolError, httpx.HTTPError, TypeError) as e:
        return {"error": str(e)}


if __name__ == "__main__":
    if len(sys.argv) == 1:
        for t in TOOLS.values():
            print(f"{t.name:24} {t.effect:6} {t.description[:90]}")
    else:
        print(json.dumps(call_tool(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None),
                         ensure_ascii=False, indent=2, default=str))
