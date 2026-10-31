"""Run: uv run python -m unittest discover tests (from video_understanding/demo)."""

import json
import tempfile
import unittest
from pathlib import Path

from core.policy_check import (BASELINE_DIR, Outcome, applicable_rules, applicable_rules_feature, check_rule, evaluate,
                               load_baseline, merge, policy_features)
from core.quality_gate import diagnosis_agreement, quality_gate
from core.schema import Feature, Mode, SourceStatus
from core.score_engine import score_all
from sources.providers import VideoFeatureProvider

DEMO = Path(__file__).resolve().parents[1]
TEASHELL = DEMO / "output" / "features" / "vn-beauty-467796.json"


def real(v):
    return Feature(v, SourceStatus.REAL, "test")


def mock(v):
    return Feature(v, SourceStatus.MOCK, "fixture")


def rule(rule_id: str) -> dict:
    return next(r for r in load_baseline()["rules"] if r["rule_id"] == rule_id)


# test_cases.json input -> (target, features) in this project's feature names
CASE_ADAPTERS = {
    "TTS-002": lambda i: ("tiktok_shop_video", {"video.key_claims": real([c["text"] for c in i["claims"]])}),
    "TTA-002": lambda i: ("tiktok_ads", {
        "video.before_after_shown": real(i["before_after"]["present"]),
        "video.key_claims": real(["product effect comparison"] if i["before_after"]["product_effect_comparison"] else []),
    }),
    "TTC-002": lambda i: ("tiktok_shop_video", {
        "post.is_commercial": real(i["is_commercial"]), "post.disclosure_enabled": real(i["disclosure_enabled"]),
    }),
    "SHP-003": lambda i: ("shopee_listing", {"sku.title": real(i["title"])}),
    "SHP-004": lambda i: ("shopee_listing", {
        "sku.category": real(i["category"]),
        **({} if i["cosmetic_notification_available"] is None
           else {"sku.cosmetic_notification_available": real(i["cosmetic_notification_available"])}),
    }),
    "META-002": lambda i: ("meta_ads", {"ad.copy": real(i["ad_copy"])}),
}


class BaselineCasesTest(unittest.TestCase):
    def test_fixture_cases_match_expected_outcome(self):
        cases = json.loads((BASELINE_DIR / "test_cases.json").read_text(encoding="utf-8"))["cases"]
        self.assertEqual(len(cases), 6)
        for case in cases:
            with self.subTest(case=case["case_id"]):
                target, features = CASE_ADAPTERS[case["rule_id"]](case["input"])
                finding = check_rule(rule(case["rule_id"]), target, features, Mode.SIMULATION)
                self.assertEqual(finding.outcome, case["expected"])

    def test_clean_inputs_do_not_trigger(self):
        features = {"sku.title": real("Xà phòng Niacinamide 100g"), "post.is_commercial": real(True),
                    "post.disclosure_enabled": real(True)}
        self.assertEqual(check_rule(rule("SHP-003"), "shopee_listing", features, Mode.SIMULATION).outcome,
                         Outcome.NOT_TRIGGERED)
        self.assertEqual(check_rule(rule("TTC-002"), "tiktok_shop_video", features, Mode.SIMULATION).outcome,
                         Outcome.NOT_TRIGGERED)


