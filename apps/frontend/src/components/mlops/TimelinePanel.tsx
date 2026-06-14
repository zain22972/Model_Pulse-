"use client";
/**
 * TimelinePanel
 * Renders the incident audit trail from agent.state.timeline.
 * - Bug fix: composite key `${entry.ts}-${entry.actor}-${i}` (no index-only key)
 * - Polish: slide-in animation, actor colored circle initials, ISO tooltip on time
 */

import { motion } from "framer-motion";

export type TimelineEntry = {
  ts: string;
  actor: "agent" | "user" | "system";
  action: string;
  detail?: string;
  severity?: string;
};

const ACTOR_STYLES: Record<string, { label: string; initials: string; color: string; dot: string; ring: string }> = {
  agent:  { label: "Agent",  initials: "AI", color: "text-blue-400",    dot: "bg-blue-500",    ring: "ring-blue-700"    },
  user:   { label: "Human",  initials: "HU", color: "text-emerald-400", dot: "bg-emerald-500", ring: "ring-emerald-700" },
  system: { label: "System", initials: "SY", color: "text-zinc-500",    dot: "bg-zinc-500",    ring: "ring-zinc-700"    },
};

interface TimelinePanelProps {
  entries: TimelineEntry[];
}

export function TimelinePanel({ entries }: TimelinePanelProps) {
  if (!entries || entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-xs text-zinc-600">
        No activity yet
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {[...entries].reverse().map((entry, i) => {
        const actor = ACTOR_STYLES[entry.actor] ?? ACTOR_STYLES.system;
        const isoTimestamp = new Date(entry.ts).toISOString();
        const time = new Date(entry.ts).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        return (
          <motion.div
            key={`${entry.ts}-${entry.actor}-${i}`}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: i * 0.04 }}
            className="flex gap-3 py-2 border-b border-zinc-800/60 last:border-0"
          >
            {/* Actor circle initials + connector line */}
            <div className="flex flex-col items-center pt-0.5 gap-1">
              <span
                className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold ring-1 ${actor.dot} ${actor.ring} text-white`}
                aria-label={actor.label}
              >
                {actor.initials}
              </span>
              {i < entries.length - 1 && (
                <span className="w-px flex-1 bg-zinc-800 min-h-[8px]" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-[10px] font-bold uppercase ${actor.color}`}>
                  {actor.label}
                </span>
                <span
                  className="text-[10px] text-zinc-600 flex-shrink-0 cursor-default"
                  title={isoTimestamp}
                >
                  {time}
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-snug mt-0.5">{entry.action}</p>
              {entry.detail && (
                <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{entry.detail}</p>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
