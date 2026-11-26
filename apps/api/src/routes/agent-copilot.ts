import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { conversations, copilotSuggestions, db, jobs, messages } from "@nnact/db";
import {
  AGENT_SCOPES,
  copilotOutcomeRequestSchema,
  copilotRejectRequestSchema,
  copilotSuggestionWriteSchema,
  isAgentClaims,
  requireAgentScope,
  type AgentScope,
  type CopilotSuggestionDTO,
} from "@nnact/shared";
import { appendEvent } from "../agent-office/events.js";
import type { StaffJwtClaims } from "../auth.js";
import { verifiedClaims } from "../operational-authorization.js";

const AGENT = "copilot-agent";
const UUID = z.string().uuid();
const OPEN_JOB_STATUSES = ["lead", "scheduled", "in_progress"] as const;
const REVIEW_ROLES = ["owner", "dispatcher", "technician"];

function fingerprintFor(updatedAt: Date, lastMessageAt: Date | null | undefined): string {
  return `${updatedAt.toISOString()}|${lastMessageAt ? lastMessageAt.toISOString() : ""}`;
}

async function agentClaims(req: FastifyRequest, reply: FastifyReply, scopes: AgentScope[]) {
  try {
    await req.jwtVerify();
  } catch {
    await reply.code(401).send({ error: "agent session required" });
    return null;
  }
  const claims = req.user;
  if (!isAgentClaims(claims) || !scopes.every((scope) => requireAgentScope(claims, AGENT, scope))) {
    await reply.code(isAgentClaims(claims) ? 403 : 401).send({ error: "copilot agent token required" });
    return null;
  }
  return claims;
}

async function reviewer(req: FastifyRequest, reply: FastifyReply) {
  const claims = (await verifiedClaims(req, reply)) as StaffJwtClaims | null;
  if (!claims || reply.sent) return null;
  if (!REVIEW_ROLES.includes(claims.role)) {
    await reply.code(403).send({ error: "only owners, dispatchers and technicians can review Copilot suggestions" });
    return null;
  }
  return claims;
}