class PolicyScoreTest(unittest.TestCase):
    def test_teashell_needs_review_on_both_targets(self):
        features = VideoFeatureProvider(TEASHELL).load()
        features["bench.category"] = real("beauty")
        result = evaluate(features, Mode.EVIDENCE)
        outcome = {(t, f.rule_id): f.outcome for t, r in result.items() for f in r["findings"]}
        self.assertEqual(outcome["tiktok_ads", "TTA-001"], Outcome.NEEDS_REVIEW)
        self.assertEqual(outcome["tiktok_ads", "TTA-002"], Outcome.NEEDS_REVIEW)
        self.assertEqual(outcome["tiktok_shop_video", "TTS-003"], Outcome.NEEDS_REVIEW)
        self.assertEqual(outcome["tiktok_shop_video", "TTC-002"], Outcome.UNKNOWN)
        self.assertTrue(all(r["verdict"] == "needs_review" for r in result.values()))
        self.assertEqual(outcome["tiktok_shop_video", "TTS-001"], Outcome.NOT_TRIGGERED)  # soap is not prohibited
        tta001 = next(f for f in result["tiktok_ads"]["findings"] if f.rule_id == "TTA-001")
        self.assertIn({"text": "Tao mua về tắm xong trắng, mẹ tao với mấy bà hàng xóm không nhận ra luôn", "t": 0},
                      tta001.quotes)
        self.assertEqual(tta001.sources, ["detector"])
        with tempfile.TemporaryDirectory() as tmp:  # empty reviewer cache: layer 3 stays out of this check
            policy = policy_features(features, Mode.EVIDENCE, cache_dir=Path(tmp))
        self.assertEqual(policy["policy.findings"].value["reviewer"]["status"], "not_run")
        r1 = next(g for g in score_all({**features, **policy}, Mode.EVIDENCE) if g.name == "policy_compliance")
        self.assertEqual(r1.score, 40.0)

    def test_evidence_mode_turns_mock_inputs_into_unknown(self):
        features = {"sku.category": mock("beauty")}
        sim = check_rule(rule("TTS-003"), "tiktok_shop_video", features, Mode.SIMULATION)
        ev = check_rule(rule("TTS-003"), "tiktok_shop_video", features, Mode.EVIDENCE)
        self.assertEqual((sim.outcome, sim.mock_dependency), (Outcome.NEEDS_REVIEW, True))
        self.assertEqual(ev.outcome, Outcome.UNKNOWN)

    def test_all_unknown_is_not_scored(self):
        out = policy_features({}, Mode.SIMULATION)
        self.assertEqual(out["policy.score"].status, SourceStatus.MISSING)
        self.assertEqual(out["policy.findings"].status, SourceStatus.INFERRED)

    def test_vlm_policy_signals_are_used_first(self):
        features = {
            "video.policy_absolute_claims": real([{"text": "trắng ngay sau 1 lần", "timestamp_sec": 2.0, "channel": "spoken"}]),
            "video.policy_before_after": real({"present": True, "product_effect_comparison": False, "timestamp_sec": 9}),
            "video.before_after_shown": real(True),
            "video.key_claims": real(["brighter skin"]),
            "video.policy_ui_overlays": real([{"description": "fake 'Mua ngay' button", "timestamp_sec": 4, "fake_interactive": True}]),
            "video.policy_realistic_ai_media": real({"present": False, "confidence": "low"}),
        }
        result = evaluate(features, Mode.EVIDENCE, targets=("tiktok_ads",))
        by_rule = {f.rule_id: f for f in result["tiktok_ads"]["findings"]}
        self.assertEqual(by_rule["TTA-001"].outcome, Outcome.NEEDS_REVIEW)
        self.assertIn("00:02 spoken: «trắng ngay sau 1 lần»", by_rule["TTA-001"].evidence)
        # the VLM says the comparison is not about the product effect, so the coarse flag is ignored
        self.assertEqual(by_rule["TTA-002"].outcome, Outcome.NOT_TRIGGERED)
        self.assertEqual(by_rule["TTA-003"].outcome, Outcome.NEEDS_REVIEW)
        self.assertEqual(by_rule["TTC-001"].outcome, Outcome.NOT_TRIGGERED)

    def test_old_cache_without_signals_falls_back(self):
        features = {"video.transcript": real("dùng 1 lần mà trắng luôn"), "video.policy_ui_overlays": Feature.missing("old cache")}
        result = evaluate(features, Mode.EVIDENCE, targets=("tiktok_ads",))
        by_rule = {f.rule_id: f for f in result["tiktok_ads"]["findings"]}
        self.assertEqual(by_rule["TTA-001"].outcome, Outcome.NEEDS_REVIEW)
        self.assertEqual(by_rule["TTA-003"].outcome, Outcome.UNKNOWN)

    def test_provisional_meta_rule_is_shown_but_not_counted(self):
        result = evaluate({"ad.copy": real("Bạn đang mắc bệnh da liễu?")}, Mode.SIMULATION, targets=("meta_ads",))
        finding = next(f for f in result["meta_ads"]["findings"] if f.rule_id == "META-002")
        self.assertEqual(finding.outcome, Outcome.NEEDS_REVIEW)
        self.assertFalse(finding.counted)
        self.assertIsNone(result["meta_ads"]["score"])


def inferred(v, mock_dep=False):
    return Feature(v, SourceStatus.INFERRED, "decisions_api", mock_dependency=mock_dep)


def outcome_of(rule_id, target, features, review=None, mode=Mode.EVIDENCE):
    return check_rule(rule(rule_id), target, features, mode, review)


