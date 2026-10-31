"""E-commerce video scorecard demo: video content x SKU/market x shop performance.

Usage (from the repo root):
    uv run python main.py                              # fixture teashell_001
    uv run python main.py --shop SHOP002               # pair the video with a shop from the Shopee seed
    uv run python main.py --shop SHOP001 --seed-video SHOP001-VID03
    uv run python main.py --shop all                  # shop diagnosis summary for every seed shop
    uv run python main.py --claims-llm                 # allow one paid LLM call: video claims vs listing (C3)
    uv run python main.py --rubric v2 --decisions      # score with the Decisions question bank (one paid call)
    uv run python main.py --no-policy-llm              # policy rules + Decisions signals only, no policy reviewer LLM

A video listed in fixtures/clipcat_benchmark also gets its reported Clipcat outcome (bench.*),
and is paired by default with its seed video slot when --shop matches its shop.
"""

import argparse
import json
from dataclasses import asdict
from pathlib import Path

from tabulate import tabulate

from sources import benchmark, claims, cross_check, decision_scorer
from sources import music as song
from core import shop_rubric
from core.quality_gate import diagnosis_agreement, quality_gate
from core.rubric import RUBRIC_VERSIONS
from sources.providers import (FixtureProvider, ListingProvider, MarketProvider, MusicProvider, PostContextProvider,
                               PostCopyProvider, ShopSeedProvider, VideoFeatureProvider, has_post_context,
                               load_seed, seed_data)
from core.fixes import plan_fixes
from core.overall import overall
from core import platform_fit as fit
from core.policy_check import TARGETS as POLICY_TARGETS, applicable_rules_feature, policy_features
from core.schema import Feature, FeatureMap, GroupScore, Mode
from core.score_engine import FeatureUnavailable, FeatureView, revenue_funnel, score_all
from core.shop_diagnosis import diagnose_shop, diagnose_video
from core.trace import Progress, Trace, feature_digest, no_progress, tokens, tokens_for

HERE = Path(__file__).resolve().parent
SEED_PATH = HERE / "fixtures" / "shopee_seed" / "seed.json"

# Not applicable before a video is posted: its own retention / conversion, and the shop-level margin.
PREPUBLISH_EXCLUDED = {"V7", "C8", "S8"}

# Provider -> (trace step, owning agent, agent tool that serves the same data)
PROVIDER_STEPS = {
    "VideoFeatureProvider": ("load_video_features", "video_analyst", "get_video_features"),
    "BenchmarkProvider": ("load_real_metrics", "metrics_analyst", "get_real_video_metrics"),
    "ListingCandidatesProvider": ("load_product_listings", "product_scout", "find_product_listings"),
    "ShopSeedProvider": ("load_shop_and_sku", "metrics_analyst", "get_shop"),
    "FixtureProvider": ("load_fixture", "metrics_analyst", None),
    "ListingProvider": ("load_user_listing", "product_scout", "find_product_listings"),
    "MarketProvider": ("load_market_snapshot", "product_scout", "get_market_snapshot"),
    "PostContextProvider": ("load_post_context", "orchestrator", None),
    "PostCopyProvider": ("load_post_copy", "orchestrator", None),
}


def short(value, width: int = 50) -> str:
    text = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
    return text if len(text) <= width else text[: width - 3] + "..."


def print_sources(features: FeatureMap) -> None:
    rows = [[name, f.status, f.source or "-", short(f.value)] for name, f in features.items()]
    print("\n=== DATA SOURCES ===")
    print(tabulate(rows, headers=["feature", "status", "source", "value"], tablefmt="simple"))


def print_scores(groups: list[GroupScore]) -> None:
    for g in groups:
        flag = " [SIMULATION: depends on mock]" if g.mock_dependency else ""
        score = "not_scored" if g.score is None else f"{g.score}/100"
        print(f"\n=== {g.name.upper()}: {score} | coverage {g.coverage:.0%}{flag} ===")
        rows = [
            [
                c.id,
                c.name,
                c.weight,
                "not_scored" if c.score is None else c.score,
                "yes" if c.mock_dependency else "",
                c.reason or ", ".join(c.inputs),
            ]
            for c in g.criteria
        ]
        print(tabulate(rows, headers=["id", "criterion", "w", "score", "mock", "inputs / reason"], tablefmt="simple"))


