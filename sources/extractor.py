"""Video feature extractor (ported from sandbox.ipynb): frames (OpenCV) + transcript (Whisper) + VLM.

Output has the same shape as notebooks/features.json, so VideoFeatureProvider reads both.
Results are cached per video in demo/output/features/<video_stem>.json to avoid paying for the API twice.
"""

import base64
import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Callable

import cv2
from dotenv import load_dotenv
from openai import OpenAI

from core.trace import Progress, no_progress

DEMO = Path(__file__).resolve().parents[1]
CACHE_DIR = DEMO / "output" / "features"
FRAMES_DIR = DEMO / "output" / "frames"  # JPEGs the VLM saw, served to the lab

load_dotenv(DEMO.parent / ".env")
VISION_MODEL = os.getenv("OPENAI_VISION_MODEL", "gpt-6-luna")
AUDIO_MODEL = "whisper-1"

ECOMMERCE_SYSTEM_PROMPT = """You are an expert E-Commerce & TikTok Ads Analyst.
Your mission is to analyze a short-form e-commerce video given its sampled chronological video frames (with timestamps) and full audio transcript.

You must inspect:
1. Hook (First 1-3 seconds): Visual hook, text overlay hook, problem hook, or curiosity hook.
2. Problem / Pain Point: What skin/body/life problem does the customer face?
3. Solution & Product Demo: How the product is demonstrated, usage steps, sensory appeal (texture, foam, color), before/after evidence.
4. Social Proof & Claims: Testimonials, clinical/usage claims, authenticity tone.
5. Call-to-Action (CTA): TikTok Shop yellow cart mention, flash sale/promotions, urgency.
6. Viral & Conversion Scoring (1-100 rubric) based on TikTok UGC best practices.
7. Policy signals (for platform ad/content policy review; report what is present, do not judge):
   - absolute_claims: guaranteed, absolute, exaggerated or "after N uses" result claims. Quote the exact words in the
     original language (spoken from the transcript, or on-screen text), never a paraphrase or translation.
   - before_after: a comparison of the body/skin/object before vs after using the product.
   - ui_overlays: on-screen elements imitating interactive UI (fake buttons, fake system dialogs, fake play/close icons).
   - realistic_ai_media: people or scenes that look realistic but appear AI-generated or heavily synthetically edited.
   Use empty lists / false when absent.
8. Narrative & emotion (score each 1-10, give a one-sentence reason, and cite timestamps from the frames/transcript):
   - storytelling: is there a clear arc (e.g. problem -> solution -> proof -> CTA)? List the beats in order.
   - emotion: which emotional triggers (surprise, humour, relief, aspiration, FOMO, empathy...) appear and when.
   - shareability: would a viewer send/duet/stitch this? Name the concrete share drivers and when they occur.
9. Decision evidence (observations only, no scores; they are judged later against a rubric):
   - problem: the viewer problem or need the video addresses, or "" if none.
   - value_propositions: concrete benefits stated or shown for the product.
   - on_screen_text: every distinct text overlay with its first timestamp, in the original language.
   - offer: price, discount, voucher, gift or bundle mentioned (present=false when none).
   - product_visibility: when the product is first clearly visible, roughly what share of frames show it, close-ups.
   - trust_signals: testimonials, reviews/comments shown, ingredients/specs, certifications, expert or brand cues.
   - product_mentions: each time the product/brand name is said or shown.
   - inferred_target_audience: who the video seems made for (age band, gender, life stage, interests), with the
     cues that suggest it (speaker, setting, wording, problem shown). Leave fields "" when there is no cue.
   - disclosure_signals: ad/sponsorship disclosures visible or spoken (e.g. #quangcao, #ad, "hợp tác có trả phí",
     paid-partnership label), with timestamps; empty list when none.

Language: write every descriptive or free-text value (descriptions, reasons, claims summaries, categories,
sensory details, key moments) in Vietnamese. Only quotes of spoken words or on-screen text keep their original
language, exactly as said or shown.

Return STRICTLY a JSON object matching this structure:
{
  "product": {"name": "string", "category": "string", "brand": "string"},
  "hook_analysis": {
    "hook_detected": true,
    "hook_duration_sec": 3.0,
    "hook_type": "visual_shock | pain_point | curiosity | result_first | question",
    "visual_evidence": "description of what is shown",
    "verbal_hook": "what words were spoken in first 3s",
    "hook_strength_1_to_10": 8.5
  },
  "demo_and_product_experience": {
    "demo_present": true,
    "demo_start_sec": 5.0,
    "demo_end_sec": 25.0,
    "before_after_shown": true,
    "sensory_details": ["foam texture", "lathering on skin"],
    "clarity_score_1_to_10": 9.0
  },
  "social_proof_and_claims": {
    "key_claims": ["string"],
    "authenticity_level": "high | medium | low",
    "format": "UGC_review | brand_ad | live_cut | creator_vlog"
  },
  "call_to_action": {
    "has_cta": true,
    "cta_type": "yellow_cart | link_in_bio | discount_code | follow",
    "cta_timestamp_sec": 35.0,
    "urgency_expressed": true
  },
  "scoring": {
    "viral_potential_score": 82,
    "conversion_potential_score": 78,
    "rubric_reasons": {"strengths": ["string"], "weaknesses": ["string"]}
  },
  "key_moments": [
    {"timestamp_sec": 0.0, "event": "Hook", "description": "..."}
  ],
  "policy_signals": {
    "absolute_claims": [{"text": "exact quote", "timestamp_sec": 2.0, "channel": "spoken | overlay"}],
    "before_after": {"present": true, "product_effect_comparison": true, "timestamp_sec": 12.0},
    "ui_overlays": [{"description": "string", "timestamp_sec": 4.0, "fake_interactive": true}],
    "realistic_ai_media": {"present": false, "confidence": "high | medium | low"}
  },
  "narrative_and_emotion": {
    "storytelling": {
      "score_1_to_10": 7.0,
      "arc_type": "problem_solution | testimonial | before_after | demo_walkthrough | listicle | skit | none",
      "reason": "string",
      "beats": [{"timestamp_sec": 0.0, "beat": "hook | problem | solution | proof | offer | cta", "description": "..."}]
    },
    "emotion": {
      "score_1_to_10": 6.0,
      "dominant_emotion": "string",
      "reason": "string",
      "triggers": [{"timestamp_sec": 0.0, "trigger": "surprise | humour | relief | aspiration | fomo | empathy | other", "description": "..."}]
    },
    "shareability": {
      "score_1_to_10": 5.0,
      "reason": "string",
      "share_drivers": [{"timestamp_sec": 0.0, "driver": "relatable | surprising | useful_tip | funny | controversial | other", "description": "..."}]
    }
  },
  "decision_evidence": {
    "problem": "string",
    "value_propositions": ["string"],
    "on_screen_text": [{"timestamp_sec": 0.0, "text": "exact overlay text"}],
    "offer": {"present": false, "description": "string", "timestamp_sec": 0.0},
    "product_visibility": {"first_clear_sec": 1.0, "share_of_frames": 0.6, "close_ups": true},
    "trust_signals": [{"timestamp_sec": 0.0, "type": "testimonial | comments | ingredients | certification | expert | brand", "description": "..."}],
    "product_mentions": [{"timestamp_sec": 0.0, "channel": "spoken | overlay | packaging", "text": "string"}],
    "inferred_target_audience": {"age_band": "18-24 | 25-34 | 35-44 | 45+ | ", "gender": "female | male | all | ",
                                 "life_stage": "string", "interests": ["string"], "cues": ["string"]},
    "disclosure_signals": [{"timestamp_sec": 0.0, "channel": "spoken | overlay | caption", "text": "string"}]
  }
}
"""
# Bump when the prompt's JSON structure changes; caches record it so stale extractions are detectable.
SCHEMA_VERSION = 4  # 1 base, 2 policy_signals + narrative_and_emotion, 3 decision_evidence,
#                     4 inferred_target_audience + disclosure_signals + Vietnamese free text