class RestrictedCategoryTest(unittest.TestCase):
    def test_prohibited_category_is_a_hit(self):
        f = outcome_of("TTS-001", "tiktok_shop_video", {"sku.title": real("Trà giảm cân thảo mộc 30 gói")})
        self.assertEqual(f.outcome, Outcome.NEEDS_REVIEW)
        self.assertIn("kiểm soát cân nặng", f.evidence[0])

    def test_restricted_category_is_only_a_candidate(self):
        features = {"sku.category": real("Thực phẩm chức năng")}
        self.assertEqual(outcome_of("TTS-001", "tiktok_shop_video", features).outcome, Outcome.UNKNOWN)
        review = {"rules": {"TTS-001": {"outcome": "needs_review", "quotes": [{"text": "x y", "t": None}]}}}
        self.assertEqual(outcome_of("TTS-001", "tiktok_shop_video", features, review).outcome, Outcome.NEEDS_REVIEW)

    def test_negated_ingredient_does_not_fire(self):
        features = {"sku.description": real("Xà phòng không chứa thủy ngân, hydroquinone-free")}
        self.assertEqual(outcome_of("TTS-001", "tiktok_shop_video", features).outcome, Outcome.NOT_TRIGGERED)
        features = {"sku.description": real("Kem trộn có thủy ngân trắng nhanh")}
        self.assertEqual(outcome_of("TTS-001", "tiktok_shop_video", features).outcome, Outcome.NEEDS_REVIEW)

    def test_whole_word_and_tone_marks(self):
        # "súng" (gun) must not fire on "sủng" (other tone) nor inside a longer word
        for title in ("Xà bông tắm 100g", "Đèn sủng ái", "Áo khoác súngx"):
            with self.subTest(title=title):
                self.assertEqual(outcome_of("TTS-001", "tiktok_shop_video", {"sku.title": real(title)}).outcome,
                                 Outcome.NOT_TRIGGERED)

    def test_no_product_text_is_unknown(self):
        self.assertEqual(outcome_of("TTS-001", "tiktok_shop_video", {}).outcome, Outcome.UNKNOWN)

    def test_meta_commerce_list_is_evaluated_but_not_counted(self):
        f = outcome_of("META-003", "meta_ads", {"sku.title": real("Rượu vang Đà Lạt")})
        self.assertEqual((f.outcome, f.counted), (Outcome.NEEDS_REVIEW, False))

    def test_every_category_names_a_registered_source(self):
        for list_id, data in load_baseline()["restricted"].items():
            ids = {s["source_id"] for s in data["sources"]}
            for cat in data["categories"]:
                with self.subTest(list=list_id, category=cat["id"]):
                    self.assertIn(cat["source_id"], ids)
                    self.assertIn(cat["verification"], ("official_source_reviewed", "unverified_secondary"))


class ListingDetectorTest(unittest.TestCase):
    def shp(self, rule_id, **values):
        return outcome_of(rule_id, "shopee_listing", {k.replace("_", ".", 1): real(v) for k, v in values.items()})

    def test_offplatform_contact(self):
        for text in ("Liên hệ 0912 345 678 để được tư vấn", "Kết bạn Zalo shop nhé", "ib shop để có giá sỉ",
                     "Xem thêm tại https://example.com/sp", "Nhắn m.me/shopabc", "fb.com/shopabc"):
            with self.subTest(text=text):
                self.assertEqual(self.shp("SHP-005", sku_description=text).outcome, Outcome.NEEDS_REVIEW)

    def test_clean_description_and_shopee_links_do_not_fire(self):
        for text in ("Xà phòng 100g, hạn dùng 36 tháng. Mã lô 20261029.", "Xem shop tại https://shopee.vn/teashell"):
            with self.subTest(text=text):
                self.assertEqual(self.shp("SHP-005", sku_description=text).outcome, Outcome.NOT_TRIGGERED)

    def test_missing_description_is_unknown(self):
        self.assertEqual(self.shp("SHP-005").outcome, Outcome.UNKNOWN)
        self.assertEqual(self.shp("SHP-001", sku_price_vnd=99000).outcome, Outcome.UNKNOWN)

    def test_price_in_description_differs_from_listing(self):
        f = self.shp("SHP-001", sku_description="Giá chỉ 79k hôm nay", sku_price_vnd=99000)
        self.assertEqual(f.outcome, Outcome.NEEDS_REVIEW)
        self.assertIn("79,000", f.evidence[0])
        self.assertEqual(self.shp("SHP-001", sku_description="Giá gốc 120.000đ, giá sale 99.000đ",
                                  sku_price_vnd=99000, sku_list_price_vnd=120000).outcome, Outcome.NOT_TRIGGERED)

    def test_pack_size_title_vs_description(self):
        f = self.shp("SHP-001", sku_title="Xà phòng Niacinamide 100g", sku_description="Bánh xà phòng nặng 80g")
        self.assertEqual(f.outcome, Outcome.NEEDS_REVIEW)
        self.assertEqual(self.shp("SHP-001", sku_title="Sữa tắm 0.5L", sku_description="Chai 500 ml").outcome,
                         Outcome.NOT_TRIGGERED)

    def test_images_rule_stays_unknown_with_reason(self):
        f = self.shp("SHP-002", sku_title="x")
        self.assertEqual(f.outcome, Outcome.UNKNOWN)
        self.assertIn("listing images", f.evidence[0])


