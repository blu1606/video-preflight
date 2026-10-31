"""Fixed local pipeline. Agent labels describe roles, not autonomous LLM calls."""
import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from core.evidence import missing, missing_inputs, observed
from core.datasets import question_bank
from core.decisions import plan as decisions_plan
from core.media import extract, sha256
from core.scoring import aggregate
from core.policy import evaluate as evaluate_policy

VERSION = "foundation-pipeline/v4"
AGENTS = [
    {"id": "media_analyst", "name": "Media Analyst"},
    {"id": "commerce_analyst", "name": "Commerce Analyst"},
    {"id": "policy_reviewer", "name": "Policy Reviewer"},
    {"id": "verdict_writer", "name": "Verdict Writer"},
]
TOOLS = [
    {"id": "extract_media", "stage": "extract", "agent": "media_analyst", "name": "Đo video & trích frame", "kind": "deterministic", "implemented": True},
    {"id": "gather_context", "stage": "gather", "agent": "commerce_analyst", "name": "Đọc shop, SKU & dữ liệu", "kind": "deterministic", "implemented": True},
    {"id": "collect_claims", "stage": "claims", "agent": "commerce_analyst", "name": "Tập hợp claim & nguồn", "kind": "deterministic", "implemented": True},
    {"id": "ask_decisions", "stage": "decisions", "agent": "commerce_analyst", "name": "Decisions API", "kind": "orchestration", "implemented": False},
    {"id": "check_policy", "stage": "policy", "agent": "policy_reviewer", "name": "Kiểm tra Policy", "kind": "deterministic", "implemented": True},
    {"id": "cross_check", "stage": "cross_check", "agent": "commerce_analyst", "name": "Đối chiếu câu trả lời", "kind": "deterministic", "implemented": False},
    {"id": "score_readiness", "stage": "scoring", "agent": "commerce_analyst", "name": "Tổng hợp điểm & coverage", "kind": "deterministic", "implemented": True},
    {"id": "compose_verdict", "stage": "verdict", "agent": "verdict_writer", "name": "Kết luận & dữ liệu thiếu", "kind": "deterministic", "implemented": True},
    {"id": "transcribe_audio", "agent": "media_analyst", "name": "ASR", "kind": "orchestration", "implemented": False},
    {"id": "read_frames", "agent": "media_analyst", "name": "Đọc frame", "kind": "orchestration", "implemented": False},
    {"id": "review_policy_llm", "agent": "policy_reviewer", "name": "Rà Policy bằng LLM", "kind": "orchestration", "implemented": False},
    {"id": "localize_issues", "agent": "media_analyst", "name": "Khoanh vùng bằng chứng", "kind": "orchestration", "implemented": False},
    {"id": "write_insights", "agent": "verdict_writer", "name": "Viết insight có nguồn", "kind": "orchestration", "implemented": False},
]
PLATFORMS = {"tiktok_shop_video": "TikTok Shop", "tiktok_ads": "TikTok Ads", "shopee_listing": "Shopee", "meta_ads": "Meta Ads"}


def now():
    return datetime.now(timezone.utc).isoformat()


def fingerprint(video, context):
    return hashlib.sha256(json.dumps({"video": video, "context": context, "pipeline": VERSION}, sort_keys=True).encode()).hexdigest()


def gather(store, video):
    shop = store.get("shops", video["shop_id"]) if video.get("shop_id") else None
    sku = store.get("skus", video["sku_id"]) if video.get("sku_id") else None
    market = store.list("marketSnapshots", sku_id=sku["id"]) if sku else []
    return {"shop": shop, "sku": sku, "market": market}


def context_feature(record, kind):
    if not record:
        return missing(f"Chưa có {kind}")
    provenance = record.get("provenance")
    if not provenance:
        return missing(f"{kind} thiếu provenance")
    status = provenance.get("status", "MISSING")
    if status not in ("REAL", "MOCK", "INFERRED"):
        return missing(f"{kind} chưa xác định nguồn")
    return {"value": record, "status": status, "source": provenance.get("tool", "user_input"),
            "evidence": [{"collection": kind, "id": record["id"], "provenance": provenance}], "reason": None}


