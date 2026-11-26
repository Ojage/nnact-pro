import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, jobs, triageSuggestions } from "@nnact/db";
import {
  AGENT_SCOPES,
  isAgentClaims,
  requireAgentScope,
  triageOutcomeRequestSchema,
  triageRejectRequestSchema,
  triageSuggestionWriteSchema,
  type AgentScope,
  type TriageSuggestionDTO,
} from "@nnact/shared";
import { appendEvent } from "../agent-office/events.js";
import type { StaffJwtClaims } from "../auth.js";
import { verifiedClaims } from "../operational-authorization.js";

const AGENT = "triage-agent";
const UUID = z.string().uuid();
const OPEN_JOB_STATUSES = ["lead", "scheduled", "in_progress"] as const;

async function agentClaims(req: FastifyRequest, reply: FastifyReply, scopes: AgentScope[]) {
  try {
    await req.jwtVerify();
  } catch {
    await reply.code(401).send({ error: "agent session required" });
    return null;
  }
  const claims = req.user;
  if (!isAgentClaims(claims) || !scopes.every((scope) => requireAgentScope(claims, AGENT, scope))) {
    await reply.code(isAgentClaims(claims) ? 403 : 401).send({ error: "triage agent token required" });
    return null;
  }
  return claims;
}

async function reviewer(req: FastifyRequest, reply: FastifyReply) {
  const claims = (await verifiedClaims(req, reply)) as StaffJwtClaims | null;
  if (!claims || reply.sent) return null;
  if (claims.role !== "owner" && claims.role !== "dispatcher") {
    await reply.code(403).send({ error: "only dispatchers and owners can act on triage suggestions" });
    return null;
  }
  return claims;
}

function toDTO(row: typeof triageSuggestions.$inferSelect): TriageSuggestionDTO {
  return {
    id: row.id,
    jobId: row.jobId,
    state: row.state,
    shadow: row.shadow === 1,
    fingerprint: row.fingerprint,
    symptoms: row.symptoms,
    likelyFaults: row.likelyFaults,
    priority: row.priority,
    rationale: row.rationale,
    missingInformation: row.missingInformation,
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function agentTriageRoutes(app: FastifyInstance) {
  app.post("/agent/triage/jobs/:jobId/context", async (req, reply) => {
    const claims = await agentClaims(req, reply, [AGENT_SCOPES.jobsRead]);
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
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(and(eq(jobs.orgId, claims.orgId), eq(jobs.id, id.data)))
      .limit(1);
    if (!job || !OPEN_JOB_STATUSES.includes(job.status as (typeof OPEN_JOB_STATUSES)[number])) {
      return reply.code(404).send({ error: "job is not open for triage" });
    }
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
      fingerprint: job.updatedAt.toISOString(),
    };
  });

  app.post("/agent/triage/suggestions", async (req, reply) => {
    const claims = await agentClaims(req, reply, [AGENT_SCOPES.triageSuggestionsCreate]);
    if (!claims) return;
    const parsed = triageSuggestionWriteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    const [job] = await db
      .select({ id: jobs.id, status: jobs.status, updatedAt: jobs.updatedAt })
      .from(jobs)
      .where(and(eq(jobs.orgId, claims.orgId), eq(jobs.id, body.jobId)))
      .limit(1);
    if (!job || !OPEN_JOB_STATUSES.includes(job.status as (typeof OPEN_JOB_STATUSES)[number])) {
      return reply.code(409).send({ error: "job is no longer open for suggestions" });
    }
    if (job.updatedAt.toISOString() !== body.fingerprint) {
      return reply.code(409).send({ error: "job changed since triage" });
    }

    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(triageSuggestions)
        .where(and(eq(triageSuggestions.orgId, claims.orgId), eq(triageSuggestions.jobId, body.jobId), eq(triageSuggestions.current, 1)))
        .limit(1);
      if (existing && existing.fingerprint === body.fingerprint) return { row: existing, created: false };
      if (existing) {
        await tx.update(triageSuggestions).set({ current: 0, updatedAt: new Date() }).where(eq(triageSuggestions.id, existing.id));
      }
      const [inserted] = await tx
        .insert(triageSuggestions)
        .values({
          orgId: claims.orgId,
          jobId: body.jobId,
          runId: body.runId,
          state: "shown",
          current: 1,
          shadow: 0,
          fingerprint: body.fingerprint,
          symptoms: body.symptoms,
          likelyFaults: body.likelyFaults,
          priority: body.priority,
          rationale: body.rationale,
          missingInformation: body.missingInformation,
          confidence: body.confidence,
        })
        .returning();
      return { row: inserted!, created: true };
    });
    if (row.created) await appendEvent({ orgId: claims.orgId, agentId: AGENT, type: "approvals" });
    return reply.code(row.created ? 201 : 200).send(toDTO(row.row));
  });

  app.get("/triage/suggestions/jobs/:jobId", async (req, reply) => {
    const claims = await reviewer(req, reply);
    if (!claims) return;
    const id = UUID.safeParse((req.params as { jobId?: string }).jobId);
    if (!id.success) return reply.code(400).send({ error: "invalid job id" });
    const [row] = await db
      .select()
      .from(triageSuggestions)
      .where(
        and(
          eq(triageSuggestions.orgId, claims.orgId),
          eq(triageSuggestions.jobId, id.data),
          eq(triageSuggestions.current, 1),
          eq(triageSuggestions.state, "shown"),
        ),
      )
      .limit(1);
    return { suggestion: row ? toDTO(row) : null };
  });

  app.post("/triage/suggestions/:id/outcome", async (req, reply) => {
    const claims = await reviewer(req, reply);
    if (!claims) return;
    const id = UUID.safeParse((req.params as { id?: string }).id);
    const body = triageOutcomeRequestSchema.safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: "invalid outcome" });
    const [row] = await db
      .update(triageSuggestions)
      .set({
        state: body.data.state,
        outcomeReason: body.data.reason,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(triageSuggestions.id, id.data),
          eq(triageSuggestions.orgId, claims.orgId),
          sql`${triageSuggestions.state} = 'shown'`,
        ),
      )
      .returning();
    if (!row) return reply.code(404).send({ error: "no open suggestion with that id" });
    await appendEvent({ orgId: claims.orgId, agentId: AGENT, type: "approvals" });
    return toDTO(row);
  });

  app.post("/triage/suggestions/:id/reject", async (req, reply) => {
    const claims = await reviewer(req, reply);
    if (!claims) return;
    const id = UUID.safeParse((req.params as { id?: string }).id);
    const body = triageRejectRequestSchema.safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: "a reason is required" });
    const [row] = await db
      .update(triageSuggestions)
      .set({ state: "rejected", outcomeReason: body.data.reason, decidedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(triageSuggestions.id, id.data),
          eq(triageSuggestions.orgId, claims.orgId),
          sql`${triageSuggestions.state} = 'shown'`,
        ),
      )
      .returning();
    if (!row) return reply.code(404).send({ error: "no open suggestion with that id" });
    await appendEvent({ orgId: claims.orgId, agentId: AGENT, type: "approvals" });
    return toDTO(row);
  });
}
