"""Run: uv run python -m unittest tests.test_ui_endpoints (from video_understanding/demo).

Post copy (caption + hashtags) through features, Decisions, policy and fixes; the UI endpoints (PATCH post,
question bank, AI quick-fill, Shopee link resolve) and the SSE payload the UI reads. json-server is the
in-memory FakeDb, the LLM is a fake client and the Shopee fetch is a fake HTTP client: no network, no paid call.
"""

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import httpx
from fastapi.testclient import TestClient

import api
from core import fixes
from core.policy_check import check_rule, load_baseline, scan_post_copy
from core.schema import Feature, Mode, SourceStatus
from sources import caption_writer, db_client, decision_scorer, shopee_listing
from sources.providers import PostCopyProvider, clean_hashtags
from tests.test_analyze_stream import HAS_CACHE, VIDEO, FakeDb, parse_sse

ITEM_URL = ("https://shopee.vn/S%E1%BB%AFa-r%E1%BB%ADa-m%E1%BA%B7t-cho-nam-s%E1%BA%A1ch-d%E1%BA%A7u-nh%E1%BB%9Dn-"
            "ng%E1%BB%ABa-m%E1%BB%A5n-Men-Stay-Simplicity-Facial-Cleanser-100g-srm-i.1054347666.54754418436")


def real(v):
    return Feature(v, SourceStatus.REAL, "test")


def rule(rule_id: str) -> dict:
    return next(r for r in load_baseline()["rules"] if r["rule_id"] == rule_id)


class PatchableDb(FakeDb):
    def patch(self, path: str, body: dict) -> dict:
        row = self.get(path)
        row.update(body)
        return json.loads(json.dumps(row, default=str))


class Response:
    def __init__(self, status_code=200, payload=None, headers=None):
        self.status_code, self._payload, self.headers = status_code, payload, headers or {}

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class FakeHttp:
    """httpx.Client stand-in: answers by URL prefix, records every request."""

    def __init__(self, routes: dict):
        self.routes, self.calls = routes, []

    def get(self, url, **kwargs):
        self.calls.append(url)
        for prefix, answer in self.routes.items():
            if url.startswith(prefix):
                if isinstance(answer, Exception):
                    raise answer
                return answer
        raise AssertionError(f"unexpected request {url}")

    def close(self):
        pass


def chat_client(content: str, calls: list):
    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
                               usage=SimpleNamespace(prompt_tokens=900, completion_tokens=120))
    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))


# ---------- features, Decisions, policy, fixes ----------

class PostCopyFeaturesTest(unittest.TestCase):
    def test_hashtags_are_cleaned(self):
        self.assertEqual(clean_hashtags("#xaphong, trangda  #XaPhong review"), ["xaphong", "trangda", "review"])
        self.assertEqual(clean_hashtags(["#a", "b,c", "", 3]), ["a", "b", "c"])
        self.assertEqual(clean_hashtags(None), [])

    def test_caption_and_hashtags_are_real_seller_input(self):
        f = PostCopyProvider({"caption": "  Xà phòng thơm mát ", "hashtags": ["#xaphong"]}).load()
        self.assertEqual(f["post.caption"].value, "Xà phòng thơm mát")
        self.assertEqual((f["post.caption"].status, f["post.caption"].source), (SourceStatus.REAL, "seller"))
        self.assertEqual(f["post.hashtags"].value, ["xaphong"])
        empty = PostCopyProvider(None).load()
        self.assertEqual(empty["post.caption"].status, SourceStatus.MISSING)

    def test_decisions_read_the_caption_as_on_screen_copy(self):
        q = decision_scorer.questions_by_id()["V08"]  # opening evidence + on-screen text
        features = {"video.on_screen_text": Feature.missing("old cache"), "post.caption": real("Xà phòng TeaShell")}
        ok, inputs, _ = decision_scorer.eligibility(q, features, Mode.EVIDENCE, {"hook": [{"sec": 0.5}]})
        self.assertTrue(ok)
        self.assertIn("post.caption", inputs)

    def test_question_meta_has_group_and_required_features(self):
        meta = {q["id"]: decision_scorer.question_meta(q) for q in decision_scorer.load_bank()["questions"]}
        self.assertEqual(meta["V01"]["group"], "viral_potential")
        self.assertEqual(meta["C10"]["group"], "conversion_potential")
        self.assertIsNone(meta["P02"]["group"])  # predicate: never averaged into a score
        self.assertEqual(meta["V01"]["required_features"], ["video.hook", "video.opening_evidence"])
        self.assertFalse(meta["M04"]["asked"])

    def test_answer_details_carry_levels_answer_and_required_features(self):
        answer = {"name": "V01", "type": "score", "score": 1.24, "confidence": 0.75,
                  "probabilities": [{"label": "1 Weak", "probability": 0.71, "value": 1}]}
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "clip.k1.json").write_text(json.dumps({"model": "m", "usage": {}, "questions": ["V01"],
                                                             "answers": [answer]}), encoding="utf-8")
            feature = Feature(31.0, SourceStatus.INFERRED, "decisions_api", ["level 1.24/4", "cache k1"],
                              input_sources=["video.hook_type"])
            row = decision_scorer.answer_details({"decision.V01": feature}, "clip", Path(tmp))["questions"][0]
        self.assertEqual(row["answer"]["probabilities"][0]["probability"], 0.71)
        self.assertEqual((row["group"], row["value"], row["inputs"]), ("viral_potential", 31.0, ["video.hook_type"]))
        self.assertEqual(row["required_features"], ["video.hook", "video.opening_evidence"])
        self.assertEqual(row["levels"][0]["label"], "0 Absent")


