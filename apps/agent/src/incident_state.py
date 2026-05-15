"""
MLOps Incident Commander — State Schema
Mirrors the lead_state.py pattern from the starter kit.
"""

from typing import Annotated, Literal, NotRequired, TypedDict
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage


# ── Chart / Metric types ─────────────────────────────────────────────────────

class AnomalyWindow(TypedDict):
    start_ts: str      # ISO8601
    end_ts: str
    severity: Literal["critical", "high", "medium", "low"]


class DataPoint(TypedDict):
    ts: str            # ISO8601 timestamp
    value: float
    threshold: NotRequired[float]


class ChartSpec(TypedDict):
    id: str
    type: Literal["line", "area", "bar", "scatter"]
    title: str
    metric: str        # e.g. "data_drift_score", "p99_latency_ms"
    unit: str          # e.g. "ms", "%", "score"
    data: list[DataPoint]
    threshold: NotRequired[float]
    anomaly_windows: list[AnomalyWindow]
    color: NotRequired[str]   # hex color for the chart line


# ── Incident types ────────────────────────────────────────────────────────────

IncidentType = Literal[
    "data_drift",
    "latency_spike",
    "accuracy_drop",
    "throughput_degradation",
    "feature_skew",
]

SeverityLevel = Literal["critical", "high", "medium", "low"]

IncidentStatus = Literal[
    "firing",
    "investigating",
    "mitigating",
    "resolved",
]


class Incident(TypedDict):
    id: str
    type: IncidentType
    severity: SeverityLevel
    model_name: str
    service: str
    triggered_at: str          # ISO8601
    status: IncidentStatus
    runbook_step: int          # current step index (0-based)
    runbook_steps: list[str]   # full list of remediation steps
    root_cause: NotRequired[str]
    tags: list[str]


# ── Timeline ──────────────────────────────────────────────────────────────────

class TimelineEntry(TypedDict):
    ts: str
    actor: Literal["agent", "user", "system"]
    action: str
    detail: NotRequired[str]
    severity: NotRequired[SeverityLevel]


# ── Top-level agent state ─────────────────────────────────────────────────────

class IncidentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]

    # Active incidents list
    incidents: list[Incident]
    active_incident_id: NotRequired[str]

    # Chart data streamed to frontend via STATE_DELTA
    charts: list[ChartSpec]

    # Audit trail
    timeline: list[TimelineEntry]

    # Raw incoming alert payloads (Datadog-shaped)
    alerts: list[dict]

    # HITL: pending runbook step awaiting user approval
    suggested_runbook_step: NotRequired[str]
    suggested_step_number: NotRequired[int]
    suggested_risk_level: NotRequired[Literal["safe", "risky", "destructive"]]
    suggested_impact: NotRequired[str]
    hitl_pending: NotRequired[bool]
    hitl_pending_incident_id: NotRequired[str]

    # Internal state for routing
    _hitl_approved: NotRequired[bool]
    _hitl_step_override: NotRequired[str]
    _hitl_new_alert: NotRequired[bool]
