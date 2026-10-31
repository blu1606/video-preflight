"""Score engine: weighted average over available criteria, with coverage and mock tracking.

    S_group = sum(w_i * s_i for i in scored) / sum(w_i for i in scored)
    coverage = sum(w_i for i in scored) / sum(w_i for all i)

Each criterion also reports `calibration`: the thresholds / benchmarks it relied on and the weakest status
among them (placeholder < sourced < calibrated), see sources.calibration.
"""

from core.rubric import RUBRICS, Criterion, FeatureUnavailable
from core.schema import CriterionScore, Feature, FeatureMap, GroupScore, Mode, SourceStatus
from sources import calibration

__all__ = ["FeatureUnavailable", "FeatureView", "revenue_funnel", "score_all", "score_criterion", "score_group"]


class FeatureView:
    """Read-only access to features that records what was used and enforces the mode."""

    def __init__(self, features: FeatureMap, mode: Mode):
        self.features = features
        self.mode = mode
        self.used: dict[str, Feature] = {}
        self.consts: set[str] = set()      # calibration keys read by the criterion
        self.fallbacks: list[str] = []     # optional inputs that were unavailable (why a fallback was used)

    def __getitem__(self, name: str):
        f = self.features.get(name)
        if f is None or f.status == SourceStatus.MISSING:
            why = f": {f.evidence[0]}" if f is not None and f.evidence else ""
            raise FeatureUnavailable(f"{name} missing{why}")
        if self.mode == Mode.EVIDENCE and f.is_mock_based:
            raise FeatureUnavailable(f"{name} is mock (evidence mode)")
        self.used[name] = f
        return f.value

    def get(self, name: str):
        """Optional input: its value, or None (with the reason kept) so the criterion can fall back."""
        try:
            return self[name]
        except FeatureUnavailable as e:
            self.fallbacks.append(str(e))
            return None

    def const(self, key: str):
        """A calibration threshold / benchmark, recorded so the score says which ones it relied on."""
        self.consts.add(key)
        return calibration.value(key)


def score_criterion(c: Criterion, features: FeatureMap, mode: Mode) -> CriterionScore:
    view = FeatureView(features, mode)
    try:
        score = round(float(c.fn(view)), 1)
        reason = ""
    except FeatureUnavailable as e:
        score, reason = None, str(e)
    return CriterionScore(
        id=c.id,
        name=c.name,
        weight=c.weight,
        score=score,
        mock_dependency=any(f.is_mock_based for f in view.used.values()),
        inputs=list(view.used),
        reason=reason,
        calibration=calibration.summarize(view.consts, list(view.used), view.fallbacks) if score is not None else None,
    )


def score_group(name: str, criteria: list[Criterion], features: FeatureMap, mode: Mode) -> GroupScore:
    results = [score_criterion(c, features, mode) for c in criteria]
    scored = [r for r in results if r.scored]
    total_w = sum(c.weight for c in criteria)
    scored_w = sum(r.weight for r in scored)
    score = round(sum(r.weight * r.score for r in scored) / scored_w, 1) if scored_w else None
    return GroupScore(
        name=name,
        score=score,
        coverage=round(scored_w / total_w, 2) if total_w else 0.0,
        mock_dependency=any(r.mock_dependency for r in scored),
        criteria=results,
    )


def score_all(features: FeatureMap, mode: Mode, rubrics: dict[str, list[Criterion]] = RUBRICS) -> list[GroupScore]:
    return [score_group(name, criteria, features, mode) for name, criteria in rubrics.items()]


def revenue_funnel(features: FeatureMap, mode: Mode) -> dict:
    """Expected GMV ~ views x product CTR x click-to-order CVR x AOV (simple funnel, not attributed GMV)."""
    view = FeatureView(features, mode)
    try:
        views = view["perf.views"]
        ctr = view["perf.product_ctr"]
        cvr = view["perf.click_to_order_cvr"]
        aov = view["sku.price_vnd"]
    except FeatureUnavailable as e:
        return {"status": "not_scored", "reason": str(e)}
    mock = any(f.is_mock_based for f in view.used.values())
    clicks = views * ctr
    orders = clicks * cvr
    return {
        "status": "simulation" if mock else "estimate",
        "views": views,
        "product_clicks": round(clicks),
        "orders": round(orders, 1),
        "aov_vnd": aov,
        "expected_gmv_vnd": round(orders * aov),
        "mock_dependency": mock,
        "inputs": list(view.used),
    }
