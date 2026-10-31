"""Run: uv run python -m unittest discover tests (from video_understanding/demo)."""

import unittest
from dataclasses import asdict

from core.overall import GROUP_WEIGHTS, THRESHOLDS, label_for, overall, policy_gate
from core.schema import GroupScore


def group(name, score, coverage=1.0, mock=False) -> GroupScore:
    return GroupScore(name, score, coverage if score is not None else 0.0, mock, [])


def finding(rule_id, outcome="needs_review", severity="high", counted=True, **extra) -> dict:
    return {"rule_id": rule_id, "outcome": outcome, "severity": severity, "counted": counted,
            "summary": f"summary {rule_id}", "evidence": [], **extra}


def policy(**targets) -> dict:
    return {"baseline_version": "0.1", "targets": {
        name: {"verdict": verdict, "score": None, "findings": findings} for name, (verdict, findings) in targets.items()}}


# shop_health is context and post_publish_performance is measured after posting: both are shown, neither counted.
FULL = [group("viral_potential", 60), group("conversion_potential", 80), group("sku_market", 50),
        group("shop_health", 90), group("post_publish_performance", 30)]


class OverallScoreTest(unittest.TestCase):
    def test_weighted_mean_of_the_three_pre_publish_groups(self):
        out = overall(FULL, None)
        expected = 0.35 * 60 + 0.45 * 80 + 0.20 * 50
        self.assertAlmostEqual(out["score"], round(expected, 1))
        self.assertEqual(out["label"], "fix")
        self.assertEqual(out["label_vi"], "Sửa rồi đăng")
        self.assertEqual(out["groups_used"], list(GROUP_WEIGHTS))
        self.assertEqual(out["missing_groups"], [])
        self.assertEqual(out["coverage"], 1.0)
        self.assertEqual(out["weights"], GROUP_WEIGHTS)
        self.assertEqual(out["thresholds"], THRESHOLDS)
        self.assertNotIn("simulated", out)

    def test_shop_health_and_post_publish_never_move_the_score(self):
        base = overall(FULL[:3], None)["score"]
        self.assertEqual(overall([*FULL[:3], group("shop_health", 0)], None)["score"], base)
        self.assertEqual(overall([*FULL[:3], group("shop_health", 100)], None)["score"], base)
        self.assertEqual(overall([*FULL[:3], group("post_publish_performance", 0)], None)["score"], base)
        self.assertEqual(overall([*FULL[:3], group("post_publish_performance", 100)], None)["score"], base)

    def test_missing_group_is_left_out_not_scored_zero(self):
        scores = [FULL[0], FULL[1], group("sku_market", None)]
        out = overall(scores, None)
        expected = (0.35 * 60 + 0.45 * 80) / 0.80
        self.assertAlmostEqual(out["score"], round(expected, 1))
        self.assertEqual(out["missing_groups"], ["sku_market"])
        self.assertEqual(out["coverage"], 0.8)  # the unscored group adds 0 coverage
        self.assertTrue(any("Sản phẩm & thị trường" in w for w in out["warnings"]))
        self.assertIsNotNone(out["label"])  # always a label when any group is scored

    def test_group_absent_from_rubric_counts_as_missing(self):
        out = overall(FULL[:2], None)  # v1 rubric has no sku_market group
        self.assertEqual(out["missing_groups"], ["sku_market"])
        self.assertAlmostEqual(out["coverage"], 0.8)

    def test_partial_group_coverage_is_weighted(self):
        out = overall([group("viral_potential", 60, 0.5), *FULL[1:3]], None)
        self.assertAlmostEqual(out["coverage"], round(0.35 * 0.5 + 0.45 + 0.20, 2))

    def test_policy_compliance_is_never_averaged(self):
        with_policy = overall([*FULL, group("policy_compliance", 0)], None)
        self.assertEqual(with_policy["score"], overall(FULL, None)["score"])
        self.assertNotIn("policy_compliance", with_policy["groups_used"] + with_policy["missing_groups"])

    def test_no_scored_group(self):
        out = overall([group(n, None) for n in GROUP_WEIGHTS], None)
        self.assertIsNone(out["score"])
        self.assertIsNone(out["label"])
        self.assertEqual(out["coverage"], 0.0)
        self.assertTrue(out["warnings"])

    def test_label_thresholds(self):
        self.assertEqual([label_for(s) for s in (75, 74.9, 50, 49.9)], ["ready", "fix", "fix", "rework"])

    def test_accepts_json_groups(self):
        self.assertEqual(overall([asdict(g) for g in FULL], None)["score"], overall(FULL, None)["score"])


