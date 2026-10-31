"""Run: uv run python -m unittest tests.test_progress_and_cache_status (from the repo root).

Streamed step progress, per-step token accounting, the keyframes recorded for Decisions, the cache-status
endpoint and the scoring block of /py/questions. No paid call: fake clients and cached answers only.
"""

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from fastapi.testclient import TestClient

import api
from core.schema import Mode
from core.trace import Trace, tokens_for
from sources import db_client, decision_scorer, extractor
from tests.test_analyze_stream import HAS_CACHE, VIDEO, FakeDb, parse_sse
from tests.test_decision_scorer import VIDEO as DECISION_FEATURES


class Usage:
    def __init__(self, data: dict):
        self.data = data

    def model_dump(self) -> dict:
        return dict(self.data)


class FakeDecisions:
    """client.decisions.create(...) answering every question with a mid score."""

    def __init__(self):
        self.calls = 0
        self.decisions = self

    def create(self, **request):
        self.calls += 1
        answers = [SimpleNamespace(model_dump=lambda: {"type": "score", "score": 1.0, "confidence": 0.8})
                   for _ in request["questions"]]
        return SimpleNamespace(answers=answers, model=decision_scorer.MODEL,
                               usage=Usage({"input_tokens": 900, "output_tokens": 10, "total_tokens": 910,
                                            "input_tokens_details": {"cached_tokens": 100}}))


class TraceProgressTest(unittest.TestCase):
    def test_progress_is_streamed_never_stored(self):
        events = []
        trace = Trace(on_event=lambda e, d: events.append((e, d)))
        with trace.step("work", "tool", "agent"):
            trace.reporter("work")("frames", "Cắt frame", 2, 10, {"fps": 1})
        self.assertEqual([e for e, _ in events], ["step_started", "step_progress", "step_finished"])
        self.assertEqual(events[1][1], {"name": "work", "phase": "frames", "label": "Cắt frame", "done": 2,
                                        "total": 10, "detail": {"fps": 1}})
        self.assertEqual([s["name"] for s in trace.to_json()], ["work"])
        Trace().progress("work", "x", "no listener")  # no-op, no error

    def test_tokens_live_and_cached(self):
        live = tokens_for("live call", {"prompt_tokens": 10, "completion_tokens": 5,
                                        "completion_tokens_details": {"reasoning_tokens": 3}}, "m")
        self.assertEqual(live, {"input": 10, "output": 5, "total": 15, "reasoning": 3, "model": "m",
                                "source": "live call"})
        cached = tokens_for("cache", {"input_tokens": 7, "output_tokens": 1, "total_tokens": 8}, "m")
        self.assertEqual(cached["total"], 0)
        self.assertEqual(cached["cached_cost"], {"input": 7, "output": 1, "total": 8})
        self.assertIsNone(tokens_for("cache", None)["cached_cost"])  # old cache without usage: unknown cost
        self.assertIsNone(tokens_for("not run", None))

    def test_decisions_progress_live_then_cache(self):
        with tempfile.TemporaryDirectory() as tmp:
            events = []
            progress = lambda *a, **k: events.append(a[0])  # noqa: E731
            plan = decision_scorer.plan_request(DECISION_FEATURES, Mode.EVIDENCE, None, ["C03"], Path(tmp))
            client = FakeDecisions()
            out = decision_scorer.answer(plan, DECISION_FEATURES, client, progress)
            self.assertEqual(events, ["sent", "received"])
            self.assertEqual(out["decision.C03"].status.value, "INFERRED")
            again = decision_scorer.plan_request(DECISION_FEATURES, Mode.EVIDENCE, None, ["C03"], Path(tmp))
            self.assertTrue(again.cached)
            decision_scorer.answer(again, DECISION_FEATURES, None, progress)
            self.assertEqual(events[-1], "cache")
            self.assertEqual(client.calls, 1)
            usage = json.loads(again.cache.read_text(encoding="utf-8"))["usage"]
            self.assertEqual(tokens_for("live call", usage)["cached"], 100)

    def test_extraction_reports_frames_whisper_vlm(self):
        def frames(video, on_frame=None):
            for i in range(3):
                on_frame(i + 1, 3)
            return 2.5, [{"timestamp_sec": float(i), "base64": ""} for i in range(3)]

        calls = []
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(extractor, "OpenAI"), \
                mock.patch.object(extractor, "extract_frames", side_effect=frames), \
                mock.patch.object(extractor, "save_frames", return_value=["0000.00.jpg"]), \
                mock.patch.object(extractor, "transcribe", return_value=("xin chào", [{"start": 0, "end": 1}])), \
                mock.patch.object(extractor, "analyze", return_value=({}, {"prompt_tokens": 5, "completion_tokens": 2,
                                                                           "total_tokens": 7})), \
                mock.patch.object(extractor, "video_fingerprint", return_value="x"), \
                mock.patch.object(extractor, "CACHE_DIR", Path(tmp)):
            extractor.run_extraction(Path(tmp) / "clip.mp4", "m", on_step=lambda _: None,
                                     on_progress=lambda phase, label, done=None, total=None, detail=None:
                                     calls.append((phase, done, total, detail)))
        self.assertEqual([c[0] for c in calls], ["frames"] * 4 + ["whisper"] * 2 + ["vlm"] * 2)
        self.assertEqual([c[1:3] for c in calls[:3]], [(1, 3), (2, 3), (3, 3)])
        self.assertEqual(calls[5][3]["segments"], 1)
        self.assertEqual(calls[6][3]["frames"], 3)
        self.assertEqual(calls[7][3]["total_tokens"], 7)


