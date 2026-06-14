/**
 * /api/copilotkit/[...path] — catch-all proxy to the Railway BFF CopilotKit runtime.
 *
 * CopilotKit SDK calls sub-paths like:
 *   /api/copilotkit/agent/incident/run
 *   /api/copilotkit/agent/incident/connect
 *   /api/copilotkit/info
 *
 * This catch-all route forwards the full path to the BFF and streams
 * the response back so SSE / chunked streaming works correctly.
 */
import { NextRequest } from "next/server";

const BFF_URL = process.env.BFF_URL ?? "http://localhost:4000";

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const subPath = path.join("/");
  const bffTarget = `${BFF_URL}/api/copilotkit/${subPath}`;

  const headers = new Headers(req.headers);
  // Remove host header so the BFF doesn't reject it
  headers.delete("host");

  try {
    const upstream = await fetch(bffTarget, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      // @ts-expect-error — Node fetch supports duplex for streaming
      duplex: "half",
    });

    // Stream the response back
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  } catch (err) {
    console.error(`[copilotkit proxy] Failed to reach BFF at ${bffTarget}:`, err);
    return new Response(
      JSON.stringify({ error: "BFF unreachable", detail: String(err) }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}

export const GET = handler;
export const POST = handler;
export const dynamic = "force-dynamic";
