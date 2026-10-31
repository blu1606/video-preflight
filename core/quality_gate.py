"""Quality gate: deterministic checks on a finished report, and the next step each one suggests.

No LLM decides here. Flags say what limits the report (coverage, mock data, stale extraction, Decisions
not run or failed, sources that disagree); `next_step` names the action, and paid ones say so.

The hook check compares the VLM's own hook strength with Decisions V01. The VLM number is not scored any
more, but it is a second, independent read of the same opening seconds, so a large gap still tells a human
where to look.
"""

from core.schema import FeatureMap, GroupScore, SourceStatus

LOW_COVERAGE = 0.5
HOOK_DISAGREEMENT = 40  # points on 0-100 between the VLM hook strength and the Decisions V01 score
LISTING_DOUBT = ("mismatch", "unknown")  # Decisions M01 answers that make SKU scores unreliable
# Decisions M03 bottleneck -> core.shop_diagnosis finding areas that mean the same thing.
M03_AREAS = {
    "traffic": {"traffic"}, "conversion": {"conversion"}, "stock": {"inventory"}, "trust": {"returns_trust"},
    "operations": {"operations"}, "economics": {"profitability", "ads_efficiency"},
}


def _missing_with(features: FeatureMap, prefix: str, text: str) -> list[str]:
    return sorted(k for k, f in features.items() if k.startswith(prefix) and f.status == SourceStatus.MISSING
                  and any(text in e for e in f.evidence))


def _value(features: FeatureMap, name: str):
    f = features.get(name)
    return f.value if f is not None and f.status != SourceStatus.MISSING else None


def diagnosis_agreement(m03: str | None, diagnosis: dict | None) -> str:
    """agree | conflict | unverified: Decisions M03 against the rule-based shop diagnosis."""
    if not m03 or m03 == "unknown" or not diagnosis or diagnosis.get("confidence") != "high":
        return "unverified"
    if diagnosis.get("primary_issue") == "growth":  # nothing breached: M03 has no "none" choice to agree with
        return "unverified"
    breached = [f["area"] for f in diagnosis.get("findings", []) if f.get("severity", 0) >= 1]
    if m03 == "mixed":
        return "agree" if len(breached) >= 2 else "conflict"
    return "agree" if diagnosis.get("primary_issue") in M03_AREAS.get(m03, set()) else "conflict"


def quality_gate(features: FeatureMap, scores: list[GroupScore], shop_diagnosis: dict | None = None) -> dict:
    """shop_diagnosis: core.shop_diagnosis.diagnose_shop(...) output, when the report has a shop."""
    flags = []

    def flag(code, detail, next_step):
        flags.append({"code": code, "detail": detail, "next_step": next_step})

    for g in scores:
        if g.coverage < LOW_COVERAGE:
            missing = [c.id for c in g.criteria if not c.scored]
            flag("low_coverage", f"{g.name}: coverage {g.coverage:.0%}, not scored: {', '.join(missing)}",
                 "add the missing inputs listed in each criterion's reason")

    stale = _missing_with(features, "video.", "re-extract")
    if stale:
        flag("stale_extraction", f"cached extraction predates the current prompt: {', '.join(stale)}",
             "re-extract the video with the current prompt (paid VLM call)")
    not_run = _missing_with(features, "decision.", "not allowed")
    if not_run:
        flag("decisions_not_run", f"{len(not_run)} eligible questions have no cached answer",
             "score with decisions enabled (paid Decisions call)")
    failed = _missing_with(features, "decision.", "call failed")
    if failed:
        flag("decisions_failed", f"Decisions call failed for {len(failed)} questions; v1 formulas still apply",
             "retry later")
    if _value(features, "listing.title") is None and _value(features, "sku.title") is None:
        flag("no_listing", "no product listing, so SKU questions are not eligible", "add the product listing")

    hook, v01 = _value(features, "video.hook_strength"), _value(features, "decision.V01")
    if hook is not None and v01 is not None and abs(hook * 10 - v01) >= HOOK_DISAGREEMENT:
        flag("conflict", f"hook: VLM {hook * 10:.0f} vs Decisions V01 {v01:.0f}", "review the opening seconds manually")
    targets = (_value(features, "policy.findings") or {}).get("targets", {})
    findings = [f for t in targets.values() for f in t["findings"]]
    seen = set()
    for f in findings:
        for c in f.get("conflicts") or []:
            if (f["rule_id"], c["source"]) not in seen:  # one flag per rule and layer, not per target
                seen.add((f["rule_id"], c["source"]))
                flag("policy_conflict", f"{f['rule_id']}: detector fired, {c['source']} disagrees: {c['detail']}",
                     "review the quoted passage manually; the finding stays needs_review")
    # Findings from a policy check that ran before Decisions answered carry no `sources`: compare P03 here.
    p03 = _value(features, "decision.P03")
    tta = next((f for f in findings if f["rule_id"] == "TTA-002" and "sources" not in f), None)
    if p03 is not None and tta and tta["outcome"] in ("needs_review", "not_triggered") \
            and (p03 >= 0.5) != (tta["outcome"] == "needs_review"):
        flag("conflict", f"before/after: Decisions P03 p={p03} vs policy rule TTA-002 {tta['outcome']}",
             "review the before/after segment manually")

    m01 = _value(features, "decision.M01")
    if m01 in LISTING_DOUBT:
        flag("listing_mismatch", f"Decisions M01 says the listing is '{m01}' for the product in the video",
             "confirm the SKU; read SKU and market scores as unconfirmed until then")
    m03 = _value(features, "decision.M03")
    if diagnosis_agreement(m03, shop_diagnosis) == "conflict":
        flag("diagnosis_conflict",
             f"Decisions M03 '{m03}' vs shop diagnosis primary issue '{shop_diagnosis.get('primary_issue')}'",
             "check the shop KPIs behind both readings before acting on either")

    return {"status": "needs_attention" if flags else "ok", "flags": flags}
