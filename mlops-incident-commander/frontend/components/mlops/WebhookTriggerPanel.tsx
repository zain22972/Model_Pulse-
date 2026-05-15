"use client";
/**
 * WebhookTriggerPanel
 * Developer/demo tool to fire mock Datadog alerts with one click.
 *
 * Place at: apps/frontend/src/components/mlops/WebhookTriggerPanel.tsx
 */

import { useState } from "react";

const ALERT_TYPES = [
  {
    type: "data_drift",
    label: "Data Drift",
    model: "churn-v2",
    icon: "📊",
    color: "orange",
  },
  {
    type: "latency_spike",
    label: "Latency Spike",
    model: "fraud-detector",
    icon: "⚡",
    color: "red",
  },
  {
    type: "accuracy_drop",
    label: "Accuracy Drop",
    model: "recommendation-v5",
    icon: "📉",
    color: "purple",
  },
  {
    type: "throughput_degradation",
    label: "Throughput Drop",
    model: "nlp-classifier",
    icon: "🌊",
    color: "blue",
  },
  {
    type: "feature_skew",
    label: "Feature Skew",
    model: "pricing-model",
    icon: "🔀",
    color: "pink",
  },
] as const;

const COLOR_STYLES: Record<string, string> = {
  orange: "border-orange-800 hover:bg-orange-900/30 text-orange-300",
  red: "border-red-800 hover:bg-red-900/30 text-red-300",
  purple: "border-purple-800 hover:bg-purple-900/30 text-purple-300",
  blue: "border-blue-800 hover:bg-blue-900/30 text-blue-300",
  pink: "border-pink-800 hover:bg-pink-900/30 text-pink-300",
};

type FiringState = "idle" | "firing" | "fired" | "error";

export function WebhookTriggerPanel() {
  const [states, setStates] = useState<Record<string, FiringState>>({});

  const fire = async (alertType: string, model: string) => {
    setStates((s) => ({ ...s, [alertType]: "firing" }));
    try {
      const res = await fetch("/api/webhooks/datadog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert_type: alertType,
          model,
          service: "ml-serving",
          tags: ["env:production", `model:${model}`],
        }),
      });
      if (res.ok) {
        setStates((s) => ({ ...s, [alertType]: "fired" }));
        setTimeout(
          () => setStates((s) => ({ ...s, [alertType]: "idle" })),
          2500
        );
      } else {
        setStates((s) => ({ ...s, [alertType]: "error" }));
      }
    } catch {
      setStates((s) => ({ ...s, [alertType]: "error" }));
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          🔫 Fire Mock Alert
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {ALERT_TYPES.map(({ type, label, model, icon, color }) => {
          const state = states[type] ?? "idle";
          const base = `w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-xs font-mono transition-all cursor-pointer ${COLOR_STYLES[color]} bg-zinc-950/40`;

          return (
            <button
              key={type}
              onClick={() => fire(type, model)}
              disabled={state === "firing"}
              className={base}
            >
              <span className="text-base leading-none">{icon}</span>
              <div className="flex-1 text-left">
                <div className="font-semibold">{label}</div>
                <div className="text-zinc-600">{model}</div>
              </div>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  state === "firing"
                    ? "bg-zinc-700 text-zinc-400 animate-pulse"
                    : state === "fired"
                    ? "bg-emerald-900/60 text-emerald-400"
                    : state === "error"
                    ? "bg-red-900/60 text-red-400"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {state === "firing"
                  ? "Sending…"
                  : state === "fired"
                  ? "✓ Fired"
                  : state === "error"
                  ? "Error"
                  : "Fire"}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-zinc-600 leading-relaxed">
        Each button POSTs a synthetic Datadog monitor alert. The agent will
        classify the incident and begin the remediation runbook.
      </p>
    </div>
  );
}
