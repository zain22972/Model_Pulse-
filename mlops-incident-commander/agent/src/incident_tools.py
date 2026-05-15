"""
MLOps Incident Commander — Mock Tools
Generates synthetic timeseries data and simulates remediation actions.
No numpy required — pure Python math.
"""

import math
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from langchain_core.tools import tool

from .incident_state import AnomalyWindow, ChartSpec, DataPoint


# ── Timeseries generator ──────────────────────────────────────────────────────

def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def generate_timeseries(
    metric: str,
    window_minutes: int = 60,
    points: int = 60,
    baseline: float = 0.0,
    spike_at: float | None = None,          # fraction [0,1] of window
    spike_magnitude: float = 3.0,
    threshold: float | None = None,
    noise_scale: float = 0.05,
) -> tuple[list[DataPoint], list[AnomalyWindow]]:
    """
    Generates a synthetic timeseries with optional spike injection.
    Returns (data_points, anomaly_windows).
    """
    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(minutes=window_minutes)
    step = window_minutes / points

    data: list[DataPoint] = []
    anomaly_windows: list[AnomalyWindow] = []

    spike_start_i = None
    spike_end_i = None

    for i in range(points):
        ts = start + timedelta(minutes=i * step)
        # gentle sinusoidal drift + noise
        v = baseline + math.sin(i / points * math.pi * 2) * (baseline * 0.05)
        v += random.gauss(0, baseline * noise_scale)

        if spike_at is not None:
            spike_center = spike_at * points
            dist = abs(i - spike_center)
            if dist < points * 0.15:
                v += spike_magnitude * math.exp(-((dist / (points * 0.08)) ** 2))
                if spike_start_i is None:
                    spike_start_i = i
                spike_end_i = i

        point: DataPoint = {"ts": _iso(ts), "value": round(v, 4)}
        if threshold is not None:
            point["threshold"] = threshold
        data.append(point)

    if spike_start_i is not None and spike_end_i is not None:
        start_dt = start + timedelta(minutes=spike_start_i * step)
        end_dt = start + timedelta(minutes=spike_end_i * step)
        severity = "critical" if spike_magnitude > 5 else "high"
        anomaly_windows.append({
            "start_ts": _iso(start_dt),
            "end_ts": _iso(end_dt),
            "severity": severity,
        })

    return data, anomaly_windows


# ── Chart builders per incident type ─────────────────────────────────────────

CHART_CONFIGS = {
    "data_drift": {
        "metric": "data_drift_score",
        "title": "Data Drift Score (PSI)",
        "unit": "score",
        "baseline": 0.12,
        "threshold": 0.30,
        "spike_mag": 0.45,
        "color": "#f97316",
    },
    "latency_spike": {
        "metric": "p99_latency_ms",
        "title": "p99 Inference Latency",
        "unit": "ms",
        "baseline": 320.0,
        "threshold": 2000.0,
        "spike_mag": 2800.0,
        "color": "#ef4444",
    },
    "accuracy_drop": {
        "metric": "model_accuracy",
        "title": "Model Accuracy (Rolling 1h)",
        "unit": "%",
        "baseline": 0.93,
        "threshold": 0.85,
        "spike_mag": -0.18,
        "color": "#8b5cf6",
    },
    "throughput_degradation": {
        "metric": "requests_per_second",
        "title": "Inference Throughput (RPS)",
        "unit": "rps",
        "baseline": 450.0,
        "threshold": 100.0,
        "spike_mag": -300.0,
        "color": "#3b82f6",
    },
    "feature_skew": {
        "metric": "feature_psi",
        "title": "Feature PSI (Population Stability)",
        "unit": "score",
        "baseline": 0.10,
        "threshold": 0.25,
        "spike_mag": 0.38,
        "color": "#ec4899",
    },
}


def build_charts_for_incident(
    incident_type: str,
    model_name: str,
) -> list[ChartSpec]:
    """Build ChartSpec list for a given incident type."""
    cfg = CHART_CONFIGS.get(incident_type, CHART_CONFIGS["data_drift"])

    data, anomaly_windows = generate_timeseries(
        metric=cfg["metric"],
        window_minutes=60,
        points=60,
        baseline=cfg["baseline"],
        spike_at=0.75,
        spike_magnitude=cfg["spike_mag"],
        threshold=cfg["threshold"],
        noise_scale=0.03,
    )

    # Add a secondary error-rate chart
    err_data, err_anomalies = generate_timeseries(
        metric="error_rate",
        window_minutes=60,
        points=60,
        baseline=0.005,
        spike_at=0.75,
        spike_magnitude=0.12,
        threshold=0.05,
        noise_scale=0.02,
    )

    return [
        {
            "id": str(uuid.uuid4()),
            "type": "area",
            "title": f"{cfg['title']} — {model_name}",
            "metric": cfg["metric"],
            "unit": cfg["unit"],
            "data": data,
            "threshold": cfg["threshold"],
            "anomaly_windows": anomaly_windows,
            "color": cfg["color"],
        },
        {
            "id": str(uuid.uuid4()),
            "type": "line",
            "title": f"Error Rate — {model_name}",
            "metric": "error_rate",
            "unit": "%",
            "data": err_data,
            "threshold": 0.05,
            "anomaly_windows": err_anomalies,
            "color": "#ef4444",
        },
    ]


