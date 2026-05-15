/**
 * GET /api/webhooks/datadog/stream
 *
 * Server-Sent Events stream. The IncidentFeed panel subscribes here
 * to show live alerts as they arrive.
 *
 * Place at: apps/frontend/src/app/api/webhooks/datadog/stream/route.ts
 */

import { NextRequest } from "next/server";
import { incidentBus, IncidentEvent } from "@/lib/incidentBus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send a heartbeat so the browser keeps the connection open
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch (err) {
          clearInterval(heartbeat);
        }
      }, 15_000);

      const onIncident = (event: IncidentEvent) => {
        try {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch (err) {
          incidentBus.off("incident", onIncident);
        }
      };

      incidentBus.on("incident", onIncident);

      // Cleanup when client disconnects
      return () => {
        clearInterval(heartbeat);
        incidentBus.off("incident", onIncident);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
