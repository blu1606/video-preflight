"""Analysis API for the React lab. Data comes from json-server (db_client); results are saved to /analyses.

Run (from the repo root):
    uv run uvicorn api:app --port 8100 --reload
"""

import inspect
import json
import queue
import shutil
import threading
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAIError
from pydantic import BaseModel, ConfigDict, Field

from sources import caption_writer, claims, db_client as db, decision_scorer, insight_candidates
from sources import insights as insight_writer, localizer
from sources import media, shopee_listing
from sources.extractor import (FRAMES_DIR, SCHEMA_VERSION, VISION_MODEL, ensure_frames, find_cached, frames_dir,
                               run_extraction, video_fingerprint)
from main import build_report, build_shop_report, to_json
from sources.providers import NOT_EXTRACTED, ShopSeedProvider, VideoFeatureProvider, clean_hashtags
from core import shop_rubric
from core.markers import build_markers
from core.policy_check import TARGETS as POLICY_TARGETS
from core.rubric import POST_PUBLISH_GROUP, RUBRIC_VERSIONS
from core.schema import Mode
from core.overall import GROUP_WEIGHTS, THRESHOLDS
from core.trace import Trace, tokens_for
from sources import pacing

DATA_DIR = media.DATA_DIR  # videos at data/<shop_id>/<file>; db rows keep `local_file` relative to it
VIDEO_EXT = media.VIDEO_EXT
SSE_HEARTBEAT_S = 15
MAX_CAPTION_CHARS = 2200  # TikTok's caption limit
MAX_HASHTAGS = 30
MAX_HASHTAG_CHARS = 100
# The prototype scores the seed data too: every run is a simulation run, there is no evidence-only switch.
RUN_MODE = Mode.SIMULATION
Sponsorship = Literal["own_shop", "affiliate", "sponsored"]

app = FastAPI(title="Video Intelligence Lab API")
DATA_DIR.mkdir(exist_ok=True)  # video files are local-only; a fresh clone has no data/ yet
app.mount("/media", StaticFiles(directory=DATA_DIR), name="media")
FRAMES_DIR.mkdir(parents=True, exist_ok=True)
decision_scorer.KEYFRAMES_DIR.mkdir(parents=True, exist_ok=True)
# Keyframes attached to the Decisions request; mounted before /py/frames so this prefix wins.
app.mount(decision_scorer.KEYFRAMES_URL, StaticFiles(directory=decision_scorer.KEYFRAMES_DIR), name="keyframes")
app.mount("/py/frames", StaticFiles(directory=FRAMES_DIR), name="frames")  # under /py: already proxied by Vite


def fetch(path: str):
    try:
        return db.get(path)
    except db.NotFound:
        raise HTTPException(404, f"{path} not found in db")


@app.get("/py/health")
def health() -> dict:
    return {"ok": True, "db": db.DB_URL, "vision_model": VISION_MODEL}


@app.post("/py/shops/{shop_id}/diagnose")
def diagnose(shop_id: str) -> dict:
    fetch(f"/shops/{shop_id}")
    features = ShopSeedProvider(db.load_seed(), shop_id).load()
    report = build_shop_report(features, RUN_MODE, shop_id, None)
    result = {**report, "scores": [asdict(g) for g in report["scores"]]}
    return db.save_analysis("shop_diagnosis", shop_id, shop_id, RUN_MODE.value, result)


def _claims_verdicts(content: Path | None, c3: dict) -> list[dict] | None:
    """Per-claim rows (claim, verdict, listing_evidence) of the cached claims check behind C3.

    The cache file is the one whose verdicts produced this feature's evidence, so a stale file for
    another listing is never shown.
    """
    if not content or c3["status"] != "INFERRED":
        return None
    for path in content.parent.glob(f"{content.stem}.claims.*.json"):
        try:
            verdicts = json.loads(path.read_text(encoding="utf-8"))["verdicts"]
            if [f"{v['verdict']}: {v['claim']}" for v in verdicts] == c3["evidence"]:
                return verdicts
        except (OSError, ValueError, KeyError, TypeError):
            continue  # unreadable or foreign file: not the cache behind this feature
    return None


def _openai_client():
    from openai import OpenAI  # deferred: only needed when a paid call is allowed
    return OpenAI()


def _score_video(video: dict, mode: Mode, claims_llm: bool = False, decisions: bool = False,
                 rubric: str = "v1", trace: Trace | None = None, kind: str = "video_score",
                 extra: dict | None = None, cross_check_agent: bool = False, localize: bool = False,
                 model: str = VISION_MODEL, insights: bool = False, policy_llm: bool = True,
                 music: bool = False) -> dict:
    result = _build_result(video, mode, claims_llm, decisions, rubric, trace or Trace(), kind, extra,
                           cross_check_agent, localize, model, insights, policy_llm, music)
    return db.save_analysis(kind, video["id"], video["shop_id"], mode.value, result)


