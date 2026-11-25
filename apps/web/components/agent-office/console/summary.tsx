"use client";

import { Activity, Inbox, ReceiptText, Route, TriangleAlert, Wallet } from "lucide-react";
import type { AgentApprovalDeskDTO, AgentOfficeAlert, AgentRoomDTO } from "@nnact/shared";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { formatCents } from "@/lib/agent-office/format";

const card = "min-w-0 rounded-[8px] border border-[var(--shell-border)] bg-[var(--shell-panel)] p-4";
const label = "flex items-center gap-2 text-xs font-medium text-fg-muted";
const big = "mt-2 text-2xl font-normal tabular-nums text-fg";

/** Four console-style summary cards above the agents table. */
export function OfficeSummary({
  rooms,
  approvals,
  alerts,
  costTodayCents,
}: {
  rooms: readonly AgentRoomDTO[];
  approvals: AgentApprovalDeskDTO;
  alerts: readonly AgentOfficeAlert[];
  costTodayCents: number;
}) {
  const live = rooms.filter((room) => room.stage === "live");
  const up = live.filter((room) => ["working", "idle", "waiting"].includes(room.status));
  const working = live.filter((room) => room.status === "working").length;
  const critical = alerts.filter((alert) => alert.severity === "critical").length;
  const capTotal = live.reduce((sum, room) => sum + (room.costCapCents ?? 0), 0);
  const waiting = approvals.draftJobs + approvals.quoteProposals + approvals.dispatchSuggestions;
  const share = capTotal ? Math.min(1, costTodayCents / capTotal) : 0;

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="list" aria-label="Agent Office summary">
      <li className={card}>
        <p className={label}>
          <Activity className="size-4" aria-hidden="true" />
          Agents running
        </p>
        <p className={big}>
          {up.length}
          <span className="text-base text-fg-muted"> / {live.length} live</span>
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          {working} working now · {rooms.length - live.length} not built yet
        </p>
      </li>
      <li className={card}>
        <p className={label}>
          <TriangleAlert className="size-4" aria-hidden="true" />
          Needs attention
        </p>
        <p className={big}>{alerts.length}</p>
        <p className="mt-1 text-xs text-fg-muted">
          {alerts.length === 0 ? "All clear" : critical ? `▲ ${critical} critical` : "Warnings only"}
        </p>
      </li>
      <li className={card}>
        <p className={label}>
          <Inbox className="size-4" aria-hidden="true" />
          Waiting for people
        </p>
        <p className={big}>{waiting}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          <Link href="/agent/drafts" className="inline-flex items-center gap-1 text-[var(--shell-accent-text)] hover:underline">
            <Inbox className="size-3" aria-hidden="true" />
            {approvals.draftJobs} drafts
          </Link>
          <Link href="/agent/quotes" className="inline-flex items-center gap-1 text-[var(--shell-accent-text)] hover:underline">
            <ReceiptText className="size-3" aria-hidden="true" />
            {approvals.quoteProposals} quotes
          </Link>
          <Link href="/dispatch" className="inline-flex items-center gap-1 text-[var(--shell-accent-text)] hover:underline">
            <Route className="size-3" aria-hidden="true" />
            {approvals.dispatchSuggestions} dispatch
          </Link>
        </p>
      </li>
      <li className={card}>
        <p className={label}>
          <Wallet className="size-4" aria-hidden="true" />
          AI cost today
        </p>
        <p className={big}>{formatCents(costTodayCents)}</p>
        {capTotal ? (
          <>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--shell-hover)]" aria-hidden="true">
              <div className="h-full rounded-full bg-[var(--shell-accent-bar)]" style={{ width: `${share * 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-fg-muted">
              {Math.round(share * 100)}% of {formatCents(capTotal)} combined daily caps
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-fg-muted">No caps set</p>
        )}
      </li>
    </ul>
  );
}
