"""Policy reviewer: one batched LLM call that reads the video text against every applicable policy rule.

    applicable rules (summary + source link) + timestamped transcript + on-screen text + claims + listing + post
    -> per rule {outcome: needs_review | not_triggered | unknown, quotes: [{text, t}], confidence, rationale}

Guardrails (applied here, never trusted to the model):
- every quote must appear verbatim (whitespace/case-normalized) in a transcript segment, an on-screen text item
  or the listing text, otherwise it is dropped; `t` comes from the matched source item, not from the model;
- `needs_review` without a valid quote is downgraded to `unknown`.
The merge with rule detectors (the reviewer can add or confirm, never clear a detector hit) lives in
core.policy_check.

Cache: <cache_dir>/<key>.json, key = hash(model, prompt, rules, evidence). Only validated answers are cached;
an unreadable or malformed cache file is a miss. Without a cache hit and without a client nothing is called.
"""

import hashlib
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

from core.schema import FeatureMap, Mode
from core.score_engine import FeatureUnavailable, FeatureView
from core.trace import Progress, no_progress
from sources.extractor import VISION_MODEL

DEMO = Path(__file__).resolve().parents[1]
CACHE_DIR = DEMO / "output" / "policy_review"
REVIEW_MODEL = VISION_MODEL  # same model as the extractor and the cross-check auditor
OUTCOMES = ("needs_review", "not_triggered", "unknown")
MIN_QUOTE_WORDS = 2  # a single word ("trắng") proves nothing on its own

SYSTEM_PROMPT = """You are a policy reviewer for short e-commerce videos sold on TikTok Shop, TikTok Ads, Shopee and Meta
in Vietnam. For EACH rule given, decide whether the supplied content gives a concrete reason for a human to review it.
- "needs_review": a specific passage plausibly breaches the rule. You MUST quote it.
- "not_triggered": you read the relevant content and nothing in it touches the rule.
- "unknown": the content needed to judge this rule is not supplied (e.g. post settings, listing images, documents).
Quotes: copy the exact words from a transcript segment, an on-screen text item or the listing text, in the
original language, at least two words, no paraphrase, no translation, no added punctuation. Give `t` = the
start second of the item you quoted (null for listing text). Do not invent facts that are not in the content.
Flag risk only; never declare the content approved or compliant. Write `rationale` in Vietnamese (1-2 sentences).
Return STRICTLY JSON: {"rules": [{"rule_id": "...", "outcome": "needs_review | not_triggered | unknown",
"quotes": [{"text": "...", "t": <number or null>}], "confidence": <0..1>, "rationale": "..."}]}"""

# Features sent to the reviewer: name -> section in the evidence payload.
LISTING_KEYS = ("listing.title", "sku.title", "sku.description", "sku.category", "sku.price_vnd", "sku.list_price_vnd")
POST_KEYS = ("post.is_commercial", "post.sponsorship", "post.disclosure_enabled", "post.ai_label_enabled",
             "post.shopping_link", "post.caption", "post.hashtags")
PRODUCT_KEYS = ("video.product_name", "video.product_category", "bench.category")


def normalize(text: str) -> str:
    """Comparable form of a quote: NFC, case-folded, single spaces, no surrounding quote marks."""
    text = unicodedata.normalize("NFC", str(text)).casefold()
    text = re.sub(r"\s+", " ", text).strip()
    return text.strip(" \"'“”‘’«»….,!?:;")


def _optional(view: FeatureView, name: str):
    try:
        return view[name]
    except FeatureUnavailable:
        return None


def _timed_items(rows, time_key: str) -> list[dict]:
    """[{text, t}] from a list of dicts with a text and a time field; malformed rows are skipped."""
    out = []
    for row in rows or []:
        if isinstance(row, dict) and str(row.get("text") or "").strip():
            t = row.get(time_key)
            out.append({"text": str(row["text"]).strip(), "t": t if isinstance(t, (int, float)) else None})
    return out


