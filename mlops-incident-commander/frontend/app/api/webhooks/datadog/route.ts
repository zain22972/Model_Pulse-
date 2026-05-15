/**
 * POST /api/webhooks/datadog
 *
 * Accepts a mock Datadog monitor alert, fans it out to:
 *   1. The SSE stream (IncidentFeed panel in the UI)
 *   2. The BFF /trigger-incident endpoint (starts the LangGraph agent)
 *
 * Place at: apps/frontend/src/app/api/webhooks/datadog/route.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { incidentBus, IncidentEvent } from "@/lib/incidentBus";

// Alert type → metric defaults
const ALERT_TEMPLATES: Record<
  string,
  { threshold: number; baseline: number; unit: string }
> = {
  data_drift:              { threshold: 0.30,  baseline: 0.42,  unit: "score" },
  latency_spike:           { threshold: 2000,  baseline: 3400,  unit: "ms"    },
  accuracy_drop:           { threshold: 0.85,  baseline: 0.71,  unit: "ratio" },
  throughput_degradation:  { threshold: 100,   baseline: 38,    unit: "rps"   },
  feature_skew:            { threshold: 0.25,  baseline: 0.39,  unit: "score" },
};

function getSeverity(value: number, threshold: number): IncidentEvent["severity"] {
  const ratio = value / threshold;
  if (ratio > 3)   return "critical";
  if (ratio > 2)   return "high";
  if (ratio > 1.2) return "medium";
  return "low";
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    alert_type = "data_drift",
    model = "churn-v2",
    service = "ml-serving",
    tags = [],
  } = body;

  const tmpl = ALERT_TEMPLATES[alert_type] ?? ALERT_TEMPLATES.data_drift;
  const value = body.value ?? tmpl.baseline;
  const threshold = body.threshold ?? tmpl.threshold;
  const severity = getSeverity(value, threshold);

  const event: IncidentEvent = {
    id: `evt-${Date.now()}`,
    alert_type,
    model,
    service,
    value,
    threshold,
    severity,
    triggered_at: new Date().toISOString(),
    tags,
  };

  // 1. Push to live SSE feed
  incidentBus.emit("incident", event);

  // 2. Forward to BFF to trigger the LangGraph agent
  const bffUrl = process.env.BFF_URL ?? "http://localhost:4000";
  try {
    await fetch(`${bffUrl}/trigger-incident`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch (err) {
    console.error("[webhook] Failed to reach BFF:", err);
    // Non-fatal — the SSE feed still updates
  }

  return NextResponse.json({ ok: true, incident_id: event.id, severity });
}
