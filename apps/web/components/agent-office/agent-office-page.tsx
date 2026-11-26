"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Radio, RefreshCw, Rows3, TriangleAlert, Unplug } from "lucide-react";
import { deriveAgentAlerts, type AgentOfficeAlert } from "@nnact/shared";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentOfficeOverviewQuery } from "@/lib/agent-office/api";
import { useAgentsEnabled } from "@/lib/agent-office/preferences";
import { AGENT_OFFICE_POLL_MS, useAgentOfficeConnection, type AgentOfficeConnection } from "@/lib/agent-office/stream";
import { explainRtkError } from "@/lib/redux/api";
import { cn } from "@/lib/utils";
import { AgentsTable } from "./console/agents-table";
import { OfficeSummary } from "./console/summary";
import { OfficeFloor } from "./office-floor";
import styles from "./office.module.css";

type View = "table" | "floor";
const VIEW_KEY = "nnact.agentOffice.view";

const CONNECTION_COPY: Record<AgentOfficeConnection, { label: string; icon: typeof Radio }> = {
  idle: { label: "Not connected", icon: Unplug },
  connecting: { label: "Connecting…", icon: RefreshCw },
  live: { label: "Live", icon: Radio },
  reconnecting: { label: "Reconnecting…", icon: RefreshCw },
  polling: { label: `Updating every ${AGENT_OFFICE_POLL_MS / 1000} s`, icon: RefreshCw },
};

const toolbarButton =
  "inline-flex h-9 items-center gap-2 rounded-[6px] px-2.5 text-sm font-medium text-[var(--shell-accent-text)] hover:bg-[var(--shell-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)] disabled:opacity-50";

