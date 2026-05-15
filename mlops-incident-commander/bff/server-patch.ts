/**
 * BFF server.ts — PATCH for MLOps Incident Commander
 *
 * Add these changes to your existing apps/bff/src/server.ts:
 *
 * 1. Import LangGraphAgent (already imported in starter kit)
 * 2. Add a second LangGraphAgent for "incident" graph
 * 3. Add /trigger-incident POST route
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DIFF — paste these additions into apps/bff/src/server.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── 1. In your CopilotRuntime initialization, add the incident agent ──────────
//
// BEFORE (existing):
//   const runtime = new CopilotRuntime({
//     agents: [
//       new LangGraphAgent({
//         name: "default",
//         description: "Lead management agent",
//         url: `${LANGGRAPH_URL}/runs/stream`,
//         graphId: "default",
//       }),
//     ],
//   });
//
// AFTER (add the incident agent):
//   const runtime = new CopilotRuntime({
//     agents: [
//       new LangGraphAgent({
//         name: "default",
//         description: "Lead management agent",
//         url: `${LANGGRAPH_URL}/runs/stream`,
//         graphId: "default",
//       }),
//       new LangGraphAgent({
//         name: "incident",
//         description: "MLOps Incident Commander — classifies and remediates ML production incidents",
//         url: `${LANGGRAPH_URL}/runs/stream`,
//         graphId: "incident",
//       }),
//     ],
//   });


// ── 2. Add the /trigger-incident route ────────────────────────────────────────
//
// Add this route BEFORE the CopilotKit route handler:

/*
app.post("/trigger-incident", async (c) => {
  const alert = await c.req.json();

  // Craft a human message that kicks off the incident workflow
  const message = `
🚨 ALERT RECEIVED from Datadog Monitor

Alert Type: ${alert.alert_type}
Model: ${alert.model}
Service: ${alert.service}
Current Value: ${alert.value}
Threshold: ${alert.threshold}
Severity: ${alert.severity}
Triggered At: ${alert.triggered_at}
Tags: ${(alert.tags ?? []).join(", ")}

Classify this incident, fetch metrics, and begin the runbook.
  `.trim();

  // This is a fire-and-forget trigger — the agent runs in its own thread.
  // For a production system, you'd inject this into a specific thread ID
  // tied to the user's active session. For the hackathon demo, we POST
  // the alert payload directly to LangGraph to start a new run.
  const LANGGRAPH_URL = process.env.LANGGRAPH_URL ?? "http://localhost:8133";

  try {
    await fetch(`${LANGGRAPH_URL}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        graph_id: "incident",
        input: {
          messages: [{ role: "human", content: message }],
          alerts: [alert],
        },
      }),
    });
  } catch (err) {
    console.error("[BFF] Failed to trigger incident agent:", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }

  return c.json({ ok: true });
});
*/

export {}; // This file is documentation — copy the snippets above into server.ts