# ── Runbook templates ─────────────────────────────────────────────────────────

RUNBOOKS = {
    "data_drift": [
        "Check upstream data pipeline for schema changes or ETL failures",
        "Compare feature distributions between training and live traffic",
        "Enable shadow mode: route 10% traffic to fallback model v1.8",
        "Trigger automatic retraining pipeline with last 7-day clean data",
        "Validate retrained model on holdout set (AUC ≥ 0.92 gate)",
        "Promote retrained model to canary (5% traffic)",
        "Monitor drift score for 30 min — promote to 100% if stable",
    ],
    "latency_spike": [
        "Check GPU utilization across serving cluster (target < 80%)",
        "Inspect request queue depth — scale replicas if queue > 50",
        "Review recent deployments in the last 2h for config regressions",
        "Enable request batching with batch_size=32, max_wait=10ms",
        "Scale serving replicas from 4 → 8 via Kubernetes HPA override",
        "Profile the top 5% slowest requests for model optimization hints",
        "Validate p99 latency < 500ms for 5 consecutive minutes",
    ],
    "accuracy_drop": [
        "Pull confusion matrix for the last 1h of predictions",
        "Identify if accuracy drop is class-specific or global",
        "Check if a recent feature engineering change was deployed",
        "Rollback to previous model checkpoint (churn-v2.1 → churn-v2.0)",
        "Enable human-in-the-loop review for low-confidence predictions (< 0.7)",
        "Trigger retraining with up-weighted recent samples",
        "A/B test rollback model vs current — approve rollback if delta > 3%",
    ],
    "throughput_degradation": [
        "Check Kubernetes pod health — look for OOMKilled or CrashLoopBackOff",
        "Inspect node CPU/memory — check for noisy-neighbor contention",
        "Review load balancer health checks — remove unhealthy backends",
        "Scale replicas: kubectl scale deployment model-serving --replicas=12",
        "Enable circuit breaker for non-critical downstream consumers",
        "Validate throughput recovery — target 400 RPS sustained for 5 min",
    ],
    "feature_skew": [
        "Identify which features have PSI > 0.25 (critical skew threshold)",
        "Trace feature pipeline: check feature store freshness timestamps",
        "Compare training-time vs serving-time feature transformations",
        "Apply feature clipping/capping to handle out-of-distribution values",
        "Retrain with skew-corrected features using importance weighting",
        "Deploy feature monitoring dashboard alert for PSI > 0.15",
    ],
}

RISK_LEVELS = {
    "Check": "safe",
    "Inspect": "safe",
    "Compare": "safe",
    "Review": "safe",
    "Pull": "safe",
    "Identify": "safe",
    "Monitor": "safe",
    "Validate": "safe",
    "Profile": "safe",
    "Enable": "risky",
    "Trigger": "risky",
    "Apply": "risky",
    "Deploy": "risky",
    "Scale": "destructive",
    "Rollback": "destructive",
    "Promote": "destructive",
}


def get_risk_level(step: str) -> str:
    for keyword, level in RISK_LEVELS.items():
        if step.startswith(keyword):
            return level
    return "risky"


# ── Remediation tools (called by the agent) ──────────────────────────────────

@tool
def scale_replicas(service: str, current: int, target: int) -> dict:
    """Scale Kubernetes replicas for a model serving deployment."""
    return {
        "success": True,
        "message": f"Scaled {service} from {current} → {target} replicas",
        "estimated_time_seconds": 45,
    }


@tool
def rollback_model(model_name: str, from_version: str, to_version: str) -> dict:
    """Roll back a model to a previous checkpoint."""
    return {
        "success": True,
        "message": f"Rolled back {model_name}: {from_version} → {to_version}",
        "traffic_shifted": True,
        "estimated_time_seconds": 120,
    }


@tool
def trigger_retraining(model_name: str, data_window_days: int = 7) -> dict:
    """Trigger an automated model retraining pipeline."""
    job_id = f"retrain-{uuid.uuid4().hex[:8]}"
    return {
        "success": True,
        "job_id": job_id,
        "message": f"Retraining job {job_id} submitted for {model_name} with {data_window_days}-day data window",
        "estimated_duration_minutes": 45,
    }


@tool
def alert_team(channel: str, message: str, severity: str) -> dict:
    """Send an alert to the on-call team via Slack/PagerDuty."""
    return {
        "success": True,
        "message": f"Alert sent to #{channel}: [{severity.upper()}] {message}",
        "notified": ["oncall-mlops@company.com", f"#{channel}"],
    }


@tool
def update_runbook(incident_id: str, step_index: int, status: str, notes: str = "") -> dict:
    """Mark a runbook step as complete and log notes."""
    return {
        "success": True,
        "incident_id": incident_id,
        "step_index": step_index,
        "status": status,
        "notes": notes,
    }


ALL_TOOLS = [scale_replicas, rollback_model, trigger_retraining, alert_team, update_runbook]