def print_policy(policy: dict) -> None:
    print(f"\n=== POLICY (baseline v{policy['baseline_version']}, paraphrased subset, not platform approval) ===")
    for target, t in policy["targets"].items():
        print(f"\n{target}: {t['verdict']} | score {t['score'] if t['score'] is not None else 'not_scored'}")
        rows = [[f["rule_id"], f["severity"], f["outcome"], "" if f["counted"] else "provisional",
                 "; ".join(f["evidence"])] for f in t["findings"]]
        print(tabulate(rows, headers=["rule", "severity", "outcome", "", "evidence"], tablefmt="simple",
                       maxcolwidths=[None, None, None, None, 90]))


def print_overall(summary: dict, fixes: list[dict]) -> None:
    score = "not_scored" if summary["score"] is None else f"{summary['score']}/100 {summary['label_vi']}"
    print(f"\n=== OVERALL: {score} | coverage {summary['coverage']:.0%} ===")
    for w in summary["warnings"]:
        print(f"! {w}")
    gate = summary["policy_gate"]
    print(f"policy gate: {gate['status']} ({len(gate['blockers'])} blockers)")
    print("\n=== FIXES ===")
    rows = []
    for f in fixes:
        where = ", ".join(t["label"] for t in f["timestamps"])
        if not where and f["suggested_at"]:
            where = f"{f['suggested_at']['label']} ({f['suggested_at']['note']})"
        gain = "" if f["expected_gain"] is None else f"+{f['expected_gain']}"
        rows.append([f["kind"], f["ref"], f["title"], gain, where or "cả video"])
    print(tabulate(rows, headers=["kind", "ref", "fix", "gain", "where"], tablefmt="simple",
                   maxcolwidths=[None, None, 50, None, 30]))


def print_shop(shop: dict) -> None:
    print(f"\n######## SHOP {shop['shop_id']} ########")
    print_scores(shop["scores"])
    d = shop["diagnosis"]
    print("\n=== SHOP DIAGNOSIS ===")
    if d["status"] == "not_scored":
        print(f"not_scored: {d['reason']}")
        return
    print(f"status {d['status']} | confidence {d['confidence']} | primary issue: {d['primary_issue']}")
    for f in d["findings"] + d["tentative"]:
        tag = " (sơ bộ)" if f in d["tentative"] else ""
        print(f"\n[{f['priority']}] {f['area']}{tag} (severity {f['severity']}): {f['root_cause']}")
        for e in f["evidence"]:
            print(f"   - {e}")
        print(f"   => {f['action']}")
    print("\n=== VIDEO vs SHOP ===")
    rows = [[v["video_id"], v["verdict"], v["evidence"], v["action"]] for v in shop["videos"]]
    print(tabulate(rows, headers=["video", "verdict", "evidence", "action"], tablefmt="simple", maxcolwidths=[None, None, 60, 50]))
    for v in shop["videos"]:
        for note in v["content_notes"]:
            print(f"   * {v['video_id']}: {note}")


def build_shop_report(features: FeatureMap, mode: Mode, shop_id: str, content_video_id: str | None) -> dict:
    """Shop scores + diagnosis; the video paired with real content gets VLM cross-check notes."""
    try:
        rows = FeatureView(features, mode)["shop.videos"]
    except FeatureUnavailable:  # evidence mode refuses the mock seed
        rows = []
    return {
        "shop_id": shop_id,
        "scores": score_all(features, mode, shop_rubric.RUBRICS),
        "diagnosis": diagnose_shop(features, mode),
        "videos": [diagnose_video(r, features if r["video_id"] == content_video_id else None) for r in rows],
    }


