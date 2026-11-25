"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bot,

  Brain,
  CalendarRange,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  GitBranch,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Route,
  Settings2,
  Stethoscope,
  Tags,
  TrendingUp,
  Users,
  WalletCards,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { SITE_CONFIG } from "@/lib/site-metadata";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { requestBranchSelector, useWorkingScope, type BranchDTO, type WorkingOrgDTO } from "@/lib/branches";
import { quickAccessFor, quickActionsFor, type HomeIconName } from "@/lib/home-actions";
import { useSessionUser } from "@/lib/use-session-user";
import { requestLearn } from "@/lib/walkthroughs/events";

export const HOME_ICONS: Record<HomeIconName, LucideIcon> = {
  plus: Plus,
  dispatch: Route,
  drafts: ClipboardCheck,
  quotes: Tags,
  invoice: ReceiptText,
  agents: Bot,
  schedule: CalendarRange,
  closeout: Check,
  customers: Users,
  estimates: FileText,
  diagnostics: Stethoscope,
  jobs: Wrench,
  finance: WalletCards,
  pricebook: Tags,
  brain: Brain,
  reports: BarChart3,
  growth: TrendingUp,
  settings: Settings2,
};

const link =
  "font-medium text-[var(--shell-accent-text)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)] rounded-sm";

function ScopeChips({ org, branch }: { org: WorkingOrgDTO; branch: BranchDTO }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = async (label: string, value: string) => {
    if (timer.current) clearTimeout(timer.current);
    let next = "Copy failed";
    try {
      await navigator.clipboard.writeText(value);
      next = "Copied";
    } catch {
      setMessage(`${label} copy blocked`);
      return;
    }
    setMessage("");
    requestAnimationFrame(() => setMessage(`${label} ${next}`));
    timer.current = setTimeout(() => setMessage(""), 2_000);
  };
  const actionsButton =
    "grid size-7 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-[var(--shell-hover)] hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--shell-focus)]";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] text-fg-muted">You&apos;re working in</span>
        <div className="inline-flex h-9 max-w-[15rem] items-center gap-1 rounded-full border border-[var(--shell-border)] bg-[var(--shell-panel)] pl-3 pr-1">
          <span className="min-w-0 truncate font-medium" title={org.name}>
            {org.shortName}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Organization actions" className={actionsButton}>
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onSelect={() => void copy("Organization ID", org.publicId)}>
                <GitBranch aria-hidden="true" />
                Copy organization ID
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copy("Organization name", org.name)}>
                <GitBranch aria-hidden="true" />
                Copy full name
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ChevronRight className="size-4 text-fg-muted" aria-hidden="true" />
        <div className="inline-flex h-9 max-w-[16rem] items-center gap-1 rounded-full border border-[var(--shell-border)] bg-[var(--shell-panel)] pr-1">
          <button
            type="button"
            onClick={requestBranchSelector}
            aria-label={`Change branch, currently ${branch.name}`}
            className="inline-flex min-w-0 items-center gap-2 rounded-full pl-3 text-sm text-fg hover:text-[var(--shell-accent-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--shell-focus)]"
          >
            <GitBranch className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <span className="truncate font-medium">{branch.name}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Branch actions" className={actionsButton}>
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onSelect={() => void copy("Branch ID", branch.id)}>
                <GitBranch aria-hidden="true" />
                Copy branch ID
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={requestBranchSelector}>
                <GitBranch aria-hidden="true" />
                Change branch
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
        <span>
          Organization ID <code className="font-mono text-fg">{org.publicId}</code>
        </span>
        <span>
          Branch ID <code className="font-mono text-fg">{branch.id}</code>
        </span>
        <span role="status">{message}</span>
      </div>
    </div>
  );
}

export function Welcome() {
  const { user } = useSessionUser();
  const { org, branch } = useWorkingScope();
  const actions = quickActionsFor(user?.role);
  const modules = quickAccessFor(user?.role);
  const canSeeModules = Boolean(user);

  return (
    <section aria-labelledby="welcome-title" className="space-y-8">
      {/* Left: where you are and what you can do. Right: a learning card as tall as the left column. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-stretch">
        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-3">
            <Image
              src={SITE_CONFIG.productLogoPath}
              alt="NNACT Pro"
              width={48}
              height={48}
              priority
              className="size-11 shrink-0 sm:size-12"
            />
            <h1 id="welcome-title" className="text-[32px] font-normal tracking-[-0.01em] text-fg">
              Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
          </div>
          {org && branch ? (
            <ScopeChips org={org} branch={branch} />
          ) : (
            <p className="h-9 w-80 max-w-full animate-pulse rounded bg-[var(--shell-hover)]" aria-hidden="true" />
          )}
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <a href="#today" className={link}>
              Today at a glance
            </a>
            <Link href="/help" className={link}>
              Help and FAQ
            </Link>
          </p>
          {actions.length ? (
            <nav aria-label="Quick actions" className="pt-2">
              <ul className="flex flex-wrap gap-2" role="list">
                {actions.map((action) => {
                  const Icon = HOME_ICONS[action.icon];
                  return (
                    <li key={action.href}>
                      <Link
                        href={action.href}
                        className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[var(--shell-border)] px-3 text-sm font-medium text-fg no-underline transition-colors hover:border-[var(--shell-accent-bar)] hover:bg-[var(--shell-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]"
                      >
                        <Icon className="size-4 text-fg-muted" aria-hidden="true" />
                        {action.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
        </div>

        <aside
          aria-labelledby="learn-title"
          className="flex min-w-0 flex-col overflow-hidden rounded-[8px] border border-[var(--shell-border)] bg-[var(--shell-panel)]"
        >
          {/* The illustration takes whatever height the left column leaves. */}
          <div className="relative h-36 shrink-0 lg:h-auto lg:min-h-28 lg:flex-1">
            <Image
              src="/illustrations/learn-walkthroughs.webp"
              alt=""
              fill
              sizes="(min-width: 1024px) 19rem, 100vw"
              className="object-cover object-[45%_35%]"
            />
          </div>
          <div className="border-t border-[var(--shell-border)] px-4 py-3">
            <h2 id="learn-title" className="text-sm font-medium leading-snug text-fg">
              Learn NNACT Pro with short guided walkthroughs.
            </h2>
            <button
              type="button"
              onClick={() => requestLearn()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-[var(--shell-accent-text)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]"
            >
              Start a walkthrough <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </aside>
      </div>

      {canSeeModules ? (
        <section aria-labelledby="quick-access-title" className="space-y-3">
          <h2 id="quick-access-title" className="text-lg font-normal text-fg">
            Quick access
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" role="list">
            {modules.map((module) => {
              const Icon = HOME_ICONS[module.icon];
              return (
                <li key={module.href}>
                  <Link
                    href={module.href}
                    className="flex h-16 items-center gap-3 rounded-[8px] border border-[var(--shell-border)] px-4 text-sm font-medium text-fg no-underline transition-colors hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]"
                  >
                    <Icon className="size-5 shrink-0 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
                    <span className="truncate">{module.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href="/modules"
            className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[var(--shell-border)] px-3 text-sm font-medium text-fg no-underline hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]"
          >
            <LayoutGrid className="size-4 text-fg-muted" aria-hidden="true" />
            View all modules
          </Link>
        </section>
      ) : null}
    </section>
  );
}
