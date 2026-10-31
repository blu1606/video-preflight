"""Run: uv run python -m unittest tests.test_insight_candidates (from the repo root). No API call."""

import unittest

from sources import insight_candidates as ic


def feat(value, status="MOCK"):
    return {"value": value, "status": status}


def result(**overrides):
    """A posted video with a low product CTR, no CTA or offer, a female-targeted look and a 32k price in speech."""
    features = {
        "perf.views": feat(116710), "perf.product_ctr": feat(0.003), "perf.click_to_order_cvr": feat(0.0085),
        "perf.completion_rate": feat(0.348), "perf.actual_gmv_vnd": feat(78000),
        "video.has_cta": feat(False, "REAL"), "video.offer": feat({"present": False}, "REAL"),
        "video.inferred_target_audience": feat({"gender": "female", "age_band": "18-24",
                                                "interests": ["Phong cách pastel"]}, "REAL"),
        "context.target_audience": feat({"gender_split": {"female": 0.48, "male": 0.52},
                                         "age_bands": {"18-24": 0.52, "25-34": 0.32, "35-44": 0.12, "45+": 0.04},
                                         "interests": ["phụ kiện", "gaming"]}),
        "sku.sku_id": feat("SHOP002-SKU01"), "listing.price_vnd": feat(26000, "INFERRED"),
        "video.transcript_segments": feat([{"start": 0.0, "end": 4.0, "text": "Ốp hồng sọc"},
                                           {"start": 4.0, "end": 8.0, "text": "Giá chỉ 32k"}], "REAL"),
        "video.on_screen_text": feat(None, "REAL"),
        "bench.url": feat("https://clipcat.ai/en/tools/ai-tiktok-videos-prompt/vn-phones-436820"),
        "bench.hook_type": feat("result_first"), "bench.video_type": feat("Handheld Demo"),
        "video.hook_type": feat("curiosity", "REAL"), "video.demo_present": feat(False, "REAL"),
    }
    base = {
        "video_id": "SHOP002-VID01",
        "features": features,
        "scores": [{"name": "conversion_potential", "score": 36.5, "criteria": [
            {"id": "C08", "name": "Cta clarity", "score": 0},
            {"id": "C07", "name": "Offer communication", "score": 0},
            {"id": "C02", "name": "Problem solution fit", "score": 0},
            {"id": "C03", "name": "Demonstration clarity", "score": 33.2}]}],
        "fixes": [
            {"id": "criterion:C02", "kind": "criterion", "title": "Gắn sản phẩm với vấn đề", "expected_gain": 2.9},
            {"id": "criterion:C08", "kind": "criterion", "title": "Thêm lời kêu gọi mua", "expected_gain": 2.6},
            {"id": "criterion:C03", "kind": "criterion", "title": "Quay rõ cách dùng", "expected_gain": 1.8},
            {"id": "criterion:C07", "kind": "criterion", "title": "Nêu offer", "expected_gain": 1.2},
            {"id": "policy:SHP-003", "kind": "policy", "title": "Bỏ từ quảng cáo", "expected_gain": None}],
        "overall": {"score": 45.6, "thresholds": {"ready": 75}},
        "claims_verdicts": None,
        "video_diagnosis": {"verdict": "views_without_clicks", "reason": "Video giữ được người xem"},
    }
    base.update(overrides)
    return base


def by_lens(cands, lens):
    return [c for c in cands if c["lens"] == lens]


