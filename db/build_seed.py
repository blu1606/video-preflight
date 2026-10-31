"""Reproducible empty database. Existing data is never overwritten by startup."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def initialize(target=ROOT / "db" / "db.json"):
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        return False
    with os.fdopen(descriptor, "w") as handle:
        handle.write((ROOT / "db" / "template.json").read_text())
    return True


if __name__ == "__main__":
    created = initialize()
    print("Đã khởi tạo DB trống" if created else "Giữ DB hiện có")
    print(json.dumps({"shops": 0, "skus": 0, "videos": 0, "synthetic_records_generated": 0}) if created else "Không thay đổi dữ liệu")