class ApiBase(unittest.TestCase):
    def setUp(self):
        self.db = FakeDb()
        for p in (mock.patch.object(db_client, "get", self.db.get), mock.patch.object(db_client, "post", self.db.post)):
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(api.app)


class QuestionsScoringTest(ApiBase):
    def test_scoring_block_comes_from_overall(self):
        body = self.client.get("/py/questions").json()
        self.assertIn("questions", body)
        self.assertEqual(body["scoring"]["group_weights"], api.GROUP_WEIGHTS)
        self.assertEqual(body["scoring"]["thresholds"], api.THRESHOLDS)


class ReferenceTest(ApiBase):
    def test_every_reference_is_served_as_stored(self):
        for name, files in api.REFERENCES.items():
            body = self.client.get(f"/py/reference/{name}").json()
            stored = json.loads((api.FIXTURES_DIR / files[0]).read_text(encoding="utf-8"))
            self.assertEqual({k: body[k] for k in stored}, stored)
            self.assertEqual(body["_file"], " + ".join(f"fixtures/{f}" for f in files))
        sources = self.client.get("/py/reference/policy_sources").json()
        self.assertIn("received_on", sources["provenance"])

    def test_unknown_reference_is_404(self):
        self.assertEqual(self.client.get("/py/reference/db").status_code, 404)

    @unittest.skipUnless(HAS_CACHE, "needs cached TeaShell features")
    def test_features_carry_transcript_segments_and_key_moments(self):
        body = self.client.get(f"/py/videos/{VIDEO}/features").json()
        self.assertTrue(body["transcript_segments"])
        self.assertIn("key_moments", body["features"])


