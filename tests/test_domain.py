import unittest

from core.evidence import Feature, Status, missing, observed
from core.scoring import aggregate, expected_score


class EvidenceTests(unittest.TestCase):
    def test_missing_cannot_disguise_zero(self):
        with self.assertRaises(ValueError):
            Feature(0, Status.MISSING, "test")
        self.assertIsNone(missing("Chưa có dữ liệu")["value"])

    def test_real_requires_citation(self):
        with self.assertRaises(ValueError):
            Feature(10, Status.REAL, "test")
        self.assertEqual(observed(0, "measurement", [{"file": "test.mp4"}])["value"], 0)


class ScoringTests(unittest.TestCase):
    def setUp(self):
        self.features = {"content": observed("test only", "unit-test", [{"id": "test-source"}])}

    def rows(self, scores=(100, 50, 0)):
        return [{"id": group, "group": group, "score": score, "weight": 1, "inputs": ["content"], "status": "scored"}
                for group, score in zip(("viral", "conversion", "sku"), scores)]

    def test_overall_weights_and_real_zero(self):
        result = aggregate(self.rows(), self.features)
        self.assertEqual(result["overall"], 57.5)
        self.assertEqual(result["groups"][2]["score"], 0)

    def test_missing_group_does_not_become_zero(self):
        result = aggregate(self.rows()[:2], self.features)
        self.assertIsNone(result["overall"])
        self.assertIsNone(result["groups"][2]["score"])

    def test_unknown_and_mock_sources_never_score(self):
        for status in ("MISSING", "MOCK"):
            with self.subTest(status=status):
                result = aggregate(self.rows(), {"content": {"status": status, "value": "test", "evidence": [{"id": "test"}]}})
                self.assertIsNone(result["overall"])
                self.assertEqual(result["coverage"], 0)

    def test_outcomes_and_shop_cannot_leak_into_readiness(self):
        for key in ("performance.views", "shop.rating"):
            rows = [{**r, "inputs": [key]} for r in self.rows()]
            self.assertIsNone(aggregate(rows, {key: self.features["content"]})["overall"])

    def test_incomplete_coverage_and_nan_are_excluded(self):
        rows = self.rows()
        rows[1]["score"] = float("nan")
        result = aggregate(rows, self.features)
        self.assertIsNone(result["groups"][1]["score"])
        self.assertIsNone(result["overall"])

    def test_duplicate_ids_rejected(self):
        with self.assertRaises(ValueError):
            aggregate(self.rows() + self.rows(), self.features)

    def test_probability_weighted_levels(self):
        probs = [{"value": level * 25, "probability": p} for level, p in enumerate((0, .1, .2, .3, .4))]
        self.assertEqual(expected_score(probs), 75)
        probs[0]["probability"] = .5
        with self.assertRaises(ValueError):
            expected_score(probs)


if __name__ == "__main__":
    unittest.main()
