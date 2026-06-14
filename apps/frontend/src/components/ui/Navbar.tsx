"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

const NAV_LINKS = [
  { href: "/mlops",  label: "MLOps Commander", showBadge: true  },
  { href: "/leads",  label: "Leads Canvas",    showBadge: false },
  { href: "/",       label: "Docs",            showBadge: false },
];

export function Navbar() {
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Active incident badge — true when on mlops page (can be wired to context later)
  const [hasActiveIncident] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const toggleTheme = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");

  return (
    <nav className="bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 fixed top-0 w-full z-50">
      <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          {/* SVG pulse/heartbeat icon */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            className="text-indigo-400 group-hover:text-indigo-300 transition-colors"
          >
            <polyline
              points="2,12 6,12 8,5 10,19 12,12 14,15 16,9 18,12 22,12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-white font-bold text-base tracking-tight">
            Model Pulse
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, showBadge }) => {
            const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "text-white bg-zinc-800"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                }`}
              >
                {label}
                {showBadge && hasActiveIncident && (
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-label="Active incident" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Dark/light toggle */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="p-2 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
        >
          {mounted ? (
            resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />
          ) : (
            <span className="w-4 h-4 block" />
          )}
        </button>
      </div>
    </nav>
  );
}