class ClaimLayersTest(unittest.TestCase):
    def test_meta_claim_rule_reuses_absolute_claims(self):
        f = outcome_of("META-001", "meta_ads", {"video.transcript": real("trắng bật tông sau 3 ngày")})
        self.assertEqual((f.outcome, f.counted), (Outcome.NEEDS_REVIEW, False))

    def test_weak_phrase_needs_confirmation(self):
        features = {"video.transcript": real("cam kết chính hãng, mẹ tao không nhận ra luôn")}
        alone = outcome_of("TTA-001", "tiktok_ads", features)
        self.assertEqual(alone.outcome, Outcome.UNKNOWN)
        self.assertTrue(alone.evidence[0].startswith("unconfirmed candidate"))
        confirmed = outcome_of("TTA-001", "tiktok_ads", {**features, "decision.P02": inferred(0.8)})
        self.assertEqual((confirmed.outcome, confirmed.sources), (Outcome.NEEDS_REVIEW, ["detector", "decisions"]))
        self.assertTrue(confirmed.quotes)
        cleared = outcome_of("TTA-001", "tiktok_ads", {**features, "decision.P02": inferred(0.2)})
        self.assertEqual(cleared.outcome, Outcome.NOT_TRIGGERED)

    def test_decision_predicate_adds_a_finding(self):
        features = {"post.is_commercial": real(True), "post.disclosure_enabled": real(True),
                    "decision.P04": inferred(0.9)}
        f = outcome_of("TTC-002", "tiktok_shop_video", features)
        self.assertEqual((f.outcome, f.sources), (Outcome.NEEDS_REVIEW, ["decisions"]))
        self.assertIn("Decisions P04 p=0.90", f.evidence)
        self.assertIn("decision.P04", f.inputs)

    def test_evidence_mode_ignores_mock_based_predicates(self):
        features = {"post.is_commercial": real(True), "post.disclosure_enabled": real(True),
                    "decision.P04": inferred(0.9, mock_dep=True)}
        self.assertEqual(outcome_of("TTC-002", "tiktok_shop_video", features).outcome, Outcome.NOT_TRIGGERED)
        self.assertEqual(outcome_of("TTC-002", "tiktok_shop_video", features, mode=Mode.SIMULATION).outcome,
                         Outcome.NEEDS_REVIEW)

    def test_agent_cannot_clear_a_detector_hit(self):
        features = {"video.transcript": real("dùng 1 lần mà trắng luôn"), "decision.P02": inferred(0.1)}
        review = {"rules": {"TTA-001": {"outcome": "not_triggered", "quotes": [], "rationale": "nói đùa"}}}
        f = outcome_of("TTA-001", "tiktok_ads", features, review)
        self.assertEqual(f.outcome, Outcome.NEEDS_REVIEW)
        self.assertEqual(f.sources, ["detector"])
        self.assertEqual({c["source"] for c in f.conflicts}, {"agent", "decisions"})

    def test_agent_quote_adds_finding_with_timestamp(self):
        review = {"rules": {"TTS-002": {"outcome": "needs_review", "confidence": 0.7, "rationale": "r",
                                        "quotes": [{"text": "trị dứt điểm mụn", "t": 12.0}]}}}
        f = outcome_of("TTS-002", "tiktok_shop_video", {"video.key_claims": real([])}, review)
        self.assertEqual((f.outcome, f.sources), (Outcome.NEEDS_REVIEW, ["agent"]))
        self.assertEqual(f.quotes, [{"text": "trị dứt điểm mụn", "t": 12.0}])
        self.assertIn("00:12 agent: «trị dứt điểm mụn»", f.evidence)


