"""Run: uv run python -m unittest tests.test_markers (from video_understanding/demo)."""

import json
import tempfile
import unittest
from pathlib import Path

from core.markers import build_markers, feature_times, parse_time

DB = Path(__file__).resolve().parents[1] / "db" / "db.json"


def feature(value=None, evidence=(), structural=False):
    return {"value": value, "status": "REAL", "evidence": list(evidence), "structural": structural}


class TimeTest(unittest.TestCase):
    def test_parse_time(self):
        self.assertEqual(parse_time("00:36 before/after"), 36)
        self.assertEqual(parse_time("01:05-01:10"), 65)
        self.assertIsNone(parse_time("no detector yet"))

    def test_feature_times_reads_evidence_and_values(self):
        self.assertEqual(feature_times(feature(evidence=["00:00-00:03"])), [0])
        self.assertEqual(feature_times(feature([{"timestamp_sec": 9}, {"timestamp_sec": 3}])), [3, 9])
        self.assertEqual(feature_times(feature({"present": False, "timestamp_sec": 0})), [])
        self.assertEqual(feature_times(None), [])


class BuildMarkersTest(unittest.TestCase):
    def result(self, **features):
        return {
            "features": {"video.duration_sec": feature(40.0), **features},
            "scores": [], "decisions": {"questions": []}, "policy": {"targets": {}},
        }

    def test_policy_marker_only_with_timestamp(self):
        r = self.result()
        r["policy"]["targets"] = {"tiktok_ads": {"findings": [
            {"rule_id": "TTA-002", "outcome": "needs_review", "severity": "high", "summary": "before/after",
             "evidence": ["00:36 before/after comparison"]},
            {"rule_id": "TTS-002", "outcome": "needs_review", "severity": "high", "summary": "claims",
             "evidence": ["4 product claims, no supporting documents"]},
            {"rule_id": "TTA-003", "outcome": "not_triggered", "severity": "high", "summary": "", "evidence": []},
        ]}}
        markers = build_markers(r)
        self.assertEqual([(m["source"]["ref"], m["t_start"], m["severity"]) for m in markers], [("TTA-002", 36, "high")])

    def test_low_criterion_placed_at_its_feature_time_never_at_structure(self):
        r = self.result(**{"video.policy_absolute_claims": feature([{"timestamp_sec": 9, "text": "x"}]),
                           "video.storytelling": feature(7, ["00:00 hook: mở đầu"])})
        r["decisions"]["questions"] = [{"id": "C06", "inputs": ["video.policy_absolute_claims"],
                                        "levels": [{"label": "1 Weak", "description": "unsupported"}],
                                        "answer": {"probabilities": [{"label": "1 Weak", "probability": 0.8}]}},
                                       {"id": "V07", "inputs": ["video.storytelling"]}]
        r["scores"] = [{"name": "conversion_potential", "criteria": [
            {"id": "C06", "name": "Trust evidence", "score": 22.5, "inputs": ["decision.C06"]},
            {"id": "V07", "name": "Share save utility", "score": 31.2, "inputs": ["decision.V07"]},
            {"id": "C01", "name": "Product identification", "score": 77, "inputs": ["decision.C01"]},
            {"id": "C07", "name": "Offer", "score": None, "inputs": []}]}]
        issues = [m for m in build_markers(r) if m["kind"] == "issue"]
        self.assertEqual([(m["source"]["ref"], m["t_start"], m["severity"]) for m in issues], [("C06", 9, "high")])
        self.assertEqual(issues[0]["comment"], "1 Weak: unsupported")

    def test_ghosts_for_missing_cta_and_offer(self):
        r = self.result(**{"video.has_cta": feature(False),
                           "video.offer": feature({"present": False, "timestamp_sec": 0})})
        ghosts = {m["id"]: m for m in build_markers(r) if m["kind"] == "ghost"}
        self.assertEqual(set(ghosts), {"ghost:cta", "ghost:offer"})
        self.assertEqual((ghosts["ghost:cta"]["t_start"], ghosts["ghost:cta"]["t_end"]), (37.0, 40.0))
        self.assertTrue(ghosts["ghost:cta"]["title"].startswith("Gợi ý vị trí"))

    def test_beats_span_to_next_beat_and_cuts_are_ticks(self):
        r = self.result(**{"video.storytelling": feature(7, ["arc_type: x", "00:00 hook: a", "00:16 solution: b"]),
                           "video.pacing_cut_timestamps": feature([4.42])})
        beats = [(m["title"], m["t_start"], m["t_end"]) for m in build_markers(r) if m["kind"] == "beat"]
        self.assertEqual(beats, [("hook", 0, 16), ("solution", 16, 40.0)])
        self.assertEqual([m["t_start"] for m in build_markers(r) if m["kind"] == "cut"], [4.42])

    @unittest.skipUnless(DB.exists(), "needs db/db.json")
    def test_real_teashell_run(self):
        runs = [a for a in json.loads(DB.read_text(encoding="utf-8"))["analyses"]
                if a.get("kind") == "video_run" and a["targetId"] == "SHOP001-VID01"
                and "tiktok_ads" in a["result"]["policy"]["targets"]]
        markers = build_markers(runs[-1]["result"])
        policy = {(m["source"]["ref"], m["t_start"]) for m in markers if m["lane"] == "policy"}
        self.assertTrue({("TTA-001", 0), ("TTA-001", 3), ("TTA-002", 36)} <= policy)
        self.assertIn("ghost:cta", {m["id"] for m in markers})
        self.assertTrue(all(m["t_start"] is not None for m in markers))


