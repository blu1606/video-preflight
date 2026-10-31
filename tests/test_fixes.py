"""Run: uv run python -m unittest discover tests (from video_understanding/demo)."""

import json
import unittest
from string import Formatter

from core.fixes import GAIN_NOTE, MAX_FIXES, SUGGESTION_NOTE, TARGET_SCORE, load_templates, plan_fixes
from core.overall import overall
from core.policy_check import load_baseline
from core.rubric import QUESTION_BANK, RUBRICS_V2
from core.schema import CriterionScore, Feature, GroupScore, Mode, SourceStatus

BANK = json.loads(QUESTION_BANK.read_text(encoding="utf-8"))["questions"]
SCORE_QUESTIONS = [q for q in BANK if q["question"]["type"] == "score"]


def real(value, *evidence) -> Feature:
    return Feature(value, SourceStatus.REAL, "test", list(evidence))


def crit(cid, score, weight=1.0, name=None) -> CriterionScore:
    return CriterionScore(cid, name or cid, weight, score, False, [f"decision.{cid}"] if score is not None else [])


def grp(name, criteria) -> GroupScore:
    scored = [c for c in criteria if c.score is not None]
    w = sum(c.weight for c in scored)
    score = round(sum(c.weight * c.score for c in scored) / w, 1) if w else None
    return GroupScore(name, score, round(w / sum(c.weight for c in criteria), 2), False, criteria)


def conversion_group(c08: float) -> GroupScore:
    """Prepublish conversion group of rubric v2: the ten C questions with their bank weights (sum 10.3)."""
    return grp("conversion_potential", [crit(q["id"], c08 if q["id"] == "C08" else 80.0, float(q["weight"]))
                                        for q in SCORE_QUESTIONS if q["id"].startswith("C")])


OTHER_GROUPS = [grp("viral_potential", [crit("V01", 80.0)]), grp("sku_market", [crit("S01", 80.0)]),
                grp("shop_health", [crit("H01", 80.0)])]


def finding(rule_id, severity="high", evidence=(), counted=True, **extra) -> dict:
    return {"rule_id": rule_id, "outcome": "needs_review", "severity": severity, "counted": counted,
            "summary": rule_id, "evidence": list(evidence), "source_url": f"https://example.test/{rule_id}", **extra}


def policy(**targets) -> dict:
    return {"targets": {t: {"verdict": "needs_review", "score": 70.0, "findings": f} for t, f in targets.items()}}


def run(scores, pol=None, features=None, gate=None):
    summary = overall(scores, pol)
    return plan_fixes(scores, pol, features or {}, gate, summary)


class ExpectedGainTest(unittest.TestCase):
    def test_cta_gain_matches_the_formula(self):
        fixes = run([conversion_group(0.0), *OTHER_GROUPS])
        c08 = next(f for f in fixes if f["ref"] == "C08")
        self.assertAlmostEqual(sum(q["weight"] for q in SCORE_QUESTIONS if q["id"].startswith("C")), 10.3)
        # 0.45 x (1.0 / 10.3) x (75 - 0) / 1.0 (viral, conversion and SKU groups scored; shop is context)
        self.assertEqual(c08["expected_gain"], round(0.45 * 1.0 / 10.3 * 75, 2))
        self.assertEqual(c08["expected_gain"], 3.28)
        self.assertEqual((c08["current"], c08["target"]), (0.0, TARGET_SCORE))
        self.assertEqual(c08["gain_note"], GAIN_NOTE)

    def test_gain_is_spread_over_scored_groups_only(self):
        fixes = run([conversion_group(0.0), OTHER_GROUPS[0]])  # viral + conversion: sum W = 0.80
        c08 = next(f for f in fixes if f["ref"] == "C08")
        self.assertEqual(c08["expected_gain"], round(0.45 * 1.0 / 10.3 * 75 / 0.80, 2))

    def test_post_publish_group_is_never_a_fix_or_gain(self):
        low = grp("post_publish_performance", [crit("V7", 0.0), crit("C8", 0.0)])
        self.assertEqual([f for f in run([low, *OTHER_GROUPS]) if f["kind"] == "criterion"], [])

    def test_gain_matches_the_real_overall_change(self):
        before = overall([conversion_group(0.0), *OTHER_GROUPS], None)["score"]
        after = overall([conversion_group(75.0), *OTHER_GROUPS], None)["score"]
        gain = next(f for f in run([conversion_group(0.0), *OTHER_GROUPS]) if f["ref"] == "C08")["expected_gain"]
        self.assertAlmostEqual(after - before, gain, delta=0.1)  # group and overall scores are rounded

    def test_only_scored_weak_criteria_are_candidates(self):
        g = grp("viral_potential", [crit("V01", 49.9), crit("V02", 50.0), crit("V03", None)])
        refs = [f["ref"] for f in run([g])]
        self.assertEqual(refs, ["V01"])  # 50 is not weak; unscored is missing data, never a 0

    def test_policy_group_is_not_a_criterion_candidate(self):
        self.assertEqual(run([grp("policy_compliance", [crit("R1", 0.0)])]), [])

    def test_criteria_ranked_by_gain(self):
        g = grp("conversion_potential", [crit("C07", 40.0, 0.6), crit("C08", 0.0, 1.0), crit("C01", 90.0, 1.2)])
        self.assertEqual([f["ref"] for f in run([g])], ["C08", "C07"])


