"use client";

import { Loader2 } from "lucide-react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { cn } from "@/lib/utils";
import { navItemIsPending, useNavigationPending } from "@/lib/navigation-pending";

type NavLinkItemProps = {
  href: string;
  label: string;
  icon: string;
  tour?: string;
  active: boolean;
  onNavigate?: () => void;
  className?: string;
};

/** Sidebar / mobile nav row with a trailing spinner while its route is loading. */
export function NavLinkItem({ href, label, icon, tour, active, onNavigate, className }: NavLinkItemProps) {
  const { pendingHref } = useNavigationPending();
  const loading = navItemIsPending(pendingHref, href);

  return (
    <Link
      href={href}
      data-tour={tour}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-busy={loading || undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold no-underline transition-all duration-200",
        active ? "bg-accent text-[#1d1d1f] shadow-[0_4px_16px_rgba(255,212,0,0.25)]" : "text-fg-muted hover:bg-surface-200 hover:text-fg",
        className,
      )}
    >
      <span aria-hidden="true" className="w-5 shrink-0 text-center text-base">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden={!loading}>
        {loading ? (
          <Loader2
            className={cn("h-3.5 w-3.5 animate-spin", active ? "text-[#1d1d1f]" : "text-fg-muted")}
          />
        ) : null}
      </span>
    </Link>
  );
}
