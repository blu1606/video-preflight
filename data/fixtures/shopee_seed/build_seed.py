"""Synthetic Shopee shop-intelligence seed, v2 (deterministic, random seed 20261031).

Run from this folder:  python build_seed.py

Everything here is fabricated test data for the scoring/diagnosis pipeline: no real
seller, no real Shopee API payload shape (fields follow an application-normalized
schema). `ground_truth.json` holds the designed scenario of every shop and video;
scoring code must never read it, only tests do.

Definitions
- gmv_vnd: value of paid orders that day (before cancellations and returns).
- cancellation_rate / return_rate: divided by paid_orders, daily and 30d alike.
- product_page_views of a shop = sum of its SKUs' product_page_views.
- A SKU out of stock keeps impressions/page views (demand) but sells 0 units.
- Video attributed_orders are a subset of the featured SKU's orders after posting;
  never add attributed GMV on top of shop GMV.
"""

import csv
import json
import random
from datetime import date, timedelta
from pathlib import Path

import cv2

OUT = Path(__file__).resolve().parent
BENCHMARK_CSV = OUT.parent / "clipcat_benchmark" / "clipcat_video_benchmark_24.csv"
VIDEO_DIR = OUT.parent.parent.parent / "data"  # the benchmark's downloaded videos (vn-<category>-<id>.mp4)


