"use client";
/**
 * IncidentFeed
 * Subscribes to GET /api/webhooks/datadog/stream (SSE) and displays
 * a live feed of incoming alerts in the left panel.
 *
 * Place at: apps/frontend/src/components/mlops/IncidentFeed.tsx
 */

import { useEffect, useRef, useState } from "react";

type Severity = "critical" | "high" | "medium" | "low";

interface IncidentEvent {
  id: string;
  alert_type: string;
  model: string;
  service: string;
  value: number;
  threshold: number;
  severity: Severity;
  triggered_at: string;
  tags: string[];
}

const SEVERITY_STYLES: Record<Severity, { dot: string; badge: string; border: string }> = {
  critical: {
    dot: "bg-red-500 animate-pulse",
    badge: "bg-red-900/50 text-red-400 border border-red-800",
    border: "border-red-900",
  },
  high: {
    dot: "bg-orange-500",
    badge: "bg-orange-900/50 text-orange-400 border border-orange-800",
    border: "border-orange-900",
  },
  medium: {
    dot: "bg-yellow-500",
    badge: "bg-yellow-900/50 text-yellow-400 border border-yellow-800",
    border: "border-yellow-900",
  },
  low: {
    dot: "bg-blue-500",
    badge: "bg-blue-900/50 text-blue-400 border border-blue-800",
    border: "border-blue-900",
  },
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  data_drift: "Data Drift",
  latency_spike: "Latency Spike",
  accuracy_drop: "Accuracy Drop",
  throughput_degradation: "Throughput Drop",
  feature_skew: "Feature Skew",
};

interface IncidentCardProps {
  event: IncidentEvent;
}

function IncidentCard({ event }: IncidentCardProps) {
  const s = SEVERITY_STYLES[event.severity];
  const time = new Date(event.triggered_at).toLocaleTimeString();

  return (
    <div
      className={`rounded-lg border ${s.border} bg-zinc-900/80 p-3 space-y-2 text-xs font-mono transition-all`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
          <span className="font-semibold text-zinc-100">
            {ALERT_TYPE_LABELS[event.alert_type] ?? event.alert_type}
          </span>
        </div>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${s.badge}`}>
          {event.severity}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-zinc-400">
        <span>Model</span>
        <span className="text-zinc-200">{event.model}</span>
        <span>Service</span>
        <span className="text-zinc-200">{event.service}</span>
        <span>Value</span>
        <span className="text-red-400 font-bold">{event.value.toFixed(3)}</span>
        <span>Threshold</span>
        <span className="text-zinc-300">{event.threshold.toFixed(3)}</span>
      </div>

      <div className="flex items-center justify-between text-zinc-600">
        <span>{event.id}</span>
        <span>{time}</span>
      </div>
    </div>
  );
}

export function IncidentFeed() {
  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/webhooks/datadog/stream");
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      try {
        const event: IncidentEvent = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev].slice(0, 50)); // keep last 50
      } catch {
        // ignore parse errors (heartbeat comments)
      }
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            Live Incidents
          </span>
          <span
            className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"}`}
          />
        </div>
        <span className="text-[10px] text-zinc-600">
          {events.length} events
        </span>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 text-xs text-center gap-2">
            <span className="text-2xl">📡</span>
            <span>Listening for alerts…</span>
            <span className="text-zinc-700">Use the trigger panel to fire a mock alert</span>
          </div>
        ) : (
          events.map((event) => (
            <IncidentCard key={event.id} event={event} />
          ))
        )}
      </div>
    </div>
  );
}
