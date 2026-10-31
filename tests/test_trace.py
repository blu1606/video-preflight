"""Run: uv run python -m unittest discover tests (from the repo root)."""

import unittest

from core.schema import Mode
from core.trace import Trace, short
from main import build_report
from tests.fixture_cache import cached_features

FEATURES = cached_features("vn-beauty-467796.features.json")


class TraceTest(unittest.TestCase):
    def test_step_records_timing_and_errors(self):
        t = Trace()
        with t.step("ok_step", "functional", "scorer") as s:
            s.output = {"x": 1}
        with self.assertRaises(ValueError), t.step("bad_step", "tool", "orchestrator"):
            raise ValueError("boom")
        self.assertEqual([s.name for s in t.steps], ["ok_step", "bad_step"])
        self.assertEqual(t.steps[1].status, "error")
        self.assertEqual(t.steps[1].output, {"error": "boom"})

    def test_on_event_reports_start_and_finish(self):
        events = []
        t = Trace(on_event=lambda event, data: events.append((event, data)))
        with t.step("score_rubric", "functional", "scorer", "score_engine") as s:
            s.output = {"viral": 64.6}
        self.assertEqual([e for e, _ in events], ["step_started", "step_finished"])
        self.assertEqual(events[0][1]["tool"], "score_engine")
        self.assertEqual(events[1][1]["output"], {"viral": 64.6})
        self.assertEqual(events[1][1]["status"], "ok")

    def test_short_keeps_small_values(self):
        self.assertEqual(short([1, 2]), [1, 2])
        self.assertTrue(short("x" * 500).endswith("..."))

    def test_build_report_traces_each_stage_without_changing_scores(self):
        t = Trace()
        traced = build_report(FEATURES, Mode.EVIDENCE, rubric="v2", trace=t)
        plain = build_report(FEATURES, Mode.EVIDENCE, rubric="v2")
        names = [s.name for s in t.steps]
        for stage in ("load_video_features", "check_policy", "ask_decisions_api", "score_rubric", "quality_gate"):
            self.assertIn(stage, names)
        self.assertLess(names.index("check_policy"), names.index("score_rubric"))
        self.assertEqual([g.score for g in traced["scores"]], [g.score for g in plain["scores"]])


if __name__ == "__main__":
    unittest.main()
