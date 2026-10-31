"""Run: uv run python -m unittest tests.test_music (from video_understanding/demo). No network: a fake Shazam;
ffmpeg/ffprobe are replaced by stubs."""

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from core.schema import SourceStatus
from sources import music
from sources.providers import MusicProvider

SHAZAM_TRACK = {"track": {"title": "Turn on the Light Tonight", "subtitle": "David Reed",
                          "url": "https://www.shazam.com/track/870286729/turn-on-the-light-tonight"}}
NO_MATCH = {"matches": []}


class FakeShazam:
    """Answers each recognize() call from `answers` in order; an Exception instance is raised."""
    calls = 0
    answers: list = []

    def __init__(self, *args, **kwargs):
        pass

    async def recognize(self, path):
        FakeShazam.calls += 1
        answer = FakeShazam.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    async def close(self):
        pass


class MusicTestCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        patches = [
            mock.patch.object(music, "CACHE_DIR", root / "music"),
            mock.patch.object(music, "Shazam", FakeShazam),
            mock.patch.object(music, "_duration", return_value=22.0),
            mock.patch.object(music, "_cut", return_value=None),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.cache_dir = root / "music"
        FakeShazam.calls = 0
        FakeShazam.answers = []
        self.video = Path("video-a.mp4")

    def tearDown(self):
        self._tmp.cleanup()


class IdentifyTest(MusicTestCase):
    def test_windows_start_then_middle_and_short_video_is_one_window(self):
        self.assertEqual(music._windows(22.0), [(0.0, 12.0), (5.0, 12.0)])
        self.assertEqual(music._windows(8.0), [(0.0, 8.0)])

    def test_match_on_the_middle_window_after_the_start_misses(self):
        FakeShazam.answers = [NO_MATCH, SHAZAM_TRACK]
        record = music.identify(self.video)
        self.assertEqual(record["status"], "matched")
        self.assertEqual(record["title"], "Turn on the Light Tonight")
        self.assertEqual(record["artist"], "David Reed")
        self.assertEqual(record["matched_window"], {"start_sec": 5.0, "end_sec": 17.0})
        self.assertEqual(record["tool"], music.TOOL)
        self.assertEqual(FakeShazam.calls, 2)

    def test_stops_at_the_first_match(self):
        FakeShazam.answers = [SHAZAM_TRACK]
        music.identify(self.video)
        self.assertEqual(FakeShazam.calls, 1)

    def test_no_match_after_both_windows(self):
        FakeShazam.answers = [NO_MATCH, NO_MATCH]
        record = music.identify(self.video)
        self.assertEqual(record["status"], "no_match")
        self.assertIsNone(record.get("title"))

    def test_track_without_title_is_no_match(self):
        FakeShazam.answers = [{"track": {}}, {"track": {}}]
        self.assertEqual(music.identify(self.video)["status"], "no_match")

    def test_network_failure_is_an_error_record(self):
        FakeShazam.answers = [ConnectionError("offline"), ConnectionError("offline")]
        record = music.identify(self.video)
        self.assertEqual(record["status"], "error")
        self.assertIn("ConnectionError", record["reason"])


class RunCacheTest(MusicTestCase):
    def test_identify_result_is_cached_per_video_and_a_rerun_calls_nothing(self):
        FakeShazam.answers = [SHAZAM_TRACK]
        first = music.run(self.video)
        self.assertEqual(first["status"], "matched")
        self.assertTrue((self.cache_dir / "video-a.json").exists())

        with mock.patch.object(music, "Shazam", side_effect=AssertionError("Shazam must not run")):
            again = music.run(self.video)
        self.assertEqual(again["title"], "Turn on the Light Tonight")

    def test_error_is_not_cached_so_the_next_run_retries(self):
        FakeShazam.answers = [ConnectionError("offline"), ConnectionError("offline")]
        self.assertEqual(music.run(self.video)["status"], "error")
        self.assertFalse((self.cache_dir / "video-a.json").exists())

    def test_no_match_is_cached(self):
        FakeShazam.answers = [NO_MATCH, NO_MATCH]
        self.assertEqual(music.run(self.video)["status"], "no_match")
        self.assertTrue((self.cache_dir / "video-a.json").exists())


class MusicProviderTest(MusicTestCase):
    def test_match_is_real_from_shazamio(self):
        FakeShazam.answers = [SHAZAM_TRACK]
        features = MusicProvider(music.run(self.video)).load()
        self.assertEqual(features["video.music"].status, SourceStatus.REAL)
        self.assertEqual(features["video.music"].source, "shazamio")
        self.assertEqual(features["video.music"].value["title"], "Turn on the Light Tonight")
        self.assertNotIn("video.music_web", features)

    def test_no_match_leaves_the_feature_missing_with_a_reason(self):
        FakeShazam.answers = [NO_MATCH, NO_MATCH]
        features = MusicProvider(music.run(self.video)).load()
        self.assertIsNone(features["video.music"].value)
        self.assertEqual(features["video.music"].status, SourceStatus.MISSING)


if __name__ == "__main__":
    unittest.main()
