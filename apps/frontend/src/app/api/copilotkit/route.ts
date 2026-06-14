/**
 * /api/copilotkit — proxy to the Railway BFF CopilotKit runtime.
 *
 * CopilotKitProvider uses runtimeUrl="/api/copilotkit" which hits this
 * Next.js route. We forward the request verbatim to the BFF and stream
 * the response back so SSE / chunked streaming works correctly.
 */
import { NextRequest } from "next/server";

const BFF_URL = process.env.BFF_URL ?? "http://localhost:4000";

async function handler(req: NextRequest) {
  const bffTarget = `${BFF_URL}/api/copilotkit`;

  const headers = new Headers(req.headers);
  // Remove host header so the BFF doesn't reject it
  headers.delete("host");

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
}

export const GET = handler;
export const POST = handler;
export const dynamic = "force-dynamic";
