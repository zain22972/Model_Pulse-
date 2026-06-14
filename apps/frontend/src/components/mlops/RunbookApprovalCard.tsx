"use client";
/**
 * RunbookApprovalCard
 * - Step text: font-sans (not font-mono)
 * - Step progress bar at top
 * - Enter = approve, Esc = reject (keyboard)
 * - Micro-animations on approve/reject buttons
 */

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";

type RiskLevel = "safe" | "risky" | "destructive";

interface Props {
  incidentId?: string;
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
  incidentId,
  step,
  stepNumber,
  totalSteps,
  riskLevel,
  estimatedImpact,
  onApprove,
  onReject,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editedStep, setEditedStep] = useState(step);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [done, setDone] = useState(false);

  const risk = RISK_CONFIG[riskLevel];
  const progressPct = Math.round((stepNumber / totalSteps) * 100);

  const handleApprove = useCallback(() => {
    setDone(true);
    onApprove(editedStep);
  }, [editedStep, onApprove]);

  const handleReject = useCallback(() => {
    setDone(true);
    onReject(rejectReason || "Rejected by operator");
  }, [rejectReason, onReject]);

  // Keyboard: Enter = approve, Esc = reject
  useEffect(() => {
    if (done || editing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleApprove(); }
      if (e.key === "Escape") { e.preventDefault(); handleReject(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [done, editing, handleApprove, handleReject]);

  if (done) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-500">
        Step {stepNumber} response recorded.
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${risk.border} ${risk.bg} overflow-hidden`}>
      {/* Step progress bar */}
      <div className="h-1 w-full bg-zinc-800/60">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="h-full bg-indigo-500"
        />
      </div>

      <div className="p-4 space-y-3 text-sm">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-sans text-zinc-500 uppercase tracking-tighter">
              {incidentId ?? "Unknown Incident"}
            </span>
            <span className="text-xs font-sans text-zinc-400 uppercase tracking-wider">
              Runbook Step {stepNumber} / {totalSteps}
            </span>
          </div>
          <span className={`text-xs font-bold ${risk.color} flex items-center gap-1`}>
            <span>{risk.icon}</span> {risk.label}
          </span>
        </div>

        {/* Step text — font-sans */}
        {editing ? (
          <textarea
            value={editedStep}
            onChange={(e) => setEditedStep(e.target.value)}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-600 text-zinc-100 p-2 text-sm font-sans resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
            rows={3}
          />
        ) : (
          <p className="text-zinc-100 leading-relaxed font-sans">{editedStep}</p>
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
            className="w-full rounded-lg bg-zinc-800 border border-zinc-600 text-zinc-100 px-3 py-2 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        )}

        {/* Keyboard hint */}
        <p className="text-[10px] text-zinc-600 font-sans">
          <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 font-mono">Enter</kbd> approve ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 font-mono">Esc</kbd> reject
        </p>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <motion.button
            whileHover={{ scale: 1.03, backgroundColor: "#10b981" }}
            whileTap={{ scale: 0.96 }}
            onClick={handleApprove}
            className="flex-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold py-2 px-4 transition-colors"
          >
            ✓ Approve & Execute
          </motion.button>

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
              className="rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-semibold py-2 px-3 transition-colors"
            >
              Save edit
            </button>
          )}

          {!rejecting ? (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setRejecting(true)}
              className="rounded-lg bg-zinc-800 hover:bg-red-900 border border-zinc-600 text-zinc-400 hover:text-red-400 text-xs font-semibold py-2 px-3 transition-colors"
            >
              Reject
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleReject}
              className="rounded-lg bg-red-800 hover:bg-red-700 text-white text-xs font-semibold py-2 px-3 transition-colors"
            >
              Confirm reject
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
