"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, CheckCircle2, Loader2, Minimize2, X, Sparkles } from "lucide-react";
import type { AiRunDTO } from "@nnact/shared";
import { useAiRunsQuery } from "@/lib/redux/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RunProgress } from "./run-progress";
import {
  SLOT_LABELS,
  formatElapsed,
  isActiveRun,
  isTerminalRun,
  runSnapshot,
  terminalMessage,
  terminalTone,
} from "./run-steps";

const FINISH_RECENT_MS = 12_000;

// System-tray dock: a floating live monitor for the AI autopilot. It polls the
// runs feed and shows the current run step-by-step (ChatGPT-style), minimizes
// to a status pill, and slides away a few seconds after a run finishes.
export function AiRunTray() {
  const { data } = useAiRunsQuery({ take: 20 }, { pollingInterval: 3_000 });

  const [open, setOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const pinnedRunRef = useRef<string | null>(null);
  const [, setTick] = useState(0); // 1s elapsed re-render

  const run = useMemo<AiRunDTO | null>(() => {
    const items = data?.items ?? [];
    return items.find((r) => isActiveRun(r)) ?? items[0] ?? null;
  }, [data]);

  const active = run ? isActiveRun(run) : false;
  const justFinished = run
    ? isTerminalRun(run) && run.completedAt && Date.now() - Date.parse(run.completedAt) < FINISH_RECENT_MS
    : false;
  const visible = Boolean(run && (active || justFinished) && !dismissedIds.has(run.id));

  // Auto-expand the first time a new active run is seen.
  useEffect(() => {
    if (!run || !active) return;
    if (pinnedRunRef.current !== run.id) {
      pinnedRunRef.current = run.id;
      setOpen(true);
    }
  }, [run, active]);

  // 1s ticker for the elapsed timer while an active run is shown.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, [active]);

  const dismiss = useCallback((id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  }, []);

  if (!visible || !run) return null;

  const snapshot = runSnapshot(run);
  const minimizedLabel = active ? snapshot.step?.label ?? run.state : terminalMessage(run);

  return (
    <div className="fixed bottom-4 right-4 z-40 flex w-[min(92vw,360px)] flex-col items-end gap-2 md:bottom-6 md:right-6">
      <div
        className={cn(
          "w-full overflow-hidden rounded-xl border bg-surface shadow-xl transition-all",
          active ? "border-blue/40" : terminalTone(run) === "ok" ? "border-green/40" : terminalTone(run) === "warn" ? "border-amber/40" : "border-red/40",
        )}
      >
        {/* Header */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2.5 bg-surface px-3.5 py-2.5 text-left hover:bg-surface-300/40"
          aria-expanded={open}
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue/10 text-blue">
            <Sparkles className="h-4 w-4" />
            {active && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-blue" />}
            {active && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-blue" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              {active ? (
                <span className="inline-flex items-center gap-1 text-blue">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating now
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-green">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {SLOT_LABELS[run.slot] ?? run.slot} finished
                </span>
              )}
            </span>
            <span className="block truncate text-xs text-fg-muted">
              {SLOT_LABELS[run.slot] ?? run.slot} · {run.scheduledDate} · {minimizedLabel}
            </span>
          </span>
          {active && <span className="shrink-0 text-[11px] tabular-nums text-fg-muted">{run.startedAt ? formatElapsed(run.startedAt) : ""}</span>}
          {open ? <Minimize2 className="h-4 w-4 shrink-0 text-fg-dim" /> : <Activity className="h-4 w-4 shrink-0 text-fg-dim" />}
        </button>

        {/* Expanded body */}
        {open && (
          <div className="border-t border-border p-3.5">
            <RunProgress run={run} compact />
            <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
              <span className="text-[11px] text-fg-muted">
                {active ? "Auto-refreshing every 3s" : `Recent ${SLOT_LABELS[run.slot] ?? run.slot.toLowerCase()} run`}
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setOpen(false)}>
                  Minimize
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => dismiss(run.id)} aria-label="Dismiss run tracker">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}