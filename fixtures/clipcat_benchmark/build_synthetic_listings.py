"""Synthetic Shopee listings for benchmark videos that have no real same-product listing (seed 20261027).

Run from this folder:  python build_synthetic_listings.py

Writes synthetic_product_listings.csv. Every row is MOCK test data, not a real Shopee listing:
- videos without a real same_product_candidate get one primary listing, one bigger-pack variant and one
  competitor;
- videos with a real primary listing get one `attributes_only` row that adds the fields search snippets
  lack (attributes, image_count, review_count); the real fields stay REAL.

Product name and unit price come from clipcat_video_benchmark_24.csv (`product_name_vi`, `unit_price_vnd`),
which were checked against the TikTok Shop product attached to each video, so the listings, the seed SKUs
and the video all describe the same product. sold_displayed grows with Clipcat sales; rating 4.5-4.9;
review_count 15-35% of units sold.
"""

import csv
import json
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
RANDOM_SEED = 20261027
ATTRIBUTES = {
    "beauty": {"dung_tich": ["100g", "120ml"], "xuat_xu": ["Việt Nam", "Hàn Quốc"], "han_su_dung": ["36 tháng"]},
    "phones": {"tuong_thich": ["iPhone 15/16", "Android"], "chat_lieu": ["silicone", "TPU", "nhựa ABS"], "bao_hanh": ["7 ngày", "6 tháng"]},
    "fashion": {"chat_lieu": ["cotton", "đũi", "thun"], "size": ["S-XL", "M-2XL"], "xuat_xu": ["Việt Nam"]},
    "kitchenware": {"chat_lieu": ["thủy tinh", "sứ"], "kich_thuoc": ["30cm", "26cm"], "xuat_xu": ["Trung Quốc"]},
    "home": {"quy_cach": ["10 gói", "thùng 4 túi"], "xuat_xu": ["Việt Nam"]},
    "sports": {"dung_tich": ["500ml", "750ml"], "chat_lieu": ["nhựa Tritan", "nhựa PP"]},
    "home_appliance": {"dung_tich": ["1.2L", "1.8L"], "cong_suat": ["400W", "600W"], "bao_hanh": ["12 tháng"]},
    "health": {"quy_cach": ["hộp 20 gói", "lọ 60 viên"], "xuat_xu": ["Việt Nam", "Mỹ"], "han_su_dung": ["24 tháng"]},
    "food": {"khoi_luong": ["500g", "250g"], "xuat_xu": ["Việt Nam"], "han_su_dung": ["12 tháng"]},
    "baby": {"do_tuoi": ["0+ tháng", "1+ tuổi"], "xuat_xu": ["Việt Nam", "Nhật Bản"], "han_su_dung": ["24 tháng"]},
}
# Attributes that must agree with the attached product's title (random picks would contradict them).
ATTRIBUTE_OVERRIDES = {
    "vn-beauty-467796": {"dung_tich": "100g", "xuat_xu": "Việt Nam"},
    "vn-beauty-344788": {"dung_tich": "100g"},
    "vn-beauty-445704": {"dung_tich": "3.5g"},
    "vn-beauty-073684": {"quy_cach": "gói 32 miếng", "xuat_xu": "Trung Quốc", "han_su_dung": "36 tháng"},
    "vn-phones-436820": {"tuong_thich": "iPhone 11-17"},
    "vn-phones-166037": {"tuong_thich": "iPhone 11-16"},
    "vn-phones-706453": {"chat_lieu": "nhựa ABS", "tuong_thich": "iPhone/Android"},
    "vn-phones-050881": {"loai": "nhét tai không dây (TWS)", "tuong_thich": "iPhone/Android"},
    "vn-phones-779410": {"loai": "sạc dự phòng kèm 4 cáp", "tuong_thich": "iPhone/Android"},
    "vn-phones-948309": {"loai": "cáp 4 đầu 240W", "chat_lieu": "silicone lỏng"},
    "vn-kitchenware-157332": {"chat_lieu": "thủy tinh"},
    "vn-home-519316": {"quy_cach": "thùng 10 bịch"},
    "vn-home-801672": {"quy_cach": "combo 2 túi 3.2L"},
    "vn-sports-071111": {"dung_tich": "500ml", "chat_lieu": "nhựa PP", "dac_diem": "chống tràn, có ống hút"},
    "vn-food-203335": {"khoi_luong": "420g"},
    "vn-food-070930": {"khoi_luong": "hũ 250g", "dac_diem": "món chay, từ đậu nành"},
    "vn-womenswear-809684": {"chat_lieu": "đũi"},
    "vn-womenswear-305352": {"chat_lieu": "thun tăm"},
    "vn-womenswear-509704": {"chat_lieu": "denim", "size": "đến 80kg"},
    "vn-womenswear-048084": {"chat_lieu": "gió lụa"},
    "vn-health-236690": {"quy_cach": "hộp 10 ống"},
    "vn-health-468168": {"quy_cach": "hộp 32 tép", "xuat_xu": "Hàn Quốc"},
    "vn-health-648852": {"quy_cach": "lọ viên nhai"},
    "vn-household-060295": {"dung_tich": "1.8L"},
    "vn-baby-161044": {"quy_cach": "thùng 24 hộp 110ml", "do_tuoi": "1+ tuổi"},
    "vn-baby-072597": {"quy_cach": "hộp 30 gói", "do_tuoi": "0+ tháng"},
}
FIELDS = ["clipcat_id", "sku_title", "shop_name", "shopee_url", "url_kind", "price_vnd", "rating", "sold_displayed",
          "match_type", "note", "source", "source_ref", "noted_on", "attributes", "image_count", "review_count"]
