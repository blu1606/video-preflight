"""Step trace of the analysis workflow: which agent ran which step/tool, with inputs, outputs and timing.

kind: "tool" (data read through a tool/API), "functional" (rules/code), "reasoning" (LLM, VLM, Decisions API).
The trace only observes the workflow; scoring never reads it.
"""

import json
import time
from collections.abc import Callable
from contextlib import contextmanager
from dataclasses import asdict, dataclass

from core.schema import FeatureMap

MAX_VALUE_CHARS = 160

# progress(phase, label, done=None, total=None, detail=None): what a long step is doing right now.
Progress = Callable[..., None]


def no_progress(*_args, **_kwargs) -> None:
    """Default progress sink for callers that do not stream."""


@dataclass
class Step:
    name: str
    kind: str
    agent: str
    tool: str | None = None
    input: object = None
    output: object = None
    status: str = "ok"  # ok | skipped | error
    started_ms: int = 0
    duration_s: float = 0.0
    tokens: dict | None = None  # see tokens(); only on steps that called (or reused) a model answer


class Trace:
    """`on_event(event, payload)` (optional) is told when each step starts and finishes, so a caller can
    stream progress; "step_started" carries the step header, "step_finished" the full recorded step and
    "step_progress" what a running step is doing (see `progress`)."""

    def __init__(self, on_event: Callable[[str, dict], None] | None = None):
        self.steps: list[Step] = []
        self._t0 = time.perf_counter()
        self._on_event = on_event

    @contextmanager
    def step(self, name: str, kind: str, agent: str, tool: str | None = None, input: object = None):
        s = Step(name, kind, agent, tool, input, started_ms=round((time.perf_counter() - self._t0) * 1000))
        if self._on_event:
            self._on_event("step_started", {"name": name, "kind": kind, "agent": agent, "tool": tool,
                                            "started_ms": s.started_ms})
        t = time.perf_counter()
        try:
            yield s
        except Exception as e:
            s.status, s.output = "error", {"error": str(e)}
            raise
        finally:
            s.duration_s = round(time.perf_counter() - t, 3)
            self.steps.append(s)
            if self._on_event:
                self._on_event("step_finished", asdict(s))

    def progress(self, name: str, phase: str, label: str, done: int | None = None, total: int | None = None,
                 detail: dict | None = None) -> None:
        """Emits "step_progress" for the running step `name`; never recorded as a step. No-op without a
        listener. Keep `detail` small: it is streamed as is."""
        if self._on_event:
            self._on_event("step_progress", {"name": name, "phase": phase, "label": label, "done": done,
                                             "total": total, "detail": detail})

    def reporter(self, name: str) -> Progress:
        """progress(...) bound to one step, for code that does not know the step name."""
        return lambda phase, label, done=None, total=None, detail=None: self.progress(name, phase, label, done,
                                                                                      total, detail)

    def to_json(self) -> list[dict]:
        return [asdict(s) for s in self.steps]


def _normalize_usage(usage: dict | None) -> dict | None:
    """OpenAI usage (chat: prompt/completion, Responses/Decisions: input/output) -> {input, output, total,
    cached?, reasoning?}; None when unknown."""
    if not isinstance(usage, dict):
        return None
    inp = usage.get("input_tokens", usage.get("prompt_tokens")) or 0
    out = usage.get("output_tokens", usage.get("completion_tokens")) or 0
    in_details = usage.get("input_tokens_details") or usage.get("prompt_tokens_details") or {}
    out_details = usage.get("output_tokens_details") or usage.get("completion_tokens_details") or {}
    norm = {"input": inp, "output": out, "total": usage.get("total_tokens") or inp + out,
            "cached": in_details.get("cached_tokens"), "reasoning": out_details.get("reasoning_tokens")}
    return {k: v for k, v in norm.items() if v is not None}


def _sum_usage(usages) -> dict | None:
    known = [u for u in map(_normalize_usage, usages if isinstance(usages, list) else [usages]) if u]
    if not known:
        return None
    return {k: sum(u.get(k, 0) for u in known) for k in ("input", "output", "total", "cached", "reasoning")
            if any(k in u for u in known)}


def tokens(live=None, cached=None, model: str | None = None, source: str | None = None) -> dict:
    """Normalized tokens of a model step: {input, output, total, cached?, reasoning?, model?, source?,
    cached_cost?}. `live`: usage dict(s) of calls made in this run (what this run paid). `cached`: usage
    dict(s) of answers reused from cache; this run paid 0 for them, and `cached_cost` says what they
    originally cost (null when the cache never recorded it)."""
    out = _sum_usage(live) if live is not None else None
    out = out or {"input": 0, "output": 0, "total": 0}
    if cached is not None:
        out["cached_cost"] = _sum_usage(cached)
    return {**out, **({"model": model} if model else {}), **({"source": source} if source else {})}


def tokens_for(source: str | None, usage, model: str | None = None) -> dict | None:
    """tokens() of one answer by where it came from: "live call" (paid now), "cache" (reused), else None
    (no model answer was used)."""
    if source == "live call":
        return tokens(live=usage, model=model, source=source)
    if source == "cache":
        return tokens(cached=usage if isinstance(usage, list) else [usage], model=model, source=source)
    return None


def short(value, limit: int = MAX_VALUE_CHARS):
    """Keep small values as-is; cut long text/collections so a step payload stays readable."""
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    if len(text) <= limit:
        return value
    return text[: limit - 3] + "..."


def feature_digest(features: FeatureMap) -> dict:
    return {name: {"status": f.status.value, "value": short(f.value), "source": f.source,
                   **({"reason": f.evidence[0]} if f.value is None and f.evidence else {})}
            for name, f in features.items()}
