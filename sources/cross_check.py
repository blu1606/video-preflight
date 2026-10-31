"""Cross-check low Decisions answers with two independent paths, run side by side:

- rules: the v1 / shop rubric formulas that judge the same dimension from the same features (free);
- agent: an LLM auditor that sees the same evidence with human units (%, VND, ROAS x) and must justify
  its level, or say the evidence is insufficient (paid, opt-in, cached).

Disagreement does not change any score; it flags which judgement a human should look at.
"""

import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from core import rubric, shop_rubric
from core.schema import FeatureMap, Mode
from core.score_engine import score_criterion

DEMO = Path(__file__).resolve().parents[1]
CACHE_DIR = DEMO / "output" / "crosscheck"
LOW_SCORE = 40          # Decisions answers below this (0-100) get cross-checked
AGREE_WITHIN = 25       # points; larger gaps between sources are a conflict
AGENT_MODEL = "gpt-6-luna"

# Decisions question -> rule criteria judging the same dimension: (rubric set, criterion id)
RULES: dict[str, list[tuple[str, str]]] = {
    "V01": [("v1", "V1")], "V03": [("v1", "V2")], "V04": [("v1", "V3")], "V06": [("v1", "V4")],
    "V07": [("v1", "V6")],
    "C01": [("v1", "C1")], "C03": [("v1", "C2")], "C06": [("v1", "C4")], "C07": [("v1", "C5")],
    "C08": [("v1", "C6")], "C09": [("v1", "C3")], "C10": [("v1", "C7")],
    "S01": [("shop", "Q3")], "S02": [("v1", "S3"), ("v1", "S4")], "S03": [("v1", "S2")], "S04": [("shop", "Q4")],
    "H01": [("shop", "Q3"), ("shop", "Q4")], "H02": [("shop", "H1"), ("shop", "H2"), ("shop", "H3")],
    "H03": [("shop", "E1"), ("shop", "E2")], "H04": [("shop", "E3"), ("shop", "E4")],
    "H05": [("shop", "H4"), ("shop", "Q2")],
}
RUBRIC_SETS = {"v1": rubric.RUBRICS, "shop": shop_rubric.RUBRICS}
PCT_HINTS = ("_rate", "_ratio", "_share", "_cvr", "_ctr", "completeness", "ratio_avg")

AGENT_PROMPT = """You are an independent e-commerce auditor double-checking one automated rubric judgement.
Use ONLY the evidence given (each value has its unit and a status: REAL observed, MOCK synthetic test data,
INFERRED derived). Pick the rubric level that the evidence supports. If the evidence cannot support any level,
return "level": null instead of guessing. Answer in Vietnamese.
Return JSON: {"level": <int or null>, "rationale": "<2-3 sentences>", "key_evidence": ["<value you relied on>"]}"""


def _criterion(rubric_set: str, cid: str):
    return next(c for group in RUBRIC_SETS[rubric_set].values() for c in group if c.id == cid)


def rule_check(qid: str, features: FeatureMap, mode: Mode) -> dict:
    rows = []
    for rubric_set, cid in RULES.get(qid, []):
        r = score_criterion(_criterion(rubric_set, cid), features, mode)
        rows.append({"rubric": rubric_set, "id": r.id, "name": r.name, "score": r.score, "reason": r.reason,
                     "inputs": {n: features[n].value for n in r.inputs if n in features}})
    scored = [r["score"] for r in rows if r["score"] is not None]
    return {"criteria": rows, "score": round(sum(scored) / len(scored), 1) if scored else None}


def humanize(name: str, value):
    """Value with its unit, so a judge does not have to guess what 0.0129 means."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return value
    if name.endswith("_vnd"):
        return f"{value:,.0f} VND"
    if name.endswith("roas"):
        return f"{value:.2f}x (revenue per 1 VND of ads)"
    if any(h in name for h in PCT_HINTS) and abs(value) <= 1.5:
        return f"{value * 100:.1f}%"
    return value


def agent_evidence(question: dict, features: FeatureMap) -> dict:
    return {n: {"value": humanize(n, features[n].value), "status": features[n].status.value}
            for n in question["inputs"] if n in features and features[n].value is not None}


def agent_check(client, question: dict, evidence: dict, video_stem: str, cache_dir: Path = CACHE_DIR) -> dict:
    levels = question.get("levels") or []
    payload = {"question": question["instructions"], "levels": levels, "evidence": evidence}
    key = hashlib.sha1(json.dumps([AGENT_MODEL, payload], ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
    cache = cache_dir / f"{video_stem}.{question['id']}.{key}.json"
    if cache.exists():
        return {**json.loads(cache.read_text(encoding="utf-8")), "source": "cache"}
    if client is None:
        return {"status": "not_run", "reason": "agent cross-check not allowed (paid call)"}
    try:
        response = client.chat.completions.create(
            model=AGENT_MODEL,
            messages=[{"role": "system", "content": AGENT_PROMPT},
                      {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
            response_format={"type": "json_object"},
        )
        answer = json.loads(response.choices[0].message.content)
    except Exception as e:  # optional check: the report stays valid without it
        return {"status": "failed", "reason": str(e)}
    level = answer.get("level")
    top = len(levels) - 1
    usage = getattr(response, "usage", None)
    result = {
        "status": "ok", "model": AGENT_MODEL, "level": level,
        "label": levels[level]["label"] if isinstance(level, int) and 0 <= level <= top else None,
        "score": round(level / top * 100, 1) if isinstance(level, int) and top > 0 else None,
        "rationale": answer.get("rationale"), "key_evidence": answer.get("key_evidence", []),
        "evidence_sent": evidence,
        "usage": usage.model_dump() if hasattr(usage, "model_dump") else None,
    }
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return {**result, "source": "live call"}


def verdict(decision: float, others: list[float | None]) -> str:
    scored = [o for o in others if o is not None]
    if not scored:
        return "unverified"
    return "agree" if all(abs(decision - o) <= AGREE_WITHIN for o in scored) else "conflict"


def cross_check(features: FeatureMap, mode: Mode, questions: list[dict], video_stem: str,
                client=None, threshold: float = LOW_SCORE) -> list[dict]:
    """questions: decision_scorer.answer_details(...)["questions"]. Agents run in parallel threads."""
    low = [q for q in questions if q["type"] == "score" and q["status"] != "MISSING"
           and q["value"] is not None and q["value"] < threshold]
    rules = {q["id"]: rule_check(q["id"], features, mode) for q in low}
    with ThreadPoolExecutor(max_workers=8) as pool:
        agents = dict(zip([q["id"] for q in low], pool.map(
            lambda q: agent_check(client, q, agent_evidence(q, features), video_stem), low)))
    return [{
        "id": q["id"], "dimension": q["dimension"], "decision_score": q["value"],
        "rule": rules[q["id"]], "agent": agents[q["id"]],
        "verdict": verdict(q["value"], [rules[q["id"]]["score"], agents[q["id"]].get("score")]),
    } for q in low]
