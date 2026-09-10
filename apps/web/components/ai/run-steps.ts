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
];

export const TERMINAL_STATES: AiRunState[] = ["PUBLISHED", "PARTIALLY_PUBLISHED", "NEEDS_ATTENTION", "FAILED"];

export const ACTIVE_RUN_STATES = new Set<AiRunState>(AI_PIPELINE_STEPS.map((s) => s.state));

export function isActiveRun(run: AiRunDTO): boolean {
  return ACTIVE_RUN_STATES.has(run.state);
}

export function isTerminalRun(run: AiRunDTO): boolean {
  return TERMINAL_STATES.includes(run.state);
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
      return "Failed after retries";
    default:
      return run.state;
  }
}

export function terminalTone(run: AiRunDTO): "ok" | "warn" | "err" {
  if (run.state === "PUBLISHED" || run.state === "PARTIALLY_PUBLISHED") return "ok";
  if (run.state === "NEEDS_ATTENTION") return "warn";
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