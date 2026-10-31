"""Run: uv run python -m unittest discover tests (from video_understanding/demo)."""

import unittest
from pathlib import Path

from core.schema import Mode, SourceStatus
from main import PREPUBLISH_EXCLUDED, build_report
from sources.providers import MarketProvider, PostContextProvider, ShopSeedProvider, load_seed

DEMO = Path(__file__).resolve().parents[1]
SEED = DEMO / "fixtures" / "shopee_seed" / "seed.json"
FEATURES = DEMO / "output" / "features" / "vn-beauty-344788.json"
AUDIENCE = {"sku_id": "SHOP001-SKU02", "age_bands": {"18-24": 0.5}, "gender_split": {"male": 0.9},
            "regions": {"TP.HCM": 1.0}, "interests": ["skincare"]}


def seed_with_audience() -> dict:
    return {**load_seed(SEED), "sku_audience": [AUDIENCE]}


class PrepublishTest(unittest.TestCase):
    def test_uploaded_video_gets_shop_and_sku_data_but_no_performance(self):
        f = ShopSeedProvider(seed_with_audience(), "SHOP001", "UPL-x", "SHOP001-SKU02").load()
        self.assertEqual(f["sku.sku_id"].value, "SHOP001-SKU02")
        self.assertEqual(f["shop.cancellation_rate"].status, SourceStatus.MOCK)
        self.assertEqual(f["perf.views"].status, SourceStatus.MISSING)
        self.assertTrue(f["sku.stock_history"].value)
        self.assertEqual(f["context.target_audience"].value["gender_split"], {"male": 0.9})

    def test_posted_seed_video_keeps_its_performance(self):
        f = ShopSeedProvider(load_seed(SEED), "SHOP001", "SHOP001-VID02").load()
        self.assertEqual(f["perf.views"].status, SourceStatus.MOCK)
        self.assertEqual(f["context.target_audience"].status, SourceStatus.MISSING)

    def test_post_context(self):
        f = PostContextProvider({"sponsorship": "own_shop", "disclosure_enabled": False, "goal": "Tăng đơn"}, True).load()
        self.assertTrue(f["post.is_commercial"].value)  # a shopping link makes it commercial content
        self.assertEqual(f["post.is_commercial"].status, SourceStatus.INFERRED)
        self.assertEqual(f["context.business_constraints"].value, {"goal": "Tăng đơn"})
        self.assertEqual(f["request.user_query"].status, SourceStatus.INFERRED)  # default question
        none = PostContextProvider({}, False).load()
        self.assertFalse(none["post.is_commercial"].value)
        self.assertEqual(none["post.disclosure_enabled"].status, SourceStatus.MISSING)

    def test_market_snapshot(self):
        snap = {"sku_id": "SHOP001-SKU01", "crawled_at": "2026-10-20", "competitors": [
            {"price_vnd": 50000, "sold_count": 900, "rating": 4.8, "like_for_like": True, "url": "u1"},
            {"price_vnd": 70000, "sold_count": 100, "rating": 4.6, "like_for_like": True, "url": "u2"},
            {"price_vnd": 999000, "sold_count": 5, "like_for_like": False, "url": "u3"}],
            "tiktok": {"video_count": 1200, "momentum_7d_vs_28d": 1.3,
                       "provenance": {"provider": "FastMoss (TikTok Shop analytics)", "tool": "product_search",
                                      "arguments": {"keywords": "xà phòng"}, "captured_at": "2026-10-20",
                                      "raw_file": "raw/x.json"}}}
        f = MarketProvider(snap, today="2026-10-31").load()
        self.assertEqual(f["market.competitor_prices_vnd"].value, [50000, 70000])  # not like-for-like dropped
        self.assertEqual(f["market.competitor_prices_vnd"].status, SourceStatus.REAL)
        self.assertEqual(f["market.category_benchmark"].value["n"], 2)
        self.assertEqual(f["market.similar_video_count"].value, 1200)
        self.assertEqual(f["market.demand_index"].status, SourceStatus.INFERRED)
        self.assertEqual(f["market.trend_score"].value, 65.0)  # 50 x momentum 1.3
        self.assertIn("7 days old", f["market.trend_score"].evidence[0])
        self.assertTrue(any("product_search q='xà phòng' @2026-10-20" in e for e in f["market.trend_score"].evidence))
        self.assertEqual(MarketProvider({"sku_id": "x", "crawled_at": "2026-10-31"}).load(), {})

    @unittest.skipUnless(FEATURES.exists(), "needs cached Men Stay features")
    def test_prepublish_drops_post_publish_criteria(self):
        r = build_report(FEATURES, Mode.SIMULATION, shop_id="SHOP001", seed_video="UPL-x", seed=seed_with_audience(),
                         rubric="v1", stage="prepublish", sku_id="SHOP001-SKU02",
                         post={"sponsorship": "affiliate", "disclosure_enabled": False})
        ids = {c.id for g in r["scores"] for c in g.criteria}
        self.assertFalse(ids & PREPUBLISH_EXCLUDED)
        self.assertEqual(r["revenue_funnel"]["status"], "not_scored")
        self.assertEqual(r["features"]["sku.sku_id"].value, "SHOP001-SKU02")


if __name__ == "__main__":
    unittest.main()
