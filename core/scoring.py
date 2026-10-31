"""Pure aggregation contract. No LLM or guessed ratings in this module."""
import math

GROUPS = {"viral": ("Viral", .35), "conversion": ("Conversion", .45), "sku": ("SKU & thị trường", .20)}
CALIBRATION = {
    "id": "readiness-display-v0", "status": "provisional",
    "label": "mốc tạm tự đặt", "minimum_coverage": .70, "minimum_group_coverage": .50,
    "source": "Quy tắc hiển thị được đặt mới trong bản nền; chưa hiệu chỉnh trên dữ liệu thực.",
}


def finite_number(value, low=0, high=100):
    return type(value) in (int, float) and math.isfinite(value) and low <= value <= high


def expected_score(probabilities):
    """Five levels, each with its explicit value; zero is a valid measured score."""
    if len(probabilities) != 5:
        raise ValueError("Expected five rubric levels")
    if any(not finite_number(p.get("probability"), 0, 1) or not finite_number(p.get("value")) for p in probabilities):
        raise ValueError("Invalid probability or level value")
    if not math.isclose(sum(p["probability"] for p in probabilities), 1, abs_tol=.001):
        raise ValueError("Probabilities must sum to one")
    if [p["value"] for p in probabilities] != [0, 25, 50, 75, 100]:
        raise ValueError("Five ordinal levels must be 0,25,50,75,100")
    return round(sum(p["probability"] * p["value"] for p in probabilities), 2)


def aggregate(criteria, features):
    """Criteria must come from a versioned rubric, never from UI or post outcomes."""
    ids = [c["id"] for c in criteria]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate criterion IDs")
    groups = []
    for group, (name, weight) in GROUPS.items():
        rows = []
        for criterion in criteria:
            if criterion["group"] not in GROUPS:
                raise ValueError("Unknown score group")
            if criterion["group"] != group:
                continue
            if not finite_number(criterion["weight"], .000001, 100):
                raise ValueError("Invalid criterion weight")
            inputs = criterion.get("inputs", [])
            grounded = bool(inputs) and all(
                features.get(key, {}).get("status") in ("REAL", "INFERRED")
                and features[key].get("evidence")
                and features[key].get("value") is not None
                and not key.startswith(("performance.", "shop.")) for key in inputs)
            valid = criterion.get("status") == "scored" and finite_number(criterion.get("score")) and grounded
            rows.append({**criterion, "score": criterion["score"] if valid else None,
                         "status": "scored" if valid else "not_scored"})
        total = sum(r["weight"] for r in rows)
        rated = [r for r in rows if r["score"] is not None]
        rated_weight = sum(r["weight"] for r in rated)
        groups.append({"id": group, "name": name, "weight": weight, "criteria": rows,
                       "coverage": rated_weight / total if total else 0,
                       "score": round(sum(r["score"] * r["weight"] for r in rated) / rated_weight, 1) if rated_weight else None})
    coverage = sum(g["weight"] * g["coverage"] for g in groups)
    sufficient = coverage >= CALIBRATION["minimum_coverage"] and all(
        g["coverage"] >= CALIBRATION["minimum_group_coverage"] and g["score"] is not None for g in groups)
    return {"groups": groups, "overall": round(sum(g["weight"] * g["score"] for g in groups), 1) if sufficient else None,
            "coverage": round(coverage, 4), "status": "scored" if sufficient else "not_scored", "calibration": CALIBRATION}
