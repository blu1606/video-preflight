"""Candidate insights for the plain-language summary: code finds what the seller does not see yet, the model only
chooses and phrases them (sources/insights.py).

Every generator returns candidates only when its data is present in the run; missing data is never read as 0.
A candidate carries:
- facts: the numbers and short strings its sentence may use (the validator checks the sentence against them);
- cites: where the seller can open the source (criterion, metric in a dataset, dataset row, fix, time, claims,
  policy). Citations come only from here, never from the model.
- t: a second in the video the sentence is about, or None.

Lenses, in the order they are generated:
- funnel: the funnel step that breaks after posting (views -> product clicks -> orders), with the content criteria
  that explain it. Uses after-posting numbers, which Decisions never sees.
- audience: the video's inferred viewer against the SKU's real buyer audience.
- price: a price said or shown in the video against the listing price.
- claims: video claims the listing contradicts (the claims check output).
- what_if: the rule engine's expected gains of the top fixes, against the ready threshold.
- benchmark: the benchmark video of the same product, where its hook or demo differs from this video.
- shop_habit: a weak criterion that repeats in other analysed videos of the same shop.
Not built: platform (the platform view is UI logic; no backend data without duplicating it).
"""

import re

from core.rubric import BENCH_CLICK_TO_ORDER_CVR, BENCH_PRODUCT_CTR
from sources import calibration as cal

WEAK = 50  # same bar as the "Cần sửa" list
READY = 75
MAX_PER_LENS = 2
FUNNEL_CRITERIA = {"click": ("C08", "C07"), "order": ("C07", "C02", "C03")}
GENDER_VI = {"female": "nữ", "male": "nam"}
HOOK_VI = {"result_first": "mở đầu bằng kết quả", "curiosity": "gây tò mò", "problem_first": "nêu vấn đề trước",
           "story": "kể chuyện", "trend": "theo trend"}
PRICE_RE = re.compile(r"(?<!\w)(\d{1,3}(?:[.,]\d{3})+|\d{2,6})\s?(k|đ|₫|vnđ|vnd|nghìn|ngàn)(?!\w)", re.IGNORECASE)
PRICE_TOLERANCE = 0.05
# The funnel benchmarks are hand-set until measured: a sentence names them by their calibration status.
REFERENCE_KEY = {"click": "rubric.bench_product_ctr", "order": "rubric.bench_click_to_order_cvr"}
REFERENCE_LABEL_VI = {"placeholder": "mốc tạm tự đặt", "sourced": "mốc có nguồn", "calibrated": "mốc đã hiệu chỉnh"}


def _val(features: dict, name: str):
    f = features.get(name)
    if not f or f.get("status") == "MISSING":
        return None
    return f.get("value")


def _pct(x: float, nd: int = 1) -> float:
    return round(x * 100, nd)


def _metric(field: str, value, vid: str) -> dict:
    return {"kind": "metric", "field": field, "value": value, "dataset": "videos", "row": vid,
            "source": f"video record {vid}"}


def _criteria(result: dict) -> dict[str, dict]:
    """Scored criteria of the run by id: {id: {name, score}}."""
    return {c["id"]: {"name": c["name"], "score": c["score"]} for g in result.get("scores") or []
            for c in g.get("criteria") or [] if c.get("score") is not None}


def _fix(result: dict, fix_id: str) -> dict | None:
    return next((f for f in result.get("fixes") or [] if f.get("id") == fix_id), None)


def _cand(lens: str, facts: dict, cites: list[dict], t: float | None = None) -> dict:
    if t is not None:
        cites = [*cites, {"kind": "time", "t": t}]
    return {"lens": lens, "facts": facts, "cites": cites, "t": t}


