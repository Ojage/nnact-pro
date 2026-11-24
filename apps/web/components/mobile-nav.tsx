"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { activeNavHref, navSectionsForRole } from "@/lib/nav";
import type { NavRole } from "@/lib/nav";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/use-session-user";
import { SidebarAccountFooter, SidebarNavSections } from "@/components/sidebar";

export function MobileNav() {
  const pathname = usePathname();
  const currentNavHref = activeNavHref(pathname);
  const [open, setOpen] = useState(false);
  const { user } = useSessionUser();
  const role = user?.role as NavRole | null | undefined;
  const sections = role ? navSectionsForRole(role) : [];

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="fixed left-2 top-2 z-30 h-12 w-12 rounded-2xl border border-border bg-card/80 text-fg shadow-sm backdrop-blur-xl hover:text-fg md:hidden"
        aria-label="Open navigation menu"
      >
        <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
          <rect y="0" width="20" height="2" rx="1" fill="currentColor" />
          <rect y="7" width="20" height="2" rx="1" fill="currentColor" />
          <rect y="14" width="20" height="2" rx="1" fill="currentColor" />
        </svg>
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-md md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed bottom-0 left-0 top-0 z-50 flex w-[300px] flex-col border-r border-border bg-card/95 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl transition-transform duration-300 ease-out md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!open}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <BrandMark size="md" showSubtitle={false} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            className="h-10 w-10 rounded-xl text-fg-muted hover:text-fg"
            aria-label="Close navigation menu"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5" aria-label="Mobile navigation">
          {sections.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-xs text-fg-dim">Loading…</div>
          ) : (
            <SidebarNavSections
              sections={sections}
              currentNavHref={currentNavHref}
              onNavigate={() => setOpen(false)}
            />
          )}
        </nav>

        <SidebarAccountFooter compact onNavigate={() => setOpen(false)} />
      </aside>
    </>
  );
}