if __name__ == "__main__":
    unittest.main()


class PolicyMarkerIdsTest(unittest.TestCase):
    def test_two_evidence_lines_in_the_same_second_share_one_marker(self):
        result = {"policy": {"targets": {"meta_ads": {"findings": [
            {"rule_id": "META-001", "outcome": "needs_review", "severity": "high", "summary": "claims",
             "evidence": ["00:09 spoken: «a»", "00:09 caption: «b»", "00:12 spoken: «c»"]}]}}}}
        markers = build_markers(result)
        ids = [m["id"] for m in markers]
        self.assertEqual(len(ids), len(set(ids)))
        at9 = next(m for m in markers if m["t_start"] == 9)
        self.assertEqual(at9["evidence"], ["00:09 spoken: «a»", "00:09 caption: «b»"])
        self.assertEqual(len(markers), 2)


class TimingTest(unittest.TestCase):
    """Default windows are ranges; measured moments stay points; only visual issues are localizable."""

    def result(self, criteria, **features):
        return {
            "features": {"video.duration_sec": feature(10.0), **features},
            "scores": [{"name": "viral_potential", "criteria": criteria}] if criteria else [],
            "decisions": {"questions": []}, "policy": {"targets": {}},
        }

    def test_structural_opening_window_is_a_range_and_not_localized(self):
        r = self.result([{"id": "V02", "name": "Hook specificity", "score": 21.5, "inputs": ["video.hook_verbal"]}],
                        **{"video.hook_verbal": feature("lời chào", ["00:00-00:03"], structural=True),
                           "video.transcript_segments": feature([{"start": 0.0, "end": 2.5, "text": "Chào các bạn"}])})
        (m,) = build_markers(r)
        self.assertEqual((m["t_start"], m["t_end"], m["precise"]), (0.0, 3.0, False))
        self.assertEqual(m["time_label"], "Cả đoạn mở đầu 0–3s")
        self.assertFalse(m["localizable"])
        self.assertEqual(m["quote"], {"t": 0.0, "text": "Chào các bạn"})

    def test_absent_demo_is_the_whole_video_and_localizable(self):
        r = self.result([{"id": "C03", "name": "Demonstration clarity", "score": 33.2,
                          "inputs": ["video.demo_present", "video.sensory_details"]}],
                        **{"video.demo_present": feature(False, ["00:00-00:00"], structural=True),
                           "video.sensory_details": feature("", ["00:00-00:00"], structural=True)})
        (m,) = build_markers(r)
        self.assertEqual((m["t_start"], m["t_end"], m["time_label"]), (0.0, 10.0, "Toàn video"))
        self.assertTrue(m["localizable"])
        self.assertIsNone(m["quote"])

    def test_measured_visual_moment_is_a_localizable_point(self):
        r = self.result([{"id": "C01", "name": "Product identification", "score": 40,
                          "inputs": ["video.on_screen_text"]}],
                        **{"video.on_screen_text": feature([{"timestamp_sec": 4.0, "text": "giá 99k"}])})
        (m,) = build_markers(r)
        self.assertEqual((m["t_start"], m["precise"], m["localizable"]), (4.0, True, True))

    def test_criterion_without_timing_or_visual_basis_gets_no_marker(self):
        r = self.result([{"id": "V09", "name": "Speech hook", "score": 20, "inputs": ["video.key_claims"]}])
        self.assertEqual(build_markers(r), [])

    def test_policy_spoken_line_is_not_localizable_overlay_line_is_not_speech(self):
        r = self.result([])
        r["policy"]["targets"] = {"tiktok_ads": {"findings": [
            {"rule_id": "TTA-001", "outcome": "needs_review", "severity": "high", "summary": "claim",
             "evidence": ["00:03 spoken: «hiệu quả 100%»"]},
            {"rule_id": "TTA-002", "outcome": "needs_review", "severity": "high", "summary": "overlay",
             "evidence": ["00:05 overlay: «giảm 90%»"]},
        ]}}
        by_rule = {m["source"]["ref"]: m for m in build_markers(r)}
        self.assertFalse(by_rule["TTA-001"]["localizable"])
        self.assertTrue(by_rule["TTA-002"]["localizable"])

    def test_provider_marks_absent_demo_and_opening_window_structural(self):
        from dataclasses import asdict

        from sources.providers import VideoFeatureProvider

        raw = {"video_duration_sec": 10.0, "transcript": "", "transcript_segments": [], "features": {
            "hook_analysis": {"hook_type": "reveal", "verbal_hook": "hi", "hook_strength_1_to_10": 5},
            "demo_and_product_experience": {"demo_present": False, "clarity_score_1_to_10": 4}}}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "features.json"
            path.write_text(json.dumps(raw), encoding="utf-8")
            loaded = {k: asdict(v) for k, v in VideoFeatureProvider(path).load().items()}
        self.assertTrue(loaded["video.hook_verbal"]["structural"])
        self.assertTrue(loaded["video.clarity_score"]["structural"])
        self.assertEqual(loaded["video.clarity_score"]["evidence"], ["00:00-00:00"])
        (m,) = build_markers({"features": loaded, "scores": [{"name": "conversion_potential", "criteria": [
            {"id": "C03", "name": "Demonstration clarity", "score": 33.2, "inputs": ["video.demo_present"]}]}],
            "decisions": {"questions": []}, "policy": {"targets": {}}})
        self.assertEqual((m["t_start"], m["t_end"], m["localizable"]), (0.0, 10.0, True))
