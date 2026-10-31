"""Where on the frame each timeline issue is: one VLM call that boxes the localizable issues.

Only issues with a visual basis are sent (`localizable` on the marker, see core.markers). A moment is checked on the
frames at t-1, t and t+1 (1 fps); a window or the whole video is checked on one contact sheet of every sampled frame,
labelled with its second. The model picks the second, a box or null, and what is visible and what to change there.
Boxes are estimates and are labelled that way in the UI. The safe-zone check is arithmetic on an estimate of the
app's overlays (APP_OVERLAYS_PX_ESTIMATE), not a platform rule.
Answers are cached per markers + video bytes + model + PROMPT_VERSION, so a re-run of the same video never pays twice.
"""

import base64
import hashlib
import json
import re
from collections.abc import Callable
from pathlib import Path

import cv2
import numpy as np

from core.trace import Progress, no_progress
from sources.extractor import CACHE_DIR, ensure_frames, frames_dir, video_fingerprint

PROMPT_VERSION = "2"
MAX_MARKERS = 8
MIN_CONFIDENCE = 0.4
MAX_TEXT = 220
MAX_LABEL = 60
SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2, "info": 3}
GRID_COLS = 6
CELL_W = 160

# Overlays of the app over the video, in px of the phone screen (402 x 874, web/src/studio/mockup-v2.css): the
# feed top bar, the right action rail, the caption and sound line, the product card and the bottom tab bar.
# Estimate from the app frame; the platform publishes no fixed px safe zone. Status placeholder.
SCREEN_PX = (402, 874)
APP_OVERLAYS_PX_ESTIMATE = {
    "thanh trên": (0, 0, 402, 107),
    "cột nút bên phải": (330, 360, 402, 764),
    "caption và nhạc": (12, 648, 326, 778),
    "thẻ sản phẩm": (14, 630, 328, 678),
    "thanh điều hướng dưới": (0, 790, 402, 874),
}
OVERLAP_MIN = 0.25  # share of a box's area under one overlay before the check names it
SAFE_ZONE_STATUS = "placeholder"

SYSTEM_PROMPT = """You locate and explain issues on frames of a short e-commerce video.
Each marker is one issue. A marker with frames gets those frames (seconds given): pick the second where the issue
is clearest. A marker with a contact sheet gets the sheet (one low-detail grid, every sampled second labelled on it):
pick the second from its labels and estimate the box coarsely.
Return the box of the issue on the chosen frame as [x, y, w, h], normalized to 0-1 (origin top-left). Use null when
the issue is not visible on the frame. Never box a spoken claim.
Write in Vietnamese: label (at most 6 words), observation (one sentence: what is visible at that spot) and fix_here
(one sentence: what to change at this spot). confidence is 0-1.
Answer JSON only: {"regions": [{"marker_id": "...", "frame_sec": number, "box": [x, y, w, h] or null,
"label": "...", "observation": "...", "fix_here": "...", "confidence": 0-1}]}"""


def targets(markers: list[dict]) -> list[dict]:
    issues = [m for m in markers if m["kind"] == "issue" and m.get("localizable")]
    return sorted(issues, key=lambda m: (SEVERITY_RANK.get(m["severity"], 9), m["t_start"]))[:MAX_MARKERS]


def sampled_frames(video: Path) -> list[tuple[float, Path]]:
    return sorted((float(p.stem), p) for p in frames_dir(video).glob("*.jpg"))


def nearest_frame(video: Path, sec: float) -> tuple[float, Path] | None:
    frames = sampled_frames(video)
    return min(frames, key=lambda f: abs(f[0] - sec)) if frames else None


def moment_frames(video: Path, t: float) -> list[tuple[float, Path]]:
    """The frames at t-1, t and t+1 (nearest sampled seconds, no repeats)."""
    found = {}
    for at in (t - 1, t, t + 1):
        hit = nearest_frame(video, max(0.0, at))
        if hit:
            found[hit[0]] = hit[1]
    return sorted(found.items())


