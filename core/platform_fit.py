"""Platform spec fit: a checklist of one video against the official platform specs (fixtures/platform_specs_v1).

Not a score and not mixed into one. Each check has one status:
  pass        measured, inside the official limit or recommendation
  fail        measured, outside a hard limit
  tip         measured, outside a soft recommendation
  unverified  no usable official value: not_found, login_required, quote not found on its page, a conflict on
              a hard limit, or a unit that is not clear (shown as written, never judged)
  unmeasured  the official value exists but the pipeline cannot measure the video for it (e.g. no song identified)
Values are read from the curated spec file only; nothing is assumed when a value is missing.
Music checks: an identified song fills `measured`; the status stays unverified because rights are never decided here.
A spot check that did not match its page is never shown as a source.
"""

import json
from collections import namedtuple
from functools import lru_cache
from math import gcd
from pathlib import Path

from core.schema import FeatureMap

SPECS_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "platform_specs_v1" / "platform_specs.json"
STATUSES = ("pass", "fail", "tip", "unverified", "unmeasured")

# publishing target -> (platform, placement) of the spec records it reads
TARGET_PLACEMENTS = {
    "tiktok_shop_video": ("tiktok_shop", "shoppable_video"),
    "tiktok_ads": ("tiktok_ads", "in_feed_ads"),
    "shopee_listing": ("shopee", "product_video"),
    "meta_ads": ("meta", "feed_video_ads"),
}
# measured name -> feature key (providers: VideoFeatureProvider)
MEASURES = {
    "duration": "video.duration_sec",
    "width": "video.width_px",
    "height": "video.height_px",
    "size": "video.file_size_bytes",
    "container": "video.container",
    "clear": "video.product_first_clear_sec",
    "music": "video.music",  # ShazamIO match (sources/music.py); shown as a fact, never a rights verdict
}
RATIO_TOLERANCE = 0.01  # |width/height - 9/16| allowed for the 9:16 check
MB = 1_000_000  # "500 MB" is read as decimal megabytes, the stricter reading

Check = namedtuple("Check", "id label kind specs rule measures", defaults=((),))  # specs: fields under the placement


def _ratio(w: int, h: int) -> str:
    d = gcd(w, h) or 1
    return f"{w // d}:{h // d}"


def _sec(v: float) -> str:
    return f"{v:g} s"


def _sec_min(v, r):
    return v["duration"] >= r[0]["value"], _sec(v["duration"])


def _sec_max(v, r):
    return v["duration"] <= r[0]["value"], _sec(v["duration"])


def _sec_in(v, r):
    lo, hi = r[0]["value"]
    return lo <= v["duration"] <= hi, _sec(v["duration"])


def _sec_min_max(v, r):
    return r[0]["value"] <= v["duration"] <= r[1]["value"], _sec(v["duration"])


def _ratio_916(v, r):
    w, h = v["width"], v["height"]
    return abs(w / h - 9 / 16) <= RATIO_TOLERANCE, _ratio(w, h)


def _box_min_portrait(v, r):
    w, h = v["width"], v["height"]
    if w > h:  # the official minimum is written for vertical frames only
        return None, f"{w}×{h} px: quy định chỉ nêu cho khung dọc"
    min_w, min_h = r[0]["value"]
    return w >= min_w and h >= min_h, f"{w}×{h} px"


def _box_max(v, r):
    max_w, max_h = r[0]["value"]
    return v["width"] <= max_w and v["height"] <= max_h, f"{v['width']}×{v['height']} px"


def _box_between(v, r):
    (min_w, min_h), (max_w, max_h) = r[0]["value"], r[1]["value"]
    w, h = v["width"], v["height"]
    return min_w <= w <= max_w and min_h <= h <= max_h, f"{w}×{h} px"


def _min_side(v, r):
    return min(v["width"], v["height"]) >= r[0]["value"], f"{min(v['width'], v['height'])} px (cạnh ngắn)"


def _mb_max(v, r):
    return v["size"] <= r[0]["value"] * MB, f"{v['size'] / MB:.1f} MB"


def _format_in(v, r):
    return v["container"] in r[0]["value"], f".{v['container']}"


def _product_clear(v, r):
    return v["clear"] <= r[0]["value"], _sec(v["clear"])


RULES = {
    "sec_min": _sec_min, "sec_max": _sec_max, "sec_in": _sec_in, "sec_min_max": _sec_min_max,
    "ratio_916": _ratio_916, "box_min_portrait": _box_min_portrait, "box_max": _box_max,
    "box_between": _box_between, "min_side": _min_side, "mb_max": _mb_max, "format_in": _format_in,
    "product_clear": _product_clear,
}