def _seed_video_sku(seed: Path | dict, video_id: str | None) -> str | None:
    return next((v["sku_id"] for v in seed_data(seed)["videos"] if v["video_id"] == video_id), None)


def seed_videos(shop_id: str, seed: Path | dict = SEED_PATH) -> list[str]:
    return [v["video_id"] for v in seed_data(seed)["videos"] if v["shop_id"] == shop_id]


def inferred_features(features: FeatureMap, video_features: Path | None, claims_llm: bool = False,
                      on_usage=None) -> FeatureMap:
    """Features that need several providers at once (video x listing). LLM only when `claims_llm` is set.
    `on_usage(source, usage, model)`: see claims.claims_features."""
    if not video_features:
        return {claims.FEATURE: Feature.missing("no video features")}
    client = None
    if claims_llm:
        from openai import OpenAI  # deferred: only needed when a live call is allowed
        client = OpenAI()
    return claims.claims_features(features, video_features.stem, video_features.parent, client, on_usage=on_usage)


def decision_plan(features: FeatureMap, mode: Mode, video_file: str) -> decision_scorer.RequestPlan:
    """The batched Decisions request this run would send (eligible questions, keyframes, cache key); no call."""
    video = Path(video_file) if video_file else None
    if video is not None and not video.is_absolute():
        video = HERE / video  # cache paths are relative to the demo directory
    return decision_scorer.plan_request(features, mode, video)


def decision_stage(features: FeatureMap, plan: decision_scorer.RequestPlan, allow_call: bool,
                   on_progress: Progress = no_progress) -> FeatureMap:
    """decision.* features from the Decisions API: cached answers, or one batched call when allowed."""
    client = None
    if allow_call and plan.eligible and not plan.cached:
        from openai import OpenAI  # deferred: only needed when a live call is allowed
        client = OpenAI()
    return decision_scorer.answer(plan, features, client, on_progress)


def policy_client(allow: bool):
    """(OpenAI client or None, reason when the allowed policy reviewer cannot run).

    The reviewer is on by default, so a missing API key must not break the run: the rules and the
    Decisions signals still decide every finding without it.
    """
    if not allow:
        return None, "policy reviewer LLM not allowed"
    from openai import OpenAI, OpenAIError  # deferred: only needed when a live call is allowed
    try:
        return OpenAI(), ""
    except OpenAIError as e:
        return None, f"policy reviewer LLM unavailable: {e}"


