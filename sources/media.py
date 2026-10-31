"""Where demo video files live: data/<shop_id>/<file>, or data/<file> for videos owned by no shop.

A db row's `local_file` is the path relative to data/ in POSIX form (e.g. `SHOP001/vn-beauty-467796.mp4`),
so the API serves it unchanged at /media/<local_file>.
"""

import re
from pathlib import Path

DEMO = Path(__file__).resolve().parents[1]
DATA_DIR = DEMO / "data"
VIDEO_EXT = {".mp4", ".mov", ".webm", ".mkv"}
_SHOP_ID = re.compile(r"^[A-Za-z0-9_-]+$")


def shop_dir(shop_id: str | None, root: Path = DATA_DIR) -> Path:
    """Folder for a shop's videos (`root` itself when there is no shop). Rejects ids that are not one path segment."""
    if not shop_id:
        return root
    if not _SHOP_ID.match(shop_id):
        raise ValueError(f"invalid shop id for a folder name: {shop_id!r}")
    return root / shop_id


def relative(path: Path, root: Path = DATA_DIR) -> str:
    """`local_file` value of a file under `root`."""
    return path.resolve().relative_to(root.resolve()).as_posix()


def iter_videos(root: Path = DATA_DIR) -> list[Path]:
    """Video files at the root and one level down (the shop folders), sorted for a stable order."""
    files = [*root.glob("*"), *root.glob("*/*")]
    return sorted(p for p in files if p.is_file() and p.suffix.lower() in VIDEO_EXT)


def find_video(name: str, root: Path = DATA_DIR) -> Path | None:
    """A video by bare file name, wherever it sits (root or any shop folder); None when absent."""
    if not name:
        return None
    return next((p for p in iter_videos(root) if p.name == name), None)
