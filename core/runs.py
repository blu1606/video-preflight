import json
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import UUID, uuid4

from core.pipeline import execute, fingerprint, now


def valid_id(value):
    try:
        return str(UUID(value)) == value
    except (ValueError, TypeError, AttributeError):
        return False


class Runs:
    def __init__(self, root):
        self.root = Path(root)
        self.directory = self.root / ".runtime" / "runs"
        self.directory.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="preflight")
        self.active = {}
        for path in self.directory.glob("*.json"):
            data = json.loads(path.read_text())
            if data["status"] in ("queued", "running"):
                data.update(status="interrupted", error="Lab đã dừng giữa lượt chạy; không tự chạy lại.")
                self._save(data)

    def _save(self, run):
        path = self.directory / f'{run["id"]}.json'
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(run, ensure_ascii=False, indent=2, allow_nan=False))
        temporary.replace(path)

    def get(self, run_id):
        if not valid_id(run_id):
            raise FileNotFoundError("Không tìm thấy lượt chạy")
        with self.lock:
            path = self.directory / f"{run_id}.json"
            if not path.is_file():
                raise FileNotFoundError("Không tìm thấy lượt chạy")
            return json.loads(path.read_text())

    def list(self, video_id):
        with self.lock:
            rows = [json.loads(path.read_text()) for path in self.directory.glob("*.json")]
        return sorted([r for r in rows if r["video_id"] == video_id], key=lambda r: r["created_at"], reverse=True)

    def start(self, video, context, *, force=False):
        key = fingerprint(video, context)
        with self.lock:
            if key in self.active:
                return self.get(self.active[key]), False
            if not force:
                for run in self.list(video["id"]):
                    if run["fingerprint"] == key and run["status"] == "complete":
                        return run, True
            run = {"id": str(uuid4()), "video_id": video["id"], "fingerprint": key, "status": "queued",
                   "created_at": now(), "events": [], "result": None, "error": None}
            self._save(run)
            self.active[key] = run["id"]
            self.worker.submit(self._execute, run, video, context, force)
            return run.copy(), False

    def _execute(self, run, video, context, force):
        def emit(event, data):
            with self.lock:
                run["events"].append({"seq": len(run["events"]), "event": event, "data": data})
                self._save(run)
        try:
            with self.lock:
                run["status"] = "running"
                self._save(run)
            result = execute(video, context, self.root, emit, force=force)
            with self.lock:
                run.update(status="complete", result=result, finished_at=now())
                emit("run_complete", {"run_id": run["id"]})
        except Exception as exc:
            with self.lock:
                run.update(status="error", error=str(exc), finished_at=now())
                emit("run_error", {"run_id": run["id"], "detail": str(exc)})
        finally:
            with self.lock:
                self.active.pop(run["fingerprint"], None)

    def shutdown(self):
        self.worker.shutdown(wait=True)
