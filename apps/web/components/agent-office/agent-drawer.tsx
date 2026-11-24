"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Activity, Check, Circle, CircleDashed, Copy, Pause, Play, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import {
  AGENT_LOG_LEVELS,
  agentControlActionSchema,
  approvalRate,
  describeCurrentTask,
  type AgentDetailDTO,
  type AgentLogLevel,
  type AgentLogLineDTO,
  type AgentRoomDTO,
  type AgentRunState,
  type AgentRunStepDTO,
} from "@nnact/shared";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import {
  useAgentOfficeAgentQuery,
  useAgentOfficeLogsQuery,
  useAgentOfficeRunQuery,
  useAgentOfficeRunsInfiniteQuery,
  usePauseAgentMutation,
  useRestartAgentMutation,
  useResumeAgentMutation,
  useStartAgentMutation,
  useRetryAgentRunMutation,
  useRevealAgentRunMutation,
} from "@/lib/agent-office/api";
import {
  RUN_STATE_LABEL,
  STAGE_LABEL,
  formatAgo,
  formatCents,
  formatClock,
  formatDuration,
  formatPercent,
  taskLabel,
} from "@/lib/agent-office/format";
import { AGENT_OFFICE_POLL_MS, useAgentOfficeConnection } from "@/lib/agent-office/stream";
import { explainRtkError } from "@/lib/redux/api";
import { CostMeter, StatusLamp } from "./office-bits";
import styles from "./office.module.css";

const DETAIL_POLL_MS = 30_000;

const TABS = [
  { id: "now", label: "Now" },
  { id: "runs", label: "Runs" },
  { id: "logs", label: "Logs" },
  { id: "metrics", label: "Metrics" },
  { id: "config", label: "Config" },
  { id: "controls", label: "Controls" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const RUN_STATE_ICON: Record<AgentRunState, typeof Check> = {
  pending: Circle,
  running: Activity,
  completed: Check,
  failed: X,
  skipped: CircleDashed,
};

function RunStateLabel({ state }: { state: AgentRunState }) {
  const Icon = RUN_STATE_ICON[state];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold">
      <Icon size={12} aria-hidden="true" />
      {RUN_STATE_LABEL[state]}
    </span>
  );
}

function QueryProblem({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="grid justify-items-start gap-2 rounded-lg border border-border p-3 text-sm">
      <p>{explainRtkError(error, "This could not be loaded.")}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Drawer                                                              */
/* ------------------------------------------------------------------ */

/**
 * A native modal <dialog> sliding in from the inline end. The browser handles
 * focus containment, Esc, the inert page and returning focus to the room.
 */
export function AgentDrawer({
  room,
  onClose,
}: {
  room: AgentRoomDTO | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Keep showing the last agent while the dialog animates closed.
  const [shown, setShown] = useState<AgentRoomDTO | null>(room);

  useEffect(() => {
    if (room) setShown(room);
  }, [room]);

  const isOpen = room !== null;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.drawer}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as Record<string, string>)}
    >
      {shown ? (
        <>
          <header className={styles.drawerHead}>
            <div className="grid gap-1">
              <h1 id={titleId} className="text-lg font-semibold text-fg">
                {shown.displayName}
              </h1>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                {shown.stage === "live" ? <StatusLamp status={shown.status} /> : <span>Vacant · {STAGE_LABEL[shown.stage]}</span>}
                <span>Tier {shown.tier}</span>
                {shown.stage === "live" ? <span>Last seen {formatAgo(shown.lastSeenAt)}</span> : null}
              </p>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={() => dialogRef.current?.close()}>
              <X size={18} aria-hidden="true" />
            </Button>
          </header>
          {isOpen ? <DrawerContent key={shown.id} room={shown} /> : null}
        </>
      ) : null}
    </dialog>
  );
}