def build_report(
    video_features: Path | None,
    mode: Mode,
    fixture: Path | None = None,
    shop_id: str | None = None,
    seed_video: str | None = None,
    seed: Path | dict = SEED_PATH,
    claims_llm: bool = False,
    listing: dict | None = None,
    decisions: bool = False,
    rubric: str = "v1",
    trace: Trace | None = None,
    cross_check_agent: bool = False,
    stage: str = "published",
    sku_id: str | None = None,
    post: dict | None = None,
    policy_llm: bool = False,
    music: bool = False,
) -> dict:
    """Load all providers, score, and return the report (shared by CLI and Streamlit app).

    Either `fixture` (sku/market/performance JSON) or `shop_id` (+ `seed_video`) from the Shopee seed
    supplies the non-video data. With the seed, the video's real VLM content is paired with the
    performance of `seed_video` and the shop it belongs to. `listing` (an uploaded video's user-entered
    product listing) supplies REAL sku.* keys and overrides the same keys from seed or fixture.

    Fixed workflow, no LLM picks the steps: evidence (providers) -> claims -> Decisions (cached answers
    always; a paid call only when `decisions`) -> policy (rules, then Decisions P02-P05 as a second signal,
    then the policy reviewer LLM only when `policy_llm`) -> score with `rubric` (v1 formulas, v2 the
    Decisions question bank) -> quality gate -> overall score + policy gate -> fixes.
    `trace` records each step (agent, tool, input, output, time).

    `policy_llm` defaults to off here so library callers and tests never pay implicitly; the CLI and the
    API turn it on by default. `music` switches on the background-song step: the ShazamIO identification
    (free, network, cached). Off, the step is traced as skipped and makes no network call.

    `stage="prepublish"` scores a video before it is posted: its own performance (V7, C8) does not exist yet
    and margin (S8) belongs to the shop layer, so those criteria leave the rubric instead of lowering coverage.
    `sku_id` + `post` describe an uploaded video: the shop SKU it will be attached to and how it will be posted.
    `post.caption` / `post.hashtags` (seller copy) are read for every video, seed or uploaded.
    """
    trace = trace or Trace()
    providers = [VideoFeatureProvider(video_features)] if video_features else []
    video_file = json.loads(video_features.read_text(encoding="utf-8")).get("video_file", "") if video_features else ""
    bench_row = benchmark.find_row(video_file) if video_file else None
    if bench_row:
        providers.append(benchmark.BenchmarkProvider(bench_row))
        providers.append(benchmark.ListingCandidatesProvider(bench_row["clipcat_id"]))
    elif shop_id and sku_id:
        # An uploaded video of a shop SKU reads that product's listing through the seed video selling the same SKU.
        same_sku = {v["video_id"] for v in seed_data(seed)["videos"] if v["shop_id"] == shop_id and v["sku_id"] == sku_id}
        sku_row = next((r for r in benchmark.load_benchmark() if r["seed_video_id"] in same_sku), None)
        if sku_row:
            providers.append(benchmark.ListingCandidatesProvider(sku_row["clipcat_id"]))
    if shop_id:
        paired = bench_row["seed_video_id"] if bench_row and bench_row["synthetic_shop_id_analogy"] == shop_id else None
        seed_video = seed_video or paired or (None if sku_id else seed_videos(shop_id, seed)[0])
        providers.append(ShopSeedProvider(seed, shop_id, seed_video, sku_id))
        snapshot = next((m for m in seed_data(seed).get("market_snapshots", [])
                         if m["sku_id"] == (sku_id or _seed_video_sku(seed, seed_video))), None)
        if snapshot:
            providers.append(MarketProvider(snapshot))
    elif fixture:
        providers += [
            FixtureProvider("sku", fixture / "sku.json"),
            FixtureProvider("market", fixture / "market.json"),
            FixtureProvider("perf", fixture / "performance.json"),
        ]
    # Neither shop nor fixture (an uploaded video): content + its listing, everything else stays MISSING.
    if listing:
        providers.append(ListingProvider(listing))
    if stage == "prepublish":
        providers.append(PostContextProvider(post, sku_linked=bool(sku_id)))
    elif has_post_context(post):
        # A posted seed video whose seller later set sponsorship / disclosure / goal: every seed video is
        # linked to its featured SKU, so the shop pairing is the shopping link.
        providers.append(PostContextProvider(post, sku_linked=bool(shop_id)))
    providers.append(PostCopyProvider(post))  # caption + hashtags, MISSING with a reason when not written
    features: FeatureMap = {}
    for provider in providers:
        name, agent, tool = PROVIDER_STEPS.get(type(provider).__name__, (type(provider).__name__, "orchestrator", None))
        with trace.step(name, "tool", agent, tool) as s:
            loaded = provider.load()
            features.update(loaded)
            s.output = feature_digest(loaded)
    with trace.step("identify_music", "tool", "video_analyst", "shazamio", input={"music": music}) as s:
        if not (video_file and music):
            s.status = "skipped"
            s.output = {"reason": "nhận diện nhạc không được bật" if video_file else "không có video"}
        else:
            video = Path(video_file) if Path(video_file).is_absolute() else HERE / video_file
            record = song.run(video, trace.reporter("identify_music"))
            features.update(MusicProvider(record).load())
            s.output = {"match": record.get("status"), "title": record.get("title"), "artist": record.get("artist"),
                        "reason": record.get("reason")}
            if record.get("status") == "error":
                s.status = "error"

    with trace.step("check_claims_vs_listing", "reasoning" if claims_llm else "functional", "product_scout",
                    input={"paid_llm_allowed": claims_llm}) as s:
        def claims_usage(source: str, usage: dict | None, model: str) -> None:
            s.tokens = tokens_for(source, usage, model)

        inferred = inferred_features(features, video_features, claims_llm, claims_usage)
        features.update(inferred)
        s.output = feature_digest(inferred)

    # Policy targets: the platforms the seller will post on; every known target when unknown (seed videos).
    targets = tuple(t for t in (post or {}).get("platforms") or () if t in POLICY_TARGETS) or tuple(POLICY_TARGETS)
    # Decisions runs before the policy check: its P02-P05 answers are the policy check's second signal.
    # P01/P04 also need the rules that apply to the targets, which do not depend on any finding.
    features.update(applicable_rules_feature(targets))
    if video_features:
        with trace.step("ask_decisions_api", "reasoning", "decision_scorer", "openai.decisions.create",
                        input={"paid_call_allowed": decisions}) as s:
            progress = trace.reporter("ask_decisions_api")
            plan = decision_plan(features, mode, video_file)
            progress("request", f"Dựng request: {len(plan.eligible)} câu hỏi + {len(plan.frames)} keyframe",
                     detail={"questions": len(plan.eligible), "keyframes": len(plan.frames),
                             "not_eligible": len(plan.not_eligible), "cached": plan.cached})
            was_cached = plan.cached
            answered = decision_stage(features, plan, decisions, progress)
            features.update(answered)
            new_calls = plan.cached and not was_cached
            details = decision_scorer.answer_details(answered, Path(video_file).stem)
            # One batched call: every keyframe went with every question of the request that produced the answers.
            details["keyframes"] = decision_scorer.keyframes_sent(plan) if plan.cached else []
            details["keyframes_scope"] = "batch"
            details["cache_key"] = plan.key if plan.cached else None
            secs = [k["sec"] for k in details["keyframes"]]
            for q in details["questions"]:
                if secs and "answer" in q:
                    q["keyframes_used"] = secs
            skipped = {q["id"]: q["reason"] for q in details["questions"] if "not eligible" in (q.get("reason") or "")}
            s.input = {**s.input, "eligible": [q["id"] for q in details["questions"] if q["id"] not in skipped],
                       "not_eligible": skipped}
            s.output = {"source": "live call" if new_calls else ("cache" if details["calls"] else "not run"), **details}
            s.tokens = tokens_for(s.output["source"], [c.get("usage") for c in details["calls"]],
                                  decision_scorer.MODEL)
    else:
        details = None
        with trace.step("ask_decisions_api", "reasoning", "decision_scorer", "openai.decisions.create") as s:
            s.status, s.output = "skipped", {"reason": "no extracted video features"}

    client, unavailable = policy_client(policy_llm)
    with trace.step("check_policy", "reasoning" if client else "functional", "policy_guard",
                    "rules + decisions + policy_reviewer" if client else "rules + decisions",
                    input={"mode": mode.value, "targets": list(targets), "paid_llm_allowed": policy_llm,
                           **({"llm_unavailable": unavailable} if policy_llm and unavailable else {})}) as s:
        policy = policy_features(features, mode, targets, client=client, on_progress=trace.reporter("check_policy"))
        features.update(policy)
        s.output = {"policy.score": feature_digest(policy).get("policy.score"),
                    "targets": {t: {"verdict": v["verdict"], "score": v["score"],
                                    "findings": [{k: f.get(k) for k in ("rule_id", "outcome", "severity", "summary",
                                                                        "evidence", "sources", "quotes")}
                                                 for f in v["findings"]]}
                                for t, v in policy["policy.findings"].value["targets"].items()}}
        reviewer = policy["policy.findings"].value["reviewer"]
        s.tokens = tokens_for(reviewer.get("status"), reviewer.get("usage"), reviewer.get("model"))
    # Checklist against the official platform specs (core.platform_fit): reads measured features, never scores.
    with trace.step("check_platform_fit", "functional", "policy_guard") as s:
        platform_fit = fit.evaluate(features)
        s.output = {"summary": platform_fit["summary"]}

    checks = []
    if details:
        # Low Decisions answers get a second and third opinion: rule formulas and (opt-in) an LLM auditor.
        with trace.step("cross_check_low_answers", "reasoning" if cross_check_agent else "functional", "auditor",
                        "rules + llm_auditor", input={"threshold": cross_check.LOW_SCORE,
                                                      "paid_agent_allowed": cross_check_agent}) as s:
            client = None
            if cross_check_agent:
                from openai import OpenAI  # deferred: only needed when a live call is allowed
                client = OpenAI()
            checks = cross_check.cross_check(features, mode, details["questions"], Path(video_file).stem, client)
            s.output = {c["id"]: {"decision": c["decision_score"], "rule": c["rule"]["score"],
                                  "agent": c["agent"].get("score"), "verdict": c["verdict"]} for c in checks}
            if not checks:
                s.status = "skipped"
            agents = [c["agent"] for c in checks if c["agent"].get("source") in ("live call", "cache")]
            if agents:
                s.tokens = tokens(live=[a.get("usage") for a in agents if a["source"] == "live call"],
                                  cached=[a.get("usage") for a in agents if a["source"] == "cache"] or None,
                                  model=agents[0].get("model"),
                                  source="live call" if any(a["source"] == "live call" for a in agents) else "cache")

    rubrics = RUBRIC_VERSIONS[rubric]
    if stage == "prepublish":
        rubrics = {g: [c for c in crit if c.id not in PREPUBLISH_EXCLUDED] for g, crit in rubrics.items()}
    with trace.step("score_rubric", "functional", "scorer", "score_engine", input={"rubric": rubric, "mode": mode.value}) as s:
        scores = score_all(features, mode, rubrics)
        s.output = {g.name: {"score": g.score, "coverage": g.coverage, "mock_dependency": g.mock_dependency,
                             "scored": [c.id for c in g.criteria if c.scored],
                             "not_scored": [c.id for c in g.criteria if not c.scored]} for g in scores}
    shop = None
    if shop_id:
        with trace.step("diagnose_shop", "functional", "metrics_analyst", "diagnose_shop", input={"shop_id": shop_id}) as s:
            shop = build_shop_report(features, mode, shop_id, seed_video)
            # Decisions M03 (shop bottleneck) checked against the rule-based diagnosis.
            m03 = features.get("decision.M03")
            shop["diagnosis_agreement"] = diagnosis_agreement(m03 and m03.value, shop["diagnosis"])
            s.output = {"diagnosis": shop["diagnosis"], "diagnosis_agreement": shop["diagnosis_agreement"],
                        "scores": {g.name: g.score for g in shop["scores"]}}
    with trace.step("quality_gate", "functional", "scorer") as s:
        gate = quality_gate(features, scores, shop_diagnosis=shop["diagnosis"] if shop else None)
        s.output = gate
    with trace.step("compare_real_outcome", "functional", "metrics_analyst") as s:
        # Compare the outcome with content-only scores so mock perf data cannot leak into the check.
        bench = benchmark.compare(score_all(features, Mode.EVIDENCE, rubrics), features) if bench_row else None
        funnel = revenue_funnel(features, mode)
        s.output = {"benchmark": bench, "revenue_funnel": funnel}
        if not bench_row:
            s.status = "skipped"
    policy_report = features["policy.findings"].value
    with trace.step("compose_overall", "functional", "orchestrator", "core.overall") as s:
        summary = overall(scores, policy_report)
        s.output = summary
    with trace.step("compose_fixes", "functional", "orchestrator", "core.fixes",
                    input={"creative_format": getattr(features.get("decision.M02"), "value", None)}) as s:
        fixes = plan_fixes(scores, policy_report, features, gate, summary)
        s.output = [{k: f[k] for k in ("id", "kind", "expected_gain", "suggested_at")} for f in fixes]
    return {
        "video_id": seed_video or (fixture.name if fixture else Path(video_file).stem),
        "mode": mode.value,
        "rubric": rubric,
        "features": features,
        "scores": scores,
        "policy": policy_report,
        "platform_fit": platform_fit,
        "overall": summary,
        "fixes": fixes,
        "quality_gate": gate,
        "benchmark": bench,
        "revenue_funnel": funnel,
        "shop": shop,
        "decisions": details,
        "cross_check": checks,
    }


