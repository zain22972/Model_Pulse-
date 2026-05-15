/**
 * Shared in-process SSE event bus.
 * Imported by both the POST webhook handler and the GET stream handler.
 *
 * Place at: apps/frontend/src/lib/incidentBus.ts
 */

import { EventEmitter } from "events";

// Node.js module singleton — survives across hot-reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var __incidentBus: EventEmitter | undefined;
}

export const incidentBus: EventEmitter =
  global.__incidentBus ?? (global.__incidentBus = new EventEmitter());

incidentBus.setMaxListeners(50);

export type IncidentEvent = {
  id: string;
  alert_type: string;
  model: string;
  service: string;
  value: number;
  threshold: number;
  severity: "critical" | "high" | "medium" | "low";
  triggered_at: string;
  tags: string[];
};
