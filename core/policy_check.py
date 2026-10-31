"""Platform policy check over the paraphrased baseline in fixtures/policy_baseline_v01.

Each rule is evaluated per target (platform + publishing context) and ends as one of:
    not_triggered | needs_review | unknown (a required input is missing) | not_applicable
Never "approved": a clean result only means no layer fired on the inputs we have.

Three layers, merged by rule (the LLM never has the last word on a detector hit):
    1 detector   deterministic checks on features (free, always run)
    2 decisions  Decisions API predicates P02-P05 when answered (p >= 0.5 counts as a signal)
    3 agent      sources.policy_reviewer, one batched LLM call with verbatim-checked quotes (cached)

    detector hit                      -> needs_review; a layer saying "no" is recorded as a conflict
    detector candidate (ambiguous)    -> needs_review if layer 2 or 3 confirms, not_triggered if they say no,
                                         unknown when neither answered
    detector clear                    -> needs_review if layer 2 or 3 says yes, else not_triggered
    detector unknown (input missing)  -> needs_review if layer 2 or 3 says yes, else unknown

    target score = max(0, 100 - sum(PENALTY[severity] for counted needs_review findings))
    R1 = lowest target score; a target whose counted rules are all unknown is not scored.

Rules with verification_status provisional_* (Meta) are evaluated and shown but never counted.
Detectors read features through FeatureView, so evidence mode turns mock inputs into unknown.
"""

import json
import re
import unicodedata
from dataclasses import asdict, dataclass, field
from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Callable

from core.schema import Feature, FeatureMap, Mode, SourceStatus
from core.score_engine import FeatureUnavailable, FeatureView
from core.trace import Progress, no_progress

BASELINE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "policy_baseline_v01"
PENALTY = {"critical": 60, "high": 30, "medium": 15, "low": 5}
SIGNAL_THRESHOLD = 0.5  # Decisions predicate probability that counts as a "yes"

# target -> (platforms whose rules apply, publishing context). A TikTok Shop video is posted on
# TikTok, so TikTok community/disclosure rules apply to it as well as TikTok Shop rules.
TARGETS = {
    "tiktok_shop_video": ({"tiktok", "tiktok_shop"}, "shop_video"),
    "tiktok_ads": ({"tiktok"}, "ads"),
    "shopee_listing": ({"shopee"}, "listing"),
    "meta_ads": ({"facebook", "instagram"}, "ads"),
}
DEFAULT_TARGETS = ("tiktok_shop_video", "tiktok_ads")

# Decisions predicate -> rules it is a second signal for.
DECISION_SIGNALS = {
    "P02": ("TTS-002", "TTA-001", "META-001"),
    "P03": ("TTA-002",),
    "P04": ("TTC-002",),
    "P05": ("SHP-001", "TTS-002"),
}
RULE_SIGNALS: dict[str, list[str]] = {}
for _qid, _rules in DECISION_SIGNALS.items():
    for _rule in _rules:
        RULE_SIGNALS.setdefault(_rule, []).append(_qid)

# Absolute or exaggerated result claims (Vietnamese speech + English VLM claim summaries).
# Strong phrases promise a result on their own; weak ones are only candidates because ordinary copy uses
# them too ("cam kết chính hãng", "đảm bảo hoàn tiền", "không nhận ra" as a joke).
STRONG_CLAIM = re.compile("|".join([
    r"100\s?%", r"vĩnh viễn", r"tận gốc", r"dứt điểm", r"thần kỳ", r"trắng bật", r"bật tông", r"\d+\s*tông",
    r"(\d+|một)\s*lần\s*(mà|là)?\s*(đã\s*)?trắng",
    r"guarantee", r"permanent", r"instantly", r"overnight", r"miracle",
    r"after (one|a single|\d+)( to \w+)? uses?",
]), re.IGNORECASE)
WEAK_CLAIM = re.compile(r"cam kết|đảm bảo|ngay lập tức|cấp tốc|không nhận ra", re.IGNORECASE)
ABSOLUTE_CLAIM = re.compile(f"{STRONG_CLAIM.pattern}|{WEAK_CLAIM.pattern}", re.IGNORECASE)
PROMO_TITLE = re.compile(r"hot sale|giảm giá sốc|sale sốc|rẻ nhất|siêu rẻ|best seller|xả kho|freeship", re.IGNORECASE)
PERSONAL_ATTRIBUTE = re.compile(r"\bbạn (đang )?(bị|mắc)\b|\bare you (suffering|struggling)", re.IGNORECASE)
COSMETIC = re.compile(r"beauty|cosmetic|skin|mỹ phẩm|làm đẹp|soap|xà (bông|phòng)", re.IGNORECASE)

