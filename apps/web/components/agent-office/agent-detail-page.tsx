"use client";

import { ChevronRight, Pause, Play, RefreshCw, RotateCcw } from "lucide-react";
import { approvalRate, costRatio, type AgentDetailDTO, type AgentRoomDTO } from "@nnact/shared";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAgentOfficeAgentQuery,
  useAgentOfficeOverviewQuery,
  useRestartAgentMutation,
  useStartAgentMutation,
} from "@/lib/agent-office/api";
import { STAGE_LABEL, STATUS_LABEL, formatAgo, formatCents, formatDuration, formatPercent, processActionMessage } from "@/lib/agent-office/format";
import { AGENT_OFFICE_POLL_MS, useAgentOfficeConnection } from "@/lib/agent-office/stream";
import { explainRtkError } from "@/lib/redux/api";
import { cn } from "@/lib/utils";
import {
  ConfigPanel,
  ControlsPanel,
  DETAIL_POLL_MS,
  LogsPanel,
  MetricsPanel,
  NowPanel,
  QueryProblem,
  RunsPanel,
} from "./agent-drawer";
import { StatusLamp } from "./office-bits";
import styles from "./office.module.css";

const SECTIONS = [
  { id: "overview", label: "Overview", liveOnly: true },
  { id: "runs", label: "Runs", liveOnly: true },
  { id: "logs", label: "Logs", liveOnly: true },
  { id: "metrics", label: "Metrics", liveOnly: true },
  { id: "config", label: "Configuration", liveOnly: false },
  { id: "controls", label: "Controls", liveOnly: true },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const toolbarButton =
  "inline-flex h-9 items-center gap-2 rounded-[6px] px-2.5 text-sm font-medium text-[var(--shell-accent-text)] hover:bg-[var(--shell-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)] disabled:opacity-50";

/** Console-style details page for one agent: breadcrumb, header, actions, section links. */
export function AgentDetailPage({ agentId }: { agentId: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const connection = useAgentOfficeConnection();
  const overview = useAgentOfficeOverviewQuery(undefined, {
    pollingInterval: connection === "polling" ? AGENT_OFFICE_POLL_MS : 0,
  });
  const detail = useAgentOfficeAgentQuery(agentId, { pollingInterval: DETAIL_POLL_MS });
  const [start, startState] = useStartAgentMutation();
  const [restart, restartState] = useRestartAgentMutation();

  const room = overview.data?.agents.find((item) => item.id === agentId) ?? detail.data?.agent ?? null;
  const live = room?.stage === "live";
  const sections = SECTIONS.filter((section) => live || !section.liveOnly);
  const requested = params.get("tab") as SectionId | null;
  const current: SectionId = sections.some((section) => section.id === requested) ? requested! : sections[0]?.id ?? "config";

  const hrefFor = (id: SectionId) => {
    const next = new URLSearchParams(params.toString());
    if (id === sections[0]?.id) next.delete("tab");
    else next.set("tab", id);
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const runProcess = async (mode: "start" | "restart") => {
    if (!room) return;
    try {
      const result = await (mode === "start" ? start : restart)(room.id).unwrap();
      toast.success(processActionMessage(room.displayName, mode, result));
    } catch (error) {
      toast.error(explainRtkError(error, `Could not ${mode} ${room.displayName}`));
    }
  };

  if (!room) {
    if (overview.isLoading || detail.isLoading) {
      return (
        <div className="grid gap-4" aria-busy="true" aria-label="Loading agent">
          <Skeleton className="h-4 w-48 rounded-[6px]" />
          <Skeleton className="h-8 w-72 rounded-[6px]" />
          <Skeleton className="h-10 w-full rounded-[6px]" />
          <Skeleton className="h-64 w-full rounded-[8px]" />
        </div>
      );
    }
    return (
      <div className="grid justify-items-start gap-3">
        <Breadcrumb name="Not found" />
        <h1 className="text-[22px] font-normal text-fg">This agent does not exist</h1>
        {detail.error ? <QueryProblem error={detail.error} onRetry={() => void detail.refetch()} /> : null}
        <Link href="/agents" className="text-sm font-medium text-[var(--shell-accent-text)] hover:underline">
          Back to Agent Office
        </Link>
      </div>
    );
  }

  const busy = startState.isLoading || restartState.isLoading;

  return (
    <div className={cn(styles.office, "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5")}>
      <header className="grid gap-3">
        <Breadcrumb name={room.displayName} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-[22px] font-normal text-fg">{room.displayName}</h1>
          {live ? <StatusLamp status={room.status} /> : <span className="text-sm text-fg-muted">○ {STAGE_LABEL[room.stage]}</span>}
          <span className="rounded-[4px] border border-[var(--shell-border)] px-1.5 py-px text-xs text-fg-muted">Tier {room.tier}</span>
          {!room.enabled ? <span className="text-xs font-medium text-fg">⏸ Paused by an owner</span> : null}
          {live ? <span className="text-xs text-fg-muted">Last seen {formatAgo(room.lastSeenAt)}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label={`${room.displayName} actions`}>
          {live ? (
            <>
              <button type="button" className={toolbarButton} disabled={busy} onClick={() => void runProcess("start")}>
                <Play className="size-4" aria-hidden="true" />
                Start
              </button>
              <button type="button" className={toolbarButton} disabled={busy} onClick={() => void runProcess("restart")}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Restart
              </button>
              <Link href={hrefFor("controls")} className={toolbarButton} scroll={false}>
                {room.enabled ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                {room.enabled ? "Pause" : "Resume"}
              </Link>
            </>
          ) : null}
          <button
            type="button"
            className={toolbarButton}
            onClick={() => {
              void overview.refetch();
              void detail.refetch();
            }}
          >
            <RefreshCw className={cn("size-4", (overview.isFetching || detail.isFetching) && "motion-safe:animate-spin")} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      <nav aria-label={`${room.displayName} sections`} className="-mt-2 overflow-x-auto border-b border-[var(--shell-border)]">
        <ul className="flex min-w-max gap-1" role="list">
          {sections.map((section) => {
            const active = section.id === current;
            return (
              <li key={section.id}>
                <Link
                  href={hrefFor(section.id)}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-11 items-center px-3 text-sm no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--shell-focus)]",
                    active
                      ? "font-medium text-[var(--shell-accent-text)] after:absolute after:inset-x-0 after:bottom-0 after:border-b-[3px] after:border-[var(--shell-accent-bar)]"
                      : "text-fg-muted hover:bg-[var(--shell-hover)] hover:text-fg",
                  )}
                >
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-label={sections.find((section) => section.id === current)?.label} className={cn(styles.panelBody, "!p-0")}>
        {!live && current === "config" ? (
          <p className="rounded-[8px] border border-dashed border-[var(--shell-border)] p-4 text-sm text-fg-muted">
            This agent is {STAGE_LABEL[room.stage].toLowerCase()}. Its configuration is shown below; runs, logs and controls appear once it is live.
          </p>
        ) : null}
        {current === "overview" ? <OverviewCards room={room} detail={detail.data} /> : null}
        {current === "runs" ? <RunsPanel agentId={room.id} /> : null}
        {current === "logs" ? <LogsPanel agentId={room.id} polling={connection === "polling"} /> : null}
        {current === "metrics" ? <MetricsPanel detail={detail.data} error={detail.error} onRetry={() => void detail.refetch()} /> : null}
        {current === "config" ? <ConfigPanel room={room} detail={detail.data} error={detail.error} onRetry={() => void detail.refetch()} /> : null}
        {current === "controls" ? <ControlsPanel room={room} detail={detail.data} /> : null}
      </section>
    </div>
  );
}

function Breadcrumb({ name }: { name: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1 text-sm text-fg-muted" role="list">
        <li>
          <Link href="/agents" className="text-[var(--shell-accent-text)] hover:underline">
            Agent Office
          </Link>
        </li>
        <li aria-hidden="true">
          <ChevronRight className="size-4" />
        </li>
        <li aria-current="page" className="truncate text-fg">
          {name}
        </li>
      </ol>
    </nav>
  );
}

const card = "min-w-0 rounded-[8px] border border-[var(--shell-border)] bg-[var(--shell-panel)]";
const cardHead = "border-b border-[var(--shell-border)] px-4 py-3 text-sm font-medium text-fg";

function Facts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 gap-y-2 px-4 py-3 text-sm">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-fg-muted">{term}</dt>
          <dd className="min-w-0 break-words tabular-nums text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Overview: what it is doing, what it is, and how the last day went. */
function OverviewCards({ room, detail }: { room: AgentRoomDTO; detail: AgentDetailDTO | undefined }) {
  const ratio = costRatio(room.costTodayCents, room.costCapCents);
  const metrics = detail?.metrics;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section aria-labelledby="overview-now" className={cn(card, "self-start")}>
        <h2 id="overview-now" className={cardHead}>
          Current activity
        </h2>
        <div className="grid gap-3 px-4 py-3">
          <NowPanel room={room} />
        </div>
      </section>
      <div className="grid content-start gap-4">
        <section aria-labelledby="overview-details" className={card}>
          <h2 id="overview-details" className={cardHead}>
            Details
          </h2>
          <Facts
            rows={[
              ["Status", `${STATUS_LABEL[room.status]}${room.enabled ? "" : " (paused)"}`],
              ["Agent ID", room.id],
              ["Autonomy tier", room.tier],
              ["Stage", STAGE_LABEL[room.stage]],
              ["Queue", String(room.queueDepth)],
              ["Runs today", `${room.runsToday}${room.errorsToday ? ` (${room.errorsToday} failed)` : ""}`],
              [
                "Cost today",
                room.costCapCents == null
                  ? `${formatCents(room.costTodayCents)}, no cap`
                  : `${formatCents(room.costTodayCents)} of ${formatCents(room.costCapCents)} (${formatPercent(ratio)})`,
              ],
              ["Last seen", formatAgo(room.lastSeenAt)],
              ["Version", room.version ?? "—"],
            ]}
          />
        </section>
        <section aria-labelledby="overview-day" className={card}>
          <h2 id="overview-day" className={cardHead}>
            Last 24 hours
          </h2>
          {metrics ? (
            <Facts
              rows={[
                ["Success rate", formatPercent(metrics.successRate)],
                ["Latency", `${formatDuration(metrics.latencyP50Ms)} typical · ${formatDuration(metrics.latencyP95Ms)} slowest 5%`],
                ["Tokens today", `${metrics.inputTokensToday.toLocaleString()} in · ${metrics.outputTokensToday.toLocaleString()} out`],
                ["Dead letters", String(metrics.deadLetters)],
                [
                  "Human decisions",
                  `${formatPercent(approvalRate(metrics.approvals))} approved (${metrics.approvals.accepted} accepted, ${metrics.approvals.edited} edited, ${metrics.approvals.rejected} rejected)`,
                ],
              ]}
            />
          ) : (
            <div className="grid gap-2 px-4 py-3" aria-busy="true">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-4 rounded-[6px]" />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