class MergeTableTest(unittest.TestCase):
    def test_table(self):
        cases = [
            (("hit", None, None), (Outcome.NEEDS_REVIEW, ["detector"], [])),
            (("hit", False, True), (Outcome.NEEDS_REVIEW, ["detector", "agent"], ["decisions"])),
            (("clear", True, None), (Outcome.NEEDS_REVIEW, ["decisions"], [])),
            (("clear", None, True), (Outcome.NEEDS_REVIEW, ["agent"], [])),
            (("clear", False, False), (Outcome.NOT_TRIGGERED, ["detector", "decisions", "agent"], [])),
            (("clear", None, None), (Outcome.NOT_TRIGGERED, ["detector"], [])),
            (("candidate", None, True), (Outcome.NEEDS_REVIEW, ["detector", "agent"], [])),
            (("candidate", False, None), (Outcome.NOT_TRIGGERED, ["detector", "decisions"], [])),
            (("candidate", None, None), (Outcome.UNKNOWN, [], [])),
            (("unknown", True, None), (Outcome.NEEDS_REVIEW, ["decisions"], [])),
            (("unknown", False, False), (Outcome.UNKNOWN, [], [])),  # a "no" never fills a missing input
        ]
        for args, expected in cases:
            with self.subTest(args=args):
                self.assertEqual(merge(*args), expected)


class ApplicableRulesTest(unittest.TestCase):
    def test_rules_follow_targets(self):
        ids = {r["rule_id"] for r in applicable_rules(("tiktok_ads",))}
        self.assertEqual(ids, {"TTA-001", "TTA-002", "TTA-003", "TTC-001"})
        feature = applicable_rules_feature(("shopee_listing",))["policy.applicable_rules"]
        self.assertEqual(feature.status, SourceStatus.INFERRED)
        self.assertFalse(feature.is_mock_based)
        self.assertTrue(all(r["source_url"] for r in feature.value))


class PolicyGateTest(unittest.TestCase):
    def policy(self, finding):
        return {"policy.findings": inferred({"targets": {"tiktok_ads": {"findings": [finding]}}}),
                "sku.title": real("x")}

    def test_reviewer_disagreement_is_a_policy_conflict(self):
        finding = {"rule_id": "TTA-001", "outcome": "needs_review", "sources": ["detector"],
                   "conflicts": [{"source": "agent", "detail": "reviewer says not_triggered"}]}
        codes = [f["code"] for f in quality_gate(self.policy(finding), [])["flags"]]
        self.assertEqual(codes, ["policy_conflict"])

    def test_merged_findings_skip_the_legacy_before_after_check(self):
        finding = {"rule_id": "TTA-002", "outcome": "not_triggered", "sources": ["detector"], "conflicts": []}
        gate = quality_gate({**self.policy(finding), "decision.P03": inferred(0.9)}, [])
        self.assertEqual(gate["flags"], [])

    def test_listing_mismatch(self):
        for answer, flagged in (("mismatch", True), ("unknown", True), ("exact", False)):
            with self.subTest(answer=answer):
                codes = [f["code"] for f in quality_gate({"decision.M01": inferred(answer),
                                                          "sku.title": real("x")}, [])["flags"]]
                self.assertEqual("listing_mismatch" in codes, flagged)

    def test_diagnosis_conflict(self):
        diagnosis = {"confidence": "high", "primary_issue": "operations",
                     "findings": [{"area": "operations", "severity": 1.6}, {"area": "conversion", "severity": 1.2}]}
        self.assertEqual(diagnosis_agreement("operations", diagnosis), "agree")
        self.assertEqual(diagnosis_agreement("traffic", diagnosis), "conflict")
        self.assertEqual(diagnosis_agreement("mixed", diagnosis), "agree")
        self.assertEqual(diagnosis_agreement("unknown", diagnosis), "unverified")
        self.assertEqual(diagnosis_agreement("traffic", {**diagnosis, "confidence": "low"}), "unverified")
        gate = quality_gate({"decision.M03": inferred("traffic"), "sku.title": real("x")}, [], diagnosis)
        self.assertEqual([f["code"] for f in gate["flags"]], ["diagnosis_conflict"])


if __name__ == "__main__":
    unittest.main()
