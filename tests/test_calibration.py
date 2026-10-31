"""Calibration file, category percentiles with min-n fallback, and the calibration block on scores."""

import json
import tempfile
import unittest
from pathlib import Path

from core import rubric, shop_diagnosis, shop_rubric
from core.rubric import RUBRICS
from core.schema import Feature, Mode, SourceStatus
from core.score_engine import score_criterion
from sources import calibration as cal
from sources.providers import MarketProvider


def real(v):
    return Feature(v, SourceStatus.REAL, "test")


def criterion(cid: str):
    return next(c for group in RUBRICS.values() for c in group if c.id == cid)


def tiktok_row(pid, sold, videos, category="Beauty & Personal Care", lfl=False, price=50000):
    return {"platform": "tiktok_shop", "product_id": pid, "sold_count": sold, "linked_video_count": videos,
            "rating": 4.8, "price_vnd": price, "like_for_like": lfl, "category_l1": {"name": category}}


def snapshot(niche: list[dict], category="Beauty & Personal Care", sku="SKU-A") -> dict:
    return {"sku_id": sku, "crawled_at": "2026-10-27", "competitors": niche,
            "tiktok": {"video_count": 5000,
                       "category": {"metrics": {"category": {"category_name": category}}}}}


def peers(n: int, category="Beauty & Personal Care") -> list[dict]:
    # n category products with sold = videos = 100, 200, ... so ranks are easy to read
    return [snapshot([tiktok_row(f"p{i}", 100 * (i + 1), 100 * (i + 1), category) for i in range(n)], category, "PEER")]


NICHE = [tiktok_row(f"n{i}", sold, videos, lfl=True) for i, (sold, videos) in enumerate([(1000, 300), (1050, 300), (1100, 300)])]


class CalibrationFileTest(unittest.TestCase):
    def test_shipped_file_is_valid_and_keeps_previous_values(self):
        data = cal.load()
        self.assertTrue(all(e["status"] in cal.STATUSES for e in data["constants"].values()))
        # Values moved out of code must not change behaviour.
        expected = {"rubric.bench_completion_rate": 0.5, "rubric.bench_product_ctr": 0.02,
                    "rubric.bench_click_to_order_cvr": 0.05, "rubric.bench_gross_margin_rate": 0.5,
                    "rubric.saturation_videos_for_zero": 1000, "rubric.pacing_ideal_shot_sec": (1.5, 3.0),
                    "rubric.authenticity_score": {"high": 85, "medium": 60, "low": 30},
                    "shop_rubric.worst_late_rate": 0.15, "shop_rubric.bench_roas": 5.0,
                    "shop_diagnosis.min_video_ctr": 0.012, "shop_diagnosis.weak_sku_rating": 4.2,
                    "market.demand_full_scale_log10_units": 6}
        for key, value in expected.items():
            self.assertEqual(cal.value(key), value, key)
        self.assertEqual((rubric.BENCH_PRODUCT_CTR, shop_rubric.WORST_RETURN_RATE, shop_diagnosis.LATE_LIMIT),
                         (0.02, 0.20, 0.08))

    def test_malformed_or_missing_file_is_a_configuration_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "bad.json"
            bad.write_text(json.dumps({"constants": {"x": {"value": 1, "unit": "u", "status": "guess",
                                                           "source": "s", "note": "n"}}}), encoding="utf-8")
            with self.assertRaises(cal.CalibrationError):
                cal.load(bad)
            short = Path(tmp) / "short.json"
            short.write_text(json.dumps({"constants": {"x": {"value": 1}}}), encoding="utf-8")
            with self.assertRaisesRegex(cal.CalibrationError, "lacks"):
                cal.load(short)
            with self.assertRaises(cal.CalibrationError):
                cal.load(Path(tmp) / "absent.json")
        with self.assertRaises(KeyError):
            cal.value("rubric.no_such_constant")

    def test_summarize_takes_the_weakest_status(self):
        block = cal.summarize({"rubric.bench_completion_rate"}, ["market.competitor_prices_vnd"], ["why"])
        self.assertEqual(block["status"], "placeholder")
        self.assertEqual(block["placeholders"], ["rubric.bench_completion_rate"])
        self.assertEqual(block["sourced"], ["market.like_for_like_prices"])
        self.assertEqual(block["fallback"], ["why"])
        self.assertEqual(cal.summarize(set(), ["market.demand_percentile"])["status"], "sourced")
        self.assertIsNone(cal.summarize(set(), ["video.hook_strength"]))

    def test_percentile_rank_uses_mid_rank(self):
        self.assertEqual(cal.percentile_rank([1, 2, 3, 4], 3), 62.5)
        self.assertEqual(cal.percentile_rank([1, 2, 3, 4], 10), 100.0)
        self.assertEqual(cal.percentile_rank([1, 2, 3, 4], 0), 0.0)
        with self.assertRaises(ValueError):
            cal.percentile_rank([], 1)


