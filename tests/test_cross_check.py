"""Run: uv run python -m unittest discover tests (from video_understanding/demo)."""

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from core.schema import Feature, Mode, SourceStatus
from sources import cross_check as cc
from sources.decision_scorer import questions_by_id


def mock(v):
    return Feature(v, SourceStatus.MOCK, "seed")


class StubClient:
    def __init__(self, level):
        self.calls = 0
        self.level = level
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **_):
        self.calls += 1
        content = json.dumps({"level": self.level, "rationale": "ok", "key_evidence": ["1.3%"]})
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


SHOP = {"shop.late_shipment_rate": mock(0.02), "shop.cancellation_rate": mock(0.013),
        "shop.return_rate": mock(0.019)}
H02 = {"id": "H02", "dimension": "fulfillment_health", "type": "score", "status": "INFERRED", "value": 22.2,
       "instructions": "How strong are fulfillment outcomes?", "inputs": list(SHOP),
       "levels": [{"label": f"{i}", "description": ""} for i in range(5)]}


class CrossCheckTest(unittest.TestCase):
    def test_rule_map_points_at_real_criteria_and_questions(self):
        bank = questions_by_id()
        for qid, rules in cc.RULES.items():
            self.assertIn(qid, bank)
            for rubric_set, cid in rules:
                cc._criterion(rubric_set, cid)  # raises StopIteration if the id does not exist

    def test_humanize_units(self):
        self.assertEqual(cc.humanize("shop.cancellation_rate", 0.0129), "1.3%")
        self.assertEqual(cc.humanize("sku.price_vnd", 46550), "46,550 VND")
        self.assertTrue(cc.humanize("shop.roas", 8.09).startswith("8.09x"))
        self.assertEqual(cc.humanize("shop.rating", 4.9), 4.9)

    def test_verdict(self):
        self.assertEqual(cc.verdict(20, [90, None]), "conflict")
        self.assertEqual(cc.verdict(20, [30]), "agree")
        self.assertEqual(cc.verdict(20, [None]), "unverified")

    def test_low_answer_gets_rules_and_cached_agent(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = StubClient(level=4)
            evidence = cc.agent_evidence(H02, SHOP)
            first = cc.agent_check(client, H02, evidence, "vid", Path(tmp))
            again = cc.agent_check(client, H02, evidence, "vid", Path(tmp))
            self.assertEqual((first["score"], first["source"], again["source"], client.calls), (100.0, "live call", "cache", 1))
        result = cc.cross_check(SHOP, Mode.SIMULATION, [H02], "vid", client=None)
        self.assertEqual(result[0]["agent"]["status"], "not_run")  # no client, no cache: never calls implicitly
        self.assertGreater(result[0]["rule"]["score"], 80)
        self.assertEqual(result[0]["verdict"], "conflict")

    def test_high_answers_are_not_checked(self):
        self.assertEqual(cc.cross_check(SHOP, Mode.SIMULATION, [{**H02, "value": 80}], "vid"), [])


if __name__ == "__main__":
    unittest.main()
