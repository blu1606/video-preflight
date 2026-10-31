"""TikTok Shop VN market data per seed SKU from FastMoss (1 credit per tool call), merged into market_snapshots.json.

Per SKU: a category-keyword product search (competitors, 28-day units sold, videos selling them) and, for SKUs
named after a real brand, a brand search (that product's own TikTok Shop sales). Per level-1 category: one
market_category_analysis (basic_metrics). Raw results go to raw/fastmoss/ (private, never re-requested).

Usage (from video_understanding/demo):
    uv run python fixtures/market/crawl_fastmoss.py --env <path/.env> [--skus SHOP001-SKU01,...] [--max-credits 70]
"""

import argparse
import json
import re
from collections import Counter
from datetime import date
from pathlib import Path

from fastmoss_client import RAW, FastMoss

HERE = Path(__file__).resolve().parent
SEED = HERE.parent / "shopee_seed" / "seed.json"
OUT = HERE / "market_snapshots.json"
PRICE_BAND = (0.4, 2.5)
CATEGORY_MONTH = "2026-09"  # last completed month

# Category keyword (competitors) per SKU; brand keyword only where the SKU names a real product.
KEYWORDS = {
    "SHOP001-SKU01": ("xà phòng trắng da", "TeaShell xà phòng"), "SHOP001-SKU02": ("sữa rửa mặt nam", "Men Stay sữa rửa mặt"),
    "SHOP001-SKU03": ("mascara lông mày", "ROCKSWEET mascara"), "SHOP001-SKU04": ("nước tẩy trang", None),
    "SHOP001-SKU05": ("kem dưỡng ẩm", None),
    "SHOP002-SKU01": ("ốp lưng iphone", None), "SHOP002-SKU02": ("ốp lưng iphone hình mèo", None),
    "SHOP002-SKU03": ("quạt tản nhiệt điện thoại", "quạt tản nhiệt KY V60"), "SHOP002-SKU04": ("kính cường lực iphone", None),
    "SHOP002-SKU05": ("quạt mini cầm tay", None),
    "SHOP003-SKU01": ("đĩa đựng trái cây", None), "SHOP003-SKU02": ("giấy vệ sinh treo tường", "giấy Caipiao"),
    "SHOP003-SKU03": ("nước xả vải", "nước xả vải Downy"), "SHOP003-SKU04": ("khăn lau đa năng", None),
    "SHOP003-SKU05": ("giỏ sắp xếp đồ", None),
    "SHOP004-SKU01": ("bình nước có ống hút", None), "SHOP004-SKU02": ("bột ngũ cốc gạo lứt", None),
    "SHOP004-SKU03": ("mắm sả ớt chay", "mắm sả ớt Thiện Duyên"), "SHOP004-SKU04": ("kẹp đa năng", None),
    "SHOP004-SKU05": ("hộp nhựa đựng thực phẩm", None),
    "SHOP005-SKU01": ("bộ đồ đũi nữ", None), "SHOP005-SKU02": ("bộ thun tăm nữ", None),
    "SHOP005-SKU03": ("quần jean ống suông nữ", None), "SHOP005-SKU04": ("áo khoác mỏng nữ", None),
    "SHOP005-SKU05": ("mũ lưỡi trai", None),
    "SHOP006-SKU01": ("băng vệ sinh", "băng vệ sinh Tutubaby"), "SHOP006-SKU02": ("sữa non cho bé", "ColosBaby"),
    "SHOP006-SKU03": ("gạc răng miệng cho bé", "gạc răng miệng Sachi"), "SHOP006-SKU04": ("bộ đồ sơ sinh", None),
    "SHOP006-SKU05": ("hộp chia sữa", None),
    "SHOP007-SKU01": ("tai nghe bluetooth", "tai nghe COUDASH"), "SHOP007-SKU02": ("sạc dự phòng kèm cáp", None),
    "SHOP007-SKU03": ("cáp sạc nhanh 4 trong 1", None), "SHOP007-SKU04": ("bàn phím mini", None),
    "SHOP007-SKU05": ("hub usb c", None),
    "SHOP008-SKU01": ("men vi sinh", "men vi sinh Progermila"), "SHOP008-SKU02": ("tinh nghệ nano", "Nano Curcumin 365"),
    "SHOP008-SKU03": ("vitamin b complex", "Pentavite"), "SHOP008-SKU04": ("viên uống omega 3", None),
    "SHOP008-SKU05": ("collagen dạng nước", None),
    "SHOP009-SKU01": ("nồi điện đa năng", "nồi điện DKHOUSE"), "SHOP009-SKU02": ("nồi điện đa năng", None),
    "SHOP009-SKU03": ("nồi điện đa năng", None), "SHOP009-SKU04": ("móc dán tường", None),
    "SHOP009-SKU05": ("cây lau nhà", None),
}


