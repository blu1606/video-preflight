"""Run: uv run python -m unittest tests.test_insights (from video_understanding/demo). No API call: fake client."""

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from sources import insights
from tests.test_insight_candidates import result


def by_lens(sheet, lens):
    return next(c["id"] for c in sheet["candidates"] if c["lens"] == lens)


def answer_for(sheet):
    return {
        "headline": "Video giữ được người xem nhưng gần như không ai bấm vào sản phẩm.",
        "summary": "Có 116.710 lượt xem nhưng chỉ 0,3% bấm vào sản phẩm.",
        "insights": [
            {"candidate": by_lens(sheet, "funnel"),
             "text": "Video có 116.710 lượt xem nhưng chỉ 0,3% người xem bấm vào sản phẩm.", "tone": "bad",
             "cites": [{"kind": "criterion", "id": "FORGED"}]},  # citations are ignored: the code attaches them
            {"candidate": by_lens(sheet, "audience"),
             "text": "Người xem video là nữ 18-24, còn 52% khách mua SKU này là nam.", "tone": "info"},
            {"candidate": "c99", "text": "Bán thêm 777 đơn.", "tone": "good"},
            {"candidate": by_lens(sheet, "funnel"), "text": "Trùng.", "tone": "bad"},
            {"candidate": by_lens(sheet, "what_if"), "text": "Thêm 12345 điểm nữa.", "tone": "good"},
        ],
        "policy": None,
        "shop": None,
    }


class FakeClient:
    def __init__(self, answer):
        self.calls = 0
        self.answer = answer
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.calls += 1
        msg = SimpleNamespace(content=json.dumps(self.answer, ensure_ascii=False))
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)],
                               usage=SimpleNamespace(prompt_tokens=100, completion_tokens=20))


