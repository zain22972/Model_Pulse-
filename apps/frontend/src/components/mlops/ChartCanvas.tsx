"use client";
/**
 * ChartCanvas
 * Renders a list of ChartSpec objects (streamed from the LangGraph agent
 * via STATE_DELTA) as Recharts area/line charts with anomaly highlighting.
 *
 * Place at: apps/frontend/src/components/mlops/ChartCanvas.tsx
 */

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type DataPoint = {
  ts: string;
  value: number;
  threshold?: number;
};

export type AnomalyWindow = {
  start_ts: string;
  end_ts: string;
  severity: "critical" | "high" | "medium" | "low";
};

export type ChartSpec = {
  id: string;
  type: "line" | "area" | "bar" | "scatter";
  title: string;
  metric: string;
  unit: string;
  data: DataPoint[];
  threshold?: number;
  anomaly_windows: AnomalyWindow[];
  color?: string;
};

const ANOMALY_COLORS: Record<string, string> = {
  critical: "#ef444430",
  high: "#f9731630",
  medium: "#eab30830",
  low: "#3b82f630",
};

function formatTick(ts: string): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

interface SingleChartProps {
  spec: ChartSpec;
}

function SingleChart({ spec }: SingleChartProps) {
  const color = spec.color ?? "#6366f1";
  const ChartComponent = spec.type === "area" ? AreaChart : LineChart;
  const DataComponent = spec.type === "area" ? Area : Line;

  const tooltipFormatter = (value: any) =>
    [`${Number(value).toFixed(4)} ${spec.unit}`, spec.metric];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-2">
      <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
        {spec.title}
      </h3>

      <ResponsiveContainer width="100%" height={160}>
        <ChartComponent data={spec.data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="ts"
            tickFormatter={formatTick}
            tick={{ fontSize: 10, fill: "#71717a" }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 10, fill: "#71717a" }} />
          <Tooltip
            formatter={tooltipFormatter}
            labelFormatter={(l) => new Date(l).toLocaleTimeString()}
            contentStyle={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 8,
              fontSize: 11,
            }}
          />

          {/* Threshold reference line */}
          {spec.threshold !== undefined && (
            <ReferenceLine
              y={spec.threshold}
              stroke="#f97316"
              strokeDasharray="6 3"
              label={{
                value: `Threshold: ${spec.threshold} ${spec.unit}`,
                fill: "#f97316",
                fontSize: 10,
                position: "insideTopRight",
              }}
            />
          )}

          {/* Anomaly windows */}
          {spec.anomaly_windows.map((w, i) => (
            <ReferenceArea
              key={i}
              x1={w.start_ts}
              x2={w.end_ts}
              fill={ANOMALY_COLORS[w.severity] ?? ANOMALY_COLORS.high}
              strokeOpacity={0}
            />
          ))}

          {spec.type === "area" ? (
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              fill={`${color}25`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: color }}
            />
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: color }}
            />
          )}
        </ChartComponent>
      </ResponsiveContainer>

      {/* Anomaly badge */}
      {spec.anomaly_windows.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {spec.anomaly_windows.map((w, i) => (
            <span
              key={i}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                w.severity === "critical"
                  ? "bg-red-900/60 text-red-400"
                  : w.severity === "high"
                  ? "bg-orange-900/60 text-orange-400"
                  : "bg-yellow-900/60 text-yellow-400"
              }`}
            >
              {w.severity.toUpperCase()} anomaly
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface ChartCanvasProps {
  charts: ChartSpec[];
}

export function ChartCanvas({ charts }: ChartCanvasProps) {
  if (!charts || charts.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 rounded-xl border border-dashed border-zinc-700 text-zinc-600 text-sm">
        Awaiting metric data from agent…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {charts.map((spec) => (
        <SingleChart key={spec.id} spec={spec} />
      ))}
    </div>
  );
}
