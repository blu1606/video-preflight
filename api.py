import asyncio
import json
import re
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from core.media import EXTENSIONS, MAX_BYTES, MediaError, probe, sha256
from core.pipeline import AGENTS, PLATFORMS, TOOLS, gather, now
from core.runs import Runs
from core.scoring import CALIBRATION, GROUPS
from core.store import Store, StoreError

ROOT = Path(__file__).resolve().parent


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class ShopInput(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(default="", max_length=120)


class SkuInput(StrictModel):
    shop_id: str
    name: str = Field(min_length=1, max_length=200)
    price_vnd: float | None = Field(default=None, ge=0, le=1_000_000_000)
    listing_url: str = Field(default="", max_length=1000)
    audience: str = Field(default="", max_length=500)

    @field_validator("listing_url")
    @classmethod
    def http_link(cls, value):
        if value and not value.startswith(("https://", "http://")):
            raise ValueError("Link phải bắt đầu bằng https:// hoặc http://")
        return value


class Outcome(StrictModel):
    views: int | None = Field(default=None, ge=0)
    clicks: int | None = Field(default=None, ge=0)
    orders: int | None = Field(default=None, ge=0)
    gmv_vnd: float | None = Field(default=None, ge=0)


class VideoContext(StrictModel):
    shop_id: str | None = None
    sku_id: str | None = None
    caption: str = Field(default="", max_length=3000)
    hashtags: list[str] = Field(default_factory=list, max_length=30)
    audience: str = Field(default="", max_length=500)
    platforms: list[Literal["tiktok_shop_video", "tiktok_ads", "shopee_listing", "meta_ads"]] = Field(default_factory=lambda: ["tiktok_shop_video"], min_length=1, max_length=4)
    published: bool = False
    outcome: Outcome | None = None

    @field_validator("hashtags")
    @classmethod
    def clean_tags(cls, values):
        if any(not tag.strip().lstrip("#") or len(tag) > 100 for tag in values):
            raise ValueError("Hashtag không hợp lệ")
        return list(dict.fromkeys(tag.strip().lstrip("#") for tag in values))


class RunInput(StrictModel):
    force_extract: bool = False
    paid_calls: bool = False


def user_provenance():
    return {"status": "REAL", "tool": "seller_input", "query": None, "collected_at": now(), "raw_file": None,
            "verification": "Thông tin người dùng nhập; chưa đối chiếu nền tảng"}


def validate_context(store, context):
    if context.shop_id:
        store.get("shops", context.shop_id)
    if context.sku_id:
        sku = store.get("skus", context.sku_id)
        if sku["shop_id"] != context.shop_id:
            raise HTTPException(422, "SKU phải thuộc shop đang chọn")
    if context.outcome and not context.published:
        raise HTTPException(422, "Video trước đăng không có số liệu sau đăng")
    return context.model_dump()


def create_app(root=ROOT, store=None):
    root = Path(root)
    root.joinpath("data").mkdir(exist_ok=True, parents=True)
    database = store or Store()
    runs = Runs(root)

    @asynccontextmanager
    async def lifespan(_app):
        yield
        await asyncio.to_thread(runs.shutdown)

    app = FastAPI(title="Video Preflight", version="0.1.0", lifespan=lifespan)
    app.state.runs = runs

    @app.exception_handler(StoreError)
    async def store_error(_request, exc):
        return JSONResponse(status_code=exc.status, content={"detail": str(exc)})

    @app.exception_handler(FileNotFoundError)
    async def not_found(_request, exc):
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.get("/health")
    def health():
        try:
            database.list("meta")
            db_status = "connected"
        except StoreError:
            db_status = "unavailable"
        return {"status": "ok" if db_status == "connected" else "degraded", "database": db_status,
                "tools": {name: bool(shutil.which(name)) for name in ("ffmpeg", "ffprobe")},
                "provider": "not_configured", "paid_calls_enabled": False, "pipeline": "fixed_local"}

    @app.get("/registry")
    def registry():
        return {"agents": AGENTS, "tools": TOOLS, "platforms": PLATFORMS, "rubric_status": "not_configured",
                "score_weights": {key: weight for key, (_, weight) in GROUPS.items()}, "calibration": CALIBRATION}

    @app.get("/catalog")
    def catalog():
        return {key: database.list(key) for key in ("shops", "skus", "videos", "marketSnapshots", "sources")}

    @app.post("/shops", status_code=201)
    def add_shop(value: ShopInput):
        return database.add("shops", {"id": str(uuid4()), **value.model_dump(), "provenance": user_provenance()})

    @app.post("/skus", status_code=201)
    def add_sku(value: SkuInput):
        database.get("shops", value.shop_id)
        return database.add("skus", {"id": str(uuid4()), **value.model_dump(), "provenance": user_provenance()})

    @app.post("/videos/upload", status_code=201)
    def upload(file: UploadFile = File(...), context: str = Form("{}")):
        try:
            parsed = VideoContext.model_validate_json(context)
        except ValueError as exc:
            raise HTTPException(422, "Thông tin video không hợp lệ") from exc
        info = validate_context(database, parsed)
        extension = Path(file.filename or "").suffix.lower()
        if extension not in EXTENSIONS:
            raise HTTPException(415, "Hỗ trợ MP4, MOV, WebM và MKV")
        video_id = str(uuid4())
        path = root / "data" / (video_id + extension)
        try:
            size = 0
            with path.open("xb") as handle:
                while chunk := file.file.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise HTTPException(413, "Video vượt quá 50 MiB")
                    handle.write(chunk)
            try:
                metadata = probe(path)
            except MediaError as exc:
                raise HTTPException(422, str(exc)) from exc
            return database.add("videos", {"id": video_id, "name": Path(file.filename).name[:200], "file": path.name,
                                           "metadata": metadata, "uploaded_at": now(), "provenance": user_provenance(), **info})
        except Exception:
            path.unlink(missing_ok=True)
            raise
        finally:
            file.file.close()

    @app.patch("/videos/{video_id}/context")
    def update_context(video_id: str, value: VideoContext):
        database.get("videos", video_id)
        return database.patch("videos", video_id, validate_context(database, value))

    @app.get("/videos/{video_id}/media")
    def original(video_id: str):
        video = database.get("videos", video_id)
        path = root / "data" / video["file"]
        if path.parent.resolve() != (root / "data").resolve() or not path.is_file():
            raise HTTPException(404, "Không tìm thấy file video")
        return FileResponse(path)

    @app.get("/artifacts/{cache_id}/{name}")
    def artifact(cache_id: str, name: str):
        if not re.fullmatch(r"[a-f0-9]{64}-local-frames-v1", cache_id) or not re.fullmatch(r"frame-\d{2}\.jpg", name):
            raise HTTPException(404, "Không tìm thấy frame")
        path = root / ".runtime" / "artifacts" / cache_id / name
        if not path.is_file():
            raise HTTPException(404, "Không tìm thấy frame")
        return FileResponse(path, media_type="image/jpeg")

    @app.get("/videos/{video_id}/cache-status")
    def cache_status(video_id: str):
        video = database.get("videos", video_id)
        context = gather(database, video)
        from core.pipeline import fingerprint
        key = fingerprint(video, context)
        matches = [r for r in runs.list(video_id) if r["fingerprint"] == key and r["status"] == "complete"]
        return {"analysis": "hit" if matches else "miss", "run_id": matches[0]["id"] if matches else None,
                "paid_calls": 0, "external_calls": 0, "provider": "not_configured"}

    @app.post("/videos/{video_id}/runs", status_code=202)
    def start_run(video_id: str, value: RunInput):
        if value.paid_calls:
            raise HTTPException(409, "Provider chưa được tích hợp. Bản nền chỉ chạy local, không gọi API trả phí.")
        video = database.get("videos", video_id)
        path = root / "data" / video["file"]
        if path.parent.resolve() != (root / "data").resolve() or not path.is_file():
            raise HTTPException(404, "Không tìm thấy file video")
        if sha256(path) != video["metadata"]["sha256"]:
            raise HTTPException(409, "File video đã thay đổi; hãy upload lại.")
        run, cache_hit = runs.start(video, gather(database, video), force=value.force_extract)
        return {"run_id": run["id"], "status": run["status"], "cache_hit": cache_hit, "paid_calls": 0}

    @app.get("/videos/{video_id}/runs")
    def history(video_id: str):
        database.get("videos", video_id)
        return [{k: r[k] for k in ("id", "created_at", "status", "error")} for r in runs.list(video_id)]

    @app.get("/runs/{run_id}")
    def get_run(run_id: str):
        return runs.get(run_id)

    @app.get("/runs/{run_id}/events")
    async def stream(run_id: str, request: Request):
        runs.get(run_id)
        async def events():
            cursor, heartbeat = 0, 0
            while not await request.is_disconnected():
                run = runs.get(run_id)
                for item in run["events"][cursor:]:
                    yield f'id: {item["seq"]}\nevent: {item["event"]}\ndata: {json.dumps(item["data"], ensure_ascii=False)}\n\n'
                cursor = len(run["events"])
                if run["status"] not in ("queued", "running"):
                    yield f'event: stream_end\ndata: {json.dumps({"status": run["status"]})}\n\n'
                    break
                heartbeat += 1
                if heartbeat % 50 == 0:
                    yield ": heartbeat\n\n"
                await asyncio.sleep(.2)
        return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    return app


app = create_app()
