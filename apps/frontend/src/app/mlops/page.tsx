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
 * Key design decision: OPTIMISTIC LOCAL STATE
 *   When a user fires an alert, a local "queued" incident is created IMMEDIATELY
 *   in the UI without waiting for the agent (which takes 40-60s). When the agent
 *   finishes and updates state, the real incident replaces the local one.
 *   This means switching between incidents (Data Drift → Latency Spike) is instant.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  CopilotSidebar,
  useAgent,
  useCopilotKit,
  useInterrupt,
} from "@copilotkit/react-core/v2";
import { useCopilotReadable } from "@copilotkit/react-core";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

import { ChartCanvas, ChartSpec } from "@/components/mlops/ChartCanvas";
import { RunbookApprovalCard } from "@/components/mlops/RunbookApprovalCard";
import { RemediationApprovalModal } from "@/components/mlops/RemediationApprovalModal";
import { TimelinePanel, TimelineEntry } from "@/components/mlops/TimelinePanel";
import { WebhookTriggerPanel } from "@/components/mlops/WebhookTriggerPanel";
import { CopilotChatConfigurationProvider } from "@copilotkit/react-core/v2";

// ── Types ─────────────────────────────────────────────────────────────────────

type IncidentStatus = "queued" | "firing" | "investigating" | "mitigating" | "resolved";
type SeverityLevel = "critical" | "high" | "medium" | "low";

interface Incident {
  id: string;
  type: string;
  severity: SeverityLevel;
  model_name: string;
  service: string;
  triggered_at: string;
  status: IncidentStatus;
  runbook_step: number;
  runbook_steps: string[];
  root_cause?: string;
  /** True while the agent hasn't processed this yet */
  isLocal?: boolean;
}

interface IncidentAgentState {
  incidents: Incident[];
  active_incident_id?: string;
  charts: ChartSpec[];
  incident_charts?: Record<string, ChartSpec[]>;
  timeline: TimelineEntry[];
  alerts: object[];
  suggested_runbook_step?: string;
  suggested_step_number?: number;
  suggested_risk_level?: "safe" | "risky" | "destructive";
  suggested_impact?: string;
  hitl_pending?: boolean;
  hitl_pending_incident_id?: string;
}

// ── Styling constants ─────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-400 bg-red-900/30 border-red-800",
  high:     "text-orange-400 bg-orange-900/30 border-orange-800",
  medium:   "text-yellow-400 bg-yellow-900/30 border-yellow-800",
  low:      "text-blue-400 bg-blue-900/30 border-blue-800",
  queued:   "text-zinc-400 bg-zinc-800/50 border-zinc-700",
};

const STATUS_COLORS: Record<string, string> = {
  queued:        "text-zinc-500",
  firing:        "text-red-400",
  investigating: "text-yellow-400",
  mitigating:    "text-blue-400",
  resolved:      "text-emerald-400",
};

const STATUS_DOT: Record<string, string> = {
  queued:        "bg-zinc-600 animate-pulse",
  firing:        "bg-red-500 animate-pulse",
  investigating: "bg-yellow-500 animate-pulse",
  mitigating:    "bg-blue-500",
  resolved:      "bg-emerald-500",
};

// ── Shell: owns incident-selection state and remounts CopilotKit per incident ─

export default function MLOpsPage() {
  // The active thread ID is derived from the selected incident.
  // Keeping this state here (outside CopilotKit context) means we can
  // remount the entire provider — and therefore get a fresh thread —
  // whenever the user switches to a different incident.
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  return (
    <CopilotChatConfigurationProvider
      key={activeThreadId ?? "default"}
      agentId="incident"
    >
      <MLOpsPageInner
        activeThreadId={activeThreadId}
        onThreadChange={setActiveThreadId}
      />
    </CopilotChatConfigurationProvider>
  );
}

// ── Inner component: all agent hooks live here ────────────────────────────────

