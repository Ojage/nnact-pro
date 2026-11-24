"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, List, Radio, RefreshCw, TriangleAlert, Unplug } from "lucide-react";
import { deriveAgentAlerts, type AgentOfficeAlert } from "@nnact/shared";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useAgentOfficeOverviewQuery } from "@/lib/agent-office/api";
import { AGENT_OFFICE_ENABLED, formatCents } from "@/lib/agent-office/format";
import { AGENT_OFFICE_POLL_MS, useAgentOfficeConnection, type AgentOfficeConnection } from "@/lib/agent-office/stream";
import { explainRtkError } from "@/lib/redux/api";
import { AgentDrawer } from "./agent-drawer";
import { OfficeFloor, OfficeList, OfficeSkeleton } from "./office-floor";
import styles from "./office.module.css";

type View = "floor" | "list";

const CONNECTION_COPY: Record<AgentOfficeConnection, { label: string; icon: typeof Radio }> = {
  idle: { label: "Not connected", icon: Unplug },
  connecting: { label: "Connecting…", icon: RefreshCw },
  live: { label: "Live", icon: Radio },
  reconnecting: { label: "Reconnecting…", icon: RefreshCw },
  polling: { label: `Polling every ${AGENT_OFFICE_POLL_MS / 1000} s`, icon: RefreshCw },
};

/** Re-render on a slow clock so "stalled" alerts appear without new data. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function ConnectionPill({ state }: { state: AgentOfficeConnection }) {
  const { label, icon: Icon } = CONNECTION_COPY[state];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-fg">
      <Icon size={12} aria-hidden="true" />
      <span className="sr-only">Connection: </span>
      {label}
    </span>
  );
}

function AlertList({ alerts, onOpen }: { alerts: readonly AgentOfficeAlert[]; onOpen: (agentId: string) => void }) {
  if (alerts.length === 0) return null;
  return (
    <section aria-label="Alerts" className="rounded-lg border border-border bg-card p-3">
      <h2 className="mb-2 text-sm font-semibold text-fg">
        {alerts.length} alert{alerts.length === 1 ? "" : "s"}
      </h2>
      <ul className="grid gap-1.5">
        {alerts.map((alert) => (
          <li key={alert.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-2">
              <TriangleAlert
                size={14}
                aria-hidden="true"
                className={alert.severity === "critical" ? "text-[var(--color-danger-fg)]" : "text-[var(--color-attention-fg)]"}
              />
              <span className="font-semibold">{alert.severity === "critical" ? "Critical" : "Warning"}:</span>
              {alert.message}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpen(alert.agentId)}>
              Open office
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AgentOfficePage() {
  if (!AGENT_OFFICE_ENABLED) {
    return (
      <>
        <PageHeader title="Agent Office" />
        <p className="text-sm text-fg-muted">The Agent Office is turned off for this installation.</p>
      </>
    );
  }
  return <AgentOffice />;
}

function AgentOffice() {
  const connection = useAgentOfficeConnection();
  const overview = useAgentOfficeOverviewQuery(undefined, {
    pollingInterval: connection === "polling" ? AGENT_OFFICE_POLL_MS : 0,
  });
  const [view, setView] = useState<View>("floor");
  const [openId, setOpenId] = useState<string | null>(null);
  const now = useNow(30_000);

  // The list is the default on small screens; the owner can switch either way.
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setView("list");
  }, []);

  const rooms = overview.data?.agents;
  const alerts = useMemo(() => (rooms ? deriveAgentAlerts(rooms, now) : []), [rooms, now]);
  const openRoom = rooms?.find((room) => room.id === openId) ?? null;
  const onOpen = useCallback((agentId: string) => setOpenId(agentId), []);
  const onClose = useCallback(() => setOpenId(null), []);

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
    <div className={`${styles.office} grid gap-4`}>
      <PageHeader
        title="Agent Office"
        description="Every NNACT agent at its desk: what it is doing now, what it costs, and what is waiting for a person."
        actions={
          <>
            <ConnectionPill state={connection} />
            <span className="text-sm text-fg">
              <span className="text-fg-muted">Cost today </span>
              <span className="font-semibold tabular-nums">{formatCents(overview.data?.costTodayCents ?? 0)}</span>
            </span>
            <span className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="View">
              <Button type="button" variant={view === "floor" ? "secondary" : "ghost"} size="sm" aria-pressed={view === "floor"} onClick={() => setView("floor")}>
                <LayoutGrid size={14} aria-hidden="true" />
                Floor plan
              </Button>
              <Button type="button" variant={view === "list" ? "secondary" : "ghost"} size="sm" aria-pressed={view === "list"} onClick={() => setView("list")}>
                <List size={14} aria-hidden="true" />
                List
              </Button>
            </span>
          </>
        }
        className="mb-0"
      />

      <p className="sr-only" role="status">
        {announcement}
      </p>

      <AlertList alerts={alerts} onOpen={onOpen} />

      {overview.isLoading ? <OfficeSkeleton /> : null}

      {overview.error && !overview.data ? (
        <div role="alert" className="grid justify-items-start gap-2 rounded-lg border border-border p-4 text-sm">
          <p className="font-semibold text-fg">The Agent Office could not be loaded.</p>
          <p className="text-fg-muted">{explainRtkError(overview.error)}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void overview.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      {overview.data && overview.data.agents.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-fg-muted">No agents are registered yet.</p>
      ) : null}

      {overview.data && overview.data.agents.length > 0 ? (
        view === "floor" ? (
          <OfficeFloor rooms={overview.data.agents} approvals={overview.data.approvals} onOpen={onOpen} />
        ) : (
          <OfficeList rooms={overview.data.agents} approvals={overview.data.approvals} onOpen={onOpen} />
        )
      ) : null}

      <AgentDrawer room={openRoom} onClose={onClose} />
    </div>
  );
}
