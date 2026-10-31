"""Run: uv run python -m unittest tests.test_localizer (from video_understanding/demo). No API call: fake client."""

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import cv2
import numpy as np

from sources import localizer


def marker(mid, t, severity="high", kind="issue", localizable=True, precise=True, t_end=None):
    return {"id": mid, "t_start": t, "t_end": t_end, "lane": "policy", "severity": severity, "kind": kind,
            "title": mid, "comment": "c", "source": {}, "evidence": [], "precise": precise,
            "localizable": localizable, "time_label": None, "quote": None}


def region(mid, sec, box=(0.1, 0.2, 0.3, 0.4), confidence=0.9, label="chữ", observation="Có chữ.",
           fix_here="Đưa chữ lên cao."):
    return {"marker_id": mid, "frame_sec": sec, "box": list(box) if box else None, "label": label,
            "observation": observation, "fix_here": fix_here, "confidence": confidence}


class FakeClient:
    def __init__(self, regions):
        self.calls = 0
        self.regions = regions
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.calls += 1
        self.kwargs = kwargs
        msg = SimpleNamespace(content=json.dumps({"regions": self.regions}))
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)],
                               usage=SimpleNamespace(prompt_tokens=100, completion_tokens=20))


def write_jpg(path: Path, w=40, h=72, value=120):
    path.parent.mkdir(parents=True, exist_ok=True)
    img = np.full((h, w, 3), value, np.uint8)
    cv2.imwrite(str(path), img)


