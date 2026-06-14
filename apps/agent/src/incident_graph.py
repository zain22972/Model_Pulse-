"""
MLOps Incident Commander — LangGraph Graph
Implements the full incident response workflow with HITL approvals.

Graph flow (state-based HITL, no interrupt()):
  classify_incident
      +-> (pending HITL?) -> process user decision -> execute or deny
      +-> (new incident) -> fetch_metrics -> triage -> diagnose -> propose_step
                                                                  |
                                                           route_after_hitl
                                                        +-> wait -> END
                                                        +-> execute -> execute_remediation
                                                        +-> abort -> deny_step
"""

import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, StateGraph

from copilotkit.langgraph import copilotkit_emit_state, copilotkit_emit_message

from .incident_prompts import (
    DIAGNOSE_PROMPT_TEMPLATE,
    SYSTEM_PROMPT,
    TRIAGE_PROMPT_TEMPLATE,
)
from .incident_state import Incident, IncidentState, TimelineEntry
from .incident_tools import (
    ALL_TOOLS,
    RUNBOOKS,
    build_charts_for_incident,
    get_risk_level,
)


# ── LLM setup ────────────────────────────────────────────────────────────────

def get_llm(model: str = "gemini-3.1-flash-lite"):
    """
    Returns a Gemini LLM instance.
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "stub"
    print(f"DEBUG: Initializing LLM with model: {model}")
    return ChatGoogleGenerativeAI(
        model=model,
        temperature=0,
        api_key=api_key,
        max_retries=3,
    ).bind_tools(ALL_TOOLS)


def _now() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _add_timeline(state: IncidentState, actor: str, action: str, detail: str = "", incident_id: str = None) -> list[TimelineEntry]:
    entry: TimelineEntry = {
        "ts": _now(),
        "actor": actor,
        "action": action,
    }
    if detail:
        entry["detail"] = detail
        
    actual_incident_id = incident_id or state.get("active_incident_id")
    if actual_incident_id:
        entry["incident_id"] = actual_incident_id
        
    return state.get("timeline", []) + [entry]


def _build_emit_state(state: IncidentState, updates: dict) -> dict:
    """Build a state snapshot dict for copilotkit_emit_state (excludes messages)."""
    merged = {}
    for key in ["incidents", "active_incident_id", "charts", "incident_charts",
                "timeline", "alerts", "suggested_runbook_step", "suggested_step_number",
                "suggested_risk_level", "suggested_impact", "hitl_pending",
                "hitl_pending_incident_id"]:
        if key in updates:
            merged[key] = updates[key]
        elif key in state:
            merged[key] = state[key]
    return merged


# ── Node: classify_incident ───────────────────────────────────────────────────

def _process_hitl_decision(state: IncidentState) -> dict:
    """Scan messages for an approval/denial decision from the user."""
    messages = state.get("messages", [])
    for msg in reversed(messages):
        content = getattr(msg, "content", None)
        if not isinstance(content, str):
            continue
        # Check for structured HITL tag
        hitl_match = re.search(r'\[HITL_DECISION\]:\s*(\{.*?\})', content, re.DOTALL)
        if hitl_match:
            try:
                decision = json.loads(hitl_match.group(1))
                return {
                    "active_incident_id": state.get("active_incident_id"),
                    "_hitl_approved": decision.get("approved", False),
                    "hitl_pending": False,
                }
            except Exception:
                pass
        # Natural language check
        lower = content.lower()
        if any(kw in lower for kw in ["approve", "confirm", "apply fix", "yes", "execute"]):
            return {
                "active_incident_id": state.get("active_incident_id"),
                "_hitl_approved": True,
                "hitl_pending": False,
            }
        if any(kw in lower for kw in ["deny", "reject", "no", "decline", "keep investigating"]):
            return {
                "active_incident_id": state.get("active_incident_id"),
                "_hitl_approved": False,
                "hitl_pending": False,
            }
    return {}  # Still waiting for user response


async def classify_incident(state: IncidentState, config: RunnableConfig) -> dict:
    """
    Read the latest raw alert and create an Incident record.
    """
    # ── Pending HITL? Process user decision ────────────────────────────────
    if state.get("hitl_pending", False):
        result = _process_hitl_decision(state)
        if result:
            await copilotkit_emit_state(config, _build_emit_state(state, result))
            return result
        return {"hitl_pending": True}

    alerts = list(state.get("alerts", []))
    incidents = state.get("incidents", [])

    # --- Pull alert from messages if not already in state.alerts ---
    msg_alert = _extract_alert_from_messages(state.get("messages", []))
    if msg_alert and "alert_type" in msg_alert:
        last_alert = alerts[-1] if alerts else {}
        if (
            last_alert.get("alert_type") != msg_alert.get("alert_type") or
            last_alert.get("triggered_at") != msg_alert.get("triggered_at")
        ):
            alerts = alerts + [msg_alert]
            print(f"DEBUG: classify_incident - pulled alert from messages: {msg_alert.get('alert_type')}")

    print(f"DEBUG: classify_incident - alerts_count={len(alerts)}")
    if not alerts:
        print("DEBUG: classify_incident - no alerts found in state")
        return {}

    alert = alerts[-1]
    incident_type = alert.get("alert_type", "data_drift")
    model_name = alert.get("model", "unknown-model")
    service = alert.get("service", "ml-serving")
    alert_triggered_at = alert.get("triggered_at", "")

    # ── Deduplication guard ──────────────────────────────────────────────────
    for existing_inc in incidents:
        if existing_inc["type"] != incident_type or existing_inc["model_name"] != model_name:
            continue
        try:
            existing_ts = datetime.fromisoformat(existing_inc["triggered_at"].replace("Z", "+00:00"))
            if alert_triggered_at:
                alert_ts = datetime.fromisoformat(alert_triggered_at.replace("Z", "+00:00"))
            else:
                alert_ts = datetime.now(tz=timezone.utc)
            if abs((existing_ts - alert_ts).total_seconds()) < 180:
                print(f"DEBUG: classify_incident - DUPLICATE skipped ({incident_type} already has {existing_inc['id']})")
                return {"active_incident_id": existing_inc["id"]}
        except Exception:
            pass

    # Determine severity
    current_value = alert.get("value", 0)
    threshold = alert.get("threshold", 1)
    ratio = abs(current_value / threshold) if threshold else 1

    if ratio > 3:
        severity = "critical"
    elif ratio > 2:
        severity = "high"
    elif ratio > 1.2:
        severity = "medium"
    else:
        severity = "low"

    incident_id = f"INC-{uuid.uuid4().hex[:6].upper()}"

    incident: Incident = {
        "id": incident_id,
        "type": incident_type,
        "severity": severity,
        "model_name": model_name,
        "service": service,
        "triggered_at": _now(),
        "status": "firing",
        "runbook_step": 0,
        "runbook_steps": RUNBOOKS.get(incident_type, RUNBOOKS["data_drift"]),
        "tags": alert.get("tags", []),
    }

    existing = state.get("incidents", [])
    timeline = _add_timeline(
        state,
        "system",
        f"Critical {incident_type.replace('_', ' ')} detected",
        f"Incident {incident_id} opened for {model_name}. Severity set to {severity.upper()}.",
        incident_id=incident_id
    )

    result = {
        "incidents": existing + [incident],
        "active_incident_id": incident_id,
        "alerts": alerts,
        "timeline": timeline,
    }

    print(f"DEBUG: classify_incident - created {incident_id} for {incident_type}")
    
    # Emit state to frontend
    await copilotkit_emit_state(config, _build_emit_state(state, result))
    await copilotkit_emit_message(config, f"🚨 Incident {incident_id} created: {incident_type.replace('_', ' ').title()} on {model_name} (severity: {severity})")
    
    return result


# ── Node: fetch_metrics ───────────────────────────────────────────────────────

async def fetch_metrics(state: IncidentState, config: RunnableConfig) -> dict:
    """
    Generate synthetic metric charts for the active incident.
    """
    incident_id = state.get("active_incident_id")
    incidents = state.get("incidents", [])
    incident = next((i for i in incidents if i["id"] == incident_id), None)

    if not incident:
        return {}

    charts = build_charts_for_incident(
        incident_type=incident["type"],
        model_name=incident["model_name"],
    )

    timeline = _add_timeline(
        state,
        "agent",
        f"Diagnostic metrics retrieved",
        f"Fetched {len(charts)} charts analyzing {incident['type'].replace('_', ' ')} for {incident['model_name']}",
    )

    print(f"DEBUG: fetch_metrics - generated charts_count={len(charts)}")
    
    existing_charts = state.get("incident_charts", {})
    existing_charts[incident_id] = charts

    result = {
        "charts": charts, 
        "incident_charts": existing_charts,
        "timeline": timeline,
        "active_incident_id": incident_id,
    }

    # Emit state to frontend (charts are now visible)
    await copilotkit_emit_state(config, _build_emit_state(state, result))
    await copilotkit_emit_message(config, f"📊 Retrieved {len(charts)} diagnostic charts for {incident['model_name']}")

    return result


# ── Node: triage ──────────────────────────────────────────────────────────────

async def triage(state: IncidentState, config: RunnableConfig) -> dict:
    """
    LLM node: maps incident type to runbook, builds system context.
    """
    incident_id = state.get("active_incident_id")
    incidents = state.get("incidents", [])
    incident = next((i for i in incidents if i["id"] == incident_id), None)
    alerts = state.get("alerts", [])
    charts = state.get("charts", [])

    if not incident:
        return {}

    alert = alerts[-1] if alerts else {}
    chart_summary = "\n".join(
        f"  - {c['title']}: latest value crosses threshold at {c.get('threshold', 'N/A')} {c['unit']}"
        for c in charts
    )

    prompt = TRIAGE_PROMPT_TEMPLATE.format(
        alert_type=incident["type"],
        model_name=incident["model_name"],
        service=incident["service"],
        current_value=alert.get("value", "N/A"),
        threshold=alert.get("threshold", "N/A"),
        triggered_at=incident["triggered_at"],
        tags=", ".join(incident.get("tags", [])),
        chart_summary=chart_summary,
        runbook_steps="\n".join(
            f"  {i+1}. {s}" for i, s in enumerate(incident["runbook_steps"])
        ),
    )

    llm = get_llm()
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        *state.get("messages", []),
        HumanMessage(content=prompt),
    ]
    response = await llm.ainvoke(messages)

    # Update incident status
    updated_incidents = []
    for inc in incidents:
        if inc["id"] == incident_id:
            updated_incidents.append({**inc, "status": "investigating"})
        else:
            updated_incidents.append(inc)

    timeline = _add_timeline(
        state, 
        "agent", 
        f"{incident['type'].replace('_', ' ').title()} Triage", 
        f"Runbook for {incident['type']} identified. First step prepared."
    )

    result = {
        "messages": [response],
        "incidents": updated_incidents,
        "timeline": timeline,
    }

    # Emit state to frontend
    await copilotkit_emit_state(config, _build_emit_state(state, result))

    return result


# ── Node: diagnose ────────────────────────────────────────────────────────────

async def diagnose(state: IncidentState, config: RunnableConfig) -> dict:
    """
    LLM node: performs root cause analysis over chart data.
    """
    incident_id = state.get("active_incident_id")
    incidents = state.get("incidents", [])
    incident = next((i for i in incidents if i["id"] == incident_id), None)
    charts = state.get("charts", [])

    if not incident:
        return {}

    runbook_steps = incident.get("runbook_steps", [])
    current_step = incident.get("runbook_step", 0)

    chart_summary = "\n".join(
        f"  - {c['title']}: {len(c.get('anomaly_windows', []))} anomaly window(s) detected"
        for c in charts
    )

    prompt = DIAGNOSE_PROMPT_TEMPLATE.format(
        incident_id=incident["id"],
        incident_type=incident["type"],
        severity=incident["severity"],
        model_name=incident["model_name"],
        status=incident["status"],
        current_step=current_step,
        total_steps=len(runbook_steps),
        completed_steps="None yet" if current_step == 0 else "\n".join(
            f"  ✓ {s}" for s in runbook_steps[:current_step]
        ),
        chart_summary=chart_summary,
        next_step_num=current_step + 1,
        next_step_text=runbook_steps[current_step] if current_step < len(runbook_steps) else "All steps complete",
    )

    llm = get_llm()
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        *state.get("messages", []),
        HumanMessage(content=prompt),
    ]
    response = await llm.ainvoke(messages)

    # Extract root cause
    updated_incidents = []
    for inc in incidents:
        if inc["id"] == incident_id:
            updated_incidents.append({
                **inc,
                "root_cause": "Analyzing metric anomalies — see diagnosis in chat",
            })
        else:
            updated_incidents.append(inc)

    timeline = _add_timeline(
        state, 
        "agent", 
        f"RCA Complete: {incident['type'].replace('_', ' ')}",
        "Root cause analysis performed over diagnostic metric anomalies."
    )

    result = {
        "messages": [response],
        "incidents": updated_incidents,
        "timeline": timeline,
    }

    # Emit state to frontend
    await copilotkit_emit_state(config, _build_emit_state(state, result))

    return result


# ── Node: propose_step (state-based HITL) ────────────────────────────────────

async def propose_step(state: IncidentState, config: RunnableConfig) -> dict:
    """
    Proposes the next runbook step by setting hitl_pending=True.
    """
    incident_id = state.get("active_incident_id")
    incidents = state.get("incidents", [])
    incident = next((i for i in incidents if i["id"] == incident_id), None)

    if not incident:
        return {}

    runbook_steps = incident.get("runbook_steps", [])
    current_step = incident.get("runbook_step", 0)

    if current_step >= len(runbook_steps):
        updated_incidents = []
        for inc in incidents:
            if inc["id"] == incident_id:
                updated_incidents.append({**inc, "status": "resolved"})
            else:
                updated_incidents.append(inc)
        timeline = _add_timeline(state, "system", "All runbook steps completed", "Incident resolved")
        result = {"incidents": updated_incidents, "timeline": timeline}
        await copilotkit_emit_state(config, _build_emit_state(state, result))
        await copilotkit_emit_message(config, f"✅ All runbook steps completed. Incident {incident_id} resolved.")
        return result

    step_text = runbook_steps[current_step]
    risk_level = get_risk_level(step_text)

    impact_map = {
        "safe": "Read-only operation — no production impact",
        "risky": "May affect model behavior — monitor closely after execution",
        "destructive": "Will change production traffic — ensure rollback plan is ready",
    }

    result = {
        "suggested_runbook_step": step_text,
        "suggested_step_number": current_step + 1,
        "suggested_risk_level": risk_level,
        "suggested_impact": impact_map[risk_level],
        "hitl_pending": True,
        "hitl_pending_incident_id": incident_id,
    }

    # Emit state to frontend (HITL proposal visible)
    await copilotkit_emit_state(config, _build_emit_state(state, result))
    await copilotkit_emit_message(config, f"⏸️ Step {current_step + 1}/{len(runbook_steps)}: {step_text}\n\nRisk: {risk_level.upper()} — {impact_map[risk_level]}\n\nAwaiting your approval...")

    return result


# ── Node: deny_step ────────────────────────────────────────────────────────────

async def deny_step(state: IncidentState, config: RunnableConfig) -> dict:
    """Operator denied the remediation step."""
    incident_id = state.get("active_incident_id")
    incidents = state.get("incidents", [])
    
    updated_incidents = []
    for inc in incidents:
        if inc["id"] == incident_id:
            updated_incidents.append({**inc, "status": "investigating"})
        else:
            updated_incidents.append(inc)
            
    timeline = _add_timeline(
        state,
        "user",
        "Operator rejected remediation",
        "Incident remains open"
    )
    
    result = {
        "incidents": updated_incidents,
        "timeline": timeline,
    }

    await copilotkit_emit_state(config, _build_emit_state(state, result))
    await copilotkit_emit_message(config, "❌ Remediation step rejected. Incident remains open for investigation.")

    return result


# ── Node: execute_remediation ─────────────────────────────────────────────────

async def execute_remediation(state: IncidentState, config: RunnableConfig) -> dict:
    """
    Execute the approved runbook step by advancing the runbook_step counter.
    """
    incident_id = state.get("active_incident_id")
    incidents = state.get("incidents", [])
    incident = next((i for i in incidents if i["id"] == incident_id), None)

    if not incident:
        return {}

    current_step = incident.get("runbook_step", 0)
    step_text = state.get("suggested_runbook_step", "")

    updated_incidents = []
    for inc in incidents:
        if inc["id"] == incident_id:
            updated_incidents.append({
                **inc,
                "runbook_step": current_step + 1,
                "status": "mitigating",
            })
        else:
            updated_incidents.append(inc)

    timeline = _add_timeline(
        state,
        "agent",
        f"Step {current_step + 1} executed",
        step_text[:80],
    )

    result = {
        "messages": [AIMessage(content=f"Executed step {current_step + 1}: {step_text}")],
        "incidents": updated_incidents,
        "timeline": timeline,
    }

    await copilotkit_emit_state(config, _build_emit_state(state, result))
    await copilotkit_emit_message(config, f"✅ Executed step {current_step + 1}: {step_text}")

    return result


# ── Node: update_timeline ─────────────────────────────────────────────────────

async def update_timeline(state: IncidentState, config: RunnableConfig) -> dict:
    """Refresh charts with latest data and check if incident is resolved."""
    incident_id = state.get("active_incident_id")
    incidents = state.get("incidents", [])
    incident = next((i for i in incidents if i["id"] == incident_id), None)

    if not incident:
        return {}

    if incident.get("status") == "mitigating":
        charts = build_charts_for_incident(
            incident_type=incident["type"],
            model_name=incident["model_name"],
        )
        for chart in charts:
            chart["anomaly_windows"] = []

        existing_charts = state.get("incident_charts", {})
        existing_charts[incident_id] = charts

        result = {
            "charts": charts,
            "incident_charts": existing_charts,
        }

        await copilotkit_emit_state(config, _build_emit_state(state, result))
        return result

    return {}


# ── Routing functions ─────────────────────────────────────────────────────────

def _extract_alert_from_messages(messages: list) -> dict | None:
    """
    Scan the message history (newest first) for a [DATA]: {...} blob.
    """
    for msg in reversed(messages):
        content = getattr(msg, "content", None)
        if not isinstance(content, str):
            continue
        match = re.search(r'\[DATA\]: (\{.*?\})', content, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except Exception:
                continue
    return None


def route_after_classify(state: IncidentState) -> Literal["execute", "deny", "fetch_metrics"]:
    """
    Route from classify_incident based on whether we got a HITL decision.
    """
    if "_hitl_approved" in state:
        return "execute" if state["_hitl_approved"] else "deny"
    return "fetch_metrics"


def route_after_hitl(state: IncidentState) -> Literal["execute", "abort", "classify_incident", "wait"]:
    """
    After propose_step, decide what to do next.
    """
    if state.get("hitl_pending", False) and "_hitl_approved" not in state:
        print("DEBUG: route_after_hitl -> wait (HITL pending)")
        return "wait"

    if state.get("_hitl_new_alert", False):
        print("DEBUG: route_after_hitl -> classify_incident (explicit new_alert flag)")
        return "classify_incident"

    messages = state.get("messages", [])
    incidents = state.get("incidents", [])
    alert = _extract_alert_from_messages(messages)

    if alert and "alert_type" in alert:
        alert_type = alert["alert_type"]
        alert_triggered_at = alert.get("triggered_at", "")

        already_processed = False
        for inc in incidents:
            if inc["type"] != alert_type:
                continue
            try:
                inc_ts = datetime.fromisoformat(inc["triggered_at"].replace("Z", "+00:00"))
                alert_ts = datetime.fromisoformat(alert_triggered_at.replace("Z", "+00:00"))
                if abs((inc_ts - alert_ts).total_seconds()) < 180:
                    already_processed = True
                    break
            except Exception:
                pass

        if not already_processed:
            print(f"DEBUG: route_after_hitl -> classify_incident (new alert: {alert_type})")
            return "classify_incident"

    approved = state.get("_hitl_approved", False)
    return "execute" if approved else "abort"


def is_resolved(state: IncidentState) -> Literal["loop", "done"]:
    incident_id = state.get("active_incident_id")
    incidents = state.get("incidents", [])
    incident = next((i for i in incidents if i["id"] == incident_id), None)

    if not incident:
        return "done"

    runbook_step = incident.get("runbook_step", 0)
    total_steps = len(incident.get("runbook_steps", []))

    if incident.get("status") == "resolved" or runbook_step >= total_steps:
        return "done"

    return "loop"


# ── Build the graph ───────────────────────────────────────────────────────────

def build_incident_graph():
    graph = StateGraph(IncidentState)

    graph.add_node("classify_incident", classify_incident)
    graph.add_node("fetch_metrics", fetch_metrics)
    graph.add_node("triage", triage)
    graph.add_node("diagnose", diagnose)
    graph.add_node("propose_step", propose_step)
    graph.add_node("execute_remediation", execute_remediation)
    graph.add_node("deny_step", deny_step)
    graph.add_node("update_timeline", update_timeline)

    graph.set_entry_point("classify_incident")
    graph.add_conditional_edges(
        "classify_incident",
        route_after_classify,
        {"execute": "execute_remediation", "deny": "deny_step", "fetch_metrics": "fetch_metrics"},
    )
    graph.add_edge("fetch_metrics", "triage")
    graph.add_edge("triage", "diagnose")
    graph.add_edge("diagnose", "propose_step")

    graph.add_conditional_edges(
        "propose_step",
        route_after_hitl,
        {"execute": "execute_remediation", "abort": "deny_step", "classify_incident": "classify_incident", "wait": END},
    )

    graph.add_edge("execute_remediation", "update_timeline")
    graph.add_edge("deny_step", END)

    graph.add_conditional_edges(
        "update_timeline",
        is_resolved,
        {"loop": "propose_step", "done": END},
    )

    return graph.compile()


graph = build_incident_graph()
