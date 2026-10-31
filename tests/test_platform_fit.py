import copy
import json
import unittest

from core import platform_fit as fit
from core.schema import Feature, SourceStatus
from sources.providers import MusicProvider

TRACK_RECORD = {
    "status": "matched", "title": "Turn on the Light Tonight", "artist": "David Reed", "tool": "ShazamIO",
}
CML_URL = "https://seller-vn.tiktok.com/university/essay?knowledge_id=6837780084770561"
SHOPEE_VIDEO_URL = ("https://help.shopee.vn/portal/10/article/185893-Quy-%C4%91%E1%BB%8Bnh-%C4%91%C4%83ng-Shopee-Video-"
                    "v%C3%A0-c%C3%A1c-h%C3%ACnh-th%E1%BB%A9c-x%E1%BB%AD-l%C3%BD-vi-ph%E1%BA%A1m")


def _features(duration=10.0, width=576, height=1024, size=1_000_000, container="mp4", clear=0.0):
    """A measured video: every feature the checks read is REAL unless passed as None (-> unmeasured)."""
    def real(value, source="opencv"):
        return Feature(value, SourceStatus.REAL, source) if value is not None else Feature.missing("not measured")
    return {
        "video.duration_sec": real(duration),
        "video.width_px": real(width),
        "video.height_px": real(height),
        "video.file_size_bytes": real(size, "file"),
        "video.container": real(container, "file"),
        "video.product_first_clear_sec": real(clear, "vlm"),
    }


def _by_id(report, target):
    return {c["id"]: c for c in report["targets"][target]["checks"]}


class PlatformFitStatusTest(unittest.TestCase):
    def test_measured_video_passes_official_limits(self):
        checks = _by_id(fit.evaluate(_features()), "tiktok_ads")
        self.assertEqual(checks["ads.duration_max"]["status"], "pass")
        self.assertEqual(checks["ads.file_size"]["status"], "pass")
        self.assertEqual(checks["ads.file_format"]["status"], "pass")
        self.assertEqual(checks["ads.resolution"]["status"], "pass")
        self.assertEqual(checks["ads.aspect"]["status"], "pass")

    def test_hard_limit_breach_fails(self):
        checks = _by_id(fit.evaluate(_features(duration=700.0)), "tiktok_ads")
        self.assertEqual(checks["ads.duration_max"]["status"], "fail")
        self.assertEqual(checks["ads.duration_max"]["measured"], "700 s")

    def test_soft_recommendation_miss_is_a_tip_not_a_fail(self):
        # 576 px short side is below the 720p recommendation: a tip, never a fail
        checks = _by_id(fit.evaluate(_features()), "tiktok_ads")
        self.assertEqual(checks["ads.resolution_rec"]["status"], "tip")
        self.assertEqual(checks["ads.resolution_rec"]["kind"], "soft")

    def test_shopee_hard_format_and_size_limits(self):
        checks = _by_id(fit.evaluate(_features(container="mov")), "shopee_listing")
        self.assertEqual(checks["shopee.file_format"]["status"], "fail")  # Shopee accepts MP4 only
        self.assertEqual(checks["shopee.duration"]["status"], "pass")  # 10.0 s sits on the 10 s lower bound
        self.assertEqual(checks["shopee.resolution"]["status"], "pass")

    def test_shopee_resolution_above_limit_fails(self):
        checks = _by_id(fit.evaluate(_features(width=1440, height=1440)), "shopee_listing")
        self.assertEqual(checks["shopee.resolution"]["status"], "fail")

    def test_landscape_frame_has_no_vertical_minimum(self):
        checks = _by_id(fit.evaluate(_features(width=1920, height=1080)), "tiktok_ads")
        self.assertEqual(checks["ads.resolution"]["status"], "unverified")
        self.assertIn("khung dọc", checks["ads.resolution"]["note"])


