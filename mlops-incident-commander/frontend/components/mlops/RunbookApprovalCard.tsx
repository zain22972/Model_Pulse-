"use client";
/**
 * RunbookApprovalCard
 * Renders inside the CopilotKit chat sidebar when the agent proposes
 * a runbook step and waits for human approval (HITL interrupt).
 *
 * Place at: apps/frontend/src/components/mlops/RunbookApprovalCard.tsx
 */

import { useState } from "react";

type RiskLevel = "safe" | "risky" | "destructive";

interface Props {
  step: string;
  stepNumber: number;
  totalSteps: number;
  riskLevel: RiskLevel;
  estimatedImpact: string;
  incidentId?: string;
  onApprove: (step: string) => void;
  onReject: (reason: string) => void;
}

const RISK_CONFIG: Record<
  RiskLevel,
  { label: string; color: string; bg: string; border: string; icon: string }
> = {
  safe: {
    label: "Safe",
    color: "text-emerald-400",
    bg: "bg-emerald-950/40",
    border: "border-emerald-800",
    icon: "✓",
  },
  risky: {
    label: "Risky",
    color: "text-amber-400",
    bg: "bg-amber-950/40",
    border: "border-amber-800",
    icon: "⚠",
  },
  destructive: {
    label: "Destructive",
    color: "text-red-400",
    bg: "bg-red-950/40",
    border: "border-red-800",
    icon: "✕",
  },
};

export function RunbookApprovalCard({
  step,
  stepNumber,
  totalSteps,
  riskLevel,
  estimatedImpact,
  incidentId,
  onApprove,
  onReject,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editedStep, setEditedStep] = useState(step);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [done, setDone] = useState(false);

  const risk = RISK_CONFIG[riskLevel];

  const handleApprove = () => {
    setDone(true);
    onApprove(editedStep);
  };

  const handleReject = () => {
    setDone(true);
    onReject(rejectReason || "Rejected by operator");
  };

  if (done) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-500">
        Step {stepNumber} response recorded.
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border ${risk.border} ${risk.bg} p-4 space-y-3 text-sm font-mono`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-sans text-zinc-400 uppercase tracking-wider">
            Runbook Step {stepNumber} / {totalSteps}
          </span>
          {incidentId && (
            <span className="text-[10px] font-sans text-zinc-500 uppercase tracking-tight">
              Incident: {incidentId}
            </span>
          )}
        </div>
        <span className={`text-xs font-bold ${risk.color} flex items-center gap-1`}>
          <span>{risk.icon}</span> {risk.label}
        </span>
      </div>

      {/* Step text */}
      {editing ? (
        <textarea
          value={editedStep}
          onChange={(e) => setEditedStep(e.target.value)}
          className="w-full rounded-lg bg-zinc-800 border border-zinc-600 text-zinc-100 p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          rows={3}
        />
      ) : (
        <p className="text-zinc-100 leading-relaxed">{editedStep}</p>
      )}

      {/* Impact */}
      <p className="text-xs text-zinc-400 font-sans">
        <span className="text-zinc-500">Impact: </span>
        {estimatedImpact}
      </p>

      {/* Reject reason */}
      {rejecting && (
        <input
          placeholder="Reason for rejection (optional)"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          className="w-full rounded-lg bg-zinc-800 border border-zinc-600 text-zinc-100 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
        />
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleApprove}
          className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2 px-4 transition-colors"
        >
          ✓ Approve & Execute
        </button>

        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-semibold py-2 px-3 transition-colors"
          >
            Edit
          </button>
        )}

        {editing && (
          <button
            onClick={() => setEditing(false)}
            className="rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold py-2 px-3 transition-colors"
          >
            Save edit
          </button>
        )}

        {!rejecting ? (
          <button
            onClick={() => setRejecting(true)}
            className="rounded-lg bg-zinc-800 hover:bg-red-900 border border-zinc-600 text-zinc-400 hover:text-red-400 text-xs font-semibold py-2 px-3 transition-colors"
          >
            Reject
          </button>
        ) : (
          <button
            onClick={handleReject}
            className="rounded-lg bg-red-800 hover:bg-red-700 text-white text-xs font-semibold py-2 px-3 transition-colors"
          >
            Confirm reject
          </button>
        )}
      </div>
    </div>
  );
}
