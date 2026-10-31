"""Committed extraction caches, copied to a temp dir: loading one may write sibling caches (pacing) next to it."""

import atexit
import shutil
import tempfile
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures"
_TMP = Path(tempfile.mkdtemp(prefix="features-"))
atexit.register(shutil.rmtree, _TMP, ignore_errors=True)


def cached_features(name: str) -> Path:
    copy = _TMP / name
    if not copy.exists():
        shutil.copy(FIXTURES / name, copy)
    return copy
