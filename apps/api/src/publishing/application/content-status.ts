// Content lifecycle state machine — valid transitions for content_items.status.
// Enforced so a draft can't be published, a rejected piece can't slip through,
// etc.
import type { ContentStatus } from "@nnact/shared";

const TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  DRAFT: ["IN_REVIEW", "ARCHIVED"],
  IN_REVIEW: ["APPROVED", "REJECTED", "DRAFT"],
  APPROVED: ["SCHEDULED", "PUBLISHING", "PUBLISHED", "IN_REVIEW", "DRAFT"],
  SCHEDULED: ["PUBLISHING", "PUBLISHED", "DRAFT", "ARCHIVED"],
  PUBLISHING: ["PUBLISHED", "FAILED_PUBLISH", "DRAFT"],
  PUBLISHED: ["ARCHIVED", "DRAFT"],
  ARCHIVED: ["DRAFT"],
  REJECTED: ["DRAFT", "IN_REVIEW"],
} as unknown as Record<ContentStatus, ContentStatus[]>;

// PUBLISHING_FAILED is a derived display state; we model the failure on channel
// publications. Map any unknown target to a safe fallback.
export type ContentTransitionTarget = ContentStatus | "FAILED_PUBLISH";

export function canTransitionContent(from: ContentStatus, to: ContentTransitionTarget): boolean {
  if (from === to) return true;
  if (to === "FAILED_PUBLISH") return from === "PUBLISHING";
  return (TRANSITIONS[from] ?? []).includes(to as ContentStatus);
}

export function assertContentTransition(from: ContentStatus, to: ContentTransitionTarget): void {
  if (!canTransitionContent(from, to)) {
    throw new Error(`Invalid content status transition: ${from} -> ${to}`);
  }
}