class LocalizeTest(unittest.TestCase):
    def setUp(self):
        tmp = Path(tempfile.mkdtemp())
        self.video = tmp / "clip.mp4"
        self.video.write_bytes(b"video bytes")
        for sec in (0, 1, 2, 3, 4, 5, 35, 36):
            write_jpg(tmp / "frames" / "clip" / f"{sec:07.2f}.jpg", value=sec * 6)
        for target, value in (("CACHE_DIR", tmp / "cache"), ("frames_dir", lambda v: tmp / "frames" / v.stem)):
            p = mock.patch.object(localizer, target, value)
            p.start()
            self.addCleanup(p.stop)
        self.markers = [marker("a", 0.2), marker("b", 35.6, "medium"), marker("low", 3, "low"),
                        marker("win", 0, "high", precise=False, t_end=36.0),
                        marker("speech", 2, localizable=False), marker("beat", 0, "info", "beat")]

    def test_regions_merged_checked_and_cached(self):
        client = FakeClient([
            region("a", 0.0, box=(0.1, 0.2, 0.3, 0.4)),
            region("b", 36.0, box=None, label="Thiếu CTA", observation="Không có nút.", fix_here="Thêm nút."),
            region("low", 3.0, box=(0.1, 0.1, 0.2, 0.2), confidence=0.2),
            region("win", 4.0, box=(0.7, 0.85, 0.2, 0.1), label="Thẻ sản phẩm"),
            region("speech", 2.0, box=(0.1, 0.1, 0.1, 0.1)),
        ])
        out, info = localizer.localize(self.markers, self.video, "m", lambda: client)
        by_id = {m["id"]: m for m in out}
        self.assertEqual(by_id["a"]["region"]["box"], [0.1, 0.2, 0.3, 0.4])
        self.assertEqual(by_id["a"]["region"]["frame_sec"], 0.0)
        self.assertEqual(by_id["a"]["region"]["observation"], "Có chữ.")
        self.assertIsNone(by_id["b"]["region"]["box"])
        self.assertEqual(by_id["b"]["region"]["fix_here"], "Thêm nút.")
        self.assertNotIn("region", by_id["low"])
        self.assertNotIn("region", by_id["speech"])
        self.assertNotIn("region", by_id["beat"])
        self.assertEqual(by_id["win"]["region"]["frame_sec"], 4.0)
        self.assertEqual(info["source"], "live call")
        self.assertEqual(sorted(info["boxes"]), ["a", "win"])
        self.assertEqual(info["no_box"], ["b"])
        self.assertIn("low", info["dropped"])
        self.assertEqual(info["token_usage"], {"prompt_tokens": 100, "completion_tokens": 20})
        self.assertEqual(client.calls, 1)

        again, info = localizer.localize(self.markers, self.video, "m", None)  # no client: cache only
        self.assertEqual(info["source"], "cache")
        self.assertEqual(client.calls, 1)
        self.assertEqual({m["id"]: m.get("region") for m in again}, {m["id"]: m.get("region") for m in out})

    def test_request_sends_moment_frames_and_one_contact_sheet(self):
        client = FakeClient([])
        localizer.localize(self.markers, self.video, "m", lambda: client)
        content = client.kwargs["messages"][1]["content"]
        images = [part for part in content if part["type"] == "image_url"]
        # a: 0 s and 1 s; b: 35 s and 36 s; low: 2-4 s; win: one contact sheet of every sampled frame
        self.assertEqual(len(images), 8)
        texts = [part["text"] for part in content if part["type"] == "text"]
        self.assertTrue(any("marker_id=a" in t and "frames at 0s, 1s" in t for t in texts))
        self.assertTrue(any("contact sheet" in t and "marker_id=win" in t for t in texts))
        self.assertTrue(all("marker_id=speech" not in t for t in texts))

    def test_answer_that_echoes_the_prompt_line_resolves_to_its_marker(self):
        echoed = "criterion:C03 · issue: Demonstration clarity — 1 Weak"
        out, info = localizer.localize([marker("criterion:C03", 0, precise=False, t_end=5.0)], self.video, "m",
                                       lambda: FakeClient([region(echoed, 3.0)]))
        self.assertEqual(out[0]["region"]["frame_sec"], 3.0)
        self.assertEqual(info["boxes"], ["criterion:C03"])
        self.assertEqual(localizer.answer_key("criterion:C030 x", ["criterion:C03"]), None)
        self.assertEqual(localizer.answer_key("policy:a:TTA-001:9 x", ["policy:a:TTA-001:9", "policy:a"]),
                         "policy:a:TTA-001:9")

    def test_window_answer_may_pick_any_sampled_second(self):
        client = FakeClient([region("win", 36.0)])
        out, info = localizer.localize([marker("win", 0, precise=False, t_end=36.0)], self.video, "m",
                                       lambda: client)
        self.assertEqual(out[0]["region"]["frame_sec"], 36.0)
        self.assertEqual(info["boxes"], ["win"])

    def test_cache_hit_never_builds_a_client(self):
        client = FakeClient([region("a", 0.0)])
        localizer.localize(self.markers, self.video, "m", lambda: client)
        factory = mock.Mock(side_effect=RuntimeError("no API key"))
        _, info = localizer.localize(self.markers, self.video, "m", factory)
        self.assertEqual(info["source"], "cache")
        factory.assert_not_called()

    def test_prompt_version_is_part_of_the_cache_key(self):
        picked = localizer.targets(self.markers)
        before = localizer.cache_file(self.video, picked, "m")
        with mock.patch.object(localizer, "PROMPT_VERSION", "999"):
            after = localizer.cache_file(self.video, picked, "m")
        self.assertNotEqual(before, after)

    def test_malformed_answer_is_not_cached_and_damaged_cache_is_a_miss(self):
        _, info = localizer.localize(self.markers, self.video, "m", lambda: FakeClient(None))  # {"regions": null}
        self.assertEqual(info["status"], "error")
        self.assertEqual(list(localizer.CACHE_DIR.glob("*.json")) if localizer.CACHE_DIR.exists() else [], [])
        path = localizer.cache_file(self.video, localizer.targets(self.markers), "m")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('{"regions": null}', encoding="utf-8")
        out, info = localizer.localize(self.markers, self.video, "m", None)
        self.assertEqual((info["status"], out), ("skipped", self.markers))

    def test_missing_video_file_is_skipped_without_sampling(self):
        self.video.unlink()
        _, info = localizer.localize(self.markers, self.video, "m", None)
        self.assertEqual(info["status"], "skipped")

    def test_not_allowed_without_cache_is_skipped(self):
        out, info = localizer.localize(self.markers, self.video, "m", None)
        self.assertEqual(info["status"], "skipped")
        self.assertEqual(out, self.markers)

    def test_failed_call_keeps_markers(self):
        client = FakeClient([])
        client.chat.completions.create = mock.Mock(side_effect=RuntimeError("boom"))
        out, info = localizer.localize(self.markers, self.video, "m", lambda: client)
        self.assertEqual(info["status"], "error")
        self.assertEqual(out, self.markers)

    def test_only_visual_issues_are_targets_high_severity_first_and_capped(self):
        many = [marker(f"m{i}", i, "low") for i in range(10)] + [marker("h", 9.5, "high")]
        picked = localizer.targets(many + [marker("spoken", 1, localizable=False)])
        self.assertEqual(picked[0]["id"], "h")
        self.assertEqual(len(picked), localizer.MAX_MARKERS)
        self.assertNotIn("spoken", [m["id"] for m in picked])