def _build_result(video: dict, mode: Mode, claims_llm: bool, decisions: bool, rubric: str, trace: Trace,
                  kind: str, extra: dict | None, cross_check_agent: bool, localize: bool, model: str,
                  insights: bool, policy_llm: bool, music: bool = False) -> dict:
    """The analysis result of _score_video, not saved. With every paid flag off it only reads caches."""
    shop_id = video["shop_id"]  # None for an uploaded video: content + user-entered listing
    with trace.step("get_video_features", "tool", "video_analyst", "get_video_features",
                    input={"local_file": video["local_file"]}) as s:
        content = find_cached(DATA_DIR / video["local_file"]) if video["local_file"] else None
        s.output = {"features_file": content.name if content else None}
        if not content:
            s.status = "skipped"
    seed = None
    if shop_id:
        with trace.step("load_shop_data", "tool", "metrics_analyst", "get_shop", input={"shop_id": shop_id}) as s:
            seed = db.load_seed()
            s.output = {collection: len(rows) for collection, rows in seed.items()}
    report = to_json(build_report(content, mode, shop_id=shop_id, seed_video=video["id"], seed=seed,
                                  claims_llm=claims_llm, listing=video.get("listing"), decisions=decisions,
                                  rubric=rubric, trace=trace, cross_check_agent=cross_check_agent,
                                  stage=video.get("stage", "published"), sku_id=video.get("sku_id") if
                                  video.get("stage") == "prepublish" else None, post=video.get("post"),
                                  policy_llm=policy_llm, music=music))
    shop = report.pop("shop")
    result = {
        **report,
        "content_source": content.name if content else None,
        "claims_verdicts": _claims_verdicts(content, report["features"][claims.FEATURE]),
        "video_diagnosis": next((v for v in shop["videos"] if v["video_id"] == video["id"]), None) if shop else None,
        "diagnosis_agreement": shop["diagnosis_agreement"] if shop else None,  # Decisions M03 vs shop diagnosis
        **(extra or {}),
    }
    if kind == "video_run":
        markers = build_markers(result)
        if video["local_file"]:
            with trace.step("localize_issues", "reasoning" if localize else "functional", "video_analyst",
                            "openai.vision.localize", input={"paid_call_allowed": localize, "model": model}) as s:
                try:
                    markers, s.output = localizer.localize(markers, DATA_DIR / video["local_file"], model,
                                                           _openai_client if localize else None,
                                                           on_progress=trace.reporter("localize_issues"))
                except Exception as e:  # boxes are optional: the run keeps its markers without them
                    s.output = {"status": "error", "reason": f"{type(e).__name__}: {e}"}
                if s.output["status"] in ("skipped", "error"):
                    s.status = s.output["status"]
                s.tokens = tokens_for(s.output.get("source"), s.output.get("token_usage"), model)
        result["markers"] = markers
        with trace.step("compose_verdict", "functional", "orchestrator") as s:
            result["verdict"] = s.output = _verdict(result)
        with trace.step("summarize_insights", "reasoning" if insights else "functional", "insight_writer",
                        "openai.chat.insights", input={"paid_call_allowed": insights, "model": model}) as s:
            try:
                result["insights"], s.output = insight_writer.summarize(
                    result, model, _openai_client if insights else None,
                    on_progress=trace.reporter("summarize_insights"), peers=_shop_peers(shop_id, video["id"]))
            except Exception as e:  # plain-language text is an extra: the UI falls back to its templates
                result["insights"], s.output = None, {"status": "error", "reason": f"{type(e).__name__}: {e}"}
            if s.output["status"] in ("skipped", "error"):
                s.status = s.output["status"]
            s.tokens = tokens_for(s.output.get("source"), s.output.get("token_usage"), model)
        result["trace"] = trace.to_json()
    return result


def _shop_peers(shop_id: str | None, video_id: str) -> list[dict]:
    """The latest saved run of each other video of the shop (the shop-habit insight). Empty when unavailable."""
    if not shop_id:
        return []
    try:
        records = db.get("/analyses", kind="video_run", shopId=shop_id, _sort="id", _order="desc")
    except Exception:  # an insight extra: the run goes on without the other videos
        return []
    return insight_candidates.latest_peers(records, video_id)


