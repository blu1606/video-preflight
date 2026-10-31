"""Run: uv run python -m unittest discover -s tests (from the demo dir). No API calls: the client is a stub."""

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from core.policy_check import Outcome, load_baseline, policy_features
from core.schema import Feature, Mode, SourceStatus
from sources import policy_reviewer as pr


def real(v):
    return Feature(v, SourceStatus.REAL, "test")


def mock(v):
    return Feature(v, SourceStatus.MOCK, "fixture")


FEATURES = {
    "video.transcript_segments": real([
        {"start": 0.0, "end": 3.5, "text": "Tao mua về tắm xong trắng, mẹ tao  với mấy bà hàng xóm không nhận ra luôn"},
        {"start": 3.5, "end": 7.2, "text": "Mới dùng 3 lần mà trắng cỡ này"},
        "not a segment",  # malformed rows are skipped
    ]),
    "video.on_screen_text": real([{"timestamp_sec": 1.0, "text": "Hiệu quả tùy vào cơ địa mỗi người"}]),
    "video.key_claims": real(["da trắng hơn sau khi tắm"]),
    "sku.description": mock("Liên hệ zalo 0912345678"),
}


class StubClient:
    def __init__(self, rules=None, content=None, fail=False):
        self.calls = 0
        self.rules, self.content, self.fail = rules or [], content, fail
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **request):
        self.calls += 1
        self.request = request
        if self.fail:
            raise TimeoutError("reviewer timeout")
        content = self.content if self.content is not None else json.dumps({"rules": self.rules}, ensure_ascii=False)
        usage = SimpleNamespace(model_dump=lambda: {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15})
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))], usage=usage)


def rules(*ids):
    return [r for r in load_baseline()["rules"] if r["rule_id"] in ids]


class QuoteVerificationTest(unittest.TestCase):
    def setUp(self):
        evidence, _ = pr.build_evidence(FEATURES, Mode.SIMULATION)
        self.sources = pr.quote_sources(evidence)

    def test_verbatim_quote_takes_the_source_time(self):
        q = pr.verify_quote({"text": "MẸ TAO với mấy bà hàng xóm không nhận ra", "t": 30}, self.sources)
        self.assertEqual((q["t"], q["where"]), (0.0, "transcript"))
        q = pr.verify_quote({"text": "«Hiệu quả tùy vào cơ địa»", "t": None}, self.sources)
        self.assertEqual((q["t"], q["where"]), (1.0, "on_screen_text"))

    def test_paraphrase_single_word_and_garbage_are_dropped(self):
        for quote in ({"text": "mẹ tôi không nhận ra tôi"}, {"text": "trắng"}, "text only", {"t": 1}):
            with self.subTest(quote=quote):
                self.assertIsNone(pr.verify_quote(quote, self.sources))

    def test_quote_across_segments_starts_in_the_first(self):
        q = pr.verify_quote({"text": "nhận ra luôn Mới dùng 3 lần"}, self.sources)
        self.assertEqual(q["t"], 0.0)

    def test_listing_text_is_quotable_without_time(self):
        q = pr.verify_quote({"text": "liên hệ zalo"}, self.sources)
        self.assertEqual((q["t"], q["where"]), (None, "sku.description"))

    def test_evidence_mode_never_sends_mock_inputs(self):
        evidence, used = pr.build_evidence(FEATURES, Mode.EVIDENCE)
        self.assertEqual(evidence["listing"], {})
        self.assertNotIn("sku.description", used)
        self.assertEqual(len(evidence["transcript"]), 2)

    def test_transcript_without_segments_falls_back_to_full_text(self):
        evidence, _ = pr.build_evidence({"video.transcript": real("dùng 1 lần mà trắng")}, Mode.EVIDENCE)
        self.assertEqual(evidence["transcript"], [{"text": "dùng 1 lần mà trắng", "t": None}])


class ParseReviewTest(unittest.TestCase):
    def setUp(self):
        evidence, _ = pr.build_evidence(FEATURES, Mode.EVIDENCE)
        self.sources = pr.quote_sources(evidence)

    def parse(self, rows, ids=("TTA-001", "TTS-002")):
        return pr.parse_review(json.dumps({"rules": rows}, ensure_ascii=False), list(ids), self.sources)

    def test_needs_review_without_valid_quote_is_downgraded(self):
        out = self.parse([{"rule_id": "TTA-001", "outcome": "needs_review", "confidence": 0.9,
                           "quotes": [{"text": "trắng sáng sau 7 ngày", "t": 2}]}])
        a = out["TTA-001"]
        self.assertEqual((a["outcome"], a["model_outcome"], a["downgraded"]), ("unknown", "needs_review", True))
        self.assertEqual(a["dropped_quotes"], ["trắng sáng sau 7 ngày"])

    def test_valid_and_invalid_quotes_are_split(self):
        out = self.parse([{"rule_id": "TTA-001", "outcome": "needs_review", "confidence": 0.8, "rationale": "r",
                           "quotes": [{"text": "Mới dùng 3 lần mà trắng", "t": 4}, {"text": "bịa ra"}]}])
        a = out["TTA-001"]
        self.assertEqual(a["outcome"], "needs_review")
        self.assertEqual(a["quotes"], [{"text": "Mới dùng 3 lần mà trắng", "t": 3.5, "where": "transcript"}])
        self.assertEqual(a["dropped_quotes"], ["bịa ra"])

    def test_unknown_rules_and_outcomes_are_ignored_or_unknown(self):
        out = self.parse([{"rule_id": "XXX-1", "outcome": "needs_review"},
                          {"rule_id": "TTS-002", "outcome": "approved", "quotes": "nope", "confidence": True}])
        self.assertEqual(set(out), {"TTS-002"})
        self.assertEqual((out["TTS-002"]["outcome"], out["TTS-002"]["confidence"]), ("unknown", None))

    def test_unusable_json_raises(self):
        for content in ("not json", json.dumps({"rules": "x"}), json.dumps({"rules": []})):
            with self.subTest(content=content), self.assertRaises(ValueError):
                pr.parse_review(content, ["TTA-001"], self.sources)