def funnel(result: dict) -> list[dict]:
    f, vid = result.get("features") or {}, result.get("video_id")
    views, ctr, cvr = _val(f, "perf.views"), _val(f, "perf.product_ctr"), _val(f, "perf.click_to_order_cvr")
    if not views or ctr is None:
        return []
    if ctr < BENCH_PRODUCT_CTR:
        step = "click"
    elif cvr is not None and cvr < BENCH_CLICK_TO_ORDER_CVR:
        step = "order"
    else:
        return []
    criteria = _criteria(result)
    weak = [{"name": criteria[c]["name"], "score": round(criteria[c]["score"])}
            for c in FUNNEL_CRITERIA[step] if c in criteria and criteria[c]["score"] < WEAK]
    offer = _val(f, "video.offer") or {}
    completion = _val(f, "perf.completion_rate")
    reference = cal.entry(REFERENCE_KEY[step])["status"]
    facts = {"views": views, "completion_pct": None if completion is None else _pct(completion),
             "ctr_pct": _pct(ctr, 2), "reference_ctr_pct": _pct(BENCH_PRODUCT_CTR),
             "click_to_order_pct": None if cvr is None else _pct(cvr, 2),
             "reference_cvr_pct": _pct(BENCH_CLICK_TO_ORDER_CVR), "reference_status": reference,
             "reference_label_vi": REFERENCE_LABEL_VI[reference], "gmv_vnd": _val(f, "perf.actual_gmv_vnd"),
             "has_cta": _val(f, "video.has_cta"), "offer_present": offer.get("present"),
             "break_step": "bấm vào sản phẩm" if step == "click" else "đặt hàng sau khi bấm",
             "content_gaps": weak}
    cites = [_metric("perf.views", views, vid), _metric("perf.product_ctr", ctr, vid)]
    if step == "order" and cvr is not None:
        cites.append(_metric("perf.click_to_order_cvr", cvr, vid))
    cites += [{"kind": "criterion", "id": c} for c in FUNNEL_CRITERIA[step] if c in criteria and criteria[c]["score"] < WEAK]
    fix = _fix(result, "criterion:C08") if step == "click" else None
    if fix:
        cites.append({"kind": "fix", "id": fix["id"]})
    return [_cand("funnel", facts, cites)]


def audience(result: dict) -> list[dict]:
    f, vid = result.get("features") or {}, result.get("video_id")
    video, sku = _val(f, "video.inferred_target_audience"), _val(f, "context.target_audience")
    sku_id = _val(f, "sku.sku_id")
    if not video or not sku or not sku_id:
        return []
    gaps = []
    split, bands = sku.get("gender_split") or {}, sku.get("age_bands") or {}
    gender, band = video.get("gender"), video.get("age_band")
    other = {"female": "male", "male": "female"}.get(gender)
    if other in split and gender in split and split[other] > split[gender]:
        gaps.append("gender")
    if band and bands and band != max(bands, key=bands.get):
        gaps.append("age")
    v_int = [str(i).casefold() for i in video.get("interests") or []]
    s_int = [str(i).casefold() for i in sku.get("interests") or []]
    if v_int and s_int and not any(s in v for s in s_int for v in v_int):
        gaps.append("interests")
    if not gaps:
        return []
    facts = {"video_gender_vi": GENDER_VI.get(gender), "video_age_band": band,
             "video_interests": video.get("interests") or [],
             "sku_buyer_gender_share_pct": _pct(split[other], 0) if other in split else None,
             "sku_buyer_gender_vi": GENDER_VI.get(other),
             "sku_buyer_top_age_band": max(bands, key=bands.get) if bands else None,
             "sku_buyer_top_age_share_pct": _pct(max(bands.values()), 0) if bands else None,
             "sku_buyer_interests": sku.get("interests") or [], "mismatch": gaps}
    cites = [{"kind": "dataset", "dataset": "skuAudience", "row": sku_id},
             {"kind": "dataset", "dataset": "extraction", "row": vid}]
    return [_cand("audience", facts, cites)]


def _said_prices(f: dict):
    """(VND, time or None) for each price written or said in the video (transcript segments, on-screen text)."""
    for seg in _val(f, "video.transcript_segments") or []:
        for m in PRICE_RE.finditer(str(seg.get("text") or "")):
            yield _vnd(m), seg.get("start")
    on = _val(f, "video.on_screen_text")
    for item in (on if isinstance(on, list) else [on]):
        if isinstance(item, dict):
            for m in PRICE_RE.finditer(str(item.get("text") or "")):
                yield _vnd(m), item.get("timestamp_sec")


def _vnd(m) -> int | None:
    value = int(re.sub(r"[.,]", "", m.group(1)))
    value *= 1000 if m.group(2).lower() in ("k", "nghìn", "ngàn") else 1
    return value if 1000 <= value <= 10_000_000 else None


def price(result: dict) -> list[dict]:
    f, vid = result.get("features") or {}, result.get("video_id")
    ref = _val(f, "listing.price_vnd") or _val(f, "sku.price_vnd")
    if not ref:
        return []
    out = []
    for value, t in _said_prices(f):
        if value is None or abs(value - ref) / ref <= PRICE_TOLERANCE:
            continue
        facts = {"video_price_vnd": value, "listing_price_vnd": ref, "diff_pct": round(abs(value - ref) / ref * 100)}
        cites = [{"kind": "metric", "field": "listing.price_vnd", "value": ref, "dataset": "shopeeListings",
                  "row": vid, "source": "listing của video"}, {"kind": "dataset", "dataset": "extraction", "row": vid}]
        out.append(_cand("price", facts, cites, t=None if t is None else float(t)))
        break  # one mismatch is enough for the seller to act on
    return out


