"""Scoring thresholds and benchmarks with their provenance (fixtures/calibration_v0.json).

Two kinds of entries:
- constants: a fixed number (or band / map) used by a formula, with status placeholder | sourced | calibrated.
  An optional `features` list binds a provider-side constant to the features computed with it.
- data_benchmarks: benchmarks derived from crawled market data at run time (percentiles, rival prices).
  They carry no value here; the bound features hold the numbers and their evidence.

`summarize` turns what one criterion actually used into the `calibration` block of its CriterionScore,
so a criterion that relied on any placeholder says so.
"""

import json
from functools import lru_cache
from pathlib import Path

CALIBRATION_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "calibration_v0.json"
STATUSES = ("placeholder", "sourced", "calibrated")  # weakest first
CONSTANT_FIELDS = ("value", "unit", "status", "source", "note")
BENCHMARK_FIELDS = ("status", "source", "note", "features")


class CalibrationError(ValueError):
    pass


def _validate(data: dict, path: Path) -> dict:
    if not isinstance(data, dict) or not isinstance(data.get("constants"), dict):
        raise CalibrationError(f"{path}: expected an object with a 'constants' map")
    sections = {"constants": CONSTANT_FIELDS, "data_benchmarks": BENCHMARK_FIELDS}
    for section, fields in sections.items():
        for key, entry in (data.get(section) or {}).items():
            if not isinstance(entry, dict):
                raise CalibrationError(f"{path}: {section}.{key} must be an object")
            missing = [f for f in fields if f not in entry]
            if missing:
                raise CalibrationError(f"{path}: {section}.{key} lacks {', '.join(missing)}")
            if entry["status"] not in STATUSES:
                raise CalibrationError(f"{path}: {section}.{key} has unknown status {entry['status']!r}")
            if not isinstance(entry.get("features", []), list):
                raise CalibrationError(f"{path}: {section}.{key}.features must be a list")
    return data


@lru_cache(maxsize=4)
def load(path: Path = CALIBRATION_PATH) -> dict:
    """Parsed and validated calibration file; a missing or malformed file is a configuration error."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise CalibrationError(f"cannot read calibration file {path}: {e}") from e
    return _validate(data, Path(path))


def entry(key: str, path: Path = CALIBRATION_PATH) -> dict:
    constants = load(path)["constants"]
    if key not in constants:
        raise KeyError(f"calibration constant {key!r} not in {Path(path).name}")
    return constants[key]


def value(key: str, path: Path = CALIBRATION_PATH):
    v = entry(key, path)["value"]
    return tuple(v) if isinstance(v, list) else v  # bands are tuples in code


def _feature_bindings(path: Path) -> dict[str, list[tuple[str, dict]]]:
    data = load(path)
    out: dict[str, list[tuple[str, dict]]] = {}
    for section in ("constants", "data_benchmarks"):
        for key, e in (data.get(section) or {}).items():
            for feature in e.get("features", []):
                out.setdefault(feature, []).append((key, e))
    return out


def summarize(constants: set[str] | list[str], features: list[str], fallbacks: list[str] | None = None,
              path: Path = CALIBRATION_PATH) -> dict | None:
    """Calibration block for one criterion: weakest status among everything it relied on.

    constants: calibration keys the formula read; features: input features it used (bound entries count too);
    fallbacks: why a data-derived benchmark was not available and a constant was used instead.
    None when the criterion relies on no threshold or benchmark (e.g. a Decisions answer).
    """
    used: dict[str, dict] = {k: entry(k, path) for k in constants}
    bindings = _feature_bindings(path)
    for f in features:
        used.update(dict(bindings.get(f, [])))
    if not used:
        return None
    status = min((e["status"] for e in used.values()), key=STATUSES.index)
    block = {
        "status": status,
        "source": "; ".join(dict.fromkeys(e["source"] for e in used.values())),
        "placeholders": sorted(k for k, e in used.items() if e["status"] == "placeholder"),
        "sourced": sorted(k for k, e in used.items() if e["status"] != "placeholder"),
    }
    if fallbacks:
        block["fallback"] = list(fallbacks)
    return block


def percentile_rank(values: list[float], x: float) -> float:
    """0-100 mid-rank of x among values: share below plus half of the ties (empty list is a caller error)."""
    if not values:
        raise ValueError("percentile_rank needs at least one value")
    below = sum(v < x for v in values)
    ties = sum(v == x for v in values)
    return round(100 * (below + 0.5 * ties) / len(values), 1)