# Off-platform contact in a marketplace description: chat apps, social links, external URLs, "inbox/ib".
CONTACT = re.compile("|".join([
    r"\bzalo\b", r"\btelegram\b", r"\bwhatsapp\b", r"\bviber\b", r"\bmessenger\b",
    r"facebook\.com\S*", r"\bfb\.(com|me)\S*", r"\bm\.me/\S*",
    r"https?://\S+", r"\bwww\.\S+", r"\b[\w-]+\.(com|vn|net|me|ly|io|shop|store)(/\S*)?\b",
    r"\b(inbox|ib)\b",
]), re.IGNORECASE)
ON_PLATFORM = re.compile(r"shopee|shp\.ee", re.IGNORECASE)
PHONE_LIKE = re.compile(r"(?<![\w+])\+?\d[\d .\-]{8,14}\d(?!\w)")
VN_PHONE = re.compile(r"(84|0)([35789]\d{8}|2\d{9})")
PRICE_MENTION = re.compile(
    r"giá[^\d\n]{0,25}?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|tr|triệu|đ|₫|vnd|vnđ|đồng)?(?!\w)",
    re.IGNORECASE)
SIZE = re.compile(r"(?<![\w.,])(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gram|ml|l|lít)(?!\w)", re.IGNORECASE)
SIZE_UNIT = {"g": ("mass", 1), "gr": ("mass", 1), "gram": ("mass", 1), "kg": ("mass", 1000),
             "ml": ("volume", 1), "l": ("volume", 1000), "lít": ("volume", 1000)}
NEGATION_BEFORE = re.compile(r"(không chứa|không có|không|ko|free|no|without|0\s?%)\W*$", re.IGNORECASE)
NEGATION_AFTER = re.compile(r"^\s*-?\s*free\b", re.IGNORECASE)
NO_DETECTOR_REASON = {
    "product_image_check": "listing images are not collected yet (needs sku.images and a photo check)",
}


class Outcome(StrEnum):
    NOT_TRIGGERED = "not_triggered"
    NEEDS_REVIEW = "needs_review"
    UNKNOWN = "unknown"
    NOT_APPLICABLE = "not_applicable"


class Candidates(list):
    """Detector evidence that only suggests the rule: another layer must confirm it."""


@dataclass
class Finding:
    rule_id: str
    target: str
    outcome: Outcome
    severity: str
    summary: str
    counted: bool
    evidence: list[str] = field(default_factory=list)
    inputs: list[str] = field(default_factory=list)
    mock_dependency: bool = False
    source_url: str = ""
    verification_status: str = ""
    sources: list[str] = field(default_factory=list)      # layers behind the outcome: detector|decisions|agent
    quotes: list[dict] = field(default_factory=list)      # [{text, t}] verbatim passages, t in seconds or None
    conflicts: list[dict] = field(default_factory=list)   # [{source, detail}] a layer disagreeing with a detector hit
    signals: dict = field(default_factory=dict)           # what each layer said, for the report


@lru_cache(maxsize=1)
def load_baseline() -> dict:
    def read(name):
        return json.loads((BASELINE_DIR / name).read_text(encoding="utf-8"))
    return {"manifest": read("manifest.json"), "rules": read("rules.json")["rules"],
            "restricted": read("restricted_categories.json")["lists"]}


def _first(v: FeatureView, *names):
    """Value of the first available feature among names."""
    for name in names:
        try:
            return v[name]
        except FeatureUnavailable:
            continue
    raise FeatureUnavailable(f"none of {', '.join(names)} available")


def _optional(v: FeatureView, name: str):
    try:
        return v[name]
    except FeatureUnavailable:
        return None


def _snippet(text: str, start: int, end: int) -> str:
    lo, hi = max(0, start - 30), min(len(text), end + 30)
    return f"…{text[lo:hi]}…"


def _matches(pattern: re.Pattern, texts: dict[str, str]) -> list[str]:
    return [f"{where}: «{_snippet(text, m.start(), m.end())}»"
            for where, text in texts.items() for m in pattern.finditer(text)]


