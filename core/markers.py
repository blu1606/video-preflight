"""Timeline markers for the result page: where in the video each finding sits.

Built only from what the run already recorded (policy findings, low criteria and the features behind them,
storytelling beats, shot cuts). A criterion sits at the moment its features measured. When they only carry a
structural window (the opening, a demo that is absent) the marker covers that range; with no timing at all it covers
the whole video, and only when a visual check can locate it. Speech-only issues carry the transcript line they are
about instead of a box. Ghost markers mark something the video lacks (no CTA, no offer) at a suggested spot and say so.
"""

import re

LOW_SCORE = 50
TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})")
WINDOW_RE = re.compile(r"^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})")
SPOKEN_RE = re.compile(r"^\d{1,2}:\d{2}\s+spoken\b")
SEVERITY = {"critical": "high", "high": "high", "medium": "medium", "low": "low"}
LANE = {"viral_potential": "viral", "conversion_potential": "conversion", "sku_market": "conversion",
        "policy_compliance": "policy"}
# Whole-video structure, not the moment of a finding: never used to place a criterion marker.
STRUCTURE_FEATURES = {"video.storytelling", "video.pacing_cut_timestamps"}
# Read off the picture (on-screen text, product, demo, overlays, before/after, AI media). An issue behind one of
# them can be boxed on a frame; a spoken claim cannot.
VISUAL_FEATURES = frozenset({
    "video.on_screen_text", "video.product_visibility", "video.product_first_clear_sec", "video.demo_present",
    "video.clarity_score", "video.before_after_shown", "video.policy_ui_overlays", "video.policy_before_after",
    "video.policy_realistic_ai_media",
})
CTA_WINDOW_S = 3.0  # a missing CTA belongs in the last seconds
OFFER_WINDOW_S = 6.0  # a missing offer is suggested just before that


def parse_time(text: str) -> float | None:
    m = TIME_RE.match(text.strip()) if isinstance(text, str) else None
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def _mmss(sec: float) -> str:
    return f"{int(sec) // 60:02d}:{int(sec) % 60:02d}"


def feature_times(feature: dict | None) -> list[float]:
    """Moments a feature points at: "MM:SS" evidence lines and `timestamp_sec` in its value.

    Structural evidence (a window the extractor did not observe) is no moment and gives none.
    """
    if not feature or feature.get("structural"):
        return []
    times = [t for t in map(parse_time, feature.get("evidence") or []) if t is not None]
    value = feature.get("value")
    items = value if isinstance(value, list) else [value] if isinstance(value, dict) else []
    for item in items:
        if isinstance(item, dict) and isinstance(item.get("timestamp_sec"), (int, float)) \
                and item.get("present", True) is not False:
            times.append(float(item["timestamp_sec"]))
    return sorted(set(times))


def feature_window(feature: dict | None) -> tuple[float, float] | None:
    """The structural window ("MM:SS-MM:SS" evidence) of a feature; None when measured or the window is empty."""
    if not feature or not feature.get("structural"):
        return None
    for line in feature.get("evidence") or []:
        m = WINDOW_RE.match(line.strip()) if isinstance(line, str) else None
        if m:
            start = int(m[1]) * 60 + int(m[2])
            end = int(m[3]) * 60 + int(m[4])
            return (float(start), float(end)) if end > start else None
    return None


def _criterion_inputs(criterion: dict, questions: dict) -> list[str]:
    """Feature names behind a criterion; a v2 criterion reads them from its Decisions question."""
    names = []
    for name in criterion.get("inputs") or []:
        if name.startswith("decision.") and name[9:] in questions:
            names.extend(questions[name[9:]].get("inputs") or [])
        else:
            names.append(name)
    return names


def likeliest_level(question: dict | None) -> str | None:
    """'<label>: <description>' of the level the Decisions answer gave the most probability."""
    probs = ((question or {}).get("answer") or {}).get("probabilities") or []
    if not probs or not question.get("levels"):
        return None
    best = max(probs, key=lambda p: p["probability"])
    level = next((lv for lv in question["levels"] if lv["label"] == best["label"]), None)
    return f"{best['label']}: {level['description']}" if level else best["label"]


def _marker(**fields) -> dict:
    """The keys every marker carries; a builder sets what it knows. `precise`: t_start is a measured moment."""
    return {"t_end": None, "precise": True, "localizable": False, "time_label": None, "quote": None,
            "evidence": [], **fields}


def _visual_line(line: str) -> bool:
    """An evidence line with a time that is not spoken: something seen or read, which a frame can show."""
    return parse_time(line) is not None and not SPOKEN_RE.match(line)


def _quote(features: dict, start: float, end: float | None = None) -> dict | None:
    """The transcript line heard in the marker's span (or at its moment): the speech an issue is about."""
    segments = (features.get("video.transcript_segments") or {}).get("value")
    if not isinstance(segments, list):
        return None
    lo, hi = start, end if end and end > start else start + 1.0
    for s in segments:
        if isinstance(s, dict) and str(s.get("text") or "").strip() and s.get("start", 0) < hi and s.get("end", 0) > lo:
            return {"t": s["start"], "text": str(s["text"]).strip()}
    return None


def _window_label(start: float, end: float) -> str:
    span = f"{start:g}–{end:g}s"
    return f"Cả đoạn mở đầu {span}" if start == 0 else f"Khoảng {span}"


