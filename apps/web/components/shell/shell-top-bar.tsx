"use client";

import { Bot, ChevronDown, CircleHelp, GitBranch, GraduationCap, LogOut, Menu, Moon, Search, Sun, UserRound } from "lucide-react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { GlobalSearch } from "@/components/global-search";
import { NotificationsPopover } from "@/components/notifications-popover";
import { useTheme } from "@/components/theme-provider";
import { UserAvatar } from "@/components/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAgentsEnabled } from "@/lib/agent-office/preferences";
import { requestBranchSelector, useWorkingScope } from "@/lib/branches";
import { useSessionUser } from "@/lib/use-session-user";
import { requestLearn } from "@/lib/walkthroughs/events";
import { cn } from "@/lib/utils";

const iconButton =
  "relative grid size-10 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-[var(--shell-hover)] hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]";

function AccountMenu() {
  const { theme, toggle } = useTheme();
  const { user, signingOut, signOut } = useSessionUser();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(iconButton, "size-9")} aria-label="Account and preferences">
          {user ? (
            <UserAvatar name={user.name} src={user.profilePictureUrl} size="sm" />
          ) : (
            <UserRound className="size-5" aria-hidden="true" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block truncate text-sm font-semibold text-fg">{user?.name ?? "Signed out"}</span>
          <span className="block truncate text-xs font-normal text-fg-muted">{user?.email}</span>
          <span className="block text-xs font-normal capitalize text-fg-muted">{user?.title || user?.role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={user ? "/profile" : "/login"}>
            <UserRound />
            {user ? "Profile" : "Sign in"}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => requestLearn()}>
          <GraduationCap />
          Learn NNACT
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={toggle}>
          {theme === "dark" ? <Sun /> : <Moon />}
          {theme === "dark" ? "Light appearance" : "Dark appearance"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={!user || signingOut} onSelect={() => void signOut()}>
          <LogOut />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Product wordmark: text only, like a console's. */
function Wordmark() {
  return (
    <Link
      href="/"
      className="shrink-0 rounded-md px-1.5 text-[19px] font-semibold tracking-[-0.01em] text-fg-muted no-underline hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]"
    >
      NNACT Pro
    </Link>
  );
}

function BranchPicker() {
  const { org, branch } = useWorkingScope();
  if (!branch) return null;
  return (
    <button
      type="button"
      onClick={requestBranchSelector}
      aria-label={`Branch: ${branch.name}. Change branch`}
      className="inline-flex h-9 min-w-0 max-w-[7rem] items-center gap-2 rounded-full border border-[var(--shell-border)] bg-[var(--shell-panel)] pl-2.5 pr-2 text-sm text-fg hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)] sm:max-w-[15rem] sm:pl-3"
    >
      {org ? <span className="hidden max-w-[5rem] truncate text-xs font-medium text-fg-muted sm:inline">{org.shortName}</span> : null}
      <span className="hidden h-4 w-px shrink-0 bg-[var(--shell-border)] sm:block" aria-hidden="true" />
      <GitBranch className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
      <span className="truncate font-medium">{branch.name}</span>
      <ChevronDown className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
    </button>
  );
}

function AgentStatus() {
  const { user } = useSessionUser();
  const { enabled } = useAgentsEnabled();
  if (user?.role !== "owner") return null;
  return (
    <Link href="/agents" className={iconButton} aria-label={`Agent Office, agents ${enabled ? "on" : "off"}`} title="Agent Office">
      <Bot className="size-5" strokeWidth={1.8} aria-hidden="true" />
      <span
        className={cn(
          "absolute right-2 top-2 size-2 rounded-full ring-2 ring-[var(--shell-canvas)]",
          enabled ? "bg-green" : "bg-fg-dim",
        )}
        aria-hidden="true"
      />
    </Link>
  );
}

export function ShellTopBar({ navOpen, onMenu }: { navOpen: boolean; onMenu: () => void }) {
  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-1 bg-[var(--shell-canvas)] px-2 sm:gap-2 sm:px-3">
      <button
        type="button"
        onClick={onMenu}
        className={iconButton}
        aria-label={navOpen ? "Hide navigation" : "Show navigation"}
        aria-expanded={navOpen}
        aria-controls="shell-sidebar"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <Wordmark />
      <BranchPicker />

      <div className="flex min-w-0 flex-1 justify-center px-2">
        <div className="hidden w-full max-w-2xl justify-center sm:flex">
          <GlobalSearch variant="bar" />
        </div>
        <button
          type="button"
          className={cn(iconButton, "ml-auto sm:hidden")}
          aria-label="Search"
          onClick={() => window.dispatchEvent(new Event("nnact:open-search"))}
        >
          <Search className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <AgentStatus />
        <NotificationsPopover />
        <Link href="/help/faq" className={cn(iconButton, "hidden sm:grid")} aria-label="Help and FAQ" title="Help">
          <CircleHelp className="size-5" strokeWidth={1.8} aria-hidden="true" />
        </Link>
        <AccountMenu />
      </div>
    </header>
  );
}
