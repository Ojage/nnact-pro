"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, Filter, MoreVertical, Play, RefreshCw, ScrollText, X } from "lucide-react";
import { toast } from "sonner";
import { costRatio, describeCurrentTask, type AgentOfficeStatus, type AgentRoomDTO } from "@nnact/shared";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRestartAgentMutation, useStartAgentMutation } from "@/lib/agent-office/api";
import { STAGE_LABEL, formatAgo, formatCents, processActionMessage } from "@/lib/agent-office/format";
import { explainRtkError } from "@/lib/redux/api";
import { StatusLamp } from "../office-bits";

type SortKey = "status" | "name" | "queue" | "runs" | "cost" | "seen";

/** Worst first: what needs a person comes to the top. */
const STATUS_ORDER: Record<AgentOfficeStatus, number> = { error: 0, offline: 1, waiting: 2, working: 3, idle: 4, paused: 5 };

function statusRank(room: AgentRoomDTO): number {
  return room.stage === "live" ? STATUS_ORDER[room.status] : 10;
}

function compare(a: AgentRoomDTO, b: AgentRoomDTO, key: SortKey): number {
  switch (key) {
    case "status":
      return statusRank(a) - statusRank(b) || a.displayName.localeCompare(b.displayName);
    case "name":
      return a.displayName.localeCompare(b.displayName);
    case "queue":
      return a.queueDepth - b.queueDepth;
    case "runs":
      return a.runsToday - b.runsToday;
    case "cost":
      return a.costTodayCents - b.costTodayCents;
    case "seen":
      return new Date(a.lastSeenAt ?? 0).getTime() - new Date(b.lastSeenAt ?? 0).getTime();
  }
}

function matches(room: AgentRoomDTO, needle: string): boolean {
  if (!needle) return true;
  const haystack = [room.displayName, room.id, room.status, STAGE_LABEL[room.stage], room.tier, describeCurrentTask(room.current) ?? ""]
    .join(" ")
    .toLowerCase();
  return needle
    .toLowerCase()
    .split(/\s+/)
    .every((part) => haystack.includes(part));
}

const cellPad = "px-4 py-0";
const headerButton =
  "inline-flex items-center gap-1 rounded-sm text-xs font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]";

function SortHeader({
  label,
  column,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  column: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === column;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`${cellPad} h-10 whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button type="button" className={headerButton} onClick={() => onSort(column)}>
        {label}
        {active ? (
          sort.dir === "asc" ? <ArrowUp className="size-3.5" aria-hidden="true" /> : <ArrowDown className="size-3.5" aria-hidden="true" />
        ) : null}
      </button>
    </th>
  );
}

function CostCell({ room }: { room: AgentRoomDTO }) {
  const ratio = costRatio(room.costTodayCents, room.costCapCents);
  const level = ratio == null ? "ok" : ratio >= 1 ? "over" : ratio >= 0.8 ? "warn" : "ok";
  const fill = level === "over" ? "var(--color-danger-fg)" : level === "warn" ? "var(--color-attention-fg)" : "var(--shell-accent-bar)";
  return (
    <div className="min-w-[8.5rem]">
      <div className="flex items-baseline justify-between gap-2 text-sm tabular-nums">
        <span className="text-fg">{formatCents(room.costTodayCents)}</span>
        <span className="text-xs text-fg-muted">{room.costCapCents == null ? "no cap" : `of ${formatCents(room.costCapCents)}`}</span>
      </div>
      {room.costCapCents != null ? (
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--shell-hover)]" aria-hidden="true">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (ratio ?? 0) * 100)}%`, background: fill }} />
        </div>
      ) : null}
      {level !== "ok" ? <span className="text-[11px] font-medium text-fg">{level === "over" ? "▲ Cap reached" : `▲ ${Math.round((ratio ?? 0) * 100)}% of cap`}</span> : null}
    </div>
  );
}

