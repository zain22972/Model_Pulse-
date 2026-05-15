# MLOps Incident Commander — Installation Guide

## 1. Copy Python agent files

```bash
# From the root of Generative-UI-Global-Hackathon-Starter-Kit
cp mlops-incident-commander/agent/src/incident_state.py   apps/agent/src/
cp mlops-incident-commander/agent/src/incident_tools.py   apps/agent/src/
cp mlops-incident-commander/agent/src/incident_prompts.py apps/agent/src/
cp mlops-incident-commander/agent/src/incident_graph.py   apps/agent/src/
cp mlops-incident-commander/agent/main_incident.py        apps/agent/

# Merge langgraph.json — add the "incident" entry:
# "incident": "./main_incident.py:graph"
```

## 2. Copy frontend files

```bash
# Shared event bus
cp mlops-incident-commander/frontend/lib/incidentBus.ts \
   apps/frontend/src/lib/

# API routes
mkdir -p apps/frontend/src/app/api/webhooks/datadog/stream
cp mlops-incident-commander/frontend/app/api/webhooks/datadog/route.ts \
   apps/frontend/src/app/api/webhooks/datadog/
cp mlops-incident-commander/frontend/app/api/webhooks/datadog/stream/route.ts \
   apps/frontend/src/app/api/webhooks/datadog/stream/

# Components
mkdir -p apps/frontend/src/components/mlops
cp mlops-incident-commander/frontend/components/mlops/*.tsx \
   apps/frontend/src/components/mlops/

# Page
mkdir -p apps/frontend/src/app/mlops
cp mlops-incident-commander/frontend/app/mlops/page.tsx \
   apps/frontend/src/app/mlops/
```

## 3. Patch the BFF (apps/bff/src/server.ts)

Open `bff/server-patch.ts` and follow the two diff instructions:

**A. Add the incident LangGraphAgent** to your `CopilotRuntime` agents array.

**B. Add the `/trigger-incident` POST route** before the CopilotKit handler.

## 4. Install frontend dependency (recharts)

```bash
cd apps/frontend
npm install recharts
```

## 5. Verify langgraph.json

```json
{
  "dependencies": ["."],
  "graphs": {
    "default": "./main.py:graph",
    "incident": "./main_incident.py:graph"
  },
  "env": ".env"
}
```

## 6. Restart and test

```bash
npm run dev
```

Navigate to **http://localhost:3010/mlops**

Click any "Fire Mock Alert" button in the bottom-left panel. The agent will:
1. Classify the incident
2. Generate metric charts
3. Run root cause analysis
4. Propose runbook steps one at a time for your approval

---

## Architecture Quick Reference

```
WebhookTriggerPanel (UI)
  → POST /api/webhooks/datadog  (Next.js API route)
      → incidentBus.emit()          → IncidentFeed SSE panel updates
      → POST BFF /trigger-incident  → LangGraph incident graph starts
          → classify_incident node
          → fetch_metrics node      → STATE_DELTA → ChartCanvas re-renders
          → triage + diagnose nodes → reasoning in chat sidebar
          → propose_step (interrupt) → RunbookApprovalCard in chat
          → user approves           → execute_remediation node
          → update_timeline         → TimelinePanel updates
          → loops until resolved
```