class PolicyFixTest(unittest.TestCase):
    def test_blockers_come_first_with_real_quote_and_time(self):
        pol = policy(tiktok_ads=[finding("TTA-001", evidence=["00:03 spoken: «trắng bật tông sau 1 lần»"])])
        fixes = run([conversion_group(0.0), *OTHER_GROUPS], pol)
        first = fixes[0]
        self.assertEqual((first["kind"], first["ref"]), ("policy", "TTA-001"))
        self.assertIn("«trắng bật tông sau 1 lần»", first["action"])
        self.assertIn("00:03", first["action"])
        self.assertEqual(first["timestamps"][0]["start"], 3)
        self.assertIsNone(first["expected_gain"])
        self.assertIn("https://example.test/TTA-001", first["refs"])

    def test_severity_order(self):
        pol = policy(tiktok_ads=[finding("TTA-003", severity="high")],
                     tiktok_shop_video=[finding("TTS-001", severity="critical")],
                     shopee_listing=[finding("SHP-003", severity="medium")])
        self.assertEqual([f["ref"] for f in run([], pol)], ["TTS-001", "TTA-003", "SHP-003"])

    def test_same_action_rules_are_merged(self):
        pol = policy(tiktok_shop_video=[finding("TTS-003")], shopee_listing=[finding("SHP-004")])
        fixes = run([], pol)
        self.assertEqual(len(fixes), 1)
        self.assertEqual(fixes[0]["refs"][:2], ["SHP-004", "TTS-003"])
        self.assertIn("Shopee", fixes[0]["why"])
        self.assertIn("TikTok Shop", fixes[0]["why"])

    def test_reviewer_quotes_are_used(self):
        pol = policy(tiktok_ads=[finding("TTA-001", evidence=["agent: absolute claim"],
                                         quotes=[{"text": "hết mụn vĩnh viễn", "t": 12.4}])])
        fix = run([], pol)[0]
        self.assertIn("«hết mụn vĩnh viễn» ở 00:12", fix["action"])
        self.assertEqual(fix["timestamps"][0]["text"], "hết mụn vĩnh viễn")

    def test_same_line_from_quotes_and_evidence_is_listed_once_in_time_order(self):
        pol = policy(tiktok_ads=[finding("TTA-001", evidence=["00:20 spoken: «b c»", "00:12 agent: «a b»"],
                                         quotes=[{"text": "a b", "t": 12.4}])],
                     tiktok_shop_video=[finding("TTS-002", evidence=["00:12 agent: «a b»"])])
        fix = run([], pol)[0]
        self.assertEqual([(t["start"], t["text"]) for t in fix["timestamps"]], [(12.4, "a b"), (20, "b c")])

    def test_without_quote_uses_the_generic_wording(self):
        fix = run([], policy(tiktok_ads=[finding("TTA-001", evidence=["absolute claim found"])]))[0]
        self.assertNotIn("{", fix["action"])
        self.assertNotIn("«»", fix["action"])
        self.assertEqual(fix["timestamps"], [])

    def test_time_without_quote(self):
        fix = run([], policy(tiktok_ads=[finding("TTA-002", evidence=["00:36 before/after comparison"])]))[0]
        self.assertIn("00:36", fix["action"])
        self.assertEqual(fix["timestamps"][0]["start"], 36)

    def test_uncounted_and_unknown_rules_are_skipped(self):
        pol = policy(meta_ads=[finding("META-001", counted=False), {**finding("META-002"), "outcome": "unknown"}])
        self.assertEqual(run([], pol), [])

    def test_unknown_rule_falls_back_to_generic(self):
        fix = run([], policy(tiktok_ads=[finding("NEW-999", evidence=["00:05 spoken: «abc»"])]))[0]
        self.assertIn("«abc»", fix["action"])
        self.assertIn("NEW-999", fix["title"])


