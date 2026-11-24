import type { AgentOfficeStatus, AgentRunState, AgentStage } from "@nnact/shared";

/** AI spend is tracked in US cents. */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(cents / 100);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1_000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

export function formatPercent(ratio: number | null | undefined): string {
  return ratio == null ? "—" : `${Math.round(ratio * 100)}%`;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const seconds = Math.round((new Date(iso).getTime() - now) / 1_000);
  if (!Number.isFinite(seconds)) return "unknown";
  if (Math.abs(seconds) < 60) return relative.format(seconds, "second");
  if (Math.abs(seconds) < 3_600) return relative.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86_400) return relative.format(Math.round(seconds / 3_600), "hour");
  return relative.format(Math.round(seconds / 86_400), "day");
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const STATUS_LABEL: Record<AgentOfficeStatus, string> = {
  working: "Working",
  idle: "Idle",
  waiting: "Waiting for a person",
  paused: "Paused",
  error: "Error",
  offline: "Offline",
};

export const STAGE_LABEL: Record<AgentStage, string> = {
  live: "Live",
  building: "In progress",
  planned: "Coming soon",
};

export const RUN_STATE_LABEL: Record<AgentRunState, string> = {
  pending: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
};

const TASK_LABELS: Record<string, string> = {
  "agent.extract": "Drafting job from WhatsApp",
  "agent.stt": "Transcribing a voice note",
  "agent.followup": "Asking a follow-up question",
  "agent.quote": "Drafting a quote proposal",
  "agent.receipt_vision": "Reading a receipt",
  "agent.dispatch": "Ranking technicians",
  "agent.price_observation": "Checking price freshness",
  "agent.triage": "Estimating the likely fault",
  "agent.sourcing": "Building a shopping list",
  "agent.supplier_message": "Checking stock with a shop",
  "agent.copilot_suggestion": "Helping a technician",
  "agent.payment_reminder": "Sending a payment reminder",
};

export function taskLabel(task: string): string {
  return TASK_LABELS[task] ?? task.replace(/^agent\./, "").replace(/[_.-]+/g, " ");
}
