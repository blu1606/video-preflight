"""Decision scoring: ask the OpenAI Decisions API the eligible questions of the question bank.

    evidence (FeatureMap) -> eligible questions -> one batched decisions.create (JSON evidence + keyframes)
    -> decision.<QID> features (INFERRED), aggregated later by core.score_engine like any other feature.

- Eligibility (application-side, the API has no notion of it): a question is sent only when its bank
  features are available; `all_required_*` and `sufficient_*` need every feature, `relevant_*` needs one.
  FeatureView applies the mode, so evidence mode never sends a MOCK-dependent question.
- Outcome features (bench.*, perf.*) are never sent: the questions judge the creative, not its results.
- M04, M05 and M06 are never asked (EXCLUDED_QUESTIONS); they produce no decision.* feature.
- A `score` answer is the probability-weighted level index (0..levels-1); it is normalized to 0-100.
  It is a rubric judgement, not a conversion probability. `choice` / `predicate` answers keep their own
  value and are never averaged into a score.
- Results are cached per (model, questions, evidence, keyframes). Without a cache hit and without a
  client the questions stay MISSING: no API call happens implicitly.
"""

import base64
import hashlib
import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from core.rubric import V2_GROUPS
from core.schema import Feature, FeatureMap, Mode, SourceStatus
from core.score_engine import FeatureUnavailable, FeatureView
from core.trace import Progress, no_progress

DEMO = Path(__file__).resolve().parents[1]
BANK_PATH = DEMO / "fixtures" / "decisions_v1" / "decision_question_bank.json"
CACHE_DIR = DEMO / "output" / "decisions"
KEYFRAMES_DIR = CACHE_DIR / "keyframes"  # cut_keyframes' default output, served by the API at KEYFRAMES_URL
KEYFRAMES_URL = "/py/frames/keyframes"
MODEL = "gpt-6-luna"  # the only model the Decisions API accepts
SOURCE = "decisions_api"
MAX_KEYFRAMES = 5

# Question-bank feature -> project features that can answer it (any available one satisfies it).
# "keyframes:<segment>" are frames cut from the video file (OpenCV), sent as images.
FEATURE_MAP: dict[str, tuple[str, ...]] = {
    "video.hook": ("video.hook_type", "video.hook_verbal", "keyframes:hook"),
    "video.opening_evidence": ("keyframes:hook", "video.on_screen_text"),
    # post.* copy is the seller's caption / hashtags shown with the video (its evidence says so); read by the
    # questions that judge the copy a viewer reads: on-screen text, claims and the offer.
    "video.claims": ("video.key_claims", "video.policy_absolute_claims", "post.caption"),
    "video.product_demo": ("video.demo_present", "video.sensory_details", "keyframes:demo"),
    "video.before_after": ("video.policy_before_after", "video.before_after_shown"),
    "video.cta": ("video.has_cta", "video.cta_urgency", "keyframes:cta"),
    "video.product_mentions": ("video.product_mentions", "video.product_name"),
    "video.product_visibility": ("video.product_visibility",),
    "video.trust_signals": ("video.trust_signals",),
    "video.story_beats": ("video.storytelling",),
    "video.shots": ("video.pacing_cut_timestamps", "video.pacing_avg_shot_sec"),
    "video.on_screen_text": ("video.on_screen_text", "post.caption", "post.hashtags"),
    "video.emotional_triggers": ("video.emotion",),
    "video.value_propositions": ("video.value_propositions",),
    "video.problem": ("video.problem",),
    "video.offer": ("video.offer", "post.caption"),
    "context.target_audience": ("context.target_audience", "video.inferred_target_audience"),
    "context.business_constraints": ("context.business_constraints",),
    # listing.* (Shopee listing of the product in the video) first, the seed / uploaded SKU as fallback.
    "sku.title": ("listing.title", "sku.title"),
    "sku.price": ("listing.price_vnd", "sku.price_vnd"),
    "sku.rating": ("listing.rating", "sku.rating"),
    "sku.review_count": ("listing.review_count", "sku.review_count"),
    "sku.review_summary": ("market.review_positive_ratio", "market.top_complaints"),
    "sku.attributes": ("listing.attributes", "sku.attributes"),
    "sku.images": ("listing.image_count", "sku.image_count"),
    "sku.stock": ("sku.in_stock",),
    "sku.stock_history": ("sku.stock_history",),
    "sku.category": ("bench.category", "sku.category", "video.product_category"),
    "market.comparable_skus": ("market.comparable_listings",),
    "market.demand_signals": ("market.demand_index", "market.trend_score"),
    "market.category_benchmark": ("market.category_benchmark",),
    "post.shopping_link": ("post.shopping_link", "sku.has_product_link"),
    "post.sponsorship": ("post.sponsorship", "post.is_commercial"),
    "post.disclosure": ("post.disclosure_enabled", "video.disclosure_signals"),
    "shop.fulfillment": ("shop.late_shipment_rate", "shop.cancellation_rate"),
    "shop.catalog_metrics": ("shop.listing_completeness", "shop.stockout_sku_ratio"),
    "shop.fulfillment_metrics": ("shop.late_shipment_rate", "shop.cancellation_rate", "shop.return_rate"),
    "shop.visits": ("shop.visits_30d",),
    "shop.orders": ("shop.orders_30d",),
    "shop.ads_spend": ("shop.roas",),
    "shop.attributed_revenue": ("shop.ads_gmv_share",),
    "shop.margin": ("shop.contribution_margin_rate",),
    "shop.rating": ("shop.rating",),
    "shop.review_count": ("shop.rating_count",),
    "shop.service_metrics": ("shop.negative_topics",),
    "shop.metrics": ("shop.gmv_30d_vnd", "shop.visit_to_order_cvr"),
    # The rule list (core.policy_check.applicable_rules_feature) is known before any content is judged;
    # policy.findings remains a fallback for callers that run the policy check first.
    "policy.applicable_rules": ("policy.applicable_rules", "policy.findings"),
    # Workflow-level inputs (report findings, quality gate) are not features yet; the user request is.
    "scores.findings": (),
    "quality.missing_critical_features": (),
    "quality.conflicts": (),
    "request.user_query": ("request.user_query",),
}
OUTCOME_PREFIXES = ("bench.", "perf.")
# Never sent: M04/M05 need the finished report (the fixes engine and quality gate cover them) and M06 does
# not change any result. Dropping them keeps one Decisions call per run.
EXCLUDED_QUESTIONS = frozenset({"M04", "M05", "M06"})


