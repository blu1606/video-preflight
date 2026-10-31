"""Background music of a video: which song it is (ShazamIO, free).

A 12 s window of the video's audio, cut with ffmpeg, first at the start and then in the middle; the first window
Shazam matches gives the title and artist. ShazamIO calls Shazam's unofficial web API: no key, no SLA, it can change
or be blocked. No match: status no_match.

Cache: output/music/<video_stem>.json holds the identify result of one video. Errors are never cached, so the next
run retries them.
"""

import asyncio
import json
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

from shazamio import Shazam

from core.trace import Progress, no_progress

DEMO = Path(__file__).resolve().parents[1]
CACHE_DIR = DEMO / "output" / "music"
TOOL = "ShazamIO (unofficial Shazam API)"
WINDOW_SEC = 12.0  # the window Shazam clients send; Shazam answers no match from 15 s up
RECOGNIZE_TIMEOUT_SEC = 60.0


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _read(path: Path) -> dict | None:
    """Cached record, or None when absent or damaged (a damaged file is a miss, never a crash)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _duration(video: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
                         check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return float(out.stdout.strip())


def _windows(duration: float) -> list[tuple[float, float]]:
    """(start, length) to try in order: the start, then the middle. A short video is one window."""
    length = min(WINDOW_SEC, duration)
    return [(start, length) for start in dict.fromkeys([0.0, max(0.0, (duration - length) / 2)])]


def _cut(video: Path, start: float, length: float, out: Path) -> None:
    subprocess.run(["ffmpeg", "-y", "-ss", f"{start:.2f}", "-t", f"{length:.2f}", "-i", str(video), "-vn",
                    "-ac", "1", "-ar", "16000", str(out)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


async def _identify(video: Path, on_progress: Progress) -> dict:
    duration = _duration(video)
    shazam = Shazam()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            for start, length in _windows(duration):
                on_progress("window", f"Thử đoạn {start:.0f}–{start + length:.0f} s của audio",
                            detail={"start_sec": round(start, 2), "length_sec": round(length, 2)})
                wav = Path(tmp) / f"window-{start:.2f}.wav"
                try:
                    _cut(video, start, length, wav)
                except subprocess.CalledProcessError:
                    return {"status": "no_match", "reason": "không cắt được audio (video có thể không có tiếng)"}
                answer = await asyncio.wait_for(shazam.recognize(str(wav)), RECOGNIZE_TIMEOUT_SEC)
                track = answer.get("track") or {}
                if track.get("title"):
                    return {"status": "matched", "title": track["title"], "artist": track.get("subtitle") or None,
                            "shazam_url": track.get("url") or None,
                            "matched_window": {"start_sec": round(start, 2),
                                               "end_sec": round(start + length, 2)}}
    finally:
        await shazam.close()
    return {"status": "no_match", "reason": "Shazam không nhận diện được đoạn nào của video"}


def identify(video: Path, on_progress: Progress = no_progress) -> dict:
    """Shazam result of one video. Never raises: a failure is status error."""
    base = {"tool": TOOL, "checked_at": _now(), "video_file": str(video)}
    try:
        return {**base, **asyncio.run(_identify(video, on_progress))}
    except Exception as e:  # ffmpeg, network or Shazam failure: the run keeps going without music
        return {**base, "status": "error", "reason": f"{type(e).__name__}: {e}"}


def run(video: Path, on_progress: Progress = no_progress) -> dict:
    """Music record of one video: identify (cached or free). Never raises."""
    path = CACHE_DIR / f"{video.stem}.json"
    record = _read(path)
    if record is None:
        on_progress("identify", "Nhận diện nhạc nền (ShazamIO)")
        record = identify(video, on_progress)
        if record["status"] != "error":
            _write(path, record)
    return record
