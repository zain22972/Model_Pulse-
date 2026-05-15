import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Load the repo-root .env so vars defined there (BFF_URL, etc.) are visible
// to next.config.ts and to the dev/prod runtime. Next reads `apps/frontend/.env`
// after this — local overrides still win when present. Replaces the previous
// `ln -sf ../../.env apps/frontend/.env` postinstall, which was non-portable.
loadEnvConfig(path.resolve(__dirname, "../.."));

const BFF_URL = process.env.BFF_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Proxy CopilotKit runtime requests to the Hono BFF (apps/bff). We can't run
  // the runtime in a Next.js API route directly because the runtime's v2 entry
  // pulls in express, which Next can't bundle (dynamic require in view.js).
  // Same-origin proxy keeps the drawer's relative fetches (e.g.
  // PATCH /api/copilotkit/threads/{id}) working without CORS.
  async rewrites() {
    return [
      {
        source: "/api/copilotkit/:path*",
        destination: `${BFF_URL}/api/copilotkit/:path*`,
      },
      {
        source: "/api/copilotkit",
        destination: `${BFF_URL}/api/copilotkit`,
      },
    ];
  },
};

export default nextConfig;
