"use client";
/**
 * TimelinePanel
 * Renders the incident audit trail from agent.state.timeline.
 *
 * Place at: apps/frontend/src/components/mlops/TimelinePanel.tsx
 */

export type TimelineEntry = {
  ts: string;
  actor: "agent" | "user" | "system";
  action: string;
  detail?: string;
  severity?: string;
};

const ACTOR_STYLES: Record<string, { label: string; color: string; dot: string }> = {
  agent: { label: "Agent",  color: "text-blue-400",   dot: "bg-blue-500"   },
  user:  { label: "Human",  color: "text-emerald-400", dot: "bg-emerald-500" },
  system:{ label: "System", color: "text-zinc-500",    dot: "bg-zinc-500"   },
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
        const time = new Date(entry.ts).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        return (
          <div key={i} className="flex gap-3 py-2 border-b border-zinc-800/60 last:border-0">
            {/* Dot + line */}
            <div className="flex flex-col items-center pt-1 gap-1">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${actor.dot}`} />
              {i < entries.length - 1 && (
                <span className="w-px flex-1 bg-zinc-800" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-[10px] font-bold uppercase ${actor.color}`}>
                  {actor.label}
                </span>
                <span className="text-[10px] text-zinc-600 flex-shrink-0">{time}</span>
              </div>
              <p className="text-xs text-zinc-300 leading-snug mt-0.5">{entry.action}</p>
              {entry.detail && (
                <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{entry.detail}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
