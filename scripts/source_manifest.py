"""Snapshot owned source bytes; this is not independent proof of authorship."""
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OWNED_PREFIXES = ("core/", "web/src/", "tests/", "scripts/", "db/")
OWNED_FILES = {"api.py", "pyproject.toml", "uv.lock", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".python-version", "web/package.json", "web/vite.config.ts", "web/index.html"}


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def snapshot():
    names = sorted(set(git("ls-files", "--cached", "--others", "--exclude-standard").splitlines()))
    files = []
    for name in names:
        path = ROOT / name
        if path.is_file() and (name.startswith(OWNED_PREFIXES) or name in OWNED_FILES):
            files.append({"path": name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size})
    return {"recorded_at": datetime.now(timezone.utc).isoformat(), "head_before_snapshot": git("rev-parse", "HEAD"),
            "baseline_head": "40eae065dea7e9aa9a61e03f4bdad80f4287db11",
            "scope": "Application sources; includes parallel frontend scaffold imported through this repo's own Git history.",
            "data_manifest": "data/import-manifest.tsv", "files": files,
            "limitations": "Local SHA-256 record only; does not certify creation time, originality or hackathon eligibility."}


if __name__ == "__main__":
    result = snapshot()
    target = ROOT / "docs/evidence/source-snapshot.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"Recorded {len(result['files'])} application files in {target.relative_to(ROOT)}")
