"""Fix engine: turns a finished report into at most MAX_FIXES concrete actions, by rules (no LLM).

Candidates come from three places:
- policy: counted needs_review findings on the selected targets (blockers for the publish step);
- criterion: scored criteria below WEAK_SCORE in a weighted overall group;
- data: quality-gate flags that a seller or operator can resolve (missing listing, Decisions not run...).

Ranking: policy blockers first (most severe first), then by the expected overall gain if the criterion
reached TARGET_SCORE:

    gain = W_group * (w_c / sum(w scored in group)) * (target - current) / sum(W of scored groups)

This is exact arithmetic on the current scoring formula, not a sales forecast. Data fixes go before
criterion fixes when overall coverage is low (the score itself is not reliable yet), after them otherwise.

Locations: real timestamps from evidence ("MM:SS ..." strings, finding quotes, feature windows) when they
exist; for a missing element (CTA, offer, demo) a `suggested_at` that is only a suggestion; else none
(the whole video). Action texts are Vietnamese templates in fixtures/fix_templates_v1.json; the creative
format answered by Decisions (M02) picks a variant when the template has one. A policy finding whose quote
comes from the seller's caption or hashtags uses the template's `caption` texts (fix the caption, no time).
"""

import json
import re
from functools import lru_cache
from pathlib import Path
from string import Formatter

from core.overall import GROUP_NAMES_VI, GROUP_WEIGHTS, LOW_COVERAGE, SEVERITY_RANK, as_dict
from core.schema import FeatureMap, GroupScore, SourceStatus

TEMPLATES_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "fix_templates_v1.json"
MAX_FIXES = 5
MIN_OTHER_SLOTS = 2  # slots kept for criterion/data fixes when policy blockers alone could fill the list
WEAK_SCORE = 50
TARGET_SCORE = 75  # level 3 "Good" of a 0-4 Decisions scale (3/4 * 100)
GAIN_NOTE = "Ước tính theo công thức điểm hiện tại, không phải dự báo doanh số."
SUGGESTION_NOTE = "gợi ý vị trí"
CTA_TAIL_SEC = 3
OFFER_LEAD_SEC = 5
SEVERITY_VI = {"critical": "nghiêm trọng", "high": "cao", "medium": "trung bình", "low": "thấp"}
TARGET_VI = {"tiktok_shop_video": "TikTok Shop", "tiktok_ads": "quảng cáo TikTok",
             "shopee_listing": "Shopee", "meta_ads": "quảng cáo Facebook/Instagram"}

TIMESTAMP = re.compile(r"^(\d{2}):(\d{2})\b")
WINDOW = re.compile(r"(\d{2}):(\d{2})(?:-(\d{2}):(\d{2}))?")
QUOTE = re.compile(r"«(.+?)»")


@lru_cache(maxsize=1)
def load_templates() -> dict:
    return json.loads(TEMPLATES_PATH.read_text(encoding="utf-8"))


def mmss(sec: float) -> str:
    return f"{int(sec // 60):02d}:{int(sec % 60):02d}"


def _value(features: FeatureMap, name: str):
    f = features.get(name)
    return None if f is None or f.status == SourceStatus.MISSING else f.value


def _fill(template: dict, key: str, values: dict) -> str:
    """template[key] with its placeholders filled; the `<key>_no_quote` text when a placeholder has no value."""
    text = template[key]
    needed = {name for _, name, _, _ in Formatter().parse(text) if name}
    if any(values.get(n) in (None, "") for n in needed):
        text = template.get(f"{key}_no_quote", text)
        needed = {name for _, name, _, _ in Formatter().parse(text) if name}
    return text.format(**{n: values.get(n) or "" for n in needed})


# ---------- locations ----------

def _point(sec: float, text: str | None = None) -> dict:
    return {"start": sec, "end": None, "label": mmss(sec), "text": text}


def _window(features: FeatureMap, name: str) -> dict | None:
    """First 'MM:SS-MM:SS' (or 'MM:SS') window in a feature's evidence."""
    f = features.get(name)
    for ev in (f.evidence if f else []):
        m = WINDOW.search(ev)
        if m:
            start = int(m[1]) * 60 + int(m[2])
            end = int(m[3]) * 60 + int(m[4]) if m[3] else None
            return {"start": start, "end": end, "label": f"{mmss(start)}–{mmss(end)}" if end else mmss(start),
                    "text": None}
    return None


def _suggest(start: float | None, end: float | None, label: str) -> dict:
    return {"start": None if start is None else round(max(0.0, start), 1),
            "end": None if end is None else round(end, 1), "label": label, "note": SUGGESTION_NOTE}


def _cta_start(features: FeatureMap) -> float | None:
    if _value(features, "video.has_cta"):
        w = _window(features, "video.has_cta")
        return w["start"] if w else None
    return None