def _policy_markers(result: dict) -> list[dict]:
    """One marker per rule, target and second; several evidence lines at that second share it."""
    by_id: dict[str, dict] = {}
    for target, verdict in (result.get("policy") or {}).get("targets", {}).items():
        for f in verdict.get("findings", []):
            if f.get("outcome") != "needs_review":
                continue
            for line in f.get("evidence") or []:
                t = parse_time(line)
                if t is None:
                    continue
                mid = f"policy:{target}:{f['rule_id']}:{t:g}"
                if mid in by_id:
                    by_id[mid]["evidence"].append(line)
                    continue
                by_id[mid] = _marker(
                    id=mid, t_start=t, lane="policy",
                    severity=SEVERITY.get(f.get("severity"), "medium"), kind="issue",
                    title=f"Policy {f['rule_id']} · cần xem lại",
                    comment=f"{f.get('summary', '')} ({target})".strip(),
                    source={"type": "policy", "ref": f["rule_id"], "target": target},
                    evidence=[line],
                )
    return [{**m, "localizable": any(_visual_line(line) for line in m["evidence"])} for m in by_id.values()]


def _criterion_markers(result: dict) -> list[dict]:
    features = result.get("features") or {}
    questions = {q["id"]: q for q in (result.get("decisions") or {}).get("questions", [])}
    duration = (features.get("video.duration_sec") or {}).get("value")
    out = []
    for group in result.get("scores", []):
        lane = LANE.get(group["name"])
        if not lane:
            continue  # shop_health describes the shop, not a moment in the video
        for c in group["criteria"]:
            if c.get("score") is None or c["score"] >= LOW_SCORE:
                continue
            names = [n for n in _criterion_inputs(c, questions) if n not in STRUCTURE_FEATURES]
            visual = any(n in VISUAL_FEATURES for n in names)
            times = sorted({t for n in names for t in feature_times(features.get(n))})
            window = next((w for w in (feature_window(features.get(n)) for n in names) if w), None)
            if times:
                start, end, label, evidence = times[0], None, None, [_mmss(t) for t in times]
            elif window:
                start, end = window
                label, evidence = _window_label(start, end), [f"{_mmss(start)}-{_mmss(end)}"]
            elif visual and duration:
                start, end, label = 0.0, float(duration), "Toàn video"
                evidence = []
            else:
                continue
            level = likeliest_level(questions.get(c["id"]))
            out.append(_marker(
                id=f"criterion:{c['id']}", t_start=start, t_end=end, precise=bool(times), localizable=visual,
                time_label=label, quote=None if visual else _quote(features, start, end),
                lane=lane, severity="high" if c["score"] < LOW_SCORE / 2 else "medium", kind="issue",
                title=f"Cần cải thiện: {c['name']} ({c['id']}) · {round(c['score'])}/100",
                comment=level or c.get("reason") or "Điểm thấp ở tiêu chí này.",
                source={"type": "criterion", "ref": c["id"], "group": group["name"]}, evidence=evidence,
            ))
    return out


def _ghost_markers(result: dict, duration: float | None) -> list[dict]:
    if not duration:
        return []
    features = result.get("features") or {}
    out = []
    if (features.get("video.has_cta") or {}).get("value") is False:
        out.append(_marker(
            id="ghost:cta", t_start=max(0.0, duration - CTA_WINDOW_S), t_end=duration, precise=False,
            lane="conversion", severity="medium", kind="ghost", title="Gợi ý vị trí: thêm CTA",
            comment="Video không có CTA. Gợi ý đặt lời kêu gọi mua (bấm giỏ hàng, link sản phẩm) ở vài giây cuối.",
            source={"type": "feature", "ref": "video.has_cta"},
        ))
    offer = (features.get("video.offer") or {}).get("value")
    if isinstance(offer, dict) and offer.get("present") is False:
        out.append(_marker(
            id="ghost:offer", t_start=max(0.0, duration - OFFER_WINDOW_S),
            t_end=max(0.0, duration - CTA_WINDOW_S), precise=False, lane="conversion", severity="low",
            kind="ghost", title="Gợi ý vị trí: nêu ưu đãi",
            comment="Video không nêu ưu đãi. Gợi ý nói giá hoặc ưu đãi (kèm điều kiện) ngay trước CTA.",
            source={"type": "feature", "ref": "video.offer"},
        ))
    return out


def _structure_markers(result: dict, duration: float | None) -> list[dict]:
    features = result.get("features") or {}
    beats = []
    for line in (features.get("video.storytelling") or {}).get("evidence") or []:
        t = parse_time(line)
        if t is not None:
            label, _, text = line.strip()[5:].strip().partition(":")
            beats.append((t, label.strip(), text.strip()))
    beats.sort()
    out = []
    for i, (t, label, text) in enumerate(beats):
        end = beats[i + 1][0] if i + 1 < len(beats) else duration
        out.append(_marker(id=f"beat:{i}:{label}", t_start=t, t_end=end, lane="structure", severity="info",
                           kind="beat", title=label, comment=text,
                           source={"type": "feature", "ref": "video.storytelling"}, evidence=[line]))
    for t in (features.get("video.pacing_cut_timestamps") or {}).get("value") or []:
        out.append(_marker(id=f"cut:{t:g}", t_start=float(t), lane="structure", severity="info", kind="cut",
                           title="Cắt cảnh", source={"type": "feature", "ref": "video.pacing_cut_timestamps"}))
    return out


def build_markers(result: dict) -> list[dict]:
    """All markers of a run, ordered by time (issues before structure at the same second)."""
    duration = (result.get("features") or {}).get("video.duration_sec", {}).get("value")
    markers = (_policy_markers(result) + _criterion_markers(result) + _ghost_markers(result, duration)
               + _structure_markers(result, duration))
    return sorted(markers, key=lambda m: (m["t_start"], m["kind"] in ("beat", "cut")))