def post_copy(v: FeatureView) -> dict[str, str]:
    """The seller's caption and hashtags ({"caption": ..., "hashtags": "#a #b"}), only the parts written."""
    caption = _optional(v, "post.caption")
    tags = _optional(v, "post.hashtags") or []
    texts = {"caption": caption if isinstance(caption, str) else None,
             "hashtags": " ".join(f"#{t}" for t in tags if isinstance(t, str)) or None}
    return {k: t for k, t in texts.items() if t}


def _claim_texts(v: FeatureView) -> dict[str, str]:
    texts = {
        "hook": _optional(v, "video.hook_verbal"),
        "transcript": _optional(v, "video.transcript"),
        "claims": " | ".join(_optional(v, "video.key_claims") or []),
        **post_copy(v),
    }
    texts = {k: t for k, t in texts.items() if t}
    if not texts:
        raise FeatureUnavailable("no transcript, hook, claims or caption")
    return texts


def _with_copy(v: FeatureView, scan_copy: Callable[[dict], list[str]], scan: Callable[[], list[str]]) -> list[str]:
    """`scan()` (the listing / video-side check) plus `scan_copy` hits in the post copy.

    When the listing side cannot run, copy hits still trigger the rule; without them the rule stays unknown,
    so a clean caption never stands in for an unchecked listing.
    """
    copy_hits = scan_copy(post_copy(v))
    try:
        return scan() + copy_hits
    except FeatureUnavailable:
        if copy_hits:
            return copy_hits
        raise


def _ts(sec) -> str:
    return f"{int(sec // 60):02d}:{int(sec % 60):02d}" if isinstance(sec, (int, float)) else "--:--"


EVIDENCE_QUOTE = re.compile(r"^(?:(\d{2}):(\d{2}) )?[^«]*«…?(.+?)…?»$")


def _quote(evidence: str) -> dict | None:
    """{text, t} from an evidence line "MM:SS where: «text»" or "where: «…text…»"."""
    m = EVIDENCE_QUOTE.match(evidence)
    if not m:
        return None
    t = int(m[1]) * 60 + int(m[2]) if m[1] else None
    return {"text": m[3].strip(), "t": t}


# ---------- layer 1: detectors ----------
# A detector returns the evidence that triggers the rule (empty list = not triggered), a Candidates list
# when the evidence is ambiguous, or raises FeatureUnavailable when it cannot decide.

def absolute_claim_detector(v):
    # VLM quotes first (timestamped, the extractor was asked for absolute claims specifically, so they are hits);
    # the keyword scan covers old caches without policy_signals and videos where the VLM quoted nothing.
    quoted = [f"{_ts(c.get('timestamp_sec'))} {c.get('channel', '')}: «{c['text']}»"
              for c in _optional(v, "video.policy_absolute_claims") or [] if c.get("text")]
    if quoted:  # the caption is not in the extraction: its strong phrases are added to the VLM quotes
        return quoted + _matches(STRONG_CLAIM, post_copy(v))
    try:
        texts = _claim_texts(v)
    except FeatureUnavailable:
        if _optional(v, "video.policy_absolute_claims") is None:
            raise
        return []
    return _matches(STRONG_CLAIM, texts) or Candidates(_matches(WEAK_CLAIM, texts))


def before_after_review(v):
    signal = _optional(v, "video.policy_before_after")
    if signal is not None:
        if signal.get("present") and signal.get("product_effect_comparison"):
            return [f"{_ts(signal.get('timestamp_sec'))} before/after comparison of the product effect"]
        return []
    if not v["video.before_after_shown"]:
        return []
    claims = _optional(v, "video.key_claims") or []
    return [f"before/after shown alongside effect claims: {'; '.join(claims[:2])}"] if claims else []


def fake_button_check(v):
    return [f"{_ts(o.get('timestamp_sec'))} {o.get('description', 'overlay')}"
            for o in v["video.policy_ui_overlays"] if o.get("fake_interactive")]


def ai_disclosure_check(v):
    media = v["video.policy_realistic_ai_media"]
    if not media.get("present") or _optional(v, "post.ai_label_enabled") is True:
        return []
    return [f"realistic AI-looking media (confidence {media.get('confidence', '?')}), no AI label on file"]


def claim_mismatch(v):
    claims = v["video.key_claims"]
    if not claims:
        return []
    if _optional(v, "sku.supporting_documents"):
        return []
    return [f"{len(claims)} product claims, no supporting documents on file: {claims[0]}"]


