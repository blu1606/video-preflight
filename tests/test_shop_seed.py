"""Run: uv run python -m unittest discover tests (from the repo root)."""

import json
import unittest
from collections import defaultdict
from pathlib import Path

from main import build_shop_report
from sources.providers import ShopSeedProvider, load_seed
from core.schema import Mode
from core.shop_diagnosis import diagnose_shop

SEED_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "shopee_seed"
SEED = SEED_DIR / "seed.json"
TRUTH = json.loads((SEED_DIR / "ground_truth.json").read_text(encoding="utf-8"))


class SeedIntegrityTest(unittest.TestCase):
    seed = load_seed(SEED)

    def test_no_scenario_labels_in_agent_inputs(self):
        for shop in self.seed["shops"]:
            self.assertNotIn("scenario", shop)
            self.assertNotIn("health_penalty_points", shop)

    def test_sku_gmv_sums_to_shop_gmv(self):
        sku_gmv = defaultdict(int)
        for r in self.seed["sku_daily_metrics"]:
            sku_gmv[(r["date"], r["shop_id"])] += r["gmv_vnd"]
        for r in self.seed["shop_daily_metrics"]:
            self.assertEqual(sku_gmv[(r["date"], r["shop_id"])], r["gmv_vnd"])

    def test_video_orders_never_exceed_sku_orders(self):
        units = defaultdict(int)
        for r in self.seed["sku_daily_metrics"]:
            units[r["sku_id"]] += r["units_ordered"]
        for v in self.seed["videos"]:
            self.assertLessEqual(v["attributed_orders"], units[v["sku_id"]], v["video_id"])

    def test_stockout_keeps_demand_but_no_sales(self):
        oos = [r for r in self.seed["sku_daily_metrics"] if not r["in_stock"]]
        self.assertTrue(oos)
        self.assertTrue(all(r["units_ordered"] == 0 for r in oos))
        self.assertGreater(sum(r["product_page_views"] for r in oos), 0)


class DiagnosisTest(unittest.TestCase):
    def test_primary_issue_matches_designed_scenario(self):
        for shop in TRUTH["shops"]:
            features = ShopSeedProvider(SEED, shop["shop_id"]).load()
            d = diagnose_shop(features, Mode.SIMULATION)
            self.assertEqual(d["primary_issue"], shop["expected_primary_issue"], shop["shop_id"])

    def test_video_verdicts_match_designed_cases(self):
        expected = {v["video_id"]: v["expected_verdict"] for v in TRUTH["videos"]}
        for shop in TRUTH["shops"]:
            features = ShopSeedProvider(SEED, shop["shop_id"]).load()
            for v in build_shop_report(features, Mode.SIMULATION, shop["shop_id"], None)["videos"]:
                self.assertEqual(v["verdict"], expected[v["video_id"]], v["video_id"])

    def test_sparse_shop_is_not_called_weak(self):
        d = diagnose_shop(ShopSeedProvider(SEED, "SHOP006").load(), Mode.SIMULATION)
        self.assertEqual(d["confidence"], "low")
        self.assertEqual([f["area"] for f in d["findings"]], ["low_confidence"])

    def test_evidence_mode_refuses_mock_seed(self):
        features = ShopSeedProvider(SEED, "SHOP001").load()
        report = build_shop_report(features, Mode.EVIDENCE, "SHOP001", None)
        self.assertEqual(report["diagnosis"]["status"], "not_scored")
        self.assertEqual(report["videos"], [])
        self.assertTrue(all(g.score is None for g in report["scores"]))


if __name__ == "__main__":
    unittest.main()
