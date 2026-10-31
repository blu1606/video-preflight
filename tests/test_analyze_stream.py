"""Run: uv run python -m unittest tests.test_analyze_stream (from video_understanding/demo).

json-server is replaced by an in-memory copy of db/db.json, so no server and no paid call is needed
(extract=never, cached Decisions answers, localize off).
"""

import copy
import json
import time
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

import api
from sources import db_client

DEMO = Path(__file__).resolve().parents[1]
DB = json.loads((DEMO / "db" / "db.json").read_text(encoding="utf-8"))
VIDEO = "SHOP001-VID01"
HAS_CACHE = (DEMO / "output" / "features" / "vn-beauty-467796.json").exists()


class FakeDb:
    def __init__(self):
        self.data = copy.deepcopy(DB)
        self.saved = []

    def get(self, path: str, **params):
        parts = path.strip("/").split("/")
        rows = self.data.get(parts[0])
        if rows is None:
            raise db_client.NotFound(path)
        if len(parts) == 1:
            return rows
        row = next((r for r in rows if str(r.get("id")) == parts[1]), None)
        if row is None:
            raise db_client.NotFound(path)
        return row

    def post(self, path: str, body: dict) -> dict:
        record = {**body, "id": len(self.saved) + 1}
        self.saved.append(record)
        return json.loads(json.dumps(record, default=str))


def parse_sse(text: str) -> list[tuple[str, dict]]:
    events = []
    for block in text.split("\n\n"):
        lines = [line for line in block.splitlines() if not line.startswith(":")]
        if not lines:
            continue
        event = next(line[7:] for line in lines if line.startswith("event: "))
        data = json.loads(next(line[6:] for line in lines if line.startswith("data: ")))
        events.append((event, data))
    return events


@unittest.skipUnless(HAS_CACHE, "needs cached TeaShell features")
class AnalyzeStreamTest(unittest.TestCase):
    def setUp(self):
        self.db = FakeDb()
        patches = [mock.patch.object(db_client, "get", self.db.get), mock.patch.object(db_client, "post", self.db.post)]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(api.app)

    def stream(self, video_id: str = VIDEO) -> list[tuple[str, dict]]:
        res = self.client.get(f"/py/videos/{video_id}/analyze/stream?extract=never&policy_llm=false")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.headers["content-type"].startswith("text/event-stream"))
        return parse_sse(res.text)

    def test_every_step_starts_and_finishes_then_done(self):
        events = self.stream()
        names = [e for e, _ in events]
        self.assertEqual(names[-1], "done")
        started = [d["name"] for e, d in events if e == "step_started"]
        finished = [d["name"] for e, d in events if e == "step_finished"]
        self.assertEqual(sorted(started), sorted(finished))
        for stage in ("get_video", "check_policy", "ask_decisions_api", "score_rubric", "localize_issues",
                      "compose_verdict", "summarize_insights"):
            self.assertIn(stage, finished)
        self.assertLess(finished.index("check_policy"), finished.index("score_rubric"))
        policy = next(d for e, d in events if e == "step_finished" and d["name"] == "check_policy")
        self.assertIn("targets", policy["output"])

    def test_done_matches_post_and_carries_markers(self):
        done = self.stream()[-1][1]["analysis"]
        posted = self.client.post(f"/py/videos/{VIDEO}/analyze?extract=never&policy_llm=false").json()
        self.assertEqual([(g["name"], g["score"]) for g in done["result"]["scores"]],
                         [(g["name"], g["score"]) for g in posted["result"]["scores"]])
        rules = {m["source"]["ref"] for m in done["result"]["markers"] if m["lane"] == "policy"}
        self.assertIn("TTA-001", rules)
        self.assertEqual(len(self.db.saved), 2)  # the streamed run is saved like the posted one

    def test_failing_localize_step_never_fails_the_run(self):
        with mock.patch.object(api.localizer, "localize", side_effect=RuntimeError("boom")):
            events = self.stream()
        self.assertEqual(events[-1][0], "done")
        step = next(d for e, d in events if e == "step_finished" and d["name"] == "localize_issues")
        self.assertEqual(step["status"], "error")
        self.assertTrue(events[-1][1]["analysis"]["result"]["markers"])

    def test_failing_insights_step_never_fails_the_run(self):
        with mock.patch.object(api.insight_writer, "summarize", side_effect=RuntimeError("boom")):
            events = self.stream()
        self.assertEqual(events[-1][0], "done")
        step = next(d for e, d in events if e == "step_finished" and d["name"] == "summarize_insights")
        self.assertEqual(step["status"], "error")
        self.assertIsNone(events[-1][1]["analysis"]["result"]["insights"])

    def test_client_leaving_mid_stream_still_saves_the_run(self):
        with self.client.stream("GET", f"/py/videos/{VIDEO}/analyze/stream?extract=never&policy_llm=false") as res:
            first = next(line for line in res.iter_lines() if line.startswith("event: "))
        self.assertEqual(first, "event: step_started")
        for _ in range(200):  # the worker thread finishes on its own
            if self.db.saved:
                break
            time.sleep(0.05)
        self.assertEqual(len(self.db.saved), 1)

    def test_unknown_video_ends_with_error_event(self):
        events = self.stream("NOPE-VID")
        self.assertEqual(events[-1][0], "error")
        self.assertEqual(events[-1][1]["status"], 404)


if __name__ == "__main__":
    unittest.main()
