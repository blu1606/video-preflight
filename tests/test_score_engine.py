"""Run: uv run python -m unittest discover tests (from video_understanding/demo)."""

import unittest

from core.rubric import Criterion
from core.schema import Feature, Mode, SourceStatus
from core.score_engine import revenue_funnel, score_criterion, score_group


def real(v):
    return Feature(v, SourceStatus.REAL, "test")


def mock(v):
    return Feature(v, SourceStatus.MOCK, "fixture")


CRITERIA = [
    Criterion("A", "real one", 0.5, lambda v: v["x.real"]),
    Criterion("B", "mock one", 0.3, lambda v: v["x.mock"]),
    Criterion("C", "missing one", 0.2, lambda v: v["x.missing"]),
]
FEATURES = {"x.real": real(80), "x.mock": mock(40), "x.missing": Feature.missing("n/a")}


class ScoreEngineTest(unittest.TestCase):
    def test_simulation_uses_mock_and_skips_missing(self):
        g = score_group("g", CRITERIA, FEATURES, Mode.SIMULATION)
        self.assertAlmostEqual(g.score, (0.5 * 80 + 0.3 * 40) / 0.8, places=1)
        self.assertEqual(g.coverage, 0.8)
        self.assertTrue(g.mock_dependency)
        self.assertIsNone(g.criteria[2].score)  # missing -> not_scored, never 0

    def test_evidence_mode_excludes_mock(self):
        g = score_group("g", CRITERIA, FEATURES, Mode.EVIDENCE)
        self.assertEqual(g.score, 80)
        self.assertEqual(g.coverage, 0.5)
        self.assertFalse(g.mock_dependency)

    def test_all_missing_is_not_scored(self):
        g = score_group("g", CRITERIA[2:], FEATURES, Mode.SIMULATION)
        self.assertIsNone(g.score)
        self.assertEqual(g.coverage, 0)

    def test_optional_input_and_constants_are_recorded(self):
        def fn(v):
            fallback = v.get("x.missing")
            return v["x.real"] if fallback is None else fallback

        r = score_criterion(Criterion("D", "fallback", 1.0, fn), FEATURES, Mode.EVIDENCE)
        self.assertEqual((r.score, r.inputs), (80.0, ["x.real"]))
        self.assertIsNone(r.calibration)  # no threshold or benchmark used
        with_const = Criterion("E", "bench", 1.0, lambda v: v["x.real"] / v.const("rubric.bench_completion_rate"))
        r = score_criterion(with_const, FEATURES, Mode.EVIDENCE)
        self.assertEqual(r.score, 160.0)
        self.assertEqual(r.calibration["placeholders"], ["rubric.bench_completion_rate"])

    def test_revenue_funnel_labels_simulation(self):
        feats = {
            "perf.views": mock(1000),
            "perf.product_ctr": mock(0.02),
            "perf.click_to_order_cvr": mock(0.05),
            "sku.price_vnd": mock(100000),
        }
        sim = revenue_funnel(feats, Mode.SIMULATION)
        self.assertEqual(sim["status"], "simulation")
        self.assertEqual(sim["expected_gmv_vnd"], 100000)
        self.assertEqual(revenue_funnel(feats, Mode.EVIDENCE)["status"], "not_scored")


if __name__ == "__main__":
    unittest.main()