class PostCopyPolicyTest(unittest.TestCase):
    def test_absolute_claim_in_caption_is_quoted(self):
        finding = check_rule(rule("TTA-001"), "tiktok_ads", {"post.caption": real("Trắng da 100% sau 7 ngày")},
                             Mode.EVIDENCE)
        self.assertEqual(finding.outcome, "needs_review")
        self.assertTrue(any(e.startswith("caption: «") for e in finding.evidence))
        self.assertEqual(finding.quotes[0]["t"], None)

    def test_caption_strong_claim_adds_to_vlm_quotes(self):
        features = {"video.policy_absolute_claims": real([{"text": "trắng bật tông", "timestamp_sec": 4}]),
                    "post.caption": real("Cam kết hoàn tiền, hiệu quả vĩnh viễn")}
        finding = check_rule(rule("TTA-001"), "tiktok_ads", features, Mode.EVIDENCE)
        self.assertEqual(len(finding.evidence), 2)

    def test_promo_word_in_hashtags_and_contact_in_caption(self):
        shp3 = check_rule(rule("SHP-003"), "shopee_listing",
                          {"sku.title": real("Xà phòng TeaShell 100g"), "post.hashtags": real(["hot sale", "xaphong"])},
                          Mode.EVIDENCE)
        self.assertEqual(shp3.outcome, "needs_review")
        self.assertTrue(shp3.evidence[0].startswith("hashtags: «"))
        shp5 = check_rule(rule("SHP-005"), "shopee_listing", {"post.caption": real("Mua sỉ ib zalo 0912345678")},
                          Mode.EVIDENCE)
        self.assertEqual(shp5.outcome, "needs_review")
        self.assertTrue(all(e.startswith("caption:") for e in shp5.evidence))

    def test_clean_caption_never_stands_in_for_an_unchecked_listing(self):
        finding = check_rule(rule("SHP-005"), "shopee_listing", {"post.caption": real("Xà phòng thơm mát")},
                             Mode.EVIDENCE)
        self.assertEqual(finding.outcome, "unknown")  # no description: the rule could not run

    def test_scan_post_copy(self):
        flags = {f["check"]: f for f in scan_post_copy("Cam kết trắng da 100%, ib mình nhé", ["xaphong"])}
        self.assertEqual(flags["absolute_claim_detector"]["outcome"], "needs_review")
        self.assertIn("TTA-001", flags["absolute_claim_detector"]["rule_ids"])
        self.assertIn("META-001", flags["absolute_claim_detector"]["rule_ids"])
        self.assertEqual(flags["offplatform_contact_check"]["rule_ids"], ["SHP-005"])
        self.assertEqual(scan_post_copy("Xà phòng thơm mát, dùng hằng ngày", ["xaphong"]), [])

    def test_caption_finding_gets_a_caption_fix(self):
        features = {"post.caption": real("Trắng da 100% sau 7 ngày")}
        finding = check_rule(rule("TTA-001"), "tiktok_ads", features, Mode.EVIDENCE)
        from dataclasses import asdict
        policy = {"targets": {"tiktok_ads": {"findings": [asdict(finding)]}}}
        fix = fixes.policy_fixes(policy, fixes.post_copy_text(features))[0]
        self.assertTrue(fix["in_caption"])
        self.assertIn("caption", fix["title"])
        self.assertIn("100%", fix["action"])
        self.assertEqual(fix["timestamps"], [])
        plain = fixes.policy_fixes(policy)[0]  # no caption known: the video template
        self.assertFalse(plain["in_caption"])