class FunnelTest(unittest.TestCase):
    def test_low_click_rate_with_no_cta_cites_metrics_criteria_and_fix(self):
        (c,) = ic.funnel(result())
        self.assertEqual(c["facts"]["break_step"], "bấm vào sản phẩm")
        self.assertEqual(c["facts"]["views"], 116710)
        self.assertEqual(c["facts"]["ctr_pct"], 0.3)
        self.assertEqual(c["facts"]["has_cta"], False)
        self.assertEqual({x["name"] for x in c["facts"]["content_gaps"]}, {"Cta clarity", "Offer communication"})
        kinds = [x["kind"] for x in c["cites"]]
        self.assertIn({"kind": "criterion", "id": "C08"}, c["cites"])
        self.assertIn({"kind": "fix", "id": "criterion:C08"}, c["cites"])
        self.assertIn("metric", kinds)
        self.assertEqual(next(x for x in c["cites"] if x.get("field") == "perf.views")["value"], 116710)

    def test_reference_is_passed_as_a_hand_set_placeholder(self):
        (c,) = ic.funnel(result())
        self.assertEqual((c["facts"]["reference_status"], c["facts"]["reference_label_vi"]),
                         ("placeholder", "mốc tạm tự đặt"))
        r = result()
        r["features"]["perf.product_ctr"] = feat(0.05)  # clicks are fine, the order step breaks
        (order,) = ic.funnel(r)
        self.assertEqual(order["facts"]["break_step"], "đặt hàng sau khi bấm")
        self.assertEqual((order["facts"]["reference_cvr_pct"], order["facts"]["reference_status"]), (5.0, "placeholder"))

    def test_missing_funnel_data_gives_no_candidate(self):
        r = result()
        del r["features"]["perf.product_ctr"]
        self.assertEqual(ic.funnel(r), [])
        r = result()
        r["features"]["perf.views"] = feat(None, "MISSING")
        self.assertEqual(ic.funnel(r), [])

    def test_healthy_rates_give_no_candidate(self):
        r = result()
        r["features"]["perf.product_ctr"] = feat(0.05)
        r["features"]["perf.click_to_order_cvr"] = feat(0.2)
        self.assertEqual(ic.funnel(r), [])


class AudienceTest(unittest.TestCase):
    def test_video_audience_against_sku_buyers(self):
        (c,) = ic.audience(result())
        self.assertEqual(c["facts"]["mismatch"], ["gender", "interests"])
        self.assertEqual(c["facts"]["sku_buyer_gender_share_pct"], 52)
        self.assertEqual(c["facts"]["sku_buyer_gender_vi"], "nam")
        self.assertIn({"kind": "dataset", "dataset": "skuAudience", "row": "SHOP002-SKU01"}, c["cites"])

    def test_aligned_audience_and_missing_sku_give_nothing(self):
        r = result()
        r["features"]["context.target_audience"] = feat({
            "gender_split": {"female": 0.7, "male": 0.3}, "age_bands": {"18-24": 0.6, "25-34": 0.4},
            "interests": ["phong cách"]})
        self.assertEqual(ic.audience(r), [])
        r = result()
        r["features"]["context.target_audience"] = feat(None, "MISSING")
        self.assertEqual(ic.audience(r), [])


class PriceTest(unittest.TestCase):
    def test_price_said_in_speech_differs_from_listing(self):
        (c,) = ic.price(result())
        self.assertEqual(c["facts"], {"video_price_vnd": 32000, "listing_price_vnd": 26000, "diff_pct": 23})
        self.assertEqual(c["t"], 4.0)
        self.assertIn({"kind": "time", "t": 4.0}, c["cites"])

    def test_same_price_or_no_price_gives_nothing(self):
        r = result()
        r["features"]["video.transcript_segments"] = feat([{"start": 0, "end": 3, "text": "Giá 26.000đ"}], "REAL")
        self.assertEqual(ic.price(r), [])
        r = result()
        r["features"]["video.transcript_segments"] = feat([{"start": 0, "end": 3, "text": "Đẹp quá"}], "REAL")
        self.assertEqual(ic.price(r), [])


class ClaimsTest(unittest.TestCase):
    def test_contradicting_claim_is_a_candidate_and_missing_claims_are_not(self):
        r = result(claims_verdicts=[{"claim": "Chống nước 100%", "verdict": "contradicts",
                                     "listing_evidence": "Listing không nói chống nước"},
                                    {"claim": "Chất liệu silicone", "verdict": "supported"}])
        (c,) = ic.claims(r)
        self.assertEqual(c["facts"]["count"], 1)
        self.assertEqual(c["cites"], [{"kind": "claims"}])
        self.assertEqual(ic.claims(result()), [])