def cosmetics_document_check(v):
    category = _first(v, "bench.category", "sku.category", "video.product_category")
    if not COSMETIC.search(str(category)):
        return []
    if _optional(v, "sku.cosmetic_notification_available") is True:
        return []
    return [f"category '{category}' needs a cosmetic notification (phiếu công bố), none on file"]


def title_keyword_check(v):
    return _with_copy(v, lambda t: _matches(PROMO_TITLE, t), lambda: _matches(PROMO_TITLE, {"title": v["sku.title"]}))


def commercial_disclosure_check(v):
    if v["post.is_commercial"] and not v["post.disclosure_enabled"]:
        return ["commercial post without the disclosure setting"]
    return []


def meta_personal_attribute_check(v):
    return _with_copy(v, lambda t: _matches(PERSONAL_ATTRIBUTE, t),
                      lambda: _matches(PERSONAL_ATTRIBUTE, {"ad copy": _first(v, "ad.copy", "video.transcript")}))


PRODUCT_TEXT_KEYS = ("sku.category", "bench.category", "sku.title", "listing.title", "sku.description",
                     "video.product_name", "video.product_category")


def _nfc(text) -> str:
    return unicodedata.normalize("NFC", str(text))


@lru_cache(maxsize=None)
def _keyword_pattern(keyword: str) -> re.Pattern:
    return re.compile(rf"(?<!\w){re.escape(_nfc(keyword))}(?!\w)", re.IGNORECASE)


def _keyword_hits(keyword: str, text: str) -> list[re.Match]:
    """Whole-word matches that are not negated ("không chứa thủy ngân", "mercury-free")."""
    return [m for m in _keyword_pattern(keyword).finditer(text)
            if not NEGATION_BEFORE.search(text[max(0, m.start() - 20):m.start()])
            and not NEGATION_AFTER.match(text[m.end():m.end() + 8])]


def restricted_category_check(v, list_id: str):
    """Product category / name / description against a platform's prohibited and restricted categories."""
    texts = {k: _nfc(t) for k in PRODUCT_TEXT_KEYS if isinstance(t := _optional(v, k), str) and t.strip()}
    if not texts:
        raise FeatureUnavailable("no product category, title, description or product name")
    hits, candidates = [], Candidates()
    for cat in load_baseline()["restricted"][list_id]["categories"]:
        if cat["status"] == "covered_elsewhere":
            continue
        for where, text in texts.items():
            m = next((m for kw in cat["keywords"] for m in _keyword_hits(kw, text)), None)
            if m is None:
                continue
            line = f"{where}: «{_snippet(text, m.start(), m.end())}» -> {cat['label_vi']} ({cat['status']})"
            (hits if cat["status"] == "prohibited" else candidates).append(line)
            break
    return hits or candidates


def _contact_hits(texts: dict[str, str]) -> list[str]:
    found = []
    for where, text in texts.items():
        found += [f"{where}: «{_snippet(text, m.start(), m.end())}»" for m in CONTACT.finditer(text)
                  if not ON_PLATFORM.search(m.group(0))]
        found += [f"{where}: phone number «{m.group(0).strip()}»" for m in PHONE_LIKE.finditer(text)
                  if VN_PHONE.fullmatch(re.sub(r"\D", "", m.group(0)))]
    return found


def offplatform_contact_check(v):
    return _with_copy(v, _contact_hits, lambda: _contact_hits({"description": v["sku.description"]}))


def _price_vnd(amount: str, unit: str | None) -> float | None:
    unit = (unit or "").lower()
    if unit in ("k", "nghìn", "ngàn", "tr", "triệu"):
        number = float(amount.replace(",", "."))
        return number * (1000 if unit in ("k", "nghìn", "ngàn") else 1_000_000)
    if re.fullmatch(r"\d{1,3}(?:[.,]\d{3})+", amount):
        return float(re.sub(r"[.,]", "", amount))
    return None  # a bare number without unit or thousands separator is not a price we can read


def _sizes(text: str) -> dict[str, set[float]]:
    out: dict[str, set[float]] = {}
    for m in SIZE.finditer(text):
        family, factor = SIZE_UNIT[m[2].lower()]
        out.setdefault(family, set()).add(float(m[1].replace(",", ".")) * factor)
    return out


