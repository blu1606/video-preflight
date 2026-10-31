import json
import tempfile
import unittest
from pathlib import Path

from core.datasets import inventory, question_bank, read_dataset
from core.decisions import plan
from core.evidence import observed

ROOT = Path(__file__).resolve().parents[1]


class DatasetTests(unittest.TestCase):
    def test_imported_bank_keeps_all_39_questions_and_distinct_types(self):
        bank = question_bank(ROOT)
        self.assertEqual(len(bank["questions"]), 39)
        self.assertEqual(sum(q["question"]["type"] == "score" for q in bank["questions"]), 28)
        self.assertEqual(len(read_dataset(ROOT, "policy")["items"]), 16)

    def test_reference_data_keeps_source_status_and_provenance(self):
        data = read_dataset(ROOT, "shops")
        self.assertEqual(data["total"], 9)
        self.assertEqual(data["status"], "MOCK")
        self.assertEqual(data["items"][0]["source_status"], "MOCK")
        self.assertIn("sha256", data)
        self.assertEqual(len(inventory(ROOT)), 9)

    def test_empty_clone_without_optional_data_is_supported(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertIsNone(question_bank(folder))
            self.assertEqual(read_dataset(folder, "decisions")["status"], "missing")

    def test_no_evidence_means_no_submission(self):
        result = plan(question_bank(ROOT), {})
        self.assertEqual(len(result["questions"]), 39)
        self.assertEqual(result["eligible"], 0)
        self.assertEqual(result["request_preview"]["questions"], [])

    def test_mock_evidence_and_outcomes_do_not_enter_request(self):
        bank = question_bank(ROOT)
        all_keys = {key for q in bank["questions"] for key in q["required_features"]}
        features = {key: {"status": "MOCK", "value": 99, "evidence": [{"id": "test"}]} for key in all_keys}
        self.assertEqual(plan(bank, features)["eligible"], 0)
        features = {key: observed("test evidence", "unit-test", [{"id": "test"}]) for key in all_keys}
        features["performance.views"] = observed(999999, "unit-test", [{"id": "test-outcome"}])
        result = plan(bank, features)
        self.assertGreater(result["eligible"], 0)
        payload = json.loads(result["request_preview"]["input"])["features"]
        self.assertFalse(any(k.startswith(("performance.", "shop.")) for k in payload))
        self.assertNotIn("999999", result["request_preview"]["input"])


if __name__ == "__main__":
    unittest.main()