@lru_cache(maxsize=1)
def load_bank() -> dict:
    return json.loads(BANK_PATH.read_text(encoding="utf-8"))


def questions_by_id() -> dict[str, dict]:
    return {q["id"]: q for q in load_bank()["questions"]}


def _available(name: str, view: FeatureView, keyframes: dict[str, list]) -> bool:
    if name.startswith("keyframes:"):
        return bool(keyframes.get(name.split(":", 1)[1]))
    if name.startswith(OUTCOME_PREFIXES) and name != "bench.category":
        return False
    try:
        view[name]
        return True
    except FeatureUnavailable:
        return False


def eligibility(q: dict, features: FeatureMap, mode: Mode, keyframes: dict[str, list]) -> tuple[bool, list[str], str]:
    """(eligible, project inputs used, reason when not eligible)."""
    view = FeatureView(features, mode)
    satisfied, missing = [], []
    for bank_feature in q["required_features"]:
        hits = [n for n in FEATURE_MAP[bank_feature] if _available(n, view, keyframes)]
        (satisfied if hits else missing).append(bank_feature)
    need_all = not q["eligibility"].startswith("relevant")
    ok = not missing if need_all else bool(satisfied)
    inputs = sorted(view.used)
    return ok, inputs, "" if ok else f"missing {', '.join(missing)}"


# ---------- keyframes ----------

def _window(feature: Feature | None) -> tuple[float, float] | None:
    """First 'MM:SS-MM:SS' or 'MM:SS' found in a feature's evidence."""
    for ev in (feature.evidence if feature else []):
        m = re.search(r"(\d{2}):(\d{2})(?:-(\d{2}):(\d{2}))?", ev)
        if m:
            start = int(m[1]) * 60 + int(m[2])
            end = int(m[3]) * 60 + int(m[4]) if m[3] else start
            return start, end
    return None


def keyframe_times(features: FeatureMap) -> dict[str, list[float]]:
    times: dict[str, list[float]] = {"hook": [0.5, 1.5, 2.5]}
    demo = _window(features.get("video.demo_present"))
    if demo and demo[1] > demo[0]:
        times["demo"] = [(demo[0] + demo[1]) / 2]
    cta = features.get("video.has_cta")
    if cta and cta.value and _window(cta):
        times["cta"] = [_window(cta)[0]]
    return times


