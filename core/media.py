"""Local, bounded FFmpeg extraction. Never downloads or sends media externally."""
import hashlib
import json
import math
import shutil
import subprocess
from pathlib import Path

MAX_BYTES = 50 * 1024 * 1024
MAX_SECONDS = 120
EXTRACT_VERSION = "local-frames-v1"
EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv"}


class MediaError(ValueError):
    pass


def run_local(command, timeout=30):
    if not shutil.which(command[0]):
        raise MediaError(f"Thiếu công cụ {command[0]} trong PATH")
    try:
        return subprocess.run(command, check=True, capture_output=True, text=True, timeout=timeout).stdout
    except subprocess.TimeoutExpired as exc:
        raise MediaError("Đo video quá thời gian cho phép") from exc
    except subprocess.CalledProcessError as exc:
        raise MediaError("Không đọc được video; hãy dùng file MP4/MOV/WebM/MKV hợp lệ") from exc


def sha256(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def probe(path):
    path = Path(path)
    if not 0 < path.stat().st_size <= MAX_BYTES:
        raise MediaError("Video phải lớn hơn 0 và không quá 50 MiB")
    raw = json.loads(run_local(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)]))
    streams = raw.get("streams", [])
    stream = next((s for s in streams if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")), None)
    if not stream:
        raise MediaError("File không có luồng video")
    try:
        duration = float(raw["format"].get("duration", stream.get("duration", 0)))
    except (ValueError, TypeError, KeyError) as exc:
        raise MediaError("Không đo được thời lượng video") from exc
    if not math.isfinite(duration) or not 0 < duration <= MAX_SECONDS:
        raise MediaError("Thời lượng video phải trong khoảng 0–120 giây")
    if not stream.get("width") or not stream.get("height"):
        raise MediaError("Không đo được kích thước video")
    rotation = next((s.get("rotation", 0) for s in stream.get("side_data_list", []) if "rotation" in s), 0)
    width, height = stream["width"], stream["height"]
    if abs(int(rotation)) % 180 == 90:
        width, height = height, width
    return {"duration_s": round(duration, 3), "width": width, "height": height,
            "size_bytes": path.stat().st_size, "format": raw["format"].get("format_name"),
            "codec": stream.get("codec_name"), "has_audio": any(s.get("codec_type") == "audio" for s in streams),
            "sha256": sha256(path), "measured_by": "ffprobe", "rotation_degrees": rotation}


def extract(path, root, metadata, *, force=False, progress=None):
    cache_dir = Path(root) / f'{metadata["sha256"]}-{EXTRACT_VERSION}'
    cache_file = cache_dir / "features.json"
    if cache_file.exists() and not force:
        cached = json.loads(cache_file.read_text())
        if all((cache_dir / f["file"]).is_file() and sha256(cache_dir / f["file"]) == f["sha256"] for f in cached["frames"]):
            return {**cached, "cache": "hit"}
    cache_dir.mkdir(parents=True, exist_ok=True)
    duration = metadata["duration_s"]
    times = sorted({round(min(t, max(0, duration - .05)), 3) for t in [0, 1, 2, 3, duration / 2, duration - 1]})
    frames = []
    for index, sec in enumerate(times):
        name = f"frame-{index:02d}.jpg"
        target = cache_dir / name
        run_local(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(sec), "-i", str(path), "-frames:v", "1",
                   "-vf", "scale=480:480:force_original_aspect_ratio=decrease", "-q:v", "3", str(target)])
        if not target.is_file():
            raise MediaError("Không trích được frame tại mốc đã chọn")
        frames.append({"id": f"frame-{index:02d}", "sec": sec, "file": name, "sha256": sha256(target),
                       "url": f"/py/artifacts/{cache_dir.name}/{name}"})
        if progress:
            progress(index + 1, len(times))
    result = {"version": EXTRACT_VERSION, "media_sha256": metadata["sha256"], "frames": frames,
              "transcript": [], "transcript_status": "not_configured", "cache": "miss", "metadata": metadata}
    temporary = cache_file.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    temporary.replace(cache_file)
    return result