@unittest.skipUnless(HAS_CACHE, "needs cached TeaShell features")
class StreamProgressTest(ApiBase):
    def stream(self, query: str = "extract=never&policy_llm=false") -> list[tuple[str, dict]]:
        return parse_sse(self.client.get(f"/py/videos/{VIDEO}/analyze/stream?{query}").text)

    def assert_inside_step(self, events, name: str) -> list[dict]:
        started = next(i for i, (e, d) in enumerate(events) if e == "step_started" and d["name"] == name)
        finished = next(i for i, (e, d) in enumerate(events) if e == "step_finished" and d["name"] == name)
        progress = [(i, d) for i, (e, d) in enumerate(events) if e == "step_progress" and d["name"] == name]
        self.assertTrue(progress, f"no progress for {name}")
        self.assertTrue(all(started < i < finished for i, _ in progress))
        return [d for _, d in progress]

    def test_cached_run_reports_progress_and_cached_tokens(self):
        events = self.stream()
        self.assertEqual(events[-1][0], "done")
        decisions = self.assert_inside_step(events, "ask_decisions_api")
        self.assertEqual(decisions[0]["phase"], "request")
        self.assertEqual(set(decisions[0]), {"name", "phase", "label", "done", "total", "detail"})
        steps = {d["name"]: d for e, d in events if e == "step_finished"}
        if decisions[-1]["phase"] == "cache":  # cached Decisions answers for this video
            self.assertEqual(steps["ask_decisions_api"]["tokens"]["total"], 0)
            self.assertIn("cached_cost", steps["ask_decisions_api"]["tokens"])
        self.assertIsNone(steps["get_video"]["tokens"])  # no model: no tokens
        saved = {s["name"]: s for s in events[-1][1]["analysis"]["result"]["trace"]}
        self.assertEqual(saved["ask_decisions_api"]["tokens"], steps["ask_decisions_api"]["tokens"])
        self.assertNotIn("step_progress", {s["name"] for s in saved.values()})

    def test_keyframes_recorded_and_served(self):
        done = self.stream()[-1][1]["analysis"]["result"]["decisions"]
        if not done["cache_key"]:
            self.skipTest("no cached Decisions answers for this video")
        self.assertEqual(done["keyframes_scope"], "batch")
        secs = [k["sec"] for k in done["keyframes"]]
        self.assertTrue(secs)
        for k in done["keyframes"]:
            self.assertTrue(k["url"].startswith("/py/frames/keyframes/"))
        res = self.client.get(done["keyframes"][0]["url"])
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers["content-type"], "image/jpeg")
        answered = [q for q in done["questions"] if "answer" in q]
        self.assertTrue(answered)
        self.assertTrue(all(q["keyframes_used"] == secs for q in answered))
        self.assertTrue(all("keyframes_used" not in q for q in done["questions"] if "answer" not in q))

    def test_live_extraction_progress_and_tokens(self):
        cached = extractor.find_cached(api.DATA_DIR / self.db.get(f"/videos/{VIDEO}")["local_file"])

        def fake_extraction(video, model, on_step, on_progress):
            on_progress("frames", "Cắt frame", 1, 2)
            on_progress("vlm", "Gửi frame", detail={"frames": 2})
            return cached  # the existing cache stands in for a fresh extraction

        with mock.patch.object(api, "run_extraction", side_effect=fake_extraction):
            events = self.stream("extract=force&policy_llm=false")
        phases = [d["phase"] for d in self.assert_inside_step(events, "extract_video_content")]
        self.assertEqual(phases[:2], ["frames", "vlm"])
        self.assertIn("pacing", phases)
        step = next(d for e, d in events if e == "step_finished" and d["name"] == "extract_video_content")
        self.assertEqual(step["tokens"]["source"], "live call")
        self.assertGreater(step["tokens"]["total"], 0)
        self.assertNotIn("cached_cost", step["tokens"])


@unittest.skipUnless(HAS_CACHE, "needs cached TeaShell features")
class CacheStatusTest(ApiBase):
    def status(self, video_id: str = VIDEO) -> dict:
        res = self.client.get(f"/py/videos/{video_id}/cache-status?mode=evidence&rubric=v2")
        self.assertEqual(res.status_code, 200)
        return res.json()

    def test_cached_video(self):
        body = self.status()
        self.assertEqual(body["extraction"]["state"], "current")
        d = body["decisions"]
        self.assertGreater(d["eligible"], 0)
        if d["cached"]:
            self.assertEqual(d["answered"], d["eligible"])
            self.assertIsNotNone(d["cache_key"])
        for step in ("policy_review", "insights", "localize"):
            self.assertIn("cached", body[step])
        self.assertEqual(self.db.saved, [])  # nothing saved, nothing paid

    def test_uncached_decisions_make_downstream_unknown(self):
        with mock.patch.object(decision_scorer.RequestPlan, "cached", new_callable=mock.PropertyMock,
                               return_value=False):
            body = self.status()
        self.assertEqual(body["decisions"]["cached"], False)
        self.assertEqual(body["decisions"]["answered"], 0)
        for step in ("insights", "localize"):
            if body[step].get("needed") is False:
                continue
            self.assertIsNone(body[step]["cached"])
            self.assertIn("decisions", body[step]["depends_on"])
            self.assertTrue(body[step]["reason"])

    def test_video_never_extracted(self):
        self.db.data["videos"].append({"id": "UPL-test", "shop_id": None, "sku_id": None,
                                       "local_file": "upl-never-extracted.mp4"})
        body = self.status("UPL-test")
        self.assertEqual(body["extraction"]["state"], "missing")
        self.assertIsNone(body["decisions"]["cached"])
        self.assertIsNone(body["localize"]["cached"])
        self.assertTrue(body["insights"]["reason"])

    def test_unknown_video_is_404(self):
        self.assertEqual(self.client.get("/py/videos/NOPE/cache-status").status_code, 404)


if __name__ == "__main__":
    unittest.main()