def cache_path(video: Path) -> Path:
    return CACHE_DIR / f"{video.stem}.json"


def find_cached(video: Path) -> Path | None:
    path = cache_path(video)
    return path if path.exists() else None


def extract_frames(video: Path, fps_sample: float = 1.0, max_dim: int = 512, quality: int = 75,
                   on_frame: Callable[[int, int], None] | None = None):
    """(duration, frames). `on_frame(done, expected_total)` is told after each sampled frame."""
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video}")
    duration = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) / (cap.get(cv2.CAP_PROP_FPS) or 30.0)
    expected = int(duration * fps_sample) + 1

    frames, sec = [], 0.0
    while sec <= duration:
        cap.set(cv2.CAP_PROP_POS_MSEC, sec * 1000.0)
        ok, frame = cap.read()
        if not ok:
            break
        h, w = frame.shape[:2]
        scale = max_dim / max(h, w)
        resized = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        _, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, quality])
        frames.append({"timestamp_sec": round(sec, 2), "base64": base64.b64encode(buf).decode("utf-8")})
        if on_frame:
            on_frame(len(frames), max(expected, len(frames)))
        sec += 1.0 / fps_sample
    cap.release()
    return duration, frames


# Whisper writes text over silence and music. Its segments say how unsure it was; a segment that is both likely
# silence and low-confidence is dropped (the usual Whisper hallucination heuristic, not a guarantee).
HALLUCINATION_NO_SPEECH = 0.6
HALLUCINATION_AVG_LOGPROB = -1.0


