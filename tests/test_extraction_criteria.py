"""Storytelling / emotion / shareability mapping, OpenCV pacing, and claims-vs-listing (stub LLM, no API)."""

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import cv2
import numpy as np

from core import rubric
from core.rubric import RUBRICS
from core.schema import Feature, Mode, SourceStatus
from core.score_engine import score_criterion
from sources import claims, pacing
from sources.providers import VideoFeatureProvider


def real(v):
    return Feature(v, SourceStatus.REAL, "test")


def mock_f(v):
    return Feature(v, SourceStatus.MOCK, "fixture")


def criterion(cid: str):
    return next(c for group in RUBRICS.values() for c in group if c.id == cid)


def write_cache(folder: Path, extra: dict | None = None, video_file: str = "") -> Path:
    path = folder / "clip.json"
    features = {"product": {}, "hook_analysis": {}, "social_proof_and_claims": {"key_claims": ["foams well"]}}
    features.update(extra or {})
    path.write_text(json.dumps({"video_file": video_file, "video_duration_sec": 6.0, "transcript": "",
                                "features": features}), encoding="utf-8")
    return path


def write_video(path: Path, colors: list[tuple[int, int, int]], sec_each: float = 2.0, fps: int = 10) -> None:
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (64, 64))
    for color in colors:
        frame = np.full((64, 64, 3), color, dtype=np.uint8)
        for _ in range(int(sec_each * fps)):
            writer.write(frame)
    writer.release()


class StubClient:
    """Mimics client.chat.completions.create(...) and counts calls."""

    def __init__(self, content: str):
        self.calls = 0
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))
        self._content = content

    def _create(self, **_):
        self.calls += 1
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=self._content))])


NARRATIVE = {"narrative_and_emotion": {
    "storytelling": {"score_1_to_10": 7, "arc_type": "problem_solution", "reason": "clear arc",
                     "beats": [{"timestamp_sec": 0.0, "beat": "hook", "description": "pale hand"},
                               {"timestamp_sec": 65.0, "beat": "proof", "description": "side by side"}]},
    "emotion": {"score_1_to_10": 6.5, "dominant_emotion": "surprise", "reason": "r",
                "triggers": [{"timestamp_sec": 3.0, "trigger": "surprise", "description": "x"}]},
    "shareability": {"score_1_to_10": "high", "reason": "r", "share_drivers": []},
}}


