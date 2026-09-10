"use client";

import { Loader2, CheckCircle2, Circle, ExternalLink, Bot, FileText, ShieldAlert } from "lucide-react";
import type { AiRunDTO } from "@nnact/shared";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import {
  AI_PIPELINE_STEPS,
  SLOT_LABELS,
  PROVIDER_LABELS,
  pipelineStepIndex,
  runSnapshot,
  terminalMessage,
  terminalTone,
} from "./run-steps";

const STEP_ICON_DOT = (
  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
    <Circle className="h-3 w-3" />
  </span>
);

export function RunProgress({ run, compact = false }: { run: AiRunDTO; compact?: boolean }) {
  const active = !run.completedAt && pipelineStepIndex(run.state) >= 0;
  const { percent, step } = runSnapshot(run);
  const currentIndex = pipelineStepIndex(run.state);

  function activeDetail(): string | null {
    switch (run.state) {
      case "GENERATING_TEXT":
        return run.writerProvider ? `assistant: ${PROVIDER_LABELS[run.writerProvider] ?? run.writerProvider}` : "asking a language model";
      case "REVIEWING_TEXT":
        return typeof run.quality === "number" ? `quality ${run.quality}/100` : null;
      case "SELECTING_MEDIA":
      case "GENERATING_IMAGE":
      case "REVIEWING_IMAGE":
        return run.imageProvider ? `with ${PROVIDER_LABELS[run.imageProvider] ?? run.imageProvider}` : null;
      case "PUBLISHING_WEBSITE":
        return run.canonicalUrl ? run.canonicalUrl.replace(/^https?:\/\//, "") : "creating the blog post";
      default:
        return null;
    }
  }

  const detail = activeDetail();

  return (
    <div className={cn("w-full", compact ? "space-y-2" : "space-y-3")}>
      <div className="flex items-center gap-2">
        <Progress value={percent} className="h-1.5 flex-1" />
        <span className="text-[11px] tabular-nums text-fg-muted">{percent}%</span>
      </div>

      <ol className={cn("space-y-0.5", compact ? "" : "space-y-1")}>
        {AI_PIPELINE_STEPS.map((s, i) => {
          const done = currentIndex > i && currentIndex >= 0;
          const isCurrent = currentIndex === i;
          return (
            <li key={s.state} className={cn("flex items-center gap-2 text-sm", done ? "text-fg-dim" : isCurrent ? "text-fg" : "text-fg-dim/60")}>
              {done ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-green" />
                </span>
              ) : isCurrent ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-blue" />
                </span>
              ) : (
                STEP_ICON_DOT
              )}
              <span className={cn(isCurrent ? "font-medium" : "")}>
                {s.label}
                {isCurrent && detail && <span className="text-xs text-fg-muted"> — {detail}</span>}
              </span>
              {isCurrent && <span className="ml-auto animate-pulse text-[10px] uppercase tracking-wide text-blue">now</span>}
            </li>
          );
        })}
      </ol>

      {active && step && (
        <p className="flex items-center gap-1.5 text-xs text-fg-muted">
          <Bot className="h-3.5 w-3.5" />
          {SLOT_LABELS[run.slot] ?? run.slot} slot · {run.scheduledDate} · {step.label.toLowerCase()}…
        </p>
      )}

      {!active && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border p-2.5 text-sm",
            terminalTone(run) === "ok" && "border-green/30 bg-green/5 text-green",
            terminalTone(run) === "warn" && "border-amber/30 bg-amber/5 text-amber",
            terminalTone(run) === "err" && "border-red/30 bg-red/5 text-red",
          )}
        >
          {terminalTone(run) === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : terminalTone(run) === "warn" ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <FileText className="mt-0.5 h-4 w-4 shrink-0" />}
          <div className="min-w-0">
            <p className="font-medium">{terminalMessage(run)}</p>
            {run.canonicalUrl && (
              <a href={run.canonicalUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline">
                <ExternalLink className="h-3 w-3" />
                {run.canonicalUrl.replace(/^https?:\/\//, "")}
              </a>
            )}
            {run.error && <p className="mt-0.5 break-words text-xs opacity-90">{run.error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}