"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RoleGate } from "@/components/role-gate";

const LINKS = [
  { href: "/growth/intelligence", label: "Overview" },
  { href: "/growth/knowledge", label: "Project Knowledge" },
  { href: "/growth/competitors", label: "Competitors" },
  { href: "/growth/sectors", label: "Sector Opportunities" },
  { href: "/growth/prospects/search", label: "Prospect Search" },
  { href: "/growth/campaigns", label: "Campaign Studio" },
  { href: "/growth/autopilot", label: "Autopilot" },
  { href: "/growth/inbox", label: "Unified Inbox" },
  { href: "/growth/pipeline", label: "Pipeline" },
  { href: "/growth/analytics", label: "Analytics" },
  { href: "/growth", label: "Prospects" },
  { href: "/growth/senders", label: "Sender health" },
  { href: "/growth/suppressions", label: "Suppressions" },
];

export default function GrowthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RoleGate>
      <div className="space-y-6">
        <nav aria-label="Growth sections" className="overflow-x-auto border-b border-[var(--shell-border)]">
          <ul className="flex min-w-max gap-1" role="list">
            {LINKS.map(({ href, label }) => {
              const active =
                href === "/growth"
                  ? pathname === "/growth"
                  : pathname === href || pathname?.startsWith(`${href}/`);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`relative inline-flex h-11 items-center px-3 text-sm no-underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--shell-focus)] ${
                      active
                        ? "font-medium text-[var(--shell-accent-text)] after:absolute after:inset-x-0 after:bottom-0 after:border-b-[3px] after:border-[var(--shell-accent-bar)]"
                        : "text-fg-muted hover:bg-[var(--shell-hover)] hover:text-fg"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {children}
      </div>
    </RoleGate>
  );
}
