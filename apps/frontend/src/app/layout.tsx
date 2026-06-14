import type { Metadata } from "next";

import { Manrope } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { CopilotKitProviderShell } from "@/components/copilot/CopilotKitProviderShell";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { Navbar } from "@/components/ui/Navbar";
import "./globals.css";
// v2 owns its own stylesheet. Do NOT import @copilotkit/react-ui/styles.css —
// v1's .copilotKitButton / .copilotKitSidebar / .copilotKitWindow rules
// collide with v2's same-name selectors (different DOM, different positioning)
// and break the sidebar layout when both are loaded.
import "@copilotkit/react-core/v2/styles.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Model Pulse — MLOps Incident Commander",
  description:
    "AI-powered MLOps incident commander. Detect drift, diagnose root causes, and orchestrate remediation with LangGraph and CopilotKit.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="subpixel-antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <CopilotKitProviderShell>
            <Navbar />
            <main className="pt-14">
              {children}
            </main>
            <Toaster richColors position="bottom-right" />
          </CopilotKitProviderShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