class NarrativeProviderTest(unittest.TestCase):
    def test_old_cache_is_missing_with_reextract_reason(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = VideoFeatureProvider(write_cache(Path(tmp))).load()
        for name in ("storytelling", "emotion", "shareability"):
            self.assertEqual(f[f"video.{name}"].status, SourceStatus.MISSING)
            self.assertIn("re-extract", f[f"video.{name}"].evidence[0])
        self.assertIsNone(score_criterion(criterion("V2"), f, Mode.SIMULATION).score)

    def test_new_cache_maps_scores_with_timestamp_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = VideoFeatureProvider(write_cache(Path(tmp), NARRATIVE)).load()
        story = f["video.storytelling"]
        self.assertEqual((story.status, story.value), (SourceStatus.REAL, 7.0))
        self.assertIn("01:05 proof: side by side", story.evidence)
        self.assertIn("arc_type: problem_solution", story.evidence)
        self.assertEqual(score_criterion(criterion("V2"), f, Mode.EVIDENCE).score, 70.0)
        self.assertEqual(score_criterion(criterion("V4"), f, Mode.EVIDENCE).score, 65.0)
        # Non-numeric score is rejected, not coerced.
        self.assertEqual(f["video.shareability"].status, SourceStatus.MISSING)
        self.assertIn("invalid score", f["video.shareability"].evidence[0])

    def test_missing_video_file_makes_pacing_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = VideoFeatureProvider(write_cache(Path(tmp), video_file=str(Path(tmp) / "nope.mp4"))).load()
        self.assertEqual(f["video.pacing_avg_shot_sec"].status, SourceStatus.MISSING)
        self.assertIsNone(score_criterion(criterion("V3"), f, Mode.SIMULATION).score)


class PacingTest(unittest.TestCase):
    def test_pacing_score_band(self):
        self.assertEqual(rubric.pacing_score(2.0), 100.0)
        self.assertEqual(rubric.pacing_score(rubric.PACING_SLOW_SEC), 0.0)
        self.assertEqual(rubric.pacing_score(0.3), 0.0)
        self.assertAlmostEqual(rubric.pacing_score(1.0), 50.0)
        self.assertAlmostEqual(rubric.pacing_score(5.5), 50.0)

    def test_detect_cuts_applies_threshold_and_min_shot(self):
        d = [(1.0, 0.9), (1.2, 0.9), (2.0, 0.2), (3.0, 0.6), (5.9, 0.9)]
        self.assertEqual(pacing.detect_cuts(d, duration=6.0), [1.0, 3.0])
        s = pacing.summarize([1.0, 3.0], 6.0)
        self.assertEqual((s["shot_count"], s["avg_shot_sec"], s["cuts_per_10s"]), (3, 2.0, 3.33))

    def test_synthetic_video_end_to_end_and_cached(self):
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / "clip.avi"
            write_video(video, [(0, 0, 255), (255, 0, 0), (0, 255, 0)])
            result = pacing.analyze_pacing(video, Path(tmp))
            self.assertEqual(result["shot_count"], 3)
            self.assertEqual([round(t) for t in result["cut_timestamps_sec"]], [2, 4])
            self.assertTrue(pacing.cache_path(video, Path(tmp)).exists())
            with mock.patch.object(pacing, "frame_distances", side_effect=AssertionError("re-decoded")):
                self.assertEqual(pacing.analyze_pacing(video, Path(tmp)), result)
            f = VideoFeatureProvider(write_cache(Path(tmp), video_file=str(video))).load()
        self.assertEqual(f["video.pacing_shot_count"].source, "opencv")
        # REAL pacing still scores in evidence mode.
        self.assertEqual(score_criterion(criterion("V3"), f, Mode.EVIDENCE).score, 100.0)


OPENING_EVIDENCE = {"decision_evidence": {
    "product_visibility": {"first_clear_sec": 1.0, "share_of_frames": 0.5},
    "on_screen_text": [{"timestamp_sec": 3.0, "text": "later"}, {"timestamp_sec": 0.5, "text": "Sale 50%"},
                       {"timestamp_sec": 0.0, "text": "  "}],
}}


class OpeningFeaturesTest(unittest.TestCase):
    def test_old_cache_leaves_opening_features_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = VideoFeatureProvider(write_cache(Path(tmp))).load()
        self.assertEqual(f["video.product_first_clear_sec"].status, SourceStatus.MISSING)
        self.assertEqual(f["video.transcript_segments"].status, SourceStatus.MISSING)
        self.assertIn("video.transcript_segments", f["video.opening_signals"].evidence[0])

    def test_synthetic_video_onsets_with_timestamps(self):
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / "clip.avi"
            write_video(video, [(0, 0, 255), (255, 0, 0), (0, 255, 0)])  # cuts at ~2 s and ~4 s
            path = write_cache(Path(tmp), OPENING_EVIDENCE, video_file=str(video))
            raw = json.loads(path.read_text(encoding="utf-8"))
            raw["transcript_segments"] = [{"start": 0.4, "end": 2.0, "text": "Chào cả nhà"}]
            path.write_text(json.dumps(raw), encoding="utf-8")
            f = VideoFeatureProvider(path).load()
        first_clear = f["video.product_first_clear_sec"]
        self.assertEqual((first_clear.value, first_clear.status), (1.0, SourceStatus.REAL))
        self.assertEqual(first_clear.evidence[0], "00:01 product first clearly visible (1 s, VLM on sampled frames)")
        signals = f["video.opening_signals"]
        self.assertEqual(signals.status, SourceStatus.INFERRED)
        self.assertEqual((signals.value["speech_sec"], signals.value["text_sec"]), (0.4, 0.5))  # blank text skipped
        self.assertEqual(round(signals.value["cut_sec"]), 2)
        self.assertEqual(signals.evidence[:2], ["00:00 first speech: Chào cả nhà", "00:00 first on-screen text: Sale 50%"])
        self.assertTrue(signals.evidence[2].startswith("00:02 first hard cut"))

    def test_observed_absence_is_none_not_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / "clip.avi"
            write_video(video, [(0, 0, 255)], sec_each=4.0)  # one shot, no cut
            evidence = {"decision_evidence": {"product_visibility": {"first_clear_sec": None}, "on_screen_text": []}}
            path = write_cache(Path(tmp), evidence, video_file=str(video))
            raw = json.loads(path.read_text(encoding="utf-8"))
            raw["transcript_segments"] = []
            path.write_text(json.dumps(raw), encoding="utf-8")
            f = VideoFeatureProvider(path).load()
        self.assertEqual(f["video.opening_signals"].value, {"speech_sec": None, "text_sec": None, "cut_sec": None})
        self.assertEqual(f["video.product_first_clear_sec"].status, SourceStatus.MISSING)  # null is not "never"


VERDICTS = json.dumps({"claims": [
    {"claim": "a", "verdict": "supported", "listing_evidence": "Niacinamide"},
    {"claim": "b", "verdict": "not_in_listing", "listing_evidence": ""},
    {"claim": "c", "verdict": "contradicts", "listing_evidence": "100g"},
    {"claim": "d", "verdict": "supported", "listing_evidence": "Soap"},
]})


def claim_inputs(title=None):
    return {"video.key_claims": real(["a", "b", "c", "d"]),
            "sku.title": title or real("TeaShell Niacinamide Soap 100g"),
            "sku.sku_id": real("SKU/1")}


class ClaimsTest(unittest.TestCase):
    def test_scores_from_verdicts_and_reuses_cache(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = StubClient(VERDICTS)
            out = claims.claims_features(claim_inputs(), "clip", Path(tmp), client)[claims.FEATURE]
            self.assertEqual((out.status, out.value), (SourceStatus.INFERRED, 62.5))
            self.assertEqual(out.input_sources, ["video.key_claims", "sku.title"])
            self.assertFalse(out.mock_dependency)
            self.assertIn("contradicts: c", out.evidence)
            self.assertTrue((Path(tmp) / "clip.claims.SKU_1.json").exists())
            again = claims.claims_features(claim_inputs(), "clip", Path(tmp), None)[claims.FEATURE]
            self.assertEqual((again.value, client.calls), (62.5, 1))
            changed = claim_inputs(real("Another listing"))
            stale = claims.claims_features(changed, "clip", Path(tmp), None)[claims.FEATURE]
            self.assertEqual(stale.status, SourceStatus.MISSING)
            self.assertIn("stale cache", stale.evidence[0])

    def test_no_cache_and_no_client_is_missing_without_call(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = claims.claims_features(claim_inputs(), "clip", Path(tmp))[claims.FEATURE]
            self.assertEqual(out.status, SourceStatus.MISSING)
            self.assertIn("live LLM call", out.evidence[0])
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_missing_inputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            no_claims = {**claim_inputs(), "video.key_claims": Feature.missing("x")}
            no_title = {k: v for k, v in claim_inputs().items() if k != "sku.title"}
            for feats in (no_claims, no_title):
                out = claims.claims_features(feats, "clip", Path(tmp), StubClient(VERDICTS))[claims.FEATURE]
                self.assertEqual(out.status, SourceStatus.MISSING)

    def test_invalid_llm_output_is_missing_and_not_cached(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = StubClient(json.dumps({"claims": [{"claim": "a", "verdict": "maybe"}]}))
            out = claims.claims_features(claim_inputs(), "clip", Path(tmp), bad)[claims.FEATURE]
            self.assertEqual(out.status, SourceStatus.MISSING)
            self.assertIn("failed", out.evidence[0])
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_mock_listing_is_refused_in_evidence_mode(self):
        with tempfile.TemporaryDirectory() as tmp:
            feats = claim_inputs(mock_f("TeaShell Niacinamide Soap 100g"))
            feats.update(claims.claims_features(feats, "clip", Path(tmp), StubClient(VERDICTS)))
        self.assertTrue(feats[claims.FEATURE].mock_dependency)
        self.assertEqual(score_criterion(criterion("C3"), feats, Mode.SIMULATION).score, 62.5)
        self.assertIsNone(score_criterion(criterion("C3"), feats, Mode.EVIDENCE).score)


if __name__ == "__main__":
    unittest.main()
