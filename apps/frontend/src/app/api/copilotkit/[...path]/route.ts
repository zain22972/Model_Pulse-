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
 *
 * IMPORTANT: Must use Edge Runtime for real-time SSE streaming.
 * Node.js Serverless Functions buffer the entire response before sending.
 */
import { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const BFF_URL = process.env.BFF_URL ?? "http://localhost:4000";

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const subPath = path.join("/");
  const bffTarget = `${BFF_URL}/api/copilotkit/${subPath}`;

  const headers = new Headers(req.headers);
  // Remove headers that shouldn't be forwarded
  headers.delete("host");
  headers.delete("connection");

  try {
    const upstream = await fetch(bffTarget, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      // @ts-expect-error — Edge fetch supports duplex for request streaming
      duplex: "half",
    });

    // Stream the response back with proper SSE headers
    const responseHeaders = new Headers(upstream.headers);
    // Ensure no buffering anywhere in the chain
    responseHeaders.set("X-Accel-Buffering", "no");
    responseHeaders.set("Cache-Control", "no-cache, no-transform");

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
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
