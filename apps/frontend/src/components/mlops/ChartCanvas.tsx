"use client";
/**
 * ChartCanvas
 * - Bug fix: anomaly window key uses `${w.start_ts}-${i}` (not index alone)
 * - Polish: fade-in animation per card, fullscreen expand modal, indigo/violet primary lines
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2, X } from "lucide-react";
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

interface ChartBodyProps {
  spec: ChartSpec;
  height?: number;
}

function ChartBody({ spec, height = 160 }: ChartBodyProps) {
  // Default to indigo; override per spec
  const color = spec.color ?? "#6366f1";
  const ChartComponent = spec.type === "area" ? AreaChart : LineChart;

  const tooltipFormatter = (value: unknown) =>
    [`${Number(value).toFixed(4)} ${spec.unit}`, spec.metric];

  return (
    <ResponsiveContainer width="100%" height={height}>
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
          labelFormatter={(l) => new Date(l as string).toLocaleTimeString()}
          contentStyle={{
            background: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: 8,
            fontSize: 11,
          }}
        />

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

        {/* Bug fix: composite key for anomaly windows */}
        {spec.anomaly_windows.map((w, i) => (
          <ReferenceArea
            key={`${w.start_ts}-${i}`}
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
  );
}

interface SingleChartProps {
  spec: ChartSpec;
  index: number;
}

function SingleChart({ spec, index }: SingleChartProps) {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.08 }}
        className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-2 relative group"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
            {spec.title}
          </h3>
          <button
            onClick={() => setFullscreen(true)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
            aria-label="Expand chart"
          >
            <Maximize2 size={12} />
          </button>
        </div>

        <ChartBody spec={spec} height={160} />

        {/* Anomaly badges — bug fix: composite key */}
        {spec.anomaly_windows.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {spec.anomaly_windows.map((w, i) => (
              <span
                key={`${w.start_ts}-${i}`}
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
      </motion.div>

      {/* Fullscreen modal */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-zinc-950/90 p-6"
            onClick={() => setFullscreen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl rounded-xl border border-zinc-700 bg-zinc-900 p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wide">
                  {spec.title}
                </h3>
                <button
                  onClick={() => setFullscreen(false)}
                  className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                  aria-label="Close fullscreen"
                >
                  <X size={16} />
                </button>
              </div>
              <ChartBody spec={spec} height={360} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

interface ChartCanvasProps {
  charts: ChartSpec[];
}

export function ChartCanvas({ charts }: ChartCanvasProps) {
  if (!charts || charts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-zinc-700 gap-4">
        {/* Animated SVG pulse-line waveform empty state */}
        <svg width="120" height="40" viewBox="0 0 120 40" className="text-zinc-700">
          <polyline
            points="0,20 15,20 20,5 25,35 30,20 45,20 50,10 55,30 60,20 75,20 80,8 85,32 90,20 105,20 110,15 115,25 120,20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-60"
          >
            <animate attributeName="stroke-dashoffset" from="200" to="0" dur="2s" repeatCount="indefinite" />
            <animate attributeName="stroke-dasharray" values="0 200;200 0" dur="2s" repeatCount="indefinite" />
          </polyline>
        </svg>
        <span className="text-zinc-600 text-sm">Awaiting metric data from agent…</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {charts.map((spec, index) => (
        <SingleChart key={spec.id} spec={spec} index={index} />
      ))}
    </div>
  );
}
