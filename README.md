# 🩺 Model Pulse - MLOps Incident Commander

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CopilotKit](https://img.shields.io/badge/Powered%20By-CopilotKit-brightgreen)](https://github.com/CopilotKit/CopilotKit)
[![LangGraph](https://img.shields.io/badge/Orchestrated%20By-LangGraph-blue)](https://github.com/langchain-ai/langgraph)

**Model Pulse** is an advanced, AI-powered MLOps dashboard designed to transform how production ML incidents are handled. By integrating real-time monitoring with agentic remediation, it moves beyond passive alerting to proactive incident resolution.

---

## ✨ Features

- **🚀 Real-time Incident Detection**: Automatically detects performance drift, latency spikes, and accuracy drops.
- **🧠 Agentic Diagnosis**: Powered by **LangGraph**, the system orchestrates a multi-step diagnostic workflow to identify root causes.
- **🤝 Human-in-the-loop (HITL)**: Seamlessly integrates human oversight for critical remediation steps via **CopilotKit**.
- **📊 Dynamic Visualizations**: Interactive charts that provide deep insights into model health and performance metrics.
- **🛠️ Automated Remediation**: Proposes and executes fixes to stabilize production models instantly.

## 🛠️ Tech Stack

- **Frontend**: Next.js, React, Tailwind CSS
- **AI/Agents**: LangGraph, OpenAI/Gemini
- **UI Interaction**: CopilotKit (Generative UI)
- **Monitoring Integration**: Mock Datadog/CloudWatch metrics (extensible)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- API Keys for OpenAI/Gemini

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/zain22972/Model_Pulse-.git
   cd Model_Pulse-
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and add:
   ```env
   OPENAI_API_KEY=your_key_here
   # Or Gemini
   GOOGLE_API_KEY=your_key_here
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

## 📖 How it Works

1. **Monitor**: The system listens for synthetic or real alerts (e.g., Accuracy < 85%).
2. **Triage**: LangGraph agents analyze the specific metric failure (Latency vs. Accuracy).
3. **Diagnose**: Agents perform root cause analysis (e.g., checking for data skew).
4. **Remediate**: The system generates a remediation plan and presents it to the user.
5. **Approve**: User reviews the plan via the Generative UI and clicks 'Approve'.
6. **Resolve**: The agent executes the fix and marks the incident as resolved.

---

Built with ❤️ for the Global Generative UI Hackathon.