def cut_keyframes(video: Path, times: dict[str, list[float]], cache_dir: Path = CACHE_DIR) -> dict[str, list[dict]]:
    """JPEG frames (512px) at the given times, cached under cache_dir/keyframes/<video stem>/."""
    import cv2  # local: only needed when a video file is available

    out_dir = cache_dir / "keyframes" / video.stem
    out_dir.mkdir(parents=True, exist_ok=True)
    frames: dict[str, list[dict]] = {}
    cap = None
    for segment, secs in times.items():
        for sec in secs:
            path = out_dir / f"{segment}_{sec:.1f}.jpg"
            if not path.exists():
                cap = cap or cv2.VideoCapture(str(video))
                cap.set(cv2.CAP_PROP_POS_MSEC, sec * 1000.0)
                ok, frame = cap.read()
                if not ok:
                    continue
                h, w = frame.shape[:2]
                scale = 512 / max(h, w)
                frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
                cv2.imwrite(str(path), frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            frames.setdefault(segment, []).append({"segment": segment, "sec": sec, "path": path})
    if cap is not None:
        cap.release()
    return frames


# ---------- request / response ----------

def _evidence(features: FeatureMap, inputs: set[str]) -> dict:
    """Compact JSON evidence: every field carries its provenance; outcomes never included."""
    out = {}
    for name in sorted(inputs):
        f = features[name]
        out[name] = {"value": f.value, "status": f.status.value, "evidence": f.evidence[:5]}
    return out


def build_request(questions: list[dict], evidence: dict, frames: list[dict]) -> dict:
    content = [
        {"type": "input_text", "text": "Evidence about one short e-commerce video and its product. Each field has a "
                                       "status: REAL (extracted/observed), MOCK (synthetic test data), INFERRED. "
                                       "Answer only from this evidence and the keyframes; do not assume sales outcomes."},
        {"type": "input_json", "data": evidence},
    ]
    for fr in frames[:MAX_KEYFRAMES]:
        content.append({"type": "input_text", "text": f"Keyframe ({fr['segment']}) at {fr['sec']:.1f}s:"})
        data = base64.b64encode(Path(fr["path"]).read_bytes()).decode()
        content.append({"type": "input_image", "image_url": f"data:image/jpeg;base64,{data}", "detail": "low"})
    return {"model": MODEL, "input": [{"role": "user", "content": content}],
            "questions": [q["question"] for q in questions]}


def _cache_key(request: dict) -> str:
    return hashlib.sha256(json.dumps(request, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()[:16]


def _answer_feature(q: dict, answer: dict, inputs: list[str], features: FeatureMap, key: str) -> Feature:
    mock = any(features[n].is_mock_based for n in inputs if n in features)
    if answer["type"] == "refusal":
        return Feature.missing(f"{q['id']}: model refused")
    if answer["type"] == "score":
        top = len(q["question"]["levels"]) - 1
        value = round(answer["score"] / top * 100, 1)
        evidence = [f"level {answer['score']:.2f}/{top}, confidence {answer['confidence']:.2f}"]
    elif answer["type"] == "choice":
        value = answer["choice"]
        evidence = [f"choice {value}, confidence {answer['confidence']:.2f}"]
    else:
        value = round(answer["probability"], 3)
        evidence = [f"probability {value}"]
    return Feature(value, SourceStatus.INFERRED, SOURCE, evidence + [f"cache {key}"], input_sources=inputs,
                   mock_dependency=mock)


def question_meta(q: dict) -> dict:
    """Bank metadata the UI needs to draw a question before or after any run.

    group: the v2 score group of a `score` question (by id prefix, as core.rubric builds it); None for
    choice / predicate questions, which are never averaged into a score.
    """
    return {"id": q["id"], "group": V2_GROUPS.get(q["id"][0]) if q["question"]["type"] == "score" else None,
            "domain": q.get("domain"), "dimension": q.get("dimension"), "type": q["question"]["type"],
            "weight": q.get("weight"),  # choice/predicate questions have none
            "instructions": q["question"].get("instructions"), "levels": q["question"].get("levels"),
            "required_features": q.get("required_features", []), "eligibility": q.get("eligibility"),
            "asked": q["id"] not in EXCLUDED_QUESTIONS}


def answer_details(features: FeatureMap, video_stem: str, cache_dir: Path = CACHE_DIR) -> dict:
    """Explain each decision.* feature: the question asked, the level distribution and why it was skipped.

    Reads the cached Decisions response named in the feature's evidence ("cache <key>"); read-only.
    """
    bank = questions_by_id()
    calls: dict[str, dict] = {}
    questions = []
    for name, f in features.items():
        if not name.startswith("decision."):
            continue
        q = bank[name.removeprefix("decision.")]
        row = {**question_meta(q), "status": f.status.value, "value": f.value,
               "inputs": f.input_sources, "mock_dependency": f.mock_dependency}
        key = next((e.removeprefix("cache ") for e in f.evidence if e.startswith("cache ")), None)
        if key:
            if key not in calls:
                path = cache_dir / f"{video_stem}.{key}.json"
                calls[key] = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
            answer = next((a for a in calls[key].get("answers", []) if a.get("name") == q["id"]), None)
            row["answer"] = answer
        else:
            row["reason"] = f.evidence[0] if f.evidence else None
        questions.append(row)
    return {
        "calls": [{"cache_key": k, "model": c.get("model"), "usage": c.get("usage"),
                   "questions": c.get("questions")} for k, c in calls.items()],
        "questions": questions,
    }


@dataclass
class RequestPlan:
    """The one batched Decisions request a run would send, built without calling anything.

    `frames` are exactly the keyframes attached (every one goes with every question of the batch);
    `cache` is the answer file named by the request's cache key (None when no question is eligible).
    """
    not_eligible: FeatureMap
    eligible: list[tuple[dict, list[str]]]
    frames: list[dict]
    request: dict | None = None
    key: str | None = None
    cache: Path | None = None

    @property
    def cached(self) -> bool:
        return self.cache is not None and self.cache.exists()


def plan_request(features: FeatureMap, mode: Mode, video: Path | None, question_ids: list[str] | None = None,
                 cache_dir: Path = CACHE_DIR) -> RequestPlan:
    """Eligibility, keyframes, request and cache key. Local work only (keyframes are cut once and cached)."""
    bank = questions_by_id()
    ids = [qid for qid in (question_ids or list(bank)) if qid not in EXCLUDED_QUESTIONS]
    frames_by_segment = cut_keyframes(video, keyframe_times(features), cache_dir) if video and video.is_file() else {}

    not_eligible: FeatureMap = {}
    eligible: list[tuple[dict, list[str]]] = []
    for qid in ids:
        ok, inputs, reason = eligibility(bank[qid], features, mode, frames_by_segment)
        if ok:
            eligible.append((bank[qid], inputs))
        else:
            not_eligible[f"decision.{qid}"] = Feature.missing(f"{qid} not eligible: {reason}")
    frames = [fr for seg in ("hook", "demo", "cta") for fr in frames_by_segment.get(seg, [])][:MAX_KEYFRAMES]
    if not eligible:
        return RequestPlan(not_eligible, eligible, frames)
    used = {n for _, inputs in eligible for n in inputs}
    request = build_request([q for q, _ in eligible], _evidence(features, used), frames)
    key = _cache_key(request)
    return RequestPlan(not_eligible, eligible, frames, request, key,
                       cache_dir / f"{video.stem if video else 'novideo'}.{key}.json")


def keyframes_sent(plan: RequestPlan) -> list[dict]:
    """[{sec, segment, url}] of the keyframes attached to the request; `url` is served by the API under
    KEYFRAMES_URL (the JPEG as cut, not a 1 fps frame)."""
    return [{"sec": fr["sec"], "segment": fr["segment"],
             "url": f"{KEYFRAMES_URL}/{Path(fr['path']).parent.name}/{Path(fr['path']).name}"} for fr in plan.frames]


def answer(plan: RequestPlan, features: FeatureMap, client=None, on_progress: Progress = no_progress) -> FeatureMap:
    """decision.<QID> features for the plan: cached answers, else one call when `client` is given."""
    out = dict(plan.not_eligible)
    if not plan.eligible:
        return out
    n, size = len(plan.eligible), {"questions": len(plan.eligible), "keyframes": len(plan.frames)}
    if plan.cached:
        answers = json.loads(plan.cache.read_text(encoding="utf-8"))["answers"]
        on_progress("cache", "Dùng câu trả lời Decisions đã cache", len(answers), n, {**size, "cache_key": plan.key})
    elif client is None:
        return {**out, **{f"decision.{q['id']}": Feature.missing("Decisions call not allowed (no client, no cache)")
                          for q, _ in plan.eligible}}
    else:
        on_progress("sent", f"Đã gửi {n} câu + {len(plan.frames)} keyframe cho Decisions API", 0, n, size)
        try:
            response = client.decisions.create(**plan.request)
        except Exception as e:  # optional step: the report keeps working without it
            return {**out, **{f"decision.{q['id']}": Feature.missing(f"Decisions call failed: {e}")
                              for q, _ in plan.eligible}}
        answers = [a.model_dump() for a in response.answers]
        usage = response.usage.model_dump()
        on_progress("received", f"Nhận {len(answers)} câu trả lời", len(answers), n,
                    {k: usage.get(k) for k in ("input_tokens", "output_tokens", "total_tokens") if k in usage})
        plan.cache.parent.mkdir(parents=True, exist_ok=True)
        plan.cache.write_text(json.dumps({"model": response.model, "usage": usage,
                                          "questions": [q["id"] for q, _ in plan.eligible], "answers": answers},
                                         ensure_ascii=False, indent=2), encoding="utf-8")
    for (q, inputs), a in zip(plan.eligible, answers):
        out[f"decision.{q['id']}"] = _answer_feature(q, a, inputs, features, plan.key)
    return out


def decision_features(features: FeatureMap, mode: Mode, video: Path | None, client=None,
                      question_ids: list[str] | None = None, cache_dir: Path = CACHE_DIR,
                      on_progress: Progress = no_progress) -> FeatureMap:
    """decision.<QID> features for the eligible questions; MISSING with a reason for the others."""
    return answer(plan_request(features, mode, video, question_ids, cache_dir), features, client, on_progress)