class WhatIfTest(unittest.TestCase):
    def test_top_gains_and_gap_to_ready(self):
        (c,) = ic.what_if(result())
        self.assertEqual(c["facts"]["top_gain"], 7.3)  # 2.9 + 2.6 + 1.8
        self.assertEqual(c["facts"]["score_after_top"], 52.9)
        self.assertFalse(c["facts"]["crosses_ready_after_top"])
        self.assertEqual(c["facts"]["all_gain"], 8.5)
        self.assertEqual(c["facts"]["gap_after_all"], 20.9)
        self.assertEqual(c["cites"], [{"kind": "fix", "id": "criterion:C02"}, {"kind": "fix", "id": "criterion:C08"},
                                      {"kind": "fix", "id": "criterion:C03"}])

    def test_no_gains_or_no_score_gives_nothing(self):
        r = result(fixes=[{"id": "policy:SHP-003", "expected_gain": None}])
        self.assertEqual(ic.what_if(r), [])
        self.assertEqual(ic.what_if(result(overall={"score": None})), [])


class BenchmarkTest(unittest.TestCase):
    def test_hook_and_demo_differ_from_benchmark_video(self):
        (c,) = ic.benchmark(result())
        self.assertEqual(c["facts"]["differs"], ["hook", "demo"])
        self.assertEqual(c["facts"]["benchmark_hook_vi"], "mở đầu bằng kết quả")
        self.assertFalse(c["facts"]["benchmark_numbers_verified"])
        self.assertIn({"kind": "dataset", "dataset": "benchmarkVideos", "row": "vn-phones-436820"}, c["cites"])

    def test_same_hook_and_demo_or_no_benchmark_gives_nothing(self):
        r = result()
        r["features"]["video.hook_type"] = feat("result_first", "REAL")
        r["features"]["video.demo_present"] = feat(True, "REAL")
        self.assertEqual(ic.benchmark(r), [])
        r = result()
        r["features"]["bench.url"] = feat(None)
        self.assertEqual(ic.benchmark(r), [])


class ShopHabitTest(unittest.TestCase):
    def peer(self, target, score):
        return {"targetId": target, "result": {"scores": [{"name": "conversion_potential", "criteria": [
            {"id": "C08", "name": "Cta clarity", "score": score}]}]}}

    def test_weak_criterion_repeating_in_other_videos(self):
        (c,) = ic.shop_habit(result(), [self.peer("SHOP002-VID02", 10), self.peer("SHOP002-VID03", 0)])
        self.assertEqual(c["facts"]["videos_weak"], 2)
        self.assertEqual(c["facts"]["videos_checked"], 2)
        self.assertIn({"kind": "dataset", "dataset": "analyses", "row": "SHOP002-VID03"}, c["cites"])

    def test_one_other_video_or_strong_peers_give_nothing(self):
        self.assertEqual(ic.shop_habit(result(), [self.peer("SHOP002-VID02", 10)]), [])
        self.assertEqual(ic.shop_habit(result(), [self.peer("SHOP002-VID02", 80), self.peer("SHOP002-VID03", 90)]), [])

    def test_latest_peer_run_per_video_only(self):
        records = [{"targetId": "SHOP002-VID02", "id": 9, "result": {"x": 1}},
                   {"targetId": "SHOP002-VID02", "id": 3, "result": {"x": 2}},
                   {"targetId": "SHOP002-VID01", "id": 8, "result": {"x": 3}},
                   {"targetId": "SHOP002-VID03", "id": 7, "result": None}]
        self.assertEqual(ic.latest_peers(records, "SHOP002-VID01"), [{"targetId": "SHOP002-VID02", "result": {"x": 1}}])


class BuildTest(unittest.TestCase):
    def test_ids_are_sequential_and_lens_order_kept(self):
        cands = ic.build(result(), [])
        self.assertEqual([c["id"] for c in cands], [f"c{i}" for i in range(1, len(cands) + 1)])
        self.assertEqual([c["lens"] for c in cands], ["funnel", "audience", "price", "what_if", "benchmark"])

    def test_empty_run_gives_no_candidates(self):
        self.assertEqual(ic.build({"video_id": "X", "features": {}, "scores": [], "fixes": []}), [])


if __name__ == "__main__":
    unittest.main()
