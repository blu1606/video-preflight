"""Plain-language insights for the simple result view: one LLM call that picks and phrases what the run found.

Code builds the candidate insights (sources/insight_candidates.py): each one is new information the seller does
not see elsewhere on screen, with its facts and its citations (the criterion, metric, dataset row, fix or second
in the video to open). The model only chooses candidates by id and writes 1-2 plain Vietnamese sentences for each.
It cannot add a candidate or a citation. Answers are checked before use: an unknown or repeated candidate, a
candidate that only restates what is already on screen, or a sentence quoting a number that is not in the
candidate's facts is dropped and reported.

Cache: output/insights/<video_id>.<hash>.json per candidates + model + prompt, so an unchanged result never pays
twice. Without a cache hit and without a client nothing is called.
"""

import hashlib
import json
import re
from collections.abc import Callable
from pathlib import Path

from core.trace import Progress, no_progress
from sources import insight_candidates

DEMO = Path(__file__).resolve().parents[1]
CACHE_DIR = DEMO / "output" / "insights"
PROMPT_VERSION = 2
MAX_INSIGHTS = 5
ONSCREEN_KINDS = {"criterion", "diagnosis", "group", "policy"}  # already shown: a candidate with only these restates
NUMBER_RE = re.compile(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?")
TIME_RE = re.compile(r"\b\d{1,2}:\d{2}\b")
ALLOWED_ALWAYS = {"100"}  # scores are read "x/100"
# Hand-set funnel benchmarks are never presented as a standard of the industry.
REFERENCE_WORDING = re.compile(r"benchmark|chuẩn ngành|mức chuẩn|mốc chuẩn|trung bình ngành|mức tham chiếu|mốc tham chiếu",
                               re.IGNORECASE)

SYSTEM_PROMPT = """Bạn là người tư vấn video bán hàng cho seller TikTok/Shopee ở Việt Nam.
Hệ thống đã tính sẵn các gợi ý ("candidates") từ lần phân tích video. Mỗi gợi ý có "lens" (loại thông tin)
và "facts" (số liệu, chuỗi được phép dùng). Việc của bạn: chọn 3–5 gợi ý hữu ích nhất cho seller và viết mỗi
gợi ý thành 1–2 câu tiếng Việt đơn giản, giọng tư vấn.

Ý nghĩa lens:
- funnel: video bị mất người ở bước nào sau khi đăng. Đây là số liệu sau khi đăng; nói rõ "theo số liệu sau khi đăng".
- audience: người xem video không khớp với khách mua sản phẩm.
- price: giá nói hoặc hiện trong video khác giá listing.
- claims: một lời hứa trong video mâu thuẫn với listing.
- what_if: ước tính điểm tăng nếu làm các việc đầu; là ước tính theo công thức điểm, không phải dự báo doanh số.
- benchmark: video mẫu cùng sản phẩm mở đầu hoặc có cảnh demo khác video này. Gọi là "video mẫu", không nêu số của video mẫu.
- shop_habit: lỗi lặp lại ở nhiều video khác của shop.

Quy tắc:
- Chỉ chọn gợi ý theo "id" có trong candidates. Không tự tạo gợi ý, không viết nguồn hay id trong câu chữ.
- Ưu tiên gợi ý có thông tin mới. "already_on_screen" là những gì seller đã thấy (điểm thấp, cờ policy,
  chẩn đoán): không mở đầu bằng chúng, chỉ nhắc khi cần để giải thích một gợi ý.
- Viết cho người không biết kỹ thuật. Giữ nguyên từ tiếng Anh: Hook, CTA, Viral, Conversion, Policy, SKU, GMV.
- Không dùng thuật ngữ nội bộ: coverage, INFERRED, MOCK, simulation, giả lập, rubric, criterion, mã câu
  (C08, V02...), id, lens, facts.
- Chỉ dùng số có trong "facts" của gợi ý đó, chép đúng số (116.710 hoặc 116710 đều được). Không tự tính số mới.
- Policy là rule engine bản baseline: nói "cần xem lại", không nói "vi phạm chắc chắn".
- Mốc tham chiếu (reference_ctr_pct, reference_cvr_pct trong facts): khi facts ghi "reference_status": "placeholder"
  thì mốc là số tác giả tự đặt, chưa đo. Viết đúng cụm "reference_label_vi", ví dụ "0,3% bấm vào sản phẩm,
  dưới mốc tạm tự đặt 2%". Không gọi mốc là chuẩn, benchmark, chuẩn ngành hay trung bình ngành.

Trả JSON đúng dạng:
{"headline": "1 câu kết luận",
 "summary": "2-3 câu",
 "insights": [{"candidate": "id", "text": "1-2 câu", "tone": "good|bad|info"}],
 "policy": "1-2 câu hoặc null",
 "shop": "1-2 câu hoặc null"}
Tối đa 5 insights. "policy" chỉ viết khi already_on_screen có cờ policy; "shop" chỉ khi có gợi ý shop_habit."""


def facts(result: dict, peers: list[dict] | None = None) -> dict:
    """The sheet of one run: candidates (with citations, kept for the validator) and what is already on screen."""
    overall = result.get("overall") or {}
    weak = sorted((c for g in result.get("scores") or [] for c in g.get("criteria") or []
                   if c.get("score") is not None and c["score"] < insight_candidates.WEAK), key=lambda c: c["score"])
    policy_flags = [{"rule_id": f["rule_id"], "summary": f.get("summary")}
                    for t in ((result.get("policy") or {}).get("targets") or {}).values()
                    for f in t.get("findings", []) if f.get("outcome") == "needs_review"]
    diagnosis = result.get("video_diagnosis")
    return {
        "video_id": result.get("video_id"),
        "already_on_screen": {
            "score": overall.get("score"), "label": overall.get("label_vi"),
            "weak_criteria": [{"id": c["id"], "name": c["name"], "score": round(c["score"])} for c in weak],
            "policy_flags": policy_flags,
            "diagnosis": ({"verdict": diagnosis.get("verdict"), "reason": diagnosis.get("reason")}
                          if diagnosis else None),
        },
        "candidates": insight_candidates.build(result, peers),
    }


def model_view(sheet: dict) -> dict:
    """What the model reads: candidates without citations (the code attaches those)."""
    return {"video_id": sheet["video_id"], "already_on_screen": sheet["already_on_screen"],
            "candidates": [{"id": c["id"], "lens": c["lens"], "facts": c["facts"]} for c in sheet["candidates"]]}


def _as_number(text: str) -> str:
    """'116.710' is 116710 and '0,3' is 0.3, the way a Vietnamese answer writes them."""
    return text.replace(".", "") if re.fullmatch(r"\d{1,3}(?:\.\d{3})+", text) else text.replace(",", ".")


def _numbers(value) -> set[str]:
    """Every number written in the data, with its usual roundings."""
    out = set()
    for n in NUMBER_RE.findall(json.dumps(value, ensure_ascii=False)):
        x = float(_as_number(n))
        out |= {n, str(round(x)), f"{x:g}", f"{round(x, 1):g}", f"{round(x, 2):g}"}
    return out


def _unknown_numbers(text: str, allowed: set[str]) -> list[str]:
    text = TIME_RE.sub("", text)  # mm:ss times are checked through `t`, not here
    bad = []
    for n in NUMBER_RE.findall(text):
        key = _as_number(n)
        if key in allowed or n in allowed or (key.isdigit() and int(key) <= 10):  # "3 việc" is wording
            continue
        bad.append(n)
    return bad


def _refs(cites: list[dict]) -> list[str]:
    """Criterion ids of the citations: what the older views (refs) link to."""
    return [c["id"] for c in cites if c["kind"] == "criterion"]


def validate(answer: dict, sheet: dict) -> tuple[dict, list[str]]:
    """Keeps only insights grounded in candidates; returns the cleaned answer and what was dropped."""
    cands = {c["id"]: c for c in sheet["candidates"]}
    dropped: list[str] = []

    def text_ok(where: str, text, allowed: set[str]) -> bool:
        if not isinstance(text, str) or not text.strip():
            return False
        if REFERENCE_WORDING.search(text):
            dropped.append(f"{where}: calls a hand-set reference a standard (chuẩn / benchmark)")
            return False
        bad = _unknown_numbers(text, allowed)
        if bad:
            dropped.append(f"{where}: numbers not in the data {bad}")
        return not bad

    insights, used = [], []
    for i, item in enumerate(answer.get("insights") or []):
        cid = item.get("candidate") if isinstance(item, dict) else None
        cand = cands.get(cid)
        if cand is None:
            dropped.append(f"insights[{i}]: candidate {cid!r} not in the data")
            continue
        if cid in used:
            dropped.append(f"insights[{i}]: candidate {cid} used twice")
            continue
        if all(c["kind"] in ONSCREEN_KINDS for c in cand["cites"]):
            dropped.append(f"insights[{i}]: {cid} only restates what is already on screen")
            continue
        if not text_ok(f"insights[{i}].text", item.get("text"), _numbers(cand["facts"]) | ALLOWED_ALWAYS):
            continue
        used.append(cid)
        tone = item.get("tone") if item.get("tone") in ("good", "bad", "info") else "info"
        insights.append({"text": item["text"].strip(), "tone": tone, "cites": cand["cites"],
                         "refs": _refs(cand["cites"]), "t": cand["t"], "candidate": cid, "lens": cand["lens"]})
        if len(insights) == MAX_INSIGHTS:
            break

    chosen = _numbers([cands[c]["facts"] for c in used]) | ALLOWED_ALWAYS
    everything = _numbers([c["facts"] for c in sheet["candidates"]] + [sheet["already_on_screen"]]) | ALLOWED_ALWAYS

    def optional(key: str, allowed: set[str]) -> str | None:
        text = answer.get(key)
        return text if text is None or text_ok(key, text, allowed) else None

    clean = {
        "headline": answer.get("headline") if text_ok("headline", answer.get("headline"), chosen) else None,
        "summary": answer.get("summary") if text_ok("summary", answer.get("summary"), chosen) else None,
        "insights": insights,
        "policy": optional("policy", everything),
        "shop": optional("shop", everything),
    }
    return clean, dropped


def cache_file(sheet: dict, model: str) -> Path:
    key = json.dumps([sheet, model, PROMPT_VERSION, SYSTEM_PROMPT], ensure_ascii=False, sort_keys=True)
    stem = re.sub(r"[^A-Za-z0-9_.-]", "_", str(sheet.get("video_id")))
    return CACHE_DIR / f"{stem}.{hashlib.sha1(key.encode()).hexdigest()[:16]}.json"


def ask(client, model: str, sheet: dict) -> tuple[dict, dict]:
    response = client.chat.completions.create(
        model=model, response_format={"type": "json_object"},
        messages=[{"role": "system", "content": SYSTEM_PROMPT},
                  {"role": "user", "content": json.dumps(model_view(sheet), ensure_ascii=False)}])
    usage = response.usage
    return (json.loads(response.choices[0].message.content),
            {"prompt_tokens": usage.prompt_tokens if usage else 0,
             "completion_tokens": usage.completion_tokens if usage else 0})


def read_cache(path: Path) -> dict | None:
    try:
        cached = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None  # a damaged file is a miss, never a crash
    return cached if isinstance(cached, dict) and isinstance(cached.get("answer"), dict) else None


def summarize(result: dict, model: str, client_factory: Callable[[], object] | None = None,
              on_progress: Progress = no_progress, peers: list[dict] | None = None) -> tuple[dict | None, dict]:
    """(insights for the UI or None, summary for the trace). Calls the model only on a cache miss and only
    when `client_factory` is given (a paid call the caller allowed). `peers` are the other analysed videos of
    the shop (insight_candidates.latest_peers). `on_progress` (core.trace.Progress) is told when the cache is
    used and when the call is sent / answered."""
    sheet = facts(result, peers)
    if not sheet["candidates"]:
        return None, {"status": "skipped", "reason": "no new facts to explain"}
    path = cache_file(sheet, model)
    cached = read_cache(path)
    size = {"candidates": len(sheet["candidates"]), "lenses": [c["lens"] for c in sheet["candidates"]]}
    if cached:
        answer, source, usage = cached["answer"], "cache", cached.get("token_usage")
        on_progress("cache", "Dùng insights đã cache", detail={**size, "file": path.name})
    elif client_factory is not None:
        on_progress("sent", f"Gửi {len(sheet['candidates'])} gợi ý cho {model} chọn và viết insights",
                    detail={**size, "model": model})
        try:
            answer, usage = ask(client_factory(), model, sheet)
            if not isinstance(answer, dict):
                raise TypeError(f"expected a JSON object, got {type(answer).__name__}")
        except Exception as e:  # the simple view falls back to template explanations
            return None, {"status": "error", "reason": f"{type(e).__name__}: {e}"}
        source = "live call"
        on_progress("received", f"{model} trả insights", detail=usage)
    else:
        return None, {"status": "skipped", "reason": "paid call not allowed and no cached insights"}
    clean, dropped = validate(answer, sheet)
    if not (clean["headline"] or clean["insights"]):
        return None, {"status": "error", "reason": "nothing grounded in the answer", "dropped": dropped,
                      "token_usage": usage}
    if source == "live call":  # only a usable answer is cached, so a bad one is retried next run
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"model": model, "answer": answer, "token_usage": usage},
                                   ensure_ascii=False, indent=2), encoding="utf-8")
    return ({**clean, "groups": {}, "fixes": [], "model": model, "source": source},
            {"status": "ok", "source": source, "model": model, "file": path.name, "token_usage": usage,
             "facts_sent": model_view(sheet), "candidates": size["candidates"],
             "kept": {"insights": len(clean["insights"])}, "dropped": dropped})
