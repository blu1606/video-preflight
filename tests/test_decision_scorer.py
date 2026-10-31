"""Run: uv run python -m unittest discover tests (from the repo root). No API calls: the client is a stub."""

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from core.schema import Feature, Mode, SourceStatus
from sources.decision_scorer import decision_features, eligibility, questions_by_id


def real(v, evidence=None):
    return Feature(v, SourceStatus.REAL, "test", evidence or [])


def mock(v):
    return Feature(v, SourceStatus.MOCK, "fixture")


class _Answer(dict):
    def model_dump(self):
        return dict(self)


class StubClient:
    """Answers every question: score -> level 3 of 4, choice -> first choice, predicate -> 0.8."""

    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail
        self.decisions = SimpleNamespace(create=self.create)

    def create(self, **request):
        self.calls.append(request)
        if self.fail:
            raise TimeoutError("decisions timeout")
        answers = []
        for q in request["questions"]:
            if q["type"] == "score":
                answers.append(_Answer(type="score", name=q["name"], score=3.0, confidence=0.9, probabilities=[]))
            elif q["type"] == "choice":
                answers.append(_Answer(type="choice", name=q["name"], choice=q["choices"][0]["value"],
                                       confidence=0.7, probabilities=[]))
            else:
                answers.append(_Answer(type="predicate", name=q["name"], probability=0.8))
        usage = SimpleNamespace(model_dump=lambda: {"total_tokens": 1})
        return SimpleNamespace(answers=answers, model="gpt-6-luna", usage=usage)


VIDEO = {
    "video.hook_type": real("result_first"),
    "video.hook_verbal": real("tắm xong trắng"),
    "video.key_claims": real(["brighter skin after one use"]),
    "video.demo_present": real(True, ["00:05-00:36"]),
    "video.sensory_details": real(["lather"]),
    "video.before_after_shown": real(True),
    "bench.views": real(2600000),  # outcome: must never be sent
}
HOOK_FRAMES = {"hook": [{"segment": "hook", "sec": 0.5}]}


class EligibilityTest(unittest.TestCase):
    def test_all_required_question_needs_every_feature(self):
        q = questions_by_id()["V01"]  # video.hook + video.opening_evidence (keyframes)
        self.assertFalse(eligibility(q, VIDEO, Mode.EVIDENCE, {})[0])
        self.assertTrue(eligibility(q, VIDEO, Mode.EVIDENCE, HOOK_FRAMES)[0])

    def test_relevant_question_needs_one_feature(self):
        q = questions_by_id()["M01"]  # product_mentions + sku.title + sku.attributes
        self.assertTrue(eligibility(q, {"video.product_name": real("TeaShell soap")}, Mode.EVIDENCE, {})[0])

    def test_evidence_mode_rejects_mock_inputs(self):
        q = questions_by_id()["S01"]  # sku.title, sku.attributes, sku.images
        features = {"listing.title": real("x"), "listing.attributes": mock({"a": 1}), "listing.image_count": mock(5)}
        self.assertTrue(eligibility(q, features, Mode.SIMULATION, {})[0])
        self.assertFalse(eligibility(q, features, Mode.EVIDENCE, {})[0])


class DecisionFeaturesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def run_scorer(self, client, ids=("C03", "P03", "M02", "S03")):
        return decision_features(VIDEO, Mode.EVIDENCE, None, client, list(ids), self.cache)

    def test_scores_normalized_and_non_scores_kept_apart(self):
        client = StubClient()
        out = self.run_scorer(client)
        self.assertEqual(out["decision.C03"].value, 75.0)           # 3 of 4 levels
        self.assertEqual(out["decision.C03"].status, SourceStatus.INFERRED)
        self.assertEqual(out["decision.P03"].value, 0.8)            # predicate probability, not a score
        self.assertIsInstance(out["decision.M02"].value, str)       # choice label
        self.assertEqual(out["decision.S03"].status, SourceStatus.MISSING)  # no listing: never sent
        sent = [q["name"] for q in client.calls[0]["questions"]]
        self.assertNotIn("S03", sent)
        self.assertNotIn("bench.views", str(client.calls[0]["input"]))

    def test_cache_hit_makes_no_second_call(self):
        client = StubClient()
        self.run_scorer(client)
        again = self.run_scorer(client)
        self.assertEqual(len(client.calls), 1)
        self.assertEqual(again["decision.C03"].value, 75.0)

    def test_no_client_and_no_cache_stays_missing(self):
        out = self.run_scorer(None)
        self.assertEqual(out["decision.C03"].status, SourceStatus.MISSING)

    def test_m04_m05_m06_are_never_sent(self):
        features = {**VIDEO, "request.user_query": real("nên đăng không?"),
                    "context.business_constraints": real({"goal": "sales"})}
        client = StubClient()
        out = decision_features(features, Mode.EVIDENCE, None, client, None, self.cache)
        sent = {q["name"] for q in client.calls[0]["questions"]}
        self.assertFalse(sent & {"M04", "M05", "M06"})
        self.assertFalse({"decision.M04", "decision.M05", "decision.M06"} & set(out))
        self.assertIn("M02", sent)

    def test_applicable_rules_make_policy_questions_eligible(self):
        from core.policy_check import applicable_rules_feature
        features = {**VIDEO, "sku.category": real("beauty"), "post.sponsorship": real("own_shop"),
                    "post.disclosure_enabled": real(False)}
        p04 = questions_by_id()["P04"]
        self.assertFalse(eligibility(p04, features, Mode.EVIDENCE, {})[0])
        with_rules = {**features, **applicable_rules_feature(("tiktok_shop_video",))}
        self.assertTrue(eligibility(p04, with_rules, Mode.EVIDENCE, {})[0])
        self.assertTrue(eligibility(questions_by_id()["P01"], with_rules, Mode.EVIDENCE, {})[0])

    def test_failure_returns_missing_instead_of_raising(self):
        out = self.run_scorer(StubClient(fail=True))
        self.assertEqual(out["decision.C03"].status, SourceStatus.MISSING)
        self.assertIn("timeout", out["decision.C03"].evidence[0])


if __name__ == "__main__":
    unittest.main()
