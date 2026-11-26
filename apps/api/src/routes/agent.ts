import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@nnact/db";
import {
  agentMedia,
  agentRuns,
  conversations,
  customers,
  jobStatusHistory,
  jobs,
  messages,
  users,
} from "@nnact/db";
import {
  AGENT_ID,
  AGENT_SCOPES,
  isAgentClaims,
  jobDraftSchema,
  normalizePhone,
  requireAgentScope,
  type AgentLanguage,
} from "@nnact/shared";
import { allocateJobNumberInOrg, createJobInOrg } from "../job-creation.js";
import { jobStatusLabel } from "../job-lifecycle.js";
import { verifiedClaims } from "../operational-authorization.js";
import { safeEmitActivity } from "../activities.js";
import { safeEmitEvent } from "../plugins/bus.js";
import { safeNotifyUser } from "../notify-user.js";
import { readAgentMedia } from "../agent/media-storage.js";
import { savePhoto } from "../uploads.js";

const orgId = z.string().uuid();

const intakeBody = z.object({
  orgId,
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  runId: z.string().uuid().optional(),
  customerId: z.string().uuid().nullable().optional(),
  customerCandidateIds: z.array(z.string().uuid()).max(10).default([]),
  draft: jobDraftSchema,
  needsTemplate: z.boolean().default(false),
  mediaObjectKeys: z.array(z.string()).max(10).default([]),
});

const approveBody = z.object({
  status: z.enum(["lead", "scheduled"]).default("lead"),
  assignedTo: z.string().uuid().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  serviceAddress: z.string().trim().max(500).nullable().optional(),
  preferredDate: z.string().trim().max(40).nullable().optional(),
  preferredTime: z.string().trim().max(40).nullable().optional(),
});

const EDITABLE_DRAFT_FIELDS = ["title", "description", "serviceAddress", "preferredDate", "preferredTime"] as const;

/** Whether the dispatcher changed any of the agent's drafted fields when approving. */
export function draftWasEdited(
  before: Partial<Record<(typeof EDITABLE_DRAFT_FIELDS)[number], string | null>>,
  body: Partial<Record<(typeof EDITABLE_DRAFT_FIELDS)[number], string | null | undefined>>,
): boolean {
  return EDITABLE_DRAFT_FIELDS.some((field) => body[field] !== undefined && (body[field] ?? null) !== (before[field] ?? null));
}

const rejectBody = z.object({
  reason: z.string().trim().min(1).max(500),
});

async function agentSession(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
    if (isAgentClaims(req.user)) return req.user;
  } catch {
    // handled below
  }
  await reply.code(401).send({ error: "agent session required" });
  return null;
}

async function officeSession(req: FastifyRequest, reply: FastifyReply) {
  const claims = await verifiedClaims(req, reply);
  if (!claims || reply.sent) return null;
  if (claims.role !== "owner" && claims.role !== "dispatcher") {
    await reply.code(403).send({ error: "only owners and dispatchers may review intake drafts" });
    return null;
  }
  return claims;
}

async function notifyDraftReview(orgIdValue: string, jobId: string | null, title: string, body: string) {
  const recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, orgIdValue), eq(users.active, true), inArray(users.role, ["owner", "dispatcher"])));
  for (const recipient of recipients) {
    void safeNotifyUser(orgIdValue, recipient.id, {
      type: "agent.draft_ready",
      title,
      body,
      link: jobId ? `/agent/drafts?job=${jobId}` : "/agent/drafts",
      jobId: jobId ?? undefined,
    });
  }
}

