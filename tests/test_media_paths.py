"""Run: uv run python -m unittest tests.test_media_paths

Video files live at data/<shop_id>/<file>; a db row's `local_file` is that path relative to data/.
Covers the path helpers, benchmark lookup across shop folders, the moved-file fallback for cached
features, shop-scoped uploads and /media serving of nested paths.
"""

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

import api
from sources import benchmark, db_client, media, providers
from tests.test_ui_endpoints import PatchableDb

DB = json.loads((media.DEMO / "db" / "db.json").read_text(encoding="utf-8"))


class MediaHelpersTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        (self.root / "SHOP001").mkdir()
        (self.root / "SHOP001" / "a.mp4").write_bytes(b"x")
        (self.root / "loose.mov").write_bytes(b"x")
        (self.root / "SHOP001" / "notes.txt").write_text("not a video")

    def test_shop_dir(self):
        self.assertEqual(media.shop_dir("SHOP001", self.root), self.root / "SHOP001")
        self.assertEqual(media.shop_dir(None, self.root), self.root)
        for bad in ("../etc", "SHOP/1", "a b", ".."):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                media.shop_dir(bad, self.root)

    def test_iter_and_find(self):
        self.assertEqual(sorted(p.name for p in media.iter_videos(self.root)), ["a.mp4", "loose.mov"])
        self.assertEqual(media.find_video("a.mp4", self.root), self.root / "SHOP001" / "a.mp4")
        self.assertEqual(media.find_video("loose.mov", self.root), self.root / "loose.mov")
        self.assertIsNone(media.find_video("missing.mp4", self.root))
        self.assertIsNone(media.find_video("", self.root))

    def test_relative_is_posix(self):
        self.assertEqual(media.relative(self.root / "SHOP001" / "a.mp4", self.root), "SHOP001/a.mp4")

    def test_benchmark_finds_videos_in_shop_folders(self):
        row = benchmark.load_benchmark()[0]
        name = f"{row['clipcat_id']}.mp4"
        (self.root / "SHOP001" / name).write_bytes(b"x")
        with mock.patch.object(benchmark, "DATA_DIR", self.root):
            self.assertEqual(benchmark.local_videos()[row["clipcat_id"]], self.root / "SHOP001" / name)

    def test_cached_video_path_falls_back_to_shop_folder(self):
        stale = str(self.root / "old-checkout" / "data" / "a.mp4")  # where it was when the cache was written
        with mock.patch.object(media, "DATA_DIR", self.root):
            self.assertEqual(providers._video_path(stale), self.root / "SHOP001" / "a.mp4")
            self.assertIsNone(providers._video_path(str(self.root / "gone.mp4")))
            self.assertIsNone(providers._video_path(None))


class UploadToShopFolderTest(unittest.TestCase):
    def setUp(self):
        self.db = PatchableDb()
        for name, fn in (("get", self.db.get), ("post", self.db.post), ("patch", self.db.patch)):
            p = mock.patch.object(db_client, name, fn)
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(api.app)
        self.sku = DB["skus"][0]

    def test_upload_saves_under_shop_folder(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(api, "DATA_DIR", Path(tmp)):
            res = self.client.post("/py/videos/upload", files={"file": ("a.mp4", b"fake", "video/mp4")},
                                   data={"shop_id": self.sku["shop_id"], "sku_id": self.sku["sku_id"]})
            self.assertEqual(res.status_code, 200, res.text)
            local_file = res.json()["local_file"]
            self.assertTrue(local_file.startswith(f"{self.sku['shop_id']}/upl-"), local_file)
            self.assertEqual((Path(tmp) / local_file).read_bytes(), b"fake")

    def test_upload_without_shop_stays_at_root(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(api, "DATA_DIR", Path(tmp)):
            res = self.client.post("/py/videos/upload", files={"file": ("a.mp4", b"fake", "video/mp4")})
            self.assertEqual(res.status_code, 200, res.text)
            self.assertNotIn("/", res.json()["local_file"])
            self.assertTrue((Path(tmp) / res.json()["local_file"]).is_file())


@unittest.skipUnless(any(media.DATA_DIR.glob("*/*.mp4")), "demo videos not present (data/ is gitignored)")
class DemoDataLayoutTest(unittest.TestCase):
    def test_every_video_row_file_exists(self):
        missing = [v["id"] for v in DB["videos"]
                   if v.get("local_file") and not (media.DATA_DIR / v["local_file"]).is_file()]
        self.assertEqual(missing, [])

    def test_seed_videos_sit_in_their_shop_folder(self):
        for v in DB["videos"]:
            if v.get("local_file"):
                with self.subTest(video=v["id"]):
                    self.assertEqual(v["local_file"].split("/")[0], v["shopId"])

    def test_media_serves_nested_path(self):
        video = next(v for v in DB["videos"] if v.get("local_file"))
        client = TestClient(api.app)
        for url in (f"/media/{video['local_file']}", f"/media/{video['local_file'].replace('/', '%2F')}"):
            with self.subTest(url=url):
                res = client.get(url, headers={"Range": "bytes=0-15"})
                self.assertIn(res.status_code, (200, 206), url)
                self.assertEqual(len(res.content), 16)


if __name__ == "__main__":
    unittest.main()