POLICY_RISK_VI = {
    "misleading_claim": "Lời hứa công dụng có thể gây hiểu lầm",
    "restricted_product": "Sản phẩm thuộc ngành hàng bị hạn chế",
    "disclosure": "Có thể thiếu công khai quảng cáo hoặc nội dung AI",
    "intellectual_property": "Có thể vi phạm bản quyền nhạc, hình ảnh hoặc thương hiệu",
    "listing_mismatch": "Sản phẩm trong video khác listing",
    "none_identified": "Chưa thấy rủi ro rõ theo các rule áp dụng",
    "unknown": "Chưa đủ bằng chứng để xác định",
}


def _primary_policy_risk(features: dict) -> dict | None:
    """Decisions P01 (main policy concern) when it was answered; a judgement to review, not a ruling."""
    f = features.get("decision.P01")
    if not f or f["status"] == "MISSING":
        return None
    return {"category": f["value"], "label_vi": POLICY_RISK_VI.get(f["value"], f["value"]),
            "evidence": f["evidence"][0] if f["evidence"] else None, "mock_dependency": f["mock_dependency"]}


def _verdict(result: dict) -> dict:
    """Plain summary for the run page: group scores, weakest/strongest scored criteria, gate status."""
    criteria = [{"group": g["name"], **{k: c[k] for k in ("id", "name", "score", "inputs")}}
                for g in result["scores"] if g["name"] != POST_PUBLISH_GROUP for c in g["criteria"] if c["score"] is not None]
    ranked = sorted(criteria, key=lambda c: c["score"])
    return {
        "groups": {g["name"]: {"score": g["score"], "coverage": g["coverage"]} for g in result["scores"]},
        "weakest": ranked[:3],
        "strongest": ranked[::-1][:3],
        "quality_gate": result["quality_gate"]["status"],
        "policy": {t: v["verdict"] for t, v in result["policy"]["targets"].items()},
        "primary_policy_risk": _primary_policy_risk(result["features"]),
    }


def _clean(value: str | None) -> str | None:
    return (value.strip() or None) if value else None


def _check_platforms(platforms: list[str] | None) -> None:
    unknown = sorted(set(platforms or []) - set(POLICY_TARGETS))
    if unknown:
        raise HTTPException(400, f"Unknown platforms {unknown}; expected some of {sorted(POLICY_TARGETS)}")


def _hashtags(raw: list[str] | str | None) -> list[str] | None:
    """Cleaned hashtags (no '#', no duplicates) or None; 400 when there are too many or one is too long."""
    tags = clean_hashtags(raw)
    if len(tags) > MAX_HASHTAGS:
        raise HTTPException(400, f"At most {MAX_HASHTAGS} hashtags, got {len(tags)}")
    long = [t for t in tags if len(t) > MAX_HASHTAG_CHARS]
    if long:
        raise HTTPException(400, f"Hashtag longer than {MAX_HASHTAG_CHARS} characters: {long[0][:40]}...")
    return tags or None


class PostUpdate(BaseModel):
    """Fields of `video.post` to change; keys left out stay as they are, an explicit null clears one."""
    model_config = ConfigDict(extra="forbid")
    caption: str | None = Field(None, max_length=MAX_CAPTION_CHARS)
    hashtags: list[str] | str | None = None
    platforms: list[str] | None = None
    sponsorship: Sponsorship | None = None
    disclosure_enabled: bool | None = None
    goal: str | None = Field(None, max_length=500)


@app.patch("/py/videos/{video_id}/post")
def update_post(video_id: str, body: PostUpdate = Body(...)) -> dict:
    """Updates how the video will be posted (caption, hashtags, platforms, sponsorship, disclosure, goal) on any
    video, seed or uploaded, and returns the updated record. The next analysis reads it; earlier saved
    analyses are not changed."""
    video = fetch(f"/videos/{video_id}")
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(400, "Nothing to update: send at least one of " + ", ".join(PostUpdate.model_fields))
    if "platforms" in changes:
        _check_platforms(changes["platforms"])
        changes["platforms"] = changes["platforms"] or None
    if "hashtags" in changes:
        changes["hashtags"] = _hashtags(changes["hashtags"])
    for key in ("caption", "goal"):
        if key in changes:
            changes[key] = _clean(changes[key])
    try:
        return db.patch(f"/videos/{video_id}", {"post": {**(video.get("post") or {}), **changes}})
    except db.NotFound:
        raise HTTPException(404, f"/videos/{video_id} not found in db")


@app.get("/py/questions")
def question_bank() -> dict:
    """Decisions question bank metadata for drawing the radar before any run. `group` is the score group of a
    `score` question (null for choice / predicate); `asked: false` marks questions the pipeline never sends.
    `scoring` is how group scores become the overall score (core.overall): group weights and label thresholds."""
    bank = decision_scorer.load_bank()
    return {"version": bank.get("version"), "model": decision_scorer.MODEL,
            "questions": [decision_scorer.question_meta(q) for q in bank["questions"]],
            "scoring": {"group_weights": dict(GROUP_WEIGHTS), "thresholds": dict(THRESHOLDS)}}