# ---------- Shopee link resolver ----------

class ShopeeResolveTest(unittest.TestCase):
    COLLECTIONS = {"shopeeListings": [{"id": "L2", "sku_title": "Men Stay Cleanser 100g", "shopee_url": ITEM_URL,
                                       "price_vnd": 135000, "rating": 4.8, "review_count": 50,
                                       "mock_fields": ["review_count"], "noted_on": "2026-10-31",
                                       "source_status": "REAL"}],
                   "marketSnapshots": [], "skus": []}
    API_ITEM = {"data": {"item": {"title": "Sữa rửa mặt Men Stay", "price_min": 13500000000,
                                  "price_before_discount": 15000000000, "historical_sold": 812,
                                  "item_rating": {"rating_star": 4.876, "rating_count": [321, 1, 2, 3, 15, 300]},
                                  "description": "Sạch dầu", "images": ["abc"],
                                  "categories": [{"display_name": "Sắc Đẹp"}, {"display_name": "Chăm sóc da"}]}}}

    def test_parse_ids(self):
        self.assertEqual(shopee_listing.parse_ids(ITEM_URL), ("1054347666", "54754418436"))
        self.assertEqual(shopee_listing.parse_ids("https://shopee.vn/product/12/34?x=1"), ("12", "34"))
        self.assertEqual(shopee_listing.parse_ids("https://shopee.vn/shopname/12/34"), ("12", "34"))
        self.assertIsNone(shopee_listing.parse_ids("https://shopee.vn/teashell.vn"))

    def test_only_shopee_hosts(self):
        for url in ("https://evil.example/x-i.1.2", "ftp://shopee.vn/x-i.1.2", "https://shopee.vn.evil.io/x-i.1.2"):
            with self.assertRaises(shopee_listing.NotShopeeLink):
                shopee_listing.check_url(url)

    def test_live_fetch(self):
        http = FakeHttp({shopee_listing.API_URL: Response(200, self.API_ITEM)})
        out = shopee_listing.resolve(ITEM_URL, lambda: self.fail("crawled data must not be read"), http)
        self.assertEqual(out["source"], "live")
        listing = out["listing"]
        self.assertEqual((listing["price_vnd"], listing["list_price_vnd"], listing["sold"]), (135000, 150000, 812))
        self.assertEqual((listing["rating"], listing["rating_count"]), (4.88, 321))
        self.assertEqual(listing["category"], "Sắc Đẹp > Chăm sóc da")
        self.assertTrue(listing["images"][0].endswith("/abc"))
        self.assertEqual(len(http.calls), 1)  # one attempt, never retried

    def test_blocked_fetch_falls_back_to_crawled_without_mock_fields(self):
        http = FakeHttp({shopee_listing.API_URL: Response(403, {"error": 90309999})})
        out = shopee_listing.resolve(ITEM_URL, lambda: self.COLLECTIONS, http)
        self.assertEqual((out["source"], out["crawled_at"]), ("crawled", "2026-10-31"))
        self.assertEqual(out["listing"]["price_vnd"], 135000)
        self.assertIsNone(out["listing"]["rating_count"])  # synthetic in the crawl: never shown as observed
        self.assertEqual([a["method"] for a in out["attempts"]], ["live_api", "crawled_db"])
        self.assertEqual([a["ok"] for a in out["attempts"]], [False, True])

    def test_shortlink_is_followed_once(self):
        http = FakeHttp({"https://shp.ee/": Response(302, None, {"location": ITEM_URL}),
                         shopee_listing.API_URL: httpx.ConnectTimeout("timeout")})
        out = shopee_listing.resolve("https://shp.ee/abc", lambda: self.COLLECTIONS, http)
        self.assertEqual(out["listing"]["item_id"], "54754418436")
        self.assertEqual(out["attempts"][0], {"method": "follow_shortlink", "ok": True, "error": None})

    def test_nothing_found(self):
        http = FakeHttp({shopee_listing.API_URL: Response(200, {"error": 4, "data": None})})
        with self.assertRaises(LookupError) as ctx:
            shopee_listing.resolve("https://shopee.vn/x-i.1.2", lambda: self.COLLECTIONS, http)
        self.assertIn("nhập", ctx.exception.args[0])
        self.assertEqual(len(ctx.exception.args[1]), 2)