class PlatformFitUnverifiedTest(unittest.TestCase):
    def test_not_found_spec_is_unverified_even_when_measured(self):
        checks = _by_id(fit.evaluate(_features()), "tiktok_shop_video")
        self.assertEqual(checks["shop.duration"]["status"], "unverified")
        self.assertIsNone(checks["shop.duration"]["measured"])
        self.assertEqual(checks["shop.duration"]["sources"], [])

    def test_meta_is_all_unverified_because_its_pages_need_login(self):
        report = fit.evaluate(_features())
        meta = report["targets"]["meta_ads"]
        self.assertTrue(meta["checks"])
        self.assertTrue(all(c["status"] == "unverified" for c in meta["checks"]))
        self.assertTrue(all("đăng nhập" in c["note"] for c in meta["checks"]))
        self.assertEqual(meta["summary"]["unverified"], len(meta["checks"]))

    def test_spot_check_not_matched_downgrades_to_unverified(self):
        # the SMB 21-34 s quote was not found on its page: this row never passes or fails
        checks = _by_id(fit.evaluate(_features(duration=25.0)), "tiktok_ads")
        self.assertEqual(checks["ads.duration_rec_smb"]["status"], "unverified")
        self.assertIn("không khớp", checks["ads.duration_rec_smb"]["note"])

    def test_ambiguous_unit_is_shown_as_written_not_judged(self):
        checks = _by_id(fit.evaluate(_features(size=5_000_000_000)), "shopee_listing")
        self.assertEqual(checks["shopee.file_size"]["status"], "unverified")
        self.assertIn("nguyên văn", checks["shopee.file_size"]["note"])
        self.assertIn("30Mb", checks["shopee.file_size"]["spec"])

    def test_unverified_rows_still_carry_their_source_chip(self):
        checks = _by_id(fit.evaluate(_features()), "meta_ads")
        source = checks["meta.duration"]["sources"][0]
        self.assertTrue(source["url"].startswith("https://www.facebook.com/"))
        self.assertIsNone(source["quote"])


class PlatformFitUnmeasuredTest(unittest.TestCase):
    def test_music_without_a_song_is_unmeasured_on_ads_and_unverified_on_shop(self):
        ads = _by_id(fit.evaluate(_features()), "tiktok_ads")["ads.music"]
        self.assertEqual(ads["status"], "unmeasured")
        self.assertIn("nhạc", ads["note"])
        # the shop rule has a quote that did not match its page, so the check cannot be shown as measured or passed
        shop = _by_id(fit.evaluate(_features()), "tiktok_shop_video")["shop.music"]
        self.assertEqual(shop["status"], "unverified")
        self.assertEqual([s["url"] for s in shop["sources"]], [CML_URL])  # the not_matched quote is not a source

    def test_missing_features_make_checks_unmeasured_not_failed(self):
        features = _features()
        features["video.duration_sec"] = Feature.missing("video file not available")
        features["video.product_first_clear_sec"] = Feature.missing("product_visibility unavailable")
        checks = _by_id(fit.evaluate(features), "tiktok_ads")
        self.assertEqual(checks["ads.duration_max"]["status"], "unmeasured")
        self.assertIn("duration", checks["ads.duration_max"]["note"])
        self.assertEqual(checks["ads.product_clear"]["status"], "unmeasured")
        self.assertEqual(checks["ads.file_size"]["status"], "pass")  # other measures still count

    def test_empty_feature_map_leaves_every_measured_check_unmeasured(self):
        report = fit.evaluate({})
        statuses = {c["status"] for t in report["targets"].values() for c in t["checks"]}
        self.assertNotIn("pass", statuses)
        self.assertNotIn("fail", statuses)
        self.assertNotIn("tip", statuses)


class PlatformFitConflictTest(unittest.TestCase):
    def test_soft_conflict_keeps_both_ranges_as_separate_soft_checks(self):
        checks = _by_id(fit.evaluate(_features(duration=12.0)), "tiktok_ads")
        reservation = checks["ads.duration_rec_reservation"]
        smb = checks["ads.duration_rec_smb"]
        self.assertEqual(reservation["kind"], "soft")
        self.assertEqual(reservation["status"], "pass")  # 12 s is inside 9-15 s
        self.assertEqual(smb["kind"], "soft")
        self.assertEqual(smb["status"], "unverified")  # its own quote failed the spot-check

    def test_conflict_on_hard_limit_is_unverified_not_failed(self):
        specs = copy.deepcopy(fit.load_specs())
        spec = specs["specs"]["tiktok_ads.in_feed_ads.duration_max.auction_non_spark"]
        spec["conflict"] = True
        checks = _by_id(fit.evaluate(_features(duration=700.0), specs), "tiktok_ads")
        self.assertEqual(checks["ads.duration_max"]["status"], "unverified")
        self.assertIn("mâu thuẫn", checks["ads.duration_max"]["note"])


