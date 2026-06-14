"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Zap,
  BarChart3,
  GitBranch,
  ShieldCheck,
  Activity,
  Brain,
} from "lucide-react";

// ── Feature cards ─────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Activity,
    title: "Live Metric Monitoring",
    blurb: "Stream anomaly windows, thresholds, and drift signals from production ML models in real time.",
    color: "text-indigo-400",
    bg: "bg-indigo-950/40",
    border: "border-indigo-800/60",
  },
  {
    icon: Brain,
    title: "LangGraph Agent Reasoning",
    blurb: "A deep LangGraph agent classifies incidents, proposes runbook steps, and explains root causes.",
    color: "text-violet-400",
    bg: "bg-violet-950/40",
    border: "border-violet-800/60",
  },
  {
    icon: ShieldCheck,
    title: "Human-in-the-Loop HITL",
    blurb: "Every destructive remediation step requires human approval before execution — with full edit control.",
    color: "text-emerald-400",
    bg: "bg-emerald-950/40",
    border: "border-emerald-800/60",
  },
  {
    icon: BarChart3,
    title: "Incident Timeline Audit",
    blurb: "Full chronological audit trail of every agent action, human decision, and system event per incident.",
    color: "text-blue-400",
    bg: "bg-blue-950/40",
    border: "border-blue-800/60",
  },
  {
    icon: Zap,
    title: "Optimistic Incident UI",
    blurb: "Alert stubs appear instantly in the sidebar — no 40-second wait. The agent replaces them when ready.",
    color: "text-amber-400",
    bg: "bg-amber-950/40",
    border: "border-amber-800/60",
  },
  {
    icon: GitBranch,
    title: "Multi-Incident Orchestration",
    blurb: "Fire multiple alerts simultaneously. Switch between incidents without losing agent context.",
    color: "text-pink-400",
    bg: "bg-pink-950/40",
    border: "border-pink-800/60",
  },
] as const;

const TECH_STACK = [
  "Next.js 15",
  "CopilotKit v2",
  "LangGraph",
  "Recharts",
  "Framer Motion",
  "Sonner",
  "Tailwind CSS",
  "TypeScript",
];

// ── Animated waveform SVG ─────────────────────────────────────────────────────
function HeroWaveform() {
  return (
    <svg
      width="320"
      height="60"
      viewBox="0 0 320 60"
      fill="none"
      className="text-indigo-500/40 mx-auto"
      aria-hidden
    >
      <polyline
        points="0,30 20,30 30,10 40,50 50,30 70,30 80,18 90,42 100,30 120,30 130,8 140,52 150,30 170,30 180,22 190,38 200,30 220,30 230,12 240,48 250,30 270,30 280,20 290,40 300,30 320,30"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <animate
          attributeName="stroke-dasharray"
          values="0 800;800 0"
          dur="2.4s"
          fill="freeze"
        />
      </polyline>
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-24 pb-16 px-6 text-center">
        {/* Radial glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 max-w-3xl mx-auto"
        >
          {/* Eyebrow badge */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-indigo-800/60 bg-indigo-950/40 text-indigo-300 text-xs font-semibold uppercase tracking-widest mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            MLOps Incident Commander
          </span>

          <h1 className="text-5xl md:text-6xl font-bold leading-tight tracking-tight text-white mb-6">
            Model Pulse
          </h1>

          <p className="text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto mb-8">
            AI-powered incident response for production ML systems. Detect drift,
            diagnose root causes, and orchestrate remediation — with a human always
            in the loop.
          </p>

          <HeroWaveform />

          <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
            <Link
              href="/mlops"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-900/30"
            >
              Open Commander
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/leads"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/60 text-zinc-300 font-semibold text-sm transition-colors"
            >
              Leads Canvas
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ── Feature cards ── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-10"
        >
          What&apos;s inside
        </motion.h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, blurb, color, bg, border }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.07 }}
              className={`rounded-xl border ${border} ${bg} p-5 space-y-3`}
            >
              <div className={`w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center ${color}`}>
                <Icon size={18} />
              </div>
              <h3 className="font-semibold text-zinc-100 text-sm">{title}</h3>
              <p className="text-zinc-400 text-xs leading-relaxed">{blurb}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Tech stack ── */}
      <section className="max-w-4xl mx-auto px-6 pb-20 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-5">
          Built with
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {TECH_STACK.map((tech) => (
            <span
              key={tech}
              className="px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 text-xs font-medium"
            >
              {tech}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