/** Re-render on a slow clock so "stalled" alerts appear without new data. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function ConnectionState({ state }: { state: AgentOfficeConnection }) {
  const { label, icon: Icon } = CONNECTION_COPY[state];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
      <Icon className={cn("size-3.5", state === "live" && "text-[var(--color-success-fg)]")} aria-hidden="true" />
      <span className="sr-only">Connection: </span>
      {label}
    </span>
  );
}

/** Console-style notification banners, one per alert, worst first. */
function AlertBanners({ alerts }: { alerts: readonly AgentOfficeAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <ul className="grid gap-2" role="list" aria-label="Alerts">
      {alerts.map((alert) => {
        const critical = alert.severity === "critical";
        return (
          <li
            key={alert.id}
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[8px] border px-4 py-2.5 text-sm",
              critical
                ? "border-[color-mix(in_srgb,var(--color-danger-fg)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-danger-fg)_7%,var(--shell-panel))]"
                : "border-[color-mix(in_srgb,var(--color-attention-fg)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-attention-fg)_7%,var(--shell-panel))]",
            )}
          >
            <TriangleAlert
              className={cn("size-4 shrink-0", critical ? "text-[var(--color-danger-fg)]" : "text-[var(--color-attention-fg)]")}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 text-fg">
              <span className="font-medium">{critical ? "Critical: " : "Warning: "}</span>
              {alert.message}
            </span>
            <Link href={`/agents/${alert.agentId}`} className="text-sm font-medium text-[var(--shell-accent-text)] hover:underline">
              View agent
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function OfficeLoading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading agents">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[6.5rem] rounded-[8px]" />
        ))}
      </div>
      <div className="overflow-hidden rounded-[8px] border border-[var(--shell-border)]">
        <Skeleton className="h-11 rounded-none" />
        <Skeleton className="h-10 rounded-none opacity-60" />
        {Array.from({ length: 6 }, (_, row) => (
          <div key={row} className="flex h-14 items-center gap-6 border-t border-[var(--shell-border)] px-4">
            <Skeleton className="h-4 w-20 rounded-[6px]" />
            <Skeleton className="h-4 w-36 rounded-[6px]" />
            <Skeleton className="h-4 flex-1 rounded-[6px]" />
            <Skeleton className="h-4 w-24 rounded-[6px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentOfficePage() {
  const router = useRouter();
  const { enabled, setEnabled } = useAgentsEnabled();
  const connection = useAgentOfficeConnection();
  const overview = useAgentOfficeOverviewQuery(undefined, {
    pollingInterval: connection === "polling" ? AGENT_OFFICE_POLL_MS : 0,
    skip: !enabled,
  });
  const [view, setView] = useState<View>("table");
  const now = useNow(30_000);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(VIEW_KEY) === "floor") setView("floor");
    } catch {
      // Storage blocked: the table stays the default.
    }
  }, []);
  const chooseView = (next: View) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage blocked: the choice lasts for this visit.
    }
  };

  const rooms = overview.data?.agents;
  const alerts = useMemo(() => (rooms ? deriveAgentAlerts(rooms, now) : []), [rooms, now]);
  const openAgent = useCallback((agentId: string) => router.push(`/agents/${agentId}`), [router]);

  // One polite announcement when the alert count grows; never per update.
  const [announcement, setAnnouncement] = useState("");
  const previousAlerts = useRef(0);
  useEffect(() => {
    const critical = alerts.filter((alert) => alert.severity === "critical").length;
    if (alerts.length > previousAlerts.current) {
      setAnnouncement(`${alerts.length} agent alert${alerts.length === 1 ? "" : "s"}${critical ? `, ${critical} critical` : ""}`);
    }
    previousAlerts.current = alerts.length;
  }, [alerts]);

  return (
    <div className={cn(styles.office, "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5")}>
      <header className="grid gap-3 border-b border-[var(--shell-border)] pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[22px] font-normal text-fg">Agent Office</h1>
          {enabled ? <ConnectionState state={connection} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Agent Office actions">
          <button type="button" className={toolbarButton} onClick={() => void overview.refetch()} disabled={!enabled || overview.isFetching}>
            <RefreshCw className={cn("size-4", overview.isFetching && "motion-safe:animate-spin")} aria-hidden="true" />
            Refresh
          </button>
          <span className="mx-1 h-5 w-px bg-[var(--shell-border)]" aria-hidden="true" />
          <label className="inline-flex h-9 items-center gap-2 px-2.5 text-sm font-medium text-fg">
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Agents enabled" />
            Agents {enabled ? "on" : "off"}
          </label>
          {enabled ? (
            <span className="ml-auto inline-flex rounded-[6px] border border-[var(--shell-border)] p-0.5" role="group" aria-label="View">
              {([
                ["table", "Table", Rows3],
                ["floor", "Floor plan", LayoutGrid],
              ] as const).map(([id, text, Icon]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={view === id}
                  onClick={() => chooseView(id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-[4px] px-2.5 text-sm",
                    view === id ? "bg-[var(--shell-tint)] font-medium text-[var(--shell-accent-text)]" : "text-fg-muted hover:bg-[var(--shell-hover)]",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {text}
                </button>
              ))}
            </span>
          ) : null}
        </div>
      </header>

      <p className="sr-only" role="status">
        {announcement}
      </p>

      {!enabled ? (
        <section className="rounded-[8px] border border-[var(--shell-border)] px-6 py-10 text-center">
          <h2 className="text-base font-medium text-fg">Agents are switched off in this browser</h2>
          <p className="mt-1 text-sm text-fg-muted">Turn agents on above to see every agent, its work and its controls.</p>
        </section>
      ) : null}

      {enabled && overview.isLoading ? <OfficeLoading /> : null}

      {enabled && overview.error && !overview.data ? (
        <div role="alert" className="grid justify-items-start gap-2 rounded-[8px] border border-[var(--shell-border)] p-4 text-sm">
          <p className="font-medium text-fg">▲ The Agent Office could not be loaded.</p>
          <p className="text-fg-muted">{explainRtkError(overview.error)}</p>
          <button type="button" className={toolbarButton} onClick={() => void overview.refetch()}>
            Try again
          </button>
        </div>
      ) : null}

      {enabled && overview.data ? (
        <>
          <AlertBanners alerts={alerts} />
          <OfficeSummary
            rooms={overview.data.agents}
            approvals={overview.data.approvals}
            alerts={alerts}
            costTodayCents={overview.data.costTodayCents}
          />
          {overview.data.agents.length === 0 ? (
            <p className="rounded-[8px] border border-dashed border-[var(--shell-border)] p-6 text-center text-sm text-fg-muted">
              No agents are registered yet.
            </p>
          ) : view === "table" ? (
            <AgentsTable rooms={overview.data.agents} />
          ) : (
            <OfficeFloor rooms={overview.data.agents} approvals={overview.data.approvals} onOpen={openAgent} />
          )}
        </>
      ) : null}
    </div>
  );
}
