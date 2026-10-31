"""Pacing from hard shot cuts (OpenCV only, no API call).

Method: sample ~SAMPLE_FPS frames per second, downscale, build an HSV colour histogram per sample and
compare consecutive samples with the Bhattacharyya distance (0 = identical, 1 = disjoint). A distance above
CUT_THRESHOLD is a hard cut. Cuts closer than MIN_SHOT_SEC to the previous cut or to the video end are
dropped (flashes, fade-out frames). Gradual transitions (dissolves, fast zooms) are not detected.

Results are cached as <cache_dir>/<video_stem>.pacing.json so each video is decoded once.
"""

import json
from pathlib import Path

import cv2

SAMPLE_FPS = 10.0
CUT_THRESHOLD = 0.5   # placeholder; on vn-beauty-467796 true cuts score >0.53, in-shot motion <0.45
MIN_SHOT_SEC = 0.5
HIST_BINS = [16, 8, 8]  # H, S, V
SMALL_SIZE = (160, 284)  # analysis resolution (w, h); cut detection does not need full frames
PARAMS = {"sample_fps": SAMPLE_FPS, "cut_threshold": CUT_THRESHOLD, "min_shot_sec": MIN_SHOT_SEC,
          "hist_bins": HIST_BINS}


def _hist(frame):
    hsv = cv2.cvtColor(cv2.resize(frame, SMALL_SIZE, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1, 2], None, HIST_BINS, [0, 180, 0, 256, 0, 256])
    return cv2.normalize(h, h)


def frame_distances(video: Path) -> tuple[float, list[tuple[float, float]]]:
    """Return (duration_sec, [(timestamp_sec, distance to previous sample), ...])."""
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video}")
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        step = max(1, round(fps / SAMPLE_FPS))
        out, prev, i = [], None, 0
        while cap.grab():
            if i % step == 0:
                ok, frame = cap.retrieve()
                if ok:
                    h = _hist(frame)
                    if prev is not None:
                        out.append((i / fps, float(cv2.compareHist(prev, h, cv2.HISTCMP_BHATTACHARYYA))))
                    prev = h
            i += 1
    finally:
        cap.release()
    return i / fps, out


def detect_cuts(distances: list[tuple[float, float]], duration: float) -> list[float]:
    """Pick cut timestamps from per-sample distances (threshold + minimum shot length)."""
    cuts: list[float] = []
    for t, d in distances:
        if d < CUT_THRESHOLD or t > duration - MIN_SHOT_SEC:
            continue
        if t - (cuts[-1] if cuts else 0.0) >= MIN_SHOT_SEC:
            cuts.append(round(t, 2))
    return cuts


def summarize(cuts: list[float], duration: float) -> dict:
    shots = len(cuts) + 1
    return {
        "duration_sec": round(duration, 2),
        "cut_timestamps_sec": cuts,
        "shot_count": shots,
        "avg_shot_sec": round(duration / shots, 2),
        "cuts_per_10s": round(len(cuts) / duration * 10, 2) if duration else 0.0,
    }


def cache_path(video: Path, cache_dir: Path) -> Path:
    return cache_dir / f"{video.stem}.pacing.json"


def analyze_pacing(video: Path, cache_dir: Path) -> dict:
    """Cut detection for one video, read from / written to the pacing cache."""
    path = cache_path(video, cache_dir)
    if path.exists():
        cached = json.loads(path.read_text(encoding="utf-8"))
        if cached.get("params") == PARAMS:
            return cached
    duration, distances = frame_distances(video)
    if duration <= 0:
        raise ValueError(f"Video has no frames: {video}")
    result = {"video_file": str(video), "params": PARAMS, **summarize(detect_cuts(distances, duration), duration)}
    cache_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result
