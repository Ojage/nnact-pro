"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  CalendarRange,
  ChevronDown,
  Circle,
  GraduationCap,
  House,
  LogOut,
  Megaphone,
  Moon,
  Settings2,
  Sparkles,
  Sun,
  TrendingUp,
  UserRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { NavLinkItem } from "@/components/nav-link-item";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { activeNavHref, navSectionsForRole } from "@/lib/nav";
import type { NavRole, NavSection } from "@/lib/nav";
import { useTheme } from "@/components/theme-provider";
import { NotificationsPopover } from "@/components/notifications-popover";
import { useSessionUser } from "@/lib/use-session-user";
import { BrandMark } from "@/components/brand-mark";
import { UserAvatar } from "@/components/user-avatar";
import { useAgentsEnabled } from "@/lib/agent-office/preferences";
import { requestLearn } from "@/lib/walkthroughs/events";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

export function SidebarNavSections({
  sections,
  currentNavHref,
  onNavigate,
}: {
  sections: NavSection[];
  currentNavHref: string | null;
  onNavigate?: () => void;
}) {
  const activeSection = sections.find((section) =>
    section.links.some((link) => link.href === currentNavHref),
  );
  const { enabled: agentsEnabled } = useAgentsEnabled();
  const [expandedLabel, setExpandedLabel] = useState<string | null>(activeSection?.label ?? null);

  useEffect(() => {
    if (activeSection) setExpandedLabel(activeSection.label);
  }, [activeSection?.label]);

  return (
    <div className="space-y-1">
      {sections.map((section) => {
        const Icon = SECTION_ICONS[section.label] ?? Circle;
        const isActiveSection = activeSection?.label === section.label;
        const isExpanded = expandedLabel === section.label;

        return (
          <div key={section.label}>
            <div
              className={cn(
                "flex h-11 items-center rounded-2xl transition-colors duration-200",
                isActiveSection ? "bg-surface-200" : "hover:bg-surface-200/70",
              )}
            >
              <Link
                href={section.home}
                onClick={onNavigate}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm font-semibold no-underline"
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-xl",
                    isActiveSection ? "bg-card text-fg shadow-sm" : "text-fg-muted",
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-fg">{section.label}</span>
                {section.label === "Agents" ? (
                  <span
                    className={cn("size-1.5 shrink-0 rounded-full", agentsEnabled ? "bg-green" : "bg-fg-dim")}
                    aria-label={agentsEnabled ? "Agents on" : "Agents off"}
                  />
                ) : isActiveSection ? (
                  <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                ) : null}
              </Link>
              <button
                type="button"
                onClick={() => setExpandedLabel(isExpanded ? null : section.label)}
                className="mr-1 grid size-8 shrink-0 place-items-center rounded-xl text-fg-dim transition-colors hover:bg-card hover:text-fg"
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? "Hide" : "Show"} ${section.label} pages`}
              >
                <ChevronDown
                  className={cn("size-4 transition-transform duration-200", isExpanded && "rotate-180")}
                  aria-hidden="true"
                />
              </button>
            </div>

            {isExpanded ? (
              <div className="ml-6 mt-1 space-y-0.5 border-l border-border pl-3">
                {section.links.map(({ href, label, icon, tour }) => (
                  <NavLinkItem
                    key={href}
                    href={href}
                    label={label}
                    icon={icon}
                    tour={tour}
                    active={currentNavHref === href}
                    onNavigate={onNavigate}
                    className="h-9 px-2.5 text-[13px] font-medium"
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function SidebarAccountFooter({
  compact,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const { theme, toggle } = useTheme();
  const { user, loading, signingOut, signOut } = useSessionUser();

  return (
    <div className="shrink-0 border-t border-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl px-2 text-left transition-colors hover:bg-surface-200",
              compact ? "py-2.5" : "py-2",
            )}
            aria-label="Open account and preferences menu"
          >
            {user ? (
              <UserAvatar name={user.name} src={user.profilePictureUrl} size="default" />
            ) : (
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-200 text-fg-muted">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-fg">
                {loading ? "Loading…" : user?.name ?? "Sign in"}
              </span>
              <span className="block truncate text-[11px] capitalize text-fg-dim">
                {user?.title || user?.role || "NNACT Pro"}
              </span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-fg-dim" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-[240px]">
          <DropdownMenuLabel className="truncate text-xs font-medium text-fg-dim">
            {user?.email ?? "Field service operations"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={user ? "/profile" : "/login"} onClick={onNavigate}>
              <UserRound />
              {user ? "Profile" : "Sign in"}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              requestLearn();
              onNavigate?.();
            }}
          >
            <GraduationCap />
            Learn NNACT
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              toggle();
              onNavigate?.();
            }}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
            {theme === "dark" ? "Light appearance" : "Dark appearance"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!user || signingOut}
            onSelect={() => {
              void signOut();
              onNavigate?.();
            }}
          >
            <LogOut />
            {signingOut ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const currentNavHref = activeNavHref(pathname);
  const { user } = useSessionUser();
  const sections = user?.role ? navSectionsForRole(user.role as NavRole) : [];

  return (
    <aside className="fixed bottom-0 left-0 top-0 z-40 hidden w-[var(--sidebar-width)] flex-col border-r border-border bg-card/80 backdrop-blur-2xl md:flex">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
        <BrandMark href="/" size="md" />
        <NotificationsPopover />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Primary navigation">
        {sections.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-xs text-fg-dim">Loading…</div>
        ) : (
          <SidebarNavSections sections={sections} currentNavHref={currentNavHref} />
        )}
      </nav>

      <SidebarAccountFooter />
    </aside>
  );
}
