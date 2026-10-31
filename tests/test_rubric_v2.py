"""Run: uv run python -m unittest discover tests (from the repo root)."""

import unittest

from core.quality_gate import quality_gate
from core.rubric import RUBRICS, RUBRICS_V2
from core.schema import Feature, Mode, SourceStatus
from core.score_engine import score_all, score_criterion
from sources.providers import VideoFeatureProvider
from tests.fixture_cache import cached_features


def inferred(v, mock=False):
    return Feature(v, SourceStatus.INFERRED, "decisions_api", mock_dependency=mock)


class RubricV2Test(unittest.TestCase):
    def test_built_from_score_questions_only(self):
        ids = {c.id for group in RUBRICS_V2.values() for c in group}
        self.assertIn("V01", ids)
        self.assertIn("H05", ids)
        self.assertFalse(ids & {"M01", "M06", "P01", "P03"})  # choice / predicate never scored
        self.assertEqual(next(c.weight for c in RUBRICS_V2["viral_potential"] if c.id == "V01"), 1.5)

    def test_unanswered_questions_lower_coverage_not_score(self):
        features = {"decision.V01": inferred(80.0), "decision.V02": inferred(40.0)}
        viral = next(g for g in score_all(features, Mode.EVIDENCE, RUBRICS_V2) if g.name == "viral_potential")
        self.assertEqual(viral.score, 64.0)  # (80*1.5 + 40*1.0) / 2.5
        self.assertLess(viral.coverage, 0.5)

    def test_evidence_mode_drops_answers_built_on_mock_inputs(self):
        features = {"decision.S01": inferred(90.0, mock=True)}
        self.assertIsNone(next(g for g in score_all(features, Mode.EVIDENCE, RUBRICS_V2) if g.name == "sku_market").score)
        self.assertEqual(next(g for g in score_all(features, Mode.SIMULATION, RUBRICS_V2) if g.name == "sku_market").score, 90.0)


FEATURES_467796 = cached_features("vn-beauty-467796.features.json")
VLM_SELF_RATINGS = ("video.hook_strength", "video.storytelling", "video.emotion", "video.shareability",
                    "video.clarity_score")


def v2(cid: str):
    return next(c for group in RUBRICS_V2.values() for c in group if c.id == cid)


def opening(speech, text, cut):
    return Feature({"speech_sec": speech, "text_sec": text, "cut_sec": cut}, SourceStatus.INFERRED, "rule")


class PostPublishGroupTest(unittest.TestCase):
    def test_measured_after_posting_is_its_own_group_in_both_rubrics(self):
        for rubric in (RUBRICS_V2, RUBRICS):
            ids = {g: [c.id for c in criteria] for g, criteria in rubric.items()}
            self.assertEqual(ids["post_publish_performance"], ["V7", "C8"])
            self.assertNotIn("V7", ids["viral_potential"])
            self.assertNotIn("C8", ids["conversion_potential"])


class OpeningCriteriaTest(unittest.TestCase):
    def test_v9_product_speed_band(self):
        for sec, expected in ((0.0, 100.0), (3.0, 100.0), (6.5, 50.0), (10.0, 0.0), (25.0, 0.0)):
            f = {"video.product_first_clear_sec": Feature(sec, SourceStatus.REAL, "video_vlm")}
            r = score_criterion(v2("V9"), f, Mode.EVIDENCE)
            self.assertEqual(r.score, expected, sec)
        self.assertEqual(r.calibration["status"], "placeholder")

    def test_v10_counts_openers_within_their_windows(self):
        cases = (((0.2, 1.5, 2.0), 100.0), ((0.0, None, 4.4), 33.3), ((1.5, 2.5, None), 0.0), ((1.0, 2.0, 3.0), 100.0))
        for signals, expected in cases:
            r = score_criterion(v2("V10"), {"video.opening_signals": opening(*signals)}, Mode.EVIDENCE)
            self.assertEqual(r.score, expected, signals)

    def test_missing_inputs_are_not_scored(self):
        f = {"video.product_first_clear_sec": Feature.missing("x"), "video.opening_signals": Feature.missing("y")}
        for cid in ("V9", "V10"):
            self.assertIsNone(score_criterion(v2(cid), f, Mode.EVIDENCE).score)

    def test_v2_never_scores_vlm_self_ratings(self):
        features = {k: Feature(9.0, SourceStatus.REAL, "video_vlm") for k in VLM_SELF_RATINGS}
        for group in score_all(features, Mode.EVIDENCE, RUBRICS_V2):
            for c in group.criteria:
                self.assertFalse(set(c.inputs) & set(VLM_SELF_RATINGS), c.id)
                self.assertIsNone(c.score, c.id)  # no Decisions answers -> judgement stays not_scored

    def test_real_cached_video(self):
        f = VideoFeatureProvider(FEATURES_467796).load()
        self.assertEqual(score_criterion(v2("V9"), f, Mode.EVIDENCE).score, 71.4)  # product clear at 00:05
        self.assertIn("00:05 product first clearly visible", f["video.product_first_clear_sec"].evidence[0])
        signals = f["video.opening_signals"]
        if signals.status == SourceStatus.MISSING:
            self.skipTest(f"opening signals unavailable here: {signals.evidence[0]}")
        # speech and on-screen text at 00:00, first hard cut at 4.42 s (outside the 3 s window)
        self.assertEqual(signals.value, {"speech_sec": 0.0, "text_sec": 0.0, "cut_sec": 4.42})
        self.assertEqual(score_criterion(v2("V10"), f, Mode.EVIDENCE).score, 66.7)
        self.assertTrue(signals.evidence[2].startswith("00:04 first hard cut"))


class QualityGateTest(unittest.TestCase):
    def test_flags_not_run_decisions_and_hook_conflict(self):
        features = {
            "decision.V02": Feature.missing("Decisions call not allowed (no client, no cache)"),
            "video.hook_strength": Feature(9.0, SourceStatus.REAL, "video_vlm"),
            "decision.V01": inferred(30.0),
            "listing.title": Feature("x", SourceStatus.REAL, "shopee"),
        }
        gate = quality_gate(features, score_all(features, Mode.EVIDENCE, RUBRICS_V2))
        codes = [f["code"] for f in gate["flags"]]
        self.assertEqual(gate["status"], "needs_attention")
        self.assertIn("decisions_not_run", codes)
        self.assertIn("conflict", codes)
        self.assertIn("low_coverage", codes)
        self.assertNotIn("no_listing", codes)

    def test_before_after_disagreement_is_a_conflict(self):
        policy = {"targets": {"tiktok_ads": {"findings": [{"rule_id": "TTA-002", "outcome": "not_triggered"}]}}}
        features = {"decision.P03": inferred(0.9), "policy.findings": inferred(policy)}
        gate = quality_gate(features, [])
        self.assertTrue(any(f["code"] == "conflict" and "P03" in f["detail"] for f in gate["flags"]))


if __name__ == "__main__":
    unittest.main()