def to_json(report: dict) -> dict:
    shop = report["shop"]
    return {
        **report,
        "features": {k: asdict(v) for k, v in report["features"].items()},
        "scores": [asdict(g) for g in report["scores"]],
        "shop": {**shop, "scores": [asdict(g) for g in shop["scores"]]} if shop else None,
    }


def print_all_shops(mode: Mode, seed: Path = SEED_PATH) -> None:
    rows = []
    for shop in load_seed(seed)["shops"]:
        features = ShopSeedProvider(seed, shop["shop_id"]).load()
        report = build_shop_report(features, mode, shop["shop_id"], None)
        d = report["diagnosis"]
        scores = [("-" if g.score is None else g.score) for g in report["scores"]]
        verdicts = ", ".join(sorted({v["verdict"] for v in report["videos"]}))
        top = d.get("findings", [{}])[0]
        rows.append([shop["shop_id"], shop["shop_name"], *scores, d.get("confidence", "-"),
                     d.get("primary_issue", d.get("reason")), top.get("priority", "-"), verdicts])
    headers = ["shop", "name", *shop_rubric.RUBRICS, "confidence", "primary issue", "prio", "video verdicts"]
    print(f"MODE: {mode.value}")
    print(tabulate(rows, headers=headers, tablefmt="simple"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video-features", type=Path, default=HERE / "output" / "features" / "vn-beauty-467796.json")
    parser.add_argument("--fixture", type=Path, default=HERE / "fixtures" / "teashell_001")
    parser.add_argument("--shop", help="shop_id from the Shopee seed (replaces --fixture), or 'all'")
    parser.add_argument("--seed-video", help="seed video_id whose performance pairs with the video (default: first)")
    parser.add_argument("--out", type=Path, default=HERE / "output")
    parser.add_argument("--claims-llm", action="store_true",
                        help="allow one LLM call (paid) to check video claims against the listing; else cache only")
    parser.add_argument("--music", action="store_true",
                        help="identify the background song (ShazamIO, free, network)")
    parser.add_argument("--rubric", choices=sorted(RUBRIC_VERSIONS), default="v1",
                        help="v1: formulas over extracted features; v2: Decisions API question bank")
    parser.add_argument("--decisions", action="store_true",
                        help="allow one Decisions API call (paid) for eligible questions; else cached answers only")
    parser.add_argument("--no-policy-llm", action="store_true",
                        help="skip the policy reviewer LLM (paid); rules and Decisions signals still run")
    args = parser.parse_args()
    mode = Mode.SIMULATION

    if args.shop == "all":
        print_all_shops(mode)
        return

    report = build_report(args.video_features, mode, args.fixture, args.shop, args.seed_video,
                          claims_llm=args.claims_llm, decisions=args.decisions, rubric=args.rubric,
                          policy_llm=not args.no_policy_llm, music=args.music)

    print(f"MODE: {mode.value}")
    print_sources(report["features"])
    print_scores(report["scores"])
    print_policy(report["policy"])
    print_overall(report["overall"], report["fixes"])
    print("\n=== REVENUE FUNNEL ===")
    print(json.dumps(report["revenue_funnel"], ensure_ascii=False, indent=2))
    if report["benchmark"]:
        print("\n=== BENCHMARK (Clipcat, reported, unverified) ===")
        print(json.dumps(report["benchmark"], ensure_ascii=False, indent=2))
    if report["shop"]:
        print_shop(report["shop"])

    args.out.mkdir(exist_ok=True)
    out_file = args.out / f"{report['video_id']}_{mode.value}.json"
    out_file.write_text(json.dumps(to_json(report), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved: {out_file}")


if __name__ == "__main__":
    main()
