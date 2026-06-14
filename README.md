# Model Pulse — MLOps Incident Commander

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CopilotKit](https://img.shields.io/badge/Powered%20By-CopilotKit%20v2-brightgreen)](https://github.com/CopilotKit/CopilotKit)
[![LangGraph](https://img.shields.io/badge/Orchestrated%20By-LangGraph-blue)](https://github.com/langchain-ai/langgraph)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)

**Model Pulse** is an AI-powered MLOps incident commander. It detects production ML anomalies, orchestrates a LangGraph agent to diagnose root causes, and surfaces human-in-the-loop approval cards for every destructive remediation step — all in a real-time, dark-mode dashboard.

---

## Features

- **Live Metric Monitoring** — Recharts area/line charts with anomaly windows and threshold reference lines, streamed from the LangGraph agent state.
- **LangGraph Agent Reasoning** — A deep agent classifies incidents, proposes runbook steps, and explains root causes via CopilotKit v2 `useAgent`.
- **Human-in-the-Loop (HITL)** — Every destructive step requires human approval via `useInterrupt`. Operators can edit the proposed action before approving.
- **Optimistic Incident UI** — Alert stubs appear instantly in the sidebar (no 40-second wait). The agent replaces them when ready.
- **Multi-Incident Orchestration** — Fire multiple alerts simultaneously and switch between them without losing agent context.
- **Incident Timeline Audit** — Full chronological audit trail of every agent action, human decision, and system event.
- **Keyboard Shortcuts** — `F` to focus the trigger panel, `Enter` to approve HITL steps, `Esc` to reject.
- **Sonner Toasts** — Rich error and info toasts for webhook failures and alert fire events.
- **Framer Motion Animations** — Slide-in timeline entries, fade-in chart cards, spring modal entrance.
- **Fullscreen Chart Expand** — Hover any chart card and click the expand icon to view it fullscreen.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript |
| Styling | Tailwind CSS v4, Framer Motion, Sonner |
| AI / Agents | LangGraph, CopilotKit v2 |
| Charts | Recharts |
| Fonts | Manrope (sans), Geist Mono |
| Theme | next-themes (dark/light toggle) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- A [CopilotKit Cloud](https://cloud.copilotkit.ai) public API key
- A running LangGraph agent server (BFF) on port 4000

### Installation

```bash
# 1. Clone
git clone https://github.com/zain22972/Model_Pulse-.git
cd Model_Pulse-

# 2. Install frontend dependencies
cd apps/frontend
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local and fill in your keys

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_COPILOT_CLOUD_PUBLIC_API_KEY` | Yes | CopilotKit Cloud public key |
| `BFF_URL` | Yes | LangGraph agent server URL (default: `http://localhost:4000`) |
| `NOTION_TOKEN` | No | Notion integration token (Leads Canvas only) |
| `NOTION_LEADS_DATABASE_ID` | No | Notion database ID (Leads Canvas only) |

---

## Architecture

```
Browser
  └── Next.js 15 App Router
        ├── /               → Home page (hero + feature cards)
        ├── /mlops          → MLOps Incident Commander
        │     ├── Left panel   — Incident feed + WebhookTriggerPanel
        │     ├── Center panel — ChartCanvas + TimelinePanel + HITL modal
        │     └── Right panel  — CopilotKit v2 CopilotSidebar
        └── /leads          → Leads Canvas (separate demo)

CopilotKit v2 (useAgent, useInterrupt, useCopilotReadable)
  └── LangGraph Agent (BFF on :4000)
        ├── Incident classification
        ├── Root cause analysis
        ├── Runbook step proposal
        └── HITL interrupt → frontend approval → resume
```

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `F` | Scroll to the Simulate Alert trigger panel |
| `Enter` | Approve the current HITL runbook step |
| `Esc` | Reject the current HITL runbook step |

---

## Improvement Changelog (v2)

This release implements a comprehensive visual and functional overhaul:

**Bug Fixes**
- Fixed double `RemediationApprovalModal` render — `useInterrupt` now renders only `RunbookApprovalCard` in the sidebar; the center-panel modal is driven by `showHitlModal` state.
- Renamed `useResultSummary` / `useArgsPreview` in `ToolCallView` to plain functions (no `use` prefix) — they are not React hooks.
- Fixed `key={i}` index-only keys in `TimelinePanel` and `ChartCanvas` anomaly windows — replaced with composite keys.
- Replaced `incident: any` with a fully-typed `Incident` interface in `RemediationApprovalModal`.
- Added Sonner error toast in `WebhookTriggerPanel` when `res.ok` is false.
- Updated page `<title>` from hackathon starter text to "Model Pulse — MLOps Incident Commander".

**UI / UX**
- Global `Navbar` with logo, active-page highlight, and dark/light theme toggle.
- Full home page overhaul: animated hero waveform, 6 feature cards, tech stack badges, CTA buttons.
- `ThemeProvider` (next-themes) + `Toaster` (Sonner) added to root layout.
- MLOps page height fixed to `calc(100vh - 3.5rem)` to account for Navbar.
- Debug HITL state panel removed from center panel.
- `RemediationApprovalModal`: Framer Motion spring entrance, risk fill bar, keyboard shortcuts hint.
- `RunbookApprovalCard`: step progress bar, `font-sans` step text, keyboard shortcuts, micro-animations.
- `ChartCanvas`: fade-in per card, fullscreen expand modal, animated empty state SVG waveform.
- `TimelinePanel`: slide-in animation per entry, actor circle initials, ISO timestamp tooltip.
- `WebhookTriggerPanel`: gradient Zap icon, keyboard hint badge, renamed to "Simulate Alert".
- CopilotKit v2 sidebar: custom dark theme CSS (background, bubbles, input, scrollbar, header).

---

Built with love for the Global Generative UI Hackathon.