# ---------- API ----------

class ApiTestCase(unittest.TestCase):
    def setUp(self):
        self.db = PatchableDb()
        for name, fn in (("get", self.db.get), ("post", self.db.post), ("patch", self.db.patch)):
            p = mock.patch.object(db_client, name, fn)
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(api.app)


class PostAndQuestionsApiTest(ApiTestCase):
    def test_patch_post_changes_only_given_keys(self):
        res = self.client.patch(f"/py/videos/{VIDEO}/post",
                                json={"caption": " Xà phòng TeaShell ", "hashtags": "#xaphong, trangda"})
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["post"], {"caption": "Xà phòng TeaShell", "hashtags": ["xaphong", "trangda"]})
        res = self.client.patch(f"/py/videos/{VIDEO}/post",
                                json={"sponsorship": "affiliate", "disclosure_enabled": True, "goal": "Tăng đơn",
                                      "platforms": ["tiktok_shop_video"]})
        post = res.json()["post"]
        self.assertEqual(post["caption"], "Xà phòng TeaShell")  # untouched
        self.assertEqual((post["sponsorship"], post["disclosure_enabled"]), ("affiliate", True))

    def test_patch_post_validation(self):
        bad = [{"platforms": ["myspace"]}, {"sponsorship": "friend"}, {"hashtags": [f"t{i}" for i in range(31)]},
               {"unknown": 1}, {}]
        for body in bad:
            with self.subTest(body=body):
                self.assertIn(self.client.patch(f"/py/videos/{VIDEO}/post", json=body).status_code, (400, 422))
        self.assertEqual(self.client.patch("/py/videos/NOPE/post", json={"caption": "x"}).status_code, 404)

    def test_upload_stores_caption_and_hashtags(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(api, "DATA_DIR", Path(tmp)):
            res = self.client.post("/py/videos/upload", files={"file": ("a.mp4", b"fake", "video/mp4")},
                                   data={"caption": "Xà phòng", "hashtags": ["#xaphong", "trangda,review"]})
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["post"]["hashtags"], ["xaphong", "trangda", "review"])
        self.assertEqual(res.json()["post"]["caption"], "Xà phòng")

    def test_question_bank(self):
        body = self.client.get("/py/questions").json()
        ids = [q["id"] for q in body["questions"]]
        self.assertEqual(len(ids), len(decision_scorer.load_bank()["questions"]))
        q = next(q for q in body["questions"] if q["id"] == "V01")
        for key in ("group", "dimension", "type", "weight", "instructions", "levels", "required_features"):
            self.assertIn(key, q)
        self.assertEqual(set(q["levels"][0]), {"label", "description"})


class ResolveApiTest(ApiTestCase):
    def resolve(self, url: str, http: FakeHttp):
        with mock.patch.object(shopee_listing.httpx, "Client", lambda: http):
            return self.client.post("/py/listings/resolve", json={"url": url})

    def test_crawled_fallback_from_db(self):
        res = self.resolve(ITEM_URL, FakeHttp({shopee_listing.API_URL: Response(403)}))
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["source"], "crawled")
        self.assertEqual(res.json()["crawled_from"], "shopeeListings/vn-beauty-344788-L2")

    def test_not_found_and_not_shopee(self):
        res = self.resolve("https://shopee.vn/abc-i.1.2", FakeHttp({shopee_listing.API_URL: Response(403)}))
        self.assertEqual(res.status_code, 404)
        self.assertIn("nhập", res.json()["detail"]["message"])
        self.assertEqual(self.resolve("https://example.com/a-i.1.2", FakeHttp({})).status_code, 400)


