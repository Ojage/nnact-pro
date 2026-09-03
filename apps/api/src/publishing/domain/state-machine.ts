// Channel publication state machine — explicit, enforced transitions.
// Application code must go through this to change a publication's status so we
// can never silently jump between arbitrary states.
import type { ChannelPublicationStatus } from "@nnact/shared";

type ValidTransition = { from: ChannelPublicationStatus[]; to: ChannelPublicationStatus };

export const PUBLICATION_TRANSITIONS: ValidTransition[] = [
  { from: ["DRAFT", "READY", "FAILED", "SCHEDULED"], to: "SCHEDULED" },
  { from: ["DRAFT", "READY", "FAILED", "SCHEDULED", "QUEUED"], to: "QUEUED" },
  { from: ["QUEUED", "READY"], to: "PUBLISHING" },
  { from: ["PUBLISHING"], to: "PUBLISHED" },
  { from: ["QUEUED", "PUBLISHING", "SCHEDULED", "READY", "FAILED"], to: "FAILED" },
  { from: ["DRAFT", "READY", "SCHEDULED", "QUEUED", "FAILED"], to: "CANCELLED" },
  { from: ["DRAFT"], to: "READY" },
];

const ALLOWED: Record<ChannelPublicationStatus, Set<ChannelPublicationStatus>> =
  PUBLICATION_TRANSITIONS.reduce((acc, { from, to }) => {
    for (const f of from) {
      (acc[f] ??= new Set()).add(to);
    }
    return acc;
  }, {} as Record<ChannelPublicationStatus, Set<ChannelPublicationStatus>>);

export function canTransition(
  from: ChannelPublicationStatus,
  to: ChannelPublicationStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.has(to) ?? false;
}

export function assertTransition(
  from: ChannelPublicationStatus,
  to: ChannelPublicationStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid publication state transition: ${from} -> ${to}`);
  }
}