function RowActions({ room }: { room: AgentRoomDTO }) {
  const router = useRouter();
  const [start] = useStartAgentMutation();
  const [restart] = useRestartAgentMutation();
  const live = room.stage === "live";
  const run = async (mode: "start" | "restart") => {
    try {
      const result = await (mode === "start" ? start : restart)(room.id).unwrap();
      toast.success(processActionMessage(room.displayName, mode, result));
    } catch (error) {
      toast.error(explainRtkError(error, `Could not ${mode} ${room.displayName}`));
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${room.displayName}`}
          className="grid size-8 place-items-center rounded-full text-fg-muted hover:bg-[var(--shell-hover)] hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--shell-focus)]"
        >
          <MoreVertical className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => router.push(`/agents/${room.id}`)}>
          <ExternalLink />
          View details
        </DropdownMenuItem>
        {live ? (
          <>
            <DropdownMenuItem onSelect={() => router.push(`/agents/${room.id}?tab=logs`)}>
              <ScrollText />
              View logs
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void run("start")}>
              <Play />
              Start worker
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void run("restart")}>
              <RefreshCw />
              Restart worker
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Console-style resource table: filter bar, sortable headers, one row per agent. */
export function AgentsTable({ rooms }: { rooms: readonly AgentRoomDTO[] }) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "status", dir: "asc" });
  const onSort = (key: SortKey) =>
    setSort((current) => (current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "status" ? "asc" : "desc" }));

  const visible = useMemo(() => {
    const list = rooms.filter((room) => matches(room, filter.trim()));
    list.sort((a, b) => (sort.dir === "asc" ? 1 : -1) * compare(a, b, sort.key));
    return list;
  }, [rooms, filter, sort]);

  return (
    <section aria-labelledby="agents-table-title" className="min-w-0 overflow-hidden rounded-[8px] border border-[var(--shell-border)]">
      <h2 id="agents-table-title" className="sr-only">
        Agents
      </h2>
      <div className="flex h-11 items-center gap-2 border-b border-[var(--shell-border)] px-4">
        <Filter className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
        <label htmlFor="agents-filter" className="shrink-0 text-sm font-medium text-fg">
          Filter
        </label>
        <input
          id="agents-filter"
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by name, status, stage or task"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
        />
        {filter ? (
          <button
            type="button"
            onClick={() => setFilter("")}
            aria-label="Clear filter"
            className="grid size-7 place-items-center rounded-full text-fg-muted hover:bg-[var(--shell-hover)]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        <span className="shrink-0 text-xs text-fg-muted" aria-live="polite">
          {visible.length} of {rooms.length}
        </span>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[60rem] border-collapse text-sm">
          <thead className="bg-[var(--shell-canvas)]">
            <tr className="border-b border-[var(--shell-border)]">
              <SortHeader label="Status" column="status" sort={sort} onSort={onSort} />
              <SortHeader label="Name" column="name" sort={sort} onSort={onSort} />
              <th scope="col" className={`${cellPad} text-left text-xs font-medium text-fg-muted`}>
                Doing now
              </th>
              <SortHeader label="Queue" column="queue" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Runs today" column="runs" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Cost today" column="cost" sort={sort} onSort={onSort} />
              <SortHeader label="Last seen" column="seen" sort={sort} onSort={onSort} />
              <th scope="col" className={`${cellPad} w-12`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((room) => {
              const live = room.stage === "live";
              const task = live ? describeCurrentTask(room.current) : null;
              return (
                <tr key={room.id} className="h-14 border-b border-[var(--shell-border)] last:border-b-0 hover:bg-[var(--shell-canvas)]">
                  <td className={`${cellPad} whitespace-nowrap`}>
                    {live ? <StatusLamp status={room.status} /> : <span className="text-sm text-fg-muted">○ {STAGE_LABEL[room.stage]}</span>}
                  </td>
                  <td className={`${cellPad} whitespace-nowrap`}>
                    <Link
                      href={`/agents/${room.id}`}
                      className="font-medium text-[var(--shell-accent-text)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]"
                    >
                      {room.displayName}
                    </Link>
                    <span className="ml-2 rounded-[4px] border border-[var(--shell-border)] px-1.5 py-px text-[11px] text-fg-muted">{room.tier}</span>
                    {!room.enabled ? <span className="ml-1.5 text-[11px] font-medium text-fg-muted">⏸ Paused</span> : null}
                  </td>
                  <td className={`${cellPad} max-w-[18rem]`}>
                    <span className={`block truncate ${task ? "text-fg" : "text-fg-muted"}`} title={task ?? undefined}>
                      {task ?? (live ? "Nothing in progress" : "—")}
                    </span>
                  </td>
                  <td className={`${cellPad} text-right tabular-nums`}>{live ? room.queueDepth : "—"}</td>
                  <td className={`${cellPad} text-right tabular-nums`}>
                    {live ? (
                      <>
                        {room.runsToday}
                        {room.errorsToday ? <span className="ml-1 text-xs text-[var(--color-danger-fg)]">({room.errorsToday} failed)</span> : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={cellPad}>{live ? <CostCell room={room} /> : <span className="text-fg-muted">—</span>}</td>
                  <td className={`${cellPad} whitespace-nowrap text-fg-muted`}>{live ? formatAgo(room.lastSeenAt) : "—"}</td>
                  <td className={`${cellPad} text-right`}>
                    <RowActions room={room} />
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-fg-muted">
                  No agents match “{filter}”.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
