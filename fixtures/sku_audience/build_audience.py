"""Synthetic buyer profile per seed SKU (MOCK), standing in for Shopee seller analytics "Khách hàng".

Category templates + a small deterministic jitter per SKU; replace with the seller API when connected.

Usage (from the repo root):
    uv run python fixtures/sku_audience/build_audience.py
"""

import json
import random
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEED = HERE.parent / "shopee_seed" / "seed.json"
OUT = HERE / "sku_audience.json"
AGE_BANDS = ("18-24", "25-34", "35-44", "45+")

# category -> (age weights, female share, interests)
TEMPLATES = {
    "beauty": ((0.38, 0.42, 0.15, 0.05), 0.82, ["skincare", "làm đẹp", "review mỹ phẩm"]),
    "electronics_accessories": ((0.48, 0.34, 0.13, 0.05), 0.45, ["điện thoại", "phụ kiện", "gaming"]),
    "electronics": ((0.40, 0.38, 0.16, 0.06), 0.30, ["công nghệ", "âm thanh", "làm việc"]),
    "home": ((0.12, 0.43, 0.32, 0.13), 0.74, ["nhà cửa", "decor", "nội trợ"]),
    "household": ((0.10, 0.40, 0.34, 0.16), 0.70, ["nấu ăn", "nội trợ", "tiết kiệm"]),
    "general": ((0.22, 0.40, 0.26, 0.12), 0.63, ["tiện ích", "đồ ăn vặt", "săn sale"]),
    "fashion": ((0.45, 0.38, 0.13, 0.04), 0.88, ["thời trang", "phối đồ", "OOTD"]),
    "mother_baby": ((0.08, 0.62, 0.26, 0.04), 0.91, ["mẹ bỉm", "chăm con", "sức khỏe bé"]),
    "health_fitness": ((0.15, 0.36, 0.30, 0.19), 0.58, ["sức khỏe", "dinh dưỡng", "tập luyện"]),
}
REGIONS = {"TP.HCM": 0.34, "Hà Nội": 0.27, "Tỉnh thành khác": 0.39}
# A product named for men ("Sữa rửa mặt nam") flips its category's gender split. Only the Vietnamese word: "men"
# is also Vietnamese for yeast ("Men vi sinh").
FOR_MEN = re.compile(r"\bnam\b(?<!việt nam)", re.IGNORECASE)


def normalize(weights: dict[str, float]) -> dict[str, float]:
    total = sum(weights.values())
    return {k: round(v / total, 2) for k, v in weights.items()}


def profile(sku: dict) -> dict:
    rng = random.Random(sku["sku_id"])  # same SKU, same profile on every build
    ages, female, interests = TEMPLATES[sku["category"]]
    female = min(0.97, max(0.05, female + rng.uniform(-0.05, 0.05)))
    if FOR_MEN.search(sku["item_name"]):
        female = 1 - female
    return {
        "id": sku["sku_id"], "sku_id": sku["sku_id"], "shop_id": sku["shop_id"], "shopId": sku["shop_id"],
        "age_bands": normalize({b: w * rng.uniform(0.85, 1.15) for b, w in zip(AGE_BANDS, ages)}),
        "gender_split": {"female": round(female, 2), "male": round(1 - female, 2)},
        "regions": normalize({r: w * rng.uniform(0.9, 1.1) for r, w in REGIONS.items()}),
        "interests": interests,
        "source_status": "MOCK",
    }


def main() -> None:
    skus = json.loads(SEED.read_text(encoding="utf-8"))["skus"]
    rows = [profile(s) for s in skus]
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {OUT}: {len(rows)} SKU profiles")


if __name__ == "__main__":
    main()
