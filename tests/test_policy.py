import unittest
from pathlib import Path

from core.policy import evaluate, merge_findings, quoted_finding

ROOT = Path(__file__).resolve().parents[1]


class PolicyTests(unittest.TestCase):
    def test_absolute_claim_in_caption_flags_review_without_fabricated_time(self):
        source = {"id": "caption", "kind": "caption", "text": "Hiệu quả 100% chỉ sau một ngày"}
        result = evaluate(ROOT, ["tiktok_ads"], [source])["targets"]["tiktok_ads"]
        self.assertEqual(result["verdict"], "needs_review")
        quote = result["findings"][0]["evidence"][0]
        self.assertIn(quote["quote"], source["text"])
        self.assertIsNone(quote["start_s"])

    def test_no_detector_match_does_not_mean_policy_clear(self):
        source = {"id": "caption", "kind": "caption", "text": "Áo cotton 100%"}
        result = evaluate(ROOT, ["tiktok_ads"], [source])["targets"]["tiktok_ads"]
        self.assertEqual(result["verdict"], "unknown")
        self.assertEqual(result["findings"], [])

    def test_reviewer_cannot_invent_quote_or_timestamp(self):
        source = {"id": "speech-1", "kind": "transcript", "text": "Hiệu quả 100%", "start_s": 2, "end_s": 3}
        candidate = {"rule_id": "test", "summary": "Review", "source_id": "speech-1", "quote": "Hiệu quả 100%", "start_s": 50}
        self.assertEqual(quoted_finding(candidate, [source])["evidence"][0]["start_s"], 2)
        candidate["quote"] = "Invented quote"
        with self.assertRaises(ValueError):
            quoted_finding(candidate, [source])

    def test_reviewer_cannot_remove_rules_and_deduplicates_by_rule(self):
        source = {"id": "caption", "kind": "caption", "text": "Hiệu quả 100%"}
        deterministic = evaluate(ROOT, ["tiktok_ads"], [source])["targets"]["tiktok_ads"]["findings"]
        self.assertEqual(merge_findings(deterministic, [], {"TTA-001"}, [source]), deterministic)
        reviewer = {"rule_id": "TTA-001", "summary": "Review", "source_id": "caption", "quote": source["text"]}
        self.assertEqual(len(merge_findings(deterministic, [reviewer], {"TTA-001"}, [source])), 1)
        reviewer["rule_id"] = "unknown"
        with self.assertRaises(ValueError):
            merge_findings(deterministic, [reviewer], {"TTA-001"}, [source])
