"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

type RiskLevel = "safe" | "risky" | "destructive";
type IncidentStatus = "queued" | "firing" | "investigating" | "mitigating" | "resolved";
type SeverityLevel = "critical" | "high" | "medium" | "low";

export interface Incident {
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
  isLocal?: boolean;
}

interface Props {
  incident: Incident;
  step: string;
  stepNumber: number;
  totalSteps: number;
  riskLevel: RiskLevel;
  estimatedImpact: string;
  onApprove: (step: string) => void;
  onReject: (reason: string) => void;
}

const RISK_CONFIG: Record<
  RiskLevel,
  { label: string; color: string; bg: string; border: string; icon: string; fillColor: string; fillPct: number }
> = {
  safe: {
    label: "Safe",
    color: "text-emerald-400",
    bg: "bg-emerald-950/40",
    border: "border-emerald-800",
    icon: "✓",
    fillColor: "bg-emerald-500",
    fillPct: 25,
  },
  risky: {
    label: "Risky",
    color: "text-amber-400",
    bg: "bg-amber-950/40",
    border: "border-amber-800",
    icon: "⚠",
    fillColor: "bg-amber-500",
    fillPct: 60,
  },
  destructive: {
    label: "Destructive",
    color: "text-red-400",
    bg: "bg-red-950/40",
    border: "border-red-800",
    icon: "✕",
    fillColor: "bg-red-500",
    fillPct: 90,
  },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-400 bg-red-900/30 border-red-800",
  high: "text-orange-400 bg-orange-900/30 border-orange-800",
  medium: "text-yellow-400 bg-yellow-900/30 border-yellow-800",
  low: "text-blue-400 bg-blue-900/30 border-blue-800",
};

export function RemediationApprovalModal({
  incident,
  step,
  stepNumber,
  totalSteps,
  riskLevel,
  estimatedImpact,
  onApprove,
  onReject,
}: Props) {
  const [editedStep, setEditedStep] = useState(step);
  const [status, setStatus] = useState<"pending" | "approved" | "denied">("pending");

  const risk = RISK_CONFIG[riskLevel];
  const severityBadge = SEVERITY_COLORS[incident.severity] || "text-zinc-400 bg-zinc-900/30 border-zinc-800";

  const handleApprove = useCallback(() => {
    setStatus("approved");
    onApprove(editedStep);
  }, [editedStep, onApprove]);

  const handleReject = useCallback(() => {
    setStatus("denied");
    onReject("Rejected by operator");
  }, [onReject]);

  // Keyboard: Enter = approve, Esc = reject
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (status !== "pending") return;
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleApprove(); }
      if (e.key === "Escape") { e.preventDefault(); handleReject(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [status, handleApprove, handleReject]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-zinc-950/80 p-4"
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 16 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className={`w-full max-w-2xl overflow-hidden rounded-xl border bg-zinc-900 shadow-2xl ${risk.border}`}
        >
          {/* Risk level fill bar */}
          <div className="h-1 w-full bg-zinc-800">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${risk.fillPct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className={`h-full ${risk.fillColor}`}
            />
          </div>

          {/* Header */}
          <div className={`border-b ${risk.border} bg-zinc-950/50 p-4 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <span className="text-xl">🚨</span>
              <div>
                <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                  Remediation Required
                  <span className={`px-2 py-0.5 text-[10px] uppercase rounded border ${severityBadge}`}>
                    {incident.severity}
                  </span>
                </h3>
                <p className="text-xs text-zinc-400 font-mono mt-1">
                  {incident.id} • Step {stepNumber} of {totalSteps}
                </p>
              </div>
            </div>
            <span className={`px-3 py-1 text-xs font-bold rounded-full border ${risk.bg} ${risk.border} ${risk.color} flex items-center gap-1.5`}>
              <span>{risk.icon}</span> {risk.label} Risk
            </span>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {status === "pending" && (
              <>
                {/* Step text editor */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    Proposed Action
                  </label>
                  <textarea
                    value={editedStep}
                    onChange={(e) => setEditedStep(e.target.value)}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 p-3 font-mono text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    rows={3}
                  />
                </div>

                {/* Impact summary */}
                <div className="rounded-lg bg-zinc-950/50 border border-zinc-800 p-3 flex gap-3 items-start text-sm">
                  <span className="text-zinc-500 mt-0.5">ℹ️</span>
                  <div>
                    <span className="font-semibold text-zinc-300 block mb-1">Estimated Impact</span>
                    <span className="text-zinc-400">{estimatedImpact}</span>
                  </div>
                </div>

                {/* Visual Preview */}
                <div className="flex items-center justify-between bg-zinc-950/30 border border-zinc-800/50 rounded-lg p-3">
                  <div className="flex flex-col items-center">
                    <span className="text-red-400 text-xs mb-1">Anomalous</span>
                    <div className="w-24 h-12 bg-red-900/20 border border-red-800/50 rounded flex items-end">
                      <div className="w-full h-8 bg-red-500/20" style={{ clipPath: "polygon(0 80%, 20% 80%, 40% 20%, 60% 0, 80% 20%, 100% 80%, 100% 100%, 0 100%)" }} />
                    </div>
                  </div>
                  <div className="text-zinc-500">→</div>
                  <div className="flex flex-col items-center">
                    <span className="text-emerald-400 text-xs mb-1">Resolved</span>
                    <div className="w-24 h-12 bg-emerald-900/20 border border-emerald-800/50 rounded flex items-end">
                      <div className="w-full h-8 bg-emerald-500/20" style={{ clipPath: "polygon(0 80%, 20% 80%, 40% 70%, 60% 80%, 80% 70%, 100% 80%, 100% 100%, 0 100%)" }} />
                    </div>
                  </div>
                </div>

                {/* Keyboard hint */}
                <p className="text-[10px] text-zinc-600 text-center">
                  <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 font-mono">Enter</kbd> to approve &nbsp;·&nbsp;
                  <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 font-mono">Esc</kbd> to reject
                </p>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleReject}
                    className="flex-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-red-400 hover:text-red-300 font-semibold py-3 px-4 transition-colors text-sm"
                  >
                    ✕ Deny — Keep Investigating
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleApprove}
                    className="flex-[2] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-4 transition-colors text-sm shadow-lg shadow-emerald-900/20"
                  >
                    ✓ Apply Fix & Execute
                  </motion.button>
                </div>
              </>
            )}

            {status === "approved" && (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <div className="w-8 h-8 border-2 border-emerald-700 border-t-emerald-400 rounded-full animate-spin" />
                <div className="text-center">
                  <p className="text-emerald-400 font-medium">Executing…</p>
                  <p className="text-zinc-500 text-sm mt-1">Chart updating…</p>
                </div>
              </div>
            )}

            {status === "denied" && (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <div className="text-red-400 text-2xl">✕</div>
                <div className="text-center">
                  <p className="text-zinc-300 font-medium">Step Denied</p>
                  <p className="text-zinc-500 text-sm mt-1">Incident remains open. Re-fire or approve a later step.</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