def price_vnd(product: dict) -> int | None:
    """'59.082 ₫  -  186.928 ₫' -> 59082 (lowest shown price; VN thousands separator is '.')."""
    m = re.match(r"\s*([\d.]+)\s*₫", product.get("price_display") or "")
    return int(m.group(1).replace(".", "")) if m else None


class Crawler:
    def __init__(self, env: str, max_credits: int):
        self.fm, self.budget = FastMoss(env), max_credits

    def cached(self, name: str, tool: str, args: dict) -> dict:
        path = RAW / f"{name}.json"
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        if self.budget <= 0:
            raise SystemExit(f"credit budget reached before {name}")
        res = self.fm.call(tool, args)
        self.budget -= 1
        path.write_text(json.dumps({"tool": tool, "args": args, "captured_at": str(date.today()), **res},
                                   ensure_ascii=False, indent=1), encoding="utf-8")
        return json.loads(path.read_text(encoding="utf-8"))

    def search(self, name: str, keywords: str) -> tuple[list[dict], dict]:
        res = self.cached(name, "product_search", {"keywords": keywords, "filter": {"region": "VN"},
                                                   "orderby": [{"field": "day28_units_sold", "order": "desc"}],
                                                   "pagesize": 10})
        items = (res.get("data") or {}).get("list", []) if not res.get("is_error") else []
        return items, provenance("product_search", res, name)


def provenance(tool: str, res: dict, name: str) -> dict:
    """Where a block of numbers came from: tool, endpoint, query, capture date and the raw response file."""
    return {"provider": "FastMoss (TikTok Shop analytics)", "tool": tool, "endpoint": "https://mcp.fastmoss.com/mcp",
            "arguments": res.get("args"), "captured_at": res.get("captured_at"),
            "raw_file": f"fixtures/market/raw/fastmoss/{name}.json"}