@app.post("/py/videos/{video_id}/caption-suggest")
def caption_suggest(video_id: str, model: str = VISION_MODEL) -> dict:
    """AI quick-fill: one LLM call (paid; calling this endpoint is the user's explicit action) drafting a
    Vietnamese caption and 3-8 hashtags from the extracted video, the attached SKU / listing and the crawled
    market keywords. Cached per inputs + model + prompt. The draft is run through the policy copy detectors and
    any hit is returned in `policy_flags`. 404 when the video has not been extracted yet."""
    video = fetch(f"/videos/{video_id}")
    cached = find_cached(DATA_DIR / video["local_file"]) if video.get("local_file") else None
    if not cached:
        raise HTTPException(404, "Video chưa được trích xuất nội dung; hãy phân tích (extract) video trước.")
    sku = fetch(f"/skus/{video['sku_id']}") if video.get("sku_id") else None
    snapshot = None
    if video.get("sku_id"):
        try:
            snapshot = db.get(f"/marketSnapshots/{video['sku_id']}")
        except db.NotFound:
            pass  # no crawl for this SKU: the draft uses the video and the listing only
    inputs = caption_writer.build_inputs(video_id, VideoFeatureProvider(cached).load(), sku, video.get("listing"),
                                         snapshot)
    try:
        return caption_writer.suggest(inputs, model, _openai_client)
    except OpenAIError as e:
        raise HTTPException(502, f"OpenAI call failed: {e}")
    except ValueError as e:
        raise HTTPException(502, f"AI quick-fill returned an unusable answer: {e}")


class ListingLink(BaseModel):
    url: str = Field(..., min_length=8, max_length=2000)


@app.post("/py/listings/resolve")
def resolve_listing(body: ListingLink) -> dict:
    """Shopee product link -> listing. One live fetch of the product (short timeout, never retried), else the
    listings already crawled into the db. `source` says which one; `attempts` lists every try. 400 for a link
    that is not a Shopee product, 404 (Vietnamese message: ask the seller to type the listing) when neither
    source has it."""
    def crawled():
        return {name: db.get(f"/{name}") for name in ("shopeeListings", "marketSnapshots", "skus")}

    try:
        return shopee_listing.resolve(body.url, crawled)
    except shopee_listing.NotShopeeLink as e:
        raise HTTPException(400, str(e))
    except LookupError as e:
        raise HTTPException(404, {"message": e.args[0], "attempts": e.args[1]})


@app.post("/py/videos/upload")
def upload_video(
    file: UploadFile = File(...),
    label: str | None = Form(None),
    name: str | None = Form(None),
    url: str | None = Form(None),
    title: str | None = Form(None),
    description: str | None = Form(None),
    price_vnd: int | None = Form(None, gt=0),
    list_price_vnd: int | None = Form(None, gt=0),
    shop_id: str | None = Form(None),
    sku_id: str | None = Form(None),
    sponsorship: Literal["own_shop", "affiliate", "sponsored"] | None = Form(None),
    disclosure_enabled: bool | None = Form(None),
    goal: str | None = Form(None),
    budget_vnd: int | None = Form(None, gt=0),
    campaign: str | None = Form(None),
    user_query: str | None = Form(None),
    platforms: list[str] | None = Form(None),
    caption: str | None = Form(None, max_length=MAX_CAPTION_CHARS),
    hashtags: list[str] | None = Form(None),
) -> dict:
    """Stores the file in data/ and registers a REAL, not-yet-posted video (stage "prepublish").

    `shop_id` + `sku_id` attach it to one of the shop's SKUs (shop/SKU data then apply, video performance
    does not exist yet). `name` (+ optional url/title/description/prices) is a product listing typed by
    the user instead, stored as `listing` and scored as REAL user input (sources.providers.ListingProvider).
    `sponsorship`, `disclosure_enabled`, `goal`/`budget_vnd`/`campaign` and `user_query` describe how it
    will be posted and what the seller asks (sources.providers.PostContextProvider). `caption` and `hashtags`
    (repeated fields or one comma/space-separated value, '#' optional) are the post copy
    (sources.providers.PostCopyProvider).
    """
    ext = Path(file.filename or "").suffix.lower()
    if ext not in VIDEO_EXT:
        raise HTTPException(400, f"Unsupported video type '{ext}', expected one of {sorted(VIDEO_EXT)}")
    name, url, title, description = map(_clean, (name, url, title, description))
    if not name and any(v is not None for v in (url, title, description, price_vnd, list_price_vnd)):
        raise HTTPException(400, "Listing fields need the product name.")
    if url and not url.lower().startswith(("http://", "https://")):
        raise HTTPException(400, "Listing URL must start with http:// or https://")
    listing = {
        "name": name, "url": url, "title": title, "description": description,
        "price_vnd": price_vnd, "list_price_vnd": list_price_vnd, "source": "user_input",
    } if name else None
    shop_id, sku_id = _clean(shop_id), _clean(sku_id)
    sku = None
    if sku_id:
        sku = fetch(f"/skus/{sku_id}")
        if shop_id and sku["shop_id"] != shop_id:
            raise HTTPException(400, f"SKU {sku_id} does not belong to shop {shop_id}")
        shop_id = sku["shop_id"]
    elif shop_id:
        raise HTTPException(400, "Pick the SKU the video will be attached to.")
    _check_platforms(platforms)
    post = {"platforms": platforms or None,
            "sponsorship": sponsorship, "disclosure_enabled": disclosure_enabled, "goal": _clean(goal),
            "budget_vnd": budget_vnd, "campaign": _clean(campaign), "user_query": _clean(user_query),
            "caption": _clean(caption), "hashtags": _hashtags(hashtags)}

    video_id = f"UPL-{uuid.uuid4().hex[:8]}"
    try:
        folder = media.shop_dir(shop_id, DATA_DIR)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{video_id.lower()}{ext}"
    try:
        with path.open("wb") as out:
            shutil.copyfileobj(file.file, out)
        return db.post("/videos", {
            "id": video_id, "shopId": shop_id, "video_id": video_id, "shop_id": shop_id, "sku_id": sku_id,
            "uploaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "stage": "prepublish",
            "local_file": media.relative(path, DATA_DIR), "product_label": name or (sku and sku["item_name"]) or _clean(label),
            "listing": listing, "post": post, "benchmark_id": None, "source_status": "REAL",
        })
    except Exception:
        path.unlink(missing_ok=True)  # do not leave a partial or unregistered file behind
        raise


