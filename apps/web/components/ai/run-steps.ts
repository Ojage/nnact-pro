// AI run pipeline — shared step model for the live progress tray and the /ai
// page. The run row's `state` is the source of truth: the backend persists each
// transition as it happens, so polling /api/ai/runs yields a live step stream.
import type { AiRunDTO, AiRunState } from "@nnact/shared";

export interface AiPipelineStep {
  state: AiRunState;
  label: string;
}

export const AI_PIPELINE_STEPS: AiPipelineStep[] = [
  { state: "SCHEDULED", label: "Queued for this slot" },
  { state: "PLANNING", label: "Planning the article" },
  { state: "GENERATING_TEXT", label: "Writing the draft" },
  { state: "REVIEWING_TEXT", label: "Reviewing quality" },
  { state: "SELECTING_MEDIA", label: "Choosing featured media" },
  { state: "GENERATING_IMAGE", label: "Generating image" },
  { state: "REVIEWING_IMAGE", label: "Reviewing image" },
  { state: "CREATING_CONTENT", label: "Saving to Content Studio" },
  { state: "PUBLISHING_WEBSITE", label: "Publishing to website" },
  { state: "PUBLISHING_LINKEDIN", label: "Publishing to LinkedIn" },
  { state: "PUBLISHING_FACEBOOK", label: "Publishing to Facebook" },
];

export const TERMINAL_STATES: AiRunState[] = ["PUBLISHED", "PARTIALLY_PUBLISHED", "NEEDS_ATTENTION", "FAILED", "CANCELLED"];

export const ACTIVE_RUN_STATES = new Set<AiRunState>(AI_PIPELINE_STEPS.map((s) => s.state));

/**
 * How long a run may sit in a pipeline state without advancing before the UI
 * stops calling it "live". The backend sweeps these to FAILED after 20 minutes;
 * this is deliberately shorter so the tray tells the truth sooner rather than
 * showing a dead run as a live generation.
 */
export const STRANDED_AFTER_MS = 10 * 60_000;

export function isActiveRun(run: AiRunDTO): boolean {
  return ACTIVE_RUN_STATES.has(run.state);
}

/** Active in state, but nothing has touched it long enough to be a lost worker. */
export function isStrandedRun(run: AiRunDTO, now = Date.now()): boolean {
  if (!isActiveRun(run)) return false;
  const last = run.updatedAt ?? run.startedAt ?? run.createdAt;
  if (!last) return true;
  const ts = Date.parse(last);
  if (!Number.isFinite(ts)) return true;
  return now - ts > STRANDED_AFTER_MS;
}

export function isTerminalRun(run: AiRunDTO): boolean {
  return TERMINAL_STATES.includes(run.state);
}

/** Runs an operator can act on: stuck mid-flight, or finished unsuccessfully. */
export function canCancelRun(run: AiRunDTO): boolean {
  return isActiveRun(run);
}

export function canRetryRun(run: AiRunDTO): boolean {
  return run.state === "FAILED" || run.state === "NEEDS_ATTENTION" || run.state === "CANCELLED";
}

export function pipelineStepIndex(state: AiRunState): number {
  return AI_PIPELINE_STEPS.findIndex((s) => s.state === state);
}

export function runSnapshot(run: AiRunDTO): { current: number; total: number; percent: number; step: AiPipelineStep | null } {
  const total = AI_PIPELINE_STEPS.length;
  const current = pipelineStepIndex(run.state);
  const active = current < 0 ? null : AI_PIPELINE_STEPS[current];
  return {
    current: current < 0 ? total : current,
    total,
    percent: Math.min(100, Math.round(((current < 0 ? total : current) / total) * 100)),
    step: active,
  };
}

export const SLOT_LABELS: Record<string, string> = {
  MORNING: "Morning",
  EVENING: "Evening",
};

export const PROVIDER_LABELS: Record<string, string> = {
  OPENAI: "OpenAI",
  CLAUDE: "Claude",
  GROK: "Grok",
};

export function terminalMessage(run: AiRunDTO): string {
  switch (run.state) {
    case "PUBLISHED":
      return run.websitePublished && run.linkedinPublished
        ? "Published to website and LinkedIn"
        : run.websitePublished
          ? "Published to website"
          : run.linkedinPublished
            ? "Published to LinkedIn"
            : "Complete";
    case "PARTIALLY_PUBLISHED":
      return run.linkedinPublished ? "Website publish degraded; LinkedIn completed" : "Published to website; LinkedIn didn't complete";
    case "NEEDS_ATTENTION":
      return "Needs attention — will retry on the next sweep";
    case "FAILED":
      return run.error ?? "Failed after retries";
    case "CANCELLED":
      return "Cancelled";
    default:
      return run.state;
  }
}

export function terminalTone(run: AiRunDTO): "ok" | "warn" | "err" {
  if (run.state === "PUBLISHED" || run.state === "PARTIALLY_PUBLISHED") return "ok";
  if (run.state === "NEEDS_ATTENTION" || run.state === "CANCELLED") return "warn";
  return "err";
}

export function formatElapsed(fromIso: string): string {
  const diffMs = Math.max(0, Date.now() - Date.parse(fromIso));
  const totalSeconds = Math.floor(diffMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}