def locate(anchor: str | None, features: FeatureMap) -> tuple[list[dict], dict | None]:
    """(real timestamps, suggested_at) for a template anchor."""
    duration = _value(features, "video.duration_sec")
    if anchor == "opening":
        return [_window(features, "video.hook_verbal") or {"start": 0, "end": 3, "label": "00:00–00:03",
                                                          "text": None}], None
    if anchor == "product_first_seen":
        sec = (_value(features, "video.product_visibility") or {}).get("first_clear_sec")
        return ([_point(sec)], None) if isinstance(sec, (int, float)) else ([], None)
    if anchor == "demo":
        if _value(features, "video.demo_present"):
            w = _window(features, "video.demo_present")
            return ([w] if w else []), None
        if _value(features, "video.demo_present") is False:
            return [], _suggest(3, min(duration, 10) if duration else None, "ngay sau phần mở đầu")
        return [], None
    if anchor == "cta":
        if _value(features, "video.has_cta"):
            w = _window(features, "video.has_cta")
            return ([w] if w else []), None
        if _value(features, "video.has_cta") is False:
            return [], _suggest(duration - CTA_TAIL_SEC if duration else None, duration, f"{CTA_TAIL_SEC} giây cuối")
        return [], None
    if anchor == "offer":
        offer = _value(features, "video.offer")
        if isinstance(offer, dict) and offer.get("present") and isinstance(offer.get("timestamp_sec"), (int, float)):
            return [_point(offer["timestamp_sec"], offer.get("description") or None)], None
        if isinstance(offer, dict) and not offer.get("present"):
            cta = _cta_start(features)
            end = cta if cta is not None else (duration - CTA_TAIL_SEC if duration else None)
            return [], _suggest(None if end is None else end - OFFER_LEAD_SEC, end, "ngay trước lời kêu gọi mua")
        return [], None
    return [], None


# ---------- candidates ----------

def _quotes(finding: dict) -> list[dict]:
    """Quotes with their time: the finding's own `quotes` first, then «...» in 'MM:SS ...' evidence."""
    out = [{"text": q["text"], "t": q.get("t")} for q in finding.get("quotes") or [] if q.get("text")]
    for ev in finding.get("evidence") or []:
        m, ts = QUOTE.search(ev), TIMESTAMP.match(ev)
        t = int(ts[1]) * 60 + int(ts[2]) if ts else None
        if m:
            out.append({"text": m[1].strip("… "), "t": t})
        elif t is not None:
            out.append({"text": None, "t": t, "evidence": ev[ts.end():].strip()})
    # The same line is often both in `quotes` (precise time) and in evidence (rounded): keep the first.
    return _unique(out)


def _unique(quotes: list[dict]) -> list[dict]:
    """First occurrence of each quoted text (or of each time, for evidence without a quote)."""
    seen, out = set(), []
    for q in quotes:
        key = q["text"] or ("t", q["t"])
        if key not in seen:
            seen.add(key)
            out.append(q)
    return out


def _fold(text: str) -> str:
    return re.sub(r"\s+", " ", text).casefold().strip()


def post_copy_text(features: FeatureMap | None) -> str:
    """Caption and hashtags as one searchable string ("" when the seller wrote none)."""
    if not features:
        return ""
    caption = _value(features, "post.caption")
    tags = _value(features, "post.hashtags") or []
    return " ".join([caption if isinstance(caption, str) else "", *(f"#{t}" for t in tags if isinstance(t, str))])


def policy_fixes(policy: dict | None, copy_text: str = "") -> list[dict]:
    """`copy_text` (post_copy_text) tells which quotes come from the caption / hashtags."""
    templates = load_templates()
    merged: dict[str, dict] = {}
    for target, t in ((policy or {}).get("targets") or {}).items():
        for f in t["findings"]:
            if f["outcome"] != "needs_review" or not f["counted"]:
                continue
            key = templates["rules"].get(f["rule_id"], {}).get("merge", f["rule_id"])
            group = merged.setdefault(key, {"findings": [], "targets": []})
            group["findings"].append(f)
            if target not in group["targets"]:
                group["targets"].append(target)
    fixes = []
    for key, group in merged.items():
        findings = sorted(group["findings"], key=lambda f: (SEVERITY_RANK.get(f["severity"], 9), f["rule_id"]))
        primary = findings[0]
        template = templates["rules"].get(primary["rule_id"], templates["generic"]["policy"])
        quotes = _unique([q for f in findings for q in _quotes(f)])  # merged rules often quote the same line
        quoted = next((q for q in quotes if q["text"]), None)
        timed = sorted((q for q in quotes if q["t"] is not None), key=lambda q: q["t"])
        # A quoted line keeps its own time (or none), so a sentence is never paired with another moment.
        at = quoted["t"] if quoted else (timed[0]["t"] if timed else None)
        in_caption = bool(quoted and copy_text and quoted["t"] is None
                          and _fold(quoted["text"]) in _fold(copy_text))
        if in_caption:  # same rule and reason, but the action is on the caption, not a moment of the video
            template = {**template, **template.get("caption", templates["generic"]["policy_caption"])}
        values = {"rule_id": primary["rule_id"], "quote": quoted and quoted["text"],
                  "at": None if at is None else mmss(at)}
        rule_ids = list(dict.fromkeys(f["rule_id"] for f in findings))
        where = ", ".join(TARGET_VI.get(t, t) for t in group["targets"])
        fixes.append({
            "id": f"policy:{key}", "kind": "policy", "ref": primary["rule_id"], "severity": primary["severity"],
            "title": _fill(template, "title", values), "action": _fill(template, "action", values),
            "why": f"{template['why']} Mức độ {SEVERITY_VI.get(primary['severity'], primary['severity'])}; "
                   f"nơi đăng: {where}.",
            "current": None, "target": None, "target_desc": None, "expected_gain": None,
            "timestamps": [_point(q["t"], q["text"] or q.get("evidence")) for q in timed],
            "suggested_at": None, "in_caption": in_caption,
            "refs": rule_ids + list(dict.fromkeys(f["source_url"] for f in findings if f.get("source_url"))),
        })
    return sorted(fixes, key=lambda x: (SEVERITY_RANK.get(x["severity"], 9), x["ref"]))


