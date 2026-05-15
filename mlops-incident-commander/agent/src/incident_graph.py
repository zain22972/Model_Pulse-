"""
MLOps Incident Commander — LangGraph Graph
Implements the full incident response workflow with HITL approvals.

Graph flow:
  classify_incident
      ↓
  fetch_metrics        (emits charts via STATE_DELTA)
      ↓
  triage               (LLM: maps type → runbook)
      ↓
  diagnose             (LLM: root cause analysis)
      ↓
  propose_step         (interrupt → HITL card in UI)
      ↓
  execute_remediation  (tool calls)
      ↓
  update_timeline      (audit entry, loops back to propose_step)
"""

import uuid
from datetime import datetime, timezone
from typing import Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, StateGraph
from langgraph.types import interrupt

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

def get_llm():
    return ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        temperature=0.2,
    ).bind_tools(ALL_TOOLS)


def _now() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _add_timeline(state: IncidentState, actor: str, action: str, detail: str = "") -> list[TimelineEntry]:
    entry: TimelineEntry = {
        "ts": _now(),
        "actor": actor,
        "action": action,
    }
    if detail:
        entry["detail"] = detail
    return state.get("timeline", []) + [entry]


# ── Node: classify_incident ───────────────────────────────────────────────────

def classify_incident(state: IncidentState) -> dict:
    """
    Read the latest raw alert and create an Incident record.
    """
    alerts = state.get("alerts", [])
    if not alerts:
        return {}

    alert = alerts[-1]  # process the newest alert
    incident_type = alert.get("alert_type", "data_drift")
    model_name = alert.get("model", "unknown-model")
    service = alert.get("service", "ml-serving")

    # Determine severity from the alert value vs threshold
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
        f"Incident {incident_id} created",
        f"Type: {incident_type}, Severity: {severity}, Model: {model_name}",
    )

    return {
        "incidents": existing + [incident],
        "active_incident_id": incident_id,
        "timeline": timeline,
    }


# ── Node: fetch_metrics ───────────────────────────────────────────────────────

def fetch_metrics(state: IncidentState) -> dict:
    """
    Generate synthetic metric charts for the active incident.
    These stream to the frontend via STATE_DELTA.
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

    incident_charts = state.get("incident_charts", {})
    incident_charts[incident_id] = charts

    timeline = _add_timeline(
        state,
        "agent",
        "Metrics fetched",
        f"Generated {len(charts)} charts for {incident['type']}",
    )

    return {"incident_charts": incident_charts, "timeline": timeline}


# ── Node: triage ──────────────────────────────────────────────────────────────

def triage(state: IncidentState) -> dict:
    """
    LLM node: maps incident type to runbook, builds system context.
    """
    incident_id = state.get("active_incident_id")
    incidents = state.get("incidents", [])
    incident = next((i for i in incidents if i["id"] == incident_id), None)
    alerts = state.get("alerts", [])
    
    incident_charts = state.get("incident_charts", {})
    charts = incident_charts.get(incident_id, [])

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
    response = llm.invoke(messages)

    # Update incident status
    updated_incidents = []
    for inc in incidents:
        if inc["id"] == incident_id:
            updated_incidents.append({**inc, "status": "investigating"})
        else:
            updated_incidents.append(inc)

    timeline = _add_timeline(state, "agent", "Triage complete", "Incident classified and runbook selected")

    return {
        "messages": [response],
        "incidents": updated_incidents,
        "timeline": timeline,
    }


# ── Node: diagnose ────────────────────────────────────────────────────────────

def diagnose(state: IncidentState) -> dict:
    """
    LLM node: performs root cause analysis over chart data.
    Streams reasoning visible in the chat sidebar.
    """
    incident_id = state.get("active_incident_id")
    incidents = state.get("incidents", [])
    incident = next((i for i in incidents if i["id"] == incident_id), None)
    
    incident_charts = state.get("incident_charts", {})
    charts = incident_charts.get(incident_id, [])

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
    response = llm.invoke(messages)

    # Extract root cause if mentioned
    updated_incidents = []
    for inc in incidents:
        if inc["id"] == incident_id:
            updated_incidents.append({
                **inc,
                "root_cause": "Analyzing metric anomalies — see diagnosis in chat",
            })
        else:
            updated_incidents.append(inc)

    timeline = _add_timeline(state, "agent", "Root cause analysis complete")

    return {
        "messages": [response],
        "incidents": updated_incidents,
        "timeline": timeline,
    }


# ── Node: propose_step (HITL interrupt) ──────────────────────────────────────

def propose_step(state: IncidentState) -> dict:
    """
    Proposes the next runbook step and interrupts for human approval.
    The frontend renders a RunbookApprovalCard for this interrupt.
    """
    incident_id = state.get("active_incident_id")
    incidents = state.get("incidents", [])
    incident = next((i for i in incidents if i["id"] == incident_id), None)

    if not incident:
        return {}

    runbook_steps = incident.get("runbook_steps", [])
    current_step = incident.get("runbook_step", 0)

    if current_step >= len(runbook_steps):
        # All steps done — mark resolved
        updated_incidents = []
        for inc in incidents:
            if inc["id"] == incident_id:
                updated_incidents.append({**inc, "status": "resolved"})
            else:
                updated_incidents.append(inc)
        timeline = _add_timeline(state, "system", "All runbook steps completed", "Incident resolved")
        return {"incidents": updated_incidents, "timeline": timeline}

    step_text = runbook_steps[current_step]
    risk_level = get_risk_level(step_text)

    impact_map = {
        "safe": "Read-only operation — no production impact",
        "risky": "May affect model behavior — monitor closely after execution",
        "destructive": "Will change production traffic — ensure rollback plan is ready",
    }

    # Set proposed step in state (visible to frontend)
    state_patch = {
        "suggested_runbook_step": step_text,
        "suggested_step_number": current_step + 1,
        "suggested_risk_level": risk_level,
        "suggested_impact": impact_map[risk_level],
    }

    # HITL interrupt — execution pauses here until user responds
    user_decision = interrupt({
        "type": "runbook_approval",
        "step": step_text,
        "step_number": current_step + 1,
        "total_steps": len(runbook_steps),
        "risk_level": risk_level,
        "estimated_impact": impact_map[risk_level],
        "incident_id": incident_id,
    })

    approved = user_decision.get("approved", False)
    override_step = user_decision.get("step")  # user may edit the step text

    timeline = _add_timeline(
        state,
        "user",
        "approved" if approved else "rejected",
        override_step or step_text,
    )

    return {
        **state_patch,
        "timeline": timeline,
        "_hitl_approved": approved,
        "_hitl_step_override": override_step,
    }


# ── Node: execute_remediation ─────────────────────────────────────────────────

def execute_remediation(state: IncidentState) -> dict:
    """
    Execute the approved runbook step via tool calls.
    Updates incident status and runbook_step counter.
    """
    incident_id = state.get("active_incident_id")
    incidents = state.get("incidents", [])
    incident = next((i for i in incidents if i["id"] == incident_id), None)

    if not incident:
        return {}

    current_step = incident.get("runbook_step", 0)
    step_text = state.get("suggested_runbook_step", "")

    # Ask LLM to select and call the appropriate remediation tool
    llm = get_llm()
    tool_prompt = f"""
