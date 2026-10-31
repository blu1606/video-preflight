"""Read-only data adapters, never execute imported dataset helper scripts."""
import hashlib
import json
from pathlib import Path

DATASETS = {
    "shops": ("Shop tham chiếu", "shopee_seed/seed.json", "shops", "MOCK"),
    "skus": ("SKU tham chiếu", "shopee_seed/seed.json", "skus", "MOCK"),
    "outcomes": ("Hiệu suất tham chiếu", "shopee_seed/seed.json", "videos", "MOCK"),
    "market": ("Snapshot thị trường", "market/market_snapshots.json", None, "imported_unverified"),
    "audience": ("Audience theo SKU", "sku_audience/sku_audience.json", None, "imported_unverified"),
    "decisions": ("Bộ câu hỏi Decisions", "decisions_v1/decision_question_bank.json", "questions", "human_defined_rubric"),
    "policy": ("Baseline Policy", "policy_baseline_v01/rules.json", "rules", "imported_not_reverified"),
    "platforms": ("Thông số nền tảng", "platform_specs_v1/platform_specs.json", "specs", "imported_not_reverified"),
    "calibration": ("Các mốc hiệu chỉnh", "calibration_v0.json", "constants", "provisional_or_source_documented"),
}


def read_dataset(root, key):
    if key not in DATASETS:
        raise FileNotFoundError("Không có bộ dữ liệu này")
    title, relative, section, status = DATASETS[key]
    path = Path(root) / "data" / "fixtures" / relative
    if not path.is_file():
        return {"id": key, "name": title, "file": f"data/fixtures/{relative}", "status": "missing", "total": 0, "items": []}
    try:
        content = path.read_bytes()
        data = json.loads(content)
        items = data[section] if section else data
        if not isinstance(items, (list, dict)):
            raise ValueError("Dataset section must be a list or object")
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, ValueError):
        return {"id": key, "name": title, "file": f"data/fixtures/{relative}", "status": "invalid", "total": 0, "items": [],
                "error": "Không đọc được JSON hoặc thiếu cấu trúc dữ liệu yêu cầu; các dữ liệu khác vẫn dùng được."}
    if isinstance(items, dict):
        items = [{"key": k, "value": v} for k, v in items.items()]
    return {"id": key, "name": title, "file": f"data/fixtures/{relative}", "status": status,
            "sha256": hashlib.sha256(content).hexdigest(), "total": len(items), "items": items,
            "provenance": {"import_commit": "9289181", "import_date": "2026-10-31", "document": "docs/data-layout.md",
                           "note": "Tài sản nhập từ archive, không phải lượt phân tích mới; giữ nguyên nguồn trong từng bản ghi."}}


def inventory(root):
    return [{k: v for k, v in read_dataset(root, key).items() if k != "items"} for key in DATASETS]


def question_bank(root):
    path = Path(root) / "data" / "fixtures" / "decisions_v1" / "decision_question_bank.json"
    if not path.is_file():
        return None
    data = json.loads(path.read_text())
    ids = set()
    for row in data.get("questions", []):
        if row["id"] in ids or row["question"]["name"] != row["id"] or not row.get("required_features"):
            raise ValueError("Bộ câu hỏi có ID trùng hoặc thiếu điều kiện bằng chứng")
        ids.add(row["id"])
        if row["question"]["type"] == "score":
            levels = row["question"].get("levels", [])
            if len(levels) != 5 or any(not level.get("description") for level in levels):
                raise ValueError("Câu chấm điểm phải có 5 mức được mô tả")
        elif row["question"]["type"] not in ("choice", "predicate"):
            raise ValueError("Loại câu hỏi không được hỗ trợ")
    if len(ids) != 39:
        raise ValueError("Bộ câu hỏi phải có đúng 39 câu theo đặc tả đã chọn")
    return data