def _hallucinated(segment) -> bool:
    no_speech = getattr(segment, "no_speech_prob", None)
    avg_logprob = getattr(segment, "avg_logprob", None)
    return (no_speech is not None and avg_logprob is not None
            and no_speech > HALLUCINATION_NO_SPEECH and avg_logprob < HALLUCINATION_AVG_LOGPROB)


# Subtitle-credit lines Whisper is known to write over music-only audio (learned from subtitled videos).
SUBTITLE_CREDIT_RE = re.compile(
    r"자막\s*제작|자막\s*by|UpTitle|subtitles?\s+by|amara\.org|ghiền mì gõ|hãy subscribe cho kênh", re.IGNORECASE)


def is_subtitle_credit(text: str) -> bool:
    return bool(SUBTITLE_CREDIT_RE.search(text or ""))


def clean_transcript(text: str | None, segments: list[dict] | None) -> tuple[str, list[dict]]:
    """Drop subtitle-credit segments (also from caches transcribed before the filter); the text follows them."""
    segments = segments or []
    kept = [s for s in segments if not is_subtitle_credit(s.get("text", ""))]
    if len(kept) == len(segments) and not is_subtitle_credit(text or ""):
        return text or "", segments
    return " ".join(s["text"] for s in kept), kept


def transcribe(client: OpenAI, video: Path) -> tuple[str, list[dict]]:
    """Full text plus timed segments [{start, end, text, no_speech_prob, avg_logprob}] so the lab can show what was
    heard when. Segments the heuristic drops are left out of both the text and the segments."""
    with tempfile.TemporaryDirectory() as tmp:
        audio = Path(tmp) / "audio.mp3"
        cmd = ["ffmpeg", "-y", "-i", str(video), "-vn", "-acodec", "libmp3lame",
               "-ar", "16000", "-ac", "1", "-b:a", "64k", str(audio)]
        try:
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        except subprocess.CalledProcessError:
            return "", []  # no audio track
        with open(audio, "rb") as f:
            result = client.audio.transcriptions.create(model=AUDIO_MODEL, file=f, response_format="verbose_json",
                                                        timestamp_granularities=["segment"])
    raw = result.segments or []
    kept = [s for s in raw if not _hallucinated(s)]
    segments = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip(),
                 "no_speech_prob": getattr(s, "no_speech_prob", None), "avg_logprob": getattr(s, "avg_logprob", None)}
                for s in kept]
    text = result.text if len(kept) == len(raw) else " ".join(s["text"] for s in segments)
    return clean_transcript(text, segments)


def video_fingerprint(video: Path) -> str:
    """sha1 of the file bytes: an unchanged file reuses its cached extraction."""
    h = hashlib.sha1()
    with video.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def frames_dir(video: Path) -> Path:
    return FRAMES_DIR / video.stem


