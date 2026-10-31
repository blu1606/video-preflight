"""AI quick-fill: one LLM call that drafts a Vietnamese caption + hashtags from the video and its product.

    extracted video features (transcript, claims, product mentions, hook) + attached SKU / listing
    + crawled market keywords -> {caption, hashtags[3..8], rationale}

The draft is checked before use (types, length, hashtag count) and then run through the policy copy
detectors (core.policy_check.scan_post_copy); hits are returned as `policy_flags`, never hidden or rewritten.

Cache: output/caption_suggest/<video_id>.<hash>.json per inputs + model + prompt, so the same request never
pays twice. Only a usable answer is cached. The call itself is the user's explicit action (the endpoint).
"""

import hashlib
import json
import re
from collections.abc import Callable
from pathlib import Path

from core.policy_check import scan_post_copy
from core.schema import FeatureMap, SourceStatus
from sources.providers import clean_hashtags

DEMO = Path(__file__).resolve().parents[1]
CACHE_DIR = DEMO / "output" / "caption_suggest"
PROMPT_VERSION = 1
MIN_HASHTAGS, MAX_HASHTAGS = 3, 8
MAX_CAPTION_CHARS = 2200  # TikTok's caption limit; Shopee Video is shorter but the seller trims it
MAX_TRANSCRIPT_CHARS = 2500
MAX_COMPETITOR_TITLES = 5

SYSTEM_PROMPT = """Bạn viết caption đăng video bán hàng (TikTok Shop, Shopee Video) cho seller Việt Nam.
Bạn nhận JSON gồm nội dung video đã trích xuất (transcript, câu nói nổi bật, sản phẩm được nhắc, hook),
thông tin sản phẩm đang gắn (listing/SKU) và từ khoá thị trường đã cào (nếu có).

Quy tắc:
- Caption tiếng Việt, 1-3 câu ngắn (tối đa khoảng 300 ký tự), giọng tự nhiên như seller nói, có thể có 1-2 emoji.
- Chỉ nói điều có trong video hoặc listing. Không thêm công dụng, thành phần, giá, khuyến mãi, cam kết
  nào mà dữ liệu không có. Không nêu giá nếu listing không có giá.
- Không dùng lời hứa tuyệt đối hoặc phóng đại: 100%, vĩnh viễn, tận gốc, dứt điểm, thần kỳ, cam kết, đảm bảo,
  ngay lập tức, trắng bật tông, rẻ nhất, hot sale, xả kho...
- Không ghi số điện thoại, Zalo, link ngoài sàn, "inbox"/"ib". Không hỏi người xem về bệnh hay khuyết điểm.
- 3-8 hashtag liên quan sản phẩm và ngành hàng, không dấu cách, không ký tự #, ưu tiên từ khoá thị trường đã cho.
- "rationale": 1-2 câu tiếng Việt giải thích caption dựa vào điểm nào của video/listing.

Trả JSON đúng dạng: {"caption": "...", "hashtags": ["..."], "rationale": "..."}"""


def _value(features: FeatureMap, name: str):
    f = features.get(name)
    return None if f is None or f.status == SourceStatus.MISSING else f.value


def _short(text, limit: int):
    if not isinstance(text, str):
        return None
    text = text.strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


