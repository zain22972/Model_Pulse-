import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  CopilotRuntime,
  CopilotKitIntelligence,
  createCopilotEndpoint,
} from "@copilotkit/runtime/v2";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";

const intelligence = new CopilotKitIntelligence({
  apiKey:
    process.env.INTELLIGENCE_API_KEY ?? "cpk_sPRVSEED_seed0privat0longtoken00",
  apiUrl: process.env.INTELLIGENCE_API_URL ?? "http://localhost:4201",
  wsUrl: process.env.INTELLIGENCE_GATEWAY_WS_URL ?? "ws://localhost:4401",
});

const agent = new LangGraphAgent({
  deploymentUrl:
    process.env.LANGGRAPH_DEPLOYMENT_URL ?? "http://localhost:8133",
  graphId: "default",
  langsmithApiKey: process.env.LANGSMITH_API_KEY ?? "",
  assistantConfig: {
    recursion_limit: Number(process.env.LANGGRAPH_RECURSION_LIMIT ?? 60),
  },
});

const incidentAgent = new LangGraphAgent({
  deploymentUrl:
    process.env.LANGGRAPH_DEPLOYMENT_URL ?? "http://localhost:8133",
  graphId: "incident",
  langsmithApiKey: process.env.LANGSMITH_API_KEY ?? "",
  assistantConfig: {
    recursion_limit: Number(process.env.LANGGRAPH_RECURSION_LIMIT ?? 60),
  },
});

// Create the root Hono app
const app = new Hono();

// Middleware
app.use("/*", cors());

// Custom route: trigger-incident (Must be defined before or separately from CopilotKit handler)
app.post("/trigger-incident", async (c) => {
  const alert = await c.req.json();
  console.log(`[BFF] Received trigger-incident for: ${alert.alert_type}`);
  
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

  const LANGGRAPH_URL = process.env.LANGGRAPH_DEPLOYMENT_URL?.replace("localhost", "127.0.0.1") ?? "http://127.0.0.1:8133";

  try {
    console.log(`[BFF] Forwarding to LangGraph at: ${LANGGRAPH_URL}/runs`);
    const response = await fetch(`${LANGGRAPH_URL}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistant_id: "incident",
        input: {
          messages: [{ role: "human", content: message }],
          alerts: [alert],
        },
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[BFF] LangGraph returned error ${response.status}: ${errorText}`);
      return c.json({ ok: false, error: `LangGraph error: ${response.status}` }, 500);
    }

    console.log("[BFF] Successfully triggered incident agent");
  } catch (err) {
    console.error("[BFF] Failed to trigger incident agent:", err);
    return c.json({ ok: false, error: String(err) }, 500);
  }

  return c.json({ ok: true });
});

// CopilotKit Runtime
const runtime = new CopilotRuntime({
  // intelligence, // Not needed — state-based HITL works in stateless mode
  identifyUser: () => ({ id: "default", name: "Hackathon User" }),
  licenseToken: process.env.COPILOTKIT_LICENSE_TOKEN,
  agents: { default: agent, incident: incidentAgent },
  openGenerativeUI: true,
  a2ui: { injectA2UITool: false },
});

// Create the CopilotKit endpoint app
const copilotApp = createCopilotEndpoint({
  basePath: "/",
  runtime,
});

// Mount the CopilotKit app onto the root app
app.route("/api/copilotkit", copilotApp);

// Rewrite known 5xx error bodies into structured payloads the UI can render
app.use("*", async (c, next) => {
  await next();
  const status = c.res.status;
  if (status < 500 || status > 599) return;
  const cloned = c.res.clone();
  const ctype = cloned.headers.get("content-type") || "";
  if (!ctype.includes("json") && !ctype.includes("text")) return;
  let body: string;
  try {
    body = await cloned.text();
  } catch {
    return;
  }
  const isThreadFkey =
    body.includes("threads_user_id_fkey") ||
    (body.includes("Failed to initialize thread") &&
      body.includes("user_id"));
  if (isThreadFkey) {
    const remapped = {
      error: "Postgres user seed missing",
      hint: "Run `npm run seed` to seed the default user, then retry.",
      command: "npm run seed",
    };
    c.res = new Response(JSON.stringify(remapped), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
    return;
  }

  const isThreadLocked =
    body.includes("AgentThreadLockedError") ||
    /Thread\s+[0-9a-f-]{36}\s+is locked/i.test(body);
  if (isThreadLocked) {
    const remapped = {
      error: "Thread is locked",
      hint:
        "A previous turn errored mid-stream and didn't release the run " +
        "lock. Start a new conversation (sidebar → +) to continue.",
      command: "new-thread",
    };
    c.res = new Response(JSON.stringify(remapped), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
    return;
  }
});

const port = Number(process.env.PORT) || 4000;

serve({ fetch: app.fetch, port }, () => {
  console.log(`BFF ready at http://localhost:${port}`);
});