class PlatformFitSummaryTest(unittest.TestCase):
    def test_summary_counts_every_check_once(self):
        report = fit.evaluate(_features())
        total = sum(len(t["checks"]) for t in report["targets"].values())
        self.assertEqual(sum(report["summary"].values()), total)
        self.assertEqual(set(report["summary"]), set(fit.STATUSES))

    def test_every_check_has_a_vietnamese_label_and_a_status(self):
        report = fit.evaluate(_features())
        for target in report["targets"].values():
            for c in target["checks"]:
                self.assertTrue(c["label"])
                self.assertIn(c["status"], fit.STATUSES)


class PlatformFitMusicTest(unittest.TestCase):
    """Background music: an identified song is a fact; the rights verdict never becomes pass or fail."""

    def _checks(self, record, target="tiktok_shop_video"):
        return _by_id(fit.evaluate({**_features(), **MusicProvider(record).load()}), target)

    def test_identified_song_fills_measured_and_stays_unverified(self):
        check = self._checks(TRACK_RECORD)["shop.music"]
        self.assertEqual(check["status"], "unverified")
        self.assertEqual(check["measured"], "Turn on the Light Tonight — David Reed")
        self.assertIn("chưa xác minh quyền sử dụng", check["note"])
        self.assertIn(fit.MUSIC_NOTE, check["note"])  # the TikTok check tells the seller to check the CML app

    def test_song_is_not_a_source_and_no_web_kind_is_left(self):
        sources = self._checks(TRACK_RECORD)["shop.music"]["sources"]
        self.assertTrue(all(s["kind"] == "official" for s in sources))
        self.assertNotIn("https://help.shopee.vn/portal/4/article/125582", [s["url"] for s in sources])

    def test_identified_song_on_shopee_uses_the_shopee_video_rule(self):
        check = self._checks(TRACK_RECORD, "shopee_listing")["shopee.music"]
        self.assertEqual(check["status"], "unverified")
        self.assertEqual(check["measured"], "Turn on the Light Tonight — David Reed")
        self.assertIn("Quy định Shopee Video", check["spec"])
        self.assertEqual([s["url"] for s in check["sources"]], [SHOPEE_VIDEO_URL])
        self.assertNotIn(fit.MUSIC_NOTE, check["note"])  # the CML line is for TikTok checks only

    def test_unidentified_music_on_shopee_stays_unmeasured(self):
        check = self._checks({"status": "no_match", "reason": "Shazam không nhận diện được"},
                             "shopee_listing")["shopee.music"]
        self.assertEqual(check["status"], "unmeasured")
        self.assertIsNone(check["measured"])
        self.assertIn("nhạc", check["note"])

    def test_not_matched_quote_is_never_a_source(self):
        specs = fit.load_specs()["specs"]
        self.assertEqual(specs["tiktok_shop.shoppable_video.music_violation"]["spot_check"], "not_matched")
        quotes = [s["quote"] for s in self._checks(TRACK_RECORD)["shop.music"]["sources"]]
        self.assertNotIn("the video will be muted.", quotes)


class PlatformSpecsFileTest(unittest.TestCase):
    def test_every_curated_quote_is_in_the_raw_collection(self):
        raw = json.loads(fit.SPECS_PATH.with_name("raw").joinpath(
            "platform_video_specs_vn_2026-10-30.json").read_text(encoding="utf-8"))
        raw_quotes = {r["quote"] for r in raw["specs"] if r.get("quote")}
        curated = fit.load_specs()["specs"].values()
        for spec in curated:
            if spec.get("quote"):
                self.assertIn(spec["quote"], raw_quotes)

    def test_not_found_specs_never_carry_a_value_or_source(self):
        for key, spec in fit.load_specs()["specs"].items():
            if spec["status"] == "not_found":
                self.assertIsNone(spec["value"], key)
                self.assertIsNone(spec["source_url"], key)


if __name__ == "__main__":
    unittest.main()