CHECKS = {
    "tiktok_shop_video": [
        Check("shop.duration", "Độ dài video", "hard", ("duration_min", "duration_max"), "sec_min_max", ("duration",)),
        Check("shop.duration_rec", "Độ dài khuyến nghị", "soft", ("duration_recommended",), "sec_in", ("duration",)),
        Check("shop.aspect", "Tỷ lệ khung 9:16", "soft", ("aspect_ratio_recommended",), "ratio_916",
              ("width", "height")),
        Check("shop.resolution", "Độ phân giải", "hard", ("resolution_min", "resolution_max"), "box_between",
              ("width", "height")),
        Check("shop.file_size", "Dung lượng file", "hard", ("file_size_max",), "mb_max", ("size",)),
        Check("shop.file_format", "Định dạng file", "hard", ("file_format",), "format_in", ("container",)),
        Check("shop.product_clear", "Sản phẩm rõ trong 5 giây đầu", "soft", ("hook_first_seconds",), "product_clear",
              ("clear",)),
        Check("shop.music", "Nhạc: chỉ dùng CML với tài khoản shop", "hard", ("music", "music_violation"), "music"),
    ],
    "tiktok_ads": [
        Check("ads.duration_min", "Độ dài tối thiểu (đấu giá Non-Spark)", "hard", ("duration_min.auction_non_spark",),
              "sec_min", ("duration",)),
        Check("ads.duration_max", "Độ dài tối đa (đấu giá Non-Spark)", "hard", ("duration_max.auction_non_spark",),
              "sec_max", ("duration",)),
        Check("ads.duration_rec_reservation", "Độ dài khuyến nghị (Reservation / R&F)", "soft",
              ("duration_recommended.reservation",), "sec_in", ("duration",)),
        Check("ads.duration_rec_smb", "Độ dài khuyến nghị (tài liệu SMB, nghiên cứu 2021)", "soft",
              ("duration_recommended.smb_tip_sheet",), "sec_in", ("duration",)),
        Check("ads.aspect", "Tỷ lệ khung 9:16", "soft", ("aspect_ratio_recommended",), "ratio_916",
              ("width", "height")),
        Check("ads.resolution", "Độ phân giải tối thiểu (khung dọc)", "hard", ("resolution_min.auction_vertical",),
              "box_min_portrait", ("width", "height")),
        Check("ads.resolution_rec", "Độ phân giải khuyến nghị 720p", "soft", ("resolution_recommended",), "min_side",
              ("width", "height")),
        Check("ads.file_size", "Dung lượng file", "hard", ("file_size_max.auction_non_spark",), "mb_max", ("size",)),
        Check("ads.file_format", "Định dạng file", "hard", ("file_format.auction_non_spark",), "format_in",
              ("container",)),
        Check("ads.product_clear", "Sản phẩm rõ trong 6 giây đầu", "soft", ("hook_first_seconds",), "product_clear",
              ("clear",)),
        Check("ads.music", "Nhạc: CML hoặc nhạc có giấy phép thương mại", "hard", ("music",), "music"),
    ],
    "shopee_listing": [
        Check("shopee.duration", "Độ dài video", "hard", ("duration_min", "duration_max"), "sec_min_max",
              ("duration",)),
        Check("shopee.resolution", "Độ phân giải tối đa", "hard", ("resolution_max",), "box_max", ("width", "height")),
        Check("shopee.file_size", "Dung lượng tối đa", "hard", ("file_size_max",), "mb_max", ("size",)),
        Check("shopee.file_format", "Định dạng MP4", "hard", ("file_format",), "format_in", ("container",)),
        Check("shopee.aspect", "Tỷ lệ khung 9:16", "soft", ("aspect_ratio_recommended",), "ratio_916",
              ("width", "height")),
        Check("shopee.product_clear", "Sản phẩm rõ ở đầu video", "soft", ("hook_first_seconds",), "product_clear",
              ("clear",)),
        # the music rule is written for Shopee Video, not for the product_video placement this target reads
        Check("shopee.music", "Nhạc / bản quyền", "hard", ("shopee.shopee_video.music",), "music"),
    ],
    "meta_ads": [
        Check("meta.duration", "Độ dài video", "hard", ("duration_min", "duration_max"), "sec_min_max", ("duration",)),
        Check("meta.duration_rec", "Độ dài khuyến nghị", "soft", ("duration_recommended",), "sec_in", ("duration",)),
        Check("meta.aspect", "Tỷ lệ khung 9:16", "soft", ("aspect_ratio_recommended",), "ratio_916",
              ("width", "height")),
        Check("meta.resolution", "Độ phân giải", "hard", ("resolution_min", "resolution_max"), "box_between",
              ("width", "height")),
        Check("meta.file_size", "Dung lượng file", "hard", ("file_size_max",), "mb_max", ("size",)),
        Check("meta.file_format", "Định dạng file", "hard", ("file_format",), "format_in", ("container",)),
        Check("meta.product_clear", "Sản phẩm rõ ở đầu video", "soft", ("hook_first_seconds",), "product_clear",
              ("clear",)),
    ],
}