class ReviewCacheTest(unittest.TestCase):
    ANSWER = [{"rule_id": "TTA-001", "outcome": "needs_review", "confidence": 0.8, "rationale": "r",
               "quotes": [{"text": "Mới dùng 3 lần mà trắng cỡ này", "t": 3.5}]}]

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def run_review(self, client):
        return pr.review(rules("TTA-001"), FEATURES, Mode.EVIDENCE, client, self.cache)

    def test_live_call_then_cache(self):
        client = StubClient(self.ANSWER)
        first, again = self.run_review(client), self.run_review(client)
        self.assertEqual((first["status"], again["status"], client.calls), ("live call", "cache", 1))
        self.assertEqual(again["rules"]["TTA-001"]["outcome"], "needs_review")
        self.assertEqual(again["usage"]["total_tokens"], 15)
        self.assertEqual(self.run_review(None)["status"], "cache")  # no client: the cache still answers
        sent = json.loads(client.request["messages"][1]["content"])
        self.assertEqual([r["rule_id"] for r in sent["rules"]], ["TTA-001"])
        self.assertIn("source_url", sent["rules"][0])

    def test_no_client_no_cache_is_not_run(self):
        out = self.run_review(None)
        self.assertEqual((out["status"], out["rules"]), ("not_run", {}))

    def test_failures_are_not_cached(self):
        for client in (StubClient(fail=True), StubClient(content="garbage")):
            with self.subTest(client=client):
                self.assertEqual(self.run_review(client)["status"], "failed")
        self.assertEqual(list(self.cache.iterdir()), [])

    def test_damaged_cache_is_a_miss(self):
        key = self.run_review(None)["cache_key"]
        for damaged in ("{not json", json.dumps({"rules": {"TTA-001": {"outcome": "approved", "quotes": []}}})):
            with self.subTest(damaged=damaged):
                (self.cache / f"{key}.json").write_text(damaged, encoding="utf-8")
                self.assertEqual(self.run_review(None)["status"], "not_run")
        client = StubClient(self.ANSWER)
        self.assertEqual(self.run_review(client)["status"], "live call")  # overwritten with a usable answer

    def test_evidence_change_changes_the_key(self):
        a = self.run_review(None)["cache_key"]
        b = pr.review(rules("TTA-001"), {**FEATURES, "video.key_claims": real(["khác"])}, Mode.EVIDENCE, None,
                      self.cache)["cache_key"]
        self.assertNotEqual(a, b)


class PolicyFeaturesWithReviewerTest(unittest.TestCase):
    def test_one_batched_call_adds_but_never_clears(self):
        answers = [
            # detector already fires on the VLM quote; the reviewer disagrees -> stays needs_review + conflict
            {"rule_id": "TTA-001", "outcome": "not_triggered", "confidence": 0.6, "rationale": "nói vui", "quotes": []},
            # no detector signal; the reviewer adds a finding with a verbatim on-screen quote
            {"rule_id": "TTC-001", "outcome": "needs_review", "confidence": 0.7, "rationale": "r",
             "quotes": [{"text": "Hiệu quả tùy vào cơ địa", "t": 1}]},
        ]
        features = {**FEATURES,
                    "video.policy_absolute_claims": real([{"text": "Mới dùng 3 lần mà trắng cỡ này",
                                                           "timestamp_sec": 3.5, "channel": "spoken"}]),
                    "video.policy_realistic_ai_media": real({"present": False})}
        client = StubClient(answers)
        with tempfile.TemporaryDirectory() as tmp:
            out = policy_features(features, Mode.EVIDENCE, ("tiktok_ads",), client=client, cache_dir=Path(tmp))
        self.assertEqual(client.calls, 1)
        report = out["policy.findings"].value
        self.assertEqual(report["reviewer"]["status"], "live call")
        by_rule = {f["rule_id"]: f for f in report["targets"]["tiktok_ads"]["findings"]}
        self.assertEqual(by_rule["TTA-001"]["outcome"], Outcome.NEEDS_REVIEW)
        self.assertEqual(by_rule["TTA-001"]["conflicts"][0]["source"], "agent")
        self.assertEqual((by_rule["TTC-001"]["outcome"], by_rule["TTC-001"]["sources"]),
                         (Outcome.NEEDS_REVIEW, ["agent"]))
        self.assertEqual(by_rule["TTC-001"]["quotes"], [{"text": "Hiệu quả tùy vào cơ địa", "t": 1.0}])
        self.assertIn("policy.applicable_rules", out)


if __name__ == "__main__":
    unittest.main()
