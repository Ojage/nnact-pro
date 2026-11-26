"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  CalendarRange,
  ChevronDown,
  Circle,
  House,
  Megaphone,
  Settings2,
  Sparkles,
  TrendingUp,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { NavLinkItem } from "@/components/nav-link-item";
import { useAgentsEnabled } from "@/lib/agent-office/preferences";
import { activeNavHref, navSectionsForRole, type NavRole, type NavSection } from "@/lib/nav";
import { useSessionUser } from "@/lib/use-session-user";
import { cn } from "@/lib/utils";

const SECTION_ICONS: Record<string, LucideIcon> = {
  Field: House,
  Agents: Bot,
  Operations: CalendarRange,
  Finance: WalletCards,
  Marketing: Megaphone,
  Quality: Sparkles,
  Growth: TrendingUp,
  System: Settings2,
};

/** Grouped navigation, driven by the route-role table in lib/nav.ts. */
function NavSections({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = activeNavHref(pathname);
  const activeLabel = sections.find((section) => section.links.some((link) => link.href === current))?.label ?? null;
  const [open, setOpen] = useState<Set<string>>(() => new Set(activeLabel ? [activeLabel] : []));
  const { enabled: agentsEnabled } = useAgentsEnabled();

  // Navigating into a group opens it; groups the person opened stay open.
  useEffect(() => {
    if (activeLabel) setOpen((prev) => (prev.has(activeLabel) ? prev : new Set(prev).add(activeLabel)));
  }, [activeLabel]);

  return (
    <ul className="space-y-0.5" role="list">
      {sections.map((section) => {
        const Icon = SECTION_ICONS[section.label] ?? Circle;
        const expanded = open.has(section.label);
        const listId = `shell-nav-${section.label.toLowerCase()}`;
        return (
          <li key={section.label}>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(section.label)) next.delete(section.label);
                  else next.add(section.label);
                  return next;
                })
              }
              className={cn(
                "flex h-10 w-full items-center gap-3 rounded-r-full pl-5 pr-3 text-left text-sm font-medium text-fg transition-colors",
                "hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--shell-focus)]",
              )}
            >
              <Icon className="size-[18px] shrink-0 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{section.label}</span>
              {section.label === "Agents" ? (
                <span className="flex items-center gap-1 text-[11px] text-fg-muted">
                  <span className={cn("size-1.5 rounded-full", agentsEnabled ? "bg-green" : "bg-fg-dim")} aria-hidden="true" />
                  {agentsEnabled ? "On" : "Off"}
                </span>
              ) : null}
              <ChevronDown
                className={cn("size-4 shrink-0 text-fg-dim motion-safe:transition-transform", expanded && "rotate-180")}
                aria-hidden="true"
              />
            </button>
            <ul id={listId} hidden={!expanded} className="pb-1" role="list">
              {section.links.map(({ href, label, icon, tour }) => {
                const active = current === href;
                return (
                  <li key={href}>
                    <NavLinkItem
                      href={href}
                      label={label}
                      icon={icon}
                      tour={tour}
                      active={active}
                      onNavigate={onNavigate}
                      className={cn(
                        "h-9 rounded-l-none rounded-r-full pl-12 text-[13px] font-normal shadow-none",
                        active
                          ? "border-l-[3px] border-[var(--shell-accent-bar)] bg-[var(--shell-tint)] pl-[45px] font-semibold text-[var(--shell-accent-text)] shadow-none"
                          : "text-fg hover:bg-[var(--shell-hover)] hover:text-fg",
                      )}
                    />
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

function useSections(): NavSection[] {
  const { user } = useSessionUser();
  return user?.role ? navSectionsForRole(user.role as NavRole) : [];
}

/** Desktop: a pinned column on the grey canvas, beside the white content panel. */
export function ShellSidebar({ pinned }: { pinned: boolean }) {
  const sections = useSections();
  return (
    <nav
      id="shell-sidebar"
      aria-label="Primary navigation"
      hidden={!pinned}
      className="hidden w-[var(--shell-sidebar-width)] shrink-0 overflow-y-auto overscroll-contain pb-6 pr-2 pt-1 md:block"
    >
      {sections.length === 0 ? <p className="px-5 py-8 text-xs text-fg-muted">Loading…</p> : <NavSections sections={sections} />}
    </nav>
  );
}

/**
 * Phone: the same navigation in a modal <dialog> drawer. The browser makes the
 * page inert, closes on Escape and returns focus to the hamburger.
 */
export function ShellDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const sections = useSections();
  const pathname = usePathname();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Leaving the page closes the drawer.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <dialog
      ref={ref}
      aria-label="Navigation"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="shell-drawer m-0 h-[100svh] max-h-none w-[min(20rem,85vw)] max-w-none border-0 bg-[var(--shell-canvas)] p-0 text-fg md:hidden"
    >
      <div className="flex h-14 items-center justify-between px-3">
        <a href="/" className="px-1.5 text-[19px] font-semibold tracking-[-0.01em] text-fg-muted no-underline">NNACT Pro</a>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label="Close navigation"
          className="grid size-10 place-items-center rounded-full text-fg-muted hover:bg-[var(--shell-hover)] hover:text-fg"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="overflow-y-auto pb-6 pr-2">
        <NavSections sections={sections} onNavigate={onClose} />
      </div>
    </dialog>
  );
}