Execute this runbook step for incident {incident_id} (model: {incident['model_name']}):

Step: {step_text}

Call the most appropriate tool. If no tool applies directly, use update_runbook to log completion.
"""
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=tool_prompt),
    ]
    response = llm.invoke(messages)

    # Advance runbook step
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

    return {
        "messages": [response],
        "incidents": updated_incidents,
        "timeline": timeline,
    }


# ── Node: update_timeline ─────────────────────────────────────────────────────

def update_timeline(state: IncidentState) -> dict:
    """Refresh charts with latest data and check if incident is resolved."""
    incident_id = state.get("active_incident_id")
    incidents = state.get("incidents", [])
    incident = next((i for i in incidents if i["id"] == incident_id), None)

    if not incident:
        return {}

    # Refresh charts with slightly improved data (simulate remediation working)
    if incident.get("status") == "mitigating":
        charts = build_charts_for_incident(
            incident_type=incident["type"],
            model_name=incident["model_name"],
        )
        # Reduce spike magnitude to simulate recovery
        for chart in charts:
            chart["anomaly_windows"] = []  # anomalies clearing
        
        incident_charts = state.get("incident_charts", {})
        incident_charts[incident_id] = charts
        return {"incident_charts": incident_charts}

    return {}


# ── Routing functions ─────────────────────────────────────────────────────────

def route_after_hitl(state: IncidentState) -> Literal["execute", "abort"]:
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
    graph.add_node("update_timeline", update_timeline)

    graph.set_entry_point("classify_incident")
    graph.add_edge("classify_incident", "fetch_metrics")
    graph.add_edge("fetch_metrics", "triage")
    graph.add_edge("triage", "diagnose")
    graph.add_edge("diagnose", "propose_step")

    graph.add_conditional_edges(
        "propose_step",
        route_after_hitl,
        {"execute": "execute_remediation", "abort": END},
    )

    graph.add_edge("execute_remediation", "update_timeline")

    graph.add_conditional_edges(
        "update_timeline",
        is_resolved,
        {"loop": "propose_step", "done": END},
    )

    return graph.compile()


graph = build_incident_graph()
