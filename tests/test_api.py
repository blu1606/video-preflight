import copy
import json
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from api import create_app
from core.media import extract, probe
from core.store import StoreError
from db.build_seed import initialize


class MemoryStore:
    def __init__(self):
        self.data = {key: [] for key in ("shops", "skus", "videos", "marketSnapshots", "sources")}

    def list(self, key, **query):
        if key == "meta":
            return {"schema_version": "test"}
        return copy.deepcopy([r for r in self.data[key] if all(r.get(k) == v for k, v in query.items())])

    def get(self, key, record_id):
        result = next((r for r in self.data[key] if r["id"] == record_id), None)
        if result is None:
            raise StoreError("Không tìm thấy bản ghi", 404)
        return copy.deepcopy(result)

    def add(self, key, value):
        self.data[key].append(copy.deepcopy(value))
        return value

    def patch(self, key, record_id, value):
        self.get(key, record_id)
        for row in self.data[key]:
            if row["id"] == record_id:
                row.update(copy.deepcopy(value))
                return row


class SeedTests(unittest.TestCase):
    def test_initialization_is_reproducible_and_never_overwrites_data(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "db.json"
            self.assertTrue(initialize(target))
            data = json.loads(target.read_text())
            self.assertEqual(data["videos"], [])
            target.write_text('{"keep": true}')
            self.assertFalse(initialize(target))
            self.assertEqual(json.loads(target.read_text()), {"keep": True})


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg/ffprobe required for integration")
class LocalFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture_dir = tempfile.TemporaryDirectory()
        cls.fixture = Path(cls.fixture_dir.name) / "generated-test-fixture.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=olive:s=180x320:d=2",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", str(cls.fixture)], check=True, capture_output=True)
        cls.content = cls.fixture.read_bytes()

    @classmethod
    def tearDownClass(cls):
        cls.fixture_dir.cleanup()

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.store = MemoryStore()
        self.app = create_app(self.root, self.store)
        self.client = TestClient(self.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.folder.cleanup()

    def upload(self, **context):
        response = self.client.post("/videos/upload", files={"file": ("fixture.mp4", self.content, "video/mp4")}, data={"context": json.dumps(context)})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def wait(self, run_id):
        for _ in range(200):
            run = self.client.get(f"/runs/{run_id}").json()
            if run["status"] not in ("queued", "running"):
                self.assertEqual(run["status"], "complete", run)
                return run
            time.sleep(.05)
        self.fail("Local pipeline did not finish")

    def test_real_probe_and_cache_integrity(self):
        metadata = probe(self.fixture)
        self.assertAlmostEqual(metadata["duration_s"], 2, places=1)
        self.assertEqual((metadata["width"], metadata["height"]), (180, 320))
        self.assertFalse(metadata["has_audio"])
        result = extract(self.fixture, self.root / "artifacts", metadata)
        self.assertEqual(result["cache"], "miss")
        self.assertEqual(extract(self.fixture, self.root / "artifacts", metadata)["cache"], "hit")
        directory = self.root / "artifacts" / f'{metadata["sha256"]}-local-frames-v1'
        (directory / result["frames"][0]["file"]).write_bytes(b"tampered")
        self.assertEqual(extract(self.fixture, self.root / "artifacts", metadata)["cache"], "miss")

    def test_upload_pipeline_sse_cache_and_invalidation(self):
        video = self.upload()
        self.assertFalse(video["published"])
        first = self.client.post(f'/videos/{video["id"]}/runs', json={}).json()
        duplicate = self.client.post(f'/videos/{video["id"]}/runs', json={}).json()
        self.assertEqual(first["run_id"], duplicate["run_id"])
        run = self.wait(first["run_id"])
        result = run["result"]
        self.assertEqual(len(result["trace"]), 8)
        self.assertEqual([step["stage"] for step in result["trace"]], ["extract", "gather", "claims", "decisions", "policy", "cross_check", "scoring", "verdict"])
        self.assertIsNone(result["scores"]["overall"])
        self.assertEqual(result["scores"]["coverage"], 0)
        self.assertEqual(result["paid_calls"], 0)
        self.assertEqual(result["policy"]["targets"]["tiktok_shop_video"]["verdict"], "unknown")
        frame = result["extraction"]["frames"][0]
        self.assertEqual(self.client.get(frame["url"].removeprefix("/py")).status_code, 200)
        self.assertEqual(self.client.get(f'/videos/{video["id"]}/media', headers={"Range": "bytes=0-99"}).status_code, 206)
        events = self.client.get(f'/runs/{run["id"]}/events')
        self.assertIn("event: step_started", events.text)
        self.assertIn("event: run_complete", events.text)
        self.assertIn("event: stream_end", events.text)
        cached = self.client.post(f'/videos/{video["id"]}/runs', json={}).json()
        self.assertTrue(cached["cache_hit"])
        self.assertEqual(len(self.client.get(f'/videos/{video["id"]}/runs').json()), 1)
        self.client.patch(f'/videos/{video["id"]}/context', json={"caption": "Thông tin mới"})
        self.assertEqual(self.client.get(f'/videos/{video["id"]}/cache-status').json()["analysis"], "miss")
        changed = self.client.post(f'/videos/{video["id"]}/runs', json={}).json()
        self.assertNotEqual(changed["run_id"], first["run_id"])
        self.assertEqual(self.wait(changed["run_id"])["result"]["extraction"]["cache"], "hit")

    def test_context_ownership_and_published_constraints(self):
        shop1 = self.client.post("/shops", json={"name": "Unit test shop A"}).json()
        shop2 = self.client.post("/shops", json={"name": "Unit test shop B"}).json()
        sku = self.client.post("/skus", json={"shop_id": shop1["id"], "name": "Unit test SKU", "listing_url": "https://example.com/item"}).json()
        video = self.upload(shop_id=shop1["id"], sku_id=sku["id"])
        endpoint = f'/videos/{video["id"]}/context'
        self.assertEqual(self.client.patch(endpoint, json={"shop_id": shop2["id"], "sku_id": sku["id"]}).status_code, 422)
        self.assertEqual(self.client.patch(endpoint, json={"outcome": {"views": 10}, "published": False}).status_code, 422)
        self.assertEqual(self.client.patch(endpoint, json={"outcome": {"views": -1}, "published": True}).status_code, 422)
        self.assertEqual(self.client.patch(endpoint, json={"outcome": {"views": 0}, "published": True}).status_code, 200)
        self.assertEqual(self.client.post("/skus", json={"shop_id": shop1["id"], "name": "test", "listing_url": "javascript:alert(1)"}).status_code, 422)

    def test_invalid_media_and_unknown_inputs_fail_without_leaving_files(self):
        response = self.client.post("/videos/upload", files={"file": ("fake.mp4", b"not video")})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(list((self.root / "data").iterdir()), [])
        self.assertEqual(self.client.post("/videos/upload", files={"file": ("x.txt", b"text")}).status_code, 415)
        self.assertEqual(self.client.post("/videos/upload", files={"file": ("x.mp4", self.content)}, data={"context": '{"unknown":1}'}).status_code, 422)
        self.assertEqual(self.client.get("/runs/not-a-uuid").status_code, 404)
        self.assertEqual(self.client.get("/artifacts/invalid/frame-00.jpg").status_code, 404)

    def test_paid_option_is_rejected_and_file_mutation_invalidates_cache(self):
        video = self.upload()
        endpoint = f'/videos/{video["id"]}/runs'
        self.assertEqual(self.client.post(endpoint, json={"paid_calls": True}).status_code, 409)
        (self.root / "data" / video["file"]).write_bytes(b"changed")
        self.assertEqual(self.client.post(endpoint, json={}).status_code, 409)


if __name__ == "__main__":
    unittest.main()