@app.get("/py/videos/{video_id}/features")
def video_features(video_id: str) -> dict:
    """Cached VLM extraction (hook, demo, claims, CTA, transcript...) of the video's local file."""
    video = fetch(f"/videos/{video_id}")
    cached = find_cached(DATA_DIR / video["local_file"]) if video["local_file"] else None
    if not cached:
        raise HTTPException(404, "No extracted features yet; run POST /py/videos/{id}/extract first.")
    return {**json.loads(cached.read_text(encoding="utf-8")), "extraction_status": _extraction_status(video)}


def _extraction_status(video: dict) -> dict:
    """missing (never extracted), changed (file bytes differ from the cached run), stale (cache predates the
    current prompt) or current. Older caches without a fingerprint, and caches whose video file is not on disk
    (data/*.mp4 is not committed), count as unchanged."""
    cached = find_cached(DATA_DIR / video["local_file"]) if video["local_file"] else None
    if not cached:
        return {"state": "missing", "current_schema_version": SCHEMA_VERSION}
    raw = json.loads(cached.read_text(encoding="utf-8"))
    stale = [k for k, f in VideoFeatureProvider(cached).load().items() if f.evidence and NOT_EXTRACTED in f.evidence[0]]
    stored = raw.get("video_fingerprint")
    file = DATA_DIR / video["local_file"]
    changed = stored is not None and file.exists() and stored != video_fingerprint(file)
    return {"state": "changed" if changed else ("stale" if stale else "current"), "file": cached.name,
            "schema_version": raw.get("schema_version"), "current_schema_version": SCHEMA_VERSION,
            "stale_fields": stale, "fingerprint": stored, "vision_model": raw.get("vision_model"),
            "token_usage": raw.get("token_usage"), "latency": raw.get("benchmark_latency")}


def _local_video(video: dict) -> Path:
    """The video's file in data/; 404 when it is not on this machine (video files are not committed)."""
    path = DATA_DIR / video["local_file"]
    if not path.is_file():
        raise HTTPException(404, f"Video file {path.name} is not in data/; copy it there to extract or view frames.")
    return path


@app.get("/py/videos/{video_id}/frames")
def video_frames(video_id: str) -> dict:
    """The 1 fps frames the VLM saw (re-sampled locally for caches that never saved them; no API call)."""
    video = fetch(f"/videos/{video_id}")
    if not video["local_file"]:
        raise HTTPException(400, "This video has no local file.")
    path = DATA_DIR / video["local_file"]
    if not any(frames_dir(path).glob("*.jpg")):
        path = _local_video(video)
    names = ensure_frames(path)
    return {"frames": [{"sec": float(n.removesuffix(".jpg")), "url": f"/py/frames/{path.stem}/{n}"} for n in names]}