class CheckedRegionTest(unittest.TestCase):
    def test_valid_answer_is_rounded_and_marked_estimated(self):
        found, reason = localizer.checked_region(region("a", 1.0, box=(0.123456, 0.2, 0.3, 0.4)), [0.0, 1.0])
        self.assertEqual(reason, "")
        self.assertEqual(found["box"], [0.1235, 0.2, 0.3, 0.4])
        self.assertTrue(found["estimated"])
        self.assertEqual(found["frame_sec"], 1.0)

    def test_each_failing_field_drops_the_answer(self):
        cases = {
            "unsent second": region("a", 9.0),
            "bad box": region("a", 0.0, box=(0.9, 0.9, 0.5, 0.5)),
            "low confidence": region("a", 0.0, confidence=0.1),
            "bool confidence": {**region("a", 0.0), "confidence": True},
            "empty observation": region("a", 0.0, observation="  "),
            "long fix": region("a", 0.0, fix_here="x" * (localizer.MAX_TEXT + 1)),
            "long label": region("a", 0.0, label="x" * (localizer.MAX_LABEL + 1)),
        }
        for name, answer in cases.items():
            with self.subTest(name):
                found, reason = localizer.checked_region(answer, [0.0, 1.0])
                self.assertIsNone(found)
                self.assertTrue(reason)


class ContactSheetTest(unittest.TestCase):
    def test_grid_has_one_cell_per_frame_and_is_decodable(self):
        tmp = Path(tempfile.mkdtemp())
        frames = []
        for sec in (0, 1, 2):
            p = tmp / f"{sec}.jpg"
            write_jpg(p, w=40, h=72, value=50 * (sec + 1))
            frames.append((float(sec), p))
        sheet = cv2.imdecode(np.frombuffer(localizer.contact_sheet(frames), np.uint8), cv2.IMREAD_COLOR)
        cell_h = round(72 * localizer.CELL_W / 40)
        # 3 frames fill the first row of GRID_COLS cells; the rest of that row stays blank
        self.assertEqual(sheet.shape, (cell_h, localizer.GRID_COLS * localizer.CELL_W, 3))

    def test_empty_frames_raise(self):
        with self.assertRaises(ValueError):
            localizer.contact_sheet([])


class SafeZoneTest(unittest.TestCase):
    def test_bottom_tab_bar_and_caption_are_named_for_a_9_16_frame(self):
        size = (1080, 1920)  # object-fit: cover crops the sides of a 9:16 frame on the 402 x 874 screen
        self.assertIn("thanh điều hướng dưới", localizer.covered_by((0.8, 0.92, 0.15, 0.06), size))
        self.assertIn("caption và nhạc", localizer.covered_by((0.3, 0.75, 0.2, 0.05), size))

    def test_box_in_the_clear_area_is_not_named(self):
        self.assertEqual(localizer.covered_by((0.2, 0.3, 0.1, 0.05), (1080, 1920)), [])

    def test_box_inside_the_top_bar_is_named(self):
        self.assertEqual(localizer.covered_by((0.2, 0.0, 0.2, 0.05), (1080, 1920)), ["thanh trên"])


if __name__ == "__main__":
    unittest.main()
