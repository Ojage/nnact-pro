import type { JobStatus } from "@nnact/shared";

/** Human work-order number from a per-org sequence (mirrors invoice/estimate numbering). */
export function jobNumber(seq: number, prefix = "JOB", nextNumber = 1000): string {
  return `${prefix}-${String(nextNumber + seq).padStart(4, "0")}`;
}

export type JobRole = "owner" | "dispatcher" | "technician";

/**
 * Forward-only lifecycle for office roles. Blocks regressions and skipping
 * straight to `completed` from a `lead`; allows office reopen/reschedule paths.
 */
const OFFICE_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  lead: ["scheduled", "in_progress", "canceled"],
  scheduled: ["in_progress", "canceled", "lead"],
  in_progress: ["completed", "canceled"],
  completed: ["lead"],
  canceled: ["lead"],
};

/** Strictly the two field transitions a technician may perform. */
const TECHNICIAN_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  lead: [],
  scheduled: ["in_progress"],
  in_progress: ["completed"],
  completed: [],
  canceled: [],
};

/** Whether `current -> requested` is permitted for `role`. Same-status is a no-op and allowed. */
export function nextJobStatus(current: JobStatus, requested: JobStatus, role: JobRole): boolean {
  if (current === requested) return true;
  const table = role === "technician" ? TECHNICIAN_TRANSITIONS : OFFICE_TRANSITIONS;
  return (table[current]?.includes(requested) ?? false);
}

export function jobStatusLabel(status: string): string {
  return status.replaceAll("_", " ");
}