def save_frames(video: Path, frames: list[dict]) -> list[str]:
    """Write the sampled frames (exactly what the VLM saw) as JPEGs; returns file names."""
    out = frames_dir(video)
    out.mkdir(parents=True, exist_ok=True)
    names = []
    for fr in frames:
        name = f"{fr['timestamp_sec']:07.2f}.jpg"
        (out / name).write_bytes(base64.b64decode(fr["base64"]))
        names.append(name)
    return names


def ensure_frames(video: Path) -> list[str]:
    """Frames of an older cache that never saved them: re-sampled locally with the same settings (no API)."""
    existing = sorted(p.name for p in frames_dir(video).glob("*.jpg"))
    if existing:
        return existing
    _, frames = extract_frames(video)
    return save_frames(video, frames)


def analyze(client: OpenAI, frames: list, transcript: str, duration: float, model: str):
    content = [{
        "type": "text",
        "text": f"Here is the video data (Duration: {duration:.1f}s, Total Frames: {len(frames)}).\n\n"
                f"FULL SPOKEN TRANSCRIPT:\n{transcript or '[no speech]'}\n\nCHRONOLOGICAL VIDEO FRAMES:",
    }]
    for fr in frames:
        content.append({"type": "text", "text": f"[Frame at {fr['timestamp_sec']:.1f}s]:"})
        content.append({"type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{fr['base64']}", "detail": "low"}})
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": ECOMMERCE_SYSTEM_PROMPT},
                  {"role": "user", "content": content}],
        response_format={"type": "json_object"},
    )
    usage = response.usage
    usage_stats = {
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
        "total_tokens": usage.total_tokens if usage else 0,
    }
    return json.loads(response.choices[0].message.content), usage_stats


def run_extraction(video: Path, model: str = VISION_MODEL,
                   on_step: Callable[[str], None] = print, on_progress: Progress = no_progress) -> Path:
    """Full extraction for one video; writes and returns the cache file.

    `on_step` gets one line per phase (CLI / Streamlit); `on_progress(phase, label, done, total, detail)` gets
    structured progress (frames n/N, Whisper and VLM request sent / answer received) for streaming.
    """
    client = OpenAI()
    t0 = time.time()

    on_step("1/3 Extracting frames (OpenCV)...")
    duration, frames = extract_frames(
        video, on_frame=lambda done, total: on_progress("frames", "Cắt frame 1 fps (OpenCV)", done, total))
    frame_files = save_frames(video, frames)
    t_frames = time.time()
    on_progress("frames", "Đã lưu frame", len(frames), len(frames), {"duration_sec": round(duration, 2)})

    on_step("2/3 Transcribing audio (Whisper)...")
    on_progress("whisper", "Tách audio, gửi Whisper", detail={"model": AUDIO_MODEL})
    transcript, segments = transcribe(client, video)
    t_audio = time.time()
    on_progress("whisper", "Whisper trả transcript", detail={"segments": len(segments), "chars": len(transcript),
                                                             "sec": round(t_audio - t_frames, 1)})

    on_step(f"3/3 Analyzing {len(frames)} frames with {model}...")
    on_progress("vlm", f"Gửi {len(frames)} frame + transcript cho {model}",
                detail={"frames": len(frames), "transcript_chars": len(transcript), "model": model})
    features, usage_stats = analyze(client, frames, transcript, duration, model)
    t_end = time.time()
    on_progress("vlm", f"{model} trả JSON features", detail={**usage_stats, "sec": round(t_end - t_audio, 1)})

    result = {
        "schema_version": SCHEMA_VERSION,
        "video_file": str(video),
        "video_fingerprint": video_fingerprint(video),
        "frame_files": frame_files,
        "video_duration_sec": round(duration, 2),
        "vision_model": model,
        "benchmark_latency": {
            "frame_extraction_sec": round(t_frames - t0, 2),
            "audio_transcription_sec": round(t_audio - t_frames, 2),
            "vision_inference_sec": round(t_end - t_audio, 2),
            "total_pipeline_sec": round(t_end - t0, 2),
        },
        "token_usage": usage_stats,
        "transcript": transcript,
        "transcript_segments": segments,
        "speech_present": bool(segments),  # False: no audio, or every segment was dropped as silence noise
        "features": features,
    }
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    out = cache_path(video)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return out