class LocationTest(unittest.TestCase):
    def test_missing_cta_and_offer_get_suggested_positions(self):
        g = grp("conversion_potential", [crit("C08", 0.0), crit("C07", 0.0)])
        features = {"video.duration_sec": real(30.0), "video.has_cta": real(False),
                    "video.offer": real({"present": False, "description": "", "timestamp_sec": 0.0})}
        fixes = {f["ref"]: f for f in run([g], features=features)}
        self.assertEqual(fixes["C08"]["timestamps"], [])
        self.assertEqual({k: fixes["C08"]["suggested_at"][k] for k in ("start", "end", "note")},
                         {"start": 27.0, "end": 30.0, "note": SUGGESTION_NOTE})
        self.assertEqual((fixes["C07"]["suggested_at"]["start"], fixes["C07"]["suggested_at"]["end"]), (22.0, 27.0))

    def test_offer_goes_before_an_existing_cta(self):
        g = grp("conversion_potential", [crit("C07", 0.0)])
        features = {"video.duration_sec": real(30.0), "video.has_cta": real(True, "00:20-00:24"),
                    "video.offer": real({"present": False})}
        fix = run([g], features=features)[0]
        self.assertEqual((fix["suggested_at"]["start"], fix["suggested_at"]["end"]), (15.0, 20.0))

    def test_present_element_uses_real_timestamps(self):
        g = grp("conversion_potential", [crit("C08", 30.0), crit("C03", 20.0)])
        features = {"video.has_cta": real(True, "00:25-00:28"), "video.demo_present": real(True, "00:05-00:36")}
        fixes = {f["ref"]: f for f in run([g], features=features)}
        self.assertEqual(fixes["C08"]["timestamps"][0]["label"], "00:25–00:28")
        self.assertIsNone(fixes["C08"]["suggested_at"])
        self.assertEqual(fixes["C03"]["timestamps"][0]["start"], 5)

    def test_product_first_seen_time_in_action(self):
        g = grp("viral_potential", [crit("V9", 20.0)])
        features = {"video.product_visibility": real({"first_clear_sec": 5.0})}
        fix = run([g], features=features)[0]
        self.assertIn("00:05", fix["action"])

    def test_no_anchor_means_whole_video(self):
        fix = run([grp("conversion_potential", [crit("C05", 10.0)])])[0]
        self.assertEqual((fix["timestamps"], fix["suggested_at"]), ([], None))

    def test_unknown_inputs_give_no_position(self):
        fix = run([grp("conversion_potential", [crit("C08", 10.0)])])[0]  # has_cta not extracted
        self.assertIsNone(fix["suggested_at"])


