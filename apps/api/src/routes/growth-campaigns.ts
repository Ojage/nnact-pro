// Growth & Outreach — Stage 2 routes: the campaign studio and the send action.
//
// Nothing here sends mail on its own. Delivery lives in growth/outbound.ts and
// is reachable only through POST /campaigns/:id/run, which both a dispatcher
// and the worker call. The approval and transport checks are re-evaluated at
// the moment of the send, not cached from schedule time, so revoking approval
// or removing the cold transport stops an in-flight campaign.
//
// Roles follow growth/access.ts: owner, dispatcher and secretary may read;
// owner and dispatcher may build campaigns; only an owner may approve outreach.

import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  db,
  growthCampaignAuditLog,
  growthCampaignRecipients,
  growthCampaigns,
  growthCampaignSteps,
  growthContactDetails,
  growthKnowledgeFacts,
  growthOutboundMessages,
  growthProspects,
  growthSectors,
  growthSenderIdentities,
  users,
} from "@nnact/db";
import {
  GROWTH_CAMPAIGN_PURPOSE,
  GROWTH_CAMPAIGN_STATUS,
  GROWTH_OUTBOUND_STATUS,
} from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import {
  canManageSenderIdentities,
  requireGrowthRead,
  requireGrowthWrite,
} from "../growth/access.js";
import { SendPolicyError } from "../growth/send-policy.js";
import { TransportPolicyError } from "../growth/transport-policy.js";
import { assertCampaignSendable, isTerminalStatus } from "../growth/campaign-policy.js";
import { runCampaignSend } from "../growth/outbound.js";
import { logCampaignTransition } from "../growth/campaign-audit.js";
import { filterQuotableFacts } from "../growth/knowledge.js";
import { isColdSendingEnabled } from "../growth/transport-policy.js";
import {
  enrollProspectsFromRules,
  parseProspectSelectionRules,
} from "../growth/campaign-enrollment.js";

const EDITABLE_CAMPAIGN_STATUSES = new Set([
  "DRAFT",
  "RESEARCHING",
  "READY_FOR_REVIEW",
  "IN_REVIEW",
]);

const REVIEW_STATUSES = new Set(["READY_FOR_REVIEW", "IN_REVIEW"]);

const uuid = z.string().uuid();
const trimmed = z.string().trim().min(1);

const createCampaignBody = z.object({
  name: trimmed.max(200),
  purpose: z.enum(GROWTH_CAMPAIGN_PURPOSE).optional(),
  senderIdentityId: uuid,
  timezone: z.string().trim().min(1).max(64).optional(),
  quietHoursStart: z.number().int().min(0).max(23).nullish(),
  quietHoursEnd: z.number().int().min(0).max(23).nullish(),
  dailyLimit: z.number().int().min(1).max(5000).optional(),
  maxFollowUps: z.number().int().min(0).max(10).optional(),
  notes: z.string().trim().max(4000).nullish(),
});