function DrawerContent({ room }: { room: AgentRoomDTO }) {
  const connection = useAgentOfficeConnection();
  const detail = useAgentOfficeAgentQuery(room.id, { pollingInterval: DETAIL_POLL_MS });
  const live = room.stage === "live";
  const tabs = live ? TABS : TABS.filter((tab) => tab.id === "config");
  const [selected, setSelected] = useState<TabId>(live ? "now" : "config");
  const idPrefix = useId();

  return (
    <div className={styles.drawerBody}>
      {live ? <AgentProcessCallout room={room} onOpenControls={() => setSelected("controls")} /> : null}
      {tabs.length > 1 ? (
        <DrawerTabs tabs={tabs} selected={selected} onSelect={setSelected} idPrefix={idPrefix} />
      ) : null}
      {tabs.map((tab) => {
        const active = tab.id === selected;
        return (
          <div
            key={tab.id}
            role={tabs.length > 1 ? "tabpanel" : undefined}
            id={`${idPrefix}-panel-${tab.id}`}
            aria-labelledby={tabs.length > 1 ? `${idPrefix}-tab-${tab.id}` : undefined}
            hidden={!active}
            tabIndex={active && tabs.length > 1 ? 0 : undefined}
          >
            {active ? (
              <div className={styles.panelBody}>
                {tab.id === "now" ? <NowPanel room={room} /> : null}
                {tab.id === "runs" ? <RunsPanel agentId={room.id} /> : null}
                {tab.id === "logs" ? <LogsPanel agentId={room.id} polling={connection === "polling"} /> : null}
                {tab.id === "metrics" ? <MetricsPanel detail={detail.data} error={detail.error} onRetry={detail.refetch} /> : null}
                {tab.id === "config" ? <ConfigPanel room={room} detail={detail.data} error={detail.error} onRetry={detail.refetch} /> : null}
                {tab.id === "controls" ? <ControlsPanel room={room} detail={detail.data} /> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Tabs use `focusgroup` where the browser supports it, with a roving-tabindex
 * fallback elsewhere. Selection is by activation (Enter, Space or click),
 * because most panels fetch their data on demand.
 */
function DrawerTabs({
  tabs,
  selected,
  onSelect,
  idPrefix,
}: {
  tabs: readonly { id: TabId; label: string }[];
  selected: TabId;
  onSelect: (id: TabId) => void;
  idPrefix: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [nativeFocusgroup, setNativeFocusgroup] = useState(false);

  useEffect(() => {
    setNativeFocusgroup(Object.hasOwn(HTMLElement.prototype, "focusGroup"));
  }, []);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest", ...({ container: "nearest" } as object) });
  }, [selected]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (nativeFocusgroup || event.altKey || event.ctrlKey || event.metaKey) return;
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    let next = -1;
    if (event.key === forward) next = (current + 1) % buttons.length;
    else if (event.key === back) next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    if (next < 0) return;
    event.preventDefault();
    buttons[next].focus();
  };

  return (
    <div
      ref={listRef}
      className={styles.tablist}
      role="tablist"
      aria-label="Agent details"
      onKeyDown={onKeyDown}
      {...({ focusgroup: "tablist nomemory" } as Record<string, string>)}
    >
      {tabs.map((tab) => {
        const isSelected = tab.id === selected;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            className={styles.tab}
            aria-selected={isSelected}
            tabIndex={nativeFocusgroup ? undefined : isSelected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            {...(isSelected ? { focusgroupstart: "" } : {})}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Now                                                                 */
/* ------------------------------------------------------------------ */

function StepTimeline({ steps }: { steps: readonly AgentRunStepDTO[] }) {
  if (steps.length === 0) return <p className="text-sm text-fg-muted">No steps recorded yet.</p>;
  return (
    <ol className={styles.timeline}>
      {steps.map((step) => (
        <li key={step.id} className={styles.timelineStep} data-status={step.status}>
          <RunStateLabel state={step.status} />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium text-fg">{step.label}</span>
            {step.summary ? <span className="text-xs text-fg-muted">{step.summary}</span> : null}
          </span>
          <span className="text-xs tabular-nums text-fg-muted">{formatClock(step.finishedAt ?? step.startedAt)}</span>
        </li>
      ))}
    </ol>
  );
}

function NowPanel({ room }: { room: AgentRoomDTO }) {
  const current = room.current;
  const progressId = useId();
  const run = useAgentOfficeRunQuery(current?.runId ?? "", { skip: !current });

  if (!current) {
    return (
      <p className="text-sm text-fg-muted">
        Nothing in progress. {room.queueDepth > 0 ? `${room.queueDepth} item(s) waiting in the queue.` : "The queue is empty."}
      </p>
    );
  }

  return (
    <>
      <div className="grid gap-2">
        <h2 className="text-sm font-semibold text-fg">{describeCurrentTask(current)}</h2>
        <p className="text-xs text-fg-muted">
          Started {formatAgo(current.startedAt)} · {taskLabel(current.task)}
        </p>
        {current.stepCount > 0 ? (
          <>
            <label htmlFor={progressId} className="text-xs text-fg-muted">
              Run progress
            </label>
            <progress id={progressId} className={styles.stepProgress} max={current.stepCount} value={current.stepIndex} />
          </>
        ) : null}
      </div>
      <section className="grid gap-2" aria-label="Steps">
        <h3 className="text-sm font-semibold text-fg">Steps</h3>
        {run.isLoading ? <p className="text-sm text-fg-muted">Loading steps…</p> : null}
        {run.error ? <QueryProblem error={run.error} onRetry={run.refetch} /> : null}
        {run.data ? <StepTimeline steps={run.data.steps} /> : null}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Runs                                                                */
/* ------------------------------------------------------------------ */

function RunsPanel({ agentId }: { agentId: string }) {
  const runs = useAgentOfficeRunsInfiniteQuery(agentId);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const rows = useMemo(() => runs.data?.pages.flatMap((page) => page.runs) ?? [], [runs.data]);

  if (runs.isLoading) return <p className="text-sm text-fg-muted">Loading runs…</p>;
  if (runs.error) return <QueryProblem error={runs.error} onRetry={runs.refetch} />;
  if (rows.length === 0) return <p className="text-sm text-fg-muted">This agent has no runs yet.</p>;

  return (
    <>
      <ul className="grid gap-2">
        {rows.map((run) => {
          const expanded = openRunId === run.id;
          return (
            <li key={run.id} className="rounded-lg border border-border">
              <button
                type="button"
                className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                aria-expanded={expanded}
                onClick={() => setOpenRunId(expanded ? null : run.id)}
              >
                <RunStateLabel state={run.state} />
                <span className="grid min-w-0">
                  <span className="truncate text-sm text-fg">{taskLabel(run.task)}</span>
                  <span className="text-xs text-fg-muted">
                    {formatAgo(run.startedAt)} · {formatDuration(run.latencyMs)} · {formatCents(run.costCents)}
                  </span>
                </span>
                <span className="text-xs text-fg-muted">{expanded ? "Hide" : "Details"}</span>
              </button>
              {expanded ? (
                <div className="border-t border-border p-3">
                  <RunDetail runId={run.id} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {runs.hasNextPage ? (
        <Button type="button" variant="outline" size="sm" disabled={runs.isFetchingNextPage} onClick={() => void runs.fetchNextPage()}>
          {runs.isFetchingNextPage ? "Loading…" : "Load older runs"}
        </Button>
      ) : null}
    </>
  );
}

function RunDetail({ runId }: { runId: string }) {
  const run = useAgentOfficeRunQuery(runId);
  const [retry, retryState] = useRetryAgentRunMutation();
  const [reveal, revealState] = useRevealAgentRunMutation();

  if (run.isLoading) return <p className="text-sm text-fg-muted">Loading run…</p>;
  if (run.error || !run.data) return <QueryProblem error={run.error} onRetry={run.refetch} />;
  const data = run.data;

  const onRetry = async () => {
    try {
      await retry(runId).unwrap();
      toast.success("Run queued again");
    } catch (error) {
      toast.error(explainRtkError(error, "Could not retry this run"));
    }
  };

  return (
    <div className="grid gap-3">
      {data.error ? (
        <p className="rounded-md border border-border p-2 text-xs">
          <span className="font-semibold">Error: </span>
          {data.error}
        </p>
      ) : null}
      <p className="text-xs text-fg-muted">
        Tokens {data.inputTokens ?? "—"} in / {data.outputTokens ?? "—"} out
        {data.outcome ? ` · Outcome: ${data.outcome}` : ""}
      </p>
      <StepTimeline steps={data.steps} />
      {data.logs.length > 0 ? <LogLines lines={data.logs} label="Run log" /> : null}
      <div className="flex flex-wrap gap-2">
        {data.state === "failed" && data.retryable ? (
          <Button type="button" size="sm" variant="secondary" disabled={retryState.isLoading} onClick={() => void onRetry()}>
            <RefreshCw size={14} aria-hidden="true" />
            Retry run
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" disabled={revealState.isLoading} onClick={() => void reveal(runId)}>
          Reveal raw content
        </Button>
      </div>
      <p className="text-xs text-fg-muted">Revealing shows names, phone numbers and messages. Each reveal is recorded in the audit log.</p>
      {revealState.error ? <p role="alert" className="text-sm">{explainRtkError(revealState.error, "Could not reveal this run")}</p> : null}
      {revealState.data ? (
        <pre className="max-h-80 overflow-auto rounded-md border border-border bg-[var(--background)] p-2 text-xs" tabIndex={0}>
          {JSON.stringify({ input: revealState.data.input, output: revealState.data.output }, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Logs                                                                */
/* ------------------------------------------------------------------ */

const LEVEL_RANK: Record<AgentLogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function LogLines({ lines, label, listRef }: { lines: readonly AgentLogLineDTO[]; label: string; listRef?: React.Ref<HTMLOListElement> }) {
  return (
    <ol ref={listRef} className={styles.logList} aria-label={label} tabIndex={0}>
      {lines.map((line) => (
        <li key={line.id} className={styles.logRow}>
          <span className="tabular-nums text-fg-muted">{formatClock(line.at)}</span>
          <span className={styles.logLevel} data-level={line.level}>
            {line.level}
          </span>
          <span className={styles.logMessage}>{line.message}</span>
        </li>
      ))}
    </ol>
  );
}

function CopyButton({ getText, label }: { getText: () => string; label: string }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef("");

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const report = (ok: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    let next = ok ? "Copied" : "Copy failed";
    // VoiceOver skips a message identical to the previous one.
    if (next === last.current) next += " ";
    last.current = next;
    setMessage("");
    requestAnimationFrame(() => setMessage(next));
    timer.current = setTimeout(() => setMessage(""), 2_000);
  };

  const onCopy = async () => {
    const text = getText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      report(true);
    } catch {
      report(false);
    }
  };

  return (
    <span className={styles.copy}>
      <Button type="button" variant="outline" size="sm" aria-label={label} onClick={() => void onCopy()}>
        {message.startsWith("Copied") ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        Copy
      </Button>
      <span className={styles.copyTip} role="status">
        {message}
      </span>
    </span>
  );
}

function AgentProcessCallout({ room, onOpenControls }: { room: AgentRoomDTO; onOpenControls: () => void }) {
  const [start, startState] = useStartAgentMutation();
  const [restart, restartState] = useRestartAgentMutation();
  const busy = startState.isLoading || restartState.isLoading;

  const onProcessAction = async (mode: "start" | "restart") => {
    try {
      const mutation = mode === "start" ? start : restart;
      const result = await mutation(room.id).unwrap();
      toast.success(
        result.started === false
          ? `${room.displayName} is already running`
          : `${room.displayName} ${mode === "start" ? "started" : "restarted"}`,
      );
    } catch (error) {
      toast.error(explainRtkError(error, `Could not ${mode} ${room.displayName}`));
    }
  };

  return (
    <section className="mb-4 grid gap-3 rounded-2xl border border-accent/40 bg-surface-200/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Activity size={16} aria-hidden="true" />
            Agent process
          </h2>
          <p className="max-w-prose text-xs text-fg-muted">
            {room.status === "offline"
              ? "No heartbeat has arrived yet. Start or restart the worker here; the status turns live when it connects."
              : "This worker is connected. Restart it here if it needs a fresh process."}
          </p>
        </div>
        <StatusLamp status={room.status} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void onProcessAction("start")} disabled={busy}>
          <Play size={14} aria-hidden="true" />
          Start
        </Button>
        <Button size="sm" variant="outline" onClick={() => void onProcessAction("restart")} disabled={busy}>
          <RefreshCw size={14} aria-hidden="true" />
          Restart
        </Button>
        <Button size="sm" variant="ghost" onClick={onOpenControls}>
          {room.enabled ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          {room.enabled ? "Pause in Controls" : "Resume in Controls"}
        </Button>
      </div>
      <p className="text-xs text-fg-muted">
        Start and Restart run the worker directly. No terminal command or environment change is needed.
      </p>
    </section>
  );
}

function LogsPanel({ agentId, polling }: { agentId: string; polling: boolean }) {
  const logs = useAgentOfficeLogsQuery(agentId, { pollingInterval: polling ? AGENT_OFFICE_POLL_MS : 0 });
  const [minLevel, setMinLevel] = useState<AgentLogLevel>("info");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<readonly AgentLogLineDTO[] | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const levelId = useId();
  const searchId = useId();

  const source = paused && frozen ? frozen : (logs.data ?? []);
  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      source.filter(
        (line) => LEVEL_RANK[line.level] >= LEVEL_RANK[minLevel] && (!needle || line.message.toLowerCase().includes(needle)),
      ),
    [source, minLevel, needle],
  );
  const pending = paused && frozen && logs.data ? Math.max(0, logs.data.length - frozen.length) : 0;

  useEffect(() => {
    if (paused) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [visible, paused]);

  const togglePause = () => {
    if (paused) {
      setPaused(false);
      setFrozen(null);
    } else {
      setFrozen(logs.data ?? []);
      setPaused(true);
    }
  };

  const getText = useCallback(
    () => visible.map((line) => `${line.at} ${line.level.toUpperCase()} ${line.message}`).join("\n"),
    [visible],
  );

  if (logs.isLoading) return <p className="text-sm text-fg-muted">Loading logs…</p>;
  if (logs.error) return <QueryProblem error={logs.error} onRetry={logs.refetch} />;

  return (
    <>
      <div className={styles.logToolbar}>
        <span className="grid gap-1">
          <label htmlFor={levelId} className="text-xs text-fg-muted">
            Level
          </label>
          <FormSelect
            id={levelId}
            native
            value={minLevel}
            onChange={(value) => setMinLevel(value as AgentLogLevel)}
            className="min-w-40"
            options={AGENT_LOG_LEVELS.map((level) => ({
              value: level,
              label: level === "debug" ? "Everything" : `${level[0].toUpperCase()}${level.slice(1)} and above`,
            }))}
          />
        </span>
        <span className="grid flex-1 gap-1">
          <label htmlFor={searchId} className="text-xs text-fg-muted">
            Search
          </label>
          <input
            id={searchId}
            type="search"
            className="h-8 min-w-0 rounded-md border border-border bg-[var(--input-background)] px-2 text-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </span>
        <Button type="button" variant="outline" size="sm" onClick={togglePause}>
          {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
          {paused ? "Resume scroll" : "Pause scroll"}
        </Button>
        <CopyButton getText={getText} label="Copy visible log lines" />
      </div>
      <p className="text-xs text-fg-muted" aria-live="off">
        {visible.length} of {source.length} lines
        {pending > 0 ? ` · ${pending} new while paused` : ""}
      </p>
      {visible.length === 0 ? (
        <p className="text-sm text-fg-muted">{source.length === 0 ? "No log lines yet." : "No lines match the filter."}</p>
      ) : (
        <LogLines lines={visible} label="Log lines" listRef={listRef} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

function RunsPerHourChart({ values }: { values: readonly number[] }) {
  const tableId = useId();
  if (values.length === 0) return <p className="text-sm text-fg-muted">No runs in the last day.</p>;
  const max = Math.max(1, ...values);
  const slot = 100 / values.length;
  const gap = Math.min(0.6, slot * 0.2);
  const hourLabel = (index: number) => `${values.length - index} h ago`;
  return (
    <figure className="grid gap-2">
      <figcaption className="text-sm font-semibold text-fg">Runs per hour, last {values.length} hours</figcaption>
      <svg className={styles.barChart} viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-describedby={tableId}>
        <title>Runs per hour</title>
        {values.map((value, index) => {
          const height = (value / max) * 38;
          return (
            <rect key={index} className={styles.bar} x={index * slot + gap / 2} y={40 - height} width={slot - gap} height={height} rx={0.6}>
              <title>{`${hourLabel(index)}: ${value} run${value === 1 ? "" : "s"}`}</title>
            </rect>
          );
        })}
        <line className={styles.barAxis} x1="0" x2="100" y1="40" y2="40" />
      </svg>
      <details>
        <summary className="cursor-pointer text-xs text-fg-muted">Show as a table</summary>
        <table id={tableId} className="mt-2 w-full text-xs">
          <thead>
            <tr>
              <th scope="col" className="text-left font-medium">Hour</th>
              <th scope="col" className="text-right font-medium">Runs</th>
            </tr>
          </thead>
          <tbody>
            {values.map((value, index) => (
              <tr key={index}>
                <td>{hourLabel(index)}</td>
                <td className="text-right tabular-nums">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function MetricsPanel({ detail, error, onRetry }: { detail: AgentDetailDTO | undefined; error: unknown; onRetry: () => void }) {
  if (error) return <QueryProblem error={error} onRetry={onRetry} />;
  if (!detail) return <p className="text-sm text-fg-muted">Loading metrics…</p>;
  const { metrics } = detail;
  const approvals = metrics.approvals;
  const items: [string, string][] = [
    ["Success rate", formatPercent(metrics.successRate)],
    ["Latency p50", formatDuration(metrics.latencyP50Ms)],
    ["Latency p95", formatDuration(metrics.latencyP95Ms)],
    ["Queue depth", String(metrics.queueDepth)],
    ["Dead letters", String(metrics.deadLetters)],
    ["Tokens today", `${metrics.inputTokensToday.toLocaleString()} in / ${metrics.outputTokensToday.toLocaleString()} out`],
    ["Approval rate", formatPercent(approvalRate(approvals))],
  ];
  return (
    <>
      <CostMeter spentCents={metrics.costTodayCents} capCents={metrics.costCapCents} />
      <dl className={styles.metricGrid}>
        {items.map(([label, value]) => (
          <div key={label} className={styles.metric}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-fg-muted">
        Human decisions: {approvals.accepted} accepted, {approvals.edited} edited, {approvals.rejected} rejected.
      </p>
      <RunsPerHourChart values={metrics.runsPerHour} />
      <section className="grid gap-2" aria-label="Errors by type">
        <h3 className="text-sm font-semibold text-fg">Errors by type, today</h3>
        {metrics.errorsByType.length === 0 ? (
          <p className="text-sm text-fg-muted">No errors today.</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {metrics.errorsByType.map((row) => (
              <li key={row.type} className="flex justify-between gap-3">
                <span className="break-all">{row.type}</span>
                <span className="tabular-nums">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

function ConfigPanel({
  room,
  detail,
  error,
  onRetry,
}: {
  room: AgentRoomDTO;
  detail: AgentDetailDTO | undefined;
  error: unknown;
  onRetry: () => void;
}) {
  if (error) return <QueryProblem error={error} onRetry={onRetry} />;
  if (!detail) return <p className="text-sm text-fg-muted">Loading configuration…</p>;
  const { config } = detail;
  const rows: [string, string][] = [
    ["Autonomy tier", room.tier],
    ["Stage", STAGE_LABEL[room.stage]],
    ["Feature flag", `${config.featureFlagKey} (${config.flagEnabled ? "on" : "off"})`],
    ["Daily cost cap", room.costCapCents == null ? "None" : formatCents(room.costCapCents)],
    ["Cap setting", config.costCapEnv],
    ["Max attempts", String(config.maxAttempts)],
    ["Prompt version", config.promptVersion ?? "—"],
    ["Agent version", config.version ?? "—"],
  ];
  return (
    <>
      <p className="text-xs text-fg-muted">Read only. Change caps and flags through deployment settings.</p>
      <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-fg-muted">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="grid gap-1" aria-label="Scopes">
        <h3 className="text-sm font-semibold text-fg">Scopes</h3>
        <ul className="flex flex-wrap gap-1.5">
          {config.scopes.map((scope) => (
            <li key={scope}>
              <code className="rounded border border-border px-1.5 py-0.5 text-xs">{scope}</code>
            </li>
          ))}
        </ul>
      </section>
      <section className="grid gap-1" aria-label="Never allowed">
        <h3 className="text-sm font-semibold text-fg">Never allowed to</h3>
        <ul className="list-disc pl-5 text-sm">
          {config.never.map((rule) => (
            <li key={rule}>{rule.replace(/-/g, " ")}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onResult,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onResult: (confirmed: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // React's autoFocus only fires on mount, so put focus on the safe action here.
      dialog.querySelector<HTMLButtonElement>('button[value="cancel"]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onClose = () => {
      const confirmed = dialog.returnValue === "confirm";
      dialog.returnValue = "";
      onResult(confirmed);
    };
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [onResult]);

  return (
    <dialog ref={ref} className={styles.confirm} aria-labelledby={titleId}>
      <h1 id={titleId} className="text-base font-semibold text-fg">
        {title}
      </h1>
      <p className="mt-2 text-sm text-fg-muted">{body}</p>
      <form method="dialog" className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="submit" value="confirm" variant="destructive" size="sm">
          {confirmLabel}
        </Button>
        <Button type="submit" value="cancel" variant="outline" size="sm">
          Cancel
        </Button>
      </form>
    </dialog>
  );
}

function ControlsPanel({ room, detail }: { room: AgentRoomDTO; detail: AgentDetailDTO | undefined }) {
  const [pause, pauseState] = usePauseAgentMutation();
  const [resume, resumeState] = useResumeAgentMutation();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const reasonId = useId();
  const hintId = useId();
  const problemId = useId();
  const action = room.enabled ? "pause" : "resume";
  const busy = pauseState.isLoading || resumeState.isLoading;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = agentControlActionSchema.safeParse({ reason });
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? "Give a reason");
      return;
    }
    setProblem(null);
    setConfirming(true);
  };

  const onResult = useCallback(
    async (confirmed: boolean) => {
      setConfirming(false);
      if (!confirmed) return;
      const args = { agentId: room.id, reason: reason.trim() };
      try {
        if (action === "pause") await pause(args).unwrap();
        else await resume(args).unwrap();
        toast.success(action === "pause" ? `${room.displayName} paused` : `${room.displayName} resumed`);
        setReason("");
      } catch (error) {
        toast.error(explainRtkError(error, `Could not ${action} ${room.displayName}`));
      }
    },
    [action, pause, reason, resume, room.displayName, room.id],
  );

  return (
    <>
      <section className="grid gap-3" aria-label="Kill switch">
        <h2 className="text-sm font-semibold text-fg">
          {room.enabled ? `${room.displayName} is enabled` : `${room.displayName} is paused`}
        </h2>
        <p className="text-sm text-fg-muted">
          {room.enabled
            ? room.status === "offline"
              ? "Enabled means it may take new work, but no worker is connected. Resume only changes this permission; use Start in the Agent process section to launch the worker."
              : "Pausing stops it taking new work. A run already in progress finishes its current step."
            : "Paused means it will not take new work. Resuming clears the pause once a worker is connected."}
        </p>
        <form className="grid gap-2" onSubmit={onSubmit} noValidate>
          <label htmlFor={reasonId} className="text-sm font-medium text-fg">
            Reason
          </label>
          <p id={hintId} className="text-xs text-fg-muted">
            Recorded in the audit trail with your name.
          </p>
          <textarea
            id={reasonId}
            className="min-h-20 rounded-md border border-border bg-[var(--input-background)] p-2 text-sm"
            required
            minLength={5}
            maxLength={500}
            value={reason}
            aria-describedby={problem ? `${hintId} ${problemId}` : hintId}
            aria-invalid={problem ? true : undefined}
            onChange={(event) => setReason(event.target.value)}
          />
          {problem ? (
            <p id={problemId} role="alert" className="text-sm text-[var(--color-danger-fg)]">
              {problem}
            </p>
          ) : null}
          <div>
            <Button type="submit" variant={room.enabled ? "destructive" : "default"} size="sm" disabled={busy}>
              {room.enabled ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
              {room.enabled ? "Pause agent" : "Resume agent"}
            </Button>
          </div>
        </form>
      </section>
      <section className="grid gap-2" aria-label="Control history">
        <h3 className="text-sm font-semibold text-fg">History</h3>
        {!detail ? (
          <p className="text-sm text-fg-muted">Loading history…</p>
        ) : detail.controlHistory.length === 0 ? (
          <p className="text-sm text-fg-muted">No pauses or resumes recorded.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {detail.controlHistory.map((event) => (
              <li key={event.id} className="rounded-md border border-border p-2">
                <p className="font-medium text-fg">
                  {event.action === "pause" ? "Paused" : "Resumed"} by {event.actorName ?? "unknown"} · {formatAgo(event.at)}
                </p>
                <p className="text-fg-muted">{event.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ConfirmDialog
        open={confirming}
        title={action === "pause" ? `Pause ${room.displayName}?` : `Resume ${room.displayName}?`}
        body={`Reason: ${reason.trim()}`}
        confirmLabel={action === "pause" ? "Pause agent" : "Resume agent"}
        onResult={(confirmed) => void onResult(confirmed)}
      />
    </>
  );
}