function MLOpsPageInner({
  activeThreadId,
  onThreadChange,
}: {
  activeThreadId: string | null;
  onThreadChange: (id: string | null) => void;
}) {
  const { agent } = useAgent({ agentId: "incident" });
  const { copilotkit } = useCopilotKit();

  // ── Agent state (arrives async, 40-60s after fire) ────────────────────────
  const state = (agent?.state as IncidentAgentState) ?? {};
  const agentIncidents: Incident[] = state.incidents ?? [];
  const agentCharts = state.charts ?? [];
  const timeline = state.timeline ?? [];
  const activeIncidentId = state.active_incident_id;
  const incidentCharts = state.incident_charts ?? {};

  // ── LOCAL optimistic state (appears immediately on fire) ──────────────────
  // Each entry is a locally-created incident stub that shows in the sidebar
  // instantly. It is keyed by `localKey` (alert_type + model) so we can
  // replace it once the agent returns the real incident.
  const [localIncidents, setLocalIncidents] = useState<Incident[]>([]);

  // ── Merge local + agent incidents for display ─────────────────────────────
  // Rule: if agent has processed an alert_type (same type, model, and triggered
  // within 5 minutes), remove the matching local stub.
  const mergedIncidents: Incident[] = [
    // Keep local incidents that haven't been processed by agent yet
    ...localIncidents.filter((li) => {
      const firedAt = new Date(li.triggered_at).getTime();
      return !agentIncidents.some(
        (ai) =>
          ai.type === li.type &&
          ai.model_name === li.model_name &&
          Math.abs(new Date(ai.triggered_at).getTime() - firedAt) < 5 * 60 * 1000
      );
    }),
    // All real agent incidents
    ...agentIncidents,
  ];

  // ── Which incident the user is currently viewing ──────────────────────────
  const [viewIncidentId, setViewIncidentId] = useState<string | null>(null);
  const latestIncidentIdRef = useRef<string | null>(null);

  // Switch view to a different incident. Only remounts the CopilotKit
  // provider (new thread) when the user MANUALLY clicks a different incident
  // that already has a real ID — never on auto-assignment from the agent.
  const handleSelectIncident = useCallback(
    (id: string, { manual = false }: { manual?: boolean } = {}) => {
      setViewIncidentId(id);
      // Only create a new thread when the user explicitly clicks a
      // DIFFERENT real incident. This prevents the remount loop where
      // the agent assigns an ID → triggers onThreadChange → remounts →
      // wipes state.
      const isLocal = id.startsWith("LOCAL-");
      if (manual && !isLocal) {
        onThreadChange(id);
      }
    },
    [onThreadChange]
  );

  // When agent finishes and produces a real incident, auto-select it
  // (but only if we were viewing its local stub, or nothing)
  useEffect(() => {
    if (!activeIncidentId) return;
    const isNew = activeIncidentId !== latestIncidentIdRef.current;
    latestIncidentIdRef.current = activeIncidentId;
    if (isNew) {
      // Remove the local stub that matches this agent incident
      const realIncident = agentIncidents.find((i) => i.id === activeIncidentId);
      if (realIncident) {
        setLocalIncidents((prev) =>
          prev.filter(
            (li) =>
              !(
                li.type === realIncident.type &&
                li.model_name === realIncident.model_name
              )
          )
        );
        handleSelectIncident(activeIncidentId, { manual: false });
      }
    }
  }, [activeIncidentId, agentIncidents, handleSelectIncident]);

  // Find the incident the user is viewing (may be a local stub or real)
  const viewedIncident: Incident | undefined = mergedIncidents.find(
    (i) => i.id === (viewIncidentId ?? activeIncidentId)
  );

  // ── CopilotReadable: keep agent aware of which incident user is viewing ───
  useCopilotReadable({
    description:
      "ACTIVE INCIDENT CONTEXT — This is the ONLY incident you should investigate.",
    value: viewedIncident && !viewedIncident.isLocal
      ? {
          id: viewedIncident.id,
          type: viewedIncident.type,
          model: viewedIncident.model_name,
          service: viewedIncident.service,
          severity: viewedIncident.severity,
          status: viewedIncident.status,
          switched_at: new Date().toISOString(),
        }
      : null,
  });

  // ── HITL: poll agent.state for pending approvals ──────────────────────────
  const [showHitlModal, setShowHitlModal] = useState(false);
  const activeResolveRef = useRef<((value: any) => void) | null>(null);

  // Poll agent.state every second to detect hitl_pending
  useEffect(() => {
    const interval = setInterval(() => {
      const s = (agent?.state as IncidentAgentState) ?? {};
      const shouldShow = !!(s.hitl_pending === true && viewedIncident && !viewedIncident.isLocal && !activeResolveRef.current);
      setShowHitlModal(shouldShow);
    }, 1000);
    return () => clearInterval(interval);
  }, [agent, viewedIncident?.id, viewedIncident?.isLocal]);

  const handleHITLDecision = useCallback((approved: boolean, step?: string) => {
    if (!agent) return;

    const stepText = step || state.suggested_runbook_step || "";
    const msgPayload = JSON.stringify({ approved, step: stepText });
    const msgContent = `[HITL_DECISION]: ${msgPayload}`;

    agent.addMessage({
      id: typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `hitl-${Date.now()}`,
      role: "user",
      content: msgContent,
    });

    void agent.runAgent().catch((err: unknown) => {
      console.error("handleHITLDecision: runAgent failed", err);
    });
    setShowHitlModal(false);
  }, [agent, state.suggested_runbook_step]);

  // Also try useInterrupt as a primary mechanism
  useInterrupt({
    render: ({ event, resolve }) => {
      if (event.value?.type !== "runbook_approval") return <></>;
      const cardIncidentId = event.value.incident_id;
      if (cardIncidentId && latestIncidentIdRef.current && cardIncidentId !== latestIncidentIdRef.current) {
        resolve({ approved: false, reason: "Preempted" });
        return <></>;
      }
      activeResolveRef.current = resolve;
      const modalIncident = mergedIncidents.find((i) => i.id === cardIncidentId) || viewedIncident;

      const handleApprove = (editedStep: string) => {
        activeResolveRef.current = null; setShowHitlModal(false);
        resolve({ approved: true, step: editedStep });
      };
      const handleReject = (reason: string) => {
        activeResolveRef.current = null; setShowHitlModal(false);
        resolve({ approved: false, reason });
      };

      setShowHitlModal(true);
      // Bug fix: only render RunbookApprovalCard in sidebar; RemediationApprovalModal
      // is rendered separately in the center panel via showHitlModal state.
      return (
        <RunbookApprovalCard
          incidentId={cardIncidentId}
          step={event.value.step ?? ""}
          stepNumber={event.value.step_number ?? 1}
          totalSteps={event.value.total_steps ?? 1}
          riskLevel={(event.value.risk_level as "safe" | "risky" | "destructive") ?? "risky"}
          estimatedImpact={event.value.estimated_impact ?? ""}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      );
    },
  });

  // ── Keyboard shortcut: F = focus trigger panel ───────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") {
        if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
        document.getElementById("webhook-trigger-panel")?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── handleFire: INSTANT UI + background agent trigger ────────────────────
  const handleFire = useCallback(
    (alertType: string, model: string) => {
      if (!agent) return;

      // 1. Create a local stub IMMEDIATELY — no waiting for agent
      const localId = `LOCAL-${Date.now()}`;
      const newLocalIncident: Incident = {
        id: localId,
        type: alertType,
        severity: "high",      // optimistic; agent will correct this
        model_name: model,
        service: "ml-serving",
        triggered_at: new Date().toISOString(),
        status: "queued",
        runbook_step: 0,
        runbook_steps: [],
        isLocal: true,
      };

      setLocalIncidents((prev) => {
        // Replace if same type+model already queued (user re-fired same button)
        const filtered = prev.filter(
          (li) => !(li.type === alertType && li.model_name === model)
        );
        return [...filtered, newLocalIncident];
      });

      // 2. Immediately switch the view to this new local incident
      handleSelectIncident(localId);

      // 2b. Toast notification
      toast.info(`Alert fired: ${alertType.replace(/_/g, " ")}`, {
        description: `Model: ${model} — agent is investigating…`,
      });

      // 3. Dismiss any active HITL interrupt
      if (activeResolveRef.current) {
        activeResolveRef.current({ approved: false, reason: "Preempted by new alert" });
        activeResolveRef.current = null;
      }

      // 4. Abort any in-progress agent streaming
      agent.abortRun();

      // 5. After a brief settle, send the alert to the agent and kick off run
      setTimeout(() => {
        const msgId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `msg-${Date.now()}`;

        const payload = JSON.stringify({
          alert_type: alertType,
          model,
          service: "ml-serving",
          triggered_at: new Date().toISOString(),
          tags: ["env:production", `model:${model}`],
        });

        agent.addMessage({
          id: msgId,
          role: "user",
          content: `🚨 ALERT: ${alertType.replace(/_/g, " ").toUpperCase()} on model ${model}.\n\n[DATA]: ${payload}`,
        });

        void agent.runAgent().catch((err: unknown) => {
          console.error("handleFire: runAgent failed", err);
        });
      }, 80);
    },
    [agent]
  );

  // ── Chart / timeline display ──────────────────────────────────────────────
  const displayCharts =
    viewedIncident && !viewedIncident.isLocal
      ? (incidentCharts[viewedIncident.id] ?? agentCharts)
      : agentCharts;

  const displayTimeline = timeline.filter(
    (t: any) =>
      !t.incident_id ||
      t.incident_id === (viewedIncident?.isLocal ? null : viewedIncident?.id)
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* ── LEFT: Incident feed + trigger ──────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-r border-zinc-800 flex flex-col">

        {/* Viewed incident banner */}
        {viewedIncident && (
          <div
            className={`border-b px-4 py-3 text-xs ${
              SEVERITY_COLORS[viewedIncident.isLocal ? "queued" : viewedIncident.severity]
            } border-current`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wide">
                {viewedIncident.isLocal ? "QUEUED" : viewedIncident.id}
              </span>
              <span className={`font-semibold ${STATUS_COLORS[viewedIncident.status]}`}>
                {viewedIncident.status}
              </span>
            </div>
            <div className="text-zinc-400 mt-0.5">
              {viewedIncident.isLocal
                ? `Sending to agent… ${viewedIncident.type.replace(/_/g, " ")}`
                : `${viewedIncident.model_name} — step ${viewedIncident.runbook_step}/${viewedIncident.runbook_steps?.length ?? "?"}`}
            </div>
          </div>
        )}

        {/* Live feed */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 border-b border-zinc-800">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Live Incidents
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>

          {mergedIncidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-600 text-xs text-center gap-2">
              <span className="text-2xl">📡</span>
              <span>Listening for alerts…</span>
              <span className="text-zinc-700">Use the trigger panel below</span>
            </div>
          ) : (
            mergedIncidents.map((incident) => (
              <div
                key={incident.id}
                onClick={() => handleSelectIncident(incident.id, { manual: true })}
                className={`cursor-pointer rounded-lg border p-3 space-y-2 text-xs font-mono transition-all ${
                  viewIncidentId === incident.id
                    ? "bg-zinc-800 border-zinc-500"
                    : "bg-zinc-900/80 border-zinc-800 hover:bg-zinc-800/80"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        STATUS_DOT[incident.status] ?? "bg-zinc-600"
                      }`}
                    />
                    <span className="font-semibold text-zinc-100 uppercase">
                      {incident.type.replace(/_/g, " ")}
                    </span>
                  </div>
                  {incident.isLocal ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-zinc-800 text-zinc-500 border border-zinc-700 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-ping inline-block" />
                      QUEUED
                    </span>
                  ) : (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        SEVERITY_COLORS[incident.severity]
                      }`}
                    >
                      {incident.severity}
                    </span>
                  )}
                </div>

                <div className="text-zinc-400">
                  <span className="block truncate">Model: {incident.model_name}</span>
                  <span className="block truncate">
                    {incident.isLocal ? "🕐 Waiting for agent…" : `Service: ${incident.service}`}
                  </span>
                </div>

                <div className="flex items-center justify-between text-zinc-600 text-[10px]">
                  <span>{incident.isLocal ? "LOCAL" : incident.id}</span>
                  <span>{new Date(incident.triggered_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Trigger panel */}
        <div id="webhook-trigger-panel" className="p-3 bg-zinc-950">
          <WebhookTriggerPanel onFire={handleFire} />
        </div>
      </div>

      {/* ── CENTER: Charts + Timeline ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-zinc-100">
              {viewedIncident
                ? `${viewedIncident.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} — Incident`
                : "MLOps Incident Commander"}
            </h1>
            <p className="text-xs text-zinc-500">
              {viewedIncident?.isLocal
                ? "⏳ Agent is analysing this incident…"
                : viewedIncident?.root_cause
                ? `Root cause: ${viewedIncident.root_cause}`
                : "AI-powered incident response for production ML systems"}
            </p>
          </div>

          {/* Agent running indicator */}
          {agent?.isRunning && (
            <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-900 border border-zinc-700 rounded-full px-3 py-1.5">
              <div className="w-3 h-3 border border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
              Agent analysing…
            </div>
          )}
        </div>

          {/* Charts area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Queued incident placeholder */}
          {viewedIncident?.isLocal ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-64 rounded-xl border border-zinc-800 bg-zinc-900/40 gap-4"
            >
              <div className="w-10 h-10 border-2 border-indigo-700 border-t-indigo-400 rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-zinc-300 font-medium text-sm">
                  {viewedIncident.type.replace(/_/g, " ").toUpperCase()}
                </p>
                <p className="text-zinc-500 text-xs mt-1">
                  Agent is running diagnostics on <span className="text-zinc-400">{viewedIncident.model_name}</span>…
                </p>
                <p className="text-zinc-700 text-xs mt-3">This takes ~40 seconds. You can switch to another incident below.</p>
              </div>
            </motion.div>
          ) : (
            <div className="relative">
              {agent?.isRunning && !viewedIncident?.isLocal && (
                <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-xl border border-zinc-800/50">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
                    <span className="text-xs font-medium text-zinc-400 tracking-wider uppercase">
                      Agent Analysing…
                    </span>
                  </div>
                </div>
              )}
              <ChartCanvas charts={displayCharts} />
              {showHitlModal && (
                <RemediationApprovalModal
                  incident={viewedIncident!}
                  step={state.suggested_runbook_step ?? ""}
                  stepNumber={state.suggested_step_number ?? 1}
                  totalSteps={viewedIncident!.runbook_steps?.length ?? 1}
                  riskLevel={state.suggested_risk_level ?? "risky"}
                  estimatedImpact={state.suggested_impact ?? ""}
                  onApprove={(editedStep) => handleHITLDecision(true, editedStep)}
                  onReject={() => handleHITLDecision(false)}
                />
              )}
            </div>
          )}

          {/* Timeline */}
          {displayTimeline.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Incident Timeline
              </h2>
              <TimelinePanel entries={displayTimeline} />
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: CopilotKit sidebar ──────────────────────────────────── */}
      <CopilotSidebar
        defaultOpen
        agentId="incident"
        className="!w-96 !border-l !border-zinc-800"
      />
    </div>
  );
}