class InsightsTest(unittest.TestCase):
    def setUp(self):
        p = mock.patch.object(insights, "CACHE_DIR", Path(tempfile.mkdtemp()) / "insights")
        p.start()
        self.addCleanup(p.stop)

    def test_sheet_separates_candidates_from_what_is_on_screen(self):
        sheet = insights.facts(result())
        self.assertEqual([c["lens"] for c in sheet["candidates"]], ["funnel", "audience", "price", "what_if", "benchmark"])
        self.assertEqual([c["id"] for c in sheet["already_on_screen"]["weak_criteria"]], ["C08", "C07", "C02", "C03"])
        sent = insights.model_view(sheet)
        self.assertNotIn("cites", json.dumps(sent))  # the model never sees citations
        self.assertEqual(sent["candidates"][0]["id"], "c1")

    def test_only_candidate_ids_are_kept_and_citations_come_from_code(self):
        sheet = insights.facts(result())
        clean, dropped = insights.validate(answer_for(sheet), sheet)
        self.assertEqual([i["candidate"] for i in clean["insights"]], ["c1", "c2"])
        funnel = clean["insights"][0]
        self.assertEqual(funnel["cites"], next(c["cites"] for c in sheet["candidates"] if c["lens"] == "funnel"))
        self.assertEqual(funnel["refs"], ["C08", "C07"])
        self.assertEqual(funnel["t"], None)
        self.assertEqual(clean["insights"][1]["tone"], "info")
        self.assertTrue(any("c99" in d for d in dropped))  # unknown id
        self.assertTrue(any("used twice" in d for d in dropped))  # repeated candidate
        self.assertTrue(any("insights[4].text" in d and "12345" in d for d in dropped))  # invented number

    def test_numbers_in_vietnamese_format_are_checked_against_facts(self):
        sheet = insights.facts(result())
        clean, _ = insights.validate(answer_for(sheet), sheet)
        self.assertEqual(clean["headline"], answer_for(sheet)["headline"])
        self.assertEqual(clean["summary"], answer_for(sheet)["summary"])  # 116.710 and 0,3 are in the facts
        self.assertEqual(clean["insights"][0]["text"].count("116.710"), 1)  # kept as written

    def test_placeholder_reference_is_named_as_such(self):
        sheet = insights.facts(result())
        text = "Chỉ 0,3% bấm vào sản phẩm, dưới mốc tạm tự đặt 2%."
        clean, dropped = insights.validate({"insights": [{"candidate": by_lens(sheet, "funnel"), "text": text,
                                                         "tone": "bad"}]}, sheet)
        self.assertEqual([i["text"] for i in clean["insights"]], [text])
        self.assertEqual(dropped, [])
        self.assertIn("mốc tạm tự đặt", insights.SYSTEM_PROMPT)

    def test_reference_called_a_standard_is_dropped(self):
        sheet = insights.facts(result())
        for text in ("Chỉ 0,3% bấm vào sản phẩm, dưới chuẩn ngành 2%.", "Thấp hơn benchmark 2%.",
                     "Dưới mức tham chiếu 2% của ngành."):
            clean, dropped = insights.validate({"insights": [{"candidate": by_lens(sheet, "funnel"), "text": text,
                                                             "tone": "bad"}]}, sheet)
            self.assertEqual(clean["insights"], [], text)
            self.assertTrue(any("standard" in d for d in dropped), text)

    def test_restating_only_what_is_on_screen_is_dropped(self):
        sheet = insights.facts(result())
        sheet["candidates"].append({"id": "c9", "lens": "criterion_restated", "facts": {"score": 0},
                                    "cites": [{"kind": "criterion", "id": "C08"}], "t": None})
        clean, dropped = insights.validate({"insights": [{"candidate": "c9", "text": "CTA chưa rõ.", "tone": "bad"}]},
                                           sheet)
        self.assertEqual(clean["insights"], [])
        self.assertTrue(any("restates" in d for d in dropped))

    def test_headline_numbers_must_come_from_chosen_candidates(self):
        sheet = insights.facts(result())
        clean, dropped = insights.validate({"headline": "Có 777 đơn.", "insights": []}, sheet)
        self.assertIsNone(clean["headline"])
        self.assertTrue(any("headline" in d for d in dropped))

    def test_live_call_then_cache_without_client(self):
        client = FakeClient(answer_for(insights.facts(result())))
        out, info = insights.summarize(result(), "m", lambda: client)
        self.assertEqual((info["status"], info["source"], out["source"]), ("ok", "live call", "live call"))
        self.assertEqual(info["candidates"], 5)
        self.assertEqual(info["kept"], {"insights": 2})
        self.assertEqual(out["groups"], {})
        self.assertEqual(out["fixes"], [])
        again, info = insights.summarize(result(), "m", mock.Mock(side_effect=RuntimeError("no key")))
        self.assertEqual((info["source"], client.calls), ("cache", 1))
        self.assertEqual(again["insights"], out["insights"])

    def test_not_allowed_without_cache_is_skipped(self):
        out, info = insights.summarize(result(), "m", None)
        self.assertEqual((out, info["status"]), (None, "skipped"))

    def test_no_candidates_means_nothing_to_say(self):
        r = result()
        for key in ("perf.product_ctr", "context.target_audience", "listing.price_vnd", "bench.url"):
            r["features"][key] = {"value": None, "status": "MISSING"}
        r["overall"] = {"score": None}
        out, info = insights.summarize(r, "m", mock.Mock(side_effect=AssertionError("must not call")))
        self.assertEqual((out, info["status"]), (None, "skipped"))

    def test_malformed_or_ungrounded_answer_is_an_error_and_not_cached(self):
        out, info = insights.summarize(result(), "m", lambda: FakeClient(["not", "an", "object"]))
        self.assertEqual((out, info["status"]), (None, "error"))
        self.assertFalse(insights.CACHE_DIR.exists())
        out, info = insights.summarize(result(), "m", lambda: FakeClient({"headline": "Bán 777 đơn", "insights": []}))
        self.assertEqual((out, info["status"]), (None, "error"))


if __name__ == "__main__":
    unittest.main()