def load_slot_products() -> dict[str, list[tuple[str, int, str]]]:
    """shop_id -> (name, price, video file name) of the real products in its benchmark videos, in video slot order.

    SKU01..03 of a shop feature VID01..03, and the benchmark pairs its real videos with those slots, so
    naming the SKUs after those products keeps video, SKU and shop consistent. Only names and prices
    change; every random draw (funnel, scenario) stays the same.
    """
    slots: dict[str, list[tuple[str, int, str]]] = {}
    with BENCHMARK_CSV.open(encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r["synthetic_shop_id_analogy"]:
                video_file = r["clipcat_url"].rsplit("/", 1)[-1] + ".mp4"
                slots.setdefault(r["synthetic_shop_id_analogy"], []).append(
                    (r["product_name_vi"], int(r["unit_price_vnd"]), video_file))
    return {shop: rows[:len(VIDEO_POST_DAYS)] for shop, rows in slots.items()}
RANDOM_SEED = 20261031
START = date(2026, 9, 27)
DAYS = 30
DATES = [(START + timedelta(days=i)).isoformat() for i in range(DAYS)]
WEEKEND_PEAKS = {5, 6, 12, 13, 19, 20, 26, 27}
DEMAND_WEIGHTS = [0.32, 0.25, 0.20, 0.13, 0.10]
VIDEO_POST_DAYS = [1, 9, 17]
VIDEO_PURCHASE_INTENT = 1.6   # viewers who click from a video buy more often than search visitors
PLATFORM_FEE_RATE = 0.11      # commission + payment fee, assumption

BASE_PRICES = {
    "beauty": 119000, "electronics_accessories": 79000, "home": 189000, "general": 99000,
    "fashion": 159000, "mother_baby": 139000, "electronics": 299000, "health_fitness": 169000,
    "household": 129000,
}
PRODUCTS = {
    "beauty": ["Sữa rửa mặt dịu nhẹ", "Kem chống nắng SPF50", "Serum dưỡng da", "Tẩy trang", "Kem dưỡng ẩm"],
    "electronics_accessories": ["Ốp điện thoại", "Giá đỡ điện thoại", "Dây sạc USB-C", "Kính cường lực", "Quạt mini"],
    "home": ["Kệ nhà bếp", "Hộp đựng đồ", "Đèn ngủ", "Khăn lau đa năng", "Giỏ sắp xếp"],
    "general": ["Bình nước", "Khăn tiện ích", "Túi đựng đồ", "Kẹp đa năng", "Hộp nhựa"],
    "fashion": ["Áo thun basic", "Quần jeans", "Túi tote", "Áo khoác mỏng", "Mũ lưỡi trai"],
    "mother_baby": ["Bình tập uống", "Yếm ăn dặm", "Khăn xô", "Bộ đồ em bé", "Hộp chia sữa"],
    "electronics": ["Tai nghe bluetooth", "Chuột không dây", "Sạc dự phòng", "Bàn phím mini", "Hub USB-C"],
    "health_fitness": ["Bình shaker", "Dây kháng lực", "Thảm yoga", "Viên uống Omega-3", "Collagen dạng nước"],
    "household": ["Chảo chống dính", "Bộ dao inox", "Hộp cơm giữ nhiệt", "Móc dán tường", "Cây lau nhà"],
}

DEFAULTS = dict(
    rating_count=None, age_days=None, views_per_visit=1.8, cancel=0.012, late=0.02, ret=0.02,
    cost_ratio=0.5, list_markup=1.25, voucher=0.02, ads_share=0.25, roas=8.0, shipping_days=2,
    video_reach=900, video_ctr=(0.02, 0.032), video_completion=(0.3, 0.5), weak_skus=(),
    stockout_day={}, negative_topics=[], video_overrides={},
)


def profile(shop_id, name, category, scenario, primary_issue, **kw):
    return {**DEFAULTS, **kw, "shop_id": shop_id, "shop_name": name, "main_category": category,
            "scenario": scenario, "primary_issue": primary_issue}


# visits = average daily shop visits, view_cvr = product page view -> order for an average SKU.
PROFILES = [
    profile("SHOP001", "Lá Mộc Beauty", "beauty", "high_performer", "growth",
            rating=4.9, visits=1900, view_cvr=0.034, cost_ratio=0.48, weak_skus=(1,),
            video_overrides={1: dict(ctr=0.045, completion=0.5, case="weak_sku"),
                             2: dict(ctr=0.006, completion=0.12, reach_factor=0.6, case="weak_video")}),
    profile("SHOP002", "Trendie Case", "electronics_accessories", "viral_low_conversion", "conversion",
            rating=4.5, visits=3200, views_per_visit=1.3, view_cvr=0.013, cost_ratio=0.55,
            ads_share=0.15, roas=5.0, video_reach=9000, video_ctr=(0.003, 0.005),
            video_completion=(0.32, 0.42), weak_skus=(0, 2),
            negative_topics=["looks_different_from_video"]),
    profile("SHOP003", "Nhà Xinh Home", "home", "high_conversion_low_traffic", "traffic",
            rating=4.8, visits=520, views_per_visit=2.2, view_cvr=0.035, ads_share=0.2, roas=10.0,
            video_reach=350),
    profile("SHOP004", "Deal Rẻ Mỗi Ngày", "general", "operations_risk", "operations",
            rating=4.1, visits=1650, views_per_visit=1.7, view_cvr=0.028, cancel=0.075, late=0.11,
            ret=0.03, cost_ratio=0.58, ads_share=0.3, roas=6.0, shipping_days=5,
            negative_topics=["shipping_delay", "order_canceled"]),
    profile("SHOP005", "Vệt Nắng Fashion", "fashion", "ads_dependent", "ads_efficiency",
            rating=4.6, visits=2300, view_cvr=0.026, cancel=0.015, late=0.03, ads_share=0.68, roas=2.3),
    profile("SHOP006", "Bé Khỏe Mom", "mother_baby", "new_shop_sparse", "low_confidence",
            rating=4.7, rating_count=30, age_days=75, visits=120, views_per_visit=1.5, view_cvr=0.012,
            ads_share=0.1, roas=4.0, video_reach=60),
    profile("SHOP007", "Tech Zone Mini", "electronics", "stockout_risk", "inventory",
            rating=4.5, visits=2100, views_per_visit=1.9, view_cvr=0.03, stockout_day={0: 14, 1: 18}),
    profile("SHOP008", "Fit Daily VN", "health_fitness", "returns_and_trust", "returns_trust",
            rating=4.2, visits=1600, view_cvr=0.028, ret=0.14, late=0.03, cancel=0.02, weak_skus=(0, 2),
            negative_topics=["effectiveness_claim", "quality_mismatch"]),
    profile("SHOP009", "Sỉ Rẻ Gia Dụng", "household", "high_volume_low_margin", "profitability",
            rating=4.6, visits=2600, view_cvr=0.036, cost_ratio=0.78, list_markup=1.6, voucher=0.08,
            ads_share=0.3, roas=5.0),
]


SLOT_PRODUCTS = load_slot_products()


def video_duration_sec(path: Path) -> int:
    """Whole seconds of a local video, from frame count / fps as the app's frame extractor computes it."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {path}")
    frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.release()
    return int(frames / fps + 0.5)


def draw(x: float) -> int:
    """Integer with expectation x (stochastic rounding keeps small counts unbiased)."""
    return int(x) + (random.random() < x - int(x))


def build():
    random.seed(RANDOM_SEED)
    shops, skus, reviews, shop_days, sku_days, videos, links = [], [], [], [], [], [], []
    truth = {"shops": [], "videos": []}

    for p in PROFILES:
        sid, cat = p["shop_id"], p["main_category"]
        rating_count = p["rating_count"] or random.randint(900, 5000)
        rating_shift = (p["rating"] - 4.6) * 0.5
        positive_shift = -0.1 if p["negative_topics"] else 0.0

        # ---- SKUs: a hidden quality q drives both listing attributes and conversion ----
        shop_skus = []
        slot = SLOT_PRODUCTS.get(sid, [])
        for i, name in enumerate(PRODUCTS[cat]):
            q = 0.1 if i in p["weak_skus"] else random.uniform(0.55, 0.9)
            price = int(BASE_PRICES[cat] * (0.7 + 0.19 * i)) // 1000 * 1000
            if i < len(slot):  # the product shown in the real video paired with this SKU's video slot
                name, price, _ = slot[i]
            sku = dict(
                sku_id=f"{sid}-SKU{i + 1:02d}", shop_id=sid, item_name=name, category=cat,
                price_vnd=price, original_price_vnd=round(price * p["list_markup"], -3),
                cost_vnd=int(price * p["cost_ratio"]), stock=random.randint(40, 300),
                stockout_date="", listing_status="active",
                rating=round(min(5.0, 3.9 + q + rating_shift + random.uniform(-0.05, 0.05)), 1),
                rating_count=max(1, int(rating_count / 5 * random.uniform(0.4, 1.4))),
                image_count=2 + round(7 * q), has_video=i < len(VIDEO_POST_DAYS),
                description_length_chars=int(120 + 1200 * q), return_policy_days=random.choice([7, 15]),
                shipping_days=p["shipping_days"], source_status="MOCK",
            )
            sku["_cvr_mult"] = 0.3 + 1.1 * q
            shop_skus.append(sku)
            reviews.append(dict(
                sku_id=sku["sku_id"], shop_id=sid, review_count=sku["rating_count"],
                positive_ratio=round(min(0.98, 0.45 + 0.5 * q + positive_shift + random.uniform(-0.03, 0.03)), 3),
                negative_topics=json.dumps(p["negative_topics"] if (q < 0.3 or p["negative_topics"]) else []),
                source_status="MOCK",
            ))
        for i, day in p["stockout_day"].items():
            shop_skus[i]["stock"] = 0
            shop_skus[i]["stockout_date"] = DATES[day]

        # ---- Daily funnel: visits -> SKU page views -> units ----
        sku_units_by_day = {s["sku_id"]: [0] * DAYS for s in shop_skus}
        for d_idx, d in enumerate(DATES):
            seasonal = 1.1 if d_idx in WEEKEND_PEAKS else 0.95
            visits = max(5, int(p["visits"] * seasonal * random.uniform(0.8, 1.2)))
            page_views_total = visits * p["views_per_visit"] * random.uniform(0.9, 1.1)
            paid_orders, gmv, page_views_sum = 0, 0, 0
            for i, sku in enumerate(shop_skus):
                in_stock = not (i in p["stockout_day"] and d_idx >= p["stockout_day"][i])
                views = draw(page_views_total * DEMAND_WEIGHTS[i])
                units = draw(views * p["view_cvr"] * sku["_cvr_mult"] * random.uniform(0.85, 1.15)) if in_stock else 0
                sku_units_by_day[sku["sku_id"]][d_idx] = units
                paid_orders += units
                gmv += units * sku["price_vnd"]
                page_views_sum += views
                sku_days.append(dict(
                    date=d, shop_id=sid, sku_id=sku["sku_id"], impressions=int(views * random.uniform(12, 20)),
                    product_page_views=views, units_ordered=units, gmv_vnd=units * sku["price_vnd"],
                    in_stock=in_stock, source_status="MOCK",
                ))
            canceled = min(paid_orders, draw(paid_orders * p["cancel"] * random.uniform(0.6, 1.4)))
            returned = draw((paid_orders - canceled) * p["ret"] * random.uniform(0.7, 1.3))
            ads_share = min(0.95, p["ads_share"] * random.uniform(0.9, 1.1))
            ads_gmv = int(gmv * ads_share)
            visits_ads = int(visits * ads_share)
            visits_video = int(visits * (0.45 if p["video_reach"] >= 5000 else 0.12))
            shop_days.append(dict(
                date=d, shop_id=sid, shop_visits=visits, visits_ads=visits_ads, visits_video=visits_video,
                visits_organic=visits - visits_ads - visits_video, product_page_views=page_views_sum,
                paid_orders=paid_orders, canceled_orders=canceled, returned_orders=returned,
                gmv_vnd=gmv, ads_orders=int(paid_orders * ads_share), ads_gmv_vnd=ads_gmv,
                ads_spend_vnd=int(ads_gmv / p["roas"] * random.uniform(0.9, 1.1)),
                voucher_cost_vnd=int(gmv * p["voucher"] * random.uniform(0.8, 1.2)),
                late_shipment_rate=round(min(1.0, p["late"] * random.uniform(0.7, 1.3)), 4),
                cancellation_rate=round(canceled / max(1, paid_orders), 4),
                return_rate=round(returned / max(1, paid_orders), 4), source_status="MOCK",
            ))

        # ---- Videos: 3 per shop, featuring SKU01..SKU03 ----
        for j, post_day in enumerate(VIDEO_POST_DAYS):
            sku = shop_skus[j]
            ov = p["video_overrides"].get(j, {})
            days_live = DAYS - post_day
            duration = random.choice([19, 27, 38, 44])  # always drawn, so the random stream is unchanged
            if j < len(slot) and (VIDEO_DIR / slot[j][2]).exists():
                duration = video_duration_sec(VIDEO_DIR / slot[j][2])
            completion = ov.get("completion", random.uniform(*p["video_completion"]))
            ctr = ov.get("ctr", random.uniform(*p["video_ctr"]))
            views = int(p["video_reach"] * ov.get("reach_factor", 1.0) * days_live ** 0.8 * random.uniform(0.75, 1.25))
            clicks = int(views * ctr)
            expected_orders = clicks * p["view_cvr"] * sku["_cvr_mult"] * VIDEO_PURCHASE_INTENT
            sku_units_after_post = sum(sku_units_by_day[sku["sku_id"]][post_day:])
            orders = min(draw(expected_orders), int(0.6 * sku_units_after_post))
            vid = f"{sid}-VID{j + 1:02d}"
            videos.append(dict(
                video_id=vid, shop_id=sid, sku_id=sku["sku_id"], duration_sec=duration,
                posted_at=DATES[post_day], days_live=days_live,
                creative_type=random.choice(["ugc_review", "product_demo", "before_after", "comparison"]),
                video_views=views, avg_watch_time_sec=round(duration * min(1.0, completion + 0.2), 1),
                completion_rate=round(completion, 3), product_clicks=clicks, attributed_orders=orders,
                attributed_gmv_vnd=orders * sku["price_vnd"], source_status="MOCK",
            ))
            links.append(dict(video_id=vid, sku_id=sku["sku_id"], relation="featured_product", source_status="MOCK"))
            if "case" in ov:
                case = ov["case"]
            elif p["primary_issue"] == "low_confidence":
                case = "insufficient_data"
            elif sku["stock"] == 0:
                case = "stockout_sku"
            elif p["scenario"] == "viral_low_conversion":
                case = "views_without_clicks"
            elif j in p["weak_skus"]:
                case = "weak_sku"
            else:
                case = "healthy"
            truth["videos"].append(dict(video_id=vid, expected_verdict=case))

        # ---- 30-day shop profile (no labels: scenario lives in ground_truth.json) ----
        rows = [r for r in shop_days if r["shop_id"] == sid]
        orders_30d = sum(r["paid_orders"] for r in rows)
        shops.append(dict(
            shop_id=sid, shop_name=p["shop_name"], country="VN", currency="VND", main_category=cat,
            shop_rating=p["rating"], shop_rating_count=rating_count,
            shop_age_days=p["age_days"] or random.randint(300, 1500), account_status="active",
            platform_fee_rate=PLATFORM_FEE_RATE, metric_window_start=DATES[0], metric_window_end=DATES[-1],
            orders_30d=orders_30d, gmv_30d_vnd=sum(r["gmv_vnd"] for r in rows),
            shop_visits_30d=sum(r["shop_visits"] for r in rows),
            ads_spend_30d_vnd=sum(r["ads_spend_vnd"] for r in rows),
            cancellation_rate_30d=round(sum(r["canceled_orders"] for r in rows) / max(1, orders_30d), 4),
            return_rate_30d=round(sum(r["returned_orders"] for r in rows) / max(1, orders_30d), 4),
            late_shipment_rate_30d=round(sum(r["late_shipment_rate"] for r in rows) / len(rows), 4),
            source_status="MOCK", schema_version="2.0",
        ))
        truth["shops"].append(dict(shop_id=sid, scenario=p["scenario"], expected_primary_issue=p["primary_issue"]))
        for sku in shop_skus:
            del sku["_cvr_mult"]
        skus.extend(shop_skus)

    return dict(shops=shops, skus=skus, sku_reviews_summary=reviews, shop_daily_metrics=shop_days,
                sku_daily_metrics=sku_days, videos=videos, video_sku_links=links), truth


def main():
    tables, truth = build()
    for name, rows in tables.items():
        with (OUT / f"{name}.csv").open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
    metadata = {
        "dataset": "synthetic_shopee_intelligence", "version": "2.0", "synthetic": True, "currency": "VND",
        "metric_period": {"start": DATES[0], "end": DATES[-1]},
        "warning": "Fabricated test fixtures. NOT Shopee API payloads or actual shops. "
                   "Do not use as predictive ground truth.",
    }
    (OUT / "seed.json").write_text(json.dumps({"metadata": metadata, **tables}, ensure_ascii=False, indent=1),
                                   encoding="utf-8")
    (OUT / "ground_truth.json").write_text(json.dumps(truth, ensure_ascii=False, indent=2), encoding="utf-8")
    print({name: len(rows) for name, rows in tables.items()})


if __name__ == "__main__":
    main()