function toDTO(row: typeof copilotSuggestions.$inferSelect): CopilotSuggestionDTO {
  return {
    id: row.id,
    jobId: row.jobId,
    state: row.state,
    shadow: row.shadow === 1,
    fingerprint: row.fingerprint,
    summary: row.summary,
    recommendedActions: row.recommendedActions,
    draftReply: row.draftReply,
    risks: row.risks,
    missingInformation: row.missingInformation,
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function agentCopilotRoutes(app: FastifyInstance) {
  app.post("/agent/copilot/jobs/:jobId/context", async (req, reply) => {
    const claims = await agentClaims(req, reply, [
      AGENT_SCOPES.jobsRead,
      AGENT_SCOPES.messagesRead,
      AGENT_SCOPES.conversationsRead,
    ]);
    if (!claims) return;
    const id = UUID.safeParse((req.params as { jobId?: string }).jobId);
    if (!id.success) return reply.code(400).send({ error: "invalid job id" });
    const [job] = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        description: jobs.description,
        status: jobs.status,
        serviceCategory: jobs.serviceCategory,
        serviceAddress: jobs.serviceAddress,
        town: jobs.town,
        neighborhood: jobs.neighborhood,
        agentConversationId: jobs.agentConversationId,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(and(eq(jobs.orgId, claims.orgId), eq(jobs.id, id.data)))
      .limit(1);
    if (!job || !OPEN_JOB_STATUSES.includes(job.status as (typeof OPEN_JOB_STATUSES)[number])) {
      return reply.code(404).send({ error: "job is not open for Copilot guidance" });
    }
    let conversation: { id: string; state: string; displayName: string | null; language: string } | null = null;
    let lastMessageAt: Date | null = null;
    if (job.agentConversationId) {
      const [row] = await db
        .select({
          id: conversations.id,
          state: conversations.state,
          displayName: conversations.displayName,
          language: conversations.language,
          lastMessageAt: conversations.lastMessageAt,
        })
        .from(conversations)
        .where(and(eq(conversations.orgId, claims.orgId), eq(conversations.id, job.agentConversationId)))
        .limit(1);
      if (row) {
        conversation = { id: row.id, state: row.state, displayName: row.displayName, language: row.language };
        lastMessageAt = row.lastMessageAt;
      }
    }
    const thread = conversation
      ? await db
          .select({
            id: messages.id,
            direction: messages.direction,
            text: messages.text,
            transcript: messages.transcript,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .where(and(eq(messages.orgId, claims.orgId), eq(messages.conversationId, conversation.id)))
          .orderBy(desc(messages.createdAt))
          .limit(12)
      : [];
    return {
      job: {
        id: job.id,
        title: job.title,
        description: job.description,
        status: job.status,
        serviceCategory: job.serviceCategory,
        serviceAddress: job.serviceAddress,
        town: job.town,
        neighborhood: job.neighborhood,
      },
      conversation,
      messages: thread.reverse().map((message) => ({
        id: message.id,
        direction: message.direction,
        text: message.text,
        transcript: message.transcript,
        createdAt: message.createdAt.toISOString(),
      })),
      fingerprint: fingerprintFor(job.updatedAt, lastMessageAt),
    };
  });

  app.post("/agent/copilot/suggestions", async (req, reply) => {
    const claims = await agentClaims(req, reply, [AGENT_SCOPES.copilotSuggestionsCreate]);
    if (!claims) return;
    const parsed = copilotSuggestionWriteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    const [job] = await db
      .select({ id: jobs.id, status: jobs.status, updatedAt: jobs.updatedAt, agentConversationId: jobs.agentConversationId })
      .from(jobs)
      .where(and(eq(jobs.orgId, claims.orgId), eq(jobs.id, body.jobId)))
      .limit(1);
    if (!job || !OPEN_JOB_STATUSES.includes(job.status as (typeof OPEN_JOB_STATUSES)[number])) {
      return reply.code(409).send({ error: "job is no longer open for suggestions" });
    }
    let lastMessageAt: Date | null = null;
    if (job.agentConversationId) {
      const [row] = await db
        .select({ lastMessageAt: conversations.lastMessageAt })
        .from(conversations)
        .where(and(eq(conversations.orgId, claims.orgId), eq(conversations.id, job.agentConversationId)))
        .limit(1);
      lastMessageAt = row?.lastMessageAt ?? null;
    }
    if (fingerprintFor(job.updatedAt, lastMessageAt) !== body.fingerprint) {
      return reply.code(409).send({ error: "job changed since Copilot read it" });
    }
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(copilotSuggestions)
        .where(
          and(eq(copilotSuggestions.orgId, claims.orgId), eq(copilotSuggestions.jobId, body.jobId), eq(copilotSuggestions.current, 1)),
        )
        .limit(1);
      if (existing && existing.fingerprint === body.fingerprint) return { row: existing, created: false };
      if (existing) {
        await tx.update(copilotSuggestions).set({ current: 0, updatedAt: new Date() }).where(eq(copilotSuggestions.id, existing.id));
      }
      const [inserted] = await tx
        .insert(copilotSuggestions)
        .values({
          orgId: claims.orgId,
          jobId: body.jobId,
          runId: body.runId,
          state: "shown",
          current: 1,
          shadow: 0,
          fingerprint: body.fingerprint,
          summary: body.summary,
          recommendedActions: body.recommendedActions,
          draftReply: body.draftReply ?? null,
          risks: body.risks,
          missingInformation: body.missingInformation,
          confidence: body.confidence,
        })
        .returning();
      return { row: inserted!, created: true };
    });
    if (result.created) await appendEvent({ orgId: claims.orgId, agentId: AGENT, type: "approvals" });
    return reply.code(result.created ? 201 : 200).send(toDTO(result.row));
  });

  app.get("/copilot/suggestions", async (req, reply) => {
    const claims = await reviewer(req, reply);
    if (!claims) return;
    const rows = await db
      .select()
      .from(copilotSuggestions)
      .where(and(eq(copilotSuggestions.orgId, claims.orgId), eq(copilotSuggestions.current, 1)))
      .orderBy(desc(copilotSuggestions.createdAt))
      .limit(100);
    return { suggestions: rows.map(toDTO) };
  });

  app.get("/copilot/suggestions/jobs/:jobId", async (req, reply) => {
    const claims = await reviewer(req, reply);
    if (!claims) return;
    const id = UUID.safeParse((req.params as { jobId?: string }).jobId);
    if (!id.success) return reply.code(400).send({ error: "invalid job id" });
    const [row] = await db
      .select()
      .from(copilotSuggestions)
      .where(
        and(
          eq(copilotSuggestions.orgId, claims.orgId),
          eq(copilotSuggestions.jobId, id.data),
          eq(copilotSuggestions.current, 1),
          eq(copilotSuggestions.state, "shown"),
        ),
      )
      .limit(1);
    return { suggestion: row ? toDTO(row) : null };
  });

  app.post("/copilot/suggestions/:id/outcome", async (req, reply) => {
    const claims = await reviewer(req, reply);
    if (!claims) return;
    const id = UUID.safeParse((req.params as { id?: string }).id);
    const body = copilotOutcomeRequestSchema.safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: "invalid outcome" });
    const [row] = await db
      .update(copilotSuggestions)
      .set({ state: body.data.state, outcomeReason: body.data.reason, decidedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(copilotSuggestions.id, id.data),
          eq(copilotSuggestions.orgId, claims.orgId),
          sql`${copilotSuggestions.state} = 'shown'`,
        ),
      )
      .returning();
    if (!row) return reply.code(404).send({ error: "no open suggestion with that id" });
    await appendEvent({ orgId: claims.orgId, agentId: AGENT, type: "approvals" });
    return toDTO(row);
  });

  app.post("/copilot/suggestions/:id/reject", async (req, reply) => {
    const claims = await reviewer(req, reply);
    if (!claims) return;
    const id = UUID.safeParse((req.params as { id?: string }).id);
    const body = copilotRejectRequestSchema.safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: "a reason is required" });
    const [row] = await db
      .update(copilotSuggestions)
      .set({ state: "rejected", outcomeReason: body.data.reason, decidedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(copilotSuggestions.id, id.data),
          eq(copilotSuggestions.orgId, claims.orgId),
          sql`${copilotSuggestions.state} = 'shown'`,
        ),
      )
      .returning();
    if (!row) return reply.code(404).send({ error: "no open suggestion with that id" });
    await appendEvent({ orgId: claims.orgId, agentId: AGENT, type: "approvals" });
    return toDTO(row);
  });
}
