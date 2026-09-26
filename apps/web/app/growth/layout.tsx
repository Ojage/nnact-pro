"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RoleGate } from "@/components/role-gate";

const LINKS = [
  { href: "/growth/intelligence", label: "Overview" },
  { href: "/growth/knowledge", label: "Project Knowledge" },
  { href: "/growth/competitors", label: "Competitors" },
  { href: "/growth/sectors", label: "Sector Opportunities" },
  { href: "/growth/autopilot", label: "Autopilot" },
  { href: "/growth/inbox", label: "Unified Inbox" },
  { href: "/growth", label: "Prospects" },
  { href: "/growth/senders", label: "Senders" },
  { href: "/growth/suppressions", label: "Suppressions" },
];

export default function GrowthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RoleGate>
      <div className="space-y-6">
        <nav className="flex flex-wrap gap-2 border-b border-border pb-3">
          {LINKS.map(({ href, label }) => {
            const active =
              href === "/growth"
                ? pathname === "/growth"
                : pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  active ? "bg-primary/10 text-primary" : "text-fg-muted hover:bg-muted hover:text-fg"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </RoleGate>
  );
}
