"""Value proposition: do the video's claims match the product listing? (one small LLM call, cached)

Inputs are `video.key_claims` (VLM) and the listing text (`sku.title`, plus `sku.description` when present).
The LLM labels each claim `supported | not_in_listing | contradicts`; the 0-100 match score is computed
here from those labels (VERDICT_SCORE), so the number is reproducible from the cached verdicts.

Cache: <cache_dir>/<video_stem>.claims.<sku_id>.json, reused only while claims and listing are unchanged.
Without a cache hit and without a client the feature stays MISSING: no API call happens implicitly.
"""

import json
import re
from pathlib import Path
from typing import Any, Callable

from core.schema import Feature, FeatureMap, SourceStatus
from sources.extractor import VISION_MODEL

CLAIMS_MODEL = VISION_MODEL
FEATURE = "video.claims_sku_match"
# Placeholder weights: an unlisted claim is neither proof nor a contradiction.
VERDICT_SCORE = {"supported": 100.0, "not_in_listing": 50.0, "contradicts": 0.0}
LISTING_KEYS = ("sku.title", "sku.description")

SYSTEM_PROMPT = """You compare marketing claims made in a short e-commerce video with the product listing text.
For EACH claim, in the given order, answer one verdict:
- "supported": the listing states or clearly implies it.
- "not_in_listing": the listing neither supports nor contradicts it.
- "contradicts": the listing states something incompatible with it.
Return STRICTLY JSON: {"claims": [{"claim": "string", "verdict": "supported | not_in_listing | contradicts",
"listing_evidence": "quote from the listing or empty string"}]}"""


def _usable(f: Feature | None) -> bool:
    return f is not None and f.status != SourceStatus.MISSING and bool(f.value)


def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", name)


def _read_cache(path: Path) -> dict | None:
    """Cached result, or None when absent/corrupt (a corrupt file is treated as no cache)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    required = {"inputs", "verdicts", "match_score", "model"}
    return data if isinstance(data, dict) and required <= data.keys() else None


def match_score(verdicts: list[dict]) -> float:
    return round(sum(VERDICT_SCORE[v["verdict"]] for v in verdicts) / len(verdicts), 1)


def parse_verdicts(content: str, claims: list[str]) -> list[dict]:
    """Validate the LLM JSON: one known verdict per claim, in order."""
    data = json.loads(content)
    rows = data.get("claims") if isinstance(data, dict) else None
    if not isinstance(rows, list) or len(rows) != len(claims):
        raise ValueError(f"expected {len(claims)} claim verdicts, got {rows!r:.200}")
    out = []
    for claim, row in zip(claims, rows):
        verdict = row.get("verdict") if isinstance(row, dict) else None
        if verdict not in VERDICT_SCORE:
            raise ValueError(f"invalid verdict {verdict!r} for claim {claim!r}")
        out.append({"claim": claim, "verdict": verdict, "listing_evidence": str(row.get("listing_evidence") or "")})
    return out


def check_claims(client: Any, claims: list[str], listing: str, model: str = CLAIMS_MODEL,
                 usage_out: dict | None = None) -> list[dict]:
    """One chat-completion call (OpenAI client or a stub with the same interface). `usage_out`, when given,
    receives the call's token usage."""
    user = "CLAIMS:\n" + "\n".join(f"{i + 1}. {c}" for i, c in enumerate(claims)) + f"\n\nLISTING:\n{listing}"
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
    )
    usage = getattr(response, "usage", None)
    if usage_out is not None and hasattr(usage, "model_dump"):
        usage_out.update(usage.model_dump())
    return parse_verdicts(response.choices[0].message.content, claims)


def claims_features(features: FeatureMap, video_stem: str, cache_dir: Path,
                    client: Any = None, model: str = CLAIMS_MODEL,
                    on_usage: Callable[[str, dict | None, str], None] | None = None) -> FeatureMap:
    """Return {FEATURE: Feature} as INFERRED from cache or one LLM call, else MISSING with the reason.
    `on_usage(source, usage, model)` is told where the verdicts came from ("cache" | "live call") and
    their token usage (None for caches written before usage was recorded)."""
    claims_f = features.get("video.key_claims")
    if not _usable(claims_f):
        return {FEATURE: Feature.missing("video.key_claims unavailable")}
    used = {"video.key_claims": claims_f}
    used.update({k: features[k] for k in LISTING_KEYS if _usable(features.get(k))})
    if "sku.title" not in used:
        return {FEATURE: Feature.missing("listing text (sku.title) unavailable")}

    claims = [str(c) for c in claims_f.value]
    listing = "\n".join(str(used[k].value) for k in LISTING_KEYS if k in used)
    sku_f = features.get("sku.sku_id")
    sku_id = str(sku_f.value) if _usable(sku_f) else "unknown_sku"
    inputs = {"claims": claims, "listing": listing}
    path = cache_dir / f"{_safe(video_stem)}.claims.{_safe(sku_id)}.json"

    cached = _read_cache(path)
    source = "cache"
    if not cached or cached.get("inputs") != inputs:
        if client is None:
            reason = "stale cache (claims or listing changed)" if cached else "no cached result"
            return {FEATURE: Feature.missing(f"claims vs listing check not run: {reason}; needs a live LLM call")}
        usage: dict = {}
        try:
            verdicts = check_claims(client, claims, listing, model, usage)
        except Exception as e:  # API/network/parse errors must not break the report; surface them as MISSING
            return {FEATURE: Feature.missing(f"claims vs listing check failed: {type(e).__name__}: {e}")}
        cached = {"video_stem": video_stem, "sku_id": sku_id, "model": model, "inputs": inputs,
                  "verdicts": verdicts, "match_score": match_score(verdicts), "usage": usage or None}
        cache_dir.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(cached, ensure_ascii=False, indent=2), encoding="utf-8")
        source = "live call"
    if on_usage:
        on_usage(source, cached.get("usage"), cached["model"])

    return {FEATURE: Feature(
        value=cached["match_score"],
        status=SourceStatus.INFERRED,
        source=f"llm_claims:{cached['model']}",
        evidence=[f"{v['verdict']}: {v['claim']}" for v in cached["verdicts"]],
        input_sources=list(used),
        mock_dependency=any(f.is_mock_based for f in used.values()),
    )}