const prospectRulesBody = z.object({
  sectorSlug: z.string().trim().max(80).optional(),
  cities: z.array(z.string().trim().max(120)).max(20).optional(),
  minFitScore: z.number().int().min(0).max(100).optional(),
  equipmentKeywords: z.array(z.string().trim().max(80)).max(20).optional(),
  excludeRejected: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

const updateCampaignBody = createCampaignBody
  .omit({ purpose: true, senderIdentityId: true })
  .partial()
  .extend({
    scheduledStartAt: z.string().datetime().nullish(),
    sectorId: uuid.nullish(),
    language: z.enum(["EN", "FR"]).optional(),
    offerSummary: z.string().trim().max(4000).nullish(),
    businessGoal: z.string().trim().max(2000).nullish(),
    prospectSelectionRules: prospectRulesBody.optional(),
  });

const createStepBody = z.object({
  stepNumber: z.number().int().min(1).max(50),
  delayDays: z.number().int().min(0).max(365).optional(),
  subject: trimmed.max(500),
  bodyText: z.string().trim().min(1).max(100_000),
  bodyHtml: z.string().max(200_000).nullish(),
});

const addRecipientsBody = z.object({
  items: z
    .array(z.object({ prospectId: uuid, contactDetailId: uuid }))
    .min(1)
    .max(2000),
});

const runCampaignBody = z.object({
  limit: z.number().int().min(1).max(1000).optional(),
  now: z.string().datetime().optional(),
});

const scheduleBody = z.object({ scheduledStartAt: z.string().datetime().optional() });

/** Turns a policy refusal into a response without swallowing real bugs. */
function replyPolicyError(reply: { code: (n: number) => { send: (v: unknown) => unknown } }, error: unknown) {
  if (error instanceof SendPolicyError || error instanceof TransportPolicyError) {
    return reply.code(error.statusCode).send({ error: error.code, message: error.message });
  }
  throw error;
}

export async function growthCampaignRoutes(app: FastifyInstance) {
  app.addHook("onRequest", requireGrowthRead);

  // ── Campaigns ────────────────────────────────────────────────────────────
  app.get("/campaigns", async (req) => {
    const q = req.query as { status?: string; purpose?: string; limit?: string; offset?: string };
    const orgId = await resolveOrgId(req);
    const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50)));
    const offset = Math.max(0, Number(q.offset ?? 0));

    const conditions = [eq(growthCampaigns.orgId, orgId)];
    const status = z.enum(GROWTH_CAMPAIGN_STATUS).safeParse(q.status);
    if (status.success) conditions.push(eq(growthCampaigns.status, status.data));
    const purpose = z.enum(GROWTH_CAMPAIGN_PURPOSE).safeParse(q.purpose);
    if (purpose.success) conditions.push(eq(growthCampaigns.purpose, purpose.data));

    // Bare array, not `{ campaigns }`: the web types this endpoint as
    // GrowthCampaignDTO[] and every sibling list route (/prospects, /senders,
    // /suppressions) already returns a bare array. The envelope here made
    // `(campaigns ?? []).map` throw "map is not a function" on the list page.
    return db
      .select()
      .from(growthCampaigns)
      .where(and(...conditions))
      .orderBy(desc(growthCampaigns.createdAt))
      .limit(limit)
      .offset(offset);
  });

  app.get("/campaigns/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(404).send({ error: "campaign not found" });

    const [campaign] = await db
      .select()
      .from(growthCampaigns)
      .where(and(eq(growthCampaigns.id, id), eq(growthCampaigns.orgId, orgId)))
      .limit(1);
    if (!campaign) return reply.code(404).send({ error: "campaign not found" });

    const steps = await db
      .select()
      .from(growthCampaignSteps)
      .where(and(eq(growthCampaignSteps.campaignId, id), eq(growthCampaignSteps.orgId, orgId)))
      .orderBy(asc(growthCampaignSteps.stepNumber));

    const [totals] = await db
      .select({
        total: count(),
        pending: sql<number>`count(*) filter (where ${growthCampaignRecipients.status} = 'PENDING')`,
        sent: sql<number>`count(*) filter (where ${growthCampaignRecipients.status} = 'SENT')`,
        suppressed: sql<number>`count(*) filter (where ${growthCampaignRecipients.status} = 'SUPPRESSED')`,
        blocked: sql<number>`count(*) filter (where ${growthCampaignRecipients.status} = 'BLOCKED')`,
        replied: sql<number>`count(*) filter (where ${growthCampaignRecipients.status} = 'REPLIED')`,
      })
      .from(growthCampaignRecipients)
      .where(and(eq(growthCampaignRecipients.campaignId, id), eq(growthCampaignRecipients.orgId, orgId)));

    const [sender] = await db
      .select({
        id: growthSenderIdentities.id,
        displayName: growthSenderIdentities.displayName,
        email: growthSenderIdentities.email,
        verificationState: growthSenderIdentities.verificationState,
        coldApproved: growthSenderIdentities.coldApproved,
      })
      .from(growthSenderIdentities)
      .where(and(eq(growthSenderIdentities.id, campaign.senderIdentityId), eq(growthSenderIdentities.orgId, orgId)))
      .limit(1);

    const [sentToday] = await db
      .select({ count: count() })
      .from(growthOutboundMessages)
      .where(
        and(
          eq(growthOutboundMessages.orgId, orgId),
          eq(growthOutboundMessages.campaignId, id),
          eq(growthOutboundMessages.status, "SENT"),
          sql`${growthOutboundMessages.sentAt} >= date_trunc('day', now())`,
        ),
      );
    const sentTodayCount = sentToday?.count ?? 0;

    return {
      campaign,
      steps,
      sender: sender ?? null,
      recipients: totals ?? { total: 0, pending: 0, sent: 0, suppressed: 0, blocked: 0, replied: 0 },
      sentToday: sentTodayCount,
      dailyLimit: campaign.dailyLimit,
      dailyLimitReached: sentTodayCount >= campaign.dailyLimit,
    };
  });

  app.post("/campaigns", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const parsed = createCampaignBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;

    // A campaign may only be built on a real identity that belongs to this org.
    const [sender] = await db
      .select({ id: growthSenderIdentities.id })
      .from(growthSenderIdentities)
      .where(
        and(
          eq(growthSenderIdentities.id, body.senderIdentityId),
          eq(growthSenderIdentities.orgId, orgId),
        ),
      )
      .limit(1);
    if (!sender) {
      return reply.code(400).send({ error: "sender identity not found in this organisation" });
    }

    const [campaign] = await db
      .insert(growthCampaigns)
      .values({
        orgId,
        name: body.name,
        purpose: body.purpose ?? "COLD_OUTREACH",
        senderIdentityId: body.senderIdentityId,
        timezone: body.timezone ?? "Africa/Douala",
        quietHoursStart: body.quietHoursStart ?? 20,
        quietHoursEnd: body.quietHoursEnd ?? 8,
        dailyLimit: body.dailyLimit ?? 50,
        maxFollowUps: body.maxFollowUps ?? 2,
        notes: body.notes ?? null,
        createdBy: claims.userId,
      })
      .returning();
    return reply.code(201).send({ campaign });
  });

  // Purpose and sender are immutable once created: changing either after
  // approval would let an approved cold campaign become a Resend campaign.
  app.patch("/campaigns/:id", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = updateCampaignBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [existing] = await db
      .select()
      .from(growthCampaigns)
      .where(and(eq(growthCampaigns.id, id), eq(growthCampaigns.orgId, orgId)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: "campaign not found" });
    if (isTerminalStatus(existing.status)) {
      return reply.code(409).send({ error: `campaign is ${existing.status}` });
    }

    const { scheduledStartAt, prospectSelectionRules, ...rest } = parsed.data;
    const [campaign] = await db
      .update(growthCampaigns)
      .set({
        ...rest,
        ...(prospectSelectionRules !== undefined
          ? {
              prospectSelectionRules: {
                ...(typeof existing.prospectSelectionRules === "object" && existing.prospectSelectionRules
                  ? (existing.prospectSelectionRules as Record<string, unknown>)
                  : {}),
                ...prospectSelectionRules,
              },
            }
          : {}),
        ...(scheduledStartAt !== undefined
          ? { scheduledStartAt: scheduledStartAt ? new Date(scheduledStartAt) : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(growthCampaigns.id, id))
      .returning();
    return { campaign };
  });

  app.post("/campaigns/:id/start-research", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };

    const [existing] = await db
      .select()
      .from(growthCampaigns)
      .where(and(eq(growthCampaigns.id, id), eq(growthCampaigns.orgId, orgId)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: "campaign not found" });
    if (existing.status !== "DRAFT") {
      return reply.code(409).send({ error: "only a draft campaign can enter research" });
    }

    const [campaign] = await db
      .update(growthCampaigns)
      .set({ status: "RESEARCHING", updatedAt: new Date() })
      .where(eq(growthCampaigns.id, id))
      .returning();
    await logCampaignTransition({
      orgId,
      campaignId: id,
      action: "start_research",
      previousStatus: "DRAFT",
      newStatus: "RESEARCHING",
      changedBy: claims.userId,
    });
    return { campaign };
  });

  app.post("/campaigns/:id/enroll-from-rules", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };

    const [campaign] = await db
      .select()
      .from(growthCampaigns)
      .where(and(eq(growthCampaigns.id, id), eq(growthCampaigns.orgId, orgId)))
      .limit(1);
    if (!campaign) return reply.code(404).send({ error: "campaign not found" });
    if (!EDITABLE_CAMPAIGN_STATUSES.has(campaign.status)) {
      return reply.code(409).send({ error: "prospect enrollment is only allowed before the campaign is approved" });
    }

    const rules = parseProspectSelectionRules(campaign.prospectSelectionRules);
    if (campaign.sectorId && !rules.sectorSlug) {
      const [sector] = await db
        .select({ slug: growthSectors.slug })
        .from(growthSectors)
        .where(and(eq(growthSectors.orgId, orgId), eq(growthSectors.id, campaign.sectorId)))
        .limit(1);
      if (sector?.slug) rules.sectorSlug = sector.slug;
    }

    const result = await enrollProspectsFromRules(orgId, id, rules);
    return {
      ...result,
      rules,
      message:
        result.withEmail === 0
          ? "No prospects with email matched the rules. Adjust sector, city, or fit score, or import prospects first."
          : `Enrolled ${result.inserted} recipient(s); ${result.skipped} already on the campaign.`,
    };
  });

  // ── Steps ────────────────────────────────────────────────────────────────
  // Upsert on (campaign, stepNumber) so editing step 2 replaces it in place.
  app.post("/campaigns/:id/steps", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = createStepBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;

    const [campaign] = await db
      .select()
      .from(growthCampaigns)
      .where(and(eq(growthCampaigns.id, id), eq(growthCampaigns.orgId, orgId)))
      .limit(1);
    if (!campaign) return reply.code(404).send({ error: "campaign not found" });
    if (!EDITABLE_CAMPAIGN_STATUSES.has(campaign.status)) {
      return reply.code(409).send({
        error: "steps can only be edited while the campaign is a draft or in review",
      });
    }

    const [step] = await db
      .insert(growthCampaignSteps)
      .values({
        orgId,
        campaignId: id,
        stepNumber: body.stepNumber,
        delayDays: body.delayDays ?? 0,
        subject: body.subject,
        bodyText: body.bodyText,
        bodyHtml: body.bodyHtml ?? null,
        createdBy: claims.userId,
      })
      .onConflictDoUpdate({
        target: [growthCampaignSteps.campaignId, growthCampaignSteps.stepNumber],
        set: {
          subject: body.subject,
          bodyText: body.bodyText,
          bodyHtml: body.bodyHtml ?? null,
          delayDays: body.delayDays ?? 0,
        },
      })
      .returning();
    return reply.code(201).send({ step });
  });

  // ── Recipients ───────────────────────────────────────────────────────────
  app.post("/campaigns/:id/recipients", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = addRecipientsBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const items = parsed.data.items;

    const [campaign] = await db
      .select()
      .from(growthCampaigns)
      .where(and(eq(growthCampaigns.id, id), eq(growthCampaigns.orgId, orgId)))
      .limit(1);
    if (!campaign) return reply.code(404).send({ error: "campaign not found" });
    if (campaign.status === "RUNNING" || campaign.status === "COMPLETED" || campaign.status === "CANCELLED") {
      return reply.code(409).send({ error: "cannot add recipients once a campaign is under way" });
    }

    // Only enrol contact details that belong to the named prospects in this org,
    // so a crafted prospectId cannot pair someone else's contact with a row.
    const contactIds = items.map((i) => i.contactDetailId);
    const prospectIds = items.map((i) => i.prospectId);
    const valid = await db
      .select({
        id: growthContactDetails.id,
        prospectId: growthContactDetails.prospectId,
      })
      .from(growthContactDetails)
      .innerJoin(growthProspects, eq(growthProspects.id, growthContactDetails.prospectId))
      .where(
        and(
          eq(growthContactDetails.orgId, orgId),
          inArray(growthContactDetails.id, contactIds),
          inArray(growthContactDetails.prospectId, prospectIds),
        ),
      );

    // A contact detail is enrolled against the prospect it actually belongs to,
    // not the one the caller claimed.
    const ownerOf = new Map(valid.map((v) => [v.id, v.prospectId]));
    let inserted = 0;
    let skipped = 0;
    for (const item of items) {
      const actualProspectId = ownerOf.get(item.contactDetailId);
      if (!actualProspectId) {
        skipped += 1;
        continue;
      }
      const insertedRows = await db
        .insert(growthCampaignRecipients)
        .values({
          orgId,
          campaignId: id,
          prospectId: actualProspectId,
          contactDetailId: item.contactDetailId,
        })
        .onConflictDoNothing({
          target: [growthCampaignRecipients.campaignId, growthCampaignRecipients.contactDetailId],
        })
        .returning({ id: growthCampaignRecipients.id });
      if (insertedRows.length > 0) inserted += 1;
      else skipped += 1;
    }
    return { inserted, skipped };
  });

  app.get("/campaigns/:id/recipients", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const q = req.query as { limit?: string; offset?: string };
    const limit = Math.min(500, Math.max(1, Number(q.limit ?? 200)));
    const offset = Math.max(0, Number(q.offset ?? 0));

    // Bare array: the web types this as GrowthCampaignRecipientRowDTO[].
    return db
      .select({
        id: growthCampaignRecipients.id,
        status: growthCampaignRecipients.status,
        currentStep: growthCampaignRecipients.currentStep,
        followUpsSent: growthCampaignRecipients.followUpsSent,
        lastSentAt: growthCampaignRecipients.lastSentAt,
        repliedAt: growthCampaignRecipients.repliedAt,
        companyName: growthProspects.companyName,
        contactKind: growthContactDetails.kind,
        contactValue: growthContactDetails.value,
      })
      .from(growthCampaignRecipients)
      .innerJoin(growthProspects, eq(growthProspects.id, growthCampaignRecipients.prospectId))
      .innerJoin(growthContactDetails, eq(growthContactDetails.id, growthCampaignRecipients.contactDetailId))
      .where(and(eq(growthCampaignRecipients.campaignId, id), eq(growthCampaignRecipients.orgId, orgId)))
      .orderBy(asc(growthCampaignRecipients.createdAt))
      .limit(limit)
      .offset(offset);
  });

  // Stop one thread without touching the whole campaign.
  app.post("/recipients/:id/stop", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(404).send({ error: "recipient not found" });

    const [recipient] = await db
      .update(growthCampaignRecipients)
      .set({ manuallyStoppedAt: new Date(), status: "SKIPPED", updatedAt: new Date() })
      .where(and(eq(growthCampaignRecipients.id, id), eq(growthCampaignRecipients.orgId, orgId)))
      .returning();
    if (!recipient) return reply.code(404).send({ error: "recipient not found" });
    return { recipient };
  });

  // ── Approval ─────────────────────────────────────────────────────────────
  app.post("/campaigns/:id/submit-review", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };

    const [existing] = await db
      .select()
      .from(growthCampaigns)
      .where(and(eq(growthCampaigns.id, id), eq(growthCampaigns.orgId, orgId)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: "campaign not found" });
    if (existing.status !== "DRAFT" && existing.status !== "RESEARCHING") {
      return reply.code(409).send({ error: "only a draft or researching campaign can be submitted for review" });
    }

    const [campaign] = await db
      .update(growthCampaigns)
      .set({ status: "READY_FOR_REVIEW", updatedAt: new Date() })
      .where(eq(growthCampaigns.id, id))
      .returning();
    await logCampaignTransition({
      orgId,
      campaignId: id,
      action: "submit_review",
      previousStatus: existing.status,
      newStatus: "READY_FOR_REVIEW",
      changedBy: claims.userId,
    });
    return { campaign };
  });

  // Owner-only. A cold campaign additionally requires a verified inbox that has
  // been cold-approved, so approval cannot paper over an unusable sender.
  app.post("/campaigns/:id/approve", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    if (!canManageSenderIdentities(claims.role)) {
      return reply.code(403).send({ error: "approving outreach requires an owner" });
    }
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };

    const [campaign] = await db
      .select()
      .from(growthCampaigns)
      .where(and(eq(growthCampaigns.id, id), eq(growthCampaigns.orgId, orgId)))
      .limit(1);
    if (!campaign) return reply.code(404).send({ error: "campaign not found" });
    if (!REVIEW_STATUSES.has(campaign.status) && campaign.status !== "APPROVED") {
      return reply.code(409).send({ error: "a campaign must be ready for review before it can be approved" });
    }

    if (campaign.purpose === "COLD_OUTREACH") {
      const [sender] = await db
        .select()
        .from(growthSenderIdentities)
        .where(
          and(
            eq(growthSenderIdentities.id, campaign.senderIdentityId),
            eq(growthSenderIdentities.orgId, orgId),
          ),
        )
        .limit(1);
      if (!sender || sender.verificationState !== "VERIFIED" || !sender.isActive) {
        return reply.code(409).send({
          error: "cold outreach requires a verified, active sender identity",
        });
      }
      if (!sender.coldApproved || !sender.coldApprovedBy || !sender.coldApprovedAt) {
        return reply.code(409).send({
          error: "the sender identity has not been approved for cold outreach",
        });
      }
    }

    const [updated] = await db
      .update(growthCampaigns)
      .set({
        status: "APPROVED",
        approvedBy: claims.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(growthCampaigns.id, id))
      .returning();
    await logCampaignTransition({
      orgId,
      campaignId: id,
      action: "approve",
      previousStatus: campaign.status,
      newStatus: "APPROVED",
      changedBy: claims.userId,
    });
    return { campaign: updated };
  });

  // Scheduling runs the same policy the executor will run, so an operator
  // learns here that cold outreach is not configured.
  app.post("/campaigns/:id/schedule", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = scheduleBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [campaign] = await db
      .select()
      .from(growthCampaigns)
      .where(and(eq(growthCampaigns.id, id), eq(growthCampaigns.orgId, orgId)))
      .limit(1);
    if (!campaign) return reply.code(404).send({ error: "campaign not found" });
    if (campaign.status !== "APPROVED" && campaign.status !== "SCHEDULED" && campaign.status !== "PAUSED") {
      return reply.code(409).send({ error: "a campaign must be approved before it can be scheduled" });
    }

    const candidate = {
      ...campaign,
      status: "SCHEDULED" as const,
      scheduledStartAt: parsed.data.scheduledStartAt
        ? new Date(parsed.data.scheduledStartAt)
        : campaign.scheduledStartAt,
    };
    try {
      assertCampaignSendable(candidate);
    } catch (error) {
      return replyPolicyError(reply, error);
    }

    const [updated] = await db
      .update(growthCampaigns)
      .set({
        status: "SCHEDULED",
        scheduledStartAt: candidate.scheduledStartAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(growthCampaigns.id, id))
      .returning();
    await logCampaignTransition({
      orgId,
      campaignId: id,
      action: "schedule",
      previousStatus: campaign.status,
      newStatus: "SCHEDULED",
      changedBy: claims.userId,
    });
    return { campaign: updated };
  });

  app.get("/campaigns/:id/preview", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(404).send({ error: "campaign not found" });

    const [campaign] = await db
      .select()
      .from(growthCampaigns)
      .where(and(eq(growthCampaigns.id, id), eq(growthCampaigns.orgId, orgId)))
      .limit(1);
    if (!campaign) return reply.code(404).send({ error: "campaign not found" });

    const steps = await db
      .select()
      .from(growthCampaignSteps)
      .where(and(eq(growthCampaignSteps.campaignId, id), eq(growthCampaignSteps.orgId, orgId)))
      .orderBy(asc(growthCampaignSteps.stepNumber));

    const [sender] = await db
      .select()
      .from(growthSenderIdentities)
      .where(and(eq(growthSenderIdentities.id, campaign.senderIdentityId), eq(growthSenderIdentities.orgId, orgId)))
      .limit(1);

    const sampleRecipients = await db
      .select({
        recipientId: growthCampaignRecipients.id,
        companyName: growthProspects.companyName,
        city: growthProspects.city,
        fitSummary: growthProspects.fitSummary,
        fitEvidence: growthProspects.fitEvidence,
        contactValue: growthContactDetails.value,
        contactKind: growthContactDetails.kind,
      })
      .from(growthCampaignRecipients)
      .innerJoin(growthProspects, eq(growthProspects.id, growthCampaignRecipients.prospectId))
      .innerJoin(growthContactDetails, eq(growthContactDetails.id, growthCampaignRecipients.contactDetailId))
      .where(and(eq(growthCampaignRecipients.campaignId, id), eq(growthCampaignRecipients.orgId, orgId)))
      .orderBy(asc(growthCampaignRecipients.createdAt))
      .limit(5);

    const facts = await db
      .select()
      .from(growthKnowledgeFacts)
      .where(and(eq(growthKnowledgeFacts.orgId, orgId), eq(growthKnowledgeFacts.status, "APPROVED")));
    const quotableFacts = filterQuotableFacts(facts);

    const firstStep = steps[0];
    const samples = sampleRecipients.map((r) => ({
      recipientId: r.recipientId,
      companyName: r.companyName,
      city: r.city,
      to: r.contactKind === "EMAIL" ? r.contactValue : null,
      fitSummary: r.fitSummary,
      fitEvidence: r.fitEvidence,
      rendered:
        firstStep && r.contactKind === "EMAIL"
          ? {
              from: sender ? `${sender.displayName} <${sender.email}>` : null,
              replyTo: sender?.replyToEmail ?? sender?.email ?? null,
              subject: firstStep.subject,
              bodyText: firstStep.bodyText,
            }
          : null,
      warning: r.contactKind !== "EMAIL" ? "Recipient has no email contact on file" : null,
    }));

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        purpose: campaign.purpose,
        timezone: campaign.timezone,
        language: campaign.language,
      },
      sender: sender
        ? {
            displayName: sender.displayName,
            email: sender.email,
            roleTitle: sender.roleTitle,
            verificationState: sender.verificationState,
            coldApproved: sender.coldApproved,
            replyToEmail: sender.replyToEmail,
          }
        : null,
      coldTransportReady: isColdSendingEnabled(process.env),
      approvedFactCount: quotableFacts.length,
      steps: steps.map((s) => ({
        stepNumber: s.stepNumber,
        delayDays: s.delayDays,
        subject: s.subject,
        bodyText: s.bodyText,
      })),
      samples,
      auditAvailable: true,
    };
  });

  app.get("/campaigns/:id/audit", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const rows = await db
      .select({
        id: growthCampaignAuditLog.id,
        action: growthCampaignAuditLog.action,
        previousStatus: growthCampaignAuditLog.previousStatus,
        newStatus: growthCampaignAuditLog.newStatus,
        note: growthCampaignAuditLog.note,
        changedBy: growthCampaignAuditLog.changedBy,
        changedAt: growthCampaignAuditLog.changedAt,
        changedByName: users.name,
      })
      .from(growthCampaignAuditLog)
      .leftJoin(users, eq(users.id, growthCampaignAuditLog.changedBy))
      .where(and(eq(growthCampaignAuditLog.campaignId, id), eq(growthCampaignAuditLog.orgId, orgId)))
      .orderBy(desc(growthCampaignAuditLog.changedAt))
      .limit(100);
    return { entries: rows };
  });

  app.post("/campaigns/:id/pause", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };

    const [before] = await db
      .select({ status: growthCampaigns.status })
      .from(growthCampaigns)
      .where(and(eq(growthCampaigns.id, id), eq(growthCampaigns.orgId, orgId)))
      .limit(1);
    if (!before) return reply.code(404).send({ error: "campaign not found" });

    const [updated] = await db
      .update(growthCampaigns)
      .set({ status: "PAUSED", updatedAt: new Date() })
      .where(eq(growthCampaigns.id, id))
      .returning();
    await logCampaignTransition({
      orgId,
      campaignId: id,
      action: "pause",
      previousStatus: before.status,
      newStatus: "PAUSED",
      changedBy: claims.userId,
    });
    return { campaign: updated };
  });

  // ── Run ──────────────────────────────────────────────────────────────────
  // Shared by the manual button and the worker. The executor enforces the
  // daily cap, quiet hours, idempotency and every recipient-level gate, so this
  // handler stays a thin pass-through.
  app.post("/campaigns/:id/run", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(404).send({ error: "campaign not found" });
    const parsed = runCampaignBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const result = await runCampaignSend({
      orgId,
      campaignId: id,
      limit: parsed.data.limit,
      now: parsed.data.now ? new Date(parsed.data.now) : new Date(),
    });

    // A refusal means the campaign cannot run at all; report it as such.
    if (result.refusal) {
      return reply.code(result.refusal.code === "not_found" ? 404 : 409).send({
        error: result.refusal.code,
        message: result.refusal.message,
        ...result,
      });
    }
    return result;
  });

  // ── Outbound log ─────────────────────────────────────────────────────────
  app.get("/campaigns/:id/outbound", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const q = req.query as { limit?: string; offset?: string; status?: string };
    const limit = Math.min(500, Math.max(1, Number(q.limit ?? 200)));
    const offset = Math.max(0, Number(q.offset ?? 0));

    const conditions = [eq(growthOutboundMessages.orgId, orgId), eq(growthOutboundMessages.campaignId, id)];
    const status = z.enum(GROWTH_OUTBOUND_STATUS).safeParse(q.status);
    if (status.success) conditions.push(eq(growthOutboundMessages.status, status.data));

    // Bare array: the web types this as GrowthOutboundMessageDTO[].
    return db
      .select()
      .from(growthOutboundMessages)
      .where(and(...conditions))
      .orderBy(desc(growthOutboundMessages.createdAt))
      .limit(limit)
      .offset(offset);
  });
}