def _paid_step_status(output: dict, miss_reason: str, depends_on: list[str]) -> dict:
    """cache-status entry of a step that reads (markers / scores) produced by earlier paid steps."""
    if output.get("status") == "ok" and output.get("source") == "cache":
        state = {"cached": True, "file": output.get("file")}
    elif output.get("status") == "skipped" and output.get("reason", "").startswith(miss_reason):
        state = {"cached": False}
    else:  # nothing to send (no issue marker, no score) or a broken cache: no call either way
        return {"cached": None, "needed": False, "reason": output.get("reason")}
    if depends_on:
        return {"cached": None, "depends_on": depends_on,
                "reason": f"its input changes once {', '.join(depends_on)} answer; known only after that run"}
    return state


@app.get("/py/videos/{video_id}/cache-status")
def cache_status(video_id: str, rubric: Literal["v1", "v2"] = "v2",
                 model: str = VISION_MODEL) -> dict:
    """What a run with every paid step off would reuse, without any paid call: the same pipeline is built
    with paid calls disabled (caches only, nothing saved) and each paid step reports its cache.

    `{cached: true|false|null, ...}` per step; `cached: null` means unknown before a run (`reason` says why,
    e.g. localize / insights read markers and scores that change once uncached Decisions or policy-reviewer
    answers arrive); `needed: false` means the step would not call a model at all.
    """
    video = fetch(f"/videos/{video_id}")
    out = {"video_id": video_id, "rubric": rubric}
    if not video["local_file"]:
        extraction = {"state": "unavailable", "reason": "video without a local file"}
    else:
        extraction = _extraction_status(video)
    if extraction["state"] in ("missing", "unavailable"):
        unknown = {"cached": None, "reason": "no extracted video content yet: every later step depends on it"}
        return {**out, "extraction": extraction, "decisions": {**unknown, "answered": 0, "eligible": None},
                "policy_review": unknown, "insights": unknown, "localize": unknown}

    trace = Trace()
    result = _build_result(video, RUN_MODE, False, False, rubric, trace, "video_run", None, False, False, model,
                           False, False)
    steps = {s.name: s.output or {} for s in trace.steps}

    rows = (result.get("decisions") or {}).get("questions", [])
    eligible = [q for q in rows if "not eligible" not in (q.get("reason") or "")]
    decision_state = {"eligible": len(eligible), "answered": sum(q["status"] != "MISSING" for q in eligible),
                      "cache_key": (result.get("decisions") or {}).get("cache_key")}
    if eligible:
        decision_state["cached"] = decision_state["cache_key"] is not None
    else:
        decision_state.update(cached=None, needed=False, reason="no eligible question")

    reviewer = (result.get("policy") or {}).get("reviewer") or {}
    if reviewer.get("status") in ("cache", "not_run"):
        policy_state = {"cached": reviewer["status"] == "cache", "cache_key": reviewer.get("cache_key")}
    else:
        policy_state = {"cached": None, "needed": False, "reason": reviewer.get("reason")}

    pending = [n for n, s in (("decisions", decision_state), ("policy_review", policy_state)) if s["cached"] is False]
    return {
        **out,
        "extraction": extraction,
        "decisions": decision_state,
        "policy_review": policy_state,
        "localize": _paid_step_status(steps.get("localize_issues", {}), "paid call not allowed", pending),
        "insights": _paid_step_status(steps.get("summarize_insights", {}), "paid call not allowed", pending),
    }


FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
# name -> fixture files (relative to demo/); the first is the body, the others are nested under their stem.
REFERENCES = {
    "calibration": ("calibration_v0.json",),
    "restricted_categories": ("policy_baseline_v01/restricted_categories.json",),
    "policy_sources": ("policy_baseline_v01/sources.json", "policy_baseline_v01/provenance.json"),
    "fix_templates": ("fix_templates_v1.json",),
    "question_bank": ("decisions_v1/decision_question_bank.json",),
    "platform_specs": ("platform_specs_v1/platform_specs.json",),
}


@app.get("/py/reference/{name}")
def reference(name: str) -> dict:
    """Read-only reference data that json-server does not serve, as stored, plus `_file` (path relative to
    demo/; "a + b" when several files are combined: policy_sources nests provenance.json as `provenance`)."""
    files = REFERENCES.get(name)
    if not files:
        raise HTTPException(404, f"Unknown reference '{name}'; expected one of {sorted(REFERENCES)}")
    try:
        body, *extra = [json.loads((FIXTURES_DIR / f).read_text(encoding="utf-8")) for f in files]
    except (OSError, ValueError) as e:
        raise HTTPException(500, f"Reference '{name}' unreadable: {e}")
    for f, data in zip(files[1:], extra):
        body[Path(f).stem] = data
    return {**body, "_file": " + ".join(f"fixtures/{f}" for f in files)}


