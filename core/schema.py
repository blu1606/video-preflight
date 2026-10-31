"""Unified data contract: every value carries where it came from."""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class SourceStatus(StrEnum):
    REAL = "REAL"          # collected/extracted from a real source (not necessarily verified)
    MOCK = "MOCK"          # fixture data for development only
    MISSING = "MISSING"    # no data yet
    INFERRED = "INFERRED"  # derived from other features; see input_sources


class Mode(StrEnum):
    SIMULATION = "simulation"  # mock data allowed, outputs are labelled simulation
    EVIDENCE = "evidence"      # only REAL data or inferences without mock dependency


@dataclass
class Feature:
    value: Any
    status: SourceStatus
    source: str | None = None
    evidence: list[str] = field(default_factory=list)
    input_sources: list[str] = field(default_factory=list)
    mock_dependency: bool = False
    # True when the evidence times are structural (the opening window, a demo that is absent): a window the
    # extractor did not observe at a moment, so a timeline marker must not pin it to that second.
    structural: bool = False

    @property
    def is_mock_based(self) -> bool:
        return self.status == SourceStatus.MOCK or self.mock_dependency

    @classmethod
    def missing(cls, reason: str) -> "Feature":
        return cls(value=None, status=SourceStatus.MISSING, source=None, evidence=[reason])


FeatureMap = dict[str, Feature]


@dataclass
class CriterionScore:
    id: str
    name: str
    weight: float
    score: float | None          # None means not_scored
    mock_dependency: bool
    inputs: list[str]
    reason: str = ""
    # {status: placeholder|sourced|calibrated, source, placeholders, sourced, fallback?} from sources.calibration;
    # None when the criterion relies on no threshold or benchmark.
    calibration: dict | None = None

    @property
    def scored(self) -> bool:
        return self.score is not None


@dataclass
class GroupScore:
    name: str
    score: float | None
    coverage: float              # share of rubric weight that was actually scored
    mock_dependency: bool
    criteria: list[CriterionScore]
