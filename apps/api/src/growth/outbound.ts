// The single outbound send path.
//
// Everything that can put a message in front of a person goes through
// runCampaignSend, whether it is a dispatcher clicking Run, the worker tick, or
// a follow-up becoming due. Keeping one executor means the ordering of the
// checks cannot drift between entry points.
//
// Per recipient, in order:
//   1. Is the campaign still approved and its purpose still permitted on the
//      transport it would use? (assertCampaignSendable — re-checked every run,
//      not cached from schedule time.)
//   2. Has an identical send already been recorded? The idempotency key is
//      unique per org, so a duplicate is a no-op, not a second email.
//   3. Is the sender identity usable, is the recipient suppressed, and has the
//      thread reached a stop signal? (checkRecipientSendEligibility.)
//   4. Record the attempt in growth_outbound_messages BEFORE calling the
//      provider, so a crash mid-send leaves evidence rather than a silent gap.
//
// A refusal is recorded as SUPPRESSED / BLOCKED / SKIPPED with a reason and the
// run continues to the next recipient. A provider failure is recorded as
// FAILED and does not retry by itself; re-running is an explicit operator act.

import { and, count, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  growthCampaignRecipients,
  growthCampaigns,
  growthCampaignSteps,
  growthContactDetails,
  growthOutboundMessages,
  growthProspects,
  growthSenderIdentities,
  growthSuppressions,
} from "@nnact/db";
import { SendPolicyError } from "./send-policy.js";
import { TransportPolicyError, type TransportId } from "./transport-policy.js";
import {
  assertCampaignSendable,
  checkRecipientSendEligibility,
  outboundIdempotencyKey,
  type RecipientState,
} from "./campaign-policy.js";
import type { SenderIdentity, SuppressionEntry } from "./send-policy.js";
import { sendGrowthEmail } from "./delivery.js";
import { isOrgGrowthSendingPaused } from "./pause.js";
import { mirrorOutboundToConversation } from "./conversations.js";

const HOUR_MS = 3_600_000;

export interface RunCampaignInput {
  orgId: string;
  campaignId: string;
  /** Maximum recipients to process in this run. */
  limit?: number;
  /** Injected for testing the quiet-hours and delay rules. */
  now?: Date;
}

export interface SendOutcome {
  recipientId: string;
  stepNumber: number;
  status: "SENT" | "SUPPRESSED" | "BLOCKED" | "SKIPPED" | "FAILED" | "DUPLICATE" | "NOT_DUE";
  reason?: string;
}

/** True when `now` falls inside the campaign's local quiet hours. */
export function isWithinQuietHours(campaign: { quietHoursStart: number | null; quietHoursEnd: number | null; timezone: string }, now: Date): boolean {
  const start = campaign.quietHoursStart;
  const end = campaign.quietHoursEnd;
  if (start === null || end === null || start === end) return false;

  const localHour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: campaign.timezone,
    }).format(now),
  );
  // A window that wraps midnight (20 → 8) is "inside" for the late part.
  return start < end ? localHour >= start && localHour < end : localHour >= start || localHour < end;
}

/** True when a step's delay since the previous send has elapsed. */
export function isStepDue(delayDays: number, lastSentAt: Date | null, now: Date): boolean {
  if (lastSentAt === null) return true;
  return now.getTime() >= lastSentAt.getTime() + delayDays * 24 * HOUR_MS;
}

function toSenderIdentity(row: typeof growthSenderIdentities.$inferSelect): SenderIdentity {
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    role: row.roleTitle ?? "",
    verificationState: row.verificationState,
    isActive: row.isActive,
    coldApproved: row.coldApproved,
    approvedBy: row.coldApprovedBy,
    approvedAt: row.coldApprovedAt,
  };
}

function toRecipientState(row: typeof growthCampaignRecipients.$inferSelect): RecipientState {
  return {
    id: row.id,
    followUpsSent: row.followUpsSent,
    repliedAt: row.repliedAt,
    optedOutAt: row.optedOutAt,
    bouncedAt: row.bouncedAt,
    meetingBookedAt: row.meetingBookedAt,
    manuallyStoppedAt: row.manuallyStoppedAt,
    convertedAt: row.convertedAt,
  };
}