def listing_consistency_check(v):
    """Price stated in the description vs the listed price; pack size in the title vs the description."""
    description = v["sku.description"]
    found = []
    listed = {p for p in (_optional(v, "sku.price_vnd"), _optional(v, "sku.list_price_vnd")) if p}
    if listed:
        for m in PRICE_MENTION.finditer(description):
            price = _price_vnd(m[1], m[2])
            if price and all(abs(price - p) > 0.01 * p for p in listed):
                found.append(f"description: «{_snippet(description, m.start(), m.end())}» "
                             f"states {price:,.0f} VND, listing price {', '.join(f'{p:,.0f}' for p in sorted(listed))} VND")
    title = _optional(v, "sku.title") or _optional(v, "listing.title")
    if title:
        title_sizes, desc_sizes = _sizes(title), _sizes(description)
        for family, sizes in title_sizes.items():
            if desc_sizes.get(family) and not sizes & desc_sizes[family]:
                found.append(f"title size {sorted(sizes)} vs description size {sorted(desc_sizes[family])} ({family})")
    return found


DETECTORS: dict[str, Callable] = {f.__name__: f for f in [
    absolute_claim_detector, before_after_review, claim_mismatch, cosmetics_document_check,
    title_keyword_check, commercial_disclosure_check, meta_personal_attribute_check,
    fake_button_check, ai_disclosure_check, offplatform_contact_check, listing_consistency_check,
]}
DETECTORS["cosmetic_listing_check"] = cosmetics_document_check  # Shopee's name for the same document check
DETECTORS["meta_claim_review"] = absolute_claim_detector         # same claim language, Meta's ad standards
DETECTORS["flag_restricted_product"] = lambda v: restricted_category_check(v, "tiktok_shop_vn")
DETECTORS["meta_commerce_review"] = lambda v: restricted_category_check(v, "meta_commerce")

# Copy detectors that run on a caption alone: name -> (hits, candidates) scan of {"caption", "hashtags"} texts.
COPY_SCANS: dict[str, Callable[[dict], tuple[list[str], list[str]]]] = {
    "absolute_claim_detector": lambda t: (_matches(STRONG_CLAIM, t), _matches(WEAK_CLAIM, t)),
    "title_keyword_check": lambda t: (_matches(PROMO_TITLE, t), []),
    "offplatform_contact_check": lambda t: (_contact_hits(t), []),
    "meta_personal_attribute_check": lambda t: (_matches(PERSONAL_ATTRIBUTE, t), []),
}


def scan_post_copy(caption: str | None, hashtags: list[str] | None) -> list[dict]:
    """Copy detectors on a caption + hashtags before they are posted (e.g. an AI-suggested caption).

    One flag per detector that fired: {check, outcome, rule_ids, severity, summaries, evidence}. outcome is
    needs_review (a phrase that triggers the rule) or candidate (ordinary copy that may need review). An empty
    list only means these detectors found nothing; it is never an approval.
    """
    features = {"post.caption": Feature(caption, SourceStatus.REAL, "seller")} if caption else {}
    if hashtags:
        features["post.hashtags"] = Feature(hashtags, SourceStatus.REAL, "seller")
    texts = post_copy(FeatureView(features, Mode.EVIDENCE))
    flags = []
    for check, scan in COPY_SCANS.items():
        hits, candidates = scan(texts)
        if not (hits or candidates):
            continue
        aliases = {name for name, fn in DETECTORS.items() if fn is DETECTORS[check]}
        rules = [r for r in load_baseline()["rules"] if r["check_type"] in aliases]
        rules.sort(key=lambda r: (-PENALTY[r["severity"]], r["rule_id"]))
        flags.append({"check": check, "outcome": "needs_review" if hits else "candidate",
                      "rule_ids": [r["rule_id"] for r in rules], "severity": rules[0]["severity"] if rules else None,
                      "summaries": [r["summary_en"] for r in rules], "evidence": hits or candidates})
    return flags


# ---------- merge ----------

def merge(detector: str, decision: bool | None, agent: bool | None) -> tuple[Outcome, list[str], list[str]]:
    """(outcome, sources, layers that contradict a detector hit). detector: hit|candidate|clear|unknown."""
    yes = [s for s, said in (("decisions", decision), ("agent", agent)) if said is True]
    no = [s for s, said in (("decisions", decision), ("agent", agent)) if said is False]
    if detector == "hit":
        return Outcome.NEEDS_REVIEW, ["detector", *yes], no
    if yes:
        return Outcome.NEEDS_REVIEW, (["detector"] if detector == "candidate" else []) + yes, []
    if detector == "clear":
        return Outcome.NOT_TRIGGERED, ["detector", *no], []
    if detector == "candidate" and no:
        return Outcome.NOT_TRIGGERED, ["detector", *no], []
    return Outcome.UNKNOWN, [], []