def contact_sheet(frames: list[tuple[float, Path]]) -> bytes:
    """One JPEG grid of the frames, each cell labelled with its second (OpenCV, no API)."""
    images = [(sec, img) for sec, img in ((s, cv2.imread(str(p))) for s, p in frames) if img is not None]
    if not images:
        raise ValueError("no readable frames for the contact sheet")
    h0, w0 = images[0][1].shape[:2]
    cell_h = round(h0 * CELL_W / w0)
    rows = -(-len(images) // GRID_COLS)
    sheet = np.zeros((rows * cell_h, GRID_COLS * CELL_W, 3), np.uint8)
    for i, (sec, img) in enumerate(images):
        r, c = divmod(i, GRID_COLS)
        cell = cv2.resize(img, (CELL_W, cell_h), interpolation=cv2.INTER_AREA)
        cv2.rectangle(cell, (0, 0), (52, 18), (0, 0, 0), -1)
        cv2.putText(cell, f"{sec:g}s", (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
        sheet[r * cell_h:(r + 1) * cell_h, c * CELL_W:(c + 1) * CELL_W] = cell
    ok, buf = cv2.imencode(".jpg", sheet, [cv2.IMWRITE_JPEG_QUALITY, 80])
    if not ok:
        raise ValueError("contact sheet could not be encoded")
    return buf.tobytes()


def allowed_seconds(video: Path, picked: list[dict]) -> dict[str, list[float]]:
    """The seconds each marker may answer with: its moment frames, or every sampled second for a window."""
    everything = [s for s, _ in sampled_frames(video)]
    return {m["id"]: [s for s, _ in moment_frames(video, m["t_start"])] if m.get("precise", True) else everything
            for m in picked}


def _image_part(jpeg: bytes) -> dict:
    return {"type": "image_url", "image_url": {
        "url": f"data:image/jpeg;base64,{base64.b64encode(jpeg).decode()}", "detail": "high"}}


def request_content(video: Path, picked: list[dict]) -> list[dict]:
    content, coarse = [], []
    for m in picked:
        if not m.get("precise", True):
            coarse.append(m)
            continue
        frames = moment_frames(video, m["t_start"])
        seconds = ", ".join(f"{s:g}s" for s, _ in frames)
        content.append({"type": "text", "text": f"marker_id={m['id']} · issue: {m['title']} — {m['comment']} "
                                                f"· frames at {seconds}"})
        for sec, path in frames:
            content.append({"type": "text", "text": f"frame at {sec:g}s"})
            content.append(_image_part(path.read_bytes()))
    if coarse:
        lines = "\n".join(f"marker_id={m['id']} · issue: {m['title']} — {m['comment']}" for m in coarse)
        content.append({"type": "text", "text": "contact sheet of every sampled frame, each labelled with its second. "
                                                f"For the markers below pick frame_sec from those labels:\n{lines}"})
        content.append(_image_part(contact_sheet(sampled_frames(video))))
    return content


def cache_file(video: Path, picked: list[dict], model: str) -> Path:
    key = json.dumps([[m["id"], m["t_start"], m.get("t_end"), m.get("precise", True), m["title"], m["comment"]]
                      for m in picked] + [video_fingerprint(video), model, PROMPT_VERSION], ensure_ascii=False)
    return CACHE_DIR / f"{video.stem}.localize.{hashlib.sha1(key.encode()).hexdigest()[:16]}.json"


def answer_key(raw, known: list[str]) -> str | None:
    """The known marker id a model answer names. The model may echo the whole prompt line after the id."""
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    hits = [k for k in known if re.match(rf"{re.escape(k)}(?![\w:.-])", text)]
    return max(hits, key=len) if hits else None


def valid_box(box) -> bool:
    return (isinstance(box, list) and len(box) == 4 and all(isinstance(v, (int, float)) for v in box)
            and box[0] >= 0 and box[1] >= 0 and box[2] > 0 and box[3] > 0
            and box[0] + box[2] <= 1.001 and box[1] + box[3] <= 1.001)


def checked_region(answer, allowed: list[float]) -> tuple[dict | None, str]:
    """A model answer as a region, or (None, reason) when any field fails: confidence, frame, box, texts."""
    if not isinstance(answer, dict):
        return None, "answer is not an object"
    conf = answer.get("confidence")
    if isinstance(conf, bool) or not isinstance(conf, (int, float)):
        return None, "no confidence"
    if conf < MIN_CONFIDENCE:
        return None, f"confidence {conf:.2f} < {MIN_CONFIDENCE}"
    sec = answer.get("frame_sec")
    if isinstance(sec, bool) or not isinstance(sec, (int, float)) or not any(abs(sec - a) < 0.01 for a in allowed):
        return None, f"frame_sec {sec!r} was not sent"
    box = answer.get("box")
    if box is not None and not valid_box(box):
        return None, f"box {box!r} is not valid"
    texts = {k: answer.get(k) for k in ("label", "observation", "fix_here")}
    limits = {"label": MAX_LABEL, "observation": MAX_TEXT, "fix_here": MAX_TEXT}
    if any(not isinstance(v, str) or not v.strip() or len(v.strip()) > limits[k] for k, v in texts.items()):
        return None, "label, observation or fix_here is empty or too long"
    return {"box": [round(float(v), 4) for v in box] if box is not None else None, "frame_sec": float(sec),
            "confidence": round(float(conf), 2), **{k: v.strip() for k, v in texts.items()},
            "estimated": True}, ""


def frame_size(video: Path) -> tuple[int, int] | None:
    frames = sampled_frames(video)
    img = cv2.imread(str(frames[0][1])) if frames else None
    return None if img is None else (img.shape[1], img.shape[0])


def covered_by(box: list[float], size: tuple[int, int]) -> list[str]:
    """Names of the app overlays covering more than OVERLAP_MIN of the box.

    The video fills the phone screen with object-fit: cover, so the frame is scaled to the screen's height or width
    and cropped on the other axis; the overlay rectangles are mapped through that crop into frame coordinates.
    """
    fw, fh = size
    sw, sh = SCREEN_PX
    k = max(sw / fw, sh / fh)  # screen px per frame px
    dw, dh = fw * k, fh * k  # the frame as shown before the crop
    ox, oy = (dw - sw) / 2, (dh - sh) / 2
    x, y, w, h = box
    hits = []
    for name, (x0, y0, x1, y1) in APP_OVERLAYS_PX_ESTIMATE.items():
        zx0, zy0 = max(0.0, (x0 + ox) / dw), max(0.0, (y0 + oy) / dh)
        zx1, zy1 = min(1.0, (x1 + ox) / dw), min(1.0, (y1 + oy) / dh)
        iw = min(x + w, zx1) - max(x, zx0)
        ih = min(y + h, zy1) - max(y, zy0)
        if iw > 0 and ih > 0 and iw * ih / (w * h) > OVERLAP_MIN:
            hits.append(name)
    return hits


def read_cache(path: Path) -> dict | None:
    """The cached answer, or None when absent or unreadable (a damaged file is a miss, never a crash)."""
    try:
        cached = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return cached if isinstance(cached, dict) and isinstance(cached.get("regions"), list) else None


def ask(client, model: str, content: list[dict]) -> tuple[list[dict], dict]:
    response = client.chat.completions.create(
        model=model, response_format={"type": "json_object"},
        messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": content}])
    usage = response.usage
    return (json.loads(response.choices[0].message.content).get("regions", []),
            {"prompt_tokens": usage.prompt_tokens if usage else 0,
             "completion_tokens": usage.completion_tokens if usage else 0})


def localize(markers: list[dict], video: Path, model: str,
             client_factory: Callable[[], object] | None = None,
             on_progress: Progress = no_progress) -> tuple[list[dict], dict]:
    """Markers with `region` merged in where the model answered validly, plus a summary for the trace.

    Uses the cache when present; builds a client and calls the model only on a cache miss and only when
    `client_factory` is given (a paid call the caller allowed). Frames are sampled locally when missing.
    `on_progress` (core.trace.Progress) is told when the cache is used and when the call is sent / answered.
    """
    picked = targets(markers)
    if not picked:
        return markers, {"status": "skipped", "reason": "no localizable issue markers"}
    if not video.is_file():
        return markers, {"status": "skipped", "reason": f"video file missing: {video.name}"}
    if not any(frames_dir(video).glob("*.jpg")):
        ensure_frames(video)  # older caches never saved their frames; re-sampling is local, no API
    allowed = allowed_seconds(video, picked)
    if not sampled_frames(video):
        return markers, {"status": "skipped", "reason": "no frames"}
    path = cache_file(video, picked, model)
    cached = read_cache(path)
    if cached:
        raw, source, usage = cached["regions"], "cache", cached.get("token_usage")
        on_progress("cache", "Dùng box đã cache", detail={"markers": len(picked), "file": path.name})
    elif client_factory is not None:
        on_progress("sent", f"Gửi {len(picked)} issue cho {model} để khoanh vùng",
                    detail={"markers": {m["id"]: allowed[m["id"]] for m in picked}, "model": model})
        try:
            raw, usage = ask(client_factory(), model, request_content(video, picked))
            if not isinstance(raw, list):
                raise ValueError(f"expected a list of regions, got {type(raw).__name__}")
        except Exception as e:  # boxes are an extra: a failed call leaves the markers usable without them
            return markers, {"status": "error", "reason": f"{type(e).__name__}: {e}"}
        source = "live call"
        on_progress("received", f"Nhận {len(raw)} vùng", len(raw), len(picked), usage)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"model": model, "regions": raw, "token_usage": usage},
                                   ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        return markers, {"status": "skipped", "reason": "paid call not allowed and no cached regions",
                         "markers": [m["id"] for m in picked]}

    size = frame_size(video)
    by_id = {}
    for r in raw:
        key = answer_key(r.get("marker_id"), list(allowed)) if isinstance(r, dict) else None
        if key is not None:
            by_id.setdefault(key, r)
    out, boxes, no_box, dropped = [], [], [], {}
    for m in markers:
        answer = by_id.get(m["id"])
        if m["id"] not in allowed or answer is None:
            out.append(m)
            continue
        region, reason = checked_region(answer, allowed[m["id"]])
        if region is None:
            dropped[m["id"]] = reason
            out.append(m)
            continue
        region["covered_by"] = covered_by(region["box"], size) if region["box"] is not None and size else []
        (boxes if region["box"] is not None else no_box).append(m["id"])
        out.append({**m, "region": region})
    return out, {"status": "ok", "source": source, "model": model, "file": path.name, "token_usage": usage,
                 "boxes": boxes, "no_box": no_box, "dropped": dropped, "safe_zone": SAFE_ZONE_STATUS}
