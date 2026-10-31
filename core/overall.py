"""Overall video score: a weighted mean of the three pre-publish content groups, plus a separate policy gate.

    overall  = sum(W_g * score_g) / sum(W_g)       over groups that HAVE a score
    coverage = sum(W_g * coverage_g) / sum(W_g)    over all weighted groups (an unscored group adds 0)

Only GROUP_WEIGHTS count. shop_health is shop context (not part of the video score), and post-publish
performance is shown in its own group but never counted: a video not yet published has no such numbers.
Policy compliance is never averaged in: a risky claim must not be offset by strong conversion criteria.
It is a gate instead (`review` | `clear` | `unknown`) that never says "approved": a clear gate only means no
counted rule fired on the inputs we have. The gate never moves the score, but it caps the label: a high or
critical blocker turns it into `policy_review`, and any other blocker keeps it below `ready`. `score_label`
is the label the score alone would give.
Weights and thresholds are heuristic until calibrated on real outcomes; they are returned with the result.
"""

from dataclasses import asdict, is_dataclass

from core.schema import GroupScore

# Shares of the video score (sum 1). Renormalised over the groups that have a score when one is missing.
GROUP_WEIGHTS = {
    "viral_potential": 0.35,
    "conversion_potential": 0.45,
    "sku_market": 0.20,
}
GROUP_NAMES_VI = {
    "viral_potential": "Lan toả",
    "conversion_potential": "Chuyển đổi",
    "sku_market": "Sản phẩm & thị trường",
}
THRESHOLDS = {"ready": 75, "fix": 50}  # score >= ready -> ready; >= fix -> fix; else rework
LABELS_VI = {"ready": "Sẵn sàng đăng", "fix": "Sửa rồi đăng", "rework": "Làm lại",
             "policy_review": "Cần xem lại policy"}
SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
BLOCKING_SEVERITIES = ("critical", "high")  # a blocker at one of these sends the video back whatever its score
LOW_COVERAGE = 0.5


def as_dict(group: GroupScore | dict) -> dict:
    """Groups arrive as dataclasses (build_report) or as their JSON dicts (API results)."""
    return asdict(group) if is_dataclass(group) else group


def label_for(score: float) -> str:
    if score >= THRESHOLDS["ready"]:
        return "ready"
    return "fix" if score >= THRESHOLDS["fix"] else "rework"


def policy_gate(policy: dict | None) -> dict:
    """Counted needs_review findings on the selected targets become blockers for the publish step."""
    targets = (policy or {}).get("targets") or {}
    blockers = [
        {"rule_id": f["rule_id"], "target": target, "severity": f["severity"], "summary": f["summary"],
         "evidence": list(f.get("evidence") or []), "quotes": list(f.get("quotes") or [])}
        for target, t in targets.items() for f in t["findings"]
        if f["outcome"] == "needs_review" and f["counted"]
    ]
    blockers.sort(key=lambda b: (SEVERITY_RANK.get(b["severity"], len(SEVERITY_RANK)), b["rule_id"], b["target"]))
    if blockers:
        status = "review"
    elif not targets or all(t["verdict"] == "unknown" for t in targets.values()):
        status = "unknown"
    else:
        status = "clear"
    return {"status": status, "blockers": blockers}


def gated_label(score_label: str | None, gate: dict) -> str | None:
    """The score's label, capped by the policy gate (no score keeps no label)."""
    if score_label is None or gate["status"] != "review":
        return score_label
    if any(b["severity"] in BLOCKING_SEVERITIES for b in gate["blockers"]):
        return "policy_review"
    return "fix" if score_label == "ready" else score_label


def overall(scores: list[GroupScore | dict], policy: dict | None) -> dict:
    groups = {g["name"]: g for g in map(as_dict, scores) if g["name"] in GROUP_WEIGHTS}
    used = [n for n in GROUP_WEIGHTS if n in groups and groups[n]["score"] is not None]
    missing = [n for n in GROUP_WEIGHTS if n not in used]
    total_w = sum(GROUP_WEIGHTS.values())
    coverage = round(sum(GROUP_WEIGHTS[n] * groups[n]["coverage"] for n in used) / total_w, 2)

    score = label = None
    warnings = []
    if used:
        used_w = sum(GROUP_WEIGHTS[n] for n in used)
        score = round(sum(GROUP_WEIGHTS[n] * groups[n]["score"] for n in used) / used_w, 1)
        label = label_for(score)
    else:
        warnings.append("Chưa nhóm nào có điểm nên chưa có điểm tổng.")
    if used and missing:
        warnings.append(f"Thiếu nhóm {', '.join(GROUP_NAMES_VI[n] for n in missing)}: điểm tổng chỉ tính trên "
                        f"{', '.join(GROUP_NAMES_VI[n] for n in used)}.")
    if used and coverage < LOW_COVERAGE:
        warnings.append(f"Độ phủ dữ liệu thấp ({coverage:.0%}): điểm tổng mới mang tính tham khảo.")

    gate = policy_gate(policy)
    final = gated_label(label, gate)
    if final != label:
        warnings.append(f"Policy cần xem lại nên nhãn là \"{LABELS_VI[final]}\" dù điểm {score} "
                        f"ứng với \"{LABELS_VI[label]}\".")
    return {
        "score": score,
        "label": final,
        "label_vi": LABELS_VI.get(final),
        "score_label": label,
        "coverage": coverage,
        "groups_used": used,
        "missing_groups": missing,
        "warnings": warnings,
        "policy_gate": gate,
        "weights": dict(GROUP_WEIGHTS),
        "thresholds": dict(THRESHOLDS),
        "blocking_severities": list(BLOCKING_SEVERITIES),
    }