class PolicyGateTest(unittest.TestCase):
    def test_blockers_sorted_by_severity(self):
        p = policy(tiktok_ads=("needs_review", [finding("TTA-001", severity="high", quotes=[{"text": "x", "t": 3}]),
                                                finding("TTC-001", outcome="not_triggered")]),
                   tiktok_shop_video=("needs_review", [finding("TTS-001", severity="critical")]))
        out = overall(FULL, p)
        gate = out["policy_gate"]
        self.assertEqual(gate["status"], "review")
        self.assertEqual([(b["rule_id"], b["target"]) for b in gate["blockers"]],
                         [("TTS-001", "tiktok_shop_video"), ("TTA-001", "tiktok_ads")])
        self.assertEqual(gate["blockers"][1]["quotes"], [{"text": "x", "t": 3}])
        self.assertEqual(set(gate["blockers"][0]), {"rule_id", "target", "severity", "summary", "evidence", "quotes"})
        self.assertEqual(out["score"], overall(FULL, None)["score"])  # the gate never moves the score

    def test_high_blocker_sends_a_high_score_back(self):
        strong = [group("viral_potential", 90), group("conversion_potential", 90), group("sku_market", 90)]
        p = policy(tiktok_shop_video=("needs_review", [finding("TTS-002", severity="high")]))
        out = overall(strong, p)
        self.assertEqual(out["score_label"], "ready")
        self.assertEqual((out["label"], out["label_vi"]), ("policy_review", "Cần xem lại policy"))
        self.assertEqual(out["score"], overall(strong, None)["score"])
        self.assertTrue(any("Policy cần xem lại" in w for w in out["warnings"]))

    def test_medium_blocker_keeps_the_label_below_ready(self):
        strong = [group("viral_potential", 90), group("conversion_potential", 90), group("sku_market", 90)]
        p = policy(shopee_listing=("needs_review", [finding("SHP-003", severity="medium")]))
        self.assertEqual(overall(strong, p)["label"], "fix")
        weak = [group(n, 30) for n in GROUP_WEIGHTS]
        self.assertEqual(overall(weak, p)["label"], "rework")  # already below ready: unchanged

    def test_clear_or_unknown_gate_keeps_the_score_label(self):
        strong = [group("viral_potential", 90), group("conversion_potential", 90), group("sku_market", 90)]
        clear = policy(tiktok_ads=("no_issue_detected", [finding("TTA-001", outcome="not_triggered")]))
        for p in (None, clear):
            out = overall(strong, p)
            self.assertEqual((out["label"], out["score_label"]), ("ready", "ready"))

    def test_no_score_keeps_no_label_even_with_blockers(self):
        p = policy(tiktok_shop_video=("needs_review", [finding("TTS-001", severity="critical")]))
        out = overall([group(n, None) for n in GROUP_WEIGHTS], p)
        self.assertIsNone(out["label"])
        self.assertEqual(out["policy_gate"]["status"], "review")

    def test_uncounted_findings_are_not_blockers(self):
        p = policy(meta_ads=("no_issue_detected", [finding("META-001", counted=False),
                                                   finding("META-002", outcome="not_triggered")]))
        self.assertEqual(policy_gate(p), {"status": "clear", "blockers": []})

    def test_unknown_when_every_target_is_unknown(self):
        p = policy(tiktok_ads=("unknown", [finding("TTA-001", outcome="unknown")]),
                   shopee_listing=("unknown", []))
        self.assertEqual(policy_gate(p)["status"], "unknown")
        self.assertEqual(policy_gate(None)["status"], "unknown")

    def test_never_approved(self):
        for p in (None, policy(tiktok_ads=("no_issue_detected", [finding("TTA-001", outcome="not_triggered")]))):
            self.assertIn(policy_gate(p)["status"], {"review", "clear", "unknown"})


if __name__ == "__main__":
    unittest.main()