/** Every suppression in the org, loaded once per run. */
async function loadSuppressions(orgId: string): Promise<SuppressionEntry[]> {
  return db
    .select({
      scope: growthSuppressions.scope,
      value: growthSuppressions.normalizedValue,
      reason: growthSuppressions.reason,
      createdAt: growthSuppressions.createdAt,
    })
    .from(growthSuppressions)
    .where(eq(growthSuppressions.orgId, orgId));
}

export async function runCampaignSend(input: RunCampaignInput): Promise<{
  campaignId: string;
  processed: number;
  sent: number;
  suppressed: number;
  blocked: number;
  skipped: number;
  failed: number;
  duplicates: number;
  outcomes: SendOutcome[];
  refusal?: { code: string; message: string };
}> {
  const now = input.now ?? new Date();
  const orgId = input.orgId;
  const limit = Math.min(1000, Math.max(1, input.limit ?? 100));

  const [campaignRow] = await db
    .select()
    .from(growthCampaigns)
    .where(and(eq(growthCampaigns.id, input.campaignId), eq(growthCampaigns.orgId, orgId)))
    .limit(1);

  const summary = {
    campaignId: input.campaignId,
    processed: 0,
    sent: 0,
    suppressed: 0,
    blocked: 0,
    skipped: 0,
    failed: 0,
    duplicates: 0,
    outcomes: [] as SendOutcome[],
  };

  if (!campaignRow) {
    return { ...summary, refusal: { code: "not_found", message: "campaign not found" } };
  }

  if (await isOrgGrowthSendingPaused(orgId)) {
    return {
      ...summary,
      refusal: {
        code: "growth_paused",
        message: "Growth Autopilot is paused; queued campaign and follow-up sends are blocked.",
      },
    };
  }

  // A campaign-level refusal stops the whole run and is reported, not thrown.
  let transportId: TransportId;
  let requireColdApproval: boolean;
  try {
    const result = assertCampaignSendable(campaignRow);
    transportId = result.transport;
    requireColdApproval = result.requireColdApproval;
  } catch (error) {
    if (error instanceof SendPolicyError || error instanceof TransportPolicyError) {
      return { ...summary, refusal: { code: error.code, message: error.message } };
    }
    throw error;
  }

  // Respect the daily cap and quiet hours before touching any recipient.
  const [sentToday] = await db
    .select({ count: count() })
    .from(growthOutboundMessages)
    .where(
      and(
        eq(growthOutboundMessages.orgId, orgId),
        eq(growthOutboundMessages.campaignId, input.campaignId),
        eq(growthOutboundMessages.status, "SENT"),
        sql`${growthOutboundMessages.sentAt} >= date_trunc('day', now())`,
      ),
    );
  const sentTodayCount = sentToday?.count ?? 0;
  if (sentTodayCount >= campaignRow.dailyLimit) {
    return { ...summary, refusal: { code: "daily_limit_reached", message: `daily limit of ${campaignRow.dailyLimit} reached` } };
  }
  const remainingToday = campaignRow.dailyLimit - sentTodayCount;

  if (isWithinQuietHours(campaignRow, now)) {
    return { ...summary, refusal: { code: "quiet_hours", message: `inside quiet hours for ${campaignRow.timezone}` } };
  }
  if (campaignRow.scheduledStartAt && now.getTime() < new Date(campaignRow.scheduledStartAt).getTime()) {
    return { ...summary, refusal: { code: "not_started", message: "scheduled start time has not arrived" } };
  }

  // Candidates: still active recipients with work outstanding.
  const candidates = await db
    .select()
    .from(growthCampaignRecipients)
    .where(
      and(
        eq(growthCampaignRecipients.orgId, orgId),
        eq(growthCampaignRecipients.campaignId, input.campaignId),
        inArray(growthCampaignRecipients.status, ["PENDING", "QUEUED", "SENT"]),
      ),
    )
    .limit(limit);

  if (candidates.length === 0) return summary;

  const [senderRow] = await db
    .select()
    .from(growthSenderIdentities)
    .where(and(eq(growthSenderIdentities.id, campaignRow.senderIdentityId), eq(growthSenderIdentities.orgId, orgId)))
    .limit(1);
  const identity = senderRow ? toSenderIdentity(senderRow) : null;

  const suppressions = await loadSuppressions(orgId);
  const steps = await db
    .select()
    .from(growthCampaignSteps)
    .where(and(eq(growthCampaignSteps.campaignId, input.campaignId), eq(growthCampaignSteps.orgId, orgId)))
    .orderBy(growthCampaignSteps.stepNumber);
  const stepByNumber = new Map(steps.map((s) => [s.stepNumber, s]));

  let budget = Math.min(remainingToday, limit);

  // A recipient whose sequence is finished has no work left, so it is dropped
  // here rather than walked every run.
  const actionable = candidates.filter(
    (r) => r.currentStep + 1 <= steps.length && !r.manuallyStoppedAt && !r.convertedAt,
  );

  for (const recipientRow of actionable) {
    if (budget <= 0) break;
    const recipient = toRecipientState(recipientRow);

    const nextStepNumber = recipientRow.currentStep + 1;
    const step = stepByNumber.get(nextStepNumber);
    if (!step) {
      summary.skipped += 1;
      summary.outcomes.push({
        recipientId: recipientRow.id,
        stepNumber: nextStepNumber,
        status: "SKIPPED",
        reason: "sequence complete",
      });
      continue;
    }

    if (!isStepDue(step.delayDays, recipientRow.lastSentAt ? new Date(recipientRow.lastSentAt) : null, now)) {
      summary.outcomes.push({ recipientId: recipientRow.id, stepNumber: nextStepNumber, status: "NOT_DUE", reason: "step delay has not elapsed" });
      continue;
    }

    // The contact detail carries the address to write to; the domain that
    // suppression can match on lives on the prospect, not the contact.
    const [contactRow] = await db
      .select()
      .from(growthContactDetails)
      .where(and(eq(growthContactDetails.id, recipientRow.contactDetailId), eq(growthContactDetails.orgId, orgId)))
      .limit(1);
    if (!contactRow) {
      await db.update(growthCampaignRecipients).set({ status: "SKIPPED", updatedAt: now }).where(eq(growthCampaignRecipients.id, recipientRow.id));
      summary.skipped += 1;
      summary.outcomes.push({ recipientId: recipientRow.id, stepNumber: nextStepNumber, status: "SKIPPED", reason: "contact detail missing" });
      continue;
    }
    const [prospectRow] = await db
      .select({ websiteDomain: growthProspects.websiteDomain, companyName: growthProspects.companyName })
      .from(growthProspects)
      .where(and(eq(growthProspects.id, recipientRow.prospectId), eq(growthProspects.orgId, orgId)))
      .limit(1);

    // Eligibility: identity, suppression, stop signals.
    const eligibility = checkRecipientSendEligibility({
      identity,
      requireColdApproval,
      recipient,
      maxFollowUps: campaignRow.maxFollowUps,
      suppressions,
      target: {
        email: contactRow.kind === "EMAIL" ? contactRow.normalizedValue : undefined,
        phone: contactRow.kind === "PHONE" || contactRow.kind === "WHATSAPP" ? contactRow.normalizedValue : undefined,
        domain: prospectRow?.websiteDomain ?? undefined,
        company: prospectRow?.companyName ?? undefined,
      },
    });

    if (!eligibility.ok) {
      const outcomeStatus = eligibility.status;
      await db
        .update(growthCampaignRecipients)
        .set({ status: outcomeStatus, updatedAt: now })
        .where(eq(growthCampaignRecipients.id, recipientRow.id));
      await db.insert(growthOutboundMessages).values({
        orgId,
        campaignId: input.campaignId,
        stepId: step.id,
        recipientId: recipientRow.id,
        prospectId: recipientRow.prospectId,
        idempotencyKey: outboundIdempotencyKey(input.campaignId, recipientRow.id, nextStepNumber),
        purpose: campaignRow.purpose,
        transportId,
        senderIdentityId: campaignRow.senderIdentityId,
        toEmail: contactRow.value,
        subject: step.subject,
        status: outcomeStatus === "SUPPRESSED" ? "SUPPRESSED" : outcomeStatus === "BLOCKED" ? "BLOCKED" : "SUPPRESSED",
        blockedReason: eligibility.reason,
      });
      summary.processed += 1;
      if (outcomeStatus === "SUPPRESSED") summary.suppressed += 1;
      else if (outcomeStatus === "BLOCKED") summary.blocked += 1;
      else summary.skipped += 1;
      summary.outcomes.push({ recipientId: recipientRow.id, stepNumber: nextStepNumber, status: outcomeStatus, reason: eligibility.reason });
      continue;
    }

    // Record the attempt before sending, so a crash leaves evidence.
    const idempotencyKey = outboundIdempotencyKey(input.campaignId, recipientRow.id, nextStepNumber);
    const [existingAttempt] = await db
      .select({ id: growthOutboundMessages.id })
      .from(growthOutboundMessages)
      .where(and(eq(growthOutboundMessages.orgId, orgId), eq(growthOutboundMessages.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (existingAttempt) {
      summary.duplicates += 1;
      summary.outcomes.push({ recipientId: recipientRow.id, stepNumber: nextStepNumber, status: "DUPLICATE", reason: "already recorded" });
      continue;
    }

    let outboundId: string;
    try {
      const [inserted] = await db
        .insert(growthOutboundMessages)
        .values({
          orgId,
          campaignId: input.campaignId,
          stepId: step.id,
          recipientId: recipientRow.id,
          prospectId: recipientRow.prospectId,
          idempotencyKey,
          purpose: campaignRow.purpose,
          transportId,
          senderIdentityId: campaignRow.senderIdentityId,
          toEmail: contactRow.value,
          subject: step.subject,
          subjectSnapshot: step.subject,
          bodyTextSnapshot: step.bodyText,
          fromEmail: identity!.email,
          fromDisplayName: identity!.displayName,
          status: "QUEUED",
        })
        .returning({ id: growthOutboundMessages.id });
      outboundId = inserted!.id;
    } catch (error) {
      // The unique index is the real guard against a concurrent double-send.
      summary.duplicates += 1;
      summary.outcomes.push({ recipientId: recipientRow.id, stepNumber: nextStepNumber, status: "DUPLICATE", reason: "idempotency conflict" });
      continue;
    }

    try {
      const result = await sendGrowthEmail({
        orgId,
        toEmail: contactRow.value,
        subject: step.subject,
        bodyText: step.bodyText,
        bodyHtml: step.bodyHtml,
        transport: transportId,
        senderIdentity: identity,
        replyTo: senderRow?.replyToEmail ?? undefined,
      });

      if (result.ok) {
        await db
          .update(growthOutboundMessages)
          .set({ status: "SENT", providerMessageId: result.providerMessageId, sentAt: now })
          .where(eq(growthOutboundMessages.id, outboundId));
        await db
          .update(growthCampaignRecipients)
          .set({
            status: "SENT",
            currentStep: nextStepNumber,
            followUpsSent: nextStepNumber - 1,
            lastSentAt: now,
            updatedAt: now,
          })
          .where(eq(growthCampaignRecipients.id, recipientRow.id));
        summary.sent += 1;
        budget -= 1;
        summary.processed += 1;
        summary.outcomes.push({ recipientId: recipientRow.id, stepNumber: nextStepNumber, status: "SENT" });
        void mirrorOutboundToConversation({
          orgId,
          outboundMessageId: outboundId,
          campaignId: input.campaignId,
          recipientId: recipientRow.id,
          prospectId: recipientRow.prospectId,
          senderIdentityId: campaignRow.senderIdentityId,
          toEmail: contactRow.value,
          subject: step.subject,
          bodyText: step.bodyText,
          providerMessageId: result.providerMessageId,
        }).catch((err: unknown) => {
          console.error("[growth] mirror outbound to conversation failed", err);
        });
      } else {
        await db
          .update(growthOutboundMessages)
          .set({ status: "FAILED", error: result.error })
          .where(eq(growthOutboundMessages.id, outboundId));
        summary.failed += 1;
        summary.processed += 1;
        summary.outcomes.push({ recipientId: recipientRow.id, stepNumber: nextStepNumber, status: "FAILED", reason: result.error });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(growthOutboundMessages).set({ status: "FAILED", error: message }).where(eq(growthOutboundMessages.id, outboundId));
      summary.failed += 1;
      summary.processed += 1;
      summary.outcomes.push({ recipientId: recipientRow.id, stepNumber: nextStepNumber, status: "FAILED", reason: message });
    }
  }

  // Flip SCHEDULED → RUNNING once anything has actually gone out.
  if (summary.sent > 0 && campaignRow.status === "SCHEDULED") {
    await db.update(growthCampaigns).set({ status: "RUNNING", updatedAt: now }).where(eq(growthCampaigns.id, input.campaignId));
  }

  return summary;
}