_product_attrs: dict[str, dict] = {}  # product key -> attributes, so every listing of one product shares them


def sold_display(units: int) -> str:
    return f"{units // 1000}k+" if units >= 1000 else str(units)


def vnd(x: float) -> int:
    return int(round(x, -3))


def extras(cid: str, category: str, units: int, product: str = "") -> dict:
    if product and product in _product_attrs:
        attrs = _product_attrs[product]
    else:
        attrs = {**{k: random.choice(v) for k, v in ATTRIBUTES[category].items()}, **ATTRIBUTE_OVERRIDES.get(cid, {})}
        if cid == "vn-beauty-073684":  # sanitary pads in the mother-baby shop: no child age range
            attrs.pop("do_tuoi", None)
        if product:
            _product_attrs[product] = attrs
    return {"attributes": json.dumps(attrs, ensure_ascii=False), "image_count": random.randint(4, 9),
            "review_count": int(units * random.uniform(0.15, 0.35))}


def listing(cid, title, shop, price, units, match, note, category, product="") -> dict:
    return {"clipcat_id": cid, "sku_title": title, "shop_name": shop, "shopee_url": "", "url_kind": "synthetic",
            "price_vnd": price, "rating": round(random.uniform(4.5, 4.9), 1), "sold_displayed": sold_display(units),
            "match_type": match, "note": note, "source": "synthetic_seed", "source_ref": "", "noted_on": "2026-10-27",
            **extras(cid, category, units, product)}


def build() -> list[dict]:
    random.seed(RANDOM_SEED)
    with (HERE / "clipcat_video_benchmark_24.csv").open(encoding="utf-8-sig") as f:
        bench = list(csv.DictReader(f))
    with (HERE / "public_product_candidates.csv").open(encoding="utf-8-sig") as f:
        real = list(csv.DictReader(f))
    real_primary = {r["clipcat_id"]: r for r in reversed(real) if r["match_type"] == "same_product_candidate"}

    rows = []
    for b in bench:
        cid = b["clipcat_url"].rstrip("/").rsplit("/", 1)[-1]
        units = int(float(b["sales_reported"]) * random.uniform(3, 12))
        if cid in real_primary:
            r = real_primary[cid]
            rows.append({**{k: "" for k in FIELDS}, "clipcat_id": cid, "sku_title": r["sku_title"],
                         "shop_name": r["shop_name"], "match_type": "attributes_only",
                         "note": "adds fields missing from the real listing; real fields stay REAL",
                         "source": "synthetic_seed", "noted_on": "2026-10-27", **extras(cid, b["category"], units)})
            continue
        title, cat, price = b["product_name_vi"], b["category"], int(b["unit_price_vnd"])
        product = b["product_group"] or cid  # the primary and its combo pack are the same product
        brand = next((w for w in title.split() if w.isupper() and w.isalpha() and len(w) > 2), "Official")
        rows.append(listing(cid, title, f"{brand} Store", price, units, "same_product_candidate", "", cat, product))
        rows.append(listing(cid, f"{title} (combo 2)", f"{brand} Store", vnd(price * random.uniform(1.6, 1.9)),
                            units // 3, "same_product_candidate", "bigger pack of the same product", cat, product))
        rows.append(listing(cid, f"{' '.join(title.split()[:3])} loại phổ thông", "Tổng Kho Sỉ",
                            vnd(price * random.uniform(0.6, 1.3)), units // 2, "competitor_candidate",
                            "same category, different brand", cat))
    return rows


if __name__ == "__main__":
    rows = build()
    with (HERE / "synthetic_product_listings.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} rows")
