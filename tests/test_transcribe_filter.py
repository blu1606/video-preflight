"""Run: uv run python -m unittest tests.test_transcribe_filter (from video_understanding/demo). No ffmpeg, no API."""

import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from sources import extractor


def _segment(start, end, text, no_speech, logprob):
    return SimpleNamespace(start=start, end=end, text=text, no_speech_prob=no_speech, avg_logprob=logprob)


class _FakeTranscriptions:
    def __init__(self, result):
        self.result = result

    def create(self, **kwargs):
        return self.result


def _fake_ffmpeg(cmd, **kwargs):
    Path(cmd[-1]).write_bytes(b"audio")  # the audio file transcribe() opens next


class TranscribeFilterTest(unittest.TestCase):
    def _transcribe(self, result):
        client = SimpleNamespace(audio=SimpleNamespace(transcriptions=_FakeTranscriptions(result)))
        with mock.patch.object(extractor.subprocess, "run", side_effect=_fake_ffmpeg):
            return extractor.transcribe(client, Path("video.mp4"))

    def test_silence_hallucination_is_dropped_from_text_and_segments(self):
        result = SimpleNamespace(text=" hello there Thanks for watching", segments=[
            _segment(0, 2, " hello there", 0.05, -0.3),
            _segment(2, 4, " Thanks for watching", 0.85, -1.6),  # likely silence and unsure: dropped
        ])
        text, segments = self._transcribe(result)
        self.assertEqual(text, "hello there")
        self.assertEqual([s["text"] for s in segments], ["hello there"])
        self.assertEqual(segments[0]["no_speech_prob"], 0.05)
        self.assertEqual(segments[0]["avg_logprob"], -0.3)

    def test_high_silence_but_confident_segment_is_kept(self):
        result = SimpleNamespace(text=" quiet words", segments=[_segment(0, 2, " quiet words", 0.9, -0.4)])
        text, segments = self._transcribe(result)
        self.assertEqual(text, " quiet words")  # nothing dropped: the API text is used as is
        self.assertEqual(len(segments), 1)

    def test_old_style_segments_without_the_fields_are_all_kept(self):
        result = SimpleNamespace(text="a b", segments=[SimpleNamespace(start=0, end=1, text=" a"),
                                                       SimpleNamespace(start=1, end=2, text=" b")])
        text, segments = self._transcribe(result)
        self.assertEqual(text, "a b")
        self.assertEqual([s["text"] for s in segments], ["a", "b"])
        self.assertIsNone(segments[0]["no_speech_prob"])

    def test_every_segment_dropped_means_no_speech(self):
        result = SimpleNamespace(text=" thanks", segments=[_segment(0, 2, " thanks", 0.99, -2.0)])
        text, segments = self._transcribe(result)
        self.assertEqual((text, segments), ("", []))


if __name__ == "__main__":
    unittest.main()