class VariantAndDataTest(unittest.TestCase):
    def test_creative_format_picks_variant(self):
        g = grp("conversion_potential", [crit("C08", 0.0)])
        deal = Feature("deal", SourceStatus.INFERRED, "decisions_api")
        fix = run([g], features={"decision.M02": deal})[0]
        self.assertEqual(fix["action"], load_templates()["criteria"]["C08"]["variants"]["deal"])
        plain = run([g])[0]
        self.assertEqual(plain["action"], load_templates()["criteria"]["C08"]["action"])

    def test_unknown_criterion_uses_generic_template(self):
        fix = run([grp("sku_market", [crit("S9", 10.0, name="Brand strength")])])[0]
        self.assertIn("Brand strength", fix["title"])
        self.assertNotIn("{", fix["action"])

    def test_data_fixes_first_when_coverage_is_low(self):
        gate = {"flags": [{"code": "decisions_not_run", "detail": "30 questions", "next_step": "x"},
                          {"code": "mock_dependency", "detail": "m", "next_step": "y"}]}
        low = [grp("conversion_potential", [crit("C08", 0.0), crit("C01", None, 9.0)])]
        self.assertEqual([f["kind"] for f in run(low, gate=gate)], ["data", "criterion"])
        full = [conversion_group(0.0), *OTHER_GROUPS]
        self.assertEqual([f["kind"] for f in run(full, gate=gate)], ["criterion", "data"])
        self.assertEqual(run(full, gate=gate)[1]["ref"], "decisions_not_run")  # informational flags skipped

    def test_at_most_five_and_blockers_leave_room_for_content(self):
        pol = policy(tiktok_ads=[finding(r) for r in ("TTA-001", "TTA-002", "TTA-003", "TTC-001")],
                     shopee_listing=[finding("SHP-003"), finding("SHP-005")])
        fixes = run([conversion_group(0.0), *OTHER_GROUPS], pol)
        self.assertEqual(len(fixes), MAX_FIXES)
        self.assertEqual([f["kind"] for f in fixes], ["policy"] * 4 + ["criterion"])  # only one content fix exists
        two_weak = [grp("conversion_potential", [crit("C08", 0.0), crit("C07", 10.0)]), *OTHER_GROUPS]
        self.assertEqual([f["kind"] for f in run(two_weak, pol)], ["policy"] * 3 + ["criterion"] * 2)

    def test_without_content_fixes_blockers_fill_the_list(self):
        pol = policy(tiktok_ads=[finding(r) for r in ("TTA-001", "TTA-002", "TTA-003", "TTC-001")],
                     shopee_listing=[finding("SHP-003"), finding("SHP-005")])
        fixes = run([conversion_group(80.0), *OTHER_GROUPS], pol)
        self.assertEqual([f["kind"] for f in fixes], ["policy"] * MAX_FIXES)

    def test_output_shape(self):
        keys = {"id", "kind", "ref", "title", "action", "why", "current", "target", "target_desc",
                "expected_gain", "timestamps", "suggested_at", "refs"}
        for f in run([conversion_group(0.0), *OTHER_GROUPS], policy(tiktok_ads=[finding("TTA-001")]),
                     gate={"flags": [{"code": "no_listing", "detail": "d", "next_step": "s"}]}):
            self.assertTrue(keys <= set(f), f["id"])


class TemplateCoverageTest(unittest.TestCase):
    def setUp(self):
        self.t = load_templates()

    def _placeholders(self, text):
        return {name for _, name, _, _ in Formatter().parse(text) if name}

    def test_every_score_question_and_quantitative_criterion(self):
        ids = [q["id"] for q in SCORE_QUESTIONS] + ["V7", "C8", "S2", "S8", "V9", "V10"]
        self.assertEqual(len(SCORE_QUESTIONS), 28)
        for cid in ids:
            t = self.t["criteria"].get(cid)
            self.assertIsNotNone(t, cid)
            for key in ("title", "action", "why", "target_desc"):
                self.assertTrue(t.get(key), (cid, key))
            self.assertLessEqual(self._placeholders(t["action"]), {"at", "name", "target_desc"}, cid)
            if "at" in self._placeholders(t["action"]):
                self.assertIn("action_no_quote", t, cid)

    def test_every_rubric_v2_criterion_has_a_template(self):
        missing = [c.id for g, crit_list in RUBRICS_V2.items() if g != "policy_compliance"
                   for c in crit_list if c.id not in self.t["criteria"]]
        self.assertEqual(missing, [])

    def test_every_policy_rule(self):
        rules = [r["rule_id"] for r in load_baseline()["rules"]]
        self.assertEqual(len(rules), 16)
        for rid in rules:
            t = self.t["rules"].get(rid)
            self.assertIsNotNone(t, rid)
            for key in ("title", "action", "why"):
                self.assertTrue(t.get(key), (rid, key))
            if self._placeholders(t["action"]):
                self.assertLessEqual(self._placeholders(t["action"]), {"quote", "at", "rule_id"}, rid)
                self.assertIn("action_no_quote", t, rid)


if __name__ == "__main__":
    unittest.main()
