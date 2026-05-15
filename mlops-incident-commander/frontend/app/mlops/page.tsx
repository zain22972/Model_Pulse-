"use client";
/**
 * /mlops page — MLOps Incident Commander
 *
 * Layout:
 *   Left (280px)   — IncidentFeed (live SSE) + WebhookTriggerPanel
 *   Center (flex)  — ChartCanvas (metric charts from agent state)
 *                  + TimelinePanel (audit trail)
 *   Right (320px)  — CopilotKit chat sidebar (agent reasoning + HITL cards)
 *
 * Place at: apps/frontend/src/app/mlops/page.tsx
 */

import {
  CopilotKit,
  useCoAgent,
  useCopilotAction,
} from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

import { ChartCanvas, ChartSpec } from "@/components/mlops/ChartCanvas";
import { IncidentFeed } from "@/components/mlops/IncidentFeed";
import { RunbookApprovalCard } from "@/components/mlops/RunbookApprovalCard";
import { TimelinePanel, TimelineEntry } from "@/components/mlops/TimelinePanel";
import { WebhookTriggerPanel } from "@/components/mlops/WebhookTriggerPanel";

// ── Agent state shape ─────────────────────────────────────────────────────────

type IncidentStatus = "firing" | "investigating" | "mitigating" | "resolved";

interface Incident {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  model_name: string;
  service: string;
  triggered_at: string;
  status: IncidentStatus;
  runbook_step: number;
  runbook_steps: string[];
  root_cause?: string;
}

interface IncidentAgentState {
  incidents: Incident[];
  active_incident_id?: string;
  incident_charts: Record<string, ChartSpec[]>;
  timeline: TimelineEntry[];
  alerts: object[];
  suggested_runbook_step?: string;
  suggested_step_number?: number;
  suggested_risk_level?: "safe" | "risky" | "destructive";
  suggested_impact?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-400 bg-red-900/30 border-red-800",
  high:     "text-orange-400 bg-orange-900/30 border-orange-800",
  medium:   "text-yellow-400 bg-yellow-900/30 border-yellow-800",
  low:      "text-blue-400 bg-blue-900/30 border-blue-800",
};

const STATUS_COLORS: Record<string, string> = {
  firing:        "text-red-400",
  investigating: "text-yellow-400",
  mitigating:    "text-blue-400",
  resolved:      "text-emerald-400",
};

// ── Inner app (needs CopilotKit context) ─────────────────────────────────────

function IncidentCommander() {
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const latestIncidentIdRef = useRef<string | null>(null);

  const { state } = useCoAgent<IncidentAgentState>({
    name: "incident",
    initialState: {
      incidents: [],
      incident_charts: {},
      timeline: [],
      alerts: [],
    },
  });

  // Keep track of the latest active incident to resolve interrupts
  useEffect(() => {
    if (state.active_incident_id) {
      latestIncidentIdRef.current = state.active_incident_id;
      // Auto-select the active one if none selected
      if (!selectedIncidentId) {
        setSelectedIncidentId(state.active_incident_id);
      }
    }
  }, [state.active_incident_id]);

  const activeIncident = state.incidents?.find(
    (i) => i.id === state.active_incident_id
  );

  // HITL: RunbookApprovalCard
  useCopilotAction({
    name: "proposeRunbookStep",
    parameters: [
      { name: "step",             type: "string" },
      { name: "step_number",      type: "number" },
      { name: "total_steps",      type: "number" },
      { name: "risk_level",       type: "string" },
      { name: "estimated_impact", type: "string" },
      { name: "incident_id",      type: "string" },
    ],
    renderAndWaitForResponse: ({ args, respond, status }) => {
      // INTERRUPT RESOLUTION: If a new incident started, don't show this old card
      const isStale = args.incident_id !== latestIncidentIdRef.current;
      if (isStale && status === "executing") {
        respond?.({ approved: false, reason: "New incident preempted this one" });
        return null;
      }

      return (
        <RunbookApprovalCard
          incidentId={args.incident_id}
          step={args.step ?? ""}
          stepNumber={args.step_number ?? 1}
          totalSteps={args.total_steps ?? 1}
          riskLevel={(args.risk_level as "safe" | "risky" | "destructive") ?? "risky"}
          estimatedImpact={args.estimated_impact ?? ""}
          onApprove={(editedStep) => respond?.({ approved: true, step: editedStep })}
          onReject={(reason) => respond?.({ approved: false, reason })}
        />
      );
    },
  });

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* ── LEFT: Incident feed + trigger ─────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-r border-zinc-800 flex flex-col">
        {/* Active incident banner */}
        {activeIncident && (
          <div
            className={`border-b px-4 py-3 text-xs ${
              SEVERITY_COLORS[activeIncident.severity]
            } border-current`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wide">
                {activeIncident.id}
              </span>
              <span className={`font-semibold ${STATUS_COLORS[activeIncident.status]}`}>
                {activeIncident.status}
              </span>
            </div>
            <div className="text-zinc-400 mt-0.5">
              {activeIncident.model_name} — step {activeIncident.runbook_step}/
              {activeIncident.runbook_steps?.length ?? "?"}
            </div>
          </div>
        )}

        {/* Live feed */}
        <div className="flex-1 overflow-hidden">
          <IncidentFeed 
            selectedId={selectedIncidentId ?? undefined}
            onSelect={(id) => setSelectedIncidentId(id)}
          />
        </div>

        {/* Trigger panel */}
        <div className="p-3 border-t border-zinc-800">
          <WebhookTriggerPanel />
        </div>
      </div>

      {/* ── CENTER: Charts + Timeline ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-zinc-100">
              MLOps Incident Commander
            </h1>
            <p className="text-xs text-zinc-500">
              AI-powered incident response for production ML systems
            </p>
          </div>
          {activeIncident?.root_cause && (
            <div className="text-xs text-zinc-400 max-w-sm text-right leading-snug">
              <span className="text-zinc-600">Root cause: </span>
              {activeIncident.root_cause}
            </div>
          )}
        </div>

        {/* Charts */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <ChartCanvas charts={state.incident_charts?.[selectedIncidentId ?? ""] ?? []} />

          {/* Timeline */}
          {(state.timeline?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Incident Timeline
              </h2>
              <TimelinePanel entries={state.timeline ?? []} />
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: CopilotKit sidebar ──────────────────────────────────────── */}
      <CopilotSidebar
        defaultOpen
        labels={{
          title: "Incident Commander",
          initial:
            "I'm monitoring your ML systems. Fire a mock alert from the left panel to start an incident response workflow, or describe an issue you're seeing.",
        }}
        className="!w-80 !border-l !border-zinc-800"
      />
    </div>
  );
}

// ── Page export (wraps with CopilotKit) ───────────────────────────────────────

export default function MLOpsPage() {
  const runtimeUrl = process.env.NEXT_PUBLIC_COPILOT_RUNTIME_URL ?? "http://localhost:4000/copilotkit";

  return (
    <CopilotKit runtimeUrl={runtimeUrl} agent="incident">
      <IncidentCommander />
    </CopilotKit>
  );
}