def build_inputs(video_id: str, features: FeatureMap, sku: dict | None, listing: dict | None,
                 snapshot: dict | None) -> dict:
    """The JSON the model reads. Only observed values: missing ones are left out, never guessed."""
    video = {
        "transcript": _short(_value(features, "video.transcript"), MAX_TRANSCRIPT_CHARS),
        "hook": _value(features, "video.hook_verbal"),
        "key_claims": _value(features, "video.key_claims"),
        "product_mentions": _value(features, "video.product_mentions"),
        "product_name": _value(features, "video.product_name"),
        "product_category": _value(features, "video.product_category"),
    }
    product = {}
    if sku:
        product.update({"title": sku.get("item_name"), "category": sku.get("category"),
                        "price_vnd": sku.get("price_vnd"), "list_price_vnd": sku.get("original_price_vnd")})
    if listing:  # an uploaded video's own listing (typed or resolved from a Shopee link) wins over the SKU
        product.update({k: v for k, v in {
            "title": listing.get("title") or listing.get("name"), "description": _short(listing.get("description"), 1500),
            "price_vnd": listing.get("price_vnd"), "list_price_vnd": listing.get("list_price_vnd"),
            "category": listing.get("category"), "attributes": listing.get("attributes")}.items() if v not in (None, "")})
    market = None
    if snapshot:
        tiktok = snapshot.get("tiktok") or {}
        category = (((tiktok.get("category") or {}).get("metrics") or {}).get("category") or {}).get("category_name")
        titles = [c["title"] for c in snapshot.get("competitors") or [] if c.get("like_for_like") and c.get("title")]
        market = {"keyword": snapshot.get("keyword"), "tiktok_category": category,
                  "niches": sorted({c["category_l3"] for c in snapshot.get("competitors") or [] if c.get("category_l3")}),
                  "competitor_titles": [_short(t, 120) for t in titles[:MAX_COMPETITOR_TITLES]],
                  "crawled_at": snapshot.get("crawled_at")}
    drop = (None, "", [], {})
    return {"video_id": video_id,
            "video": {k: v for k, v in video.items() if v not in drop},
            "product": {k: v for k, v in product.items() if v not in drop},
            "market": {k: v for k, v in market.items() if v not in drop} if market else None}


def validate(answer) -> tuple[dict | None, str]:
    """(clean {caption, hashtags, rationale}, reason it is unusable)."""
    if not isinstance(answer, dict):
        return None, f"expected a JSON object, got {type(answer).__name__}"
    caption = answer.get("caption")
    if not isinstance(caption, str) or not caption.strip():
        return None, "no caption in the answer"
    if len(caption) > MAX_CAPTION_CHARS:
        return None, f"caption longer than {MAX_CAPTION_CHARS} characters"
    tags = clean_hashtags(answer.get("hashtags"))[:MAX_HASHTAGS]
    if len(tags) < MIN_HASHTAGS:
        return None, f"{len(tags)} hashtags (need {MIN_HASHTAGS}-{MAX_HASHTAGS})"
    rationale = answer.get("rationale")
    return {"caption": caption.strip(), "hashtags": tags,
            "rationale": rationale.strip() if isinstance(rationale, str) else ""}, ""


def cache_file(inputs: dict, model: str) -> Path:
    key = json.dumps([inputs, model, PROMPT_VERSION, SYSTEM_PROMPT], ensure_ascii=False, sort_keys=True, default=str)
    stem = re.sub(r"[^A-Za-z0-9_.-]", "_", str(inputs.get("video_id")))
    return CACHE_DIR / f"{stem}.{hashlib.sha1(key.encode()).hexdigest()[:16]}.json"


def _read_cache(path: Path) -> dict | None:
    try:
        cached = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None  # a damaged file is a miss, never a crash
    clean, _ = validate(cached.get("answer") if isinstance(cached, dict) else None)
    return {**cached, "answer": clean} if clean else None


def suggest(inputs: dict, model: str, client_factory: Callable[[], object]) -> dict:
    """{caption, hashtags, rationale, policy_flags, model, source, token_usage, inputs}.

    Raises ValueError when the model's answer is unusable (nothing is cached then); API errors propagate.
    """
    path = cache_file(inputs, model)
    cached = _read_cache(path)
    if cached:
        clean, source, usage = cached["answer"], "cache", cached.get("token_usage")
    else:
        response = client_factory().chat.completions.create(
            model=model, response_format={"type": "json_object"},
            messages=[{"role": "system", "content": SYSTEM_PROMPT},
                      {"role": "user", "content": json.dumps(inputs, ensure_ascii=False, default=str)}])
        u = response.usage
        usage = {"prompt_tokens": u.prompt_tokens if u else 0, "completion_tokens": u.completion_tokens if u else 0}
        try:
            answer = json.loads(response.choices[0].message.content)
        except (TypeError, ValueError) as e:
            raise ValueError(f"answer is not JSON: {e}") from e
        clean, reason = validate(answer)
        if not clean:
            raise ValueError(f"unusable answer: {reason}")
        source = "live call"
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"model": model, "answer": clean, "token_usage": usage, "inputs": inputs},
                                   ensure_ascii=False, indent=2), encoding="utf-8")
    return {**clean, "policy_flags": scan_post_copy(clean["caption"], clean["hashtags"]), "model": model,
            "source": source, "token_usage": usage, "inputs": inputs, "cache_file": path.name}
