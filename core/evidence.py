from dataclasses import asdict, dataclass, field
from enum import StrEnum
from typing import Any


class Status(StrEnum):
    REAL = "REAL"
    MOCK = "MOCK"
    MISSING = "MISSING"
    INFERRED = "INFERRED"


@dataclass(frozen=True)
class Feature:
    value: Any
    status: Status
    source: str
    evidence: list[dict] = field(default_factory=list)
    reason: str | None = None

    def __post_init__(self):
        if self.status == Status.MISSING and self.value is not None:
            raise ValueError("MISSING must carry a null value")
        if self.status != Status.MISSING and (self.value is None or not self.evidence):
            raise ValueError("Available features need a value and evidence")
        if not self.source:
            raise ValueError("Features need a source")

    def to_dict(self):
        return asdict(self)


def missing(reason):
    return Feature(None, Status.MISSING, "not_available", reason=reason).to_dict()


def observed(value, source, evidence, *, inferred=False):
    return Feature(value, Status.INFERRED if inferred else Status.REAL, source, evidence).to_dict()


REQUIRED_INPUTS = {
    "video.visual_observations": ("Đọc nội dung hình ảnh", "Nối provider vision và lưu frame/timestamp của từng nhận xét."),
    "video.transcript": ("Lời thoại có mốc giờ", "Nối ASR; giữ đoạn lời thoại cùng chất lượng nhận dạng."),
    "sku.listing": ("Thông tin SKU", "Chọn SKU trong shop hoặc nhập listing và nguồn."),
    "market.snapshot": ("Thị trường cùng ngành", "Bổ sung snapshot có query, ngày lấy và file raw."),
    "shop.profile": ("Hồ sơ shop", "Tạo shop trong Kho dữ liệu rồi gắn video."),
    "policy.baseline": ("Baseline Policy", "Bổ sung bộ rule chính thức theo nền tảng và ngày xác minh."),
    "decisions.question_bank": ("Bộ câu hỏi Decisions", "Bổ sung đúng bộ 39 câu, 5 mức và điều kiện đủ dữ liệu."),
}


def missing_inputs(features):
    return [{"key": key, "title": title, "how": how}
            for key, (title, how) in REQUIRED_INPUTS.items()
            if features.get(key, {}).get("status", "MISSING") == "MISSING"]