def build_evidence(features: FeatureMap, mode: Mode) -> tuple[dict, dict]:
    """(evidence payload, features used). FeatureView applies the mode: evidence mode never sends MOCK inputs."""
    view = FeatureView(features, mode)
    transcript = _timed_items(_optional(view, "video.transcript_segments"), "start")
    if not transcript:
        whole = _optional(view, "video.transcript")
        transcript = [{"text": whole.strip(), "t": None}] if isinstance(whole, str) and whole.strip() else []
    evidence = {
        "transcript": transcript,
        "on_screen_text": _timed_items(_optional(view, "video.on_screen_text"), "timestamp_sec"),
        "claims": [str(c) for c in _optional(view, "video.key_claims") or []],
        "product": {k: v for k in PRODUCT_KEYS if (v := _optional(view, k)) is not None},
        "listing": {k: v for k in LISTING_KEYS if (v := _optional(view, k)) is not None},
        "post": {k: v for k in POST_KEYS if (v := _optional(view, k)) is not None},
    }
    return evidence, dict(view.used)


def quote_sources(evidence: dict) -> list[dict]:
    """Texts a quote may come from: transcript segments, on-screen text, the listing title/description and the
    seller's caption (no time: it is shown with the video, not in it)."""
    items = [{**i, "where": "transcript"} for i in evidence["transcript"]]
    items += [{**i, "where": "on_screen_text"} for i in evidence["on_screen_text"]]
    items += [{"text": str(v), "t": None, "where": k} for k, v in evidence["listing"].items()
              if k in ("listing.title", "sku.title", "sku.description") and isinstance(v, str)]
    caption = evidence["post"].get("post.caption")
    if isinstance(caption, str):
        items.append({"text": caption, "t": None, "where": "caption"})
    return items


def _spanning_hit(norm: str, sources: list[dict]) -> list[dict]:
    """A quote that runs across consecutive transcript segments: the segment where it starts."""
    joined, starts = "", []
    for s in (s for s in sources if s["where"] == "transcript"):
        starts.append((len(joined), s))
        joined += normalize(s["text"]) + " "
    pos = joined.find(norm)
    if pos < 0:
        return []
    return [next(s for offset, s in reversed(starts) if offset <= pos)]


def verify_quote(quote: Any, sources: list[dict]) -> dict | None:
    """{text, t, where} when the quote appears verbatim in one source item (or across the full transcript)."""
    if not isinstance(quote, dict):
        return None
    norm = normalize(quote.get("text") or "")
    if len(norm.split()) < MIN_QUOTE_WORDS:
        return None
    hits = [s for s in sources if norm in normalize(s["text"])] or _spanning_hit(norm, sources)
    if not hits:
        return None
    asked = quote.get("t")
    if isinstance(asked, (int, float)) and len(hits) > 1:
        hits.sort(key=lambda s: abs((s["t"] if s["t"] is not None else 1e9) - asked))
    best = hits[0]
    return {"text": str(quote["text"]).strip(), "t": best["t"], "where": best["where"]}


def parse_review(content: str, rule_ids: list[str], sources: list[dict]) -> dict[str, dict]:
    """Validated per-rule answers. Raises ValueError when the JSON is unusable as a whole."""
    data = json.loads(content)
    rows = data.get("rules") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        raise ValueError(f"expected {{'rules': [...]}}, got {content[:200]!r}")
    out: dict[str, dict] = {}
    for row in rows:
        if not isinstance(row, dict) or row.get("rule_id") not in rule_ids or row["rule_id"] in out:
            continue
        outcome = row.get("outcome") if row.get("outcome") in OUTCOMES else "unknown"
        raw_quotes = row.get("quotes") if isinstance(row.get("quotes"), list) else []
        checked = [(q, verify_quote(q, sources)) for q in raw_quotes]
        verified = [v for _, v in checked if v]
        dropped = [str(q.get("text") if isinstance(q, dict) else q) for q, v in checked if not v]
        downgraded = outcome == "needs_review" and not verified
        conf = row.get("confidence")
        out[row["rule_id"]] = {
            "outcome": "unknown" if downgraded else outcome,
            "model_outcome": outcome,
            "quotes": verified,
            "dropped_quotes": dropped,
            "downgraded": downgraded,
            "confidence": round(float(conf), 2) if isinstance(conf, (int, float)) and not isinstance(conf, bool) else None,
            "rationale": str(row.get("rationale") or ""),
        }
    if not out:
        raise ValueError("no answer for any requested rule")
    return out