NOT_USABLE = {
    "not_found": "không tìm thấy trong tài liệu chính thức đã thu thập",
    "login_required": "trang yêu cầu đăng nhập, chưa đọc được",
}


@lru_cache(maxsize=1)
def load_specs() -> dict:
    return json.loads(SPECS_PATH.read_text(encoding="utf-8"))


def _gap(spec: dict | None, kind: str) -> str | None:
    """Why a spec cannot drive pass/fail; None when it can."""
    if spec is None:
        return "không có trong bộ thông số"
    if spec["status"] in NOT_USABLE:
        return NOT_USABLE[spec["status"]]
    if spec.get("spot_check") in ("not_matched", "unreachable"):
        return "trích dẫn không khớp trang khi kiểm tra lại"
    if spec.get("ambiguous_unit"):
        return "đơn vị không rõ: hiển thị nguyên văn, không đạt/không đạt"
    if spec.get("conflict") and kind == "hard":
        return "hai nguồn chính thức mâu thuẫn trên giới hạn bắt buộc"
    return None


def _sources(rows: list[dict | None]) -> list[dict]:
    """Official sources of the rows; a quote that did not match its page is never shown as a source."""
    out, seen = [], set()
    for s in rows:
        if not s or not s.get("source_url") or s.get("spot_check") in ("not_matched", "unreachable"):
            continue
        if (s["source_url"], s.get("quote")) not in seen:
            seen.add((s["source_url"], s.get("quote")))
            out.append({"url": s["source_url"], "title": s.get("page_title"), "quote": s.get("quote"),
                        "accessed": s.get("accessed"), "kind": "official"})
    return out


def _value(features: FeatureMap, key: str):
    return features[key].value if key in features else None


PLATFORM_KEYS = tuple(f"{p}." for p in ("tiktok_shop", "tiktok_ads", "shopee", "meta"))
MUSIC_NOTE = "Kiểm nhạc trong Commercial Music Library của app TikTok trước khi đăng."
TIKTOK_MUSIC_CHECKS = ("shop.music", "ads.music")


def _spec_key(prefix: str, field: str) -> str:
    """A field is under the target's placement, unless it names a full spec key of another placement."""
    return field if field.startswith(PLATFORM_KEYS) else f"{prefix}.{field}"


def _music(row: dict, gap: str | None, features: FeatureMap) -> dict:
    """An identified song is shown as a fact; the rights verdict stays unverified (the pipeline never decides
    rights), so this check never passes or fails."""
    track = _value(features, MEASURES["music"])
    if not track:
        return {**row, "status": "unverified" if gap else "unmeasured",
                "note": gap or "chưa nhận diện được nhạc trong video"}
    name = " — ".join(x for x in (track.get("title"), track.get("artist")) if x)
    note = "chưa xác minh quyền sử dụng"
    if row["id"] in TIKTOK_MUSIC_CHECKS:
        note = f"{note}. {MUSIC_NOTE}"
    return {**row, "status": "unverified", "measured": name, "note": note}


def _evaluate(check: Check, specs: dict, prefix: str, features: FeatureMap) -> dict:
    rows = [specs.get(_spec_key(prefix, f)) for f in check.specs]
    row = {"id": check.id, "label": check.label, "kind": check.kind,
           "spec": " · ".join(s["display"] for s in rows if s) or "—", "measured": None,
           "sources": _sources(rows), "note": None}
    gap = next((g for g in (_gap(s, check.kind) for s in rows) if g), None)
    if check.rule == "music":
        return _music(row, gap, features)
    if gap:
        return {**row, "status": "unverified", "note": gap}
    values = {m: features[MEASURES[m]].value if MEASURES[m] in features else None for m in check.measures}
    missing = [m for m, v in values.items() if v is None]
    if missing:
        return {**row, "status": "unmeasured", "note": f"thiếu số đo: {', '.join(missing)}"}
    ok, measured = RULES[check.rule](values, rows)
    row["measured"] = measured
    if ok is None:
        return {**row, "status": "unverified", "note": measured}
    status = "pass" if ok else ("fail" if check.kind == "hard" else "tip")
    return {**row, "status": status}


def _summary(checks: list[dict]) -> dict:
    return {s: sum(c["status"] == s for c in checks) for s in STATUSES}


def evaluate(features: FeatureMap, specs: dict | None = None) -> dict:
    """Per publishing target: its checks and a status summary. Pure: features and specs in, dict out."""
    specs = specs or load_specs()
    targets = {}
    for target, (platform, placement) in TARGET_PLACEMENTS.items():
        prefix = f"{platform}.{placement}"
        checks = [_evaluate(c, specs["specs"], prefix, features) for c in CHECKS[target]]
        targets[target] = {"checks": checks, "summary": _summary(checks)}
    all_checks = [c for t in targets.values() for c in t["checks"]]
    return {"version": specs["version"], "specs_collected_at": specs["provenance"]["collected_on"],
            "targets": targets, "summary": _summary(all_checks)}