def tiktok_row(item: dict, own_price: int, like: bool) -> dict:
    p, s, d = item["product"], item["sales_summary"], item["distribution_summary"]
    return {"platform": "tiktok_shop", "title": p.get("title"), "shop": (item.get("shop") or {}).get("shop_name"),
            "price_vnd": price_vnd(p), "size_or_spec": None,
            "sold_count": s.get("last_28d_units_sold"), "sold_window": "28d", "sold_display": None,
            "units_7d": s.get("last_7d_units_sold"), "gmv_28d_vnd": s.get("last_28d_gmv"),
            "rating": p.get("product_rating") or None, "review_count": None,
            "linked_video_count": d.get("linked_video_count"), "linked_creator_count": d.get("linked_creator_count"),
            "category_l1": p["category"]["l1"], "category_l3": p["category"]["l3"]["name"].strip(),
            "like_for_like": like, "like_for_like_method": f"category search + price ratio in {PRICE_BAND}",
            "product_id": p.get("product_id"),
            # Links returned by FastMoss, to check each number at its source; tracking params dropped.
            "url": p.get("fastmoss_detail_url"),
            "fastmoss_url": p.get("fastmoss_detail_url"),
            "tiktok_url": (f"https://shop.tiktok.com/view/product/{p['product_id']}?region=VN"
                           if p.get("product_id") else None)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", required=True)
    parser.add_argument("--skus")
    parser.add_argument("--max-credits", type=int, default=70)
    args = parser.parse_args()
    crawler = Crawler(args.env, args.max_credits)
    skus = json.loads(SEED.read_text(encoding="utf-8"))["skus"]
    if args.skus:
        skus = [s for s in skus if s["sku_id"] in args.skus.split(",")]
    snapshots = {s["sku_id"]: s for s in json.loads(OUT.read_text(encoding="utf-8"))} if OUT.exists() else {}

    l1_by_sku = {}
    for sku in skus:
        category_kw, brand_kw = KEYWORDS[sku["sku_id"]]
        own = sku["price_vnd"]
        items, prov = crawler.search(f"search-{category_kw}", category_kw)
        rows = []
        for it in items:
            price = price_vnd(it["product"])
            rows.append({**tiktok_row(it, own, bool(price) and PRICE_BAND[0] <= price / own <= PRICE_BAND[1]),
                         "provenance": prov})
        own_rows, own_prov = [], None
        if brand_kw:
            brand_items, own_prov = crawler.search(f"brand-{sku['sku_id']}", brand_kw)
            own_rows = [{**tiktok_row(it, own, True), "provenance": own_prov} for it in brand_items]
        like = [r for r in rows if r["like_for_like"]]
        units28 = sum(r["sold_count"] or 0 for r in like)
        units7 = sum(r["units_7d"] or 0 for r in like)
        snap = snapshots.get(sku["sku_id"], {"sku_id": sku["sku_id"], "competitors": []})
        snap["competitors"] = [c for c in snap.get("competitors", []) if c.get("platform") != "tiktok_shop"] + rows
        snap["crawled_at"] = snap.get("crawled_at") or str(date.today())
        snap["tiktok"] = {
            "keyword": category_kw, "source": "fastmoss product_search region=VN", "provenance": prov,
            "own_provenance": own_prov,
            "video_count": sum(r["linked_video_count"] or 0 for r in like),
            "units_28d": units28, "units_7d": units7,
            "momentum_7d_vs_28d": round(units7 * 4 / units28, 2) if units28 else None,
            "own_product": own_rows[0] if own_rows else None, "own_listings": own_rows,
        }
        if like:
            l1_by_sku[sku["sku_id"]] = Counter(r["category_l1"]["id"] for r in like).most_common(1)[0][0]
        snapshots[sku["sku_id"]] = snap
        print(f"{sku['sku_id']:15} '{category_kw}': {len(rows)} TikTok rows, {len(like)} like-for-like, "
              f"{units28} units/28d, {snap['tiktok']['video_count']} videos; own={'yes' if own_rows else '-'}")

    categories = {}
    for l1 in sorted(set(l1_by_sku.values())):
        res = crawler.cached(f"category-{l1}-{CATEGORY_MONTH}", "market_category_analysis",
                             {"analysis_type": "basic_metrics", "filter": {"category_id": l1, "region": "VN",
                                                                            "date_type": "month", "date_value": CATEGORY_MONTH}})
        categories[l1] = (None if res.get("is_error") else res.get("data"),
                          provenance("market_category_analysis", res, f"category-{l1}-{CATEGORY_MONTH}"))
    for sku_id, l1 in l1_by_sku.items():
        metrics, prov = categories[l1]
        snapshots[sku_id]["tiktok"]["category"] = {"id": l1, "month": CATEGORY_MONTH, "metrics": metrics,
                                                   "provenance": prov}

    OUT.write_text(json.dumps(list(snapshots.values()), ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"credits left in this run's budget: {crawler.budget}; FastMoss balance: {crawler.fm.credits()}")


if __name__ == "__main__":
    main()