def claims(result: dict) -> list[dict]:
    rows = [c for c in result.get("claims_verdicts") or [] if c.get("verdict") == "contradicts"]
    if not rows:
        return []
    facts = {"claims": [{"claim": c.get("claim"), "listing_says": c.get("listing_evidence")} for c in rows[:3]],
             "count": len(rows)}
    return [_cand("claims", facts, [{"kind": "claims"}])]


def what_if(result: dict) -> list[dict]:
    overall = result.get("overall") or {}
    score = overall.get("score")
    gains = sorted((f for f in result.get("fixes") or [] if f.get("expected_gain")),
                   key=lambda f: -f["expected_gain"])
    if score is None or not gains:
        return []
    ready = (overall.get("thresholds") or {}).get("ready", READY)
    top = gains[:3]
    top_sum = round(sum(f["expected_gain"] for f in top), 1)
    all_sum = round(sum(f["expected_gain"] for f in gains), 1)
    after_top, after_all = round(score + top_sum, 1), round(score + all_sum, 1)
    facts = {"score": score, "ready_threshold": ready, "top_fixes": [{"title": f["title"], "gain": f["expected_gain"]}
                                                                    for f in top],
             "top_gain": top_sum, "score_after_top": after_top, "crosses_ready_after_top": after_top >= ready,
             "fixes_with_gain": len(gains), "all_gain": all_sum, "score_after_all": after_all,
             "gap_after_all": round(max(0, ready - after_all), 1), "note": "công thức điểm, không phải dự báo doanh số"}
    cites = [{"kind": "fix", "id": f["id"]} for f in top]
    return [_cand("what_if", facts, cites)]


def benchmark(result: dict) -> list[dict]:
    f, vid = result.get("features") or {}, result.get("video_id")
    url = _val(f, "bench.url")
    bench_id = url.rstrip("/").split("/")[-1] if isinstance(url, str) and url else None
    if not bench_id:
        return []
    b_hook, v_hook = HOOK_VI.get(_val(f, "bench.hook_type")), HOOK_VI.get(_val(f, "video.hook_type"))
    b_demo = "demo" in str(_val(f, "bench.video_type") or "").casefold()
    v_demo = _val(f, "video.demo_present")
    differs = []
    if b_hook and v_hook and b_hook != v_hook:
        differs.append("hook")
    if _val(f, "bench.video_type") is not None and v_demo is not None and b_demo != bool(v_demo):
        differs.append("demo")
    if not differs:
        return []
    facts = {"benchmark_hook_vi": b_hook, "video_hook_vi": v_hook, "benchmark_shows_demo": b_demo,
             "video_shows_demo": bool(v_demo), "differs": differs, "benchmark_numbers_verified": False}
    cites = [{"kind": "dataset", "dataset": "benchmarkVideos", "row": bench_id},
             {"kind": "dataset", "dataset": "extraction", "row": vid}]
    return [_cand("benchmark", facts, cites)]


def latest_peers(records: list[dict], video_id: str) -> list[dict]:
    """The latest saved video run of each other video of the shop; records come newest first."""
    seen, out = set(), []
    for r in records:
        target = r.get("targetId")
        if not target or target == video_id or target in seen or not isinstance(r.get("result"), dict):
            continue
        seen.add(target)
        out.append({"targetId": target, "result": r["result"]})
    return out


def shop_habit(result: dict, peers: list[dict]) -> list[dict]:
    out = []
    current = _criteria(result)
    weak = sorted((cid for cid, c in current.items() if c["score"] < WEAK), key=lambda cid: current[cid]["score"])
    for cid in weak:
        seen = [(p, _criteria(p["result"]).get(cid)) for p in peers]
        seen = [(p, c) for p, c in seen if c is not None]
        bad = [p for p, c in seen if c["score"] < WEAK]
        if len(seen) < 2 or len(bad) < 2:
            continue
        facts = {"criterion_name": current[cid]["name"], "videos_weak": len(bad), "videos_checked": len(seen),
                 "score": round(current[cid]["score"])}
        cites = [{"kind": "criterion", "id": cid}] + [{"kind": "dataset", "dataset": "analyses", "row": p["targetId"]}
                                                       for p in bad]
        out.append(_cand("shop_habit", facts, cites))
        if len(out) == MAX_PER_LENS:
            break
    return out


def build(result: dict, peers: list[dict] | None = None) -> list[dict]:
    """All candidates of a run, in lens order, with ids c1, c2, ..."""
    found = [*funnel(result), *audience(result), *price(result), *claims(result), *what_if(result),
             *benchmark(result), *shop_habit(result, peers or [])]
    return [{"id": f"c{i}", **c} for i, c in enumerate(found, 1)]