@app.get("/py/rubrics")
def rubric_sources() -> dict:
    """Every rule criterion with its weight and the exact code that computes it (for 'how was this scored')."""
    sets = {**{f"rubric_{k}": v for k, v in RUBRIC_VERSIONS.items()}, "shop_rubric": shop_rubric.RUBRICS}
    out = {}
    for set_name, groups in sets.items():
        for group, criteria in groups.items():
            for c in criteria:
                try:
                    source = inspect.getsource(c.fn).strip()
                except (OSError, TypeError):
                    source = None
                out.setdefault(set_name, {})[c.id] = {"group": group, "name": c.name, "weight": c.weight,
                                                      "source": source}
    return out


@app.post("/py/videos/{video_id}/score")
def score_video(video_id: str, claims_llm: bool = False,
                decisions: bool = False, rubric: Literal["v1", "v2"] = "v1", policy_llm: bool = True) -> dict:
    """`claims_llm=true` allows one paid LLM call for C3 (video claims vs listing) when not cached.
    `decisions=true` allows one paid Decisions API call for the eligible question-bank questions when not
    cached; cached answers are always used. `rubric=v2` scores with the question bank. `policy_llm` (on by
    default) lets the policy reviewer LLM add quoted findings on top of the rules."""
    video = fetch(f"/videos/{video_id}")
    try:
        return _score_video(video, RUN_MODE, claims_llm, decisions, rubric, policy_llm=policy_llm)
    except OpenAIError as e:  # e.g. no API key; per-call failures are already reported as C3 MISSING
        raise HTTPException(502, f"OpenAI call failed: {e}")


@app.post("/py/videos/{video_id}/analyze")
def analyze_video(video_id: str, rubric: Literal["v1", "v2"] = "v2",
                  decisions: bool = False, claims_llm: bool = False,
                  extract: Literal["never", "auto", "force"] = "never", cross_check_agent: bool = False,
                  localize: bool = False, model: str = VISION_MODEL, insights: bool = False,
                  policy_llm: bool = True, music: bool = True) -> dict:
    """Full traced run for the Analyze page: extraction + analysis, every step recording agent, tool,
    input, output and time.

    Paid steps run only when allowed: `extract=auto` extracts only when there is no cache or the video file
    changed (same bytes reuse the cache); `extract=force` re-extracts from scratch; `decisions` (Decisions API
    for questions without a cached answer); `claims_llm` (C3 claims check); `cross_check_agent` (LLM auditor
    for low Decisions answers); `localize` (one VLM call boxing the timeline issues on their frames; cached
    boxes are always used); `insights` (one LLM call rewriting the result as plain-language insights for the
    simple view; cached insights are always used); `policy_llm` (policy reviewer LLM, on by default);
    `music` (ShazamIO identification of the background song, free, on by default; cached per video).
    The result carries `overall` (score, label, policy gate) and `fixes` (ranked actions) from build_report.
    """
    return _run_analysis(video_id, Trace(), RUN_MODE, rubric, decisions, claims_llm, extract, cross_check_agent,
                         localize, model, insights, policy_llm, music)


@app.get("/py/videos/{video_id}/analyze/stream")
def analyze_video_stream(video_id: str, rubric: Literal["v1", "v2"] = "v2",
                         decisions: bool = False, claims_llm: bool = False,
                         extract: Literal["never", "auto", "force"] = "never", cross_check_agent: bool = False,
                         localize: bool = False, model: str = VISION_MODEL,
                         insights: bool = False, policy_llm: bool = True, music: bool = True) -> StreamingResponse:
    """Same run as POST .../analyze, as Server-Sent Events: `step_started` and `step_finished` for every
    trace step, then `done {analysis}` (the saved record) or `error {message}`.

    The run lives in a worker thread; a client that disconnects stops the stream, not the run, so the result
    is still saved to /analyses.
    """
    events: queue.Queue = queue.Queue()

    def run():
        try:
            trace = Trace(on_event=lambda event, data: events.put((event, data)))
            analysis = _run_analysis(video_id, trace, RUN_MODE, rubric, decisions, claims_llm, extract,
                                     cross_check_agent, localize, model, insights, policy_llm, music)
            events.put(("done", {"analysis": analysis}))
        except HTTPException as e:
            events.put(("error", {"message": str(e.detail), "status": e.status_code}))
        except Exception as e:  # anything else still ends the stream with a readable error
            events.put(("error", {"message": f"{type(e).__name__}: {e}", "status": 500}))

    threading.Thread(target=run, daemon=True).start()

    def stream():
        while True:
            try:
                event, data = events.get(timeout=SSE_HEARTBEAT_S)
            except queue.Empty:
                yield ": heartbeat\n\n"  # keeps proxies from closing the connection during a long extraction
                continue
            yield f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"
            if event in ("done", "error"):
                return

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _measure_pacing(video: Path, cache_dir: Path, progress) -> None:
    """Shot-cut pacing right after a live extraction (local OpenCV, cached where the video provider reads it),
    so its time shows inside the extraction step. A failure only leaves pacing MISSING later."""
    progress("pacing", "Đo nhịp cắt cảnh (OpenCV)")
    try:
        p = pacing.analyze_pacing(video, cache_dir)
    except (OSError, ValueError) as e:
        progress("pacing", "Không đo được nhịp cắt cảnh", detail={"error": f"{type(e).__name__}: {e}"})
        return
    progress("pacing", f"{p['shot_count']} cảnh, trung bình {p['avg_shot_sec']}s/cảnh",
             detail={"shot_count": p["shot_count"], "avg_shot_sec": p["avg_shot_sec"]})