class CategoryPercentileTest(unittest.TestCase):
    def test_deep_pool_gives_percentiles_and_sourced_criteria(self):
        f = MarketProvider(snapshot(NICHE), today="2026-10-29", peers=peers(30)).load()
        demand, saturation = f["market.demand_percentile"], f["market.saturation_percentile"]
        # niche median 1050 units sits above 10 of 30 pool products (100..1000); 300 videos ties 1 and beats 2
        self.assertEqual(demand.value, round(100 * 10 / 30, 1))
        self.assertEqual(saturation.value, round(100 * 2.5 / 30, 1))
        self.assertEqual(demand.status, SourceStatus.INFERRED)
        self.assertTrue(any("n=30" in e for e in demand.evidence))
        self.assertEqual(f["market.category_benchmark"].value["category_pool_n"], 30)
        s5 = score_criterion(criterion("S5"), f, Mode.EVIDENCE)
        s6 = score_criterion(criterion("S6"), f, Mode.EVIDENCE)
        self.assertEqual((s5.score, s5.calibration["status"]), (33.3, "sourced"))
        self.assertEqual((s6.score, s6.calibration["status"]), (91.7, "sourced"))
        self.assertNotIn("fallback", s6.calibration)

    def test_thin_pool_falls_back_to_the_constant_and_says_so(self):
        f = MarketProvider(snapshot(NICHE), today="2026-10-29", peers=peers(10)).load()
        self.assertEqual(f["market.demand_percentile"].status, SourceStatus.MISSING)
        self.assertIn("(< 20)", f["market.demand_percentile"].evidence[0])
        s6 = score_criterion(criterion("S6"), f, Mode.EVIDENCE)
        self.assertEqual(s6.score, 0.0)  # 5000 videos against the 1000-video placeholder
        self.assertEqual(s6.calibration["status"], "placeholder")
        self.assertIn("rubric.saturation_videos_for_zero", s6.calibration["placeholders"])
        self.assertIn("(< 20)", s6.calibration["fallback"][0])
        s5 = score_criterion(criterion("S5"), f, Mode.EVIDENCE)
        self.assertEqual(s5.score, f["market.demand_index"].value)
        self.assertEqual(s5.calibration["placeholders"], ["market.demand_full_scale_log10_units"])

    def test_thin_niche_or_unknown_category_is_missing(self):
        f = MarketProvider(snapshot(NICHE[:2]), today="2026-10-29", peers=peers(30)).load()
        self.assertIn("2 like-for-like", f["market.demand_percentile"].evidence[0])
        snap = snapshot(NICHE)
        del snap["tiktok"]["category"]
        f = MarketProvider(snap, today="2026-10-29", peers=peers(30)).load()
        self.assertIn("category", f["market.saturation_percentile"].evidence[0])

    def test_real_crawl_pools_by_fastmoss_category(self):
        snaps = json.loads((Path(__file__).resolve().parents[1] / "fixtures/market/market_snapshots.json")
                           .read_text(encoding="utf-8"))
        beauty = next(s for s in snaps if s["sku_id"] == "SHOP001-SKU01")
        f = MarketProvider(beauty, today="2026-10-29").load()
        self.assertEqual(f["market.category_benchmark"].value["category_pool_n"], 60)
        self.assertEqual(f["market.demand_percentile"].status, SourceStatus.INFERRED)
        thin = next(s for s in snaps if s["sku_id"] == "SHOP009-SKU01")  # Household Appliances: 13 products
        self.assertEqual(MarketProvider(thin, today="2026-10-29").load()["market.demand_percentile"].status,
                         SourceStatus.MISSING)


class PriceRankTest(unittest.TestCase):
    def test_too_few_rivals_is_not_scored(self):
        feats = {"sku.price_vnd": real(100), "market.competitor_prices_vnd": real([90, 110, 120, 130])}
        r = score_criterion(criterion("S2"), feats, Mode.EVIDENCE)
        self.assertIsNone(r.score)
        self.assertIn("4 like-for-like listings (< 5)", r.reason)
        feats["market.competitor_prices_vnd"] = real([90, 110, 120, 130, 80])
        r = score_criterion(criterion("S2"), feats, Mode.EVIDENCE)
        self.assertEqual((r.score, r.calibration["status"]), (60.0, "sourced"))


class CalibrationBlockTest(unittest.TestCase):
    def test_placeholder_benchmark_is_reported_on_the_criterion(self):
        r = score_criterion(criterion("V7"), {"perf.completion_rate": real(0.25)}, Mode.EVIDENCE)
        self.assertEqual(r.score, 50.0)
        self.assertEqual(r.calibration["status"], "placeholder")
        self.assertEqual(r.calibration["placeholders"], ["rubric.bench_completion_rate"])
        self.assertIsNone(score_criterion(criterion("V7"), {}, Mode.EVIDENCE).calibration)  # not scored

    def test_shop_rubric_and_diagnosis_carry_calibration(self):
        h1 = next(c for c in shop_rubric.RUBRICS["shop_health"] if c.id == "H1")
        r = score_criterion(h1, {"shop.late_shipment_rate": real(0.075)}, Mode.EVIDENCE)
        self.assertEqual((r.score, r.calibration["placeholders"]), (50.0, ["shop_rubric.worst_late_rate"]))
        self.assertEqual(shop_diagnosis.CALIBRATION["status"], "placeholder")

    def test_rubric_versions_are_labelled(self):
        self.assertEqual(rubric.RUBRIC_STATUS, {"v1": "legacy", "v2": "current"})


if __name__ == "__main__":
    unittest.main()