def _cache_key(rules: list[dict], evidence: dict, model: str) -> str:
    payload = [model, SYSTEM_PROMPT, rules, evidence]
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()[:16]


def _read_cache(path: Path) -> dict | None:
    """Cached result, or None when absent or damaged (a damaged file is a miss, never an error)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    ok = isinstance(data, dict) and isinstance(data.get("rules"), dict) and data["rules"] and all(
        isinstance(r, dict) and r.get("outcome") in OUTCOMES and isinstance(r.get("quotes"), list)
        for r in data["rules"].values())
    return data if ok else None


def review(rules: list[dict], features: FeatureMap, mode: Mode, client: Any = None,
           cache_dir: Path = CACHE_DIR, model: str = REVIEW_MODEL, on_progress: Progress = no_progress) -> dict:
    """{status, rules: {rule_id: answer}, ...}. status: cache | live call | not_run | skipped | failed.
    `on_progress` (core.trace.Progress) is told when a cached review is used and when a call is sent / answered."""
    evidence, used = build_evidence(features, mode)
    meta = {"model": model, "inputs": sorted(used), "mock_dependency": any(f.is_mock_based for f in used.values())}
    if not rules:
        return {**meta, "status": "skipped", "reason": "no applicable rule", "rules": {}}
    sources = quote_sources(evidence)
    if not sources:
        return {**meta, "status": "skipped", "reason": "no transcript, on-screen text or listing text to quote",
                "rules": {}}
    rule_payload = [{k: r[k] for k in ("rule_id", "summary_en", "severity", "source_url")} for r in rules]
    key = _cache_key(rule_payload, evidence, model)
    path = cache_dir / f"{key}.json"
    cached = _read_cache(path)
    if cached:
        on_progress("cache", "Dùng kết quả policy reviewer đã cache", detail={"rules": len(rules), "cache_key": key})
        return {**meta, **cached, "status": "cache", "cache_key": key}
    if client is None:
        return {**meta, "status": "not_run", "reason": "policy reviewer not allowed (paid call) and no cache",
                "cache_key": key, "rules": {}}
    user = json.dumps({"rules": rule_payload, "content": evidence}, ensure_ascii=False, default=str)
    on_progress("sent", f"Gửi {len(rules)} rule + nội dung video cho policy reviewer",
                detail={"rules": len(rules), "transcript_items": len(evidence["transcript"]),
                        "on_screen_text_items": len(evidence["on_screen_text"]), "model": model})
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}],
            response_format={"type": "json_object"},
        )
        answers = parse_review(response.choices[0].message.content, [r["rule_id"] for r in rules], sources)
    except Exception as e:  # optional layer: API/network/parse failures must not break the policy check
        return {**meta, "status": "failed", "reason": f"{type(e).__name__}: {e}", "cache_key": key, "rules": {}}
    usage = getattr(response, "usage", None)
    result = {"model": model, "usage": usage.model_dump() if hasattr(usage, "model_dump") else None,
              "rules": answers}
    on_progress("received", f"Policy reviewer trả lời {len(answers)} rule", len(answers), len(rules),
                {k: (result["usage"] or {}).get(k) for k in ("prompt_tokens", "completion_tokens")})
    cache_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return {**meta, **result, "status": "live call", "cache_key": key}