def criterion_fixes(scores: list[GroupScore | dict], features: FeatureMap, creative_format: str | None) -> list[dict]:
    templates = load_templates()
    groups = [g for g in map(as_dict, scores) if g["name"] in GROUP_WEIGHTS and g["score"] is not None]
    used_w = sum(GROUP_WEIGHTS[g["name"]] for g in groups)
    fixes = []
    for g in groups:
        scored_w = sum(c["weight"] for c in g["criteria"] if c["score"] is not None)
        for c in g["criteria"]:
            if c["score"] is None or c["score"] >= WEAK_SCORE:
                continue
            gain = GROUP_WEIGHTS[g["name"]] * (c["weight"] / scored_w) * (TARGET_SCORE - c["score"]) / used_w
            template = templates["criteria"].get(c["id"])
            if template is None:
                template = {**templates["generic"]["criterion"]}
            timestamps, suggested = locate(template.get("anchor"), features)
            at = timestamps[0]["label"] if timestamps else None
            values = {"name": c["name"], "at": at, "target_desc": _fill(template, "target_desc", {"name": c["name"]})}
            action_key = "action"
            variant = (template.get("variants") or {}).get(creative_format or "")
            if variant:
                template, action_key = {**template, "variant_action": variant}, "variant_action"
            fixes.append({
                "id": f"criterion:{c['id']}", "kind": "criterion", "ref": c["id"],
                "title": _fill(template, "title", values), "action": _fill(template, action_key, values),
                "why": f"{_fill(template, 'why', values)} Nhóm {GROUP_NAMES_VI[g['name']]}: đang {c['score']:g}/100.",
                "current": c["score"], "target": TARGET_SCORE, "target_desc": values["target_desc"],
                "expected_gain": round(gain, 2), "gain_note": GAIN_NOTE,
                "timestamps": timestamps, "suggested_at": suggested, "in_caption": False,
                "refs": [c["id"], *c.get("inputs", [])],
                "_gain": gain,
            })
    fixes.sort(key=lambda x: (-x["_gain"], x["ref"]))
    for f in fixes:
        del f["_gain"]
    return fixes


def data_fixes(gate: dict | None) -> list[dict]:
    templates = load_templates()["data"]
    fixes, seen = [], set()
    for flag in (gate or {}).get("flags", []):
        code = flag["code"]
        if code not in templates or code in seen:
            continue  # informational flags (low coverage, mock data) are not seller actions
        seen.add(code)
        t = templates[code]
        fixes.append({
            "id": f"data:{code}", "kind": "data", "ref": code, "title": t["title"], "action": t["action"],
            "why": t["why"], "current": None, "target": None, "target_desc": None, "expected_gain": None,
            "timestamps": [], "suggested_at": None, "in_caption": False, "refs": [flag["detail"]],
        })
    return fixes


def plan_fixes(scores: list[GroupScore | dict], policy: dict | None, features: FeatureMap, gate: dict | None,
               overall: dict) -> list[dict]:
    creative_format = _value(features, "decision.M02")
    criteria = criterion_fixes(scores, features, creative_format)
    data = data_fixes(gate)
    rest = data + criteria if overall["coverage"] < LOW_COVERAGE else criteria + data
    # Blockers lead, but never crowd out every content fix: a seller must also learn what to improve.
    policy_slots = MAX_FIXES - min(len(rest), MIN_OTHER_SLOTS)
    return (policy_fixes(policy, post_copy_text(features))[:policy_slots] + rest)[:MAX_FIXES]
