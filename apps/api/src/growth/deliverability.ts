// Process deliverability events (hard bounce, complaint) from the ESP into
// recipient signals and the suppression list.
//
// Why this exists: `growthCampaignRecipients.bouncedAt` and the HARD_BOUNCE /
// COMPLAINT suppression reasons were both in the schema from the start, and the
// send policy already refuses to send to a recipient whose `bouncedAt` is set
// (see campaign-policy.ts `hasHardBounced`). But nothing ever wrote them, so
// the guard was unreachable: a hard-bounced address kept receiving campaign
// follow-ups, which is precisely how a sending domain gets throttled or
// blacklisted. `complaints` was hardcoded to 0 in the Autopilot metrics, the
// allocation scoring and the sender health probe, so complaint pressure never
// influenced anything.
//
// A hard bounce is permanent — the address does not exist — so the address is
// suppressed. A complaint is a request not to be contacted at all, so the
// address is suppressed and the campaign recipient is stopped. Both are
// org-wide, not campaign-scoped: they must never be re-enrolled in another
// campaign.

import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  growthCampaignRecipients,
  growthContactDetails,
  growthInboundWebhookEvents,
  growthProspects,
  growthSuppressions,
} from "@nnact/db";
import { sha256Hex } from "./inbound-webhook.js";
import { normalizeEmail } from "./send-policy.js";

export type DeliverabilityEventKind = "HARD_BOUNCE" | "COMPLAINT";

export interface NormalizedDeliverabilityEvent {
  provider: string;
  externalId: string;
  kind: DeliverabilityEventKind;
  /** The address that bounced or complained. */
  email: string;
  /** Free-text reason from the ESP, e.g. "550 5.1.1 user unknown". */
  reason?: string;
  /** Campaign the send belonged to, when the ESP reports it. */
  campaignId?: string | null;
  /** Soft bounces are retried by the ESP and must NOT suppress. */
  isPermanent: boolean;
}

export type DeliverabilityProcessResult =
  | { status: "duplicate" }
  | { status: "processed"; suppressed: boolean; recipientsStopped: number }
  | { status: "ignored"; reason: string };

/**
 * Classify an ESP bounce reason. A soft bounce (mailbox full, greylisted,
 * 4xx) is temporary and must never suppress — suppressing on those would
 * silently amputate a large part of a healthy list.
 */
export function isPermanentBounce(reason: string | undefined): boolean {
  if (!reason) return true; // no classification available: treat as hard, the safe direction
  const r = reason.toLowerCase();
  // Note the deliberate absence of a trailing \b on "temporar": it is a prefix
  // ("temporary", "temporarily"), and \btemporar\b would not match either.
  const softMarkers = /\b(4\d\d|soft|greylist(?:ed)?|try again|temporar\w*|mailbox full|quota|rate.?limit|deferred|4xx)\b/;
  if (softMarkers.test(r)) return false;
  return true;
}

export async function processDeliverabilityEvent(
  orgId: string,
  event: NormalizedDeliverabilityEvent,
  payloadRaw: string,
): Promise<DeliverabilityProcessResult> {
  const payloadSha256 = sha256Hex(payloadRaw);

  try {
    await db.insert(growthInboundWebhookEvents).values({
      orgId,
      provider: event.provider,
      externalId: event.externalId,
      payloadSha256,
      status: "PROCESSED",
    });
  } catch {
    return { status: "duplicate" };
  }

  if (!event.isPermanent) {
    // Soft bounce: recorded for observability, but no suppression and no
    // recipient change. The next send may succeed.
    return { status: "ignored", reason: "soft_bounce" };
  }

  const normalized = normalizeEmail(event.email);
  if (!normalized) {
    return { status: "ignored", reason: "unparseable_address" };
  }

  // 1. Org-wide suppression. A complaint is the stronger signal but the scope
  //    is the same: never contact this address again.
  await db
    .insert(growthSuppressions)
    .values({
      orgId,
      scope: "EMAIL",
      value: event.email,
      normalizedValue: normalized,
      reason: event.kind === "COMPLAINT" ? "COMPLAINT" : "HARD_BOUNCE",
      note: event.reason ? `ESP ${event.kind}: ${event.reason}` : `ESP ${event.kind}`,
    })
    .onConflictDoNothing({
      target: [growthSuppressions.orgId, growthSuppressions.scope, growthSuppressions.normalizedValue],
    });

  // 2. Stop the recipient on every campaign, not just the one that bounced.
  //    Addressed by contact detail (the table that actually holds the email,
  //    joined to its prospect), guarded on bouncedAt being null so a
  //    re-delivered event stays idempotent.
  const prospects = await db
    .select({ id: growthProspects.id })
    .from(growthContactDetails)
    .innerJoin(growthProspects, eq(growthContactDetails.prospectId, growthProspects.id))
    .where(and(eq(growthContactDetails.orgId, orgId), eq(growthContactDetails.normalizedValue, normalized)));

  let recipientsStopped = 0;
  for (const prospect of prospects) {
    const updated = await db
      .update(growthCampaignRecipients)
      .set({
        status: event.kind === "COMPLAINT" ? "OPTED_OUT" : "BOUNCED",
        // Hard bounce: the address is gone. Complaint: the address is fine but
        // the recipient objected, so it is NOT a bounce — recording it as one
        // would misreport deliverability and skew bounce-based scoring.
        bouncedAt: event.kind === "HARD_BOUNCE" ? new Date() : undefined,
        complainedAt: event.kind === "COMPLAINT" ? new Date() : undefined,
        // A complaint must also read as an opt-out so the send policy's
        // unsubscribe path stops the sequence even if a future recipient is
        // enrolled without a suppression row.
        optedOutAt: event.kind === "COMPLAINT" ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(growthCampaignRecipients.orgId, orgId),
          eq(growthCampaignRecipients.prospectId, prospect.id),
          isNull(growthCampaignRecipients.bouncedAt),
        ),
      )
      .returning({ id: growthCampaignRecipients.id });
    recipientsStopped += updated.length;
  }

  return { status: "processed", suppressed: true, recipientsStopped };
}