def _decision_signal(view: FeatureView, rule_id: str) -> tuple[bool | None, list[str]]:
    """(any predicate >= threshold / all below / None when unanswered, evidence lines)."""
    answered = {}
    for qid in RULE_SIGNALS.get(rule_id, []):
        p = _optional(view, f"decision.{qid}")
        if isinstance(p, (int, float)) and not isinstance(p, bool):
            answered[qid] = float(p)
    if not answered:
        return None, []
    lines = [f"Decisions {qid} p={p:.2f}" for qid, p in answered.items()]
    return any(p >= SIGNAL_THRESHOLD for p in answered.values()), lines


def _agent_signal(answer: dict | None) -> bool | None:
    if not answer:
        return None
    return {"needs_review": True, "not_triggered": False}.get(answer.get("outcome"))


def _applies(rule: dict, target: str) -> bool:
    platforms, context = TARGETS[target]
    return bool(platforms & set(rule["platforms"])) and context in rule["applies_to"]


def check_rule(rule: dict, target: str, features: FeatureMap, mode: Mode, review: dict | None = None) -> Finding:
    """One rule on one target: detector, Decisions predicates found in `features`, and the reviewer answer.

    review: sources.policy_reviewer.review(...) result (None = layer 3 not available).
    """
    finding = Finding(
        rule_id=rule["rule_id"], target=target, outcome=Outcome.NOT_APPLICABLE, severity=rule["severity"],
        summary=rule["summary_en"], counted=not rule["verification_status"].startswith("provisional"),
        source_url=rule["source_url"], verification_status=rule["verification_status"],
    )
    if not _applies(rule, target):
        return finding
    view = FeatureView(features, mode)

    detector_fn = DETECTORS.get(rule["check_type"])
    if detector_fn is None:
        state = "unknown"
        evidence = [NO_DETECTOR_REASON.get(rule["check_type"])
                    or f"no detector yet; needs {', '.join(rule['required_features'])}"]
    else:
        try:
            evidence = detector_fn(view)
            state = "candidate" if isinstance(evidence, Candidates) and evidence else ("hit" if evidence else "clear")
        except FeatureUnavailable as e:
            state, evidence = "unknown", [str(e)]

    decision, decision_lines = _decision_signal(view, rule["rule_id"])
    answer = (review or {}).get("rules", {}).get(rule["rule_id"])
    agent = _agent_signal(answer)
    outcome, sources, contradicting = merge(state, decision, agent)

    finding.outcome = outcome
    finding.sources = sources
    finding.signals = {"detector": state,
                       "decisions": {"answer": decision, "evidence": decision_lines} if decision is not None else None,
                       "agent": ({k: answer[k] for k in ("outcome", "confidence", "rationale", "dropped_quotes",
                                                          "downgraded") if k in answer} if answer else None)}
    disagreement = {"agent": f"reviewer says not_triggered: {(answer or {}).get('rationale', '')}",
                    "decisions": f"{'; '.join(decision_lines)} (below {SIGNAL_THRESHOLD})"}
    finding.conflicts = [{"source": s, "detail": disagreement[s]} for s in contradicting]

    # Evidence keeps the detector lines (or the reason it could not run) and adds what the other layers saw.
    lines = list(evidence)
    if state == "candidate" and outcome != Outcome.NEEDS_REVIEW:
        lines = [f"unconfirmed candidate: {e}" for e in evidence]
    if "decisions" in sources:
        lines += decision_lines
    agent_quotes = answer.get("quotes", []) if answer and "agent" in sources else []
    lines += [f"{_ts(q.get('t'))} agent: «{q['text']}»" for q in agent_quotes]
    finding.evidence = lines

    detector_quoted = "detector" in sources and outcome == Outcome.NEEDS_REVIEW
    quotes = [q for q in (_quote(e) for e in evidence) if q] if detector_quoted else []
    for q in agent_quotes:
        if all(q["text"] != have["text"] for have in quotes):
            quotes.append({"text": q["text"], "t": q.get("t")})
    finding.quotes = quotes

    used = view.used  # detector inputs plus any decision.* predicate read above
    finding.inputs = list(used)
    finding.mock_dependency = any(f.is_mock_based for f in used.values()) or (
        "agent" in sources and bool((review or {}).get("mock_dependency")))
    return finding