def _run_analysis(video_id: str, trace: Trace, mode: Mode, rubric: str, decisions: bool, claims_llm: bool,
                  extract: str, cross_check_agent: bool, localize: bool, model: str, insights: bool = False,
                  policy_llm: bool = True, music: bool = False) -> dict:
    with trace.step("get_video", "tool", "orchestrator", "get_video", input={"video_id": video_id}) as s:
        video = fetch(f"/videos/{video_id}")
        s.output = {k: video.get(k) for k in ("id", "shop_id", "sku_id", "product_label", "local_file",
                                               "benchmark_id", "source_status")}
    shop_name = None
    if video["shop_id"]:
        with trace.step("get_shop", "tool", "orchestrator", "get_shop", input={"shop_id": video["shop_id"]}) as s:
            shop = fetch(f"/shops/{video['shop_id']}")
            shop_name = shop["shop_name"]
            s.output = {k: shop.get(k) for k in ("shop_name", "main_category", "scenario", "source_status")}
    if video["local_file"]:
        before = _extraction_status(video)
        run = extract == "force" or (extract == "auto" and before["state"] in ("missing", "changed"))
        with trace.step("extract_video_content", "reasoning" if run else "tool", "video_analyst",
                        "extract_video_content", input={"mode": extract, "model": model, "cache_before": before}) as s:
            if run:
                progress = trace.reporter("extract_video_content")
                try:
                    path = run_extraction(_local_video(video), model, on_step=lambda _: None,
                                          on_progress=progress)
                except HTTPException:
                    raise
                except Exception as e:
                    raise HTTPException(502, f"Extraction failed: {e}")
                raw = json.loads(path.read_text(encoding="utf-8"))
                _measure_pacing(DATA_DIR / video["local_file"], path.parent, progress)
                s.output = {"source": "live extraction", "features_file": path.name,
                            "token_usage": raw.get("token_usage"), "latency": raw.get("benchmark_latency")}
                # VLM only: Whisper is billed per audio minute and reports no tokens.
                s.tokens = tokens_for("live call", raw.get("token_usage"), raw.get("vision_model"))
            else:
                s.status = "skipped" if before["state"] == "missing" else "ok"
                if before["state"] != "missing":
                    s.tokens = tokens_for("cache", before.get("token_usage"), before.get("vision_model"))
                s.output = {"source": "cache" if before["state"] != "missing" else "none",
                            "reason": {"never": "extraction not allowed", "auto": "video file unchanged: cache reused",
                                       "force": ""}[extract], **before}
    try:
        return _score_video(video, mode, claims_llm, decisions, rubric, trace, "video_run",
                            {"shop_name": shop_name, "options": {"decisions": decisions, "claims_llm": claims_llm,
                                                                 "extract": extract,
                                                                 "cross_check_agent": cross_check_agent,
                                                                 "localize": localize, "insights": insights,
                                                                 "policy_llm": policy_llm, "music": music}},
                            cross_check_agent, localize, model, insights, policy_llm, music)
    except OpenAIError as e:
        raise HTTPException(502, f"OpenAI call failed: {e}")


@app.post("/py/videos/{video_id}/extract")
def extract_video(video_id: str, model: str = VISION_MODEL) -> dict:
    """Runs frames + Whisper + VLM on the local file (costs OpenAI tokens), then scores."""
    video = fetch(f"/videos/{video_id}")
    if not video["local_file"]:
        raise HTTPException(400, "This video has no local file to extract.")
    path = _local_video(video)
    try:
        run_extraction(path, model, on_step=lambda _: None)
    except Exception as e:
        raise HTTPException(502, f"Extraction failed: {e}")
    return _score_video(video, RUN_MODE)