@unittest.skipUnless(HAS_CACHE, "needs cached TeaShell features")
class CaptionSuggestApiTest(ApiTestCase):
    ANSWER = {"caption": "Xà phòng TeaShell cam kết trắng da 100% ✨", "hashtags": ["#xaphong", "teashell", "trangda"],
              "rationale": "Video nhấn mạnh tạo bọt."}

    def setUp(self):
        super().setUp()
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        p = mock.patch.object(caption_writer, "CACHE_DIR", Path(tmp.name))
        p.start()
        self.addCleanup(p.stop)
        self.calls = []

    def suggest(self, answer: dict, video: str = VIDEO):
        with mock.patch.object(api, "_openai_client", lambda: chat_client(json.dumps(answer), self.calls)):
            return self.client.post(f"/py/videos/{video}/caption-suggest")

    def test_live_then_cache_with_policy_flags(self):
        first = self.suggest(self.ANSWER)
        self.assertEqual(first.status_code, 200, first.text)
        body = first.json()
        self.assertEqual((body["source"], body["hashtags"]), ("live call", ["xaphong", "teashell", "trangda"]))
        self.assertEqual(body["token_usage"], {"prompt_tokens": 900, "completion_tokens": 120})
        self.assertIn("TTA-001", {r for f in body["policy_flags"] for r in f["rule_ids"]})  # shown, not hidden
        sent = json.loads(self.calls[0]["messages"][1]["content"])
        self.assertTrue(sent["video"]["transcript"])
        self.assertEqual(sent["product"]["title"], "Xà phòng trắng da TeaShell")  # the attached SKU
        self.assertEqual(sent["market"]["keyword"], "Xà phòng trắng da TeaShell")  # crawled snapshot
        second = self.suggest(self.ANSWER)
        self.assertEqual(second.json()["source"], "cache")
        self.assertEqual(len(self.calls), 1)

    def test_unusable_answer_is_not_cached(self):
        res = self.suggest({**self.ANSWER, "hashtags": ["one"]})
        self.assertEqual(res.status_code, 502)
        self.assertEqual(list(caption_writer.CACHE_DIR.glob("*.json")), [])

    def test_video_without_extraction_is_404(self):
        self.db.data["videos"].append({"id": "UPL-none", "shop_id": None, "sku_id": None,
                                       "local_file": "upl-none.mp4"})
        self.assertEqual(self.suggest(self.ANSWER, "UPL-none").status_code, 404)
        self.assertEqual(self.calls, [])


# ---------- SSE payload the UI reads ----------

@unittest.skipUnless(HAS_CACHE, "needs cached TeaShell features")
class StreamPayloadTest(ApiTestCase):
    def run_stream(self) -> list:
        res = self.client.get(f"/py/videos/{VIDEO}/analyze/stream?extract=never&policy_llm=false")
        return parse_sse(res.text)

    def test_decisions_step_and_done_carry_what_the_ui_draws(self):
        events = self.run_stream()
        step = next(d for e, d in events if e == "step_finished" and d["name"] == "ask_decisions_api")
        self.assertTrue(step["output"]["questions"])
        for q in step["output"]["questions"]:  # answered or not, every row can be drawn
            for key in ("id", "group", "domain", "dimension", "type", "weight", "instructions", "levels", "status",
                        "value", "inputs", "required_features"):
                self.assertIn(key, q)
        result = events[-1][1]["analysis"]["result"]
        for key in ("overall", "fixes", "markers", "insights"):
            self.assertIn(key, result)
        for q in step["output"]["questions"]:
            for name in q["inputs"]:
                self.assertEqual(set(result["features"][name]) >= {"status", "value", "source", "evidence"}, True)

    def test_caption_flows_into_the_run(self):
        video = self.db.get(f"/videos/{VIDEO}")
        video["post"] = {"caption": "Cam kết trắng da 100% sau 7 ngày", "hashtags": ["xaphong"]}
        result = self.run_stream()[-1][1]["analysis"]["result"]
        self.assertEqual(result["features"]["post.caption"]["source"], "seller")
        tta = next(f for f in result["policy"]["targets"]["tiktok_ads"]["findings"] if f["rule_id"] == "TTA-001")
        self.assertTrue(any(e.startswith("caption: «") for e in tta["evidence"]))


if __name__ == "__main__":
    unittest.main()