def target_score(findings: list[Finding]) -> float | None:
    counted = [f for f in findings if f.counted and f.outcome != Outcome.NOT_APPLICABLE]
    if not any(f.outcome != Outcome.UNKNOWN for f in counted):
        return None
    return max(0.0, 100.0 - sum(PENALTY[f.severity] for f in counted if f.outcome == Outcome.NEEDS_REVIEW))


def applicable_rules(targets=DEFAULT_TARGETS) -> list[dict]:
    """Baseline rules that apply to at least one of the targets, with the targets they apply to."""
    out = []
    for rule in load_baseline()["rules"]:
        hit = [t for t in targets if _applies(rule, t)]
        if hit:
            out.append({"rule_id": rule["rule_id"], "summary_en": rule["summary_en"], "severity": rule["severity"],
                        "source_url": rule["source_url"], "targets": hit,
                        "counted": not rule["verification_status"].startswith("provisional")})
    return out


def applicable_rules_feature(targets=DEFAULT_TARGETS) -> FeatureMap:
    """policy.applicable_rules: the rule list itself (no content judged), so Decisions P01/P04 can read it."""
    version = load_baseline()["manifest"]["version"]
    return {"policy.applicable_rules": Feature(applicable_rules(targets), SourceStatus.INFERRED,
                                               f"policy_baseline_v{version}", [f"targets: {', '.join(targets)}"])}


def evaluate(features: FeatureMap, mode: Mode, targets=DEFAULT_TARGETS, review: dict | None = None) -> dict:
    baseline = load_baseline()
    result = {}
    for target in targets:
        findings = [check_rule(r, target, features, mode, review) for r in baseline["rules"]]
        findings = [f for f in findings if f.outcome != Outcome.NOT_APPLICABLE]
        score = target_score(findings)
        needs = any(f.outcome == Outcome.NEEDS_REVIEW and f.counted for f in findings)
        verdict = "needs_review" if needs else ("unknown" if score is None else "no_issue_detected")
        result[target] = {"score": score, "verdict": verdict, "findings": findings}
    return result


def policy_features(features: FeatureMap, mode: Mode, targets=DEFAULT_TARGETS, client=None,
                    cache_dir: Path | None = None, on_progress: Progress = no_progress) -> FeatureMap:
    """policy.score (lowest target score), policy.findings and policy.applicable_rules, all INFERRED.

    `client` (OpenAI client or None) allows one paid policy-reviewer call; a cached review is used either way.
    Decisions predicates are read from `features`, so ask Decisions before calling this.
    `on_progress` is told when the reviewer call is sent / answered (core.trace.Progress).
    """
    from sources import policy_reviewer  # local: sources imports core, not the other way at module load

    rules = [r for r in load_baseline()["rules"] if any(_applies(r, t) for t in targets)]
    review = policy_reviewer.review(rules, features, mode, client, cache_dir or policy_reviewer.CACHE_DIR,
                                    on_progress=on_progress)
    result = evaluate(features, mode, targets, review)
    scores = [t["score"] for t in result.values() if t["score"] is not None]
    counted = [f for t in result.values() for f in t["findings"] if f.counted]
    inputs = sorted({i for f in counted for i in f.inputs})
    mock = any(f.mock_dependency for f in counted if f.outcome != Outcome.UNKNOWN)
    version = load_baseline()["manifest"]["version"]
    report = {
        "baseline_version": version,
        "targets": {name: {**t, "findings": [asdict(f) for f in t["findings"]]} for name, t in result.items()},
        "reviewer": {k: review.get(k) for k in ("status", "reason", "model", "cache_key", "usage")
                     if review.get(k) is not None},
    }
    source = f"policy_baseline_v{version}"
    findings = Feature(report, SourceStatus.INFERRED, source, input_sources=inputs, mock_dependency=mock)
    out = {"policy.findings": findings, **applicable_rules_feature(targets)}
    if not scores:
        return {**out, "policy.score": Feature.missing("every applicable policy rule is unknown")}
    out["policy.score"] = Feature(min(scores), SourceStatus.INFERRED, source, input_sources=inputs, mock_dependency=mock)
    return out
