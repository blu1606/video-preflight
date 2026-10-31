"""Conservative text triage. A match means review, never a platform violation."""
import json
import re
from pathlib import Path

SCOPES = {
    "tiktok_shop_video": ({"tiktok_shop", "tiktok"}, {"organic", "shop_video"}),
    "tiktok_ads": ({"tiktok"}, {"ads"}),
    "shopee_listing": ({"shopee"}, {"listing"}),
    "meta_ads": ({"meta", "facebook", "instagram"}, {"ads"}),
}
ABSOLUTE = re.compile(r"(?:hiệu quả|chữa khỏi|trắng da|giảm cân)\s*(?:đến\s*)?100\s*%|(?:cam kết|đảm bảo)\s+(?:chữa khỏi|khỏi bệnh)|trị\s+dứt\s+điểm", re.IGNORECASE)
DETECTORS = {
    "absolute_claim_detector": ABSOLUTE,
    "meta_claim_review": ABSOLUTE,
    "offplatform_contact_check": re.compile(r"(?:zalo\.me/|facebook\.com/|liên hệ\s+(?:zalo|facebook))", re.IGNORECASE),
    "meta_personal_attribute_check": re.compile(r"bạn\s+(?:đang\s+)?(?:bị|mắc)\s+[^.!?\n]{2,70}", re.IGNORECASE),
}


def quoted_finding(candidate, sources):
    """Source, exact quote and time must be server-owned; model time is ignored."""
    source = next((s for s in sources if s["id"] == candidate.get("source_id")), None)
    quote = candidate.get("quote")
    if not source or not isinstance(quote, str) or not quote.strip() or quote not in source["text"]:
        raise ValueError("Trích dẫn không khớp nguyên văn nguồn")
    return {"rule_id": candidate["rule_id"], "summary": candidate["summary"], "outcome": "needs_review",
            "evidence": [{"source_id": source["id"], "quote": quote, "kind": source["kind"],
                          "start_s": source.get("start_s"), "end_s": source.get("end_s")}],
            "origin": candidate.get("origin", "policy_reviewer")}


def merge_findings(deterministic, reviewer, allowed_rule_ids, sources):
    """A reviewer can add grounded findings, never retract rule findings."""
    result = {finding["rule_id"]: {**finding, "evidence": list(finding["evidence"])} for finding in deterministic}
    for candidate in reviewer:
        if candidate.get("rule_id") not in allowed_rule_ids:
            raise ValueError("Rule không có trong baseline áp dụng")
        validated = quoted_finding(candidate, sources)
        if validated["rule_id"] in result:
            for evidence in validated["evidence"]:
                if evidence not in result[validated["rule_id"]]["evidence"]:
                    result[validated["rule_id"]]["evidence"].append(evidence)
        else:
            result[validated["rule_id"]] = validated
    return list(result.values())


def evaluate(root, platforms, sources):
    path = Path(root) / "data/fixtures/policy_baseline_v01/rules.json"
    if not path.is_file():
        return {"status": "not_configured", "targets": {p: {"verdict": "unknown", "label": "chưa đủ dữ liệu", "findings": [], "checks": [], "reason": "Chưa có baseline Policy"} for p in platforms}}
    rules = json.loads(path.read_text())["rules"]
    targets = {}
    for platform in platforms:
        names, scopes = SCOPES[platform]
        applicable = [r for r in rules if names.intersection(r["platforms"]) and scopes.intersection(r["applies_to"])]
        findings, checks = [], []
        for rule in applicable:
            detector = DETECTORS.get(rule["check_type"])
            matches = []
            if detector:
                for source in sources:
                    for match in detector.finditer(source["text"]):
                        candidate = {"rule_id": rule["rule_id"], "summary": "Cách diễn đạt cần đối chiếu thêm với bằng chứng và quy định nền tảng.",
                                     "source_id": source["id"], "quote": match.group(), "origin": "deterministic_text_triage"}
                        matches.append(quoted_finding(candidate, sources))
            if matches:
                finding = {**matches[0], "evidence": [e for m in matches for e in m["evidence"]],
                           "source_url": rule["source_url"], "severity": rule["severity"], "source_status": "imported_not_reverified"}
                findings.append(finding)
            checks.append({"rule_id": rule["rule_id"], "source_url": rule["source_url"],
                           "status": "needs_review" if matches else "unknown",
                           "reason": "Regex triage, cần người kiểm tra" if matches else "Chưa đủ dữ liệu hoặc nguồn hiện hành chưa được xác minh lại"})
        targets[platform] = {"verdict": "needs_review" if findings else "unknown",
                             "label": "cần xem lại" if findings else "chưa đủ dữ liệu", "findings": findings, "checks": checks,
                             "reason": "Baseline nhập có nguồn; chưa xác minh lại từng link. Không kết luận chấp thuận hay vi phạm."}
    return {"status": "partial", "targets": targets, "baseline_rules": len(rules), "source": "imported_baseline_v01",
            "note": "Bộ dò từ khóa mới là heuristic sơ bộ, chưa hiệu chỉnh; không thay cho thực thi chính sách nền tảng."}