def execute(video, context, root, emit, *, force=False):
    root = Path(root)
    path = root / "data" / video["file"]
    if sha256(path) != video["metadata"]["sha256"]:
        raise ValueError("File video đã thay đổi; hãy upload lại để đo và đăng ký nguồn mới.")
    trace, features = [], {}

    def step(tool_id, inputs, callback):
        tool = next(t for t in TOOLS if t["id"] == tool_id)
        start = time.perf_counter()
        entry = {**tool, "input": inputs, "started_at": now(), "status": "running", "tokens": None}
        emit("step_started", entry)
        try:
            output = callback()
            status = "skipped" if output.get("status") in ("not_configured", "not_available") else "ok"
        except Exception:
            emit("step_finished", {**entry, "status": "error", "duration_s": round(time.perf_counter() - start, 4),
                                   "output": {"reason": "Bước xử lý thất bại; xem lỗi của lượt chạy."}})
            raise
        entry = {**entry, "status": status, "output": output, "duration_s": round(time.perf_counter() - start, 4)}
        trace.append(entry)
        emit("step_finished", entry)
        return output

    extraction = step("extract_media", {"video_id": video["id"], "sha256": video["metadata"]["sha256"], "force": force},
                      lambda: extract(path, root / ".runtime" / "artifacts", video["metadata"], force=force,
                                      progress=lambda done, total: emit("step_progress", {"id": "extract_media", "done": done, "total": total, "label": "Trích frame local"})))
    for key, value in extraction["metadata"].items():
        features[f"video.{key}"] = observed(value, "ffprobe", [{"video_id": video["id"], "sha256": video["metadata"]["sha256"]}])
    features["video.frames"] = observed(extraction["frames"], "ffmpeg", extraction["frames"])
    features["video.visual_observations"] = missing("Frame đã trích; chưa có provider đọc nội dung ảnh")
    features["video.transcript"] = missing("Chưa cấu hình ASR")
    data = step("gather_context", {"shop_id": video.get("shop_id"), "sku_id": video.get("sku_id"), "published": video["published"]}, lambda: context)
    features["shop.profile"] = context_feature(data["shop"], "shops")
    features["sku.listing"] = context_feature(data["sku"], "skus")
    features["market.snapshot"] = context_feature(data["market"][0] if data["market"] else None, "marketSnapshots")
    for key in ("caption", "hashtags", "audience"):
        value = video.get(key)
        features[f"post.{key}"] = observed(value, "seller", [{"video_id": video["id"], "field": key, "verification": "user_supplied"}]) if value else missing(f"Chưa nhập {key}")
    features["performance.outcome"] = observed(video["outcome"], "seller", [{"video_id": video["id"], "verification": "user_supplied_not_platform_verified"}]) if video.get("published") and video.get("outcome") else missing("Chưa có số liệu sau đăng")
    bank = question_bank(root)
    features["decisions.question_bank"] = observed({"version": bank["version"], "questions": len(bank["questions"])}, "imported_question_bank",
                                                   [{"file": "data/fixtures/decisions_v1/decision_question_bank.json", "import_commit": "9289181"}]) if bank else missing("Chưa nhập bộ ecommerce_decisions_question_bank_v1")
    features["decisions.provider"] = missing("Chưa tích hợp provider")
    features["policy.current_sources"] = missing("Chưa xác minh lại từng link chính thức trong baseline nhập")
    claims = step("collect_claims", {"caption": video.get("caption", ""), "transcript_count": 0},
                  lambda: {"items": [], "status": "not_available", "reason": "Chưa có bộ trích claim; caption được lưu nguyên văn, không tự suy ra claim."})
    decisions = step("ask_decisions", {"question_bank_version": bank["version"] if bank else None, "outcomes_included": False, "external_calls": 0},
                     lambda: decisions_plan(bank, features))
    policy_sources = [{"id": "post.caption", "kind": "caption", "text": video["caption"]}] if video.get("caption") else []
    if video.get("hashtags"):
        policy_sources.append({"id": "post.hashtags", "kind": "hashtags", "text": " ".join("#" + tag for tag in video["hashtags"])})
    policy = step("check_policy", {"platforms": video["platforms"], "sources": policy_sources},
                  lambda: evaluate_policy(root, video["platforms"], policy_sources))
    cross_check = step("cross_check", {"questions": 0}, lambda: {"status": "not_available", "items": [], "reason": "Chưa có câu trả lời Decisions để đối chiếu."})
    criteria = [{"id": q["id"], "name": q["question"]["instructions"], "group": q["domain"], "weight": q.get("weight", 1),
                 "status": "not_scored", "score": None, "inputs": [], "reason": q["reason"]}
                for q in decisions["questions"] if q["domain"] in ("viral", "conversion", "sku") and q["question"]["type"] == "score"]
    scores = step("score_readiness", {"rubric": bank["version"] if bank else None, "weights": {"viral": .35, "conversion": .45, "sku": .20}}, lambda: aggregate(criteria, features))
    gaps = missing_inputs(features)
    verdict = step("compose_verdict", {"coverage": scores["coverage"], "policy": policy["targets"]},
                   lambda: {"label": "Chưa đủ dữ liệu để chấm", "summary": "Đã đo file và trích frame. Chưa có kết quả chấm nội dung; xem các dữ liệu cần bổ sung.", "fixes": [], "missing_inputs": gaps})
    return {"video_id": video["id"], "pipeline_version": VERSION, "extraction": extraction, "features": features,
            "scores": scores, "decisions": decisions, "claims": claims, "policy": policy, "cross_check": cross_check,
            "verdict": verdict, "trace": trace, "external_calls": 0, "paid_calls": 0,
            "revenue_funnel": {"status": "not_scored", "reason": "Chưa có dữ liệu hiệu suất và mô hình dự báo đã hiệu chỉnh"},
            "shop_health": {"status": "not_scored", "reason": "Bối cảnh riêng; không tính vào điểm video"}}