function draftDescription(draft: z.infer<typeof jobDraftSchema>): string {
  const lines = [
    draft.customerName ? `Customer: ${draft.customerName}` : null,
    draft.phone ? `Phone: ${draft.phone}` : null,
    draft.town || draft.neighborhood ? `Location: ${[draft.neighborhood, draft.town].filter(Boolean).join(", ")}` : null,
    draft.landmarkDirections ? `Landmark: ${draft.landmarkDirections}` : null,
    draft.applianceType ? `Appliance: ${draft.applianceType}` : null,
    draft.brand ? `Brand: ${draft.brand}` : null,
    draft.symptom ? `Reported symptom: ${draft.symptom}` : null,
    draft.urgency ? `Urgency: ${draft.urgency}` : null,
    draft.preferredTime ? `Preferred time: ${draft.preferredTime}` : null,
    `Language: ${draft.language}`,
    draft.safetyFlags.length ? `Safety words: ${draft.safetyFlags.join(", ")}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

/** Agent-to-API boundary. The worker never writes jobs or customer records directly. */
export async function agentRoutes(app: FastifyInstance) {
  app.post("/agent/intake/draft-jobs", async (req, reply) => {
    const claims = await agentSession(req, reply);
    if (!claims || reply.sent) return;
    if (!requireAgentScope(claims, AGENT_ID.intake, AGENT_SCOPES.draftJobsCreate)) {
      return reply.code(403).send({ error: "intake agent needs draft-jobs:create" });
    }
    const parsed = intakeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    if (body.orgId !== claims.orgId) return reply.code(403).send({ error: "agent token is for another organization" });

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, body.conversationId), eq(conversations.orgId, body.orgId)))
      .limit(1);
    if (!conversation) return reply.code(404).send({ error: "conversation not found" });

    if (!body.customerId && body.customerCandidateIds.length > 1) {
      await db
        .update(conversations)
        .set({
          state: "needs_choice",
          metadata: { ...conversation.metadata, customerCandidates: body.customerCandidateIds },
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversation.id));
      void notifyDraftReview(body.orgId, null, "WhatsApp intake needs a customer choice", `${body.customerCandidateIds.length} customer records match this phone number.`);
      return { status: "needs_choice", candidates: body.customerCandidateIds };
    }

    const result = await db.transaction(async (tx) => {
      let customerId = body.customerId ?? body.customerCandidateIds[0] ?? conversation.customerId ?? null;
      if (!customerId) {
        const normalized = normalizePhone(body.draft.phone ?? conversation.participantPhone);
        const [created] = await tx
          .insert(customers)
          .values({
            orgId: body.orgId,
            name: body.draft.customerName?.trim() || `WhatsApp ${normalized || "customer"}`,
            phone: normalized || null,
            phoneE164: normalized || null,
            notes: "Created from WhatsApp intake; verify identity before dispatch.",
          })
          .returning();
        customerId = created.id;
      }

      const appliance = body.draft.applianceType?.trim() || "Appliance";
      const symptom = body.draft.symptom?.trim() || "Customer reported a fault";
      const job = await createJobInOrg(tx, {
        orgId: body.orgId,
        actorUserId: claims.agentId ?? claims.agent_id ?? AGENT_ID.intake,
        reason: "created from WhatsApp intake agent",
        number: null,
        values: {
          customerId,
          title: `${appliance}: ${symptom}`.slice(0, 200),
          description: draftDescription(body.draft),
          status: "draft",
          source: "agent",
          serviceAddress: [body.draft.landmarkDirections, body.draft.neighborhood, body.draft.town].filter(Boolean).join(", ").slice(0, 500) || null,
          preferredTime: body.draft.preferredTime,
          agentDraft: true,
          agentConversationId: conversation.id,
        },
      });

      await tx
        .update(conversations)
        .set({
          customerId,
          language: body.draft.language as AgentLanguage,
          state: body.needsTemplate ? "needs_template" : body.draft.missingFields.length ? "awaiting_customer" : "open",
          needsTemplate: body.needsTemplate,
          followUpCount: body.draft.missingFields.length ? conversation.followUpCount + 1 : conversation.followUpCount,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversation.id));

      if (body.runId) {
        await tx
          .update(agentRuns)
          .set({ jobId: job.id, state: "completed", output: { draft: body.draft }, completedAt: new Date() })
          .where(and(eq(agentRuns.id, body.runId), eq(agentRuns.orgId, body.orgId)));
      }
      return job;
    });

    safeEmitActivity(body.orgId, "agent.draft_created", `Draft job created from WhatsApp: ${result.title}`, {
      customerId: result.customerId,
      jobId: result.id,
    });
    void safeEmitEvent(body.orgId, "agent.draft_created", {
      id: result.id,
      customerId: result.customerId,
      status: result.status,
    });
    void notifyDraftReview(body.orgId, result.id, "New WhatsApp job draft", result.title);
    return reply.code(201).send({ status: "created", job: result });
  });
}

/** Office review queue. Drafts and rejected drafts live here and nowhere else. */
export async function agentDraftRoutes(app: FastifyInstance) {
  app.get("/agent/draft-jobs", async (req, reply) => {
    const claims = await officeSession(req, reply);
    if (!claims) return;
    const rows = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.orgId, claims.orgId), or(eq(jobs.status, "draft"), isNotNull(jobs.agentRejectedAt))))
      .orderBy(desc(jobs.createdAt));
    if (!rows.length) return [];
    const runs = await db
      .select()
      .from(agentRuns)
      .where(and(eq(agentRuns.orgId, claims.orgId), inArray(agentRuns.jobId, rows.map((r) => r.id))))
      .orderBy(desc(agentRuns.createdAt));
    const byJob = new Map<string, (typeof runs)[number]>();
    for (const run of runs) if (run.jobId && !byJob.has(run.jobId)) byJob.set(run.jobId, run);
    return rows.map((row) => ({
      ...row,
      draft: byJob.get(row.id)?.output?.draft ?? null,
      confidence: byJob.get(row.id)?.output?.draft?.confidence ?? null,
    }));
  });

  app.get("/agent/draft-jobs/:id", async (req, reply) => {
    const claims = await officeSession(req, reply);
    if (!claims) return;
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.orgId, claims.orgId), eq(jobs.id, id)))
      .limit(1);
    if (!row || (row.status !== "draft" && !row.agentRejectedAt)) return reply.code(404).send({ error: "not found" });
    const [run] = await db
      .select()
      .from(agentRuns)
      .where(and(eq(agentRuns.orgId, claims.orgId), eq(agentRuns.jobId, row.id)))
      .orderBy(desc(agentRuns.createdAt))
      .limit(1);
    const thread = row.agentConversationId
      ? await db
          .select()
          .from(messages)
          .where(and(eq(messages.orgId, claims.orgId), eq(messages.conversationId, row.agentConversationId)))
          .orderBy(messages.createdAt)
      : [];
    return { ...row, draft: run?.output?.draft ?? null, messages: thread };
  });

  app.post("/agent/draft-jobs/:id/approve", async (req, reply) => {
    const claims = await officeSession(req, reply);
    if (!claims) return;
    const { id } = req.params as { id: string };
    const parsed = approveBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;

    const job = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.orgId, claims.orgId), eq(jobs.id, id), eq(jobs.status, "draft")))
        .limit(1);
      if (!before) return null;
      const number = await allocateJobNumberInOrg(tx, claims.orgId);
      const [updated] = await tx
        .update(jobs)
        .set({
          ...body,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : body.scheduledAt === null ? null : undefined,
          number,
          status: body.status,
          agentDraft: false,
          agentRejectedAt: null,
          agentRejectionReason: null,
          agentDraftEdited: draftWasEdited(before, body),
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, id))
        .returning();
      await tx.insert(jobStatusHistory).values({
        orgId: claims.orgId,
        jobId: id,
        fromStatus: "draft",
        toStatus: body.status,
        changedBy: claims.userId,
        reason: "intake draft approved",
      });
      return updated;
    });
    if (!job) return reply.code(404).send({ error: "draft job not found" });

    if (job.agentConversationId) {
      const pendingMedia = await db
        .select({ media: agentMedia })
        .from(agentMedia)
        .innerJoin(messages, eq(agentMedia.messageId, messages.id))
        .where(
          and(
            eq(agentMedia.orgId, claims.orgId),
            eq(messages.conversationId, job.agentConversationId),
            eq(agentMedia.kind, "image"),
            isNull(agentMedia.jobId),
          ),
        );
      for (const { media } of pendingMedia) {
        try {
          const buffer = await readAgentMedia(media.objectKey);
          await savePhoto(claims.orgId, job.id, {
            stream: Readable.from([buffer]),
            filenameHint: media.fileName,
          });
          await db
            .update(agentMedia)
            .set({ jobId: job.id, attachedAt: new Date() })
            .where(eq(agentMedia.id, media.id));
        } catch (error) {
          console.error(`[agent] failed to attach media ${media.id}: ${(error as Error).message}`);
        }
      }
    }

    safeEmitActivity(claims.orgId, "agent.draft_approved", `Approved draft as job ${job.number}: ${job.title}`, {
      customerId: job.customerId,
      jobId: job.id,
    });
    void safeEmitEvent(claims.orgId, "job.created", {
      id: job.id,
      title: job.title,
      number: job.number,
      customerId: job.customerId,
      status: job.status,
    });
    if (job.assignedTo) {
      void safeNotifyUser(claims.orgId, job.assignedTo, {
        type: "job.assigned",
        title: "Job assigned to you",
        body: job.title,
        link: `/jobs/${job.id}`,
        jobId: job.id,
      });
    }
    return job;
  });

  app.post("/agent/draft-jobs/:id/reject", async (req, reply) => {
    const claims = await officeSession(req, reply);
    if (!claims) return;
    const { id } = req.params as { id: string };
    const parsed = rejectBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const job = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.orgId, claims.orgId), eq(jobs.id, id), eq(jobs.status, "draft")))
        .limit(1);
      if (!before) return null;
      const [updated] = await tx
        .update(jobs)
        .set({
          status: "canceled",
          agentDraft: false,
          agentRejectedAt: new Date(),
          agentRejectionReason: parsed.data.reason,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, id))
        .returning();
      await tx.insert(jobStatusHistory).values({
        orgId: claims.orgId,
        jobId: id,
        fromStatus: "draft",
        toStatus: "canceled",
        changedBy: claims.userId,
        reason: `intake draft rejected: ${parsed.data.reason}`,
      });
      return updated;
    });
    if (!job) return reply.code(404).send({ error: "draft job not found" });
    safeEmitActivity(claims.orgId, "agent.draft_rejected", `Rejected WhatsApp draft: ${job.title} — ${jobStatusLabel(job.status)}`, {
      customerId: job.customerId,
      jobId: job.id,
    });
    return job;
  });
}
