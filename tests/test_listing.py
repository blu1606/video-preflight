"""User-entered listing of an uploaded video: sku.* mapping and its use in build_report (C3 claims check)."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from core.schema import Mode, SourceStatus
from main import build_report
from sources import claims
from sources.providers import ListingProvider
from tests.test_extraction_criteria import StubClient, write_cache

LISTING = {"name": "TeaShell soap", "url": "https://shopee.vn/teashell", "title": "TeaShell Niacinamide Soap 100g",
           "description": "Niacinamide, Alpha Arbutin", "price_vnd": 89000, "list_price_vnd": 129000,
           "source": "user_input"}
VERDICT = json.dumps({"claims": [{"claim": "foams well", "verdict": "supported", "listing_evidence": "Soap"}]})


def criterion_score(report, cid):
    return next(c for g in report["scores"] for c in g.criteria if c.id == cid)


class ListingProviderTest(unittest.TestCase):
    def test_filled_fields_are_real_user_input(self):
        f = ListingProvider(LISTING).load()
        expected = {"sku.title": LISTING["title"], "sku.description": LISTING["description"],
                    "sku.price_vnd": 89000, "sku.list_price_vnd": 129000, "sku.has_product_link": True}
        for key, value in expected.items():
            self.assertEqual((f[key].status, f[key].source, f[key].value), (SourceStatus.REAL, "user_input", value))
        for key in ListingProvider.NOT_IN_LISTING:
            self.assertEqual(f[key].status, SourceStatus.MISSING, key)

    def test_name_only_listing_falls_back_and_never_invents(self):
        f = ListingProvider({"name": " TeaShell soap ", "title": "  ", "price_vnd": 0, "list_price_vnd": None}).load()
        self.assertEqual(f["sku.title"].value, "TeaShell soap")
        for key in ("sku.description", "sku.has_product_link", "sku.price_vnd", "sku.list_price_vnd"):
            self.assertEqual(f[key].status, SourceStatus.MISSING, key)


class BuildReportListingTest(unittest.TestCase):
    def test_listing_scores_real_sku_criteria_in_evidence_mode(self):
        report = build_report(None, Mode.EVIDENCE, listing=LISTING)
        self.assertEqual(report["features"]["sku.title"].status, SourceStatus.REAL)
        self.assertEqual(criterion_score(report, "C3").reason, f"{claims.FEATURE} missing: no video features")
        self.assertIsNone(criterion_score(report, "C5").score)  # voucher unknown: not scored, not guessed

    def test_claims_use_listing_text_cache_only_without_llm(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = build_report(write_cache(Path(tmp)), Mode.EVIDENCE, listing=LISTING)
        c3 = criterion_score(report, "C3")
        self.assertIsNone(c3.score)
        self.assertIn("needs a live LLM call", c3.reason)

    def test_claims_with_stubbed_llm_produce_a_score(self):
        client = StubClient(VERDICT)
        with tempfile.TemporaryDirectory() as tmp, mock.patch("openai.OpenAI", return_value=client):
            report = build_report(write_cache(Path(tmp)), Mode.EVIDENCE, listing=LISTING, claims_llm=True)
            cached = json.loads((Path(tmp) / "clip.claims.unknown_sku.json").read_text(encoding="utf-8"))
        self.assertEqual(client.calls, 1)
        self.assertEqual(cached["inputs"]["listing"], f"{LISTING['title']}\n{LISTING['description']}")
        c3 = criterion_score(report, "C3")
        self.assertEqual((c3.score, c3.mock_dependency), (100.0, False))
        self.assertEqual(c3.inputs, [claims.FEATURE])


if __name__ == "__main__":
    unittest.main()
